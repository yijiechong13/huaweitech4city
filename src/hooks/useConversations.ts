import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Conversation, ConversationMember, Profile } from '../types/db'

export interface ConversationListItem {
  conversationId: string
  friend: Profile
}

// Loads the current user's 1-to-1 conversations with the other member's
// profile. conversation_members references auth.users (not profiles), so
// PostgREST can't embed the join — multi-step fetch, same as FriendsPage.
export function useConversations() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const userId = user?.id
    if (!userId) return
    let cancelled = false

    function fail(message: string) {
      setError(message)
      setLoading(false)
    }
    function done(items: ConversationListItem[]) {
      setConversations(items)
      setLoading(false)
    }

    async function load() {
      // 1. My memberships -> conversation ids.
      const { data: myRows, error: myErr } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId)
      if (cancelled) return
      if (myErr) return fail(myErr.message)

      const convIds = myRows.map((r) => r.conversation_id)
      if (convIds.length === 0) return done([])

      // 2. Keep only DMs, newest first.
      const { data: convs, error: convErr } = await supabase
        .from('conversations')
        .select('*')
        .in('id', convIds)
        .eq('is_group', false)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (convErr) return fail(convErr.message)
      const dms = convs as Conversation[]
      if (dms.length === 0) return done([])

      // 3. All members of those DMs -> the other user per conversation.
      const dmIds = dms.map((c) => c.id)
      const { data: members, error: memberErr } = await supabase
        .from('conversation_members')
        .select('*')
        .in('conversation_id', dmIds)
      if (cancelled) return
      if (memberErr) return fail(memberErr.message)

      const otherByConv = new Map<string, string>()
      for (const m of members as ConversationMember[]) {
        if (m.user_id !== userId) otherByConv.set(m.conversation_id, m.user_id)
      }

      // 4. The other users' profiles.
      const otherIds = [...new Set(otherByConv.values())]
      if (otherIds.length === 0) return done([])
      const { data: profiles, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', otherIds)
      if (cancelled) return
      if (profileErr) return fail(profileErr.message)

      const profileById = new Map((profiles as Profile[]).map((p) => [p.id, p]))
      done(
        dms.flatMap((c) => {
          const otherId = otherByConv.get(c.id)
          const friend = otherId ? profileById.get(otherId) : undefined
          return friend ? [{ conversationId: c.id, friend }] : []
        }),
      )
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return { conversations, loading, error }
}
