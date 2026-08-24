import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { type FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import {
  ChevronDown,
  Hammer,
  LoaderCircle,
  Pencil,
  ScrollText,
  Trash2,
} from "lucide-react"
import { useState, type MouseEvent } from "react"
import { toast } from "sonner"

import { OperationDialog } from "@/components/operation-dialog"
import { OrderDialog } from "@/components/order-dialog"
import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/page-skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { api } from "../../../convex/_generated/api"
import { type Doc } from "../../../convex/_generated/dataModel"
import { useHydrated } from "@/hooks/use-hydrated"
import { authClient } from "@/lib/auth-client"
import { getUserFacingErrorMessage } from "@/lib/errors"
import {
  formatDate,
  formatNumber,
  formatQuantity,
  formatSeptims,
  operationLabels,
} from "@/lib/format"
import { cn } from "@/lib/utils"

type Transaction = FunctionReturnType<typeof api.transactions.list>[number]
type Bundle = FunctionReturnType<typeof api.recipes.listBundles>[number]
type Order = FunctionReturnType<typeof api.orders.list>[number]
type Recipe = FunctionReturnType<typeof api.recipes.list>[number]

export const Route = createFileRoute("/_app/journal")({
  component: JournalPage,
  errorComponent: PageError,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.transactions.list, { limit: 150 })
      ),
      context.queryClient.ensureQueryData(
        convexQuery(api.products.selectable, {})
      ),
      context.queryClient.ensureQueryData(convexQuery(api.characters.list, {})),
      context.queryClient.ensureQueryData(
        convexQuery(api.recipes.listBundles, {})
      ),
      context.queryClient.ensureQueryData(convexQuery(api.orders.list, {})),
      context.queryClient.ensureQueryData(convexQuery(api.recipes.list, {})),
    ])
  },
  pendingComponent: PageSkeleton,
})

const operationToneClasses: Readonly<
  Record<Doc<"transactions">["kind"], string>
> = {
  adjustment: "border-[#1E374F]/25 bg-[#1E374F]/[0.08] text-[#1E374F]",
  bundle: "border-[#6c5738]/25 bg-[#6c5738]/[0.08] text-[#6c5738]",
  exchange: "border-[#1E374F]/25 bg-[#1E374F]/[0.08] text-[#1E374F]",
  order: "border-[#6c5738]/25 bg-[#6c5738]/[0.08] text-[#6c5738]",
  production: "border-[#5d5276]/25 bg-[#5d5276]/[0.07] text-[#5d5276]",
  purchase: "border-[#83513b]/25 bg-[#83513b]/[0.07] text-[#83513b]",
  sale: "border-[#405c43]/25 bg-[#405c43]/[0.08] text-[#405c43]",
  service: "border-[#6c5738]/25 bg-[#6c5738]/[0.08] text-[#6c5738]",
}

