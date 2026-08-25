import { useMutation } from "convex/react"
import { type FunctionReturnType } from "convex/server"
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronsUpDown,
  Coins,
  Hammer,
  LoaderCircle,
  PackageOpen,
  Pencil,
  Plus,
  ReceiptText,
  ShoppingBasket,
  Trash2,
} from "lucide-react"
import { useId, useState, type FormEvent, type ReactElement } from "react"
import { toast } from "sonner"

import { PriceInput } from "@/components/price-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
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
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { getUserFacingErrorMessage } from "@/lib/errors"
import { categoryLabels, formatNumber, formatSeptims } from "@/lib/format"
import {
  canonicalProductCategory,
  productCategories,
} from "@/lib/product-categories"
import {
  priceDraftFromValue,
  priceDraftToValue,
  roundSeptimsDown,
  type PriceDraft,
} from "@/lib/prices"
import { cn } from "@/lib/utils"
import { api } from "../../convex/_generated/api"
import { type Doc, type Id } from "../../convex/_generated/dataModel"

export type OperationKind =
  "exchange" | "production" | "purchase" | "sale" | "service"

type Bundle = FunctionReturnType<typeof api.recipes.listBundles>[number]
type Transaction = NonNullable<
  FunctionReturnType<typeof api.transactions.getDetails>
>
type TradeDirection = "incoming" | "outgoing"

interface TradeLine {
  direction: TradeDirection
  id: string
  kind: "bundle" | "product"
  name: string
  quantity: string
  unitPrice: PriceDraft
}

type TradeMutationLine =
  | {
      direction: TradeDirection
      kind: "product"
      productId: Id<"products">
      quantity: number
      unitPrice?: number
    }
  | {
      bundleId: Id<"bundles">
      direction: "outgoing"
      kind: "bundle"
      quantity: number
      unitPrice?: number
    }

