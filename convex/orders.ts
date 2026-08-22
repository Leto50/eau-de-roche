import { ConvexError, v } from "convex/values"

import { type Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { requireAdmin, requireUser } from "./lib/auth"
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
