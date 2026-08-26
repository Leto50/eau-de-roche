import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CircleAlert, Pencil, Search, SlidersHorizontal } from "lucide-react"
import { useState } from "react"

import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/page-skeleton"
import {
  ProductArchivesDialog,
  ProductDialog,
} from "@/components/product-dialog"
import { RecipeDialog } from "@/components/recipe-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "../../../convex/_generated/api"
import { type Doc, type Id } from "../../../convex/_generated/dataModel"
import { useHydrated } from "@/hooks/use-hydrated"
import { categoryLabels, formatNumber, formatUnitPrice } from "@/lib/format"
import {
  canonicalProductCategory,
  type ProductCategory,
} from "@/lib/product-categories"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type CategoryFilter = "all" | ProductCategory

const categoryFilters: readonly {
  label: string
  value: CategoryFilter
}[] = [
  { label: "Tout", value: "all" },
  { label: "Potions", value: "potion" },
  { label: "Ingrédients", value: "ingredient" },
  { label: "Services", value: "service" },
]

function isCategoryFilter(value: string): value is CategoryFilter {
  return categoryFilters.some((filter) => filter.value === value)
}

export const Route = createFileRoute("/_app/inventaire")({
  component: InventoryPage,
  errorComponent: PageError,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.products.list, {})),
      context.queryClient.ensureQueryData(
        convexQuery(api.recipes.listLinkedProductIds, {})
      ),
    ])
  },
  pendingComponent: PageSkeleton,
})

