import { ConvexError, v } from "convex/values"

import { type Doc, type Id } from "./_generated/dataModel"
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
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_occurred_at")
      .order("desc")
      .take(limit)
    return Promise.all(
      transactions.map(async (transaction) => ({
        ...transaction,
        lines: transaction.lineCount
          ? await ctx.db
              .query("transactionLines")
              .withIndex("by_transaction", (index) =>
                index.eq("transactionId", transaction._id)
              )
              .collect()
          : [],
      }))
    )
  },
})

interface PreparedSaleLine {
  bundleId?: Id<"bundles">
  kind: "bundle" | "product"
  productId?: Id<"products">
  productName: string
  quantity: number
  total: number
  unitPrice: number
}

interface StockRequirement {
  product: Doc<"products">
  quantity: number
}

export const recordSale = mutation({
  args: {
    characterId: v.id("characters"),
    comment: v.optional(v.string()),
    counterparty: v.optional(v.string()),
    discount: v.optional(v.number()),
    lines: v.array(
      v.union(
        v.object({
          kind: v.literal("product"),
          productId: v.id("products"),
          quantity: v.number(),
          unitPrice: v.optional(v.number()),
        }),
        v.object({
          bundleId: v.id("bundles"),
          kind: v.literal("bundle"),
          quantity: v.number(),
          unitPrice: v.optional(v.number()),
        })
      )
    ),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const character = await ctx.db.get(args.characterId)
    if (!character?.active) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Personnage introuvable ou archivé.",
      })
    }
    if (args.lines.length === 0 || args.lines.length > 50) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Une vente doit contenir entre 1 et 50 lignes.",
      })
    }
    assertFiniteRange(args.occurredAt, 0, Date.now() + 86_400_000, "La date")
    const discount = args.discount ?? 0
    assertFiniteRange(discount, 0, MAX_PRICE, "La remise")
    const counterparty = cleanOptionalText(args.counterparty)
    const comment = cleanOptionalText(args.comment)

    const references = new Set<string>()
    const preparedLines: PreparedSaleLine[] = []
    const stockRequirements = new Map<string, StockRequirement>()

    function addStockRequirement(product: Doc<"products">, quantity: number) {
      const existing = stockRequirements.get(product._id)
      stockRequirements.set(product._id, {
        product,
        quantity: (existing?.quantity ?? 0) + quantity,
      })
    }

    for (const line of args.lines) {
      assertFiniteRange(
        line.quantity,
        Number.EPSILON,
        MAX_QUANTITY,
        "La quantité"
      )
      const referenceKey =
        line.kind === "product"
          ? `product:${line.productId}`
          : `bundle:${line.bundleId}`
      if (references.has(referenceKey)) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message:
            "Une référence ne peut apparaître qu’une fois dans la vente.",
        })
      }
      references.add(referenceKey)

      if (line.kind === "product") {
        const product = await ctx.db.get(line.productId)
        if (!product?.active || !product.tracksStock) {
          throw new ConvexError({
            code: "NOT_FOUND",
            message: "Un produit de la vente est introuvable ou indisponible.",
          })
        }
        const unitPrice = line.unitPrice ?? product.salePrice ?? 0
        assertFiniteRange(unitPrice, 0, MAX_PRICE, "Le prix")
        preparedLines.push({
          kind: "product",
          productId: product._id,
          productName: product.name,
          quantity: line.quantity,
          total: line.quantity * unitPrice,
          unitPrice,
        })
        addStockRequirement(product, line.quantity)
        continue
      }

      const bundle = await ctx.db.get(line.bundleId)
      if (!bundle?.active) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Un lot de la vente est introuvable ou archivé.",
        })
      }
      const bundleItems = await ctx.db
        .query("bundleItems")
        .withIndex("by_bundle", (index) => index.eq("bundleId", bundle._id))
        .collect()
      if (bundleItems.length === 0) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: `Le lot « ${bundle.name} » ne contient aucun produit.`,
        })
      }
      for (const item of bundleItems) {
        if (!item.productId) {
          throw new ConvexError({
            code: "INVALID_INPUT",
            message: `Le composant « ${item.productName} » du lot n’est relié à aucun produit.`,
          })
        }
        const product = await ctx.db.get(item.productId)
        if (!product?.active || !product.tracksStock) {
          throw new ConvexError({
            code: "NOT_FOUND",
            message: `Le composant « ${item.productName} » est indisponible.`,
          })
        }
        assertFiniteRange(
          item.quantity,
          Number.EPSILON,
          MAX_QUANTITY,
          "La quantité du lot"
        )
        addStockRequirement(product, item.quantity * line.quantity)
      }
      const unitPrice = line.unitPrice ?? bundle.price ?? 0
      assertFiniteRange(unitPrice, 0, MAX_PRICE, "Le prix")
      preparedLines.push({
        bundleId: bundle._id,
        kind: "bundle",
        productName: bundle.name,
        quantity: line.quantity,
        total: line.quantity * unitPrice,
        unitPrice,
      })
    }

    const gross = preparedLines.reduce((total, line) => total + line.total, 0)
    if (discount > gross) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "La remise ne peut pas dépasser le montant brut.",
      })
    }
    for (const requirement of stockRequirements.values()) {
      if (requirement.quantity > requirement.product.currentStock) {
        throw new ConvexError({
          code: "INSUFFICIENT_STOCK",
          message: `Stock insuffisant pour « ${requirement.product.name} » : ${requirement.product.currentStock} disponibles.`,
        })
      }
    }

    const total = gross - discount
    const firstLine = preparedLines[0]
    const occurredAt = args.occurredAt
    const transactionId = await ctx.db.insert("transactions", {
      actorCharacterId: character._id,
      actorName: character.name,
      actorUserId: String(user._id),
      ...(comment ? { comment } : {}),
      ...(counterparty ? { counterparty } : {}),
      ...(discount > 0 ? { discount } : {}),
      kind: "sale",
      lineCount: preparedLines.length,
      occurredAt,
      productName:
        preparedLines.length === 1 && firstLine
          ? firstLine.productName
          : `${preparedLines.length} références`,
      quantity: preparedLines.reduce((sum, line) => sum + line.quantity, 0),
      source: "web",
      total,
      ...(preparedLines.length === 1 && firstLine
        ? { unitPrice: firstLine.unitPrice }
        : {}),
    })

    for (const line of preparedLines) {
      await ctx.db.insert("transactionLines", {
        ...(line.bundleId ? { bundleId: line.bundleId } : {}),
        kind: line.kind,
        ...(line.productId ? { productId: line.productId } : {}),
        productName: line.productName,
        quantity: line.quantity,
        total: line.total,
        transactionId,
        unitPrice: line.unitPrice,
      })
    }
    for (const requirement of stockRequirements.values()) {
      const resultingStock =
        requirement.product.currentStock - requirement.quantity
      await ctx.db.patch(requirement.product._id, {
        currentStock: resultingStock,
      })
      await ctx.db.insert("stockMovements", {
        delta: -requirement.quantity,
        occurredAt,
        previousStock: requirement.product.currentStock,
        productId: requirement.product._id,
        reason: "sale",
        resultingStock,
        transactionId,
      })
    }
    await ctx.db.insert("auditLogs", {
      action: "sale.recorded",
      actorUserId: String(user._id),
      createdAt: Date.now(),
      detail: `${preparedLines.length}:${total}`,
      entityId: transactionId,
      entityType: "transaction",
    })

    return { total, transactionId }
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
        message: `Stock insuffisant : ${product.currentStock} ${Math.abs(product.currentStock) === 1 ? "disponible" : "disponibles"}.`,
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
