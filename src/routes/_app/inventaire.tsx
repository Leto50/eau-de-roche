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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "../../../convex/_generated/api"
import { type Doc } from "../../../convex/_generated/dataModel"
import { useHydrated } from "@/hooks/use-hydrated"
import { categoryLabels, formatNumber, formatSeptims } from "@/lib/format"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type CategoryFilter = "all" | Doc<"products">["category"]

const categoryFilters: readonly {
  label: string
  value: CategoryFilter
}[] = [
  { label: "Tout", value: "all" },
  { label: "Potions", value: "potion" },
  { label: "Ingrédients", value: "ingredient" },
  { label: "Annexes", value: "annexe" },
  { label: "Services", value: "service" },
]

function isCategoryFilter(value: string): value is CategoryFilter {
  return categoryFilters.some((filter) => filter.value === value)
}

export const Route = createFileRoute("/_app/inventaire")({
  component: InventoryPage,
  errorComponent: PageError,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.products.list, {})
    )
  },
  pendingComponent: PageSkeleton,
})

function InventoryPage() {
  const { data: session } = authClient.useSession()
  const isHydrated = useHydrated()
  const { data: products } = useSuspenseQuery(
    convexQuery(api.products.list, {})
  )
  const isAdmin =
    isHydrated && (session?.user.role?.split(",").includes("admin") ?? false)
  const [category, setCategory] = useState<CategoryFilter>("all")
  const [search, setSearch] = useState("")
  const normalizedSearch = search.trim().toLocaleLowerCase("fr")
  const filteredProducts = products.filter(
    (product) =>
      (category === "all" || product.category === category) &&
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
              <ProductDialog />
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
        <>
          <Card className="mt-4 hidden rounded-none border-x-0 border-y border-t-2 border-[#5b462b]/35 bg-transparent py-0 ring-0 md:flex">
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-[#5b462b]/50 bg-[#684f2d]/10 hover:bg-[#684f2d]/10">
                    <TableHead className="pl-4">Référence</TableHead>
                    <TableHead>Famille</TableHead>
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
                <TableBody>
                  {filteredProducts.map((product) => (
                    <InventoryRow
                      isAdmin={isAdmin}
                      key={product._id}
                      product={product}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-3 md:hidden">
            {filteredProducts.map((product) => (
              <InventoryCard
                isAdmin={isAdmin}
                key={product._id}
                product={product}
              />
            ))}
          </div>
        </>
      ) : (
        <Alert className="mt-4 border-[#6a4f2e]/30 bg-card/35">
          <Search aria-hidden="true" />
          <AlertTitle>Aucun produit trouvé</AlertTitle>
          <AlertDescription>
            Modifiez la recherche ou choisissez une autre catégorie.
          </AlertDescription>
        </Alert>
      )}
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
  return price === undefined ? "—" : formatSeptims(price)
}

function InventoryRow({
  isAdmin,
  product,
}: Readonly<{ isAdmin: boolean; product: Doc<"products"> }>) {
  return (
    <TableRow className="border-[#5b462b]/20 hover:bg-[#fffdeb]/40">
      <TableCell className="max-w-80 truncate pl-4 font-semibold">
        {product.name}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {categoryLabels[product.category]}
      </TableCell>
      <TableCell className="text-right font-display text-base">
        {product.tracksStock ? formatNumber(product.currentStock) : "—"}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {product.tracksStock ? formatNumber(product.minimumStock) : "—"}
      </TableCell>
      <TableCell className="text-right">{productPrice(product)}</TableCell>
      <TableCell className="pr-4 text-right">
        <ProductState product={product} />
      </TableCell>
      {isAdmin ? (
        <TableCell>
          <ProductDialog
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

function InventoryCard({
  isAdmin,
  product,
}: Readonly<{ isAdmin: boolean; product: Doc<"products"> }>) {
  return (
    <Card className="rounded-none border-[#5b462b]/35 bg-[#fff8e7]/30 shadow-[2px_3px_0_rgba(84,63,37,0.05)] ring-0">
      <CardHeader>
        <CardTitle className="font-display text-base">{product.name}</CardTitle>
        <Badge className="w-fit" variant="secondary">
          {categoryLabels[product.category]}
        </Badge>
        <CardAction>
          <div className="flex items-center gap-1">
            <ProductState product={product} />
            {isAdmin ? (
              <ProductDialog
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
            ) : null}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Stock</dt>
            <dd className="mt-1 font-display text-lg">
              {product.tracksStock ? formatNumber(product.currentStock) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Seuil</dt>
            <dd className="mt-1 font-display text-lg">
              {product.tracksStock ? formatNumber(product.minimumStock) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Prix</dt>
            <dd className="mt-1 font-semibold">{productPrice(product)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
