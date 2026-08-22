import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { type FunctionReturnType } from "convex/server"
import { ChevronDown, ScrollText } from "lucide-react"
import { useState } from "react"

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
import { api } from "../../../convex/_generated/api"
import { type Doc } from "../../../convex/_generated/dataModel"
import {
  formatDate,
  formatNumber,
  formatQuantity,
  formatSeptims,
  operationLabels,
} from "@/lib/format"
import { cn } from "@/lib/utils"

type Transaction = FunctionReturnType<typeof api.transactions.list>[number]

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
    ])
  },
  pendingComponent: PageSkeleton,
})

const operationToneClasses: Readonly<
  Record<Doc<"transactions">["kind"], string>
> = {
  adjustment: "border-[#1E374F]/25 bg-[#1E374F]/[0.08] text-[#1E374F]",
  bundle: "border-[#6c5738]/25 bg-[#6c5738]/[0.08] text-[#6c5738]",
  order: "border-[#6c5738]/25 bg-[#6c5738]/[0.08] text-[#6c5738]",
  production: "border-[#5d5276]/25 bg-[#5d5276]/[0.07] text-[#5d5276]",
  purchase: "border-[#83513b]/25 bg-[#83513b]/[0.07] text-[#83513b]",
  sale: "border-[#405c43]/25 bg-[#405c43]/[0.08] text-[#405c43]",
  service: "border-[#6c5738]/25 bg-[#6c5738]/[0.08] text-[#6c5738]",
}

function JournalPage() {
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

  return (
    <div className="animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <PageHeader
        action={
          <OperationDialog
            bundles={bundles}
            characters={characters}
            products={products}
          />
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <JournalRow
                      key={transaction._id}
                      transaction={transaction}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-3 md:hidden">
            {transactions.map((transaction) => (
              <JournalCard key={transaction._id} transaction={transaction} />
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

function JournalRow({ transaction }: Readonly<{ transaction: Transaction }>) {
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
        {transaction.counterparty ? (
          <span className="block truncate text-xs text-muted-foreground">
            {transaction.counterparty}
          </span>
        ) : null}
        <TransactionLines lines={transaction.lines} />
      </TableCell>
      <TableCell className="max-w-40 truncate text-muted-foreground">
        {transaction.actorName}
      </TableCell>
      <TableCell className="text-right">
        {formatNumber(transaction.quantity)}
      </TableCell>
      <TableCell
        className={cn(
          "pr-4 text-right font-semibold tabular-nums",
          transaction.total >= 0 ? "text-[#456044]" : "text-[#8a3e2f]"
        )}
      >
        {transaction.total >= 0 ? "+" : ""}
        {formatSeptims(transaction.total)}
      </TableCell>
    </TableRow>
  )
}

function JournalCard({ transaction }: Readonly<{ transaction: Transaction }>) {
  return (
    <Card className="rounded-none border-[#5b462b]/35 bg-[#fff8e7]/30 shadow-[2px_3px_0_rgba(84,63,37,0.05)] ring-0">
      <CardHeader>
        <CardTitle className="font-display text-base">
          {transaction.productName}
        </CardTitle>
        <CardDescription>
          {transaction.actorName}
          {transaction.counterparty ? ` · ${transaction.counterparty}` : ""}
        </CardDescription>
        <CardAction>
          <OperationPill kind={transaction.kind} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 border-t border-border/60 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <time className="text-xs text-muted-foreground">
              {formatDate(transaction.occurredAt)}
            </time>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatQuantity(transaction.quantity)}
            </p>
          </div>
          <p
            className={cn(
              "font-display text-lg",
              transaction.total >= 0 ? "text-[#456044]" : "text-[#8a3e2f]"
            )}
          >
            {transaction.total >= 0 ? "+" : ""}
            {formatSeptims(transaction.total)}
          </p>
        </div>
        <TransactionLines lines={transaction.lines} />
      </CardContent>
    </Card>
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
              <span>
                {line.productName} · {formatQuantity(line.quantity)}
              </span>
              <span className="font-semibold text-foreground tabular-nums">
                {formatSeptims(line.total)}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
