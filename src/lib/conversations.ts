import { supabase } from './supabase'

// Returns the id of the 1-to-1 DM between the two users, creating the
// conversations row + both membership rows if none exists yet.
//
// The two membership inserts must stay sequential: my own row passes RLS via
// the `user_id = auth.uid()` arm, and the friend's row passes only via the
// `is_conversation_member` arm — which requires my row to already exist.
export async function openOrCreateDm(myId: string, friendId: string): Promise<string> {
  // Look for an existing non-group conversation whose members are exactly
  // {me, friend}.
  const { data: myRows, error: myErr } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', myId)
  if (myErr) throw myErr

  const myConvoIds = myRows.map((r) => r.conversation_id)
  if (myConvoIds.length > 0) {
    const { data: dms, error: dmErr } = await supabase
      .from('conversations')
      .select('id')
      .in('id', myConvoIds)
      .eq('is_group', false)
    if (dmErr) throw dmErr

    if (dms.length > 0) {
      const { data: members, error: memErr } = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id')
        .in(
          'conversation_id',
          dms.map((d) => d.id),
        )
      if (memErr) throw memErr

      const byConvo = new Map<string, string[]>()
      for (const m of members) {
        const list = byConvo.get(m.conversation_id) ?? []
        list.push(m.user_id)
        byConvo.set(m.conversation_id, list)
      }
      for (const [convoId, userIds] of byConvo) {
        if (userIds.length === 2 && userIds.includes(friendId)) return convoId
      }
    }
  }

  // No existing DM — create one.
  const { data: convo, error: convoErr } = await supabase
    .from('conversations')
    .insert({ is_group: false })
    .select('id')
    .single()
  if (convoErr) throw convoErr

  const { error: meErr } = await supabase
    .from('conversation_members')
    .insert({ conversation_id: convo.id, user_id: myId })
  if (meErr) throw meErr

  const { error: friendErr } = await supabase
    .from('conversation_members')
    .insert({ conversation_id: convo.id, user_id: friendId })
  if (friendErr) throw friendErr

  return convo.id
}
