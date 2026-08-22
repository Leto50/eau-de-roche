import { ConvexError, v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { orderStatus } from "./lib/validators"

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
