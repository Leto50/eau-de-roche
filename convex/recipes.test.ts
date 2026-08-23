import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import { asAuthenticatedUser, createTestBackend } from "./test.helpers"

async function seedRecipeProducts(
  backend: ReturnType<typeof createTestBackend>
) {
  return backend.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("products", {
      active: true,
      category: "ingredient",
      currentStock: 20,
      minimumStock: 2,
      name: "Poudre minérale",
      normalizedName: "poudre minerale",
      purchasePrice: 1.25,
      tracksStock: true,
    })
    const outputId = await ctx.db.insert("products", {
      active: true,
      category: "potion",
      currentStock: 4,
      minimumStock: 1,
      name: "Élixir du veilleur",
      normalizedName: "elixir du veilleur",
      tracksStock: true,
    })
    return { ingredientId, outputId }
  })
}

describe("recipes", () => {
  it("crée, modifie et archive une recette avec ses ingrédients", async () => {
    const backend = createTestBackend()
    const admin = await asAuthenticatedUser(backend, "admin")
    const { ingredientId, outputId } = await seedRecipeProducts(backend)

    const recipeId = await admin.mutation(api.recipes.save, {
      effect: "Aide à tenir pendant une longue garde.",
      family: "Fortifiants",
      ingredients: [{ productId: ingredientId, quantity: 2 }],
      productId: outputId,
    })
    await admin.mutation(api.recipes.save, {
      effect: "Soutient l’effort prolongé.",
      family: "Fortifiants",
      ingredients: [{ productId: ingredientId, quantity: 3 }],
      productId: outputId,
      recipeId,
    })
    await admin.mutation(api.recipes.setActive, {
      active: false,
      recipeId,
    })

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      ingredients: await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipe", (index) => index.eq("recipeId", recipeId))
        .collect(),
      recipe: await ctx.db.get(recipeId),
    }))
    expect(state.recipe).toMatchObject({
      active: false,
      cost: 3.75,
      name: "Élixir du veilleur",
    })
    expect(state.ingredients).toHaveLength(1)
    expect(state.ingredients[0]).toMatchObject({
      ingredientName: "Poudre minérale",
      quantity: 3,
    })
    expect(state.audits.map((audit) => audit.action)).toEqual([
      "recipe.created",
      "recipe.updated",
      "recipe.archived",
    ])
  })

  it("refuse les quantités d’ingrédients fractionnaires", async () => {
    const backend = createTestBackend()
    const admin = await asAuthenticatedUser(backend, "admin")
    const { ingredientId, outputId } = await seedRecipeProducts(backend)

    await expect(
      admin.mutation(api.recipes.save, {
        effect: "",
        family: "Essais",
        ingredients: [{ productId: ingredientId, quantity: 1.5 }],
        productId: outputId,
      })
    ).rejects.toThrowError("nombre entier")
  })

  it("réserve la gestion des recettes aux administrateurs", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const { ingredientId, outputId } = await seedRecipeProducts(backend)

    await expect(
      employee.mutation(api.recipes.save, {
        effect: "",
        family: "Essais",
        ingredients: [{ productId: ingredientId, quantity: 1 }],
        productId: outputId,
      })
    ).rejects.toThrowError("réservée aux administrateurs")
  })

  it("calcule le coût courant et interdit deux recettes pour le même article", async () => {
    const backend = createTestBackend()
    const admin = await asAuthenticatedUser(backend, "admin")
    const { ingredientId, outputId } = await seedRecipeProducts(backend)

    await admin.mutation(api.recipes.save, {
      effect: "",
      family: "Fortifiants",
      ingredients: [{ productId: ingredientId, quantity: 2 }],
      productId: outputId,
    })
    await backend.run((ctx) => ctx.db.patch(ingredientId, { purchasePrice: 2 }))

    const recipes = await admin.query(api.recipes.list, {})
    expect(recipes[0]).toMatchObject({
      cost: 4,
      name: "Élixir du veilleur",
      productId: outputId,
    })
    await expect(
      admin.mutation(api.recipes.save, {
        effect: "",
        family: "Doublon",
        ingredients: [{ productId: ingredientId, quantity: 1 }],
        productId: outputId,
      })
    ).rejects.toThrowError("existe déjà")
  })
})
