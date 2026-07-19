// Mock harm scorer (prototype stage — see CLAUDE.md "Mock scoring behaviour").
// Invoked from the client after each send with { conversation_id }. Reads the
// last 10 messages itself with the service role (client never supplies content)
// and writes message_scores / conversation_scores rows. Absence of rows = safe.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const SCAM_KEYWORDS = ['transfer first', 'otp', 'click link', 'bayar sekarang']

const GROOMING_SIGNALS: Record<string, string[]> = {
  recruitment_lure: ['overseas job', 'kerja luar negara', 'high pay', '高薪'],
  upfront_fee: ['agent fee', 'deposit', 'pay first', 'bayar dulu'],
  passport_retention: ['passport', 'hold documents', 'pegang passport'],
  secrecy_isolation: ["don't tell", 'jangan bagitau', 'secret', '别告诉'],
  debt_bondage: ['salary deduction', 'owe', 'hutang'],
  urgency_pressure: ['decide today', 'cepat', 'limited'],
}

// Case-insensitive substring match; typographic apostrophe normalised so
// "Don’t tell" matches "don't tell".
function norm(s: string | null): string {
  return (s ?? '').toLowerCase().replace(/’/g, "'")
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { conversation_id } = await req.json().catch(() => ({}))
  if (typeof conversation_id !== 'string' || !conversation_id) {
    return json({ error: 'conversation_id required' }, 400)
  }

  // Identify the caller from the forwarded JWT.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)

  // Only conversation members may trigger scoring. The service client bypasses
  // RLS, so membership is checked explicitly.
  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: member, error: memberErr } = await svc
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversation_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (memberErr) return json({ error: memberErr.message }, 500)
  if (!member) return json({ error: 'forbidden' }, 403)

  // Window: last 10 messages by simple count (no token logic at this stage).
  const { data: msgs, error: msgErr } = await svc
    .from('messages')
    .select('id, content')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: false })
    .limit(10)
  if (msgErr) return json({ error: msgErr.message }, 500)
  const window = (msgs ?? []) as { id: string; content: string | null }[]

  // Scam: any single message containing a scam keyword. The window is
  // re-scanned on every send, so skip msg_ids that already have a scam row.
  const scamIds = window
    .filter((m) => SCAM_KEYWORDS.some((k) => norm(m.content).includes(k)))
    .map((m) => m.id)
  let scamInserted = 0
  if (scamIds.length > 0) {
    const { data: existing, error: existErr } = await svc
      .from('message_scores')
      .select('msg_id')
      .in('msg_id', scamIds)
      .eq('label', 'scam')
    if (existErr) return json({ error: existErr.message }, 500)
    const have = new Set((existing ?? []).map((r: { msg_id: string }) => r.msg_id))
    const rows = scamIds
      .filter((id) => !have.has(id))
      .map((msg_id) => ({ msg_id, label: 'scam', confidence: 0.8 }))
    if (rows.length > 0) {
      const { error: insErr } = await svc.from('message_scores').insert(rows)
      if (insErr) return json({ error: insErr.message }, 500)
      scamInserted = rows.length
    }
  }

  // Grooming: >= 2 signal categories firing across the window -> ONE
  // conversation_scores row; evidence = every message that matched a signal.
  const evidence = new Set<string>()
  let fired = 0
  for (const keywords of Object.values(GROOMING_SIGNALS)) {
    const hits = window.filter((m) => keywords.some((k) => norm(m.content).includes(norm(k))))
    if (hits.length > 0) {
      fired++
      for (const h of hits) evidence.add(h.id)
    }
  }
  let grooming: 'none' | 'inserted' | 'updated' = 'none'
  if (fired >= 2) {
    const confidence = Math.min(0.5 + 0.1 * fired, 0.95)
    const evidence_msg_ids = [...evidence]
    const { data: existing, error: existErr } = await svc
      .from('conversation_scores')
      .select('id')
      .eq('conversation_id', conversation_id)
      .eq('label', 'grooming')
      .maybeSingle()
    if (existErr) return json({ error: existErr.message }, 500)
    const { error: writeErr } = existing
      ? await svc
          .from('conversation_scores')
          .update({ confidence, evidence_msg_ids })
          .eq('id', existing.id)
      : await svc
          .from('conversation_scores')
          .insert({ conversation_id, label: 'grooming', confidence, evidence_msg_ids })
    if (writeErr) return json({ error: writeErr.message }, 500)
    grooming = existing ? 'updated' : 'inserted'
  }
  // Nothing fired -> write nothing; existing rows are never deleted.

  return json({ scam_inserted: scamInserted, grooming })
})
