import { useMutation, useQuery } from "convex/react"
import { type FunctionReturnType } from "convex/server"
import {
  Archive,
  ArchiveRestore,
  BookPlus,
  Calculator,
  CircleAlert,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import {
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react"
import { toast } from "sonner"

import { ProductPicker } from "@/components/product-picker"
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
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { api } from "../../convex/_generated/api"
import { type Doc } from "../../convex/_generated/dataModel"
import { formatDecimalSeptims } from "@/lib/format"

type Recipe = FunctionReturnType<typeof api.recipes.list>[number]

interface IngredientDraft {
  key: number
  productId: string
  quantity: string
}

export function RecipeDialog({
  products,
  recipe,
  trigger,
}: Readonly<{
  products: readonly Doc<"products">[]
  recipe?: Recipe
  trigger?: ReactElement
}>) {
  const saveRecipe = useMutation(api.recipes.save)
  const setRecipeActive = useMutation(api.recipes.setActive)
  const fieldId = useId()
  const nextLineKey = useRef(1)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [family, setFamily] = useState("")
  const [effect, setEffect] = useState("")
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([
    { key: 0, productId: "", quantity: "1" },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const ingredientProducts = useMemo(
    () => products.filter((product) => product.tracksStock),
    [products]
  )
  const costCalculation = useMemo(() => {
    const missingPrices = new Set<string>()
    let complete = ingredients.length > 0
    let value = 0

    for (const ingredient of ingredients) {
      const product = ingredientProducts.find(
        (entry) => entry._id === ingredient.productId
      )
      const quantity = Number(ingredient.quantity)
      if (
        !product ||
        !Number.isFinite(quantity) ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        complete = false
        continue
      }
      if (product.purchasePrice === undefined) {
        missingPrices.add(product.name)
        continue
      }
      value += product.purchasePrice * quantity
    }

    return {
      cost:
        complete && missingPrices.size === 0 && ingredients.length > 0
          ? value
          : undefined,
      missingPrices: [...missingPrices].sort((left, right) =>
        left.localeCompare(right, "fr")
      ),
    }
  }, [ingredientProducts, ingredients])

  function resetForm() {
    setName(recipe?.name ?? "")
    setFamily(recipe?.family ?? "")
    setEffect(recipe?.effect ?? "")
    if (recipe?.ingredients.length) {
      setIngredients(
        recipe.ingredients.map((ingredient, index) => ({
          key: index,
          productId: ingredient.productId ?? "",
          quantity: ingredient.quantity.toString(),
        }))
      )
      nextLineKey.current = recipe.ingredients.length
      return
    }
    setIngredients([{ key: 0, productId: "", quantity: "1" }])
    nextLineKey.current = 1
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) resetForm()
    setOpen(nextOpen)
  }

  function updateIngredient(key: number, patch: Partial<IngredientDraft>) {
    setIngredients((current) =>
      current.map((ingredient) =>
        ingredient.key === key ? { ...ingredient, ...patch } : ingredient
      )
    )
  }

  function addIngredient() {
    const key = nextLineKey.current
    nextLineKey.current += 1
    setIngredients((current) => [
      ...current,
      { key, productId: "", quantity: "1" },
    ])
  }

  function removeIngredient(key: number) {
    setIngredients((current) =>
      current.filter((ingredient) => ingredient.key !== key)
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const preparedIngredients = ingredients.map((ingredient) => ({
      productId: ingredientProducts.find(
        (product) => product._id === ingredient.productId
      )?._id,
      quantity: Number(ingredient.quantity),
    }))
    if (!name.trim() || !family.trim()) {
      toast.error("Le nom et la famille de la recette sont obligatoires.")
      return
    }
    if (
      preparedIngredients.length === 0 ||
      preparedIngredients.some(
        (ingredient) =>
          !ingredient.productId ||
          !Number.isFinite(ingredient.quantity) ||
          !Number.isInteger(ingredient.quantity) ||
          ingredient.quantity <= 0
      )
    ) {
      toast.error(
        "Chaque ligne doit contenir un ingrédient et une quantité entière."
      )
      return
    }
    const ingredientIds = preparedIngredients.flatMap((ingredient) =>
      ingredient.productId ? [ingredient.productId] : []
    )
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      toast.error("Un ingrédient ne peut apparaître qu’une fois.")
      return
    }
    if (recipe?.productId && ingredientIds.includes(recipe.productId)) {
      toast.error("Un article ne peut pas être son propre ingrédient.")
      return
    }

    setIsSubmitting(true)
    try {
      await saveRecipe({
        effect: effect.trim(),
        family: family.trim(),
        ingredients: preparedIngredients.flatMap((ingredient) =>
          ingredient.productId
            ? [
                {
                  productId: ingredient.productId,
                  quantity: ingredient.quantity,
                },
              ]
            : []
        ),
        name: name.trim(),
        ...(recipe ? { recipeId: recipe._id } : {}),
      })
      toast.success(recipe ? "Recette mise à jour." : "Recette créée.")
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d’enregistrer la recette."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function archiveRecipe() {
    if (!recipe) return
    setIsSubmitting(true)
    try {
      await setRecipeActive({ active: false, recipeId: recipe._id })
      toast.success("Recette archivée.")
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d’archiver la recette."
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
            <BookPlus aria-hidden="true" />
            Nouvelle recette
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[94svh] overflow-y-auto rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Registre de fabrication
          </p>
          <DialogTitle className="font-display text-2xl">
            {recipe ? "Modifier la recette" : "Créer une recette"}
          </DialogTitle>
          <DialogDescription>
            Nommez la préparation et indiquez les ingrédients consommés pour la
            fabriquer.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-name`}>Nom de la recette</Label>
              <Input
                id={`${fieldId}-name`}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="Élixir du veilleur"
                required
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-family`}>Famille</Label>
              <Input
                id={`${fieldId}-family`}
                maxLength={60}
                onChange={(event) => setFamily(event.target.value)}
                placeholder="Poisons, soins, fortifiants…"
                required
                value={family}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${fieldId}-effect`}>Effet ou usage</Label>
            <Textarea
              id={`${fieldId}-effect`}
              maxLength={500}
              onChange={(event) => setEffect(event.target.value)}
              placeholder="Décrivez l’effet utile de cette préparation."
              value={effect}
            />
          </div>

          <Separator />
          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <Label>Ingrédients</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quantités consommées pour une fabrication.
                </p>
              </div>
              <Button
                onClick={addIngredient}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                Ajouter
              </Button>
            </div>

            {ingredients.map((ingredient, index) => (
              <div
                className="flex items-end gap-2 border-l-2 border-primary/35 pl-3"
                key={ingredient.key}
              >
                <div className="grid min-w-0 flex-1 gap-2">
                  <Label>Ingrédient {index + 1}</Label>
                  <ProductPicker
                    onChange={(value) =>
                      updateIngredient(ingredient.key, {
                        productId: value ?? "",
                      })
                    }
                    products={ingredientProducts}
                    selectedProductId={ingredient.productId}
                  />
                </div>
                <div className="grid w-24 gap-2">
                  <Label htmlFor={`${fieldId}-quantity-${ingredient.key}`}>
                    Quantité
                  </Label>
                  <Input
                    id={`${fieldId}-quantity-${ingredient.key}`}
                    min="1"
                    onChange={(event) =>
                      updateIngredient(ingredient.key, {
                        quantity: event.target.value,
                      })
                    }
                    required
                    step="1"
                    type="number"
                    value={ingredient.quantity}
                  />
                </div>
                <Button
                  aria-label={`Retirer l’ingrédient ${index + 1}`}
                  disabled={ingredients.length === 1}
                  onClick={() => removeIngredient(ingredient.key)}
                  size="icon-lg"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          <Card className="gap-0 rounded-none border-primary/20 bg-primary/[0.035] py-0 ring-0">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Calculator
                  aria-hidden="true"
                  className="size-5 shrink-0 text-primary"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Coût matière calculé</p>
                  <p className="text-xs text-muted-foreground">
                    Quantités × prix d’achat actuels des ingrédients.
                  </p>
                </div>
              </div>
              <output className="shrink-0 font-display text-lg text-primary tabular-nums">
                {costCalculation.cost === undefined
                  ? "—"
                  : formatDecimalSeptims(costCalculation.cost)}
              </output>
            </CardContent>
          </Card>

          {costCalculation.missingPrices.length > 0 ? (
            <Alert className="border-[#8a4233]/30 bg-[#8a4233]/5">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Prix d’achat manquant</AlertTitle>
              <AlertDescription>
                Renseignez dans l’inventaire le prix d’achat manquant pour :{" "}
                {costCalculation.missingPrices.join(", ")}.
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {recipe ? (
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
                        Archiver « {recipe.name} » ?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        La recette sera retirée du registre courant, mais son
                        contenu restera disponible dans les archives.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Conserver</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          void archiveRecipe()
                        }}
                      >
                        Archiver la recette
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
                ) : recipe ? (
                  <Pencil aria-hidden="true" />
                ) : (
                  <BookPlus aria-hidden="true" />
                )}
                {recipe ? "Enregistrer" : "Créer la recette"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RecipeArchivesDialog() {
  const archivedRecipes = useQuery(api.recipes.listArchived)
  const setRecipeActive = useMutation(api.recipes.setActive)
  const [restoringId, setRestoringId] = useState<string>()

  async function restoreRecipe(recipe: Recipe) {
    setRestoringId(recipe._id)
    try {
      await setRecipeActive({ active: true, recipeId: recipe._id })
      toast.success(`« ${recipe.name} » est de nouveau disponible.`)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de réactiver la recette."
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
            Registre de fabrication
          </p>
          <DialogTitle className="font-display text-2xl">
            Recettes archivées
          </DialogTitle>
          <DialogDescription>
            Réactivez une recette pour la faire réapparaître dans le registre.
          </DialogDescription>
        </DialogHeader>

        {archivedRecipes === undefined ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chargement des archives…
          </p>
        ) : archivedRecipes.length === 0 ? (
          <Alert className="border-primary/20 bg-primary/[0.04]">
            <ArchiveRestore aria-hidden="true" />
            <AlertTitle>Aucune recette archivée</AlertTitle>
            <AlertDescription>
              Les recettes retirées du registre apparaîtront ici.
            </AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="max-h-80 pr-3">
            <div className="grid divide-y divide-border/70">
              {archivedRecipes.map((recipe) => (
                <div
                  className="flex items-center justify-between gap-3 py-3"
                  key={recipe._id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {recipe.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recipe.family}
                      {recipe.cost === undefined
                        ? " · coût incomplet"
                        : ` · ${formatDecimalSeptims(recipe.cost)}`}
                    </p>
                  </div>
                  <Button
                    disabled={restoringId !== undefined}
                    onClick={() => {
                      void restoreRecipe(recipe)
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {restoringId === recipe._id ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="animate-spin motion-reduce:animate-none"
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
