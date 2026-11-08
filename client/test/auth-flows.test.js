import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthFlows } from '../src/features/auth/flows.js'

test('email link completes sign-in with the supplied email and link', async () => {
  const credential = { user: { email: 'user@example.com' } }
  const sdk = {
    signInWithEmailLink: async (auth, email, url) => {
      assert.deepEqual([auth, email, url], ['auth', 'user@example.com', 'link'])
      return credential
    },
  }
  const flows = createAuthFlows(sdk, 'auth')
  assert.equal(await flows.completeLink('user@example.com', 'link'), credential)
})

test('email link sign-in propagates failures including existing MFA challenges', async () => {
  let failure = new Error('invalid link')
  const flows = createAuthFlows({ signInWithEmailLink: async () => { throw failure } }, 'auth')
  await assert.rejects(flows.completeLink('user@example.com', 'link'), /invalid link/)
  failure = Object.assign(new Error('MFA required'), { code: 'auth/multi-factor-auth-required' })
  await assert.rejects(flows.completeLink('user@example.com', 'link'), (error) => error === failure)
})
