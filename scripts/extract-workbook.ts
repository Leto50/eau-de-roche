import { mkdir, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, resolve } from "node:path"

import ExcelJS, { type Cell, type Worksheet } from "exceljs"

type ProductCategory = "ingredient" | "potion" | "service"
type TransactionKind =
  "bundle" | "order" | "production" | "purchase" | "sale" | "service"

interface ProductSeed {
  category: ProductCategory
  craftable?: boolean
  currentStock: number
  legacyKey: string
  minimumStock: number
  name: string
  normalizedName: string
  purchasePrice?: number
  salePrice?: number
  tracksStock: boolean
}

interface CharacterSeed {
  legacyKey: string
  name: string
}

interface ContactSeed {
  kind: "client" | "supplier"
  legacyKey: string
  name: string
}

interface TransactionSeed {
  actorName: string
  comment?: string
  counterparty?: string
  discount?: number
  kind: TransactionKind
  legacyKey: string
  occurredAt: number
  productName: string
  quantity: number
  total: number
  unitPrice?: number
}

interface OrderLineSeed {
  legacyKey: string
  productName: string
  quantity: number
  total?: number
  unitPrice?: number
}

interface OrderSeed {
  contactName: string
  dueAt?: number
  dueLabel?: string
  kind: "client" | "supplier"
  legacyKey: string
  lines: OrderLineSeed[]
  notes?: string
  status: "delivered" | "open"
  total?: number
}

interface RecipeIngredientSeed {
  ingredientName: string
  legacyKey: string
  quantity: number
  raw: string
}

interface RecipeSeed {
  cost?: number
  effect?: string
  family: string
  ingredients: RecipeIngredientSeed[]
  legacyKey: string
  name: string
}

interface BundleItemSeed {
  legacyKey: string
  productName: string
  quantity: number
}

interface BundleSeed {
  items: BundleItemSeed[]
  legacyKey: string
  name: string
  price?: number
}

interface WorkbookSeed {
  bundles: BundleSeed[]
  characters: CharacterSeed[]
  contacts: ContactSeed[]
  metadata: {
    schemaVersion: 1
    sourceModifiedAt: string
    sourceWorkbook: string
    stats: Record<string, number>
  }
  orders: OrderSeed[]
  products: ProductSeed[]
  recipes: RecipeSeed[]
  transactions: TransactionSeed[]
}

const DEFAULT_WORKBOOK = resolve(
  homedir(),
  "Téléchargements",
  "Inventaire 2.xlsx"
)
const DEFAULT_OUTPUT = resolve("data", "inventaire.seed.json")

const operationKinds: Readonly<Record<string, TransactionKind>> = {
  achat: "purchase",
  commande: "order",
  lot: "bundle",
  production: "production",
  service: "service",
  vente: "sale",
}

function unwrapCell(cell: Cell): unknown {
  const value: unknown = cell.value

  if (value instanceof Date) {
    return value
  }

  if (typeof value === "object" && value !== null && "result" in value) {
    return value.result
  }

  return value
}

function readString(cell: Cell): string | undefined {
  const value = unwrapCell(cell)

  if (typeof value === "string") {
    const text = value.trim()
    return text.length > 0 ? text : undefined
  }

  if (typeof value === "number") {
    return String(value)
  }

  return undefined
}

function parseFraction(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".")
  const mixedMatch = /^(\d+)\s+(\d+)\/(\d+)$/.exec(normalized)

  if (mixedMatch) {
    const whole = Number(mixedMatch[1])
    const numerator = Number(mixedMatch[2])
    const denominator = Number(mixedMatch[3])
    return denominator > 0 ? whole + numerator / denominator : undefined
  }

  const fractionMatch = /^(\d+)\/(\d+)$/.exec(normalized)
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1])
    const denominator = Number(fractionMatch[2])
    return denominator > 0 ? numerator / denominator : undefined
  }

  const number = Number(normalized)
  return Number.isFinite(number) ? number : undefined
}

