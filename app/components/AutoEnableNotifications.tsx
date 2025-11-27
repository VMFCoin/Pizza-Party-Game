'use client'

import { useEffect, useState } from 'react'
import { sdk } from '@farcaster/miniapp-sdk'

export default function AutoEnableNotifications() {
  const [hasPrompted, setHasPrompted] = useState(false)

  useEffect(() => {
    if (hasPrompted) return

    const promptForNotifications = async () => {
      try {
        if (typeof window === 'undefined') return

        const alreadyPrompted = localStorage.getItem('pizza-notif-prompted')
        if (alreadyPrompted) return

        // Wait briefly to let the app render before prompting
        await new Promise(resolve => setTimeout(resolve, 2000))

        await sdk.actions.addMiniApp()

        localStorage.setItem('pizza-notif-prompted', 'true')
        setHasPrompted(true)
      } catch (error) {
        console.error('Auto-prompt failed:', error)
      }
    }

    promptForNotifications()
  }, [hasPrompted])

  return null
}