function todayInputValue(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
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

function timestampToDateInput(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr")
}

function productMatches(product: Doc<"products">, query: string): boolean {
  if (!query) return true
  return normalizeSearch(
    `${product.name} ${categoryLabels[product.category]}`
  ).includes(query)
}

function bundleMatches(bundle: Bundle, query: string): boolean {
  if (!query) return true
  return normalizeSearch(`${bundle.name} lot`).includes(query)
}

function getDefaultDirection(kind: OperationKind): TradeDirection {
  return kind === "purchase" ? "incoming" : "outgoing"
}

function initialTradeLines(
  transaction: Transaction | undefined,
  initialKind: OperationKind
): TradeLine[] {
  const fallbackDirection = getDefaultDirection(
    transaction?.kind === "purchase" ? "purchase" : initialKind
  )
  const existingLines = transaction?.lines.flatMap<TradeLine>((line) => {
    const id = line.kind === "bundle" ? line.bundleId : line.productId
    if (!id) return []
    return [
      {
        direction: line.direction ?? fallbackDirection,
        id,
        kind: line.kind,
        name: line.productName,
        quantity: line.quantity.toString(),
        unitPrice: priceDraftFromValue(line.unitPrice),
      },
    ]
  })
  const legacyLine =
    transaction &&
    transaction.kind !== "production" &&
    transaction.productId &&
    existingLines?.length === 0
      ? [
          {
            direction: fallbackDirection,
            id: transaction.productId,
            kind: "product" as const,
            name: transaction.productName,
            quantity: transaction.quantity.toString(),
            unitPrice: priceDraftFromValue(transaction.unitPrice),
          },
        ]
      : []
  return existingLines?.length ? existingLines : legacyLine
}

interface ProductPickerProps {
  label: string
  onProductChange: (productId: string) => void
  products: readonly Doc<"products">[]
  selectedProduct: Doc<"products"> | undefined
}

function ProductPicker({
  label,
  onProductChange,
  products,
  selectedProduct,
}: Readonly<ProductPickerProps>) {
  const [open, setOpen] = useState(false)
  const triggerId = useId()

  return (
    <div className="grid gap-2">
      <Label htmlFor={triggerId}>{label}</Label>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className="h-10 w-full justify-between bg-background/50 px-3 text-left text-sm font-normal"
            id={triggerId}
            role="combobox"
            type="button"
            variant="outline"
          >
            <span className="min-w-0 truncate">
              {selectedProduct?.name ?? "Rechercher un produit…"}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 pl-3 text-xs text-muted-foreground">
              {selectedProduct
                ? `${formatNumber(selectedProduct.currentStock)} en stock`
                : null}
              <ChevronsUpDown aria-hidden="true" className="size-3.5" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] rounded-[0.2rem] border-[#6a5436] bg-[#f4e8cf] p-0"
        >
          <Command className="rounded-[0.2rem] bg-transparent">
            <CommandInput placeholder="Nom du produit…" />
            <CommandList>
              <CommandEmpty>Aucun produit trouvé.</CommandEmpty>
              {productCategories.map((category) => {
                const entries = products.filter(
                  (product) =>
                    canonicalProductCategory(product.category) === category
                )
                if (entries.length === 0) return null

                return (
                  <CommandGroup
                    heading={categoryLabels[category]}
                    key={category}
                  >
                    {entries.map((product) => (
                      <CommandItem
                        data-checked={selectedProduct?._id === product._id}
                        key={product._id}
                        keywords={[product.name, categoryLabels[category]]}
                        onSelect={() => {
                          onProductChange(product._id)
                          setOpen(false)
                        }}
                        value={product._id}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {product.name}
                        </span>
                        <span className="text-[0.68rem] text-muted-foreground tabular-nums">
                          {formatNumber(product.currentStock)} en stock
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function TradeReferencePicker({
  bundles,
  direction,
  onSelect,
  products,
  usedReferences,
}: Readonly<{
  bundles: readonly Bundle[]
  direction: TradeDirection
  onSelect: (line: TradeLine) => void
  products: readonly Doc<"products">[]
  usedReferences: ReadonlySet<string>
}>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const triggerId = useId()
  const normalizedQuery = normalizeSearch(query)
  const availableProducts = products.filter(
    (product) =>
      (direction === "outgoing" || product.tracksStock) &&
      !usedReferences.has(`${direction}:product:${product._id}`) &&
      productMatches(product, normalizedQuery)
  )
  const availableBundles =
    direction === "outgoing"
      ? bundles.filter(
          (bundle) =>
            !usedReferences.has(`${direction}:bundle:${bundle._id}`) &&
            bundleMatches(bundle, normalizedQuery)
        )
      : []

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery("")
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="h-10 w-full justify-between bg-background/50 px-3 text-left text-sm font-normal"
          id={triggerId}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="truncate">
            {direction === "outgoing"
              ? "Ajouter un produit, un service ou un lot…"
              : "Ajouter un produit acheté…"}
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] rounded-[0.2rem] border-[#6a5436] bg-[#f4e8cf] p-0"
      >
        <Command
          className="rounded-[0.2rem] bg-transparent"
          shouldFilter={false}
        >
          <CommandInput
            onValueChange={setQuery}
            placeholder={
              direction === "outgoing"
                ? "Produit, service ou lot…"
                : "Produit acheté…"
            }
            value={query}
          />
          <CommandList>
            <CommandEmpty>Aucune autre référence disponible.</CommandEmpty>
            {productCategories.map((category) => {
              const entries = availableProducts.filter(
                (product) =>
                  canonicalProductCategory(product.category) === category
              )
              if (entries.length === 0) return null

              return (
                <CommandGroup heading={categoryLabels[category]} key={category}>
                  {entries.map((product) => (
                    <CommandItem
                      key={product._id}
                      onSelect={() => {
                        onSelect({
                          direction,
                          id: product._id,
                          kind: "product",
                          name: product.name,
                          quantity: "1",
                          unitPrice: priceDraftFromValue(
                            direction === "incoming"
                              ? product.purchasePrice
                              : product.salePrice
                          ),
                        })
                        setOpen(false)
                      }}
                      value={`${direction}:product:${product._id}`}
                    >
                      {product.category === "service" ? (
                        <ReceiptText aria-hidden="true" />
                      ) : (
                        <ShoppingBasket aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {product.name}
                      </span>
                      {product.tracksStock ? (
                        <span className="text-[0.68rem] text-muted-foreground tabular-nums">
                          {formatNumber(product.currentStock)} en stock
                        </span>
                      ) : (
                        <span className="text-[0.68rem] text-muted-foreground">
                          Service
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
            {availableBundles.length > 0 ? (
              <CommandGroup heading="Lots préparés">
                {availableBundles.map((bundle) => (
                  <CommandItem
                    key={bundle._id}
                    onSelect={() => {
                      onSelect({
                        direction: "outgoing",
                        id: bundle._id,
                        kind: "bundle",
                        name: bundle.name,
                        quantity: "1",
                        unitPrice: priceDraftFromValue(bundle.price),
                      })
                      setOpen(false)
                    }}
                    value={`outgoing:bundle:${bundle._id}`}
                  >
                    <PackageOpen aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {bundle.name}
                    </span>
                    <span className="text-[0.68rem] text-muted-foreground">
                      Lot
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function TradeCart({
  bundles,
  direction,
  lines,
  onAdd,
  onRemove,
  onUpdate,
  products,
}: Readonly<{
  bundles: readonly Bundle[]
  direction: TradeDirection
  lines: readonly TradeLine[]
  onAdd: (line: TradeLine) => void
  onRemove: (line: TradeLine) => void
  onUpdate: (line: TradeLine, patch: Partial<TradeLine>) => void
  products: readonly Doc<"products">[]
}>) {
  const visibleLines = lines.filter((line) => line.direction === direction)
  const usedReferences = new Set(
    lines.map((line) => `${line.direction}:${line.kind}:${line.id}`)
  )
  const outgoing = direction === "outgoing"

  return (
    <Card className="gap-0 rounded-none border-[#5b462b]/30 bg-background/25 py-0 ring-0">
      <CardHeader className="gap-1 border-b border-border/60 p-4">
        <CardTitle className="flex items-center gap-2 font-display text-lg font-medium">
          {outgoing ? (
            <ShoppingBasket aria-hidden="true" className="size-4" />
          ) : (
            <ArrowDownToLine aria-hidden="true" className="size-4" />
          )}
          {outgoing ? "La boutique vend" : "La boutique achète"}
        </CardTitle>
        <CardDescription>
          {outgoing
            ? "Produits, services et lots remis au client."
            : "Produits reçus du client ou du fournisseur."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 p-4">
        <TradeReferencePicker
          bundles={bundles}
          direction={direction}
          onSelect={onAdd}
          products={products}
          usedReferences={usedReferences}
        />
        {visibleLines.length > 0 ? (
          <div className="divide-y divide-border/70 border-y border-border/70">
            {visibleLines.map((line) => {
              const inputPrefix = `${line.direction}-${line.kind}-${line.id}`
              const product =
                line.kind === "product"
                  ? products.find((entry) => entry._id === line.id)
                  : undefined
              const lineType =
                line.kind === "bundle"
                  ? "Lot préparé"
                  : product?.category === "service"
                    ? "Service"
                    : "Produit"

              return (
                <div className="grid gap-3 py-3" key={inputPrefix}>
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {line.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lineType}
                      </p>
                    </div>
                    <Button
                      aria-label={`Retirer ${line.name}`}
                      onClick={() => onRemove(line)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${inputPrefix}-quantity`}>
                        Quantité
                      </Label>
                      <Input
                        id={`${inputPrefix}-quantity`}
                        min="1"
                        onChange={(event) =>
                          onUpdate(line, { quantity: event.target.value })
                        }
                        required
                        step="1"
                        type="number"
                        value={line.quantity}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${inputPrefix}-price`}>
                        Prix unitaire
                      </Label>
                      <PriceInput
                        id={`${inputPrefix}-price`}
                        onValueChange={(value) =>
                          onUpdate(line, { unitPrice: value })
                        }
                        value={line.unitPrice}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">
            {outgoing ? "Rien à remettre au client." : "Rien à réceptionner."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function OperationDialog({
  bundles = [],
  characters,
  craftableProductIds = [],
  initialKind = "exchange",
  onOpenChange,
  open: controlledOpen,
  products,
  transaction,
  trigger,
}: Readonly<{
  bundles?: readonly Bundle[]
  characters: readonly Doc<"characters">[]
  craftableProductIds?: readonly Id<"products">[]
  initialKind?: OperationKind
  onOpenChange?: (open: boolean) => void
  open?: boolean
  products: readonly Doc<"products">[]
  transaction?: Transaction
  trigger?: ReactElement | null
}>) {
  const recordProduction = useMutation(api.transactions.record)
  const recordExchange = useMutation(api.transactions.recordExchange)
  const updateExchange = useMutation(api.transactions.updateExchange)
  const updateTransaction = useMutation(api.transactions.update)
  const formId = useId()
  const productionMode =
    transaction?.kind === "production" || initialKind === "production"
  const linkedOrderMode = Boolean(transaction?.orderId)
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const [productId, setProductId] = useState(transaction?.productId ?? "")
  const [characterId, setCharacterId] = useState(
    transaction?.actorCharacterId ?? ""
  )
  const [quantity, setQuantity] = useState(
    transaction?.quantity.toString() ?? "1"
  )
  const [tradeLines, setTradeLines] = useState<TradeLine[]>(() =>
    initialTradeLines(transaction, initialKind)
  )
  const [agreedTotal, setAgreedTotal] = useState(
    transaction?.orderId ? Math.abs(transaction.total).toString() : ""
  )
  const [discount, setDiscount] = useState(
    transaction?.discount?.toString() ?? ""
  )
  const [counterparty, setCounterparty] = useState(
    transaction?.counterparty ?? ""
  )
  const [comment, setComment] = useState(transaction?.comment ?? "")
  const [occurredOn, setOccurredOn] = useState(() =>
    transaction
      ? timestampToDateInput(transaction.occurredAt)
      : todayInputValue()
  )
  const [detailsOpen, setDetailsOpen] = useState(Boolean(transaction))
  const [isSubmitting, setIsSubmitting] = useState(false)

  const previousDeltas = new Map(
    transaction?.stockDeltas.map((entry) => [entry.productId, entry.delta]) ??
      []
  )
  const correctedProducts = products.map((product) => {
    const previousDelta = previousDeltas.get(product._id) ?? 0
    return previousDelta === 0
      ? product
      : { ...product, currentStock: product.currentStock - previousDelta }
  })
  const craftableProducts = new Set(craftableProductIds)
  const productionProducts = correctedProducts.filter(
    (product) =>
      product.tracksStock &&
      (craftableProducts.has(product._id) ||
        transaction?.productId === product._id)
  )
  const selectedProduct = productionProducts.find(
    (product) => product._id === productId
  )
  const parsedQuantity = Number(quantity)
  const previewQuantity =
    Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0
  const parsedDiscount = discount.trim() ? Number(discount) : 0
  const previewDiscount = Number.isFinite(parsedDiscount) ? parsedDiscount : 0
  const parsedAgreedTotal = Number(agreedTotal)
  const previewAgreedTotal = Number.isSafeInteger(parsedAgreedTotal)
    ? parsedAgreedTotal
    : 0

  function lineTotal(line: TradeLine): number {
    const quantityValue = Number(line.quantity)
    const fallbackPrice =
      line.kind === "bundle"
        ? bundles.find((bundle) => bundle._id === line.id)?.price
        : line.direction === "incoming"
          ? correctedProducts.find((product) => product._id === line.id)
              ?.purchasePrice
          : correctedProducts.find((product) => product._id === line.id)
              ?.salePrice
    const price = priceDraftToValue(line.unitPrice) ?? fallbackPrice ?? 0
    return Number.isFinite(quantityValue) && Number.isFinite(price)
      ? quantityValue * price
      : 0
  }

  const outgoingGross = tradeLines
    .filter((line) => line.direction === "outgoing")
    .reduce((sum, line) => sum + lineTotal(line), 0)
  const incomingGross = tradeLines
    .filter((line) => line.direction === "incoming")
    .reduce((sum, line) => sum + lineTotal(line), 0)
  const hasOutgoingLines = tradeLines.some(
    (line) => line.direction === "outgoing"
  )
  const hasIncomingLines = tradeLines.some(
    (line) => line.direction === "incoming"
  )
  const outgoingTotal =
    linkedOrderMode && hasOutgoingLines
      ? previewAgreedTotal
      : roundSeptimsDown(Math.max(0, outgoingGross - previewDiscount))
  const incomingTotal =
    linkedOrderMode && hasIncomingLines
      ? previewAgreedTotal
      : roundSeptimsDown(incomingGross)
  const netTotal = outgoingTotal - incomingTotal
  const roundingTolerance =
    Number.EPSILON * Math.max(1, outgoingGross, incomingGross) * 8
  const isPreviewRounded =
    !linkedOrderMode &&
    (Math.abs(outgoingTotal - (outgoingGross - previewDiscount)) >
      roundingTolerance ||
      Math.abs(incomingTotal - incomingGross) > roundingTolerance)

  const stockDeltas = new Map<string, number>()
  for (const line of tradeLines) {
    const lineQuantity = Number(line.quantity)
    if (!Number.isFinite(lineQuantity) || lineQuantity <= 0) continue
    if (line.kind === "product") {
      const product = correctedProducts.find((entry) => entry._id === line.id)
      if (!product?.tracksStock) continue
      stockDeltas.set(
        line.id,
        (stockDeltas.get(line.id) ?? 0) +
          (line.direction === "incoming" ? lineQuantity : -lineQuantity)
      )
      continue
    }
    const bundle = bundles.find((entry) => entry._id === line.id)
    for (const item of bundle?.items ?? []) {
      if (!item.productId) continue
      stockDeltas.set(
        item.productId,
        (stockDeltas.get(item.productId) ?? 0) - item.quantity * lineQuantity
      )
    }
  }
  const insufficientProducts = correctedProducts.filter(
    (product) => product.currentStock + (stockDeltas.get(product._id) ?? 0) < 0
  )
  const productionStock = selectedProduct
    ? selectedProduct.currentStock + previewQuantity
    : undefined
  const invalidDiscount =
    !Number.isFinite(parsedDiscount) ||
    parsedDiscount < 0 ||
    parsedDiscount > outgoingGross
  const invalidAgreedTotal =
    linkedOrderMode &&
    (!Number.isSafeInteger(parsedAgreedTotal) || parsedAgreedTotal < 0)

  function resetForm() {
    setProductId(transaction?.productId ?? "")
    setCharacterId(transaction?.actorCharacterId ?? "")
    setQuantity(transaction?.quantity.toString() ?? "1")
    setTradeLines(initialTradeLines(transaction, initialKind))
    setAgreedTotal(
      transaction?.orderId ? Math.abs(transaction.total).toString() : ""
    )
    setDiscount(transaction?.discount?.toString() ?? "")
    setCounterparty(transaction?.counterparty ?? "")
    setComment(transaction?.comment ?? "")
    setOccurredOn(
      transaction
        ? timestampToDateInput(transaction.occurredAt)
        : todayInputValue()
    )
    setDetailsOpen(Boolean(transaction))
  }

  function updateTradeLine(line: TradeLine, patch: Partial<TradeLine>) {
    setTradeLines((current) =>
      current.map((entry) =>
        entry.direction === line.direction &&
        entry.kind === line.kind &&
        entry.id === line.id
          ? { ...entry, ...patch }
          : entry
      )
    )
  }

  function removeTradeLine(line: TradeLine) {
    setTradeLines((current) =>
      current.filter(
        (entry) =>
          entry.direction !== line.direction ||
          entry.kind !== line.kind ||
          entry.id !== line.id
      )
    )
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) resetForm()
    if (controlledOpen === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  function prepareTradeLines(): TradeMutationLine[] | undefined {
    const prepared = tradeLines.flatMap<TradeMutationLine>((line) => {
      const lineQuantity = Number(line.quantity)
      const linePrice = priceDraftToValue(line.unitPrice) ?? undefined
      if (
        !Number.isFinite(lineQuantity) ||
        !Number.isInteger(lineQuantity) ||
        lineQuantity <= 0 ||
        (linePrice !== undefined &&
          (!Number.isFinite(linePrice) || linePrice < 0))
      ) {
        return []
      }
      if (line.kind === "product") {
        const product = correctedProducts.find((entry) => entry._id === line.id)
        return product
          ? [
              {
                direction: line.direction,
                kind: "product" as const,
                productId: product._id,
                quantity: lineQuantity,
                ...(linePrice === undefined ? {} : { unitPrice: linePrice }),
              },
            ]
          : []
      }
      const bundle = bundles.find((entry) => entry._id === line.id)
      return bundle && line.direction === "outgoing"
        ? [
            {
              bundleId: bundle._id,
              direction: "outgoing" as const,
              kind: "bundle" as const,
              quantity: lineQuantity,
              ...(linePrice === undefined ? {} : { unitPrice: linePrice }),
            },
          ]
        : []
    })
    return prepared.length === tradeLines.length ? prepared : undefined
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const character = characters.find((entry) => entry._id === characterId)
    const occurredAt = dateInputToTimestamp(occurredOn)
    if (!character || !occurredAt) {
      toast.error("Choisissez un personnage et une date valide.")
      return
    }

    setIsSubmitting(true)
    try {
      if (productionMode) {
        const product = productionProducts.find(
          (entry) => entry._id === productId
        )
        if (
          !product ||
          !Number.isFinite(parsedQuantity) ||
          !Number.isInteger(parsedQuantity) ||
          parsedQuantity <= 0
        ) {
          toast.error("Choisissez un produit et une quantité entière valide.")
          return
        }
        const args = {
          characterId: character._id,
          ...(comment.trim() ? { comment } : {}),
          ...(counterparty.trim() ? { counterparty } : {}),
          kind: "production" as const,
          occurredAt,
          productId: product._id,
          quantity: parsedQuantity,
        }
        if (transaction) {
          await updateTransaction({ ...args, transactionId: transaction._id })
        } else {
          await recordProduction(args)
        }
      } else {
        const lines = prepareTradeLines()
        if (!lines || lines.length === 0) {
          toast.error("Ajoutez au moins une ligne et vérifiez ses valeurs.")
          return
        }
        if (invalidAgreedTotal) {
          toast.error("Le total convenu doit être un nombre entier de septims.")
          return
        }
        if (!linkedOrderMode && invalidDiscount) {
          toast.error("La remise doit rester comprise dans le total vendu.")
          return
        }
        const args = {
          ...(linkedOrderMode ? { agreedTotal: parsedAgreedTotal } : {}),
          characterId: character._id,
          ...(comment.trim() ? { comment } : {}),
          ...(counterparty.trim() ? { counterparty } : {}),
          ...(!linkedOrderMode && parsedDiscount > 0
            ? { discount: parsedDiscount }
            : {}),
          lines,
          occurredAt,
        }
        if (transaction) {
          await updateExchange({ ...args, transactionId: transaction._id })
        } else {
          await recordExchange(args)
        }
      }
      toast.success(
        transaction
          ? "Opération mise à jour."
          : productionMode
            ? "Production ajoutée au stock."
            : "Échange enregistré."
      )
      if (controlledOpen === undefined) setInternalOpen(false)
      onOpenChange?.(false)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(
          error,
          "Impossible d’enregistrer cette opération."
        )
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const dialogTitle = productionMode
    ? transaction
      ? "Modifier la production"
      : "Enregistrer une production"
    : transaction
      ? linkedOrderMode
        ? "Modifier la transaction de commande"
        : "Modifier l’échange"
      : "Enregistrer un échange"
  const submitLabel =
    netTotal > 0
      ? `Encaisser ${formatSeptims(netTotal)}`
      : netTotal < 0
        ? `Payer ${formatSeptims(Math.abs(netTotal))}`
        : "Valider l’échange"

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="lg">
              <Plus aria-hidden="true" />
              {productionMode ? "Nouvelle production" : "Nouvel échange"}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[94svh] overflow-y-auto rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Activité de la boutique
          </p>
          <DialogTitle className="font-display text-2xl">
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>
            {transaction
              ? "Le stock et les montants seront recalculés à partir de cette correction."
              : productionMode
                ? "Ajoutez les articles fabriqués au stock disponible."
                : "Réunissez dans le même panier tout ce qui entre et sort de la boutique."}
          </DialogDescription>
        </DialogHeader>

        <form className="mt-1 grid gap-5" onSubmit={handleSubmit}>
          {productionMode ? (
            <>
              <ProductPicker
                label="Produit fabriqué"
                onProductChange={setProductId}
                products={productionProducts}
                selectedProduct={selectedProduct}
              />
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <div className="grid gap-2">
                  <Label htmlFor={`${formId}-character`}>Personnage</Label>
                  <Select onValueChange={setCharacterId} value={characterId}>
                    <SelectTrigger
                      className="h-10 w-full bg-background/50"
                      id={`${formId}-character`}
                    >
                      <SelectValue placeholder="Qui réalise la production ?" />
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
                  <Label htmlFor={`${formId}-quantity`}>Quantité</Label>
                  <Input
                    id={`${formId}-quantity`}
                    min="1"
                    onChange={(event) => setQuantity(event.target.value)}
                    required
                    step="1"
                    type="number"
                    value={quantity}
                  />
                </div>
              </div>
              {selectedProduct ? (
                <Alert className="border-primary/25 bg-primary/[0.045]">
                  <Hammer aria-hidden="true" />
                  <AlertTitle>Après production</AlertTitle>
                  <AlertDescription>
                    Stock : {formatNumber(productionStock ?? 0)}
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <TradeCart
                  bundles={bundles}
                  direction="outgoing"
                  lines={tradeLines}
                  onAdd={(line) =>
                    setTradeLines((current) => [...current, line])
                  }
                  onRemove={removeTradeLine}
                  onUpdate={updateTradeLine}
                  products={correctedProducts}
                />
                <TradeCart
                  bundles={bundles}
                  direction="incoming"
                  lines={tradeLines}
                  onAdd={(line) =>
                    setTradeLines((current) => [...current, line])
                  }
                  onRemove={removeTradeLine}
                  onUpdate={updateTradeLine}
                  products={correctedProducts}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`${formId}-character`}>Personnage</Label>
                <Select onValueChange={setCharacterId} value={characterId}>
                  <SelectTrigger
                    className="h-10 w-full bg-background/50"
                    id={`${formId}-character`}
                  >
                    <SelectValue placeholder="Qui réalise l’échange ?" />
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

              {tradeLines.length > 0 ? (
                <Alert
                  className={cn(
                    insufficientProducts.length > 0
                      ? "border-destructive/35 bg-destructive/[0.045]"
                      : "border-primary/25 bg-primary/[0.045]"
                  )}
                  variant={
                    insufficientProducts.length > 0 ? "destructive" : "default"
                  }
                >
                  <Coins aria-hidden="true" />
                  <AlertTitle>
                    {insufficientProducts.length > 0
                      ? "Stock insuffisant"
                      : netTotal > 0
                        ? `À encaisser : ${formatSeptims(netTotal)}`
                        : netTotal < 0
                          ? `À payer : ${formatSeptims(Math.abs(netTotal))}`
                          : "Échange équilibré"}
                  </AlertTitle>
                  <AlertDescription className="flex flex-wrap gap-x-5 gap-y-1">
                    {insufficientProducts.length > 0 ? (
                      <span>
                        À corriger :{" "}
                        {insufficientProducts
                          .map((product) => product.name)
                          .join(", ")}
                      </span>
                    ) : (
                      <>
                        {outgoingGross > 0 ? (
                          <span>Vendu : {formatSeptims(outgoingTotal)}</span>
                        ) : null}
                        {incomingGross > 0 ? (
                          <span>Acheté : {formatSeptims(incomingTotal)}</span>
                        ) : null}
                        {isPreviewRounded ? (
                          <span className="text-muted-foreground">
                            Arrondi au septim inférieur
                          </span>
                        ) : null}
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          )}

          <Collapsible onOpenChange={setDetailsOpen} open={detailsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                className="w-full justify-between border-y border-border/70 px-1"
                type="button"
                variant="ghost"
              >
                {productionMode
                  ? "Date et détails facultatifs"
                  : linkedOrderMode
                    ? "Date, total convenu et détails"
                    : "Date, remise et détails facultatifs"}
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "transition-transform",
                    detailsOpen && "rotate-180"
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="animate-in pt-4 duration-200 fade-in slide-in-from-top-1 motion-reduce:animate-none">
              <div
                className={cn(
                  "grid gap-4",
                  !productionMode && "sm:grid-cols-2"
                )}
              >
                {!productionMode ? (
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`${formId}-${linkedOrderMode ? "agreed-total" : "discount"}`}
                    >
                      {linkedOrderMode
                        ? "Total convenu de la commande"
                        : "Remise sur ce qui est vendu"}
                    </Label>
                    <Input
                      id={`${formId}-${linkedOrderMode ? "agreed-total" : "discount"}`}
                      min="0"
                      onChange={(event) =>
                        linkedOrderMode
                          ? setAgreedTotal(event.target.value)
                          : setDiscount(event.target.value)
                      }
                      placeholder="0"
                      step={linkedOrderMode ? "1" : "any"}
                      type="number"
                      value={linkedOrderMode ? agreedTotal : discount}
                    />
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <Label htmlFor={`${formId}-date`}>Date</Label>
                  <Input
                    id={`${formId}-date`}
                    onChange={(event) => setOccurredOn(event.target.value)}
                    required
                    type="date"
                    value={occurredOn}
                  />
                </div>
              </div>

              <Separator className="my-4" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`${formId}-counterparty`}>
                    {productionMode
                      ? "Lot ou provenance"
                      : "Client, fournisseur ou interlocuteur"}
                  </Label>
                  <Input
                    id={`${formId}-counterparty`}
                    maxLength={500}
                    onChange={(event) => setCounterparty(event.target.value)}
                    placeholder="Facultatif"
                    value={counterparty}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${formId}-comment`}>Note interne</Label>
                  <Textarea
                    id={`${formId}-comment`}
                    maxLength={500}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Informations utiles…"
                    rows={2}
                    value={comment}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Annuler
            </Button>
            <Button
              disabled={
                isSubmitting ||
                insufficientProducts.length > 0 ||
                (!productionMode &&
                  (tradeLines.length === 0 ||
                    invalidAgreedTotal ||
                    (!linkedOrderMode && invalidDiscount)))
              }
              type="submit"
            >
              {isSubmitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : transaction ? (
                <>
                  <Pencil aria-hidden="true" />
                  Enregistrer les modifications
                </>
              ) : productionMode ? (
                <>
                  <Hammer aria-hidden="true" />
                  Ajouter au stock
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
