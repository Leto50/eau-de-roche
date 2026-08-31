export const NAVIGATION_AUTH_MAX_AGE_MS = 60_000

export interface NavigationAuthSnapshot {
  isAuthenticated: boolean
  token: null | string
}

export interface NavigationAuthCache {
  checkedAt: number | undefined
  pending: Promise<NavigationAuthSnapshot> | undefined
  snapshot: NavigationAuthSnapshot | undefined
}

export function createNavigationAuthCache(): NavigationAuthCache {
  return {
    checkedAt: undefined,
    pending: undefined,
    snapshot: undefined,
  }
}

function snapshotFromToken(
  token: null | string | undefined
): NavigationAuthSnapshot {
  const normalizedToken = token ?? null
  return { isAuthenticated: Boolean(normalizedToken), token: normalizedToken }
}

export function primeNavigationAuthCache(
  cache: NavigationAuthCache,
  snapshot: NavigationAuthSnapshot,
  now = Date.now()
) {
  if (cache.snapshot) return

  cache.checkedAt = now
  cache.snapshot = snapshot
}

export async function resolveNavigationAuth(
  cache: NavigationAuthCache,
  loadToken: () => Promise<null | string | undefined>,
  options: {
    isClient: boolean
    maxAgeMs?: number
    now?: number
  }
): Promise<NavigationAuthSnapshot> {
  const now = options.now ?? Date.now()

  // Server routers are request-scoped: always read the current request cookies.
  if (!options.isClient) return snapshotFromToken(await loadToken())

  if (
    cache.snapshot &&
    cache.checkedAt !== undefined &&
    now - cache.checkedAt < (options.maxAgeMs ?? NAVIGATION_AUTH_MAX_AGE_MS)
  ) {
    return cache.snapshot
  }

  if (cache.pending) return cache.pending

  const pending = loadToken().then(snapshotFromToken)
  cache.pending = pending

  try {
    const snapshot = await pending
    cache.checkedAt = Date.now()
    cache.snapshot = snapshot
    return snapshot
  } finally {
    if (cache.pending === pending) cache.pending = undefined
  }
}
