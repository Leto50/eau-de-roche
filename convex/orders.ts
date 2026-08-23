import { ConvexError, type Infer, v } from "convex/values"

import { type Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { requireAdmin, requireUser } from "./lib/auth"
import { type exchangeLineValidator, prepareExchange } from "./lib/exchange"
import {
  assertFiniteRange,
  assertWholeNumberRange,
  roundSeptimsDown,
} from "./lib/numbers"
import { normalizeName } from "./lib/text"
import { orderKind, orderStatus } from "./lib/validators"

const MAX_CONTACT_NAME_LENGTH = 100
const MAX_LINES = 50
const MAX_NOTES_LENGTH = 1_000
const MAX_PRICE = 1_000_000_000
const MAX_QUANTITY = 1_000_000

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const orders = await ctx.db.query("orders").collect()
    const withLines = await Promise.all(
      orders.map(async (order) => ({
        ...order,
        lines: await ctx.db
          .query("orderLines")
          .withIndex("by_order", (index) => index.eq("orderId", order._id))
          .collect(),
      }))
    )

    return withLines.sort((left, right) => {
      if (left.status !== right.status) return left.status === "open" ? -1 : 1
      return (
        (left.dueAt ?? Number.MAX_SAFE_INTEGER) -
        (right.dueAt ?? Number.MAX_SAFE_INTEGER)
      )
    })
  },
})

export const save = mutation({
  args: {
    contactName: v.string(),
    dueAt: v.union(v.number(), v.null()),
    kind: orderKind,
    lines: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
        unitPrice: v.union(v.number(), v.null()),
      })
    ),
    notes: v.string(),
    orderId: v.optional(v.id("orders")),
    status: orderStatus,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const contactName = args.contactName.trim()
    const notes = args.notes.trim()
    if (!contactName || contactName.length > MAX_CONTACT_NAME_LENGTH) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Le nom du contact doit contenir entre 1 et ${MAX_CONTACT_NAME_LENGTH} caractères.`,
      })
    }
    if (notes.length > MAX_NOTES_LENGTH) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Les notes sont trop longues.",
      })
    }
    if (args.dueAt !== null) {
      assertFiniteRange(
        args.dueAt,
        0,
        Number.MAX_SAFE_INTEGER,
        "La date prévue"
      )
    }
    if (args.lines.length === 0 || args.lines.length > MAX_LINES) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Une commande doit contenir entre 1 et ${MAX_LINES} références.`,
      })
    }

    const existing = args.orderId ? await ctx.db.get(args.orderId) : undefined
    if (args.orderId && !existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Commande introuvable.",
      })
    }
    if (existing?.transactionId) {
      throw new ConvexError({
        code: "ORDER_ALREADY_PROCESSED",
        message:
          "Cette commande est liée à une transaction. Modifiez la transaction ou son état logistique.",
      })
    }

    const seenProducts = new Set<string>()
    const preparedLines = await Promise.all(
      args.lines.map(async (line) => {
        assertWholeNumberRange(line.quantity, 1, MAX_QUANTITY, "La quantité")
        if (seenProducts.has(line.productId)) {
          throw new ConvexError({
            code: "INVALID_INPUT",
            message: "Une référence ne peut apparaître qu’une fois.",
          })
        }
        seenProducts.add(line.productId)
        const product = await ctx.db.get(line.productId)
        if (!product?.active) {
          throw new ConvexError({
            code: "NOT_FOUND",
            message: "Une référence est introuvable ou indisponible.",
          })
        }
        if (args.kind === "supplier" && !product.tracksStock) {
          throw new ConvexError({
            code: "INVALID_OPERATION",
            message:
              "Une commande fournisseur ne peut pas contenir un service.",
          })
        }
        if (line.unitPrice !== null) {
          assertFiniteRange(line.unitPrice, 0, MAX_PRICE, "Le prix")
        }
        return {
          productId: product._id,
          productName: product.name,
          quantity: line.quantity,
          ...(line.unitPrice === null
            ? {}
            : {
                total: line.unitPrice * line.quantity,
                unitPrice: line.unitPrice,
              }),
        }
      })
    )

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_kind", (index) => index.eq("kind", args.kind))
      .collect()
    const normalizedContactName = normalizeName(contactName)
    const existingContact = contacts.find(
      (contact) => normalizeName(contact.name) === normalizedContactName
    )
    const contactId =
      existingContact?._id ??
      (await ctx.db.insert("contacts", { kind: args.kind, name: contactName }))

    const pricedLines = preparedLines.filter(
      (
        line
      ): line is typeof line & {
        total: number
        unitPrice: number
      } => line.total !== undefined
    )
    const total =
      pricedLines.length === preparedLines.length
        ? roundSeptimsDown(
            pricedLines.reduce((sum, line) => sum + line.total, 0)
          )
        : undefined
    const details = {
      contactId,
      contactName,
      ...(args.dueAt === null ? {} : { dueAt: args.dueAt }),
      kind: args.kind,
      ...(existing?.legacyKey ? { legacyKey: existing.legacyKey } : {}),
      ...(notes ? { notes } : {}),
      status: args.status,
      ...(total === undefined ? {} : { total }),
    }
    let orderId: Id<"orders">
    if (existing) {
      await ctx.db.replace(existing._id, details)
      orderId = existing._id
      const oldLines = await ctx.db
        .query("orderLines")
        .withIndex("by_order", (index) => index.eq("orderId", orderId))
        .collect()
      await Promise.all(oldLines.map((line) => ctx.db.delete(line._id)))
    } else {
      orderId = await ctx.db.insert("orders", details)
    }

    await Promise.all(
      preparedLines.map((line) =>
        ctx.db.insert("orderLines", { orderId, ...line })
      )
    )
    await ctx.db.insert("auditLogs", {
      action: existing ? "order.updated" : "order.created",
      actorUserId: String(user._id),
      createdAt: Date.now(),
      detail: `${contactName}:${preparedLines.length}`,
      entityId: orderId,
      entityType: "order",
    })
    return orderId
  },
})