function readNumber(cell: Cell): number | undefined {
  const value = unwrapCell(cell)

  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    return parseFraction(value)
  }

  if (typeof value === "object" && value !== null && "formula" in value) {
    const formula = value.formula
    if (typeof formula === "string") {
      return parseFraction(formula)
    }
  }

  return undefined
}

function readDate(cell: Cell): Date | undefined {
  const value = unwrapCell(cell)
  return value instanceof Date ? value : undefined
}

function stableDate(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    12
  )
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleLowerCase("fr")
}

function slugify(value: string): string {
  return normalizeName(value).replaceAll(" ", "-")
}

function requireWorksheet(workbook: ExcelJS.Workbook, name: string): Worksheet {
  const worksheet = workbook.getWorksheet(name)
  if (!worksheet) {
    throw new Error(`Feuille introuvable : ${name}`)
  }
  return worksheet
}

function addProduct(
  products: Map<string, ProductSeed>,
  product: Omit<ProductSeed, "legacyKey" | "normalizedName">
): void {
  const normalizedName = normalizeName(product.name)
  if (!normalizedName) return

  const current = products.get(normalizedName)
  products.set(normalizedName, {
    ...current,
    ...product,
    legacyKey: `product:${normalizedName}`,
    normalizedName,
    purchasePrice: product.purchasePrice ?? current?.purchasePrice,
    salePrice: product.salePrice ?? current?.salePrice,
  })
}

function extractProducts(workbook: ExcelJS.Workbook): ProductSeed[] {
  const products = new Map<string, ProductSeed>()
  const reserve = requireWorksheet(workbook, "Réserve")

  for (let rowNumber = 2; rowNumber <= 44; rowNumber += 1) {
    const row = reserve.getRow(rowNumber)
    const potionName = readString(row.getCell(1))
    const ingredientName = readString(row.getCell(5))

    if (potionName && potionName !== "Potions annexe") {
      addProduct(products, {
        category: "potion",
        craftable: rowNumber < 36,
        currentStock: readNumber(row.getCell(2)) ?? 0,
        minimumStock: rowNumber >= 36 ? 2 : 5,
        name: potionName.trim(),
        salePrice: readNumber(row.getCell(3)),
        tracksStock: true,
      })
    }

    if (ingredientName) {
      addProduct(products, {
        category: "ingredient",
        currentStock: readNumber(row.getCell(6)) ?? 0,
        minimumStock: 50,
        name: ingredientName,
        purchasePrice: readNumber(row.getCell(7)),
        tracksStock: true,
      })
    }
  }

  const data = requireWorksheet(workbook, "Données")
  for (let rowNumber = 2; rowNumber <= 182; rowNumber += 1) {
    const row = data.getRow(rowNumber)
    const operation = readString(row.getCell(1))?.toLocaleLowerCase("fr")
    const name = readString(row.getCell(4))
    if (!name || operation !== "service") continue

    addProduct(products, {
      category: "service",
      currentStock: 0,
      minimumStock: 0,
      name,
      salePrice: readNumber(row.getCell(5)),
      tracksStock: false,
    })
  }

  return [...products.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "fr")
  )
}

function extractCharacters(workbook: ExcelJS.Workbook): CharacterSeed[] {
  const data = requireWorksheet(workbook, "Données")
  const names = new Set<string>()

  for (let rowNumber = 2; rowNumber <= 20; rowNumber += 1) {
    const name = readString(data.getCell(rowNumber, 11))
    if (name) names.add(name)
  }

  return [...names]
    .sort((left, right) => left.localeCompare(right, "fr"))
    .map((name) => ({
      legacyKey: `character:${slugify(name)}`,
      name,
    }))
}

