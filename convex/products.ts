import { v } from "convex/values"

import { query } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { normalizeName } from "./lib/text"
import { productCategory } from "./lib/validators"

export const list = query({
  args: {
    category: v.optional(productCategory),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const products = args.category
      ? await ctx.db
          .query("products")
          .withIndex("by_category", (index) =>
            index.eq("category", args.category!)
          )
          .collect()
      : await ctx.db.query("products").collect()
    const search = normalizeName(args.search ?? "")

    return products
      .filter(
        (product) =>
          product.active && (!search || product.normalizedName.includes(search))
      )
      .sort((left, right) => left.name.localeCompare(right.name, "fr"))
  },
})

export const selectable = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const products = await ctx.db.query("products").collect()
    return products
      .filter((product) => product.active)
      .sort((left, right) => left.name.localeCompare(right.name, "fr"))
  },
})
