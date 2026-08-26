import { useMutation } from "convex/react"
import { type FunctionReturnType } from "convex/server"
import {
  ClipboardPlus,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react"
import { toast } from "sonner"

import { PriceInput } from "@/components/price-input"
import { OrderPreparationDetails } from "@/components/order-preparation-details"
import { ProductPicker } from "@/components/product-picker"
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
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { api } from "../../convex/_generated/api"
import { type Doc } from "../../convex/_generated/dataModel"
import { getUserFacingErrorMessage } from "@/lib/errors"
import { formatOrderStatus, formatSeptims } from "@/lib/format"
import { calculateOrderPreparation } from "@/lib/order-preparation"
import {
  priceDraftFromValue,
  priceDraftToValue,
  roundSeptimsDown,
  type PriceDraft,
} from "@/lib/prices"

type Order = FunctionReturnType<typeof api.orders.list>[number]
type Recipe = FunctionReturnType<typeof api.recipes.list>[number]
type OrderKind = Order["kind"]
type OrderStatus = Order["status"]

interface OrderLineDraft {
  key: number
  productId: string
  quantity: string
  unitPrice: PriceDraft
}

const orderStatuses: readonly OrderStatus[] = [
  "open",
  "ready",
  "delivered",
  "cancelled",
]

function dateInputFromTimestamp(timestamp: number | undefined): string {
  if (timestamp === undefined) return ""
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function timestampFromDateInput(value: string): number | null {
  if (!value) return null
  const timestamp = new Date(`${value}T12:00:00`).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

function defaultPrice(product: Doc<"products">, kind: OrderKind) {
  return kind === "client" ? product.salePrice : product.purchasePrice
}

function initialOrderLines(order: Order | undefined): OrderLineDraft[] {
  if (order?.lines.length) {
    return order.lines.map((line, index) => ({
      key: index,
      productId: line.productId ?? "",
      quantity: line.quantity.toString(),
      unitPrice: priceDraftFromValue(line.unitPrice),
    }))
  }
  return [
    {
      key: 0,
      productId: "",
      quantity: "1",
      unitPrice: priceDraftFromValue(undefined),
    },
  ]
}

export function OrderDialog({
  characters,
  initialKind = "client",
  isAdmin,
  onOpenChange,
  open: controlledOpen,
  order,
  products,
  recipes,
  trigger,
}: Readonly<{
  characters: readonly Doc<"characters">[]
  initialKind?: OrderKind
  isAdmin: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
  order?: Order
  products: readonly Doc<"products">[]
  recipes: readonly Recipe[]
  trigger?: ReactElement | null
}>) {
  const saveOrder = useMutation(api.orders.save)
  const removeOrder = useMutation(api.orders.remove)
  const fieldId = useId()
  const nextLineKey = useRef(order?.lines.length ?? 1)
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const [kind, setKind] = useState<OrderKind>(order?.kind ?? initialKind)
  const [contactName, setContactName] = useState(order?.contactName ?? "")
  const [agreedTotal, setAgreedTotal] = useState(order?.total?.toString() ?? "")
  const [totalOverridden, setTotalOverridden] = useState(
    order?.total !== undefined
  )
  const [dueDate, setDueDate] = useState(() =>
    dateInputFromTimestamp(order?.dueAt)
  )
  const [notes, setNotes] = useState(order?.notes ?? "")
  const [status, setStatus] = useState<OrderStatus>(order?.status ?? "open")
  const [processedCharacterId, setProcessedCharacterId] = useState(
    order?.linkedTransaction?.actorCharacterId ?? ""
  )
  const [processedDate, setProcessedDate] = useState(() =>
    dateInputFromTimestamp(
      order?.processedAt ?? order?.linkedTransaction?.occurredAt
    )
  )
  const [lines, setLines] = useState<OrderLineDraft[]>(() =>
    initialOrderLines(order)
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetForm() {
    setKind(order?.kind ?? initialKind)
    setContactName(order?.contactName ?? "")
    setAgreedTotal(order?.total?.toString() ?? "")
    setTotalOverridden(order?.total !== undefined)
    setDueDate(dateInputFromTimestamp(order?.dueAt))
    setNotes(order?.notes ?? "")
    setStatus(order?.status ?? "open")
    setProcessedCharacterId(order?.linkedTransaction?.actorCharacterId ?? "")
    setProcessedDate(
      dateInputFromTimestamp(
        order?.processedAt ?? order?.linkedTransaction?.occurredAt
      )
    )
    if (order?.lines.length) {
      setLines(initialOrderLines(order))
      nextLineKey.current = order.lines.length
      return
    }
    setLines([
      {
        key: 0,
        productId: "",
        quantity: "1",
        unitPrice: priceDraftFromValue(undefined),
      },
    ])
    nextLineKey.current = 1
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) resetForm()
    if (controlledOpen === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  function updateLine(key: number, patch: Partial<OrderLineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line))
    )
  }

  function selectProduct(key: number, productId: string | undefined) {
    const product = products.find((entry) => entry._id === productId)
    updateLine(key, {
      productId: product?._id ?? "",
      unitPrice: priceDraftFromValue(
        product ? defaultPrice(product, kind) : undefined
      ),
    })
  }

  function addLine() {
    const key = nextLineKey.current
    nextLineKey.current += 1
    setLines((current) => [
      ...current,
      {
        key,
        productId: "",
        quantity: "1",
        unitPrice: priceDraftFromValue(undefined),
      },
    ])
  }

  function removeLine(key: number) {
    setLines((current) => current.filter((line) => line.key !== key))
  }

  const lineValues = lines.map((line) => ({
    quantity: Number(line.quantity),
    unitPrice: priceDraftToValue(line.unitPrice),
  }))
  const gross = lineValues.reduce(
    (sum, line) => sum + line.quantity * (line.unitPrice ?? 0),
    0
  )
  const automaticTotal = lineValues.every(
    (line) =>
      Number.isFinite(line.quantity) &&
      line.quantity > 0 &&
      line.unitPrice !== null &&
      Number.isFinite(line.unitPrice)
  )
    ? roundSeptimsDown(gross)
    : undefined
  const displayedTotal = totalOverridden
    ? agreedTotal
    : (automaticTotal?.toString() ?? "")
  const agreedTotalValue = displayedTotal.trim() ? Number(displayedTotal) : null
  const preparation = calculateOrderPreparation(
    lines.map((line) => ({
      productId: line.productId || undefined,
      productName:
        products.find((product) => product._id === line.productId)?.name ??
        "Référence non choisie",
      quantity: Number(line.quantity),
    })),
    products,
    recipes
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submittedDueAt = timestampFromDateInput(dueDate)
    const submittedProcessedAt = timestampFromDateInput(processedDate)
    const preparedLines = lines.map((line) => ({
      productId: products.find((product) => product._id === line.productId)
        ?._id,
      quantity: Number(line.quantity),
      unitPrice: priceDraftToValue(line.unitPrice),
    }))

    if (!contactName.trim()) {
      toast.error(
        kind === "client"
          ? "Le nom du client est obligatoire."
          : "Le nom du fournisseur est obligatoire."
      )
      return
    }
    if (submittedDueAt !== null && !Number.isFinite(submittedDueAt)) {
      toast.error("La date prévue n’est pas valide.")
      return
    }
    if (
      order?.transactionId &&
      (!characters.some(
        (character) => character._id === processedCharacterId
      ) ||
        submittedProcessedAt === null ||
        !Number.isFinite(submittedProcessedAt))
    ) {
      toast.error("Choisissez le personnage et la date de la transaction liée.")
      return
    }
    if (
      preparedLines.length === 0 ||
      preparedLines.some(
        (line) =>
          !line.productId ||
          !Number.isFinite(line.quantity) ||
          !Number.isInteger(line.quantity) ||
          line.quantity <= 0
      )
    ) {
      toast.error(
        "Chaque ligne doit contenir un produit et une quantité entière."
      )
      return
    }
    if (
      preparedLines.some(
        (line) => line.unitPrice !== null && !Number.isFinite(line.unitPrice)
      )
    ) {
      toast.error(
        "Chaque prix doit indiquer des septims pour un nombre entier d’unités."
      )
      return
    }
    if (
      agreedTotalValue !== null &&
      (!Number.isSafeInteger(agreedTotalValue) || agreedTotalValue < 0)
    ) {
      toast.error("Le total convenu doit être un nombre entier de septims.")
      return
    }
    const productIds = preparedLines.flatMap((line) =>
      line.productId ? [line.productId] : []
    )
    if (new Set(productIds).size !== productIds.length) {
      toast.error("Un produit ne peut apparaître qu’une fois.")
      return
    }

    setIsSubmitting(true)
    try {
      await saveOrder({
        ...(order?.transactionId
          ? {
              actorCharacterId:
                processedCharacterId as Doc<"characters">["_id"],
              processedAt: submittedProcessedAt!,
            }
          : {}),
        contactName: contactName.trim(),
        dueAt: submittedDueAt,
        kind,
        lines: preparedLines.flatMap((line) =>
          line.productId
            ? [
                {
                  productId: line.productId,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                },
              ]
            : []
        ),
        notes: notes.trim(),
        ...(order ? { orderId: order._id } : {}),
        status,
        total: agreedTotalValue,
      })
      toast.success(
        order?.transactionId
          ? "Commande, transaction et stock mis à jour."
          : order
            ? "Commande mise à jour."
            : "Commande créée."
      )
      if (controlledOpen === undefined) setInternalOpen(false)
      onOpenChange?.(false)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(
          error,
          "Impossible d’enregistrer la commande."
        )
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function deleteOrder() {
    if (!order) return
    setIsSubmitting(true)
    try {
      await removeOrder({ orderId: order._id })
      toast.success("Commande supprimée.")
      if (controlledOpen === undefined) setInternalOpen(false)
      onOpenChange?.(false)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(error, "Impossible de supprimer la commande.")
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <ClipboardPlus aria-hidden="true" />
              Nouvelle commande
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[94svh] overflow-y-auto rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Suivi des commandes
          </p>
          <DialogTitle className="font-display text-2xl">
            {order ? "Modifier la commande" : "Créer une commande"}
          </DialogTitle>
          <DialogDescription>
            {order?.transactionId
              ? "Corrigez la commande sans perdre la transaction déjà associée."
              : "Une commande prépare un échange futur et ne modifie pas encore le stock."}
          </DialogDescription>
        </DialogHeader>

        {order?.transactionId ? (
          <Alert className="border-primary/30 bg-primary/[0.04]">
            <RefreshCw aria-hidden="true" />
            <AlertTitle>Correction synchronisée</AlertTitle>
            <AlertDescription>
              Les lignes, le total, le personnage, la date, la transaction et le
              stock seront corrigés ensemble.
            </AlertDescription>
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-kind`}>Type de commande</Label>
              <Select
                onValueChange={(value) => {
                  if (value === "client" || value === "supplier") {
                    setKind(value)
                  }
                }}
                value={kind}
              >
                <SelectTrigger className="w-full" id={`${fieldId}-kind`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Commande client</SelectItem>
                  <SelectItem value="supplier">Commande fournisseur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-contact`}>
                {kind === "client" ? "Client" : "Fournisseur"}
              </Label>
              <Input
                id={`${fieldId}-contact`}
                maxLength={100}
                onChange={(event) => setContactName(event.target.value)}
                placeholder={
                  kind === "client" ? "Nom du client" : "Nom du fournisseur"
                }
                required
                value={contactName}
              />
            </div>
          </div>

          {order?.transactionId ? (
            <Card className="gap-0 rounded-none border-primary/25 bg-primary/[0.035] py-0 ring-0">
              <CardContent className="grid gap-4 p-3 sm:grid-cols-2">
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor={`${fieldId}-processed-character`}>
                    Personnage de la transaction
                  </Label>
                  <Select
                    onValueChange={setProcessedCharacterId}
                    value={processedCharacterId}
                  >
                    <SelectTrigger
                      className="w-full"
                      id={`${fieldId}-processed-character`}
                    >
                      <SelectValue placeholder="Choisir un personnage" />
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
                <div className="grid gap-2">
                  <Label htmlFor={`${fieldId}-processed-date`}>
                    {kind === "client"
                      ? "Date du paiement"
                      : "Date de réception"}
                  </Label>
                  <Input
                    id={`${fieldId}-processed-date`}
                    onChange={(event) => setProcessedDate(event.target.value)}
                    required
                    type="date"
                    value={processedDate}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-due-date`}>
                {kind === "client" ? "Livraison prévue" : "Réception prévue"}
              </Label>
              <Input
                id={`${fieldId}-due-date`}
                onChange={(event) => setDueDate(event.target.value)}
                type="date"
                value={dueDate}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-status`}>État</Label>
              <Select
                onValueChange={(value) => {
                  if (orderStatuses.includes(value as OrderStatus)) {
                    setStatus(value as OrderStatus)
                  }
                }}
                value={status}
              >
                <SelectTrigger className="w-full" id={`${fieldId}-status`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orderStatuses.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {formatOrderStatus(entry, kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />
          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <Label>Contenu</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Le prix peut être laissé vide s’il reste à convenir.
                </p>
              </div>
              <Button
                onClick={addLine}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                Ajouter
              </Button>
            </div>

            {lines.map((line, index) => (
              <div
                className="grid gap-3 border-l-2 border-primary/35 pl-3 sm:grid-cols-[minmax(10rem,1fr)_6rem_minmax(14rem,1fr)_auto] sm:items-end"
                key={line.key}
              >
                <div className="grid min-w-0 gap-2">
                  <Label>Produit {index + 1}</Label>
                  <ProductPicker
                    onChange={(value) => selectProduct(line.key, value)}
                    products={
                      kind === "supplier"
                        ? products.filter((product) => product.tracksStock)
                        : products
                    }
                    selectedProductId={line.productId}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${fieldId}-quantity-${line.key}`}>
                    Quantité
                  </Label>
                  <Input
                    id={`${fieldId}-quantity-${line.key}`}
                    min="1"
                    onChange={(event) =>
                      updateLine(line.key, { quantity: event.target.value })
                    }
                    required
                    step="1"
                    type="number"
                    value={line.quantity}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${fieldId}-price-${line.key}`}>
                    Prix unitaire
                  </Label>
                  <PriceInput
                    id={`${fieldId}-price-${line.key}`}
                    onValueChange={(value) =>
                      updateLine(line.key, { unitPrice: value })
                    }
                    value={line.unitPrice}
                  />
                </div>
                <Button
                  aria-label={`Retirer le produit ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => removeLine(line.key)}
                  size="icon-lg"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          {kind === "client" ? (
            <OrderPreparationDetails
              defaultOpen={!order}
              preparation={preparation}
            />
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={`${fieldId}-notes`}>Notes</Label>
            <Textarea
              id={`${fieldId}-notes`}
              maxLength={1000}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Détails utiles pour préparer ou remettre la commande."
              value={notes}
            />
          </div>

          <Card className="gap-0 rounded-none border-primary/25 bg-primary/[0.035] py-0 ring-0">
            <CardContent className="grid gap-4 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.8fr)] sm:items-end">
              <div>
                <p className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                  Total des lignes
                </p>
                <p className="mt-1 font-display text-xl">
                  {automaticTotal === undefined
                    ? "À calculer"
                    : formatSeptims(automaticTotal)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Base indicative avant négociation du montant final.
                </p>
              </div>
              <div className="grid min-w-0 gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`${fieldId}-agreed-total`}>
                    Total convenu
                  </Label>
                  {totalOverridden && automaticTotal !== undefined ? (
                    <Button
                      className="h-auto px-1 py-0 text-xs"
                      onClick={() => {
                        setAgreedTotal("")
                        setTotalOverridden(false)
                      }}
                      type="button"
                      variant="link"
                    >
                      <RefreshCw aria-hidden="true" />
                      Reprendre le calcul
                    </Button>
                  ) : null}
                </div>
                <InputGroup className="bg-background/50">
                  <InputGroupInput
                    id={`${fieldId}-agreed-total`}
                    min="0"
                    onChange={(event) => {
                      setAgreedTotal(event.target.value)
                      setTotalOverridden(true)
                    }}
                    placeholder="À convenir"
                    step="1"
                    type="number"
                    value={displayedTotal}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>septims</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            </CardContent>
          </Card>

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {order && isAdmin && !order.transactionId ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost">
                      <Trash2 aria-hidden="true" />
                      Supprimer
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Supprimer la commande de « {order.contactName} » ?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        La commande et ses lignes seront supprimées. Aucun
                        mouvement de stock n’est lié à cette préparation.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Conserver</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          void deleteOrder()
                        }}
                      >
                        Supprimer la commande
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="ghost"
              >
                Annuler
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : order ? (
                  <Pencil aria-hidden="true" />
                ) : (
                  <ClipboardPlus aria-hidden="true" />
                )}
                {order ? "Enregistrer" : "Créer la commande"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
