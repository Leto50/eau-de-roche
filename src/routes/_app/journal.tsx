import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery as useConvexQuery } from "convex/react"
import { type FunctionReturnType } from "convex/server"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hammer,
  LoaderCircle,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
} from "lucide-react"
import { useState, type MouseEvent } from "react"
import { toast } from "sonner"

import {
  OperationDialog,
  type OperationKind,
} from "@/components/operation-dialog"
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
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
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
import { api } from "../../../convex/_generated/api"
import { type Doc, type Id } from "../../../convex/_generated/dataModel"

const PAGE_SIZE = 30
const initialPagination = { cursor: null, numItems: PAGE_SIZE } as const

type Transaction = FunctionReturnType<
  typeof api.transactions.listPage
>["page"][number]

type EditorRequest =
  | {
      initialKind: OperationKind
      transactionId?: Id<"transactions">
      type: "operation"
    }
  | {
      orderId: Id<"orders">
      type: "order"
    }

export const Route = createFileRoute("/_app/journal")({
  component: JournalPage,
  errorComponent: PageError,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.transactions.listPage, {
        paginationOpts: initialPagination,
      })
    )
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
  const [cursor, setCursor] = useState<string | null>(null)
  const [previousCursors, setPreviousCursors] = useState<Array<string | null>>(
    []
  )
  const [editor, setEditor] = useState<EditorRequest | null>(null)
  const { data: initialPage } = useSuspenseQuery(
    convexQuery(api.transactions.listPage, {
      paginationOpts: initialPagination,
    })
  )
  const livePage = useConvexQuery(api.transactions.listPage, {
    paginationOpts: { cursor, numItems: PAGE_SIZE },
  })
  const page = livePage ?? (cursor === null ? initialPage : undefined)
  const isFetchingPage = livePage === undefined
  const transactions = page?.page ?? []
  const isAdmin =
    isHydrated && (session?.user.role?.split(",").includes("admin") ?? false)
  const showActions = transactions.some(
    (transaction) => transaction.canManage || transaction.canDelete
  )

  function showPreviousPage() {
    const previousCursor = previousCursors.at(-1)
    if (previousCursor === undefined) return
    setPreviousCursors((current) => current.slice(0, -1))
    setCursor(previousCursor)
  }

  function showNextPage() {
    if (!page || page.isDone) return
    setPreviousCursors((current) => [...current, cursor])
    setCursor(page.continueCursor)
  }

  return (
    <div className="animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                setEditor({ initialKind: "exchange", type: "operation" })
              }
              size="lg"
            >
              <Plus aria-hidden="true" />
              Nouvel échange
            </Button>
            <Button
              onClick={() =>
                setEditor({ initialKind: "production", type: "operation" })
              }
              size="lg"
              variant="outline"
            >
              <Hammer aria-hidden="true" />
              Production
            </Button>
          </div>
        }
        eyebrow="Journal de boutique"
        title="Activité"
      >
        Retrouvez les ventes, achats, services et productions déjà enregistrés.
      </PageHeader>

      {!page ? (
        <PageSkeleton />
      ) : transactions.length > 0 ? (
        <>
          <Card
            aria-busy={isFetchingPage}
            className={cn(
              "mt-7 rounded-none border-x-0 border-y border-t-2 border-[#5b462b]/35 bg-transparent py-0 ring-0 transition-opacity max-md:border-0",
              isFetchingPage && "opacity-70"
            )}
          >
            <CardContent className="px-0">
              <Table className="max-md:block">
                <TableHeader className="max-md:hidden">
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
                <TableBody className="max-md:grid max-md:gap-3">
                  {transactions.map((transaction) => (
                    <JournalRow
                      key={transaction._id}
                      onEdit={(selectedTransaction) =>
                        setEditor(
                          selectedTransaction.orderId
                            ? {
                                orderId: selectedTransaction.orderId,
                                type: "order",
                              }
                            : {
                                initialKind:
                                  selectedTransaction.kind === "production"
                                    ? "production"
                                    : "exchange",
                                transactionId: selectedTransaction._id,
                                type: "operation",
                              }
                        )
                      }
                      showActions={showActions}
                      transaction={transaction}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#5b462b]/20 pt-4">
            <p className="text-xs tracking-wide text-muted-foreground">
              Page {previousCursors.length + 1}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={previousCursors.length === 0 || isFetchingPage}
                onClick={showPreviousPage}
                size="sm"
                type="button"
                variant="outline"
              >
                <ChevronLeft aria-hidden="true" />
                Précédente
              </Button>
              <Button
                disabled={page.isDone || isFetchingPage}
                onClick={showNextPage}
                size="sm"
                type="button"
                variant="outline"
              >
                Suivante
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
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

      {editor ? (
        <ActivityEditor
          isAdmin={isAdmin}
          onClose={() => setEditor(null)}
          request={editor}
        />
      ) : null}
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
  onEdit,
  showActions,
  transaction,
}: Readonly<{
  onEdit: (transaction: Transaction) => void
  showActions: boolean
  transaction: Transaction
}>) {
  return (
    <TableRow className="border-[#5b462b]/20 hover:bg-[#fffdeb]/40 max-md:relative max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:border max-md:border-[#5b462b]/35 max-md:bg-[#fff8e7]/30 max-md:p-4 max-md:shadow-[2px_3px_0_rgba(84,63,37,0.05)]">
      <TableCell className="pl-4 text-muted-foreground max-md:col-start-1 max-md:row-start-2 max-md:p-0 max-md:pt-3">
        <time className="text-xs">{formatDate(transaction.occurredAt)}</time>
        {transaction.orderId ? null : (
          <span className="mt-1 block text-xs md:hidden">
            {formatQuantity(transaction.quantity)}
          </span>
        )}
      </TableCell>
      <TableCell className="max-md:absolute max-md:top-4 max-md:right-4 max-md:p-0">
        <OperationPill kind={transaction.kind} />
      </TableCell>
      <TableCell className="max-w-72 max-md:col-span-2 max-md:col-start-1 max-md:row-start-1 max-md:max-w-none max-md:p-0 max-md:pr-24 max-md:whitespace-normal">
        <span className="block truncate font-semibold max-md:font-display max-md:text-base">
          {transaction.productName}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground md:hidden">
          {transaction.actorName}
          {transaction.counterparty && !transaction.orderId
            ? ` · ${transaction.counterparty}`
            : ""}
        </span>
        {transaction.counterparty && !transaction.orderId ? (
          <span className="block truncate text-xs text-muted-foreground max-md:hidden">
            {transaction.counterparty}
          </span>
        ) : null}
        {transaction.orderId ? null : (
          <TransactionLines
            lineCount={transaction.lineCount ?? 0}
            transactionId={transaction._id}
          />
        )}
      </TableCell>
      <TableCell className="max-w-40 truncate text-muted-foreground max-md:hidden">
        {transaction.actorName}
      </TableCell>
      <TableCell className="text-right max-md:hidden">
        {transaction.orderId ? "—" : formatNumber(transaction.quantity)}
      </TableCell>
      <TableCell
        className={cn(
          "pr-4 text-right font-semibold tabular-nums max-md:col-start-2 max-md:row-start-2 max-md:self-end max-md:p-0 max-md:pt-3 max-md:font-display max-md:text-lg",
          transaction.total >= 0 ? "text-[#456044]" : "text-[#8a3e2f]"
        )}
      >
        {transaction.total > 0 ? "+" : ""}
        {formatSeptims(transaction.total)}
      </TableCell>
      {showActions ? (
        <TableCell className="pr-2 text-right max-md:col-span-2 max-md:col-start-1 max-md:row-start-3 max-md:p-0 max-md:pt-2">
          {transaction.canManage || transaction.canDelete ? (
            <TransactionActions onEdit={onEdit} transaction={transaction} />
          ) : null}
        </TableCell>
      ) : null}
    </TableRow>
  )
}

function TransactionActions({
  onEdit,
  transaction,
}: Readonly<{
  onEdit: (transaction: Transaction) => void
  transaction: Transaction
}>) {
  const canEdit = transaction.canManage && isEditableTransaction(transaction)

  return (
    <div className="flex flex-nowrap justify-end gap-1">
      {canEdit ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={`Modifier ${operationLabels[transaction.kind]} — ${transaction.productName}`}
              className="md:size-6 md:px-0"
              onClick={() => onEdit(transaction)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Pencil aria-hidden="true" />
              <span className="md:sr-only">Modifier</span>
            </Button>
          </TooltipTrigger>
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
  lineCount,
  transactionId,
}: Readonly<{
  lineCount: number
  transactionId: Id<"transactions">
}>) {
  const [open, setOpen] = useState(false)
  if (lineCount === 0) return null

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <Button
          className="mt-1 h-auto px-0 text-[0.68rem]"
          type="button"
          variant="link"
        >
          {lineCount} {lineCount === 1 ? "ligne" : "lignes"}
          <ChevronDown
            aria-hidden="true"
            className={cn("transition-transform", open && "rotate-180")}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1 max-md:col-span-2">
        {open ? <TransactionLineContent transactionId={transactionId} /> : null}
      </CollapsibleContent>
    </Collapsible>
  )
}

function TransactionLineContent({
  transactionId,
}: Readonly<{ transactionId: Id<"transactions"> }>) {
  const details = useConvexQuery(api.transactions.getDetails, {
    transactionId,
  })
  if (details === undefined) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <LoaderCircle
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
        Chargement…
      </span>
    )
  }
  if (!details) {
    return (
      <p className="text-xs text-destructive">
        Impossible de charger les lignes.
      </p>
    )
  }

  return (
    <ul className="grid gap-1 border-l border-primary/30 pl-2 text-xs text-muted-foreground">
      {details.lines.map((line) => (
        <li className="flex flex-wrap justify-between gap-2" key={line._id}>
          <span className="flex flex-wrap items-center gap-1.5">
            {line.direction ? (
              <Badge className="px-1.5 py-0 text-[0.58rem]" variant="outline">
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
  )
}

function ActivityEditor({
  isAdmin,
  onClose,
  request,
}: Readonly<{
  isAdmin: boolean
  onClose: () => void
  request: EditorRequest
}>) {
  return request.type === "order" ? (
    <OrderActivityEditor
      isAdmin={isAdmin}
      onClose={onClose}
      request={request}
    />
  ) : (
    <OperationActivityEditor onClose={onClose} request={request} />
  )
}

function OperationActivityEditor({
  onClose,
  request,
}: Readonly<{
  onClose: () => void
  request: Extract<EditorRequest, { type: "operation" }>
}>) {
  const products = useConvexQuery(api.products.selectable)
  const characters = useConvexQuery(api.characters.list)
  const bundles = useConvexQuery(api.recipes.listBundles)
  const recipes = useConvexQuery(api.recipes.list)
  const transaction = useConvexQuery(
    api.transactions.getDetails,
    request.transactionId ? { transactionId: request.transactionId } : "skip"
  )

  const isLoading =
    products === undefined ||
    characters === undefined ||
    bundles === undefined ||
    recipes === undefined ||
    (request.transactionId !== undefined && transaction === undefined)
  const missingEntity =
    !isLoading && request.transactionId !== undefined && transaction === null

  if (missingEntity || isLoading) {
    return <EditorLoadingDialog failed={missingEntity} onClose={onClose} />
  }
  return (
    <OperationDialog
      bundles={bundles}
      characters={characters}
      initialKind={request.initialKind}
      key={request.transactionId ?? request.initialKind}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      open
      products={products}
      recipes={recipes}
      transaction={transaction ?? undefined}
      trigger={null}
    />
  )
}

function OrderActivityEditor({
  isAdmin,
  onClose,
  request,
}: Readonly<{
  isAdmin: boolean
  onClose: () => void
  request: Extract<EditorRequest, { type: "order" }>
}>) {
  const products = useConvexQuery(api.products.selectable)
  const characters = useConvexQuery(api.characters.list)
  const recipes = useConvexQuery(api.recipes.list)
  const order = useConvexQuery(api.orders.getById, {
    orderId: request.orderId,
  })
  const isLoading =
    products === undefined ||
    characters === undefined ||
    recipes === undefined ||
    order === undefined
  const missingEntity = !isLoading && order === null

  if (missingEntity || isLoading) {
    return <EditorLoadingDialog failed={missingEntity} onClose={onClose} />
  }
  if (!order) {
    return <EditorLoadingDialog failed onClose={onClose} />
  }

  return (
    <OrderDialog
      characters={characters}
      isAdmin={isAdmin}
      key={request.orderId}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      open
      order={order}
      products={products}
      recipes={recipes}
      trigger={null}
    />
  )
}

function EditorLoadingDialog({
  failed,
  onClose,
}: Readonly<{
  failed: boolean
  onClose: () => void
}>) {
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      open
    >
      <DialogContent className="rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-xl">
        <DialogHeader>
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Activité de la boutique
          </p>
          <DialogTitle className="font-display text-2xl">
            {failed ? "Modification indisponible" : "Préparation du registre"}
          </DialogTitle>
          <DialogDescription>
            {failed
              ? "Les informations de cette opération n’ont pas pu être retrouvées."
              : "Les références nécessaires sont chargées à la demande."}
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <Alert variant="destructive">
            <AlertTitle>Chargement impossible</AlertTitle>
            <AlertDescription>
              Fermez cette fenêtre puis réessayez.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3" aria-label="Chargement" role="status">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
