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
  type LucideIcon,
} from "lucide-react"
import { useId, useState, type FormEvent, type ReactElement } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PriceInput } from "@/components/price-input"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api } from "../../convex/_generated/api"
import { type Doc, type Id } from "../../convex/_generated/dataModel"
import {
  categoryLabels,
  formatNumber,
  formatQuantity,
  formatSeptims,
  formatUnitPrice,
} from "@/lib/format"
import {
  priceDraftFromValue,
  priceDraftToValue,
  roundSeptimsDown,
  type PriceDraft,
} from "@/lib/prices"
import { cn } from "@/lib/utils"

export type OperationKind = "production" | "purchase" | "sale" | "service"
type Bundle = FunctionReturnType<typeof api.recipes.listBundles>[number]
type Transaction = FunctionReturnType<typeof api.transactions.list>[number]

interface TradeLine {
  id: string
  kind: "bundle" | "product"
  name: string
  quantity: string
  unitPrice: PriceDraft
}

type TradeMutationLine =
  | {
      kind: "product"
      productId: Id<"products">
      quantity: number
      unitPrice?: number
    }
  | {
      bundleId: Id<"bundles">
      kind: "bundle"
      quantity: number
      unitPrice?: number
    }

interface OperationConfig {
  counterpartyLabel: string
  description: string
  icon: LucideIcon
  label: string
  productLabel: string
  submitLabel: string
  successMessage: string
  title: string
  totalLabel: string
}

const operationConfigs: Readonly<Record<OperationKind, OperationConfig>> = {
  production: {
    counterpartyLabel: "Lot ou provenance",
    description: "Ajoutez les articles fabriqués au stock disponible.",
    icon: Hammer,
    label: "Production",
    productLabel: "Produit fabriqué",
    submitLabel: "Ajouter au stock",
    successMessage: "Production ajoutée au stock.",
    title: "Enregistrer une production",
    totalLabel: "Valeur enregistrée",
  },
  purchase: {
    counterpartyLabel: "Fournisseur",
    description: "Réceptionnez la marchandise et enregistrez la dépense.",
    icon: ArrowDownToLine,
    label: "Achat",
    productLabel: "Produit reçu",
    submitLabel: "Réceptionner l’achat",
    successMessage: "Achat réceptionné.",
    title: "Réceptionner un achat",
    totalLabel: "Dépense",
  },
  sale: {
    counterpartyLabel: "Client",
    description: "Encaissez la vente et retirez les articles du stock.",
    icon: ShoppingBasket,
    label: "Vente",
    productLabel: "Produit vendu",
    submitLabel: "Encaisser la vente",
    successMessage: "Vente enregistrée.",
    title: "Encaisser une vente",
    totalLabel: "À encaisser",
  },
  service: {
    counterpartyLabel: "Client",
    description: "Enregistrez une prestation sans modifier le stock.",
    icon: ReceiptText,
    label: "Service",
    productLabel: "Service réalisé",
    submitLabel: "Facturer le service",
    successMessage: "Service facturé.",
    title: "Facturer un service",
    totalLabel: "À encaisser",
  },
}

const operationKinds: readonly OperationKind[] = [
  "sale",
  "purchase",
  "production",
  "service",
]

