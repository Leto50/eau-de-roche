import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import { asAuthenticatedUser, createTestBackend } from "./test.helpers"

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
    const member = await asAuthenticatedUser(backend)
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
    const member = await asAuthenticatedUser(backend)
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

  it("refuse une quantité fractionnaire sans modifier le stock", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)

    await expect(
      member.mutation(api.transactions.record, {
        characterId,
        kind: "sale",
        occurredAt: Date.now(),
        productId,
        quantity: 1.5,
      })
    ).rejects.toThrowError("nombre entier")

    const state = await backend.run(async (ctx) => ({
      product: await ctx.db.get(productId),
      transactions: await ctx.db.query("transactions").collect(),
    }))
    expect(state.product?.currentStock).toBe(10)
    expect(state.transactions).toHaveLength(0)
  })

  it("arrondit un achat au septim inférieur", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    await backend.run((ctx) =>
      ctx.db.patch(productId, { purchasePrice: 1 / 4 })
    )

    const firstResult = await member.mutation(api.transactions.record, {
      characterId,
      kind: "purchase",
      occurredAt: Date.now(),
      productId,
      quantity: 1,
    })
    const secondResult = await member.mutation(api.transactions.record, {
      characterId,
      kind: "purchase",
      occurredAt: Date.now(),
      productId,
      quantity: 4,
    })

    const state = await backend.run(async (ctx) => ({
      product: await ctx.db.get(productId),
      transactions: await ctx.db.query("transactions").collect(),
    }))
    expect(firstResult.resultingStock).toBe(11)
    expect(secondResult.resultingStock).toBe(15)
    expect(state.product?.currentStock).toBe(15)
    expect(state.transactions.map((transaction) => transaction.total)).toEqual([
      0, -1,
    ])
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

describe("transactions.recordTrade", () => {
  it("enregistre un achat multi-produits dans une seule transaction", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const secondProductId = await backend.run(async (ctx) => {
      await ctx.db.patch(productId, { purchasePrice: 1 / 4 })
      return ctx.db.insert("products", {
        active: true,
        category: "ingredient",
        currentStock: 5,
        minimumStock: 1,
        name: "Ail",
        normalizedName: "ail",
        purchasePrice: 3 / 4,
        tracksStock: true,
      })
    })

    const result = await member.mutation(api.transactions.recordTrade, {
      characterId,
      kind: "purchase",
      lines: [
        { kind: "product", productId, quantity: 1 },
        { kind: "product", productId: secondProductId, quantity: 1 },
      ],
      occurredAt: Date.now(),
    })

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      firstProduct: await ctx.db.get(productId),
      lines: await ctx.db.query("transactionLines").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      secondProduct: await ctx.db.get(secondProductId),
      transactions: await ctx.db.query("transactions").collect(),
    }))
    expect(result.total).toBe(-1)
    expect(state.firstProduct?.currentStock).toBe(11)
    expect(state.secondProduct?.currentStock).toBe(6)
    expect(state.transactions[0]).toMatchObject({
      kind: "purchase",
      lineCount: 2,
      productName: "2 références",
      total: -1,
    })
    expect(state.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quantity: 1, total: 1 / 4 }),
        expect.objectContaining({ quantity: 1, total: 3 / 4 }),
      ])
    )
    expect(state.movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ delta: 1, resultingStock: 11 }),
        expect.objectContaining({ delta: 1, resultingStock: 6 }),
      ])
    )
    expect(state.audits[0]).toMatchObject({ action: "purchase.recorded" })
  })

  it("annule tout l’achat si une référence est indisponible", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const archivedProductId = await backend.run((ctx) =>
      ctx.db.insert("products", {
        active: false,
        category: "ingredient",
        currentStock: 4,
        minimumStock: 1,
        name: "Sel",
        normalizedName: "sel",
        purchasePrice: 1,
        tracksStock: true,
      })
    )

    await expect(
      member.mutation(api.transactions.recordTrade, {
        characterId,
        kind: "purchase",
        lines: [
          { kind: "product", productId, quantity: 2 },
          { kind: "product", productId: archivedProductId, quantity: 1 },
        ],
        occurredAt: Date.now(),
      })
    ).rejects.toThrowError("indisponible")

    const state = await backend.run(async (ctx) => ({
      lines: await ctx.db.query("transactionLines").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      product: await ctx.db.get(productId),
      transactions: await ctx.db.query("transactions").collect(),
    }))
    expect(state.product?.currentStock).toBe(10)
    expect(state.transactions).toHaveLength(0)
    expect(state.lines).toHaveLength(0)
    expect(state.movements).toHaveLength(0)
  })

  it("enregistre une vente multi-références et déstocke les composants des lots", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
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

    const result = await member.mutation(api.transactions.recordTrade, {
      characterId,
      discount: 2,
      kind: "sale",
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
    const member = await asAuthenticatedUser(backend)
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
      member.mutation(api.transactions.recordTrade, {
        characterId,
        kind: "sale",
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

  it("refuse une ligne fractionnaire sans enregistrer le panier", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)

    await expect(
      member.mutation(api.transactions.recordTrade, {
        characterId,
        kind: "sale",
        lines: [{ kind: "product", productId, quantity: 1.01 }],
        occurredAt: Date.now(),
      })
    ).rejects.toThrowError("nombre entier")

    const state = await backend.run(async (ctx) => ({
      lines: await ctx.db.query("transactionLines").collect(),
      product: await ctx.db.get(productId),
      transactions: await ctx.db.query("transactions").collect(),
    }))
    expect(state.product?.currentStock).toBe(10)
    expect(state.transactions).toHaveLength(0)
    expect(state.lines).toHaveLength(0)
  })

  it("cumule le panier avant de l’arrondir au septim inférieur", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const secondProductId = await backend.run(async (ctx) => {
      await ctx.db.patch(productId, { salePrice: 3 / 4 })
      return ctx.db.insert("products", {
        active: true,
        category: "ingredient",
        currentStock: 10,
        minimumStock: 1,
        name: "Ail",
        normalizedName: "ail",
        salePrice: 3 / 4,
        tracksStock: true,
      })
    })

    const result = await member.mutation(api.transactions.recordTrade, {
      characterId,
      kind: "sale",
      lines: [
        { kind: "product", productId, quantity: 1 },
        { kind: "product", productId: secondProductId, quantity: 1 },
      ],
      occurredAt: Date.now(),
    })

    const transaction = await backend.run((ctx) =>
      ctx.db.query("transactions").first()
    )
    expect(result.total).toBe(1)
    expect(transaction?.total).toBe(1)
  })
})

