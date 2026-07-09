import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'

// All dark enough for white initials; first entry is the DB signup default.
const SWATCHES = [
  { hex: '#64748b', label: 'Slate' },
  { hex: '#dc2626', label: 'Red' },
  { hex: '#ea580c', label: 'Orange' },
  { hex: '#16a34a', label: 'Green' },
  { hex: '#0d9488', label: 'Teal' },
  { hex: '#2563eb', label: 'Blue' },
  { hex: '#7c3aed', label: 'Violet' },
  { hex: '#db2777', label: 'Pink' },
]

export default function ProfilePage() {
  const { user, profile, setProfile } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState('#64748b')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  // Profile may arrive after mount (context fetches it async).
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setColor(profile.avatar_color ?? '#64748b')
    }
  }, [profile])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setSaved(false)

    const trimmed = displayName.trim()
    if (!trimmed) {
      setError('Display name cannot be empty.')
      return
    }

    setPending(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed, avatar_color: color })
      .eq('id', user.id)
      .select()
      .single()
    if (error) {
      setError(error.message)
    } else {
      setProfile(data)
      setSaved(true)
    }
    setPending(false)
  }

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Your profile</h1>
      <p className="mt-1 text-sm text-slate-500">
        This is how you appear to others in chats.
      </p>

      <div className="mt-6 flex items-center gap-4">
        <Avatar
          size="lg"
          name={displayName || profile?.username || user?.email}
          color={color}
        />
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">
            {displayName || profile?.username || user?.email}
          </p>
          {profile?.username && (
            <p className="truncate text-sm text-slate-500">@{profile.username}</p>
          )}
          {profile?.phone && (
            <p className="truncate text-sm text-slate-500">{profile.phone}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-slate-700">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            required
            maxLength={50}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              setSaved(false)
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-slate-700">
            Avatar colour
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {SWATCHES.map(({ hex, label }) => (
              <button
                key={hex}
                type="button"
                aria-label={label}
                aria-pressed={color === hex}
                onClick={() => {
                  setColor(hex)
                  setSaved(false)
                }}
                className={`h-8 w-8 rounded-full ${
                  color === hex ? 'ring-2 ring-emerald-500 ring-offset-2' : ''
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-700">Profile saved.</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
