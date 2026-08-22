import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Hammer,
  PackageOpen,
  ReceiptText,
  ScrollText,
  ShoppingBasket,
} from "lucide-react"

import { OperationDialog } from "@/components/operation-dialog"
import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/page-skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "../../../convex/_generated/api"
import {
  formatDate,
  formatNumber,
  formatQuantity,
  formatSeptims,
  operationLabels,
} from "@/lib/format"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
  errorComponent: PageError,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.dashboard.overview, {})
      ),
      context.queryClient.ensureQueryData(
        convexQuery(api.products.selectable, {})
      ),
      context.queryClient.ensureQueryData(convexQuery(api.characters.list, {})),
    ])
  },
  pendingComponent: PageSkeleton,
})

function DashboardPage() {
  const { data } = useSuspenseQuery(convexQuery(api.dashboard.overview, {}))
  const { data: products } = useSuspenseQuery(
    convexQuery(api.products.selectable, {})
  )
  const { data: characters } = useSuspenseQuery(
    convexQuery(api.characters.list, {})
  )

  return (
    <div className="animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <PageHeader
        action={
          <OperationDialog
            characters={characters}
            products={products}
            trigger={
              <Button className="shadow-sm" size="lg">
                <ShoppingBasket aria-hidden="true" />
                Encaisser une vente
              </Button>
            }
          />
        }
        eyebrow="La boutique aujourd’hui"
        title="À faire aujourd’hui"
      >
        Les priorités du jour et les actions utiles, sans passer par le journal.
      </PageHeader>

      <Card className="mt-6 rounded-none border-x-0 border-y border-[#5b462b]/40 bg-[#fff8e7]/25 py-0 ring-0">
        <CardContent className="flex flex-col gap-3 px-0 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[0.66rem] font-bold tracking-[0.18em] text-primary uppercase">
              Actions rapides
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Qu’est-ce qui vient de se passer ?
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <OperationDialog
              characters={characters}
              initialKind="purchase"
              products={products}
              trigger={
                <Button variant="outline">
                  <ArrowDownToLine aria-hidden="true" />
                  Réceptionner un achat
                </Button>
              }
            />
            <OperationDialog
              characters={characters}
              initialKind="production"
              products={products}
              trigger={
                <Button variant="outline">
                  <Hammer aria-hidden="true" />
                  Ajouter une production
                </Button>
              }
            />
            <OperationDialog
              characters={characters}
              initialKind="service"
              products={products}
              trigger={
                <Button variant="outline">
                  <ReceiptText aria-hidden="true" />
                  Facturer un service
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>

      <section
        aria-label="Indicateurs de la boutique"
        className="mt-6 grid grid-cols-4 border-y border-[#5b462b]/50 max-xl:grid-cols-2 max-md:grid-cols-1"
      >
        <Metric
          detail="stocks au seuil ou épuisés"
          icon={AlertTriangle}
          label="À réapprovisionner"
          tone={data.lowStock.length > 0 ? "warning" : "normal"}
          value={formatNumber(data.lowStock.length)}
        />
        <Metric
          detail="commandes clients et fournisseurs"
          icon={ScrollText}
          label="À préparer"
          value={formatNumber(data.openOrders)}
        />
        <Metric
          detail="mouvements enregistrés"
          icon={ReceiptText}
          label="Cette semaine"
          value={formatNumber(data.weeklyTransactionCount)}
        />
        <Metric
          detail="ventes, services et achats"
          icon={Coins}
          label="Solde de la semaine"
          tone={data.weeklyBalance < 0 ? "warning" : "normal"}
          value={formatSeptims(data.weeklyBalance)}
        />
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.45fr_0.75fr]">
        <Card className="rounded-none border-[#644c2c]/35 bg-[#f9f0db]/45 py-0 shadow-[inset_0_0_24px_rgba(107,79,40,0.03)] ring-0">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="font-display text-xl font-[580] text-[#3b2f22]">
              Dernière activité
            </CardTitle>
            <CardDescription>Ce qui vient d’être enregistré</CardDescription>
            <CardAction>
              <Badge
                className={cn(
                  "font-semibold",
                  data.weeklyBalance >= 0
                    ? "border-[#456044]/30 text-[#456044]"
                    : "border-[#8a3e2f]/30 text-[#8a3e2f]"
                )}
                variant="outline"
              >
                {data.weeklyBalance >= 0 ? "+" : ""}
                {formatSeptims(data.weeklyBalance)} cette semaine
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#684f2d]/8 hover:bg-[#684f2d]/8">
                  <TableHead>Référence</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Personnage
                  </TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentTransactions.map((transaction) => {
                  const positive = transaction.total >= 0
                  const DirectionIcon = positive ? ArrowUpRight : ArrowDownLeft

                  return (
                    <TableRow key={transaction._id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              "grid size-8 shrink-0 place-items-center rounded-full border border-current [&_svg]:size-3.5",
                              positive
                                ? "bg-[#4d664b]/[0.07] text-[#4e684d]"
                                : "bg-[#8c4936]/[0.07] text-[#8c4936]"
                            )}
                          >
                            <DirectionIcon aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {transaction.productName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {operationLabels[transaction.kind]} ·{" "}
                              {formatQuantity(transaction.quantity)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {transaction.actorName}
                        <span className="block text-xs">
                          {formatDate(transaction.occurredAt)}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          positive ? "text-[#456044]" : "text-[#8a3e2f]"
                        )}
                      >
                        {positive ? "+" : ""}
                        {formatSeptims(transaction.total)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-none border-[#644c2c]/35 bg-[#f0d8bd]/35 py-0 shadow-[inset_0_0_24px_rgba(107,79,40,0.03)] ring-0">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="font-display text-xl font-[580] text-[#3b2f22]">
              Stocks faibles
            </CardTitle>
            <CardDescription>Seuil minimum atteint</CardDescription>
            <CardAction>
              <AlertTriangle
                aria-hidden="true"
                className="size-5 text-[#9c5739]"
              />
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {data.lowStock.length > 0 ? (
              <Table>
                <TableBody>
                  {data.lowStock.map((product) => (
                    <TableRow
                      className="border-b border-dotted border-[#6b4c2b]/40 hover:bg-[#fffdeb]/30"
                      key={product._id}
                    >
                      <TableCell className="pl-4">
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Seuil {formatNumber(product.minimumStock)}
                        </p>
                      </TableCell>
                      <TableCell className="pr-4 text-right font-display text-lg text-[#8a432e]">
                        {formatNumber(product.currentStock)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Alert className="mx-4 w-auto border-[#456044]/25 bg-[#456044]/[0.04]">
                <PackageOpen aria-hidden="true" />
                <AlertTitle>Aucun stock faible</AlertTitle>
                <AlertDescription>
                  Tous les produits suivis sont au-dessus de leur seuil minimum.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="border-t border-border/60">
            <Button asChild className="w-full" variant="outline">
              <Link to="/inventaire">Voir tout l’inventaire</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

function Metric({
  detail,
  icon: Icon,
  label,
  tone = "normal",
  value,
}: Readonly<{
  detail: string
  icon: typeof Coins
  label: string
  tone?: "normal" | "warning"
  value: string
}>) {
  return (
    <Card
      className={cn(
        "min-w-0 gap-0 rounded-none border-0 border-r border-[#5b462b]/30 bg-transparent py-0 ring-0 last:border-r-0 max-md:border-r-0 max-md:border-b max-md:last:border-b-0 max-xl:[&:nth-child(-n+2)]:border-b max-xl:[&:nth-child(2)]:border-r-0",
        tone === "warning" && "bg-[#9a4b32]/[0.025]"
      )}
      size="sm"
    >
      <CardContent className="flex items-start gap-3.5 p-4">
        <Icon
          aria-hidden="true"
          className={cn(
            "mt-0.5 size-5 shrink-0",
            tone === "warning" ? "text-[#9a4b32]" : "text-primary"
          )}
          strokeWidth={1.5}
        />
        <div>
          <p className="text-[0.68rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 font-display text-2xl text-foreground">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}
