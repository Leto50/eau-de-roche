import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

function documentId(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    !("_id" in value) ||
    typeof value._id !== "string"
  ) {
    throw new Error(
      "Le composant d'authentification n'a pas renvoyé d'identifiant."
    )
  }
  return value._id
}

function createTestBackend() {
  const backend = convexTest(schema, modules)
  betterAuthTest.register(backend)
  return backend
}

async function asAuthenticatedMember(
  backend: ReturnType<typeof createTestBackend>
) {
  const now = Date.now()
  const createdUser: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        data: {
          createdAt: now,
          email: "employe@example.test",
          emailVerified: true,
          name: "Employé test",
          updatedAt: now,
        },
        model: "user",
      },
    }
  )
  const userId = documentId(createdUser)
  const createdSession: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        data: {
          createdAt: now,
          expiresAt: now + 60_000,
          token: "dashboard-test-session-token",
          updatedAt: now,
          userId,
        },
        model: "session",
      },
    }
  )
  const sessionId = documentId(createdSession)

  return backend.withIdentity({
    issuer: "https://auth.example.test",
    sessionId,
    subject: userId,
    tokenIdentifier: `https://auth.example.test|${userId}`,
  })
}

describe("dashboard.overview", () => {
  afterEach(() => vi.useRealTimers())

  it("valorise un article fabriqué avec le coût courant de sa recette", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedMember(backend)

    await backend.run(async (ctx) => {
      const potionId = await ctx.db.insert("products", {
        active: true,
        category: "potion",
        currentStock: 10,
        minimumStock: 2,
        name: "Potion de soin",
        normalizedName: "potion de soin",
        purchasePrice: 4,
        salePrice: 12,
        tracksStock: true,
      })
      const ingredientId = await ctx.db.insert("products", {
        active: true,
        category: "ingredient",
        currentStock: 0,
        minimumStock: 0,
        name: "Poudre minérale",
        normalizedName: "poudre minerale",
        purchasePrice: 2,
        tracksStock: true,
      })
      const recipeId = await ctx.db.insert("recipes", {
        active: true,
        family: "Soin",
        name: "Potion de soin",
        productId: potionId,
      })
      await ctx.db.insert("recipeIngredients", {
        ingredientName: "Poudre minérale",
        productId: ingredientId,
        quantity: 3,
        raw: "3 Poudre minérale",
        recipeId,
      })
      await ctx.db.insert("products", {
        active: true,
        category: "ingredient",
        currentStock: 3,
        minimumStock: 1,
        name: "Ail",
        normalizedName: "ail",
        salePrice: 7,
        tracksStock: true,
      })
      await ctx.db.insert("products", {
        active: true,
        category: "service",
        currentStock: 1,
        minimumStock: 0,
        name: "Livraison",
        normalizedName: "livraison",
        salePrice: 100,
        tracksStock: false,
      })
      await ctx.db.insert("products", {
        active: false,
        category: "potion",
        currentStock: 5,
        minimumStock: 0,
        name: "Ancienne référence",
        normalizedName: "ancienne reference",
        purchasePrice: 50,
        tracksStock: true,
      })
    })

    const overview = await member.query(api.dashboard.overview, {})

    expect(overview.stockValue).toBe(81)
  })

  it("utilise la semaine calendaire du lundi au dimanche", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"))
    const backend = createTestBackend()
    const member = await asAuthenticatedMember(backend)

    await backend.run(async (ctx) => {
      for (const occurredAt of [
        Date.parse("2026-08-23T23:59:59.000Z"),
        Date.parse("2026-08-24T00:00:00.000Z"),
      ]) {
        await ctx.db.insert("transactions", {
          actorName: "Comptable test",
          kind: "sale",
          occurredAt,
          productName: "Écriture test",
          quantity: 1,
          source: "web",
          total: 25,
        })
      }
    })

    const overview = await member.query(api.dashboard.overview, {})

    expect(overview.weeklyTransactionCount).toBe(1)
    expect(overview.weeklyBalance).toBe(25)
  })
})
