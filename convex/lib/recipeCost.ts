import { type Doc } from "../_generated/dataModel"

type CostProduct = Pick<Doc<"products">, "_id" | "name" | "purchasePrice">
type CostIngredient = Pick<
  Doc<"recipeIngredients">,
  "ingredientName" | "productId" | "quantity"
>

export interface RecipeCost {
  cost?: number
  missingReferences: string[]
}

export function calculateRecipeCost(
  ingredients: readonly CostIngredient[],
  productsById: ReadonlyMap<string, CostProduct>
): RecipeCost {
  const missingReferences = new Set<string>()
  let cost = 0

  for (const ingredient of ingredients) {
    const product = ingredient.productId
      ? productsById.get(ingredient.productId)
      : undefined
    if (product?.purchasePrice === undefined) {
      missingReferences.add(product?.name ?? ingredient.ingredientName)
      continue
    }
    cost += ingredient.quantity * product.purchasePrice
  }

  return {
    ...(missingReferences.size === 0 ? { cost } : {}),
    missingReferences: [...missingReferences].sort((left, right) =>
      left.localeCompare(right, "fr")
    ),
  }
}
