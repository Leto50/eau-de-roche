import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { type FunctionReturnType } from "convex/server"
import {
  CalendarClock,
  Check,
  Coins,
  LoaderCircle,
  MessageSquareText,
  PackageCheck,
  Pencil,
  Store,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { OrderDialog } from "@/components/order-dialog"
import { OrderPreparationDetails } from "@/components/order-preparation-details"
import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/page-skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "../../../convex/_generated/api"
import { type Doc } from "../../../convex/_generated/dataModel"
import { useHydrated } from "@/hooks/use-hydrated"
import { authClient } from "@/lib/auth-client"
import {
  formatDate,
  formatNumber,
  formatSeptims,
  formatUnitPrice,
  orderStatusLabels,
} from "@/lib/format"
import { calculateOrderPreparation } from "@/lib/order-preparation"
import { cn } from "@/lib/utils"

type Order = FunctionReturnType<typeof api.orders.list>[number]
type Recipe = FunctionReturnType<typeof api.recipes.list>[number]
type OrderStatus = Order["status"]
type OrderKind = Order["kind"]

const statusOptions: readonly OrderStatus[] = [
  "open",
  "ready",
  "delivered",
  "cancelled",
]

const orderToneClasses: Readonly<Record<OrderStatus, string>> = {
  cancelled: "border-t-[#8a4233]",
  delivered: "border-t-[#81613d] opacity-75",
  open: "border-t-[#81613d]",
  ready: "border-t-[#4f6a4e]",
}

const statusBadgeClasses: Readonly<Record<OrderStatus, string>> = {
  cancelled: "border-[#8a4233]/30 text-[#8a4233]",
  delivered: "border-[#81613d]/30 text-[#81613d]",
  open: "border-[#81613d]/30 text-[#81613d]",
  ready: "border-[#4f6a4e]/30 text-[#4f6a4e]",
}

function isOrderStatus(value: string): value is OrderStatus {
  return statusOptions.includes(value as OrderStatus)
}

function isOrderKind(value: string): value is OrderKind {
  return value === "client" || value === "supplier"
}

export const Route = createFileRoute("/_app/commandes")({
  component: OrdersPage,
  errorComponent: PageError,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.orders.list, {})),
      context.queryClient.ensureQueryData(
        convexQuery(api.products.selectable, {})
      ),
      context.queryClient.ensureQueryData(convexQuery(api.characters.list, {})),
      context.queryClient.ensureQueryData(convexQuery(api.recipes.list, {})),
    ])
  },
  pendingComponent: PageSkeleton,
})

