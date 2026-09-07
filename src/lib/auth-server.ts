import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start"

import { isAuthenticationError } from "@/lib/auth-errors"

// `convex deploy --cmd` injects the deployment-specific URLs while Vite builds
// both the browser and SSR bundles. Keep these values in the bundle so a
// Netlify preview cannot fall back to production-scoped runtime variables.
const convexUrl = import.meta.env.VITE_CONVEX_URL
const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL

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
