import { type Doc } from "../_generated/dataModel"

export type ProductCategory = Exclude<Doc<"products">["category"], "annexe">

export function canonicalProductCategory(
  category: Doc<"products">["category"]
): ProductCategory {
  return category === "annexe" ? "potion" : category
}
