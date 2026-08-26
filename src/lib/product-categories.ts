import { type Doc } from "../../convex/_generated/dataModel"

export type ProductCategory = Exclude<Doc<"products">["category"], "annexe">

export const productCategories: readonly ProductCategory[] = [
  "potion",
  "ingredient",
  "service",
]

export function canonicalProductCategory(
  category: Doc<"products">["category"]
): ProductCategory {
  return category === "annexe" ? "potion" : category
}
