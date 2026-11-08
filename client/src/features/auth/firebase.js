import { initializeApp } from 'firebase/app'
import {
  getAuth, isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink, signOut,
} from 'firebase/auth'
import { createAuthFlows } from './flows'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const auth = Object.values(config).every(Boolean) ? getAuth(initializeApp(config)) : null
export const emailStorageKey = 'spoon-email-for-sign-in'
export const { completeLink } = createAuthFlows({ signInWithEmailLink }, auth)

export function isEmailLink(url) {
  return auth ? isSignInWithEmailLink(auth, url) : false
}

export async function sendLink(email) {
  await sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}/`,
    handleCodeInApp: true,
  })
  window.localStorage.setItem(emailStorageKey, email)
}

export function logout() {
  return signOut(auth)
}