function extractTransactions(workbook: ExcelJS.Workbook): TransactionSeed[] {
  const sheet = requireWorksheet(workbook, "Transaction")
  const transactions: TransactionSeed[] = []

  for (let rowNumber = 2; rowNumber <= 500; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const occurredOn = readDate(row.getCell(1))
    const actorName = readString(row.getCell(2))
    const operation = readString(row.getCell(3))?.toLocaleLowerCase("fr")
    const productName = readString(row.getCell(4))
    const quantity = readNumber(row.getCell(5))

    if (!occurredOn || !actorName || !operation || !productName) {
      continue
    }

    const kind = operationKinds[operation]
    if (!kind) continue
    const effectiveQuantity = quantity ?? (kind === "order" ? 1 : undefined)
    if (effectiveQuantity === undefined) continue

    const total = readNumber(row.getCell(8)) ?? readNumber(row.getCell(11)) ?? 0
    const transaction: TransactionSeed = {
      actorName,
      kind,
      legacyKey: `transaction:${rowNumber}`,
      occurredAt: stableDate(occurredOn),
      productName,
      quantity: effectiveQuantity,
      total,
    }
    const discount = readNumber(row.getCell(6))
    const unitPrice = readNumber(row.getCell(7))
    const counterparty = readString(row.getCell(9))
    const comment = readString(row.getCell(10))
    if (discount !== undefined) transaction.discount = discount
    if (unitPrice !== undefined) transaction.unitPrice = unitPrice
    if (counterparty) transaction.counterparty = counterparty
    if (comment) transaction.comment = comment
    transactions.push(transaction)
  }

  return transactions.sort((left, right) => right.occurredAt - left.occurredAt)
}

function orderStatus(dateLabel: string | undefined): "delivered" | "open" {
  return dateLabel?.toLocaleLowerCase("fr").includes("livré")
    ? "delivered"
    : "open"
}

function getOrCreateOrder(
  orders: Map<string, OrderSeed>,
  input: Omit<OrderSeed, "legacyKey" | "lines" | "status"> & {
    signature: string
  }
): OrderSeed {
  const key = `${input.kind}:${slugify(input.signature)}`
  const existing = orders.get(key)
  if (existing) return existing

  const created: OrderSeed = {
    contactName: input.contactName,
    kind: input.kind,
    legacyKey: `order:${key}`,
    lines: [],
    status: orderStatus(input.dueLabel),
  }
  if (input.dueAt !== undefined) created.dueAt = input.dueAt
  if (input.dueLabel) created.dueLabel = input.dueLabel
  if (input.notes) created.notes = input.notes
  if (input.total !== undefined) created.total = input.total
  orders.set(key, created)
  return created
}

function extractOrders(workbook: ExcelJS.Workbook): OrderSeed[] {
  const sheet = requireWorksheet(workbook, "Commandes")
  const orders = new Map<string, OrderSeed>()

  for (let rowNumber = 3; rowNumber <= 80; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const clientName = readString(row.getCell(1))
    const clientProduct = readString(row.getCell(2))
    const clientQuantity = readNumber(row.getCell(3))

    if (clientName && clientProduct && clientQuantity) {
      const dueDate = readDate(row.getCell(6))
      const dueLabel = dueDate ? undefined : readString(row.getCell(6))
      const totalText = readString(row.getCell(5))
      const numericTotal = readNumber(row.getCell(5))
      const signature = [
        clientName,
        totalText,
        dueLabel,
        dueDate?.toISOString(),
      ]
        .filter(Boolean)
        .join(":")
      const order = getOrCreateOrder(orders, {
        contactName: clientName,
        dueAt: dueDate ? stableDate(dueDate) : undefined,
        dueLabel,
        kind: "client",
        notes: readString(row.getCell(7)),
        signature,
        total: numericTotal,
      })
      const line: OrderLineSeed = {
        legacyKey: `order-line:client:${rowNumber}`,
        productName: clientProduct,
        quantity: clientQuantity,
      }
      const lineTotal = readNumber(row.getCell(4))
      if (lineTotal !== undefined) {
        line.total = lineTotal
        line.unitPrice = lineTotal / clientQuantity
      }
      order.lines.push(line)
    }

    const supplierName = readString(row.getCell(10))
    const supplierProduct = readString(row.getCell(11))
    const supplierQuantity = readNumber(row.getCell(12))
    if (!supplierName || !supplierProduct || !supplierQuantity) continue

    const dueDate = readDate(row.getCell(16))
    const dueLabel = dueDate ? undefined : readString(row.getCell(16))
    const numericTotal = readNumber(row.getCell(15))
    const signature = [supplierName, rowNumber].join(":")
    const order = getOrCreateOrder(orders, {
      contactName: supplierName,
      dueAt: dueDate ? stableDate(dueDate) : undefined,
      dueLabel,
      kind: "supplier",
      signature,
      total: numericTotal,
    })
    const line: OrderLineSeed = {
      legacyKey: `order-line:supplier:${rowNumber}`,
      productName: supplierProduct,
      quantity: supplierQuantity,
    }
    const unitPrice = readNumber(row.getCell(13))
    const lineTotal = readNumber(row.getCell(14))
    if (unitPrice !== undefined) line.unitPrice = unitPrice
    if (lineTotal !== undefined) line.total = lineTotal
    order.lines.push(line)
  }

  return [...orders.values()]
}

