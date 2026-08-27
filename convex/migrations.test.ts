import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

describe("migrations.repairRecipeReferences", () => {
  it("relie les anciennes variantes aux produits canoniques", async () => {
    const backend = convexTest(schema, modules)
    const state = await backend.run(async (ctx) => {
      const outputId = await ctx.db.insert("products", {
        active: true,
        category: "potion",
        currentStock: 0,
        minimumStock: 5,
        name: "Médicinale",
        normalizedName: "medicinale",
        tracksStock: true,
      })
      await ctx.db.insert("products", {
        active: true,
        category: "ingredient",
        currentStock: 10,
        minimumStock: 5,
        name: "Ail",
        normalizedName: "ail",
        purchasePrice: 1 / 3,
        tracksStock: true,
      })
      const recipeId = await ctx.db.insert("recipes", {
        active: true,
        cost: 3,
        family: "Médicinal",
        name: "Médicinal",
      })
      await ctx.db.insert("recipeIngredients", {
        ingredientName: "ail",
        quantity: 3,
        raw: "3 ail",
        recipeId,
      })
      await ctx.db.insert("recipeIngredients", {
        ingredientName: "sucrelune",
        quantity: 1,
        raw: "1 sucrelune",
        recipeId,
      })
      return { outputId, recipeId }
    })

    const result = await backend.mutation(
      internal.migrations.repairRecipeReferences,
      {}
    )
    const second = await backend.mutation(
      internal.migrations.repairRecipeReferences,
      {}
    )
    const repaired = await backend.run(async (ctx) => ({
      ingredients: await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipe", (index) => index.eq("recipeId", state.recipeId))
        .collect(),
      products: await ctx.db.query("products").collect(),
      recipe: await ctx.db.get(state.recipeId),
    }))

    expect(result).toMatchObject({
      createdProducts: 1,
      linkedIngredients: 2,
      linkedRecipes: 1,
      repaired: true,
    })
    expect(second).toMatchObject({ repaired: false })
    expect(repaired.recipe).toMatchObject({
      family: "Médicinale",
      name: "Médicinale",
      productId: state.outputId,
    })
    expect(repaired.recipe?.cost).toBeUndefined()
    expect(
      repaired.ingredients.every((ingredient) => ingredient.productId)
    ).toBe(true)
    expect(
      repaired.products.find((product) => product.name === "Sucrelune")
    ).toMatchObject({ currentStock: 0, tracksStock: true })
  })
})

describe("migrations.reclassifyAnnexePotions", () => {
  it("reclasse les anciennes annexes en potions de façon idempotente", async () => {
    const backend = convexTest(schema, modules)
    const productId = await backend.run((ctx) =>
      ctx.db.insert("products", {
        active: true,
        category: "annexe",
        currentStock: 2,
        minimumStock: 2,
        name: "Potion trouvée",
        normalizedName: "potion trouvee",
        tracksStock: true,
      })
    )

    const result = await backend.mutation(
      internal.migrations.reclassifyAnnexePotions,
      {}
    )
    const second = await backend.mutation(
      internal.migrations.reclassifyAnnexePotions,
      {}
    )
    const product = await backend.run((ctx) => ctx.db.get(productId))

    expect(result).toMatchObject({
      reclassified: true,
      reclassifiedProducts: 1,
    })
    expect(second).toMatchObject({ reclassified: false })
    expect(product?.category).toBe("potion")
  })
})

describe("migrations.classifyPotionCraftability", () => {
  it("distingue les potions fabricables des potions trouvées uniquement", async () => {
    const backend = convexTest(schema, modules)
    const [lootOnlyId, craftableId] = await backend.run(async (ctx) => {
      const lootOnlyId = await ctx.db.insert("products", {
        active: true,
        category: "potion",
        currentStock: 1,
        legacyKey: "product:chevalier",
        minimumStock: 2,
        name: "Chevalier",
        normalizedName: "chevalier",
        tracksStock: true,
      })
      const craftableId = await ctx.db.insert("products", {
        active: true,
        category: "potion",
        currentStock: 0,
        legacyKey: "product:soin mineur",
        minimumStock: 5,
        name: "Soin Mineur",
        normalizedName: "soin mineur",
        tracksStock: true,
      })
      return [lootOnlyId, craftableId] as const
    })

    const result = await backend.mutation(
      internal.migrations.classifyPotionCraftability,
      {}
    )
    const products = await backend.run(async (ctx) => ({
      craftable: await ctx.db.get(craftableId),
      lootOnly: await ctx.db.get(lootOnlyId),
    }))

    expect(result).toMatchObject({
      classified: true,
      craftableProducts: 1,
      lootOnlyProducts: 1,
    })
    expect(products.craftable?.craftable).toBe(true)
    expect(products.lootOnly?.craftable).toBe(false)
  })
})

describe("migrations.normalizeRecipeFamilies", () => {
  it("remplace les variantes libres par les catégories canoniques", async () => {
    const backend = convexTest(schema, modules)
    const recipeIds = await backend.run(async (ctx) => [
      await ctx.db.insert("recipes", {
        family: "Resistance magie",
        name: "Résistance",
      }),
      await ctx.db.insert("recipes", {
        family: "Vigueur accru",
        name: "Vigueur",
      }),
    ])

    const result = await backend.mutation(
      internal.migrations.normalizeRecipeFamilies,
      {}
    )
    const recipes = await backend.run((ctx) =>
      Promise.all(recipeIds.map((recipeId) => ctx.db.get(recipeId)))
    )

    expect(result).toMatchObject({ normalized: true, normalizedRecipes: 2 })
    expect(recipes.map((recipe) => recipe?.family)).toEqual([
      "Résistance magique",
      "Vigueur améliorée",
    ])
  })
})

describe("migrations.indexTransactionSearch", () => {
  it("indexe les opérations historiques de façon idempotente", async () => {
    const backend = convexTest(schema, modules)
    const transactionId = await backend.run((ctx) =>
      ctx.db.insert("transactions", {
        actorName: "Éléonore",
        comment: "Livraison urgente",
        counterparty: "Maison d’Ambre",
        kind: "sale",
        occurredAt: Date.now(),
        productName: "Potion d’éclat",
        quantity: 2,
        source: "workbook",
        total: 24,
      })
    )

    const result = await backend.mutation(
      internal.migrations.indexTransactionSearch,
      {}
    )
    const second = await backend.mutation(
      internal.migrations.indexTransactionSearch,
      {}
    )
    const transaction = await backend.run((ctx) => ctx.db.get(transactionId))

    expect(result).toEqual({ indexed: true, indexedTransactions: 1 })
    expect(second).toMatchObject({ indexed: false })
    expect(transaction?.searchText).toBe(
      "potion d eclat eleonore maison d ambre livraison urgente"
    )
  })
})
