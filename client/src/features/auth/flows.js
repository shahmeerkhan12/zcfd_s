export function createAuthFlows(sdk, auth) {
  return {
    async completeLink(email, url) {
      return sdk.signInWithEmailLink(auth, email, url)
    },
  }
}
