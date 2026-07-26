/**
 * razorpayCheckout
 *
 * Shared helper for launching Razorpay's Checkout.js overlay directly on top
 * of the current page (Billing page), instead of navigating to a separate
 * blank page first. Razorpay's checkout widget is ALWAYS an overlay/modal —
 * that part is fixed by Razorpay and not something we control — but which
 * page it overlays is up to us. Opening it in-place on Billing means the
 * user sees their own app dimmed behind the overlay (like the screenshot of
 * "Payment Options" they already got) instead of a blank white loading page.
 *
 * Also prefills `email`/`contact` so Razorpay's "Contact details" step is
 * skipped when we already know who the user is — that step only appears
 * when Razorpay doesn't already have this info for the given subscription
 * attempt.
 *
 * Redirect mode (`redirect: true` + `callback_url`) is still used so
 * Razorpay reliably lands the user back on Billing after payment finishes,
 * independent of whether the overlay/JS context survives the whole flow
 * (see checkoutCallback in subscription.controller.ts for the server side).
 *
 * Docs:
 *   https://razorpay.com/docs/payments/payment-gateway/callback-url/
 *   https://razorpay.com/docs/payments/subscriptions/integration-guide/
 */

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
      prefill?: { email?: string; contact?: string }
      modal?: { ondismiss?: () => void }
    }) => { open: () => void }
  }
}

let scriptLoadPromise: Promise<void> | null = null

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (scriptLoadPromise) return scriptLoadPromise

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptLoadPromise = null
      reject(new Error('Failed to load Razorpay Checkout SDK'))
    }
    document.head.appendChild(script)
  })

  return scriptLoadPromise
}

export interface OpenRazorpayCheckoutOptions {
  subscriptionId: string
  /** Prefills Razorpay's "Contact details" step so it's skipped when known. */
  email?: string
  /** Prefills Razorpay's "Contact details" step so it's skipped when known. */
  phone?: string
  /** Called when the user closes the overlay without completing payment. */
  onDismiss?: () => void
}

/**
 * Opens Razorpay Checkout.js as an overlay on top of the current page.
 * Throws if VITE_RAZORPAY_KEY_ID is missing or the SDK fails to load.
 */
export async function openRazorpayCheckout(options: OpenRazorpayCheckoutOptions): Promise<void> {
  const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined
  if (!razorpayKeyId) {
    throw new Error('Payment configuration is missing. Please contact support.')
  }

  await loadRazorpayScript()

  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) || window.location.origin
  const callbackUrl = `${apiBaseUrl}/api/v2/subscription/checkout-callback`

  // Razorpay expects a 10-digit Indian mobile number with no country code
  // prefix in `prefill.contact`. Strip any leading +91 / spaces if present;
  // fall back to leaving it unset (triggers the Contact details step) rather
  // than sending a malformed value Razorpay would reject.
  const normalizedPhone = options.phone?.replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '')
  const contact = normalizedPhone && /^\d{10}$/.test(normalizedPhone) ? normalizedPhone : undefined

  const razorpay = new window.Razorpay({
    key: razorpayKeyId,
    subscription_id: options.subscriptionId,
    name: 'Veefore',
    description: 'Subscription payment',
    theme: { color: '#2563eb' },
    callback_url: callbackUrl,
    redirect: true,
    prefill: {
      ...(options.email ? { email: options.email } : {}),
      ...(contact ? { contact } : {}),
    },
    modal: {
      ondismiss: () => {
        options.onDismiss?.()
      },
    },
  })

  razorpay.open()
}
