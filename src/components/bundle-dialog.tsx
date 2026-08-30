import { useMutation, useQuery } from "convex/react"
import { type FunctionReturnType } from "convex/server"
import {
  Archive,
  ArchiveRestore,
  PackagePlus,
  Pencil,
  Plus,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { PriceInput } from "@/components/price-input"
import { ProductPicker } from "@/components/product-picker"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { api } from "../../convex/_generated/api"
import { type Doc } from "../../convex/_generated/dataModel"
import { getUserFacingErrorMessage } from "@/lib/errors"
import { formatSeptims } from "@/lib/format"
import {
  priceDraftFromValue,
  priceDraftToValue,
  type PriceDraft,
} from "@/lib/prices"

type Bundle = FunctionReturnType<typeof api.recipes.listBundles>[number]

interface BundleItemDraft {
  key: number
  productId: string
  quantity: string
}

export function BundleDialog({
  bundle,
  products,
  trigger,
}: Readonly<{
  bundle?: Bundle
  products: readonly Doc<"products">[]
  trigger?: ReactElement
}>) {
  const saveBundle = useMutation(api.bundles.save)
  const setBundleActive = useMutation(api.bundles.setActive)
  const fieldId = useId()
  const nextLineKey = useRef(1)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [price, setPrice] = useState<PriceDraft>(() =>
    priceDraftFromValue(undefined)
  )
  const [items, setItems] = useState<BundleItemDraft[]>([
    { key: 0, productId: "", quantity: "1" },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const availableProducts = products.filter((product) => product.tracksStock)

  function resetForm() {
    setName(bundle?.name ?? "")
    setPrice(priceDraftFromValue(bundle?.price))
    if (bundle?.items.length) {
      setItems(
        bundle.items.map((item, index) => ({
          key: index,
          productId: item.productId ?? "",
          quantity: item.quantity.toString(),
        }))
      )
      nextLineKey.current = bundle.items.length
      return
    }
    setItems([{ key: 0, productId: "", quantity: "1" }])
    nextLineKey.current = 1
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) resetForm()
    setOpen(nextOpen)
  }

  function updateItem(key: number, patch: Partial<BundleItemDraft>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    )
  }

  function addItem() {
    const key = nextLineKey.current
    nextLineKey.current += 1
    setItems((current) => [...current, { key, productId: "", quantity: "1" }])
  }

  function removeItem(key: number) {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const preparedItems = items.map((item) => ({
      productId: availableProducts.find(
        (product) => product._id === item.productId
      )?._id,
      quantity: Number(item.quantity),
    }))
    const submittedPrice = priceDraftToValue(price)

    if (!name.trim()) {
      toast.error("Le nom du lot est obligatoire.")
      return
    }
    if (
      preparedItems.length === 0 ||
      preparedItems.some(
        (item) =>
          !item.productId ||
          !Number.isFinite(item.quantity) ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0
      )
    ) {
      toast.error(
        "Chaque ligne doit contenir un produit et une quantité entière."
      )
      return
    }
    const productIds = preparedItems.flatMap((item) =>
      item.productId ? [item.productId] : []
    )
    if (new Set(productIds).size !== productIds.length) {
      toast.error("Un produit ne peut apparaître qu’une fois dans un lot.")
      return
    }
    if (submittedPrice !== null && !Number.isFinite(submittedPrice)) {
      toast.error(
        "Indiquez un nombre entier de septims pour un nombre entier d’unités."
      )
      return
    }

    setIsSubmitting(true)
    try {
      await saveBundle({
        ...(bundle ? { bundleId: bundle._id } : {}),
        items: preparedItems.flatMap((item) =>
          item.productId
            ? [{ productId: item.productId, quantity: item.quantity }]
            : []
        ),
        name: name.trim(),
        price: submittedPrice,
      })
      toast.success(bundle ? "Lot mis à jour." : "Lot créé.")
      setOpen(false)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(error, "Impossible d’enregistrer le lot.")
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function archiveBundle() {
    if (!bundle) return
    setIsSubmitting(true)
    try {
      await setBundleActive({ active: false, bundleId: bundle._id })
      toast.success("Lot archivé.")
      setOpen(false)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(error, "Impossible d’archiver le lot.")
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PackagePlus aria-hidden="true" />
            Nouveau lot
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[94svh] overflow-y-auto rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Vente groupée
          </p>
          <DialogTitle className="font-display text-2xl">
            {bundle ? "Modifier le lot" : "Créer un lot"}
          </DialogTitle>
          <DialogDescription>
            Un lot possède son propre prix et déstocke ses composants à la
            vente.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-name`}>Nom du lot</Label>
              <Input
                id={`${fieldId}-name`}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nécessaire d’exploration"
                required
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-price`}>Prix du lot</Label>
              <PriceInput
                id={`${fieldId}-price`}
                onValueChange={setPrice}
                value={price}
              />
            </div>
          </div>

          <Separator />
          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <Label>Composition</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quantité consommée pour un lot vendu.
                </p>
              </div>
              <Button
                onClick={addItem}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                Ajouter
              </Button>
            </div>

            {items.map((item, index) => {
              return (
                <div
                  className="flex items-end gap-2 border-l-2 border-primary/35 pl-3"
                  key={item.key}
                >
                  <div className="grid min-w-0 flex-1 gap-2">
                    <Label>Produit {index + 1}</Label>
                    <ProductPicker
                      onChange={(productId) =>
                        updateItem(item.key, { productId: productId ?? "" })
                      }
                      products={availableProducts}
                      selectedProductId={item.productId}
                    />
                  </div>
                  <div className="grid w-24 gap-2">
                    <Label htmlFor={`${fieldId}-quantity-${item.key}`}>
                      Quantité
                    </Label>
                    <Input
                      id={`${fieldId}-quantity-${item.key}`}
                      min="1"
                      onChange={(event) =>
                        updateItem(item.key, { quantity: event.target.value })
                      }
                      required
                      step="1"
                      type="number"
                      value={item.quantity}
                    />
                  </div>
                  <Button
                    aria-label={`Retirer le produit ${index + 1}`}
                    disabled={items.length === 1}
                    onClick={() => removeItem(item.key)}
                    size="icon-lg"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              )
            })}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {bundle ? (
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
                        Archiver « {bundle.name} » ?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Le lot ne sera plus proposé lors des ventes. Les ventes
                        précédentes resteront dans le journal.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Conserver</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          void archiveBundle()
                        }}
                      >
                        Archiver le lot
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
                  <Spinner
                    aria-hidden="true"
                    className="motion-reduce:animate-none"
                  />
                ) : bundle ? (
                  <Pencil aria-hidden="true" />
                ) : (
                  <PackagePlus aria-hidden="true" />
                )}
                {bundle ? "Enregistrer" : "Créer le lot"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function BundleArchivesDialog() {
  const archivedBundles = useQuery(api.bundles.listArchived)
  const setBundleActive = useMutation(api.bundles.setActive)
  const [restoringId, setRestoringId] = useState<string>()

  async function restoreBundle(bundle: Doc<"bundles">) {
    setRestoringId(bundle._id)
    try {
      await setBundleActive({ active: true, bundleId: bundle._id })
      toast.success(`« ${bundle.name} » est de nouveau disponible.`)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(error, "Impossible de réactiver le lot.")
      )
    } finally {
      setRestoringId(undefined)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArchiveRestore aria-hidden="true" />
          Archives
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-lg">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Vente groupée
          </p>
          <DialogTitle className="font-display text-2xl">
            Lots archivés
          </DialogTitle>
          <DialogDescription>
            Réactivez un lot pour le proposer à nouveau lors des ventes.
          </DialogDescription>
        </DialogHeader>

        {archivedBundles === undefined ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chargement des archives…
          </p>
        ) : archivedBundles.length === 0 ? (
          <Alert className="border-primary/20 bg-primary/[0.04]">
            <ArchiveRestore aria-hidden="true" />
            <AlertTitle>Aucun lot archivé</AlertTitle>
            <AlertDescription>
              Les lots retirés de la vente apparaîtront ici.
            </AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="max-h-80 pr-3">
            <div className="grid divide-y divide-border/70">
              {archivedBundles.map((bundle) => (
                <div
                  className="flex items-center justify-between gap-3 py-3"
                  key={bundle._id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {bundle.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bundle.price === undefined
                        ? "Prix non renseigné"
                        : formatSeptims(bundle.price)}
                    </p>
                  </div>
                  <Button
                    disabled={restoringId !== undefined}
                    onClick={() => {
                      void restoreBundle(bundle)
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {restoringId === bundle._id ? (
                      <Spinner
                        aria-hidden="true"
                        className="motion-reduce:animate-none"
                      />
                    ) : (
                      <ArchiveRestore aria-hidden="true" />
                    )}
                    Réactiver
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
