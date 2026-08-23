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
      cost: 1 / 4,
      effect: "Aide à tenir pendant une longue garde.",
      family: "Fortifiants",
      ingredients: [{ productId: ingredientId, quantity: 2 }],
      name: "Élixir du veilleur",
      productId: outputId,
    })
    await admin.mutation(api.recipes.save, {
      cost: 1 / 2,
      effect: "Soutient l’effort prolongé.",
      family: "Fortifiants",
      ingredients: [{ productId: ingredientId, quantity: 3 }],
      name: "Élixir du veilleur renforcé",
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
      cost: 1 / 2,
      name: "Élixir du veilleur renforcé",
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
    const { ingredientId } = await seedRecipeProducts(backend)

    await expect(
      admin.mutation(api.recipes.save, {
        cost: null,
        effect: "",
        family: "Essais",
        ingredients: [{ productId: ingredientId, quantity: 1.5 }],
        name: "Préparation incomplète",
        productId: null,
      })
    ).rejects.toThrowError("nombre entier")
  })

  it("réserve la gestion des recettes aux administrateurs", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const { ingredientId } = await seedRecipeProducts(backend)

    await expect(
      employee.mutation(api.recipes.save, {
        cost: null,
        effect: "",
        family: "Essais",
        ingredients: [{ productId: ingredientId, quantity: 1 }],
        name: "Préparation réservée",
        productId: null,
      })
    ).rejects.toThrowError("réservée aux administrateurs")
  })
})
