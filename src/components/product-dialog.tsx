import { useMutation } from "convex/react"
import { Archive, LoaderCircle, PackagePlus, Pencil } from "lucide-react"
import { useId, useState, type FormEvent, type ReactElement } from "react"
import { toast } from "sonner"

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
import { categoryLabels } from "@/lib/format"

type ProductCategory = Doc<"products">["category"]

const categories: readonly ProductCategory[] = [
  "potion",
  "ingredient",
  "annexe",
  "service",
]

function isProductCategory(value: string): value is ProductCategory {
  return categories.some((category) => category === value)
}

function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null
}

export function ProductDialog({
  product,
  trigger,
}: Readonly<{
  product?: Doc<"products">
  trigger?: ReactElement
}>) {
  const saveProduct = useMutation(api.products.save)
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<ProductCategory>("potion")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [salePrice, setSalePrice] = useState("")
  const [minimumStock, setMinimumStock] = useState("0")
  const [targetStock, setTargetStock] = useState("0")
  const [adjustmentReason, setAdjustmentReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tracksStock = category !== "service"
  const stockChanged =
    product !== undefined && Number(targetStock) !== product.currentStock

  function resetForm() {
    setName(product?.name ?? "")
    setCategory(product?.category ?? "potion")
    setPurchasePrice(product?.purchasePrice?.toString() ?? "")
    setSalePrice(product?.salePrice?.toString() ?? "")
    setMinimumStock(product?.minimumStock.toString() ?? "0")
    setTargetStock(product?.currentStock.toString() ?? "0")
    setAdjustmentReason("")
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) resetForm()
    setOpen(nextOpen)
  }

  async function persist(active: boolean) {
    const submittedMinimum = tracksStock ? Number(minimumStock) : 0
    const submittedStock = tracksStock ? Number(targetStock) : 0
    const submittedPurchasePrice = optionalNumber(purchasePrice)
    const submittedSalePrice = optionalNumber(salePrice)

    if (!name.trim()) {
      toast.error("Le nom de la référence est obligatoire.")
      return false
    }
    if (
      !Number.isFinite(submittedMinimum) ||
      !Number.isFinite(submittedStock) ||
      submittedMinimum < 0 ||
      submittedStock < 0 ||
      (submittedPurchasePrice !== null &&
        (!Number.isFinite(submittedPurchasePrice) ||
          submittedPurchasePrice < 0)) ||
      (submittedSalePrice !== null &&
        (!Number.isFinite(submittedSalePrice) || submittedSalePrice < 0))
    ) {
      toast.error(
        "Les prix et les quantités doivent être des nombres positifs."
      )
      return false
    }
    if (stockChanged && !adjustmentReason.trim()) {
      toast.error("Indiquez pourquoi le stock est corrigé.")
      return false
    }

    setIsSubmitting(true)
    try {
      await saveProduct({
        active,
        ...(adjustmentReason.trim() ? { adjustmentReason } : {}),
        category,
        minimumStock: submittedMinimum,
        name: name.trim(),
        ...(product ? { productId: product._id } : {}),
        purchasePrice: submittedPurchasePrice,
        salePrice: submittedSalePrice,
        targetStock: submittedStock,
      })
      toast.success(
        active
          ? product
            ? "Référence mise à jour."
            : "Référence créée."
          : "Référence archivée."
      )
      setOpen(false)
      return true
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d’enregistrer la référence."
      )
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await persist(true)
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PackagePlus aria-hidden="true" />
            Nouvelle référence
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[94svh] overflow-y-auto rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-xl">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Catalogue de la boutique
          </p>
          <DialogTitle className="font-display text-2xl">
            {product ? "Modifier la référence" : "Créer une référence"}
          </DialogTitle>
          <DialogDescription>
            Renseignez ses prix et, si nécessaire, son niveau de stock.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor={`${fieldId}-name`}>Nom</Label>
            <Input
              id={`${fieldId}-name`}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="Potion de vigueur"
              required
              value={name}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${fieldId}-category`}>Famille</Label>
            <Select
              onValueChange={(value) => {
                if (isProductCategory(value)) setCategory(value)
              }}
              value={category}
            >
              <SelectTrigger className="w-full" id={`${fieldId}-category`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {categoryLabels[entry]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-purchase-price`}>
                Prix d’achat, septims
              </Label>
              <Input
                id={`${fieldId}-purchase-price`}
                min="0"
                onChange={(event) => setPurchasePrice(event.target.value)}
                placeholder="Non renseigné"
                step="0.01"
                type="number"
                value={purchasePrice}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-sale-price`}>
                Prix de vente, septims
              </Label>
              <Input
                id={`${fieldId}-sale-price`}
                min="0"
                onChange={(event) => setSalePrice(event.target.value)}
                placeholder="Non renseigné"
                step="0.01"
                type="number"
                value={salePrice}
              />
            </div>
          </div>

          {tracksStock ? (
            <div className="grid gap-4 border-y border-border/70 py-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`${fieldId}-stock`}>Stock actuel</Label>
                <Input
                  id={`${fieldId}-stock`}
                  min="0"
                  onChange={(event) => setTargetStock(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={targetStock}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${fieldId}-minimum-stock`}>
                  Seuil d’alerte
                </Label>
                <Input
                  id={`${fieldId}-minimum-stock`}
                  min="0"
                  onChange={(event) => setMinimumStock(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={minimumStock}
                />
              </div>
              {stockChanged ? (
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor={`${fieldId}-reason`}>
                    Motif de la correction de stock
                  </Label>
                  <Textarea
                    id={`${fieldId}-reason`}
                    maxLength={500}
                    onChange={(event) =>
                      setAdjustmentReason(event.target.value)
                    }
                    placeholder="Inventaire physique, perte, retour…"
                    required
                    value={adjustmentReason}
                  />
                  <p className="text-xs text-muted-foreground">
                    La correction apparaîtra dans le journal d’activité.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {product ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost">
                      <Archive aria-hidden="true" />
                      Archiver
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Archiver « {product.name} » ?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        La référence ne sera plus proposée dans les nouvelles
                        opérations. Son historique sera conservé.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Conserver</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          void persist(false)
                        }}
                      >
                        Archiver la référence
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
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
                ) : product ? (
                  <Pencil aria-hidden="true" />
                ) : (
                  <PackagePlus aria-hidden="true" />
                )}
                {product ? "Enregistrer" : "Créer la référence"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
