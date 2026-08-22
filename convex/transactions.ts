import { ConvexError, v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { stockOperationKind } from "./lib/validators"

const MAX_TEXT_LENGTH = 500
const MAX_QUANTITY = 1_000_000
const MAX_PRICE = 1_000_000_000

function cleanOptionalText(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  if (!cleaned) return undefined
  if (cleaned.length > MAX_TEXT_LENGTH) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Le texte saisi est trop long.",
    })
  }
  return cleaned
}

function assertFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: `${label} doit être compris entre ${minimum} et ${maximum}.`,
    })
  }
}

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const limit = Math.min(200, Math.max(10, Math.round(args.limit ?? 100)))
    return ctx.db
      .query("transactions")
      .withIndex("by_occurred_at")
      .order("desc")
      .take(limit)
  },
})

export const record = mutation({
  args: {
    characterId: v.id("characters"),
    comment: v.optional(v.string()),
    counterparty: v.optional(v.string()),
    discount: v.optional(v.number()),
    kind: stockOperationKind,
    occurredAt: v.number(),
    productId: v.id("products"),
    quantity: v.number(),
    unitPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const [product, character] = await Promise.all([
      ctx.db.get(args.productId),
      ctx.db.get(args.characterId),
    ])
    if (!product?.active) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Produit introuvable ou archivé.",
      })
    }
    if (!character?.active) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Personnage introuvable ou archivé.",
      })
    }

    assertFiniteRange(
      args.quantity,
      Number.EPSILON,
      MAX_QUANTITY,
      "La quantité"
    )
    assertFiniteRange(args.occurredAt, 0, Date.now() + 86_400_000, "La date")
    const fallbackPrice =
      args.kind === "purchase" ? product.purchasePrice : product.salePrice
    const unitPrice = args.unitPrice ?? fallbackPrice ?? 0
    const discount = args.discount ?? 0
    assertFiniteRange(unitPrice, 0, MAX_PRICE, "Le prix")
    assertFiniteRange(discount, 0, MAX_PRICE, "La remise")

    if (product.tracksStock === false && args.kind !== "service") {
      throw new ConvexError({
        code: "INVALID_OPERATION",
        message: "Ce service ne produit aucun mouvement de stock.",
      })
    }
    if (product.tracksStock && args.kind === "service") {
      throw new ConvexError({
        code: "INVALID_OPERATION",
        message: "Sélectionnez un service pour cette opération.",
      })
    }

    const delta =
      args.kind === "sale"
        ? -args.quantity
        : args.kind === "purchase" || args.kind === "production"
          ? args.quantity
          : 0
    const resultingStock = product.currentStock + delta
    if (resultingStock < 0) {
      throw new ConvexError({
        code: "INSUFFICIENT_STOCK",
        message: `Stock insuffisant : ${product.currentStock} disponible(s).`,
      })
    }

    const gross = args.quantity * unitPrice
    if (discount > gross) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "La remise ne peut pas dépasser le montant brut.",
      })
    }
    const net = gross - discount
    const total =
      args.kind === "purchase" ? -net : args.kind === "production" ? 0 : net
    const counterparty = cleanOptionalText(args.counterparty)
    const comment = cleanOptionalText(args.comment)
    const transactionId = await ctx.db.insert("transactions", {
      actorCharacterId: character._id,
      actorName: character.name,
      actorUserId: String(user._id),
      ...(comment ? { comment } : {}),
      ...(counterparty ? { counterparty } : {}),
      ...(discount > 0 ? { discount } : {}),
      kind: args.kind,
      occurredAt: args.occurredAt,
      productId: product._id,
      productName: product.name,
      quantity: args.quantity,
      source: "web",
      total,
      unitPrice,
    })

    if (delta !== 0) {
      await ctx.db.patch(product._id, { currentStock: resultingStock })
      await ctx.db.insert("stockMovements", {
        delta,
        occurredAt: args.occurredAt,
        previousStock: product.currentStock,
        productId: product._id,
        reason: args.kind,
        resultingStock,
        transactionId,
      })
    }

    await ctx.db.insert("auditLogs", {
      action: "transaction.recorded",
      actorUserId: String(user._id),
      createdAt: Date.now(),
      detail: `${args.kind}:${args.quantity}`,
      entityId: transactionId,
      entityType: "transaction",
    })

    return { resultingStock, transactionId }
  },
})
