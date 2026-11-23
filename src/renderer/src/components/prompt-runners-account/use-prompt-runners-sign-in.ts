import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  PromptRunnersAccountApi,
  PromptRunnersCodePurpose,
  PromptRunnersProfile,
  PromptRunnersSignInResult,
  PromptRunnersSignMode
} from '../../../../shared/prompt-runners-account'
import {
  getRunnersAccountProfile,
  loadRunnersAccountProfile,
  setRunnersAccountProfile,
  signedInRunnersAccountProfile,
  subscribeRunnersAccountProfile
} from './prompt-runners-account-profile'

export type PromptRunnersSignIn = {
  api: PromptRunnersAccountApi | undefined
  lang: string
  /** undefined until main has answered, null while signed out. */
  email: string | null | undefined
  /** The signed-in account with its nickname; undefined until main has answered. */
  profile: PromptRunnersProfile | undefined
  signingIn: boolean
  openSignIn: () => void
  closeSignIn: () => void
  signIn: (
    mode: PromptRunnersSignMode,
    address: string,
    password: string,
    code?: string
  ) => Promise<void>
  sendCode: (purpose: PromptRunnersCodePurpose, address: string) => Promise<void>
  resetPassword: (address: string, code: string, password: string) => Promise<void>
  signOut: () => void
}

/** The RUNNERS account state and the shared sign-in sheet's calls, for the top-right badge and Settings › Account. */
export function usePromptRunnersSignIn(): PromptRunnersSignIn {
  const api = window.api.promptRunnersAccount
  const { i18n } = useTranslation()
  const profile = useSyncExternalStore(subscribeRunnersAccountProfile, getRunnersAccountProfile)
  const email = profile === undefined ? undefined : profile.email
  const [signingIn, setSigningIn] = useState(false)
  const openSignIn = useCallback(() => setSigningIn(true), [])
  const closeSignIn = useCallback(() => setSigningIn(false), [])

  useEffect(() => {
    if (api) {
      loadRunnersAccountProfile(api)
    }
  }, [api])

  const lang = i18n.language

  // The shared sheet reads the failure's short code (bad, none, code, …) from the error's message.
  const signedIn = useCallback(
    (result: PromptRunnersSignInResult) => {
      if (!result.ok) {
        throw new Error(result.problem)
      }
      setRunnersAccountProfile(signedInRunnersAccountProfile(result.email))
      // The server's answer holds the nickname set in another app; main's changed event re-reads it too.
      void api?.profile().then(setRunnersAccountProfile, () => {})
    },
    [api]
  )
  const signIn = useCallback(
    async (mode: PromptRunnersSignMode, address: string, password: string, code?: string) => {
      if (!api) {
        throw new Error('network')
      }
      signedIn(await api.signIn(mode, address, password, code))
    },
    [api, signedIn]
  )
  const sendCode = useCallback(
    async (purpose: PromptRunnersCodePurpose, address: string) => {
      const result = api ? await api.sendCode(purpose, address, lang) : null
      if (!result?.ok) {
        throw new Error(result?.problem ?? 'network')
      }
    },
    [api, lang]
  )
  const resetPassword = useCallback(
    async (address: string, code: string, password: string) => {
      if (!api) {
        throw new Error('network')
      }
      signedIn(await api.resetPassword(address, code, password))
    },
    [api, signedIn]
  )
  const signOut = useCallback(() => {
    setRunnersAccountProfile(null)
    void api?.signOut()
  }, [api])

  return {
    api,
    lang,
    email,
    profile,
    signingIn,
    openSignIn,
    closeSignIn,
    signIn,
    sendCode,
    resetPassword,
    signOut
  }
}
