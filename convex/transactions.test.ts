import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

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
          token: "test-session-token",
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

async function seedStock(backend: ReturnType<typeof createTestBackend>) {
  return backend.run(async (ctx) => {
    const productId = await ctx.db.insert("products", {
      active: true,
      category: "potion",
      currentStock: 10,
      minimumStock: 2,
      name: "Potion de soin",
      normalizedName: "potion de soin",
      purchasePrice: 6,
      salePrice: 12,
      tracksStock: true,
    })
    const characterId = await ctx.db.insert("characters", {
      active: true,
      name: "Alixard Veliane",
    })
    return { characterId, productId }
  })
}

describe("transactions.record", () => {
  it("écrit atomiquement la vente, le mouvement, l'audit et le nouveau stock", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedMember(backend)
    const { characterId, productId } = await seedStock(backend)

    const result = await member.mutation(api.transactions.record, {
      characterId,
      kind: "sale",
      occurredAt: Date.now(),
      productId,
      quantity: 3,
    })

    expect(result.resultingStock).toBe(7)
    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      product: await ctx.db.get(productId),
      transactions: await ctx.db.query("transactions").collect(),
    }))
    expect(state.product?.currentStock).toBe(7)
    expect(state.transactions).toHaveLength(1)
    expect(state.transactions[0]).toMatchObject({
      kind: "sale",
      quantity: 3,
      total: 36,
      unitPrice: 12,
    })
    expect(state.movements[0]).toMatchObject({
      delta: -3,
      previousStock: 10,
      resultingStock: 7,
    })
    expect(state.audits[0]).toMatchObject({
      action: "transaction.recorded",
      entityType: "transaction",
    })
  })

  it("refuse une vente qui rendrait le stock négatif sans écriture partielle", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedMember(backend)
    const { characterId, productId } = await seedStock(backend)

    await expect(
      member.mutation(api.transactions.record, {
        characterId,
        kind: "sale",
        occurredAt: Date.now(),
        productId,
        quantity: 11,
      })
    ).rejects.toThrowError("Stock insuffisant")

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      product: await ctx.db.get(productId),
      transactions: await ctx.db.query("transactions").collect(),
    }))
    expect(state.product?.currentStock).toBe(10)
    expect(state.transactions).toHaveLength(0)
    expect(state.movements).toHaveLength(0)
    expect(state.audits).toHaveLength(0)
  })

  it("refuse l'opération en l'absence d'une session Better Auth valide", async () => {
    const backend = createTestBackend()
    const { characterId, productId } = await seedStock(backend)

    await expect(
      backend.mutation(api.transactions.record, {
        characterId,
        kind: "sale",
        occurredAt: Date.now(),
        productId,
        quantity: 1,
      })
    ).rejects.toThrowError("Vous devez être connecté")
  })
})

describe("transactions.recordSale", () => {
  it("enregistre une vente multi-références et déstocke les composants des lots", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedMember(backend)
    const { characterId, productId } = await seedStock(backend)
    const { bundleId, secondProductId } = await backend.run(async (ctx) => {
      const secondProductId = await ctx.db.insert("products", {
        active: true,
        category: "annexe",
        currentStock: 5,
        minimumStock: 1,
        name: "Sacoche d’apothicaire",
        normalizedName: "sacoche d apothicaire",
        salePrice: 5,
        tracksStock: true,
      })
      const bundleId = await ctx.db.insert("bundles", {
        active: true,
        name: "Trousse du voyageur",
        price: 20,
      })
      await ctx.db.insert("bundleItems", {
        bundleId,
        productId,
        productName: "Potion de soin",
        quantity: 2,
      })
      await ctx.db.insert("bundleItems", {
        bundleId,
        productId: secondProductId,
        productName: "Sacoche d’apothicaire",
        quantity: 1,
      })
      return { bundleId, secondProductId }
    })

    const result = await member.mutation(api.transactions.recordSale, {
      characterId,
      discount: 2,
      lines: [
        { kind: "product", productId, quantity: 1 },
        { bundleId, kind: "bundle", quantity: 2 },
      ],
      occurredAt: Date.now(),
    })

    expect(result.total).toBe(50)
    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      firstProduct: await ctx.db.get(productId),
      lines: await ctx.db.query("transactionLines").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      secondProduct: await ctx.db.get(secondProductId),
      transactions: await ctx.db.query("transactions").collect(),
    }))
    expect(state.firstProduct?.currentStock).toBe(5)
    expect(state.secondProduct?.currentStock).toBe(3)
    expect(state.transactions[0]).toMatchObject({
      kind: "sale",
      lineCount: 2,
      productName: "2 références",
      total: 50,
    })
    expect(state.lines).toHaveLength(2)
    expect(state.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "product",
          productName: "Potion de soin",
          quantity: 1,
          total: 12,
        }),
        expect.objectContaining({
          kind: "bundle",
          productName: "Trousse du voyageur",
          quantity: 2,
          total: 40,
        }),
      ])
    )
    expect(state.movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ delta: -5, resultingStock: 5 }),
        expect.objectContaining({ delta: -2, resultingStock: 3 }),
      ])
    )
    expect(state.audits[0]).toMatchObject({ action: "sale.recorded" })
  })

  it("refuse tout le panier si un composant de lot manque en stock", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedMember(backend)
    const { characterId, productId } = await seedStock(backend)
    const bundleId = await backend.run(async (ctx) => {
      const bundleId = await ctx.db.insert("bundles", {
        active: true,
        name: "Caisse de potions",
        price: 50,
      })
      await ctx.db.insert("bundleItems", {
        bundleId,
        productId,
        productName: "Potion de soin",
        quantity: 6,
      })
      return bundleId
    })

    await expect(
      member.mutation(api.transactions.recordSale, {
        characterId,
        lines: [{ bundleId, kind: "bundle", quantity: 2 }],
        occurredAt: Date.now(),
      })
    ).rejects.toThrowError("Stock insuffisant")

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      lines: await ctx.db.query("transactionLines").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      product: await ctx.db.get(productId),
      transactions: await ctx.db.query("transactions").collect(),
    }))
    expect(state.product?.currentStock).toBe(10)
    expect(state.transactions).toHaveLength(0)
    expect(state.lines).toHaveLength(0)
    expect(state.movements).toHaveLength(0)
    expect(state.audits).toHaveLength(0)
  })
})
