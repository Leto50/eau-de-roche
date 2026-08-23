import { query } from "./_generated/server"
import { requireUser } from "./lib/auth"

const WEEK_IN_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const now = Date.now()
    const [products, recentTransactionCandidates, openOrders] =
      await Promise.all([
        ctx.db.query("products").collect(),
        ctx.db
          .query("transactions")
          .withIndex("by_occurred_at")
          .order("desc")
          .take(24),
        ctx.db
          .query("orders")
          .withIndex("by_status", (index) => index.eq("status", "open"))
          .collect(),
      ])
    const recentTransactions = recentTransactionCandidates.slice(0, 8)

    const activeStock = products.filter(
      (product) => product.active && product.tracksStock
    )
    const lowStock = activeStock
      .filter((product) => product.currentStock <= product.minimumStock)
      .sort(
        (left, right) =>
          left.currentStock / Math.max(left.minimumStock, 1) -
          right.currentStock / Math.max(right.minimumStock, 1)
      )
      .slice(0, 6)
    const stockValue = activeStock.reduce(
      (total, product) =>
        total +
        product.currentStock *
          (product.purchasePrice ?? product.salePrice ?? 0),
      0
    )
    const weeklyTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_occurred_at", (index) =>
        index.gte("occurredAt", now - WEEK_IN_MILLISECONDS)
      )
      .collect()
    const weeklyBalance = weeklyTransactions.reduce(
      (total, transaction) => total + transaction.total,
      0
    )

    return {
      lowStock,
      openOrders: openOrders.length,
      recentTransactions,
      stockValue,
      weeklyBalance,
      weeklyTransactionCount: weeklyTransactions.length,
    }
  },
})
