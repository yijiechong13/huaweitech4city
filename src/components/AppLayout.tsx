import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// App shell for authenticated routes: header with the signed-in email + logout.
// On sign-out the auth listener clears the session and ProtectedRoute redirects.
export default function AppLayout() {
  const { user } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function handleLogout() {
    setSigningOut(true)
    await supabase.auth.signOut()
    // No manual navigation needed — the auth state change triggers the redirect.
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold text-slate-900">Harm-Detection Chat</span>
          <div className="flex items-center gap-3">
            {user?.email && (
              <span className="hidden truncate text-sm text-slate-500 sm:inline">
                {user.email}
              </span>
            )}
            <button
              onClick={handleLogout}
              disabled={signingOut}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {signingOut ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
