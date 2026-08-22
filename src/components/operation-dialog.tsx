import { useMutation } from "convex/react"
import { LoaderCircle, Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "../../convex/_generated/api"
import { type Doc } from "../../convex/_generated/dataModel"
import { formatSeptims } from "@/lib/format"

type OperationKind = "production" | "purchase" | "sale" | "service"

const operationOptions: readonly {
  label: string
  value: OperationKind
}[] = [
  { label: "Vente", value: "sale" },
  { label: "Achat", value: "purchase" },
  { label: "Production", value: "production" },
  { label: "Service", value: "service" },
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
  return operationOptions.some((option) => option.value === value)
}

export function OperationDialog({
  characters,
  products,
}: Readonly<{
  characters: readonly Doc<"characters">[]
  products: readonly Doc<"products">[]
}>) {
  const record = useMutation(api.transactions.record)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<OperationKind>("sale")
  const [productId, setProductId] = useState("")
  const [characterId, setCharacterId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unitPrice, setUnitPrice] = useState("")
  const [discount, setDiscount] = useState("")
  const [counterparty, setCounterparty] = useState("")
  const [comment, setComment] = useState("")
  const [occurredOn, setOccurredOn] = useState(todayInputValue)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const availableProducts = products.filter((product) =>
    kind === "service" ? !product.tracksStock : product.tracksStock
  )
  const selectedProduct = products.find((product) => product._id === productId)
  const suggestedPrice =
    kind === "purchase"
      ? selectedProduct?.purchasePrice
      : selectedProduct?.salePrice

  function resetForm() {
    setProductId("")
    setQuantity("1")
    setUnitPrice("")
    setDiscount("")
    setCounterparty("")
    setComment("")
    setOccurredOn(todayInputValue())
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const product = products.find((entry) => entry._id === productId)
    const character = characters.find((entry) => entry._id === characterId)
    const parsedQuantity = Number(quantity)
    const parsedPrice = unitPrice.trim() ? Number(unitPrice) : undefined
    const parsedDiscount = discount.trim() ? Number(discount) : undefined
    const occurredAt = dateInputToTimestamp(occurredOn)

    if (!product || !character || !occurredAt) {
      toast.error("Choisissez un produit, un personnage et une date valides.")
      return
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error("La quantité doit être supérieure à zéro.")
      return
    }

    setIsSubmitting(true)
    try {
      await record({
        characterId: character._id,
        ...(comment.trim() ? { comment } : {}),
        ...(counterparty.trim() ? { counterparty } : {}),
        ...(parsedDiscount === undefined ? {} : { discount: parsedDiscount }),
        kind,
        occurredAt,
        productId: product._id,
        quantity: parsedQuantity,
        ...(parsedPrice === undefined ? {} : { unitPrice: parsedPrice }),
      })
      toast.success("L’opération a été enregistrée.")
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus aria-hidden="true" />
          Nouvelle opération
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Nouvelle opération
          </p>
          <DialogTitle className="font-display text-2xl">
            Ajouter une opération
          </DialogTitle>
          <DialogDescription>
            Le stock sera mis à jour immédiatement après l’enregistrement.
          </DialogDescription>
        </DialogHeader>

        <form className="mt-2 grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="operation-kind">Nature de l’opération</Label>
              <Select
                onValueChange={(value) => {
                  if (!isOperationKind(value)) return
                  setKind(value)
                  setProductId("")
                  setUnitPrice("")
                }}
                value={kind}
              >
                <SelectTrigger
                  className="h-9 w-full bg-background/50"
                  id="operation-kind"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operationOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="operation-character">Personnage</Label>
              <Select onValueChange={setCharacterId} value={characterId}>
                <SelectTrigger
                  className="h-9 w-full bg-background/50"
                  id="operation-character"
                >
                  <SelectValue placeholder="Sélectionner un personnage" />
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
          </div>

          <div className="grid gap-2">
            <Label htmlFor="operation-product">Produit ou service</Label>
            <Select onValueChange={setProductId} value={productId}>
              <SelectTrigger
                className="h-9 w-full bg-background/50"
                id="operation-product"
              >
                <SelectValue placeholder="Sélectionner un produit ou service" />
              </SelectTrigger>
              <SelectContent>
                {availableProducts.map((product) => (
                  <SelectItem key={product._id} value={product._id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantité</Label>
              <Input
                id="quantity"
                min="0.01"
                onChange={(event) => setQuantity(event.target.value)}
                required
                step="0.01"
                type="number"
                value={quantity}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="unit-price">Prix unitaire</Label>
              <Input
                id="unit-price"
                min="0"
                onChange={(event) => setUnitPrice(event.target.value)}
                placeholder={
                  suggestedPrice === undefined
                    ? "0"
                    : formatSeptims(suggestedPrice)
                }
                step="0.01"
                type="number"
                value={unitPrice}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="discount">Remise</Label>
              <Input
                id="discount"
                min="0"
                onChange={(event) => setDiscount(event.target.value)}
                placeholder="0"
                step="0.01"
                type="number"
                value={discount}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="counterparty">Client ou fournisseur</Label>
              <Input
                id="counterparty"
                maxLength={500}
                onChange={(event) => setCounterparty(event.target.value)}
                placeholder="Facultatif"
                value={counterparty}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="occurred-on">Date</Label>
              <Input
                id="occurred-on"
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                type="date"
                value={occurredOn}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="comment">Note interne</Label>
            <Textarea
              id="comment"
              maxLength={500}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Informations complémentaires…"
              rows={3}
              value={comment}
            />
          </div>

          <DialogFooter className="mt-2">
            <Button
              onClick={() => setOpen(false)}
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
              ) : null}
              Enregistrer l’opération
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