function parseRecipeIngredient(
  raw: string,
  rowNumber: number,
  columnNumber: number
): RecipeIngredientSeed {
  const match = /^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(raw.trim())
  const quantity = match ? Number(match[1]?.replace(",", ".")) : 1
  const ingredientName = (match?.[2] ?? raw).replace(/[,.]+$/g, "").trim()

  return {
    ingredientName,
    legacyKey: `recipe-ingredient:${rowNumber}:${columnNumber}`,
    quantity,
    raw,
  }
}

function recipeName(family: string, variant: string): string {
  if (
    normalizeName(family) === normalizeName(variant) ||
    (family === "Médicinale" && normalizeName(variant) === "medicinal")
  ) {
    return family
  }
  if (family === "Alcool") return variant
  if (variant === "Potion" || variant === "Breuvage") {
    return `${variant} ${family}`
  }
  return `${family} ${variant}`
}

const recipeFamilyAliases: Readonly<Record<string, string>> = {
  "mana accru": "Magie accrue",
  medicinal: "Médicinale",
  "puissance durable": "Puissance durable",
  "resistance magie": "Résistance magique",
  "vigueur accru": "Vigueur améliorée",
}

function canonicalRecipeFamily(value: string): string {
  return recipeFamilyAliases[normalizeName(value)] ?? value.trim()
}

function extractRecipes(workbook: ExcelJS.Workbook): RecipeSeed[] {
  const sheet = requireWorksheet(workbook, "Recettes")
  const recipes: RecipeSeed[] = []

  for (let rowNumber = 5; rowNumber <= 80; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const rawFamily = readString(row.getCell(1))
    const variant = readString(row.getCell(2))
    if (!rawFamily || !variant) continue
    const family = canonicalRecipeFamily(rawFamily)

    const ingredients = [3, 4, 5, 6]
      .map((columnNumber) => ({
        columnNumber,
        value: readString(row.getCell(columnNumber)),
      }))
      .filter(
        (entry): entry is { columnNumber: number; value: string } =>
          entry.value !== undefined
      )
      .map(({ columnNumber, value }) =>
        parseRecipeIngredient(value, rowNumber, columnNumber)
      )
    const recipe: RecipeSeed = {
      family,
      ingredients,
      legacyKey: `recipe:${rowNumber}`,
      name: recipeName(family, variant),
    }
    const effect = readString(row.getCell(7))
    const cost = readNumber(row.getCell(11))
    if (effect) recipe.effect = effect
    if (cost !== undefined) recipe.cost = cost
    recipes.push(recipe)
  }

  return recipes
}