function JournalPage() {
  const { data: session } = authClient.useSession()
  const isHydrated = useHydrated()
  const { data: transactions } = useSuspenseQuery(
    convexQuery(api.transactions.list, { limit: 150 })
  )
  const { data: products } = useSuspenseQuery(
    convexQuery(api.products.selectable, {})
  )
  const { data: characters } = useSuspenseQuery(
    convexQuery(api.characters.list, {})
  )
  const { data: bundles } = useSuspenseQuery(
    convexQuery(api.recipes.listBundles, {})
  )
  const { data: orders } = useSuspenseQuery(convexQuery(api.orders.list, {}))
  const { data: recipes } = useSuspenseQuery(convexQuery(api.recipes.list, {}))
  const isAdmin =
    isHydrated && (session?.user.role?.split(",").includes("admin") ?? false)
  const showActions = transactions.some(
    (transaction) => transaction.canManage || transaction.canDelete
  )

  return (
    <div className="animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <OperationDialog
              bundles={bundles}
              characters={characters}
              products={products}
            />
            <OperationDialog
              bundles={bundles}
              characters={characters}
              initialKind="production"
              products={products}
              trigger={
                <Button size="lg" variant="outline">
                  <Hammer aria-hidden="true" />
                  Production
                </Button>
              }
            />
          </div>
        }
        eyebrow="Journal de boutique"
        title="Activité"
      >
        Retrouvez les ventes, achats, services et productions déjà enregistrés.
      </PageHeader>

      {transactions.length > 0 ? (
        <>
          <Card className="mt-7 hidden rounded-none border-x-0 border-y border-t-2 border-[#5b462b]/35 bg-transparent py-0 ring-0 md:flex">
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-[#5b462b]/50 bg-[#684f2d]/10 hover:bg-[#684f2d]/10">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Opération</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead>Personnage</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="pr-4 text-right">Montant</TableHead>
                    {showActions ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <JournalRow
                      bundles={bundles}
                      characters={characters}
                      isAdmin={isAdmin}
                      key={transaction._id}
                      orders={orders}
                      products={products}
                      recipes={recipes}
                      showActions={showActions}
                      transaction={transaction}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-3 md:hidden">
            {transactions.map((transaction) => (
              <JournalCard
                bundles={bundles}
                characters={characters}
                isAdmin={isAdmin}
                key={transaction._id}
                orders={orders}
                products={products}
                recipes={recipes}
                transaction={transaction}
              />
            ))}
          </div>
        </>
      ) : (
        <Alert className="mt-7 border-[#6a4f2e]/30 bg-card/35">
          <ScrollText aria-hidden="true" />
          <AlertTitle>Aucune opération enregistrée</AlertTitle>
          <AlertDescription>
            Ajoutez une première opération pour commencer l’historique.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function isEditableTransaction(transaction: Transaction): boolean {
  return (
    Boolean(transaction.orderId) ||
    transaction.kind === "production" ||
    transaction.kind === "exchange" ||
    transaction.kind === "purchase" ||
    transaction.kind === "sale" ||
    transaction.kind === "service"
  )
}

function OperationPill({
  kind,
}: Readonly<{ kind: Doc<"transactions">["kind"] }>) {
  return (
    <Badge
      className={cn("font-bold tracking-[0.04em]", operationToneClasses[kind])}
      variant="outline"
    >
      {operationLabels[kind]}
    </Badge>
  )
}

function JournalRow({
  bundles,
  characters,
  isAdmin,
  orders,
  products,
  recipes,
  showActions,
  transaction,
}: Readonly<{
  bundles: readonly Bundle[]
  characters: readonly Doc<"characters">[]
  isAdmin: boolean
  orders: readonly Order[]
  products: readonly Doc<"products">[]
  recipes: readonly Recipe[]
  showActions: boolean
  transaction: Transaction
}>) {
  return (
    <TableRow className="border-[#5b462b]/20 hover:bg-[#fffdeb]/40">
      <TableCell className="pl-4 text-muted-foreground">
        {formatDate(transaction.occurredAt)}
      </TableCell>
      <TableCell>
        <OperationPill kind={transaction.kind} />
      </TableCell>
      <TableCell className="max-w-72">
        <span className="block truncate font-semibold">
          {transaction.productName}
        </span>
        {transaction.counterparty && !transaction.orderId ? (
          <span className="block truncate text-xs text-muted-foreground">
            {transaction.counterparty}
          </span>
        ) : null}
        {transaction.orderId ? null : (
          <TransactionLines lines={transaction.lines} />
        )}
      </TableCell>
      <TableCell className="max-w-40 truncate text-muted-foreground">
        {transaction.actorName}
      </TableCell>
      <TableCell className="text-right">
        {transaction.orderId ? "—" : formatNumber(transaction.quantity)}
      </TableCell>
      <TableCell
        className={cn(
          "pr-4 text-right font-semibold tabular-nums",
          transaction.total >= 0 ? "text-[#456044]" : "text-[#8a3e2f]"
        )}
      >
        {transaction.total > 0 ? "+" : ""}
        {formatSeptims(transaction.total)}
      </TableCell>
      {showActions ? (
        <TableCell className="pr-2 text-right">
          {transaction.canManage || transaction.canDelete ? (
            <TransactionActions
              bundles={bundles}
              characters={characters}
              isAdmin={isAdmin}
              orders={orders}
              products={products}
              recipes={recipes}
              transaction={transaction}
            />
          ) : null}
        </TableCell>
      ) : null}
    </TableRow>
  )
}

function JournalCard({
  bundles,
  characters,
  isAdmin,
  orders,
  products,
  recipes,
  transaction,
}: Readonly<{
  bundles: readonly Bundle[]
  characters: readonly Doc<"characters">[]
  isAdmin: boolean
  orders: readonly Order[]
  products: readonly Doc<"products">[]
  recipes: readonly Recipe[]
  transaction: Transaction
}>) {
  return (
    <Card className="rounded-none border-[#5b462b]/35 bg-[#fff8e7]/30 shadow-[2px_3px_0_rgba(84,63,37,0.05)] ring-0">
      <CardHeader>
        <CardTitle className="font-display text-base">
          {transaction.productName}
        </CardTitle>
        <CardDescription>
          {transaction.actorName}
          {transaction.counterparty && !transaction.orderId
            ? ` · ${transaction.counterparty}`
            : ""}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <OperationPill kind={transaction.kind} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 border-t border-border/60 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <time className="text-xs text-muted-foreground">
              {formatDate(transaction.occurredAt)}
            </time>
            {transaction.orderId ? null : (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatQuantity(transaction.quantity)}
              </p>
            )}
          </div>
          <p
            className={cn(
              "font-display text-lg",
              transaction.total >= 0 ? "text-[#456044]" : "text-[#8a3e2f]"
            )}
          >
            {transaction.total > 0 ? "+" : ""}
            {formatSeptims(transaction.total)}
          </p>
        </div>
        {transaction.orderId ? null : (
          <TransactionLines lines={transaction.lines} />
        )}
        {transaction.canManage || transaction.canDelete ? (
          <TransactionActions
            bundles={bundles}
            characters={characters}
            isAdmin={isAdmin}
            orders={orders}
            products={products}
            recipes={recipes}
            transaction={transaction}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

function TransactionActions({
  bundles,
  characters,
  isAdmin,
  orders,
  products,
  recipes,
  transaction,
}: Readonly<{
  bundles: readonly Bundle[]
  characters: readonly Doc<"characters">[]
  isAdmin: boolean
  orders: readonly Order[]
  products: readonly Doc<"products">[]
  recipes: readonly Recipe[]
  transaction: Transaction
}>) {
  const linkedOrder = transaction.orderId
    ? orders.find((order) => order._id === transaction.orderId)
    : undefined
  const canEdit =
    transaction.canManage &&
    isEditableTransaction(transaction) &&
    (!transaction.orderId || linkedOrder !== undefined)

  return (
    <div className="flex flex-nowrap justify-end gap-1">
      {canEdit ? (
        <Tooltip>
          {linkedOrder ? (
            <OrderDialog
              characters={characters}
              isAdmin={isAdmin}
              order={linkedOrder}
              products={products}
              recipes={recipes}
              trigger={
                <TooltipTrigger asChild>
                  <Button
                    className="md:size-6 md:px-0"
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil aria-hidden="true" />
                    <span className="md:sr-only">Modifier</span>
                  </Button>
                </TooltipTrigger>
              }
            />
          ) : (
            <OperationDialog
              bundles={bundles}
              characters={characters}
              products={products}
              transaction={transaction}
              trigger={
                <TooltipTrigger asChild>
                  <Button
                    className="md:size-6 md:px-0"
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil aria-hidden="true" />
                    <span className="md:sr-only">Modifier</span>
                  </Button>
                </TooltipTrigger>
              }
            />
          )}
          <TooltipContent>Modifier</TooltipContent>
        </Tooltip>
      ) : null}
      {transaction.canDelete ? (
        <TransactionDeletion transaction={transaction} />
      ) : null}
    </div>
  )
}

function TransactionDeletion({
  transaction,
}: Readonly<{ transaction: Transaction }>) {
  const removeTransaction = useMutation(api.transactions.remove)
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await removeTransaction({ transactionId: transaction._id })
      toast.success("Opération supprimée et stock corrigé.")
      setOpen(false)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(
          error,
          "Impossible de supprimer cette opération."
        )
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              aria-label={`Supprimer ${operationLabels[transaction.kind]} — ${transaction.productName}`}
              className="md:size-6 md:px-0"
              size="sm"
              type="button"
              variant="destructive"
            >
              <Trash2 aria-hidden="true" />
              <span className="md:sr-only">Supprimer</span>
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Supprimer</TooltipContent>
      </Tooltip>
      <AlertDialogContent className="rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Supprimer définitivement cette opération ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Elle disparaîtra du journal avec ses lignes et ses mouvements. Le
            stock sera corrigé et seule une trace d’audit sera conservée. Cette
            action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Conserver</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSubmitting}
            onClick={handleDelete}
            type="button"
            variant="destructive"
          >
            {isSubmitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
            Supprimer définitivement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function TransactionLines({
  lines,
}: Readonly<{ lines: Transaction["lines"] }>) {
  const [open, setOpen] = useState(false)
  if (lines.length === 0) return null

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <Button
          className="mt-1 h-auto px-0 text-[0.68rem]"
          type="button"
          variant="link"
        >
          {lines.length} {lines.length === 1 ? "ligne" : "lignes"}
          <ChevronDown
            aria-hidden="true"
            className={cn("transition-transform", open && "rotate-180")}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <ul className="grid gap-1 border-l border-primary/30 pl-2 text-xs text-muted-foreground">
          {lines.map((line) => (
            <li className="flex flex-wrap justify-between gap-2" key={line._id}>
              <span className="flex flex-wrap items-center gap-1.5">
                {line.direction ? (
                  <Badge
                    className="px-1.5 py-0 text-[0.58rem]"
                    variant="outline"
                  >
                    {line.direction === "incoming" ? "Acheté" : "Vendu"}
                  </Badge>
                ) : null}
                {line.productName} · {formatQuantity(line.quantity)}
              </span>
              <span className="font-semibold text-foreground tabular-nums">
                {line.direction === "incoming" ? "−" : ""}
                {formatSeptims(line.total)}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