describe("transactions.cancel", () => {
  it("annule une vente en rétablissant le stock et conserve sa trace", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const result = await member.mutation(api.transactions.record, {
      characterId,
      kind: "sale",
      occurredAt: Date.now(),
      productId,
      quantity: 3,
    })

    await member.mutation(api.transactions.cancel, {
      reason: "Vente saisie deux fois",
      transactionId: result.transactionId,
    })

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      movements: await ctx.db
        .query("stockMovements")
        .withIndex("by_transaction", (index) =>
          index.eq("transactionId", result.transactionId)
        )
        .collect(),
      product: await ctx.db.get(productId),
      transaction: await ctx.db.get(result.transactionId),
    }))
    const visibleTransactions = await member.query(api.transactions.list, {})
    expect(state.product?.currentStock).toBe(10)
    expect(state.transaction).toMatchObject({
      cancellationReason: "Vente saisie deux fois",
    })
    expect(state.movements.map((movement) => movement.delta)).toEqual([-3, 3])
    expect(state.audits.at(-1)?.action).toBe("transaction.cancelled")
    expect(visibleTransactions[0]?.canManage).toBe(false)
  })

  it("refuse d’annuler un achat lorsque les unités ont déjà été utilisées", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const admin = await asAuthenticatedUser(backend, "admin")
    const { characterId, productId } = await seedStock(backend)
    const result = await member.mutation(api.transactions.record, {
      characterId,
      kind: "purchase",
      occurredAt: Date.now(),
      productId,
      quantity: 3,
    })
    await backend.run((ctx) => ctx.db.patch(productId, { currentStock: 2 }))

    await expect(
      admin.mutation(api.transactions.cancel, {
        reason: "Achat incorrect",
        transactionId: result.transactionId,
      })
    ).rejects.toThrowError("stock")

    const transaction = await backend.run((ctx) =>
      ctx.db.get(result.transactionId)
    )
    expect(transaction?.cancelledAt).toBeUndefined()
  })

  it("refuse à un employé d’annuler la saisie d’un autre compte", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const transactionId = await backend.run((ctx) =>
      ctx.db.insert("transactions", {
        actorName: "Intendant",
        actorUserId: "autre-compte",
        kind: "service",
        occurredAt: Date.now(),
        productName: "Conseil alchimique",
        quantity: 1,
        source: "web",
        total: 5,
      })
    )
    const visibleTransactions = await employee.query(api.transactions.list, {})
    expect(visibleTransactions[0]?.canManage).toBe(false)

    await expect(
      employee.mutation(api.transactions.cancel, {
        reason: "Erreur de saisie",
        transactionId,
      })
    ).rejects.toThrowError("uniquement les opérations que vous avez saisies")
  })
})