function OrdersPage() {
  const { data: session } = authClient.useSession()
  const isHydrated = useHydrated()
  const { data: orders } = useSuspenseQuery(convexQuery(api.orders.list, {}))
  const { data: products } = useSuspenseQuery(
    convexQuery(api.products.selectable, {})
  )
  const { data: characters } = useSuspenseQuery(
    convexQuery(api.characters.list, {})
  )
  const { data: recipes } = useSuspenseQuery(convexQuery(api.recipes.list, {}))
  const updateStatus = useMutation(api.orders.updateStatus)
  const [kind, setKind] = useState<OrderKind>("client")
  const visibleOrders = orders.filter((order) => order.kind === kind)
  const openCount = visibleOrders.filter(
    (order) => order.status === "open"
  ).length
  const isAdmin =
    isHydrated && (session?.user.role?.split(",").includes("admin") ?? false)

  async function handleStatusChange(order: Order, value: string) {
    if (!isOrderStatus(value)) return
    try {
      await updateStatus({ orderId: order._id, status: value })
      toast.success("L'état de la commande a été mis à jour.")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de modifier cette commande."
      )
    }
  }

  function handleKindChange(value: string) {
    if (isOrderKind(value)) setKind(value)
  }

  return (
    <div className="animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <PageHeader
        action={
          <OrderDialog
            initialKind={kind}
            isAdmin={isAdmin}
            products={products}
            recipes={recipes}
          />
        }
        eyebrow="Suivi des commandes"
        title="Commandes"
      >
        Les commandes clients et les achats attendus des fournisseurs.
      </PageHeader>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-y border-border/70 py-3">
        <Tabs onValueChange={handleKindChange} value={kind}>
          <TabsList aria-label="Type de commande" className="bg-[#6e5330]/8">
            <TabsTrigger value="client">
              <PackageCheck aria-hidden="true" />
              Clients
            </TabsTrigger>
            <TabsTrigger value="supplier">
              <Store aria-hidden="true" />
              Fournisseurs
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          <strong className="font-display text-lg text-foreground">
            {openCount}
          </strong>{" "}
          {openCount === 1
            ? "commande encore ouverte"
            : "commandes encore ouvertes"}
        </p>
      </div>

      {visibleOrders.length > 0 ? (
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {visibleOrders.map((order) => (
            <OrderEntry
              characters={characters}
              isAdmin={isAdmin}
              key={order._id}
              onStatusChange={(value) => handleStatusChange(order, value)}
              order={order}
              products={products}
              recipes={recipes}
            />
          ))}
        </div>
      ) : (
        <Alert className="mt-6 border-[#6a4f2e]/30 bg-card/35">
          {kind === "client" ? (
            <PackageCheck aria-hidden="true" />
          ) : (
            <Store aria-hidden="true" />
          )}
          <AlertTitle>Aucune commande</AlertTitle>
          <AlertDescription>
            Les nouvelles commandes apparaîtront ici après leur création.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function orderTotal(order: Order): number | undefined {
  if (order.total !== undefined) return order.total
  const lineTotals = order.lines
    .map((line) => line.total)
    .filter((value): value is number => value !== undefined)
  return lineTotals.length === order.lines.length && lineTotals.length > 0
    ? lineTotals.reduce((total, value) => total + value, 0)
    : undefined
}

function OrderEntry({
  characters,
  isAdmin,
  onStatusChange,
  order,
  products,
  recipes,
}: Readonly<{
  characters: readonly Doc<"characters">[]
  isAdmin: boolean
  onStatusChange: (value: string) => void
  order: Order
  products: readonly Doc<"products">[]
  recipes: readonly Recipe[]
}>) {
  const total = orderTotal(order)
  const preparation = calculateOrderPreparation(order.lines, products, recipes)

  return (
    <Card
      className={cn(
        "rounded-none border-t-[3px] border-[#5b462b]/35 bg-[#fff8e7]/30 shadow-[3px_4px_0_rgba(76,56,32,0.05)] ring-0",
        orderToneClasses[order.status]
      )}
    >
      <CardHeader>
        <CardTitle className="font-display text-xl">
          {order.contactName}
        </CardTitle>
        {order.dueAt || order.dueLabel ? (
          <CardDescription>
            {order.dueAt
              ? order.kind === "client"
                ? "Livraison prévue"
                : "Réception prévue"
              : null}
            <span className="mt-1 flex items-center gap-1.5">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              {order.dueAt ? formatDate(order.dueAt) : order.dueLabel}
            </span>
          </CardDescription>
        ) : null}
        <CardAction className="flex items-center gap-1">
          <Select onValueChange={onStatusChange} value={order.status}>
            <SelectTrigger
              aria-label={`État de la commande ${order.contactName}`}
              className="w-36 bg-background/40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {orderStatusLabels[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <OrderDialog
            isAdmin={isAdmin}
            order={order}
            products={products}
            recipes={recipes}
            trigger={
              <Button
                aria-label={`Modifier la commande de ${order.contactName}`}
                size="icon"
                variant="ghost"
              >
                <Pencil aria-hidden="true" />
              </Button>
            }
          />
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-4">
        <Table>
          <TableBody>
            {order.lines.map((line) => (
              <TableRow className="border-border/60" key={line._id}>
                <TableCell className="max-w-48 pl-0">
                  <p className="truncate font-semibold">{line.productName}</p>
                  {line.unitPrice !== undefined ? (
                    <p className="text-xs text-muted-foreground">
                      {formatUnitPrice(line.unitPrice)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="w-16 tabular-nums">
                  × {formatNumber(line.quantity)}
                </TableCell>
                <TableCell className="w-28 pr-0 text-right font-semibold tabular-nums">
                  {line.total === undefined ? "—" : formatSeptims(line.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {order.kind === "client" ? (
          <OrderPreparationDetails preparation={preparation} />
        ) : null}

        {order.notes ? (
          <Alert className="border-primary/25 bg-primary/[0.03]">
            <MessageSquareText aria-hidden="true" />
            <AlertDescription className="italic">
              {order.notes}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <CardFooter className="flex-wrap justify-between gap-3 border-t border-border/60">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={statusBadgeClasses[order.status]} variant="outline">
            {order.status === "delivered" ? <Check aria-hidden="true" /> : null}
            {orderStatusLabels[order.status]}
          </Badge>
          <OrderProcessingDialog characters={characters} order={order} />
        </div>
        <div className="text-right">
          <p className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
            Total convenu
          </p>
          <p className="font-display text-xl">
            {total === undefined ? "À convenir" : formatSeptims(total)}
          </p>
        </div>
      </CardFooter>
    </Card>
  )
}

function todayInputValue(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function dateInputFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function dateInputToTimestamp(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const timestamp = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12
  ).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function OrderProcessingDialog({
  characters,
  order,
}: Readonly<{
  characters: readonly Doc<"characters">[]
  order: Order
}>) {
  const processOrder = useMutation(api.orders.process)
  const [open, setOpen] = useState(false)
  const [characterId, setCharacterId] = useState("")
  const [occurredOn, setOccurredOn] = useState(todayInputValue)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const clientOrder = order.kind === "client"
  const processed = Boolean(order.transactionId && order.processedAt)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setCharacterId(order.linkedTransaction?.actorCharacterId ?? "")
      setOccurredOn(
        order.processedAt
          ? dateInputFromTimestamp(order.processedAt)
          : todayInputValue()
      )
    }
    setOpen(nextOpen)
  }

  if (order.lines.some((line) => line.unitPrice === undefined)) {
    return <Badge variant="outline">Prix à renseigner</Badge>
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const character = characters.find((entry) => entry._id === characterId)
    const occurredAt = dateInputToTimestamp(occurredOn)
    if (!character || !occurredAt) {
      toast.error("Choisissez un personnage et une date valide.")
      return
    }

    setIsSubmitting(true)
    try {
      await processOrder({
        characterId: character._id,
        occurredAt,
        orderId: order._id,
      })
      toast.success(
        processed
          ? clientOrder
            ? "Paiement corrigé."
            : "Réception corrigée."
          : clientOrder
            ? "Paiement ajouté au journal."
            : "Réception ajoutée au journal et au stock."
      )
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de traiter cette commande."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={
            processed
              ? `${clientOrder ? "Corriger le paiement" : "Corriger la réception"} de ${order.contactName}`
              : undefined
          }
          size="sm"
          type="button"
          variant={processed ? "secondary" : "outline"}
        >
          {processed ? (
            <Pencil aria-hidden="true" />
          ) : clientOrder ? (
            <Coins aria-hidden="true" />
          ) : (
            <PackageCheck aria-hidden="true" />
          )}
          {processed && order.processedAt
            ? `${clientOrder ? "Payée" : "Reçue"} le ${formatDate(order.processedAt)}`
            : clientOrder
              ? "Enregistrer le paiement"
              : "Réceptionner"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-[#6a5436] bg-[#eee1c7]" size="lg">
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              {processed
                ? clientOrder
                  ? "Corriger le paiement"
                  : "Corriger la réception"
                : clientOrder
                  ? "Enregistrer le paiement"
                  : "Réceptionner la commande"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {processed
                ? "La transaction existante sera corrigée sans créer de doublon."
                : "Une transaction liée sera inscrite au journal. Sa date peut être différente de la date prévue de la commande."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.15fr)_minmax(11rem,0.85fr)]">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`order-character-${order._id}`}>Personnage</Label>
              <Select onValueChange={setCharacterId} value={characterId}>
                <SelectTrigger
                  className="w-full min-w-0"
                  id={`order-character-${order._id}`}
                >
                  <SelectValue placeholder="Qui traite la commande ?" />
                </SelectTrigger>
                <SelectContent>
                  {characters.map((character) => (
                    <SelectItem key={character._id} value={character._id}>
                      {character.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`order-date-${order._id}`}>
                {clientOrder ? "Date du paiement" : "Date de réception"}
              </Label>
              <Input
                className="min-w-0"
                id={`order-date-${order._id}`}
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                type="date"
                value={occurredOn}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel type="button">Retour</AlertDialogCancel>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : clientOrder ? (
                <Coins aria-hidden="true" />
              ) : (
                <PackageCheck aria-hidden="true" />
              )}
              {processed
                ? "Enregistrer la correction"
                : clientOrder
                  ? "Valider le paiement"
                  : "Valider la réception"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
