import { useMutation } from "convex/react"
import { Leaf, LoaderCircle, Pencil, Search, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ProductDialog } from "@/components/product-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { getUserFacingErrorMessage } from "@/lib/errors"
import { formatNumber, formatUnitPrice } from "@/lib/format"
import { api } from "../../convex/_generated/api"
import { type Doc } from "../../convex/_generated/dataModel"

export function IngredientManagerSheet({
  products,
}: Readonly<{ products: readonly Doc<"products">[] }>) {
  const removeIngredient = useMutation(api.products.removeIngredient)
  const [search, setSearch] = useState("")
  const [deletingId, setDeletingId] = useState<string>()
  const ingredients = useMemo(
    () => products.filter((product) => product.category === "ingredient"),
    [products]
  )
  const visibleIngredients = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("fr")
    if (!normalizedSearch) return ingredients
    return ingredients.filter((ingredient) =>
      ingredient.name.toLocaleLowerCase("fr").includes(normalizedSearch)
    )
  }, [ingredients, search])

  async function deleteIngredient(ingredient: Doc<"products">) {
    setDeletingId(ingredient._id)
    try {
      await removeIngredient({ productId: ingredient._id })
      toast.success(`« ${ingredient.name} » a été supprimé.`)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(
          error,
          "Impossible de supprimer cet ingrédient."
        )
      )
    } finally {
      setDeletingId(undefined)
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Leaf aria-hidden="true" />
          Gérer les ingrédients
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full! border-[#6a5436] bg-[#eee1c7] sm:max-w-2xl!">
        <SheetHeader className="border-b border-border/70 pr-12">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Réserve de fabrication
          </p>
          <SheetTitle className="font-display text-2xl font-medium">
            Ingrédients
          </SheetTitle>
          <SheetDescription>
            Créez, modifiez ou supprimez les ingrédients utilisés dans les
            recettes.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 border-b border-border/70 px-6 py-4 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Rechercher un ingrédient"
              className="bg-background/45 pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un ingrédient…"
              type="search"
              value={search}
            />
          </div>
          <ProductDialog fixedCategory="ingredient" showArchive={false} />
        </div>

        <ScrollArea className="min-h-0 flex-1 px-6">
          <div className="py-4">
            <p className="mb-2 text-[0.66rem] font-bold tracking-[0.16em] text-primary uppercase">
              {visibleIngredients.length}{" "}
              {visibleIngredients.length === 1 ? "ingrédient" : "ingrédients"}
            </p>
            {visibleIngredients.length === 0 ? (
              <Alert className="border-primary/20 bg-primary/[0.04]">
                <Search aria-hidden="true" />
                <AlertTitle>Aucun ingrédient trouvé</AlertTitle>
                <AlertDescription>
                  Modifiez la recherche ou créez un nouvel ingrédient.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="divide-y divide-border/70 border-y border-border/70">
                {visibleIngredients.map((ingredient) => {
                  const lowStock =
                    ingredient.currentStock <= ingredient.minimumStock
                  return (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
                      key={ingredient._id}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-semibold">
                            {ingredient.name}
                          </p>
                          {lowStock ? (
                            <Badge variant="destructive">Stock bas</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {formatNumber(ingredient.currentStock)} en stock
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {ingredient.purchasePrice === undefined
                              ? "Prix d’achat non renseigné"
                              : formatUnitPrice(ingredient.purchasePrice)}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <ProductDialog
                          fixedCategory="ingredient"
                          product={ingredient}
                          showArchive={false}
                          trigger={
                            <Button
                              aria-label={`Modifier ${ingredient.name}`}
                              size="icon"
                              variant="ghost"
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                          }
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              aria-label={`Supprimer ${ingredient.name}`}
                              disabled={deletingId !== undefined}
                              size="icon"
                              variant="ghost"
                            >
                              {deletingId === ingredient._id ? (
                                <LoaderCircle
                                  aria-hidden="true"
                                  className="animate-spin motion-reduce:animate-none"
                                />
                              ) : (
                                <Trash2 aria-hidden="true" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7]">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Supprimer « {ingredient.name} » ?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Cette suppression est définitive. Elle sera
                                refusée si l’ingrédient est encore utilisé par
                                une recette, un lot, une commande ou une
                                opération.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Conserver</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  void deleteIngredient(ingredient)
                                }}
                                variant="destructive"
                              >
                                Supprimer l’ingrédient
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
