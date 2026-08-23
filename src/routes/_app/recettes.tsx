import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { type FunctionReturnType } from "convex/server"
import { BookMarked, PackageOpen, Pencil, Search, Sparkles } from "lucide-react"
import { useState } from "react"

import { BundleArchivesDialog, BundleDialog } from "@/components/bundle-dialog"
import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/page-skeleton"
import { RecipeArchivesDialog, RecipeDialog } from "@/components/recipe-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { api } from "../../../convex/_generated/api"
import { type Doc } from "../../../convex/_generated/dataModel"
import { useHydrated } from "@/hooks/use-hydrated"
import { authClient } from "@/lib/auth-client"
import { formatNumber, formatSeptims } from "@/lib/format"

type Recipe = FunctionReturnType<typeof api.recipes.list>[number]
type Bundle = FunctionReturnType<typeof api.recipes.listBundles>[number]

export const Route = createFileRoute("/_app/recettes")({
  component: RecipesPage,
  errorComponent: PageError,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.recipes.list, {})),
      context.queryClient.ensureQueryData(
        convexQuery(api.recipes.listBundles, {})
      ),
      context.queryClient.ensureQueryData(
        convexQuery(api.products.selectable, {})
      ),
    ])
  },
  pendingComponent: PageSkeleton,
})

function RecipesPage() {
  const { data: session } = authClient.useSession()
  const isHydrated = useHydrated()
  const { data: recipes } = useSuspenseQuery(convexQuery(api.recipes.list, {}))
  const { data: bundles } = useSuspenseQuery(
    convexQuery(api.recipes.listBundles, {})
  )
  const { data: products } = useSuspenseQuery(
    convexQuery(api.products.selectable, {})
  )
  const isAdmin =
    isHydrated && (session?.user.role?.split(",").includes("admin") ?? false)
  const [search, setSearch] = useState("")
  const [family, setFamily] = useState("all")
  const families = [...new Set(recipes.map((recipe) => recipe.family))].sort(
    (left, right) => left.localeCompare(right, "fr")
  )
  const normalizedSearch = search.trim().toLocaleLowerCase("fr")
  const visibleRecipes = recipes.filter(
    (recipe) =>
      (family === "all" || recipe.family === family) &&
      (!normalizedSearch ||
        recipe.name.toLocaleLowerCase("fr").includes(normalizedSearch) ||
        recipe.effect?.toLocaleLowerCase("fr").includes(normalizedSearch))
  )

  return (
    <div className="animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <PageHeader eyebrow="Production" title="Recettes & lots">
        Les ingrédients nécessaires aux recettes et les lots vendus en boutique.
      </PageHeader>

      <div className="mt-7 grid gap-3 border-y border-border/70 py-3 sm:grid-cols-[1fr_14rem]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Rechercher une recette"
            className="h-9 bg-background/50 pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Effet, potion ou ingrédient…"
            type="search"
            value={search}
          />
        </div>
        <Select onValueChange={setFamily} value={family}>
          <SelectTrigger
            aria-label="Famille de recettes"
            className="w-full bg-background/50"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les familles</SelectItem>
            {families.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {entry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <section aria-labelledby="recipes-title" className="mt-7">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
              {visibleRecipes.length} recettes
            </p>
            <h2
              className="mt-1 font-display text-xl font-[580] text-[#3b2f22]"
              id="recipes-title"
            >
              Recettes
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <RecipeArchivesDialog />
                <RecipeDialog products={products} />
              </>
            ) : null}
            <BookMarked aria-hidden="true" className="size-5 text-primary" />
          </div>
        </div>
        {visibleRecipes.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
            {visibleRecipes.map((recipe) => (
              <RecipeEntry
                isAdmin={isAdmin}
                key={recipe._id}
                products={products}
                recipe={recipe}
              />
            ))}
          </div>
        ) : (
          <Alert className="border-[#6a4f2e]/30 bg-card/35">
            <Search aria-hidden="true" />
            <AlertTitle>Aucune recette trouvée</AlertTitle>
            <AlertDescription>
              Modifiez la recherche ou choisissez une autre famille.
            </AlertDescription>
          </Alert>
        )}
      </section>

      <Separator className="mt-12 bg-border" />
      <section aria-labelledby="bundles-title" className="pt-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
              Vente groupée
            </p>
            <h2
              className="mt-1 font-display text-xl font-[580] text-[#3b2f22]"
              id="bundles-title"
            >
              Lots préparés
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <BundleArchivesDialog />
                <BundleDialog products={products} />
              </>
            ) : null}
            <PackageOpen aria-hidden="true" className="size-5 text-primary" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
          {bundles.map((bundle) => (
            <BundleEntry
              bundle={bundle}
              isAdmin={isAdmin}
              key={bundle._id}
              products={products}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function RecipeEntry({
  isAdmin,
  products,
  recipe,
}: Readonly<{
  isAdmin: boolean
  products: readonly Doc<"products">[]
  recipe: Recipe
}>) {
  return (
    <Card className="min-h-48 gap-0 rounded-none border-[#5b462b]/30 border-t-[#684f2d]/60 bg-linear-to-br from-[#fffbed]/60 to-[#e3d3b3]/20 py-0 ring-0">
      <CardHeader className="p-4 pb-0">
        <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-primary uppercase">
          {recipe.family}
        </p>
        <CardTitle className="font-display text-lg font-medium">
          {recipe.name}
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-sm font-semibold">
          {recipe.cost !== undefined ? formatSeptims(recipe.cost) : null}
          {isAdmin ? (
            <RecipeDialog
              products={products}
              recipe={recipe}
              trigger={
                <Button
                  aria-label={`Modifier ${recipe.name}`}
                  size="icon"
                  variant="ghost"
                >
                  <Pencil aria-hidden="true" />
                </Button>
              }
            />
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        {recipe.effect ? (
          <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground italic">
            <Sparkles
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-primary"
            />
            {recipe.effect}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {recipe.ingredients.map((ingredient) => (
            <Badge
              className="border-[#614b2c]/20 bg-[#6b5939]/[0.07] text-[#5a4b37]"
              key={ingredient._id}
              variant="outline"
            >
              <strong>{formatNumber(ingredient.quantity)}</strong>{" "}
              {ingredient.ingredientName}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function BundleEntry({
  bundle,
  isAdmin,
  products,
}: Readonly<{
  bundle: Bundle
  isAdmin: boolean
  products: readonly Doc<"products">[]
}>) {
  return (
    <Card className="gap-0 rounded-none border-0 border-l-2 border-l-[#755832]/55 bg-[#795f38]/5 py-0 ring-0">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="font-display text-base font-medium">
          {bundle.name}
        </CardTitle>
        <CardAction className="flex items-center gap-1 font-semibold text-primary">
          <span>
            {bundle.price === undefined ? "—" : formatSeptims(bundle.price)}
          </span>
          {isAdmin ? (
            <BundleDialog
              bundle={bundle}
              products={products}
              trigger={
                <Button
                  aria-label={`Modifier ${bundle.name}`}
                  size="icon"
                  variant="ghost"
                >
                  <Pencil aria-hidden="true" />
                </Button>
              }
            />
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        <ul className="grid gap-1 text-xs text-muted-foreground">
          {bundle.items.map((item) => (
            <li className="flex justify-between gap-3" key={item._id}>
              <span>{item.productName}</span>
              <strong className="text-foreground">
                × {formatNumber(item.quantity)}
              </strong>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
