import { useMutation } from "convex/react"
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronsUpDown,
  Coins,
  Hammer,
  LoaderCircle,
  Plus,
  ReceiptText,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react"
import { useId, useState, type FormEvent, type ReactElement } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import { type Doc } from "../../convex/_generated/dataModel"
import {
  categoryLabels,
  formatNumber,
  formatQuantity,
  formatSeptims,
} from "@/lib/format"
import { cn } from "@/lib/utils"

export type OperationKind = "production" | "purchase" | "sale" | "service"

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

export function OperationDialog({
  characters,
  initialKind = "sale",
  products,
  trigger,
}: Readonly<{
  characters: readonly Doc<"characters">[]
  initialKind?: OperationKind
  products: readonly Doc<"products">[]
  trigger?: ReactElement
}>) {
  const record = useMutation(api.transactions.record)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<OperationKind>(initialKind)
  const [productId, setProductId] = useState("")
  const [characterId, setCharacterId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unitPrice, setUnitPrice] = useState("")
  const [discount, setDiscount] = useState("")
  const [counterparty, setCounterparty] = useState("")
  const [comment, setComment] = useState("")
  const [occurredOn, setOccurredOn] = useState(todayInputValue)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const config = operationConfigs[kind]
  const availableProducts = products.filter((product) =>
    kind === "service" ? !product.tracksStock : product.tracksStock
  )
  const selectedProduct = products.find((product) => product._id === productId)
  const suggestedPrice =
    kind === "purchase"
      ? selectedProduct?.purchasePrice
      : selectedProduct?.salePrice
  const parsedQuantity = Number(quantity)
  const previewQuantity =
    Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0
  const parsedPrice = unitPrice.trim()
    ? Number(unitPrice)
    : (suggestedPrice ?? 0)
  const previewPrice = Number.isFinite(parsedPrice) ? parsedPrice : 0
  const parsedDiscount = discount.trim() ? Number(discount) : 0
  const previewDiscount = Number.isFinite(parsedDiscount) ? parsedDiscount : 0
  const previewTotal = Math.max(
    0,
    previewQuantity * previewPrice - previewDiscount
  )
  const stockDelta =
    kind === "sale"
      ? -previewQuantity
      : kind === "purchase" || kind === "production"
        ? previewQuantity
        : 0
  const resultingStock = selectedProduct?.tracksStock
    ? selectedProduct.currentStock + stockDelta
    : undefined
  const hasInsufficientStock =
    resultingStock !== undefined && resultingStock < 0

  function resetForm() {
    setProductId("")
    setQuantity("1")
    setUnitPrice("")
    setDiscount("")
    setCounterparty("")
    setComment("")
    setOccurredOn(todayInputValue())
    setDetailsOpen(false)
  }

  function handleKindChange(value: string) {
    if (!isOperationKind(value)) return
    setKind(value)
    setProductId("")
    setUnitPrice("")
    setDiscount("")
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) {
      setKind(initialKind)
      resetForm()
    }
    setOpen(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const product = products.find((entry) => entry._id === productId)
    const character = characters.find((entry) => entry._id === characterId)
    const submittedQuantity = Number(quantity)
    const submittedPrice = unitPrice.trim() ? Number(unitPrice) : undefined
    const submittedDiscount = discount.trim() ? Number(discount) : undefined
    const occurredAt = dateInputToTimestamp(occurredOn)

    if (!product || !character || !occurredAt) {
      toast.error("Choisissez une référence et un personnage.")
      return
    }
    if (!Number.isFinite(submittedQuantity) || submittedQuantity <= 0) {
      toast.error("La quantité doit être supérieure à zéro.")
      return
    }

    setIsSubmitting(true)
    try {
      await record({
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
        ...(submittedPrice === undefined ? {} : { unitPrice: submittedPrice }),
      })
      toast.success(config.successMessage)
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
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <form className="mt-1 grid gap-5" onSubmit={handleSubmit}>
          <Tabs onValueChange={handleKindChange} value={kind}>
            <TabsList
              aria-label="Type d’opération"
              className="h-auto w-full flex-wrap gap-1 bg-[#6e5330]/8 p-1"
            >
              {operationKinds.map((value) => {
                const entry = operationConfigs[value]
                const Icon = entry.icon
                return (
                  <TabsTrigger
                    className="h-10 min-w-[calc(50%-0.25rem)] px-2 sm:min-w-0 data-active:bg-primary data-active:text-primary-foreground"
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

          <ProductPicker
            label={config.productLabel}
            onProductChange={setProductId}
            products={availableProducts}
            selectedProduct={selectedProduct}
          />

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
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
            <div className="grid gap-2">
              <Label htmlFor="operation-quantity">Quantité</Label>
              <Input
                className="h-10 bg-background/50 text-base"
                id="operation-quantity"
                min="0.01"
                onChange={(event) => setQuantity(event.target.value)}
                required
                step="0.01"
                type="number"
                value={quantity}
              />
            </div>
          </div>

          {selectedProduct ? (
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
                  kind === "production" ? "sm:grid-cols-1" : "sm:grid-cols-3"
                )}
              >
                {kind === "production" ? null : (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="operation-unit-price">
                        Prix unitaire, septims
                      </Label>
                      <Input
                        id="operation-unit-price"
                        min="0"
                        onChange={(event) => setUnitPrice(event.target.value)}
                        placeholder={
                          suggestedPrice === undefined
                            ? "Non renseigné"
                            : formatNumber(suggestedPrice)
                        }
                        step="0.01"
                        type="number"
                        value={unitPrice}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="operation-discount">Remise totale</Label>
                      <Input
                        id="operation-discount"
                        min="0"
                        onChange={(event) => setDiscount(event.target.value)}
                        placeholder="0"
                        step="0.01"
                        type="number"
                        value={discount}
                      />
                    </div>
                  </>
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
              disabled={isSubmitting || hasInsufficientStock}
              type="submit"
            >
              {isSubmitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : null}
              {config.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
