import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
  auth, completeLink, emailStorageKey, isEmailLink, logout, sendLink,
} from './firebase'

function message(error) {
  switch (error.code) {
    case 'auth/invalid-email': return 'Enter a valid email address.'
    case 'auth/invalid-action-code': return 'The email link is invalid or has expired. Request a new link.'
    case 'auth/too-many-requests': return 'Too many attempts. Try again later.'
    case 'auth/unauthorized-domain': return 'This site is not an authorized Firebase domain.'
    case 'auth/multi-factor-auth-required': return 'This account has multi-factor authentication enabled and cannot sign in with email link alone.'
    default: return error.message || 'Authentication failed. Please try again.'
  }
}

export function Account() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(auth))
  const [link, setLink] = useState(() => isEmailLink(window.location.href) ? window.location.href : '')
  const [open, setOpen] = useState(() => isEmailLink(window.location.href))
  const [email, setEmail] = useState(() => window.localStorage.getItem(emailStorageKey) || '')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    }, () => {
      setError('Could not restore the sign-in session.')
      setLoading(false)
      setOpen(true)
    })
  }, [])

  async function run(action) {
    setBusy(true)
    setError('')
    try { await action() } catch (failure) { setError(message(failure)) } finally { setBusy(false) }
  }

  function clearLink() {
    window.localStorage.removeItem(emailStorageKey)
    window.history.replaceState(window.history.state, '', window.location.pathname)
    setLink('')
  }

  async function submit(event) {
    event.preventDefault()
    await run(async () => {
      if (link) {
        await completeLink(email.trim(), link)
        clearLink()
        setSent(false)
        setOpen(false)
      } else {
        await sendLink(email.trim())
        setSent(true)
      }
    })
  }

  async function signOut() {
    await run(async () => {
      await logout()
      setSent(false)
      setOpen(false)
    })
  }

  const signedIn = user && !link
  return <div className="relative">
    <button type="button" onClick={() => setOpen(!open)} className="rounded-full bg-white px-4 py-2 text-sm shadow-sm" aria-expanded={open}>
      {signedIn ? user.email : 'Sign in'}
    </button>
    {open && <div className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] rounded-2xl bg-white p-4 shadow-xl">
      {!auth ? <p role="alert" className="text-sm">Firebase sign-in is not configured.</p>
        : loading ? <p className="text-sm">Checking sign-in…</p>
          : signedIn ? <div>
            <p className="break-all text-sm">Signed in as {user.email}</p>
            <button type="button" disabled={busy} onClick={signOut} className="mt-3 rounded-lg bg-[#20251f] px-4 py-2 text-sm text-white">Sign out</button>
          </div> : <form onSubmit={submit} className="space-y-3">
            <h2 className="font-semibold">Sign in</h2>
            <label className="block text-sm">{link ? 'Confirm the email used to request the link' : 'Email'}
              <input required type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
            </label>
            {sent && <p role="status" className="text-sm">Check your email and open the sign-in link.</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#20251f] px-4 py-2 text-sm text-white">
              {busy ? 'Please wait…' : link ? 'Continue' : sent ? 'Send another link' : 'Send sign-in link'}
            </button>
            {link && <button type="button" disabled={busy} onClick={() => { clearLink(); setSent(false); setError('') }} className="text-sm underline">Request a new link</button>}
          </form>}
      {error && <p role="alert" className="mt-3 break-words text-sm text-red-700">{error}</p>}
    </div>}
  </div>
}