describe("transactions.remove", () => {
  it("supprime réellement une vente, ses lignes et ses mouvements", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const recorded = await member.mutation(api.transactions.recordTrade, {
      characterId,
      kind: "sale",
      lines: [{ kind: "product", productId, quantity: 3 }],
      occurredAt: Date.now(),
    })
    const visibleTransactions = await member.query(api.transactions.list, {})
    expect(visibleTransactions[0]?.canDelete).toBe(true)

    await member.mutation(api.transactions.remove, {
      transactionId: recorded.transactionId,
    })

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      lines: await ctx.db.query("transactionLines").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      product: await ctx.db.get(productId),
      transaction: await ctx.db.get(recorded.transactionId),
    }))
    expect(state.product?.currentStock).toBe(10)
    expect(state.transaction).toBeNull()
    expect(state.lines).toHaveLength(0)
    expect(state.movements).toHaveLength(0)
    expect(state.audits.at(-1)).toMatchObject({
      action: "transaction.deleted",
      entityId: recorded.transactionId,
    })
  })

  it("supprime une opération déjà annulée sans modifier une seconde fois le stock", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const recorded = await member.mutation(api.transactions.record, {
      characterId,
      kind: "sale",
      occurredAt: Date.now(),
      productId,
      quantity: 3,
    })
    await member.mutation(api.transactions.cancel, {
      reason: "Vente non réalisée",
      transactionId: recorded.transactionId,
    })
    const visibleTransactions = await member.query(api.transactions.list, {})
    expect(visibleTransactions[0]).toMatchObject({
      canDelete: true,
      canManage: false,
    })

    await member.mutation(api.transactions.remove, {
      transactionId: recorded.transactionId,
    })

    const state = await backend.run(async (ctx) => ({
      movements: await ctx.db.query("stockMovements").collect(),
      product: await ctx.db.get(productId),
      transaction: await ctx.db.get(recorded.transactionId),
    }))
    expect(state.product?.currentStock).toBe(10)
    expect(state.transaction).toBeNull()
    expect(state.movements).toHaveLength(0)
  })

  it("refuse de supprimer un achat déjà consommé sans écriture partielle", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const recorded = await member.mutation(api.transactions.recordTrade, {
      characterId,
      kind: "purchase",
      lines: [{ kind: "product", productId, quantity: 3 }],
      occurredAt: Date.now(),
    })
    await backend.run((ctx) => ctx.db.patch(productId, { currentStock: 2 }))

    await expect(
      member.mutation(api.transactions.remove, {
        transactionId: recorded.transactionId,
      })
    ).rejects.toThrowError("stock")

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      lines: await ctx.db.query("transactionLines").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      product: await ctx.db.get(productId),
      transaction: await ctx.db.get(recorded.transactionId),
    }))
    expect(state.product?.currentStock).toBe(2)
    expect(state.transaction).not.toBeNull()
    expect(state.lines).toHaveLength(1)
    expect(state.movements).toHaveLength(1)
    expect(state.audits).toHaveLength(1)
  })

  it("refuse à un employé de supprimer la saisie d’un autre compte", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const transactionId = await backend.run((ctx) =>
      ctx.db.insert("transactions", {
        actorName: "Autre employé",
        actorUserId: "autre-compte",
        kind: "service",
        occurredAt: Date.now(),
        productName: "Conseil alchimique",
        quantity: 1,
        source: "web",
        total: 5,
      })
    )
    const visibleTransactions = await employee.query(api.transactions.list, {})
    expect(visibleTransactions[0]?.canDelete).toBe(false)

    await expect(
      employee.mutation(api.transactions.remove, { transactionId })
    ).rejects.toThrowError("uniquement les opérations que vous avez saisies")
    expect(await backend.run((ctx) => ctx.db.get(transactionId))).not.toBeNull()
  })
})

