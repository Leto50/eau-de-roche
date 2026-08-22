import { query } from "./_generated/server"
import { requireUser } from "./lib/auth"

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const recipes = await ctx.db.query("recipes").collect()
    const withIngredients = await Promise.all(
      recipes.map(async (recipe) => ({
        ...recipe,
        ingredients: await ctx.db
          .query("recipeIngredients")
          .withIndex("by_recipe", (index) => index.eq("recipeId", recipe._id))
          .collect(),
      }))
    )
    return withIngredients.sort((left, right) =>
      left.name.localeCompare(right.name, "fr")
    )
  },
})

export const listBundles = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const bundles = await ctx.db.query("bundles").collect()
    return Promise.all(
      bundles
        .filter((bundle) => bundle.active)
        .map(async (bundle) => ({
          ...bundle,
          items: await ctx.db
            .query("bundleItems")
            .withIndex("by_bundle", (index) => index.eq("bundleId", bundle._id))
            .collect(),
        }))
    )
  },
})
