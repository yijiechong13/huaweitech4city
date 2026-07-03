import { useParams } from 'react-router-dom'

export default function ChatPage() {
  const { conversationId } = useParams()
  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Chat</h1>
      <p className="mt-1 text-sm text-slate-500">Chat UI coming soon.</p>
      <p className="mt-4 text-sm text-slate-500">
        Conversation:{' '}
        <code className="break-all text-slate-700">{conversationId}</code>
      </p>
      <span className="mt-6 inline-block rounded-full bg-emerald-100 px-4 py-1 text-sm font-medium text-emerald-700">
        Placeholder chat page
      </span>
    </div>
  )
}