const categoryOrder: readonly Doc<"products">["category"][] = [
  "potion",
  "ingredient",
  "annexe",
  "service",
]

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
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = new Date(year, month - 1, day, 12).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function timestampToDateInput(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isOperationKind(value: string): value is OperationKind {
  return Object.hasOwn(operationConfigs, value)
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
              {selectedProduct?.name ?? "Rechercher une référence…"}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 pl-3 text-xs text-muted-foreground">
              {selectedProduct?.tracksStock
                ? `${formatNumber(selectedProduct.currentStock)} en stock`
                : null}
              <ChevronsUpDown aria-hidden="true" className="size-3.5" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] gap-0 rounded-[0.2rem] border-[#6a5436] bg-[#f4e8cf] p-0"
        >
          <Command className="rounded-[0.2rem] bg-transparent">
            <CommandInput placeholder="Nom du produit ou du service…" />
            <CommandList>
              <CommandEmpty>Aucune référence trouvée.</CommandEmpty>
              {categoryOrder.map((category) => {
                const categoryProducts = products.filter(
                  (product) => product.category === category
                )
                if (categoryProducts.length === 0) return null

                return (
                  <CommandGroup
                    heading={categoryLabels[category]}
                    key={category}
                  >
                    {categoryProducts.map((product) => (
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
                        {product.tracksStock ? (
                          <span className="text-[0.68rem] text-muted-foreground tabular-nums">
                            {formatNumber(product.currentStock)} en stock
                          </span>
                        ) : null}
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
  onSelect,
  products,
  tradeKind,
  usedReferences,
}: Readonly<{
  bundles: readonly Bundle[]
  onSelect: (line: TradeLine) => void
  products: readonly Doc<"products">[]
  tradeKind: "purchase" | "sale"
  usedReferences: ReadonlySet<string>
}>) {
  const [open, setOpen] = useState(false)
  const triggerId = useId()
  const availableProducts = products.filter(
    (product) =>
      product.tracksStock && !usedReferences.has(`product:${product._id}`)
  )
  const availableBundles =
    tradeKind === "sale"
      ? bundles.filter((bundle) => !usedReferences.has(`bundle:${bundle._id}`))
      : []

  return (
    <div className="grid gap-2">
      <Label htmlFor={triggerId}>
        {tradeKind === "sale" ? "Produits et lots" : "Produits"}
      </Label>
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
            <span>
              {tradeKind === "sale"
                ? "Ajouter une référence au panier…"
                : "Ajouter un produit à l’achat…"}
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] rounded-[0.2rem] border-[#6a5436] bg-[#f4e8cf] p-0"
        >
          <Command className="rounded-[0.2rem] bg-transparent">
            <CommandInput
              placeholder={
                tradeKind === "sale"
                  ? "Nom du produit ou du lot…"
                  : "Nom du produit…"
              }
            />
            <CommandList>
              <CommandEmpty>Aucune autre référence disponible.</CommandEmpty>
              {availableProducts.length > 0 ? (
                <CommandGroup heading="Produits">
                  {availableProducts.map((product) => (
                    <CommandItem
                      key={product._id}
                      keywords={[
                        product.name,
                        categoryLabels[product.category],
                      ]}
                      onSelect={() => {
                        onSelect({
                          id: product._id,
                          kind: "product",
                          name: product.name,
                          quantity: "1",
                          unitPrice: priceDraftFromValue(
                            tradeKind === "purchase"
                              ? product.purchasePrice
                              : product.salePrice
                          ),
                        })
                        setOpen(false)
                      }}
                      value={product.name}
                    >
                      <ShoppingBasket aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">
                        {product.name}
                      </span>
                      <span className="text-[0.68rem] text-muted-foreground tabular-nums">
                        {formatNumber(product.currentStock)} en stock
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {availableBundles.length > 0 ? (
                <CommandGroup heading="Lots préparés">
                  {availableBundles.map((bundle) => (
                    <CommandItem
                      key={bundle._id}
                      onSelect={() => {
                        onSelect({
                          id: bundle._id,
                          kind: "bundle",
                          name: bundle.name,
                          quantity: "1",
                          unitPrice: priceDraftFromValue(bundle.price),
                        })
                        setOpen(false)
                      }}
                      value={bundle.name}
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
    </div>
  )
}

function TradeCart({
  bundles,
  lines,
  onAdd,
  onRemove,
  onUpdate,
  products,
  tradeKind,
}: Readonly<{
  bundles: readonly Bundle[]
  lines: readonly TradeLine[]
  onAdd: (line: TradeLine) => void
  onRemove: (kind: TradeLine["kind"], id: string) => void
  onUpdate: (
    kind: TradeLine["kind"],
    id: string,
    patch: Partial<TradeLine>
  ) => void
  products: readonly Doc<"products">[]
  tradeKind: "purchase" | "sale"
}>) {
  const usedReferences = new Set(lines.map((line) => `${line.kind}:${line.id}`))

  return (
    <div className="grid gap-3">
      <TradeReferencePicker
        bundles={bundles}
        onSelect={onAdd}
        products={products}
        tradeKind={tradeKind}
        usedReferences={usedReferences}
      />
      {lines.length > 0 ? (
        <Card className="gap-0 rounded-none border-[#5b462b]/30 bg-background/25 py-0 ring-0">
          <CardContent className="divide-y divide-border/70 px-0">
            {lines.map((line) => (
              <div
                className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(15rem,18rem)_2rem] sm:items-end"
                key={`${line.kind}:${line.id}`}
              >
                <div className="min-w-0 self-center">
                  <p className="truncate text-sm font-semibold">{line.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.kind === "bundle" ? "Lot préparé" : "Produit"}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`sale-quantity-${line.kind}-${line.id}`}>
                    Quantité
                  </Label>
                  <Input
                    id={`sale-quantity-${line.kind}-${line.id}`}
                    min="1"
                    onChange={(event) =>
                      onUpdate(line.kind, line.id, {
                        quantity: event.target.value,
                      })
                    }
                    required
                    step="1"
                    type="number"
                    value={line.quantity}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`sale-price-${line.kind}-${line.id}`}>
                    Prix unitaire
                  </Label>
                  <PriceInput
                    id={`sale-price-${line.kind}-${line.id}`}
                    onValueChange={(value) =>
                      onUpdate(line.kind, line.id, {
                        unitPrice: value,
                      })
                    }
                    value={line.unitPrice}
                  />
                </div>
                <Button
                  aria-label={`Retirer ${line.name}`}
                  onClick={() => onRemove(line.kind, line.id)}
                  size="icon-lg"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Alert className="border-[#6a5436]/25 bg-background/25">
          <ShoppingBasket aria-hidden="true" />
          <AlertTitle>Panier vide</AlertTitle>
          <AlertDescription>
            {tradeKind === "sale"
              ? "Ajoutez un ou plusieurs produits ou lots à cette vente."
              : "Ajoutez un ou plusieurs produits à cet achat."}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export function OperationDialog({
  bundles = [],
  characters,
  initialKind = "sale",
  products,
  transaction,
  trigger,
}: Readonly<{
  bundles?: readonly Bundle[]
  characters: readonly Doc<"characters">[]
  initialKind?: OperationKind
  products: readonly Doc<"products">[]
  transaction?: Transaction
  trigger?: ReactElement
}>) {
  const record = useMutation(api.transactions.record)
  const recordTrade = useMutation(api.transactions.recordTrade)
  const updateTransaction = useMutation(api.transactions.update)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<OperationKind>(initialKind)
  const [productId, setProductId] = useState("")
  const [characterId, setCharacterId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unitPrice, setUnitPrice] = useState<PriceDraft>(() =>
    priceDraftFromValue(undefined)
  )
  const [tradeLines, setTradeLines] = useState<TradeLine[]>([])
  const [discount, setDiscount] = useState("")
  const [counterparty, setCounterparty] = useState("")
  const [comment, setComment] = useState("")
  const [occurredOn, setOccurredOn] = useState(todayInputValue)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const config = operationConfigs[kind]
  const usesTradeCart = kind === "purchase" || kind === "sale"
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
  const availableProducts = correctedProducts.filter((product) =>
    kind === "service" ? !product.tracksStock : product.tracksStock
  )
  const selectedProduct = correctedProducts.find(
    (product) => product._id === productId
  )
  const suggestedPrice =
    kind === "purchase"
      ? selectedProduct?.purchasePrice
      : selectedProduct?.salePrice
  const parsedQuantity = Number(quantity)
  const previewQuantity =
    Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0
  const enteredPrice = priceDraftToValue(unitPrice)
  const parsedPrice = enteredPrice ?? suggestedPrice ?? 0
  const previewPrice = Number.isFinite(parsedPrice) ? parsedPrice : 0
  const parsedDiscount = discount.trim() ? Number(discount) : 0
  const previewDiscount = Number.isFinite(parsedDiscount) ? parsedDiscount : 0
  const tradeGross = tradeLines.reduce((total, line) => {
    const lineQuantity = Number(line.quantity)
    const fallbackLinePrice =
      line.kind === "product"
        ? kind === "purchase"
          ? correctedProducts.find((product) => product._id === line.id)
              ?.purchasePrice
          : correctedProducts.find((product) => product._id === line.id)
              ?.salePrice
        : bundles.find((bundle) => bundle._id === line.id)?.price
    const enteredLinePrice = priceDraftToValue(line.unitPrice)
    const linePrice = enteredLinePrice ?? fallbackLinePrice ?? 0
    return (
      total +
      (Number.isFinite(lineQuantity) && Number.isFinite(linePrice)
        ? lineQuantity * linePrice
        : 0)
    )
  }, 0)
  const previewUnroundedTotal = Math.max(
    0,
    (usesTradeCart ? tradeGross : previewQuantity * previewPrice) -
      previewDiscount
  )
  const previewTotal = roundSeptimsDown(previewUnroundedTotal)
  const roundingTolerance =
    Number.EPSILON * Math.max(1, previewUnroundedTotal) * 8
  const isPreviewRounded =
    Math.abs(previewTotal - previewUnroundedTotal) > roundingTolerance
  const stockDelta =
    kind === "sale"
      ? -previewQuantity
      : kind === "purchase" || kind === "production"
        ? previewQuantity
        : 0
  const resultingStock = selectedProduct?.tracksStock
    ? selectedProduct.currentStock + stockDelta
    : undefined
  const hasInsufficientSingleStock =
    resultingStock !== undefined && resultingStock < 0
  const saleStockRequirements = new Map<string, number>()
  for (const line of tradeLines) {
    const lineQuantity = Number(line.quantity)
    if (!Number.isFinite(lineQuantity) || lineQuantity <= 0) continue
    if (line.kind === "product") {
      saleStockRequirements.set(
        line.id,
        (saleStockRequirements.get(line.id) ?? 0) + lineQuantity
      )
      continue
    }
    const bundle = bundles.find((entry) => entry._id === line.id)
    for (const item of bundle?.items ?? []) {
      if (!item.productId) continue
      saleStockRequirements.set(
        item.productId,
        (saleStockRequirements.get(item.productId) ?? 0) +
          item.quantity * lineQuantity
      )
    }
  }
  const insufficientSaleProducts = correctedProducts.filter(
    (product) =>
      (saleStockRequirements.get(product._id) ?? 0) > product.currentStock
  )
  const hasInsufficientStock =
    kind === "sale"
      ? insufficientSaleProducts.length > 0
      : hasInsufficientSingleStock

  function resetForm() {
    const editableKind =
      transaction && isOperationKind(transaction.kind)
        ? transaction.kind
        : initialKind
    setKind(editableKind)
    setProductId(transaction?.productId ?? "")
    setCharacterId(transaction?.actorCharacterId ?? "")
    setQuantity(transaction?.quantity.toString() ?? "1")
    setUnitPrice(priceDraftFromValue(transaction?.unitPrice))
    const existingLines = transaction?.lines.flatMap<TradeLine>((line) => {
      const id = line.kind === "bundle" ? line.bundleId : line.productId
      return id
        ? [
            {
              id,
              kind: line.kind,
              name: line.productName,
              quantity: line.quantity.toString(),
              unitPrice: priceDraftFromValue(line.unitPrice),
            },
          ]
        : []
    })
    const legacySingleLine =
      transaction &&
      (editableKind === "purchase" || editableKind === "sale") &&
      transaction.productId &&
      existingLines?.length === 0
        ? [
            {
              id: transaction.productId,
              kind: "product" as const,
              name: transaction.productName,
              quantity: transaction.quantity.toString(),
              unitPrice: priceDraftFromValue(transaction.unitPrice),
            },
          ]
        : []
    setTradeLines(existingLines?.length ? existingLines : legacySingleLine)
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

  function handleKindChange(value: string) {
    if (!isOperationKind(value)) return
    setKind(value)
    setProductId("")
    setUnitPrice(priceDraftFromValue(undefined))
    setTradeLines([])
    setDiscount("")
  }

  function updateTradeLine(
    lineKind: TradeLine["kind"],
    id: string,
    patch: Partial<TradeLine>
  ) {
    setTradeLines((current) =>
      current.map((line) =>
        line.kind === lineKind && line.id === id ? { ...line, ...patch } : line
      )
    )
  }

  function removeTradeLine(lineKind: TradeLine["kind"], id: string) {
    setTradeLines((current) =>
      current.filter((line) => line.kind !== lineKind || line.id !== id)
    )
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) {
      resetForm()
    }
    setOpen(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const product = products.find((entry) => entry._id === productId)
    const character = characters.find((entry) => entry._id === characterId)
    const submittedQuantity = Number(quantity)
    const parsedSubmittedPrice = priceDraftToValue(unitPrice)
    const submittedPrice = parsedSubmittedPrice ?? undefined
    const submittedDiscount = discount.trim() ? Number(discount) : undefined
    const occurredAt = dateInputToTimestamp(occurredOn)

    if (!character || !occurredAt) {
      toast.error("Choisissez un personnage et une date valide.")
      return
    }
    if (!usesTradeCart && !product) {
      toast.error("Choisissez une référence.")
      return
    }
    if (
      !usesTradeCart &&
      (!Number.isFinite(submittedQuantity) ||
        !Number.isInteger(submittedQuantity) ||
        submittedQuantity <= 0)
    ) {
      toast.error("La quantité doit être un nombre entier supérieur à zéro.")
      return
    }
    if (
      !usesTradeCart &&
      submittedPrice !== undefined &&
      !Number.isFinite(submittedPrice)
    ) {
      toast.error(
        "Indiquez un nombre entier de septims pour un nombre entier d’unités."
      )
      return
    }
    if (usesTradeCart && tradeLines.length === 0) {
      toast.error(
        kind === "sale"
          ? "Ajoutez au moins une référence au panier."
          : "Ajoutez au moins un produit à l’achat."
      )
      return
    }

    setIsSubmitting(true)
    try {
      if (kind === "purchase" || kind === "sale") {
        const preparedLines = tradeLines.flatMap<TradeMutationLine>((line) => {
          const lineQuantity = Number(line.quantity)
          const parsedLinePrice = priceDraftToValue(line.unitPrice)
          const linePrice = parsedLinePrice ?? undefined
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
            const lineProduct = correctedProducts.find(
              (entry) => entry._id === line.id
            )
            return lineProduct
              ? [
                  {
                    kind: "product" as const,
                    productId: lineProduct._id,
                    quantity: lineQuantity,
                    ...(linePrice === undefined
                      ? {}
                      : { unitPrice: linePrice }),
                  },
                ]
              : []
          }
          if (kind === "purchase") return []
          const lineBundle = bundles.find((entry) => entry._id === line.id)
          return lineBundle
            ? [
                {
                  bundleId: lineBundle._id,
                  kind: "bundle" as const,
                  quantity: lineQuantity,
                  ...(linePrice === undefined ? {} : { unitPrice: linePrice }),
                },
              ]
            : []
        })
        if (preparedLines.length !== tradeLines.length) {
          toast.error("Vérifiez les quantités et les prix du panier.")
          return
        }
        const tradeArgs = {
          characterId: character._id,
          ...(comment.trim() ? { comment } : {}),
          ...(counterparty.trim() ? { counterparty } : {}),
          ...(submittedDiscount === undefined
            ? {}
            : { discount: submittedDiscount }),
          kind,
          lines: preparedLines,
          occurredAt,
        }
        if (transaction) {
          await updateTransaction({
            ...tradeArgs,
            transactionId: transaction._id,
          })
        } else {
          await recordTrade(tradeArgs)
        }
      } else if (product) {
        const singleArgs = {
          characterId: character._id,
          ...(comment.trim() ? { comment } : {}),
          ...(counterparty.trim() ? { counterparty } : {}),
          ...(submittedDiscount === undefined
            ? {}
            : { discount: submittedDiscount }),
          kind,
          occurredAt,
          productId: product._id,
          quantity: submittedQuantity,
          ...(submittedPrice === undefined
            ? {}
            : { unitPrice: submittedPrice }),
        }
        if (transaction) {
          await updateTransaction({
            ...singleArgs,
            transactionId: transaction._id,
          })
        } else {
          await record(singleArgs)
        }
      }
      toast.success(
        transaction ? "Opération mise à jour." : config.successMessage
      )
      resetForm()
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d’enregistrer cette opération."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="lg">
            <Plus aria-hidden="true" />
            Nouvelle opération
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[94svh] overflow-y-auto rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Activité de la boutique
          </p>
          <DialogTitle className="font-display text-2xl">
            {transaction ? `Modifier : ${config.label}` : config.title}
          </DialogTitle>
          <DialogDescription>
            {transaction
              ? "Le stock et le montant seront recalculés à partir de cette correction."
              : config.description}
          </DialogDescription>
        </DialogHeader>

        <form className="mt-1 grid gap-5" onSubmit={handleSubmit}>
          <Tabs onValueChange={handleKindChange} value={kind}>
            <TabsList
              aria-label="Type d’opération"
              className="grid h-auto! w-full grid-cols-2 gap-1 bg-[#6e5330]/8 p-1 sm:grid-cols-4"
            >
              {operationKinds.map((value) => {
                const entry = operationConfigs[value]
                const Icon = entry.icon
                return (
                  <TabsTrigger
                    className="h-10 min-w-0 px-2 data-active:bg-primary data-active:text-primary-foreground"
                    key={value}
                    value={value}
                  >
                    <Icon aria-hidden="true" />
                    {entry.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>

          {kind === "purchase" || kind === "sale" ? (
            <TradeCart
              bundles={bundles}
              lines={tradeLines}
              onAdd={(line) => setTradeLines((current) => [...current, line])}
              onRemove={removeTradeLine}
              onUpdate={updateTradeLine}
              products={availableProducts}
              tradeKind={kind}
            />
          ) : (
            <ProductPicker
              label={config.productLabel}
              onProductChange={setProductId}
              products={availableProducts}
              selectedProduct={selectedProduct}
            />
          )}

          <div
            className={cn(
              "grid gap-4",
              !usesTradeCart && "sm:grid-cols-[minmax(0,1fr)_9rem]"
            )}
          >
            <div className="grid gap-2">
              <Label htmlFor="operation-character">Personnage</Label>
              <Select onValueChange={setCharacterId} value={characterId}>
                <SelectTrigger
                  className="h-10 w-full bg-background/50"
                  id="operation-character"
                >
                  <SelectValue placeholder="Qui réalise l’opération ?" />
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
            {usesTradeCart ? null : (
              <div className="grid gap-2">
                <Label htmlFor="operation-quantity">Quantité</Label>
                <Input
                  className="h-10 bg-background/50 text-base"
                  id="operation-quantity"
                  min="1"
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={quantity}
                />
              </div>
            )}
          </div>

          {!usesTradeCart && selectedProduct ? (
            <Alert
              className={cn(
                hasInsufficientStock
                  ? "border-destructive/35 bg-destructive/[0.045]"
                  : "border-primary/25 bg-primary/[0.045]"
              )}
              variant={hasInsufficientStock ? "destructive" : "default"}
            >
              <Coins aria-hidden="true" />
              <AlertTitle>
                {hasInsufficientStock
                  ? "Stock insuffisant"
                  : "Après enregistrement"}
              </AlertTitle>
              <AlertDescription className="flex flex-wrap gap-x-5 gap-y-1">
                {hasInsufficientStock ? (
                  <span>
                    {formatQuantity(selectedProduct.currentStock)} en stock
                  </span>
                ) : resultingStock === undefined ? (
                  <span>Aucun mouvement de stock</span>
                ) : (
                  <span className="tabular-nums">
                    Stock : {formatNumber(resultingStock)}
                  </span>
                )}
                {kind === "production" ? null : (
                  <span>
                    {config.totalLabel} : {formatSeptims(previewTotal)}
                  </span>
                )}
                {kind !== "production" && isPreviewRounded ? (
                  <span className="text-muted-foreground">
                    Arrondi au septim inférieur
                  </span>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : usesTradeCart && tradeLines.length > 0 ? (
            <Alert
              className={cn(
                hasInsufficientStock
                  ? "border-destructive/35 bg-destructive/[0.045]"
                  : "border-primary/25 bg-primary/[0.045]"
              )}
              variant={hasInsufficientStock ? "destructive" : "default"}
            >
              <Coins aria-hidden="true" />
              <AlertTitle>
                {hasInsufficientStock
                  ? "Stock insuffisant"
                  : `${tradeLines.length} ${tradeLines.length === 1 ? "référence" : "références"} ${kind === "sale" ? "dans le panier" : "dans l’achat"}`}
              </AlertTitle>
              <AlertDescription className="flex flex-wrap gap-x-5 gap-y-1">
                <span>
                  {hasInsufficientStock
                    ? `Stock à corriger : ${insufficientSaleProducts.map((product) => product.name).join(", ")}.`
                    : `${config.totalLabel} : ${formatSeptims(previewTotal)}`}
                </span>
                {!hasInsufficientStock && isPreviewRounded ? (
                  <span className="text-muted-foreground">
                    Arrondi au septim inférieur
                  </span>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <Collapsible onOpenChange={setDetailsOpen} open={detailsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                className="w-full justify-between border-y border-border/70 px-1"
                type="button"
                variant="ghost"
              >
                {kind === "production"
                  ? "Date et détails facultatifs"
                  : usesTradeCart
                    ? "Date, remise et détails facultatifs"
                    : "Date, prix et détails facultatifs"}
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
                  kind === "production"
                    ? "sm:grid-cols-1"
                    : usesTradeCart
                      ? "sm:grid-cols-2"
                      : "sm:grid-cols-3"
                )}
              >
                {kind === "production" || usesTradeCart ? null : (
                  <div className="grid gap-2">
                    <Label htmlFor="operation-unit-price">Prix unitaire</Label>
                    <PriceInput
                      id="operation-unit-price"
                      onValueChange={setUnitPrice}
                      value={unitPrice}
                    />
                    {suggestedPrice === undefined ||
                    unitPrice.septims.trim() ? null : (
                      <p className="text-xs text-muted-foreground">
                        Tarif habituel : {formatUnitPrice(suggestedPrice)}
                      </p>
                    )}
                  </div>
                )}
                {kind === "production" ? null : (
                  <div className="grid gap-2">
                    <Label htmlFor="operation-discount">Remise totale</Label>
                    <Input
                      id="operation-discount"
                      min="0"
                      onChange={(event) => setDiscount(event.target.value)}
                      placeholder="0"
                      step="any"
                      type="number"
                      value={discount}
                    />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="operation-date">Date</Label>
                  <Input
                    id="operation-date"
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
                  <Label htmlFor="operation-counterparty">
                    {config.counterpartyLabel}
                  </Label>
                  <Input
                    id="operation-counterparty"
                    maxLength={500}
                    onChange={(event) => setCounterparty(event.target.value)}
                    placeholder="Facultatif"
                    value={counterparty}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="operation-comment">Note interne</Label>
                  <Textarea
                    id="operation-comment"
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
              onClick={() => setOpen(false)}
              type="button"
              variant="ghost"
            >
              Annuler
            </Button>
            <Button
              disabled={
                isSubmitting ||
                hasInsufficientStock ||
                (usesTradeCart && tradeLines.length === 0)
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
              ) : (
                config.submitLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