function InventoryPage() {
  const { data: session } = authClient.useSession()
  const isHydrated = useHydrated()
  const { data: products } = useSuspenseQuery(
    convexQuery(api.products.list, {})
  )
  const { data: linkedProductIds } = useSuspenseQuery(
    convexQuery(api.recipes.listLinkedProductIds, {})
  )
  const isAdmin =
    isHydrated && (session?.user.role?.split(",").includes("admin") ?? false)
  const [category, setCategory] = useState<CategoryFilter>("all")
  const [search, setSearch] = useState("")
  const [recipeProductId, setRecipeProductId] = useState<string>()
  const recipeProduct = products.find(
    (product) => product._id === recipeProductId
  )
  const linkedProducts = new Set(linkedProductIds)
  const normalizedSearch = search.trim().toLocaleLowerCase("fr")
  const filteredProducts = products.filter(
    (product) =>
      (category === "all" ||
        canonicalProductCategory(product.category) === category) &&
      (!normalizedSearch ||
        product.name.toLocaleLowerCase("fr").includes(normalizedSearch))
  )

  function handleCategoryChange(value: string) {
    if (isCategoryFilter(value)) setCategory(value)
  }

  return (
    <div className="animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <PageHeader
        action={
          isAdmin ? (
            <div className="flex flex-wrap justify-end gap-2">
              <ProductArchivesDialog />
              <ProductDialog onWriteRecipe={setRecipeProductId} />
            </div>
          ) : undefined
        }
        eyebrow="Gestion des stocks"
        title="Inventaire"
      >
        Les produits, ingrédients et services disponibles dans la boutique.
      </PageHeader>

      <section
        aria-label="Filtres de l'inventaire"
        className="mt-6 flex flex-col gap-3 border-y border-border/70 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Rechercher un produit"
            className="h-9 bg-background/50 pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un produit…"
            type="search"
            value={search}
          />
        </div>
        <Tabs onValueChange={handleCategoryChange} value={category}>
          <TabsList
            aria-label="Catégories de l'inventaire"
            className="h-auto flex-wrap justify-start bg-[#6e5330]/8"
          >
            <SlidersHorizontal
              aria-hidden="true"
              className="mx-1 size-4 shrink-0 text-muted-foreground"
            />
            {categoryFilters.map((filter) => (
              <TabsTrigger
                className="min-h-7 px-2.5 data-active:bg-primary data-active:text-primary-foreground"
                key={filter.value}
                value={filter.value}
              >
                {filter.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </section>

      <p className="mt-4 text-xs text-muted-foreground">
        {filteredProducts.length}{" "}
        {filteredProducts.length === 1 ? "référence" : "références"} sur{" "}
        {products.length}
      </p>

      {filteredProducts.length > 0 ? (
        <Card className="mt-4 rounded-none border-x-0 border-y border-t-2 border-[#5b462b]/35 bg-transparent py-0 ring-0 max-md:border-0">
          <CardContent className="px-0">
            <Table className="max-md:block">
              <TableHeader className="max-md:hidden">
                <TableRow className="border-b-[#5b462b]/50 bg-[#684f2d]/10 hover:bg-[#684f2d]/10">
                  <TableHead className="pl-4">Référence</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Seuil</TableHead>
                  <TableHead className="text-right">Prix</TableHead>
                  <TableHead className="pr-4 text-right">État</TableHead>
                  {isAdmin ? (
                    <TableHead className="w-10">
                      <span className="sr-only">Modifier</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody className="max-md:grid max-md:gap-3">
                {filteredProducts.map((product) => (
                  <InventoryRow
                    hasRecipe={linkedProducts.has(product._id)}
                    isAdmin={isAdmin}
                    key={product._id}
                    onWriteRecipe={setRecipeProductId}
                    product={product}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Alert className="mt-4 border-[#6a4f2e]/30 bg-card/35">
          <Search aria-hidden="true" />
          <AlertTitle>Aucun produit trouvé</AlertTitle>
          <AlertDescription>
            Modifiez la recherche ou choisissez une autre catégorie.
          </AlertDescription>
        </Alert>
      )}
      {recipeProduct ? (
        <RecipeDialog
          initialProduct={recipeProduct}
          linkedProductIds={linkedProductIds}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setRecipeProductId(undefined)
          }}
          open
          products={products}
          trigger={null}
        />
      ) : null}
    </div>
  )
}

function ProductState({ product }: Readonly<{ product: Doc<"products"> }>) {
  if (!product.tracksStock) {
    return (
      <Badge
        className="border-[#6b553a]/25 bg-[#6b553a]/[0.08] text-[#6b553a]"
        variant="outline"
      >
        Sur demande
      </Badge>
    )
  }

  const low = product.currentStock <= product.minimumStock

  return (
    <Badge
      className={cn(
        low
          ? "border-[#8a3f2f]/30 bg-[#8a3f2f]/[0.08] text-[#8a3f2f]"
          : "border-[#415741]/25 bg-[#415741]/[0.08] text-[#405541]"
      )}
      variant="outline"
    >
      {low ? <CircleAlert aria-hidden="true" /> : null}
      {low ? "Bas" : "Suffisant"}
    </Badge>
  )
}

function productPrice(product: Doc<"products">): string {
  const price = product.salePrice ?? product.purchasePrice
  return price === undefined ? "—" : formatUnitPrice(price)
}

function InventoryRow({
  hasRecipe,
  isAdmin,
  onWriteRecipe,
  product,
}: Readonly<{
  hasRecipe: boolean
  isAdmin: boolean
  onWriteRecipe: (productId: Id<"products">) => void
  product: Doc<"products">
}>) {
  const canWriteRecipe =
    canonicalProductCategory(product.category) === "potion" &&
    product.craftable !== false &&
    !hasRecipe

  return (
    <TableRow className="border-[#5b462b]/20 hover:bg-[#fffdeb]/40 max-md:relative max-md:grid max-md:grid-cols-3 max-md:gap-x-3 max-md:gap-y-1 max-md:border max-md:border-[#5b462b]/35 max-md:bg-[#fff8e7]/30 max-md:p-4 max-md:shadow-[2px_3px_0_rgba(84,63,37,0.05)]">
      <TableCell className="max-w-80 truncate pl-4 font-semibold max-md:col-span-2 max-md:col-start-1 max-md:row-start-1 max-md:max-w-none max-md:p-0 max-md:font-display max-md:text-base">
        {product.name}
      </TableCell>
      <TableCell className="text-muted-foreground max-md:col-span-2 max-md:col-start-1 max-md:row-start-2 max-md:flex max-md:items-center max-md:gap-2 max-md:p-0">
        <span className="max-md:hidden">
          {categoryLabels[product.category]}
        </span>
        <Badge className="w-fit md:hidden" variant="secondary">
          {categoryLabels[product.category]}
        </Badge>
        {isAdmin && canWriteRecipe ? (
          <Button
            className="h-auto px-1 text-xs"
            onClick={() => onWriteRecipe(product._id)}
            size="sm"
            type="button"
            variant="link"
          >
            Écrire la recette
          </Button>
        ) : null}
      </TableCell>
      <TableCell className="text-right font-display text-base max-md:col-start-1 max-md:row-start-3 max-md:mt-3 max-md:p-0 max-md:text-left max-md:text-lg">
        <span className="mb-1 block font-sans text-xs text-muted-foreground md:hidden">
          Stock
        </span>
        {product.tracksStock ? formatNumber(product.currentStock) : "—"}
      </TableCell>
      <TableCell className="text-right text-muted-foreground max-md:col-start-2 max-md:row-start-3 max-md:mt-3 max-md:p-0 max-md:text-left max-md:font-display max-md:text-lg max-md:text-foreground">
        <span className="mb-1 block font-sans text-xs text-muted-foreground md:hidden">
          Seuil
        </span>
        {product.tracksStock ? formatNumber(product.minimumStock) : "—"}
      </TableCell>
      <TableCell className="text-right max-md:col-start-3 max-md:row-start-3 max-md:mt-3 max-md:p-0 max-md:text-left max-md:font-semibold">
        <span className="mb-1 block text-xs font-normal text-muted-foreground md:hidden">
          Prix
        </span>
        {productPrice(product)}
      </TableCell>
      <TableCell className="pr-4 text-right max-md:col-start-3 max-md:row-start-1 max-md:p-0 max-md:pr-9">
        <ProductState product={product} />
      </TableCell>
      {isAdmin ? (
        <TableCell className="max-md:absolute max-md:top-2.5 max-md:right-2 max-md:p-0">
          <ProductDialog
            canWriteRecipe={canWriteRecipe}
            onWriteRecipe={onWriteRecipe}
            product={product}
            trigger={
              <Button
                aria-label={`Modifier ${product.name}`}
                size="icon"
                variant="ghost"
              >
                <Pencil aria-hidden="true" />
              </Button>
            }
          />
        </TableCell>
      ) : null}
    </TableRow>
  )
}