export const remove = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx)
    const order = await ctx.db.get(args.orderId)
    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Commande introuvable.",
      })
    }
    if (order.transactionId) {
      throw new ConvexError({
        code: "ORDER_ALREADY_PROCESSED",
        message: "Supprimez d’abord la transaction liée à cette commande.",
      })
    }
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_order", (index) => index.eq("orderId", order._id))
      .collect()
    await Promise.all(lines.map((line) => ctx.db.delete(line._id)))
    await ctx.db.delete(order._id)
    await ctx.db.insert("auditLogs", {
      action: "order.deleted",
      actorUserId: String(user._id),
      createdAt: Date.now(),
      detail: order.contactName,
      entityId: order._id,
      entityType: "order",
    })
  },
})

export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: orderStatus,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const order = await ctx.db.get(args.orderId)
    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Commande introuvable.",
      })
    }

    await ctx.db.patch(order._id, { status: args.status })
    await ctx.db.insert("auditLogs", {
      action: "order.status_updated",
      actorUserId: String(user._id),
      createdAt: Date.now(),
      detail: args.status,
      entityId: order._id,
      entityType: "order",
    })
  },
})

export const process = mutation({
  args: {
    characterId: v.id("characters"),
    occurredAt: v.number(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const [order, character] = await Promise.all([
      ctx.db.get(args.orderId),
      ctx.db.get(args.characterId),
    ])
    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Commande introuvable.",
      })
    }
    if (order.transactionId) {
      throw new ConvexError({
        code: "ORDER_ALREADY_PROCESSED",
        message: "Cette commande possède déjà une transaction.",
      })
    }
    if (order.status === "cancelled") {
      throw new ConvexError({
        code: "INVALID_OPERATION",
        message: "Une commande annulée ne peut pas être traitée.",
      })
    }
    if (!character?.active) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Personnage introuvable ou archivé.",
      })
    }
    assertFiniteRange(args.occurredAt, 0, Date.now() + 86_400_000, "La date")
    const orderLines = await ctx.db
      .query("orderLines")
      .withIndex("by_order", (index) => index.eq("orderId", order._id))
      .collect()
    if (
      orderLines.length === 0 ||
      orderLines.some((line) => line.unitPrice === undefined)
    ) {
      throw new ConvexError({
        code: "ORDER_PRICE_REQUIRED",
        message:
          "Renseignez le prix de chaque ligne avant de traiter la commande.",
      })
    }
    const direction = order.kind === "client" ? "outgoing" : "incoming"
    const exchangeLines: Array<Infer<typeof exchangeLineValidator>> = []
    for (const line of orderLines) {
      if (line.kind === "bundle" && line.bundleId) {
        if (direction === "incoming") {
          throw new ConvexError({
            code: "INVALID_OPERATION",
            message: "Une commande fournisseur ne peut pas recevoir un lot.",
          })
        }
        exchangeLines.push({
          bundleId: line.bundleId,
          direction: "outgoing",
          kind: "bundle",
          quantity: line.quantity,
          ...(line.unitPrice === undefined
            ? {}
            : { unitPrice: line.unitPrice }),
        })
        continue
      }
      if (!line.productId) {
        throw new ConvexError({
          code: "UNLINKED_ORDER_LINE",
          message: `La référence « ${line.productName} » doit être reliée à un produit avant de traiter la commande.`,
        })
      }
      exchangeLines.push({
        direction,
        kind: "product",
        productId: line.productId,
        quantity: line.quantity,
        ...(line.unitPrice === undefined ? {} : { unitPrice: line.unitPrice }),
      })
    }
    const prepared = await prepareExchange(ctx, exchangeLines)
    const firstLine = prepared.lines[0]
    const transactionId = await ctx.db.insert("transactions", {
      actorCharacterId: character._id,
      actorName: character.name,
      actorUserId: String(user._id),
      counterparty: order.contactName,
      incomingTotal: prepared.incomingTotal,
      kind: prepared.kind,
      lineCount: prepared.lines.length,
      occurredAt: args.occurredAt,
      orderId: order._id,
      outgoingTotal: prepared.outgoingTotal,
      productName:
        prepared.lines.length === 1 && firstLine
          ? firstLine.productName
          : `${prepared.lines.length} références`,
      quantity: prepared.lines.reduce((sum, line) => sum + line.quantity, 0),
      source: "web",
      total: prepared.total,
      ...(prepared.lines.length === 1 && firstLine
        ? { unitPrice: firstLine.unitPrice }
        : {}),
    })
    for (const line of prepared.lines) {
      await ctx.db.insert("transactionLines", {
        ...(line.bundleId ? { bundleId: line.bundleId } : {}),
        direction: line.direction,
        kind: line.kind,
        ...(line.productId ? { productId: line.productId } : {}),
        productName: line.productName,
        quantity: line.quantity,
        total: line.total,
        transactionId,
        unitPrice: line.unitPrice,
      })
    }
    for (const { delta, product } of prepared.deltas.values()) {
      const resultingStock = product.currentStock + delta
      await ctx.db.patch(product._id, { currentStock: resultingStock })
      await ctx.db.insert("stockMovements", {
        delta,
        occurredAt: args.occurredAt,
        previousStock: product.currentStock,
        productId: product._id,
        reason: prepared.kind,
        resultingStock,
        transactionId,
      })
    }
    await ctx.db.patch(order._id, {
      processedAt: args.occurredAt,
      ...(order.kind === "supplier" ? { status: "delivered" as const } : {}),
      transactionId,
    })
    await ctx.db.insert("auditLogs", {
      action:
        order.kind === "client" ? "order.payment_recorded" : "order.received",
      actorUserId: String(user._id),
      createdAt: Date.now(),
      detail: `${order.contactName}:${prepared.total}`,
      entityId: order._id,
      entityType: "order",
    })

    return { total: prepared.total, transactionId }
  },
})
