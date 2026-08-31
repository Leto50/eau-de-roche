import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start"

import { isAuthenticationError } from "@/lib/auth-errors"

const convexUrl = process.env.VITE_CONVEX_URL
const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL

if (!convexUrl || !convexSiteUrl) {
  throw new Error(
    "VITE_CONVEX_URL et VITE_CONVEX_SITE_URL doivent être configurées."
  )
}

export const { getToken, handler } = convexBetterAuthReactStart({
  convexSiteUrl,
  convexUrl,
  jwtCache: {
    enabled: true,
    expirationToleranceSeconds: 0,
    isAuthError: isAuthenticationError,
  },
})
