'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther } from 'viem'
import { sdk } from '@farcaster/miniapp-sdk'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import {
  PIZZA_CHAT_ADDRESS,
  PIZZA_CHAT_ABI,
  PIZZA_TOKEN_ADDRESS,
  PIZZA_TOKEN_ABI,
} from '../lib/constants'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ROOM_ID = 0 // Global room
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

const customFontStyle = {
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

interface ChatMsg {
  id: string
  roomId: number
  messageId: number
  senderAddress: string
  senderFid: number | null
  senderName: string | null
  senderPfp: string | null
  message: string
  pizzaFeePaid: string
  replyToHash: string | null
  onchainTs: string
  txHash: string | null
}

export default function PizzaChatPage() {
  const { address: walletAddress, isConnected } = useAccount()
  const [_userFid, setUserFid] = useState<number | null>(null)
  const [_userName, setUserName] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const [pizzaPrice, setPizzaPrice] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const cooldownRef = useRef<NodeJS.Timeout | null>(null)

  const contractNotDeployed = PIZZA_CHAT_ADDRESS === ZERO_ADDRESS

  // Read contract state
  const { data: messageFee } = useReadContract({
    address: PIZZA_CHAT_ADDRESS as `0x${string}`,
    abi: PIZZA_CHAT_ABI,
    functionName: 'messageFee',
    query: { enabled: !contractNotDeployed },
  })

  const { data: cooldownSeconds } = useReadContract({
    address: PIZZA_CHAT_ADDRESS as `0x${string}`,
    abi: PIZZA_CHAT_ABI,
    functionName: 'cooldown',
    query: { enabled: !contractNotDeployed },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
    abi: PIZZA_TOKEN_ABI,
    functionName: 'allowance',
    args: walletAddress && !contractNotDeployed ? [walletAddress, PIZZA_CHAT_ADDRESS as `0x${string}`] : undefined,
    query: { enabled: !!walletAddress && !contractNotDeployed },
  })

  const { data: timeUntilCanSend, refetch: refetchCooldown } = useReadContract({
    address: PIZZA_CHAT_ADDRESS as `0x${string}`,
    abi: PIZZA_CHAT_ABI,
    functionName: 'getTimeUntilCanSend',
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!walletAddress && !contractNotDeployed },
  })

  // Write hooks
  const { writeContractAsync: approveAsync, data: approveTxHash } = useWriteContract()
  const { writeContractAsync: sendMessageAsync, data: sendTxHash } = useWriteContract()

  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  })

  const { isLoading: isSendConfirming, isSuccess: isSendConfirmed } = useWaitForTransactionReceipt({
    hash: sendTxHash,
  })

  // Device detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Farcaster context
  useEffect(() => {
    const getUser = async () => {
      try {
        const context = await sdk.context
        if (context?.user?.fid) {
          setUserFid(context.user.fid)
          setUserName(context.user.displayName || context.user.username || null)
        }
      } catch {
        // Not in Farcaster context
      }
    }
    getUser()
  }, [])

  // Fetch PIZZA price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('/api/price')
        const data = await res.json()
        if (data.priceUsd) setPizzaPrice(data.priceUsd)
      } catch {
        setPizzaPrice(0.01) // fallback
      }
    }
    fetchPrice()
  }, [])

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/messages?roomId=${ROOM_ID}&limit=50`)
      const data = await res.json()
      if (data.success) {
        // Messages come newest first, reverse for display (oldest at top)
        setMessages(data.messages.reverse())
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    fetchMessages()
    pollRef.current = setInterval(fetchMessages, 10000) // Poll every 10s
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchMessages])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cooldown timer
  useEffect(() => {
    if (timeUntilCanSend && Number(timeUntilCanSend) > 0) {
      setCooldownLeft(Number(timeUntilCanSend))
    }
  }, [timeUntilCanSend])

  useEffect(() => {
    if (cooldownLeft > 0) {
      cooldownRef.current = setInterval(() => {
        setCooldownLeft(prev => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => {
        if (cooldownRef.current) clearInterval(cooldownRef.current)
      }
    }
  }, [cooldownLeft])

  // After send confirmed, re-index and refresh
  useEffect(() => {
    if (isSendConfirmed) {
      setSending(false)
      setMessageText('')
      setCooldownLeft(Number(cooldownSeconds || 15))
      // Trigger indexer then refresh messages
      const reindex = async () => {
        try {
          await fetch('/api/chat/index-events', { method: 'POST' })
        } catch { /* best effort */ }
        fetchMessages()
        refetchCooldown()
        refetchAllowance()
      }
      reindex()
    }
  }, [isSendConfirmed, cooldownSeconds, fetchMessages, refetchCooldown, refetchAllowance])

  const needsApproval = messageFee && allowance !== undefined
    ? (allowance as bigint) < (messageFee as bigint)
    : false

  const handleApprove = async () => {
    if (!walletAddress || !messageFee) return
    setApproving(true)
    setError(null)
    try {
      await approveAsync({
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'approve',
        args: [PIZZA_CHAT_ADDRESS as `0x${string}`, messageFee as bigint],
      })
      // Wait a bit for the approval to be confirmed, then refetch
      setTimeout(() => {
        refetchAllowance()
        setApproving(false)
      }, 3000)
    } catch (err: unknown) {
      setApproving(false)
      setError(err instanceof Error ? err.message : 'Approval failed')
    }
  }

  const handleSend = async () => {
    if (!walletAddress || !messageText.trim() || contractNotDeployed) return
    if (messageText.length > 250) {
      setError('Message too long (max 250 characters)')
      return
    }

    setSending(true)
    setError(null)
    try {
      await sendMessageAsync({
        address: PIZZA_CHAT_ADDRESS as `0x${string}`,
        abi: PIZZA_CHAT_ABI,
        functionName: 'sendMessage',
        args: [BigInt(ROOM_ID), messageText.trim(), ZERO_HASH],
      })
      // Wait for confirmation (handled by useEffect above)
    } catch (err: unknown) {
      setSending(false)
      if (err instanceof Error) {
        if (err.message.includes('CooldownActive')) {
          setError('Please wait before sending another message')
          refetchCooldown()
        } else if (err.message.includes('SenderIsBanned')) {
          setError('You are banned from this chat room')
        } else if (err.message.includes('User rejected') || err.message.includes('denied')) {
          setError(null) // User cancelled, no error needed
        } else {
          setError('Failed to send message')
        }
      }
    }
  }

  const feeDisplay = messageFee && pizzaPrice
    ? `${Number(formatEther(messageFee as bigint)).toLocaleString()} PIZZA (~$${(Number(formatEther(messageFee as bigint)) * pizzaPrice).toFixed(2)})`
    : messageFee
      ? `${Number(formatEther(messageFee as bigint)).toLocaleString()} PIZZA`
      : '$0.10 of PIZZA'

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`

  return (
    <main>
      <div
        className="min-h-screen p-4"
        style={{
          backgroundImage: "url('/images/rotated-90-pizza-wallpaper.png')",
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
        }}
      >
        <div className="max-w-md mx-auto">
          {/* Back button */}
          <Button
            onClick={() => window.location.href = '/'}
            className="mb-4 !bg-red-700 hover:!bg-red-800 text-white font-bold py-2 px-4 rounded-xl border-2 border-red-900 shadow-lg flex items-center gap-2"
            style={{ ...customFontStyle, fontFamily: 'var(--font-luckiest-guy)' }}
          >
            <ArrowLeft size={20} />
            Back to Home
          </Button>

          {/* Main card */}
          <Card
            className="border-4 border-red-800 rounded-3xl shadow-2xl p-4 text-center bg-white"
            style={{
              backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
              backgroundSize: 'cover',
            }}
          >
            {/* Title */}
            <h1
              className="text-2xl text-white mb-2"
              style={{ ...customFontStyle, fontSize: isMobile ? 22 : 28 }}
            >
              PIZZA CHAT
            </h1>

            <p className="text-xs text-white mb-3" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
              Onchain community board &bull; {feeDisplay} per message
            </p>

            {contractNotDeployed && (
              <div className="bg-yellow-100 border-2 border-yellow-400 rounded-xl p-3 mb-3">
                <p className="text-yellow-800 font-bold text-sm" style={customFontStyle}>Coming Soon!</p>
                <p className="text-yellow-700 text-xs">The Pizza Chat contract hasn&apos;t been deployed yet. Stay tuned!</p>
              </div>
            )}

            {/* Messages area */}
            <div
              className="bg-black/60 rounded-2xl p-3 mb-3 text-left overflow-y-auto"
              style={{ minHeight: '300px', maxHeight: '400px' }}
            >
              {loading ? (
                <div className="flex items-center justify-center h-full py-12">
                  <Loader2 className="animate-spin text-white" size={32} />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full py-12">
                  <p className="text-white/60 text-sm">
                    {contractNotDeployed
                      ? 'No messages yet — contract not deployed'
                      : 'No messages yet. Be the first to post!'}
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div key={msg.id} className="mb-3 last:mb-0">
                      <div className="flex items-start gap-2">
                        {/* Avatar */}
                        {msg.senderPfp ? (
                          <img
                            src={msg.senderPfp}
                            alt=""
                            className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-white text-xs">🍕</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {/* Name + timestamp */}
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span
                              className="text-yellow-400 font-bold text-sm truncate"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            >
                              {msg.senderName || truncateAddress(msg.senderAddress)}
                            </span>
                            <span className="text-white/40 text-xs flex-shrink-0">
                              {formatTimestamp(msg.onchainTs)}
                            </span>
                          </div>
                          {/* Message body */}
                          <p className="text-white text-sm break-words mt-0.5">
                            {msg.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input area */}
            {!contractNotDeployed && (
              <div className="space-y-2">
                {!isConnected ? (
                  <div className="bg-white/80 rounded-xl p-3">
                    <p className="text-gray-600 text-sm font-bold">Connect your wallet to chat</p>
                  </div>
                ) : (
                  <>
                    {/* Message input */}
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <textarea
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value.slice(0, 250))}
                          placeholder="Type your message..."
                          className="w-full px-3 py-2 rounded-xl border-2 border-red-800 bg-white text-sm resize-none"
                          rows={2}
                          disabled={sending || isSendConfirming || cooldownLeft > 0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              if (!needsApproval && !sending && !isSendConfirming && cooldownLeft === 0 && messageText.trim()) {
                                handleSend()
                              }
                            }
                          }}
                        />
                        <span className="absolute bottom-1 right-2 text-xs text-gray-400">
                          {messageText.length}/250
                        </span>
                      </div>

                      {needsApproval ? (
                        <Button
                          onClick={handleApprove}
                          disabled={approving || isApproveConfirming}
                          className="!bg-orange-500 hover:!bg-orange-600 text-white rounded-xl border-2 border-orange-700 px-3 self-end"
                          style={customFontStyle}
                        >
                          {approving || isApproveConfirming ? (
                            <Loader2 className="animate-spin" size={18} />
                          ) : (
                            'Approve'
                          )}
                        </Button>
                      ) : (
                        <Button
                          onClick={handleSend}
                          disabled={
                            sending ||
                            isSendConfirming ||
                            !messageText.trim() ||
                            cooldownLeft > 0
                          }
                          className="!bg-green-600 hover:!bg-green-700 text-white rounded-xl border-2 border-green-800 px-3 self-end"
                          style={customFontStyle}
                        >
                          {sending || isSendConfirming ? (
                            <Loader2 className="animate-spin" size={18} />
                          ) : cooldownLeft > 0 ? (
                            `${cooldownLeft}s`
                          ) : (
                            <Send size={18} />
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Error */}
                    {error && (
                      <p className="text-red-200 text-xs bg-red-900/50 rounded-lg px-2 py-1">
                        {error}
                      </p>
                    )}

                    {/* Fee info */}
                    <p className="text-white/50 text-xs" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
                      Each message costs {feeDisplay} &bull; 15s cooldown between messages
                    </p>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  )
}