function includeSupplementalRecipeProducts(
  products: readonly ProductSeed[],
  recipes: readonly RecipeSeed[]
): ProductSeed[] {
  const references = new Set(
    recipes.flatMap((recipe) =>
      recipe.ingredients.map((ingredient) =>
        normalizeName(ingredient.ingredientName)
      )
    )
  )
  const completed = [...products]
  if (
    references.has(normalizeName("Sucrelune")) &&
    !completed.some(
      (product) => product.normalizedName === normalizeName("Sucrelune")
    )
  ) {
    completed.push({
      category: "ingredient",
      currentStock: 0,
      legacyKey: "product:sucrelune",
      minimumStock: 50,
      name: "Sucrelune",
      normalizedName: normalizeName("Sucrelune"),
      tracksStock: true,
    })
  }
  return completed.sort((left, right) =>
    left.name.localeCompare(right.name, "fr")
  )
}

function extractBundles(workbook: ExcelJS.Workbook): BundleSeed[] {
  const sheet = requireWorksheet(workbook, "Lots")
  const bundles: BundleSeed[] = []
  let current: BundleSeed | undefined

  for (let rowNumber = 2; rowNumber <= 80; rowNumber += 1) {
    const label = readString(sheet.getCell(rowNumber, 2))
    if (!label) continue

    if (label.toLocaleLowerCase("fr").startsWith("total")) {
      if (current) bundles.push(current)
      current = undefined
      continue
    }

    const itemMatch = /^(\d+)\s+(.+)$/.exec(label)
    if (itemMatch && current) {
      current.items.push({
        legacyKey: `bundle-item:${rowNumber}`,
        productName: itemMatch[2]?.trim() ?? label,
        quantity: Number(itemMatch[1]),
      })
      continue
    }

    const headingMatch = /^(.+?)\s*:\s*(\d+)?/.exec(label)
    const name = headingMatch?.[1]?.trim() ?? label
    const headingPrice = headingMatch?.[2] ? Number(headingMatch[2]) : undefined
    current = {
      items: [],
      legacyKey: `bundle:${slugify(name)}`,
      name,
    }
    if (headingPrice !== undefined) current.price = headingPrice
  }

  if (current) bundles.push(current)
  return bundles
}

function extractContacts(orders: readonly OrderSeed[]): ContactSeed[] {
  const contacts = new Map<string, ContactSeed>()

  for (const order of orders) {
    const key = `${order.kind}:${normalizeName(order.contactName)}`
    contacts.set(key, {
      kind: order.kind,
      legacyKey: `contact:${key}`,
      name: order.contactName,
    })
  }

  return [...contacts.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "fr")
  )
}

async function main(): Promise<void> {
  const workbookPath = resolve(process.argv[2] ?? DEFAULT_WORKBOOK)
  const outputPath = resolve(process.argv[3] ?? DEFAULT_OUTPUT)
  const workbook = new ExcelJS.Workbook()
  const sourceStat = await stat(workbookPath)
  await workbook.xlsx.readFile(workbookPath)

  const transactions = extractTransactions(workbook)
  const orders = extractOrders(workbook)
  const recipes = extractRecipes(workbook)
  const products = includeSupplementalRecipeProducts(
    extractProducts(workbook),
    recipes
  )
  const bundles = extractBundles(workbook)
  const characters = extractCharacters(workbook)
  const contacts = extractContacts(orders)
  const seed: WorkbookSeed = {
    bundles,
    characters,
    contacts,
    metadata: {
      schemaVersion: 1,
      sourceModifiedAt: sourceStat.mtime.toISOString(),
      sourceWorkbook: basename(workbookPath),
      stats: {
        bundles: bundles.length,
        characters: characters.length,
        contacts: contacts.length,
        orders: orders.length,
        products: products.length,
        recipes: recipes.length,
        transactions: transactions.length,
      },
    },
    orders,
    products,
    recipes,
    transactions,
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8")
  console.info(`Seed généré depuis ${basename(workbookPath)} → ${outputPath}`)
  console.info(seed.metadata.stats)
}

await main()
