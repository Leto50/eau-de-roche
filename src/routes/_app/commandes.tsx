import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { type FunctionReturnType } from "convex/server"
import {
  CalendarClock,
  Check,
  MessageSquareText,
  PackageCheck,
  Pencil,
  Store,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { OrderDialog } from "@/components/order-dialog"
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
import { cn } from "@/lib/utils"

type Order = FunctionReturnType<typeof api.orders.list>[number]
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
              isAdmin={isAdmin}
              key={order._id}
              onStatusChange={(value) => handleStatusChange(order, value)}
              order={order}
              products={products}
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
  return lineTotals.length > 0
    ? lineTotals.reduce((total, value) => total + value, 0)
    : undefined
}

function OrderEntry({
  isAdmin,
  onStatusChange,
  order,
  products,
}: Readonly<{
  isAdmin: boolean
  onStatusChange: (value: string) => void
  order: Order
  products: readonly Doc<"products">[]
}>) {
  const total = orderTotal(order)

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

        {order.notes ? (
          <Alert className="border-primary/25 bg-primary/[0.03]">
            <MessageSquareText aria-hidden="true" />
            <AlertDescription className="italic">
              {order.notes}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <CardFooter className="justify-between gap-3 border-t border-border/60">
        <Badge className={statusBadgeClasses[order.status]} variant="outline">
          {order.status === "delivered" ? <Check aria-hidden="true" /> : null}
          {orderStatusLabels[order.status]}
        </Badge>
        <div className="text-right">
          <p className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
            Total
          </p>
          <p className="font-display text-xl">
            {total === undefined ? "À convenir" : formatSeptims(total)}
          </p>
        </div>
      </CardFooter>
    </Card>
  )
}
