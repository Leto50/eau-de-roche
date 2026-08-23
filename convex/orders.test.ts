import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import { asAuthenticatedUser, createTestBackend } from "./test.helpers"

async function seedOrderProduct(backend: ReturnType<typeof createTestBackend>) {
  return backend.run((ctx) =>
    ctx.db.insert("products", {
      active: true,
      category: "potion",
      currentStock: 10,
      minimumStock: 2,
      name: "Potion de réserve",
      normalizedName: "potion de reserve",
      salePrice: 1 / 4,
      tracksStock: true,
    })
  )
}

describe("orders", () => {
  it("crée puis modifie une commande multi-produits sans toucher au stock", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const firstProductId = await seedOrderProduct(backend)
    const secondProductId = await backend.run((ctx) =>
      ctx.db.insert("products", {
        active: true,
        category: "annexe",
        currentStock: 5,
        minimumStock: 1,
        name: "Flacon de transport",
        normalizedName: "flacon de transport",
        tracksStock: true,
      })
    )

    const orderId = await employee.mutation(api.orders.save, {
      contactName: "Client de passage",
      dueAt: null,
      kind: "client",
      lines: [
        { productId: firstProductId, quantity: 1, unitPrice: 1 / 4 },
        { productId: secondProductId, quantity: 2, unitPrice: 3 / 4 },
      ],
      notes: "Remise au comptoir.",
      status: "open",
    })
    await employee.mutation(api.orders.save, {
      contactName: "Client de passage",
      dueAt: Date.UTC(2026, 7, 30),
      kind: "client",
      lines: [{ productId: firstProductId, quantity: 4, unitPrice: 1 / 4 }],
      notes: "Prévenir lorsque la commande est prête.",
      orderId,
      status: "ready",
    })

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      contacts: await ctx.db.query("contacts").collect(),
      lines: await ctx.db
        .query("orderLines")
        .withIndex("by_order", (index) => index.eq("orderId", orderId))
        .collect(),
      order: await ctx.db.get(orderId),
      product: await ctx.db.get(firstProductId),
    }))
    expect(state.order).toMatchObject({ status: "ready", total: 1 })
    expect(state.lines).toHaveLength(1)
    expect(state.contacts).toHaveLength(1)
    expect(state.product?.currentStock).toBe(10)
    expect(state.audits.map((audit) => audit.action)).toEqual([
      "order.created",
      "order.updated",
    ])
  })

  it("permet à un administrateur de supprimer une commande annulée et ses lignes", async () => {
    const backend = createTestBackend()
    const admin = await asAuthenticatedUser(backend, "admin")
    const productId = await seedOrderProduct(backend)
    const orderId = await admin.mutation(api.orders.save, {
      contactName: "Commande à retirer",
      dueAt: null,
      kind: "supplier",
      lines: [{ productId, quantity: 2, unitPrice: null }],
      notes: "",
      status: "cancelled",
    })

    await admin.mutation(api.orders.remove, { orderId })

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      lines: await ctx.db.query("orderLines").collect(),
      order: await ctx.db.get(orderId),
    }))
    expect(state.order).toBeNull()
    expect(state.lines).toHaveLength(0)
    expect(state.audits.at(-1)?.action).toBe("order.deleted")
  })

  it("refuse la suppression d’une commande à un employé", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const orderId = await backend.run((ctx) =>
      ctx.db.insert("orders", {
        contactName: "Commande protégée",
        kind: "client",
        status: "open",
      })
    )

    await expect(
      employee.mutation(api.orders.remove, { orderId })
    ).rejects.toThrowError("réservée aux administrateurs")
  })

  it("transforme une commande payée en transaction datée sans doublon", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const productId = await seedOrderProduct(backend)
    const characterId = await backend.run((ctx) =>
      ctx.db.insert("characters", {
        active: true,
        name: "Caissière test",
      })
    )
    const orderId = await employee.mutation(api.orders.save, {
      contactName: "Client du test",
      dueAt: null,
      kind: "client",
      lines: [{ productId, quantity: 4, unitPrice: 1 / 4 }],
      notes: "",
      status: "ready",
    })
    const occurredAt = Date.now() - 1_000

    const result = await employee.mutation(api.orders.process, {
      characterId,
      occurredAt,
      orderId,
    })
    await expect(
      employee.mutation(api.orders.process, {
        characterId,
        occurredAt,
        orderId,
      })
    ).rejects.toThrowError("déjà une transaction")

    const processed = await backend.run(async (ctx) => ({
      order: await ctx.db.get(orderId),
      product: await ctx.db.get(productId),
      transaction: await ctx.db.get(result.transactionId),
    }))
    expect(processed.order).toMatchObject({
      processedAt: occurredAt,
      transactionId: result.transactionId,
    })
    expect(processed.product?.currentStock).toBe(6)
    expect(processed.transaction).toMatchObject({
      orderId,
      total: 1,
    })

    const correctedDate = Date.now()
    await employee.mutation(api.transactions.updateExchange, {
      characterId,
      lines: [
        {
          direction: "outgoing",
          kind: "product",
          productId,
          quantity: 4,
          unitPrice: 1 / 4,
        },
      ],
      occurredAt: correctedDate,
      transactionId: result.transactionId,
    })
    const correctedOrder = await backend.run((ctx) => ctx.db.get(orderId))
    expect(correctedOrder?.processedAt).toBe(correctedDate)

    await employee.mutation(api.transactions.remove, {
      transactionId: result.transactionId,
    })
    const reverted = await backend.run(async (ctx) => ({
      order: await ctx.db.get(orderId),
      product: await ctx.db.get(productId),
    }))
    expect(reverted.product?.currentStock).toBe(10)
    expect(reverted.order?.transactionId).toBeUndefined()
    expect(reverted.order?.processedAt).toBeUndefined()
  })

  it("refuse de traiter une commande annulée", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const productId = await seedOrderProduct(backend)
    const characterId = await backend.run((ctx) =>
      ctx.db.insert("characters", {
        active: true,
        name: "Caissière test",
      })
    )
    const orderId = await employee.mutation(api.orders.save, {
      contactName: "Commande annulée",
      dueAt: null,
      kind: "client",
      lines: [{ productId, quantity: 4, unitPrice: 1 / 4 }],
      notes: "",
      status: "cancelled",
    })

    await expect(
      employee.mutation(api.orders.process, {
        characterId,
        occurredAt: Date.now(),
        orderId,
      })
    ).rejects.toThrowError("annulée ne peut pas être traitée")
  })
})
