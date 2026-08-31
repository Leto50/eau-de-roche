import { describe, expect, it, vi } from "vitest"

import {
  createNavigationAuthCache,
  primeNavigationAuthCache,
  resolveNavigationAuth,
} from "./navigation-auth-cache"

describe("navigationAuthCache", () => {
  it("ne partage jamais le résultat entre deux requêtes serveur", async () => {
    const cache = createNavigationAuthCache()
    const loadToken = vi
      .fn<() => Promise<null | string>>()
      .mockResolvedValueOnce("premier-token")
      .mockResolvedValueOnce(null)

    await expect(
      resolveNavigationAuth(cache, loadToken, { isClient: false })
    ).resolves.toEqual({ isAuthenticated: true, token: "premier-token" })
    await expect(
      resolveNavigationAuth(cache, loadToken, { isClient: false })
    ).resolves.toEqual({ isAuthenticated: false, token: null })
    expect(loadToken).toHaveBeenCalledTimes(2)
  })

  it("réutilise côté client l’état transmis par le rendu initial", async () => {
    const cache = createNavigationAuthCache()
    const loadToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("inutile")
    primeNavigationAuthCache(
      cache,
      { isAuthenticated: true, token: "token-initial" },
      1_000
    )

    await expect(
      resolveNavigationAuth(cache, loadToken, {
        isClient: true,
        maxAgeMs: 60_000,
        now: 30_000,
      })
    ).resolves.toEqual({ isAuthenticated: true, token: "token-initial" })
    expect(loadToken).not.toHaveBeenCalled()
  })

  it("rafraîchit un état client arrivé à expiration", async () => {
    const cache = createNavigationAuthCache()
    const loadToken = vi.fn<() => Promise<null>>().mockResolvedValue(null)
    primeNavigationAuthCache(
      cache,
      { isAuthenticated: true, token: "ancien-token" },
      1_000
    )

    await expect(
      resolveNavigationAuth(cache, loadToken, {
        isClient: true,
        maxAgeMs: 60_000,
        now: 61_000,
      })
    ).resolves.toEqual({ isAuthenticated: false, token: null })
    expect(loadToken).toHaveBeenCalledOnce()
  })

  it("déduplique deux contrôles clients simultanés", async () => {
    const cache = createNavigationAuthCache()
    let release: ((token: string) => void) | undefined
    const loadToken = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        })
    )

    const first = resolveNavigationAuth(cache, loadToken, { isClient: true })
    const second = resolveNavigationAuth(cache, loadToken, { isClient: true })
    release?.("nouveau-token")

    await expect(Promise.all([first, second])).resolves.toEqual([
      { isAuthenticated: true, token: "nouveau-token" },
      { isAuthenticated: true, token: "nouveau-token" },
    ])
    expect(loadToken).toHaveBeenCalledOnce()
  })
})
