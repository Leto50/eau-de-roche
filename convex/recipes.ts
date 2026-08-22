import { ConvexError, v } from "convex/values"

import { type Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { requireAdmin, requireUser } from "./lib/auth"
import { assertFiniteRange, assertWholeNumberRange } from "./lib/numbers"
import { normalizeName } from "./lib/text"

const MAX_COST = 1_000_000_000
const MAX_EFFECT_LENGTH = 500
const MAX_FAMILY_LENGTH = 60
const MAX_INGREDIENTS = 50
const MAX_NAME_LENGTH = 100
const MAX_QUANTITY = 1_000_000

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const recipes = await ctx.db.query("recipes").collect()
    const withIngredients = await Promise.all(
      recipes
        .filter((recipe) => recipe.active !== false)
        .map(async (recipe) => ({
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

export const listArchived = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const recipes = await ctx.db.query("recipes").collect()
    const archived = recipes.filter((recipe) => recipe.active === false)
    const withIngredients = await Promise.all(
      archived.map(async (recipe) => ({
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

export const save = mutation({
  args: {
    cost: v.union(v.number(), v.null()),
    effect: v.string(),
    family: v.string(),
    ingredients: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
    name: v.string(),
    productId: v.union(v.id("products"), v.null()),
    recipeId: v.optional(v.id("recipes")),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx)
    const name = args.name.trim()
    const family = args.family.trim()
    const effect = args.effect.trim()
    if (!name || name.length > MAX_NAME_LENGTH) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Le nom doit contenir entre 1 et ${MAX_NAME_LENGTH} caractères.`,
      })
    }
    if (!family || family.length > MAX_FAMILY_LENGTH) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `La famille doit contenir entre 1 et ${MAX_FAMILY_LENGTH} caractères.`,
      })
    }
    if (effect.length > MAX_EFFECT_LENGTH) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "La description de l’effet est trop longue.",
      })
    }
    if (
      args.ingredients.length === 0 ||
      args.ingredients.length > MAX_INGREDIENTS
    ) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Une recette doit contenir entre 1 et ${MAX_INGREDIENTS} ingrédients.`,
      })
    }
    if (args.cost !== null) {
      assertFiniteRange(args.cost, 0, MAX_COST, "Le coût")
    }

    const existing = args.recipeId ? await ctx.db.get(args.recipeId) : undefined
    if (args.recipeId && !existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Recette introuvable.",
      })
    }
    const normalizedName = normalizeName(name)
    const recipes = await ctx.db.query("recipes").collect()
    if (
      recipes.some(
        (recipe) =>
          recipe._id !== args.recipeId &&
          normalizeName(recipe.name) === normalizedName
      )
    ) {
      throw new ConvexError({
        code: "ALREADY_EXISTS",
        message: "Une recette portant ce nom existe déjà.",
      })
    }

    let linkedProductId: Id<"products"> | undefined
    if (args.productId !== null) {
      const linkedProduct = await ctx.db.get(args.productId)
      if (!linkedProduct?.active) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Le produit fabriqué est introuvable ou indisponible.",
        })
      }
      linkedProductId = linkedProduct._id
    }

    const seenProducts = new Set<string>()
    const preparedIngredients = await Promise.all(
      args.ingredients.map(async (ingredient) => {
        assertWholeNumberRange(
          ingredient.quantity,
          1,
          MAX_QUANTITY,
          "La quantité"
        )
        if (seenProducts.has(ingredient.productId)) {
          throw new ConvexError({
            code: "INVALID_INPUT",
            message: "Un ingrédient ne peut apparaître qu’une fois.",
          })
        }
        seenProducts.add(ingredient.productId)
        const product = await ctx.db.get(ingredient.productId)
        if (!product?.active || !product.tracksStock) {
          throw new ConvexError({
            code: "NOT_FOUND",
            message: "Un ingrédient est introuvable ou indisponible.",
          })
        }
        return {
          ingredientName: product.name,
          productId: product._id,
          quantity: ingredient.quantity,
          raw: `${ingredient.quantity} ${product.name}`,
        }
      })
    )

    const details = {
      active: existing?.active ?? true,
      ...(args.cost === null ? {} : { cost: args.cost }),
      ...(effect ? { effect } : {}),
      family,
      ...(existing?.legacyKey ? { legacyKey: existing.legacyKey } : {}),
      name,
      ...(linkedProductId ? { productId: linkedProductId } : {}),
    }
    let recipeId: Id<"recipes">
    if (existing) {
      await ctx.db.replace(existing._id, details)
      recipeId = existing._id
      const oldIngredients = await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipe", (index) => index.eq("recipeId", recipeId))
        .collect()
      await Promise.all(
        oldIngredients.map((ingredient) => ctx.db.delete(ingredient._id))
      )
    } else {
      recipeId = await ctx.db.insert("recipes", details)
    }

    await Promise.all(
      preparedIngredients.map((ingredient) =>
        ctx.db.insert("recipeIngredients", { recipeId, ...ingredient })
      )
    )
    await ctx.db.insert("auditLogs", {
      action: existing ? "recipe.updated" : "recipe.created",
      actorUserId: String(user._id),
      createdAt: Date.now(),
      detail: `${name}:${preparedIngredients.length}`,
      entityId: recipeId,
      entityType: "recipe",
    })
    return recipeId
  },
})

export const setActive = mutation({
  args: {
    active: v.boolean(),
    recipeId: v.id("recipes"),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx)
    const recipe = await ctx.db.get(args.recipeId)
    if (!recipe) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Recette introuvable.",
      })
    }
    await ctx.db.patch(recipe._id, { active: args.active })
    await ctx.db.insert("auditLogs", {
      action: args.active ? "recipe.reactivated" : "recipe.archived",
      actorUserId: String(user._id),
      createdAt: Date.now(),
      detail: recipe.name,
      entityId: recipe._id,
      entityType: "recipe",
    })
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