describe("transactions.update", () => {
  it("permet à un employé de corriger sa vente et recalcule le stock", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const recorded = await member.mutation(api.transactions.record, {
      characterId,
      kind: "sale",
      occurredAt: Date.now(),
      productId,
      quantity: 3,
    })

    await member.mutation(api.transactions.update, {
      characterId,
      kind: "sale",
      lines: [
        {
          kind: "product",
          productId,
          quantity: 5,
          unitPrice: 10,
        },
      ],
      occurredAt: Date.now(),
      transactionId: recorded.transactionId,
    })
    const visibleTransactions = await member.query(api.transactions.list, {})

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      lines: await ctx.db.query("transactionLines").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      product: await ctx.db.get(productId),
      transaction: await ctx.db.get(recorded.transactionId),
    }))
    expect(state.product?.currentStock).toBe(5)
    expect(state.transaction).toMatchObject({
      kind: "sale",
      quantity: 5,
      total: 50,
    })
    expect(state.lines).toHaveLength(1)
    expect(state.movements).toHaveLength(1)
    expect(state.movements[0]).toMatchObject({
      delta: -5,
      previousStock: 10,
      resultingStock: 5,
    })
    expect(state.audits.at(-1)?.action).toBe("transaction.updated")
    expect(visibleTransactions[0]?.canManage).toBe(true)
  })

  it("remplace atomiquement les lignes et mouvements d’un achat", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const secondProductId = await backend.run((ctx) =>
      ctx.db.insert("products", {
        active: true,
        category: "ingredient",
        currentStock: 5,
        minimumStock: 1,
        name: "Sel des anciens",
        normalizedName: "sel des anciens",
        purchasePrice: 2,
        tracksStock: true,
      })
    )
    const recorded = await member.mutation(api.transactions.recordTrade, {
      characterId,
      kind: "purchase",
      lines: [
        { kind: "product", productId, quantity: 1 },
        { kind: "product", productId: secondProductId, quantity: 1 },
      ],
      occurredAt: Date.now(),
    })

    await member.mutation(api.transactions.update, {
      characterId,
      kind: "purchase",
      lines: [{ kind: "product", productId, quantity: 2, unitPrice: 5 }],
      occurredAt: Date.now(),
      transactionId: recorded.transactionId,
    })

    const state = await backend.run(async (ctx) => ({
      first: await ctx.db.get(productId),
      lines: await ctx.db.query("transactionLines").collect(),
      movements: await ctx.db.query("stockMovements").collect(),
      second: await ctx.db.get(secondProductId),
      transaction: await ctx.db.get(recorded.transactionId),
    }))
    expect(state.first?.currentStock).toBe(12)
    expect(state.second?.currentStock).toBe(5)
    expect(state.transaction?.total).toBe(-10)
    expect(state.lines).toHaveLength(1)
    expect(state.movements).toHaveLength(1)
    expect(state.movements[0]).toMatchObject({ delta: 2 })
  })

  it("refuse une correction qui rendrait un stock négatif sans écriture partielle", async () => {
    const backend = createTestBackend()
    const member = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const recorded = await member.mutation(api.transactions.record, {
      characterId,
      kind: "purchase",
      occurredAt: Date.now(),
      productId,
      quantity: 3,
    })
    await backend.run((ctx) => ctx.db.patch(productId, { currentStock: 2 }))

    await expect(
      member.mutation(api.transactions.update, {
        characterId,
        kind: "sale",
        lines: [{ kind: "product", productId, quantity: 1 }],
        occurredAt: Date.now(),
        transactionId: recorded.transactionId,
      })
    ).rejects.toThrowError("Stock insuffisant")

    const state = await backend.run(async (ctx) => ({
      movements: await ctx.db.query("stockMovements").collect(),
      product: await ctx.db.get(productId),
      transaction: await ctx.db.get(recorded.transactionId),
    }))
    expect(state.product?.currentStock).toBe(2)
    expect(state.transaction?.kind).toBe("purchase")
    expect(state.movements).toHaveLength(1)
    expect(state.movements[0]?.delta).toBe(3)
  })

  it("refuse à un employé de modifier la saisie d’un autre compte", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const { characterId, productId } = await seedStock(backend)
    const transactionId = await backend.run((ctx) =>
      ctx.db.insert("transactions", {
        actorName: "Autre employé",
        actorUserId: "autre-compte",
        kind: "production",
        occurredAt: Date.now(),
        productId,
        productName: "Potion de soin",
        quantity: 1,
        source: "web",
        total: 0,
      })
    )

    await expect(
      employee.mutation(api.transactions.update, {
        characterId,
        kind: "production",
        occurredAt: Date.now(),
        productId,
        quantity: 2,
        transactionId,
      })
    ).rejects.toThrowError("uniquement les opérations que vous avez saisies")
  })
})
