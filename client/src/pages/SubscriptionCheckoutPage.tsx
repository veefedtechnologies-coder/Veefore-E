/**
 * SubscriptionCheckoutPage
 *
 * Receives a Razorpay subscription_id via URL param and launches Razorpay
 * Checkout (checkout.js) directly against that subscription, in
 * redirect-based mode (`redirect: true` + `callback_url`).
 *
 * Redirect mode (rather than the JS `handler` callback) is used
 * deliberately: `handler` only fires if the popup window survives the full
 * payment flow and successfully calls back into still-running page JS. For
 * eMandate / netbanking / UPI flows, Razorpay's hosted flow can navigate the
 * top-level page away entirely (e.g. to a bank's own confirmation page or
 * api.razorpay.com), which can lose that JS context and strand the user with
 * no way back into the app. Redirect mode avoids this: Razorpay itself
 * performs a real POST redirect back to our own `callback_url` once payment
 * finishes (success, failure, or otherwise), and our server
 * (checkoutCallback) verifies Razorpay's signature and 302s the browser to
 * the right Billing page state — independent of any client-side JS state.
 *
 * Route: /subscription/checkout?subscription_id=sub_...
 *
 * Docs: https://razorpay.com/docs/payments/payment-gateway/callback-url/
 *       https://razorpay.com/docs/payments/subscriptions/integration/checkout/
 */

import React, { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { Loader2, AlertCircle } from 'lucide-react'

// Razorpay Checkout.js SDK type
declare global {
  interface Window {
    Razorpay: new (options: {
      key: string
      subscription_id: string
      name?: string
      description?: string
      theme?: { color?: string }
      callback_url?: string
      redirect?: boolean
      modal?: { ondismiss?: () => void }
      prefill?: { email?: string; contact?: string }
    }) => { open: () => void }
  }
}

export function SubscriptionCheckoutPage() {
  const [, navigate] = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const subscriptionId = params.get('subscription_id')

    if (!subscriptionId) {
      setError('No subscription ID provided')
      setLoading(false)
      return
    }

    const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined
    if (!razorpayKeyId) {
      setError('Payment configuration is missing. Please contact support.')
      setLoading(false)
      return
    }

    // Load Razorpay Checkout.js SDK
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => {
      try {
        const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) || window.location.origin
        const callbackUrl = `${apiBaseUrl}/api/v2/subscription/checkout-callback`

        const razorpay = new window.Razorpay({
          key: razorpayKeyId,
          subscription_id: subscriptionId,
          name: 'Veefore',
          description: 'Subscription payment',
          theme: { color: '#2563eb' },
          // Redirect mode: Razorpay itself POSTs back to callback_url with
          // razorpay_payment_id / razorpay_subscription_id / razorpay_signature
          // once the payment finishes, and our server verifies the signature
          // and redirects the browser to the right Billing page state. Paid
          // access is still granted ONLY by the subscription.activated /
          // subscription.charged webhook, never by this redirect.
          callback_url: callbackUrl,
          redirect: true,
          modal: {
            ondismiss: () => {
              setLoading(false)
              navigate('/settings/billing?checkout=cancelled')
            },
          },
        })

        razorpay.open()
        setLoading(false)
      } catch (e) {
        setError('Failed to initiate payment. Please try again.')
        setLoading(false)
      }
    }
    script.onerror = () => {
      setError('Failed to load payment SDK. Please check your internet connection and try again.')
      setLoading(false)
    }

    document.head.appendChild(script)

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script)
      }
    }
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/settings/billing')}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
          >
            Back to Billing
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="mb-6">
          <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Setting up your subscription</h2>
          <p className="text-gray-500 text-sm">Please wait while we open the payment page...</p>
        </div>
        <p className="text-xs text-gray-400">Powered by Razorpay</p>
      </div>
    </div>
  )
}

export default SubscriptionCheckoutPage
