import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import type { ConversationListItem } from '../hooks/useConversations'

interface ConversationListProps {
  items: ConversationListItem[]
  loading: boolean
  error: string | null
  activeId?: string
  flaggedIds?: Set<string> // conversations with any harm-score rows
}

export default function ConversationList({ items, loading, error, activeId, flaggedIds }: ConversationListProps) {
  if (loading) return <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
  if (error) return <p className="px-4 py-3 text-sm text-red-600">{error}</p>
  if (items.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-slate-500">
        No chats yet. Go to{' '}
        <Link to="/friends" className="font-medium text-emerald-700 hover:underline">
          Friends
        </Link>{' '}
        to start one.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-slate-200">
      {items.map(({ conversationId, friend }) => (
        <li key={conversationId}>
          <Link
            to={`/chat/${conversationId}`}
            className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${
              conversationId === activeId ? 'bg-emerald-50' : ''
            }`}
          >
            <Avatar size="md" name={friend.display_name ?? friend.username} color={friend.avatar_color} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {friend.display_name ?? friend.username ?? '—'}
              </p>
              {friend.username && <p className="truncate text-xs text-slate-500">@{friend.username}</p>}
            </div>
            {flaggedIds?.has(conversationId) && (
              <span
                aria-label="Has safety alerts"
                title="Has safety alerts"
                className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
              >
                ⚠
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
