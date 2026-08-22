const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatQuantity(value: number): string {
  return `${formatNumber(value)} ${Math.abs(value) === 1 ? "unité" : "unités"}`
}

export function formatSeptims(value: number): string {
  return `${numberFormatter.format(value)} sept.`
}

export function formatDate(value: number): string {
  return dateFormatter.format(new Date(value))
}

export const categoryLabels = {
  annexe: "Annexe",
  ingredient: "Ingrédient",
  potion: "Potion",
  service: "Service",
} as const

export const operationLabels = {
  bundle: "Lot",
  order: "Commande",
  production: "Production",
  purchase: "Achat",
  sale: "Vente",
  service: "Service",
} as const

export const orderStatusLabels = {
  cancelled: "Annulée",
  delivered: "Livrée",
  open: "À préparer",
  ready: "Prête",
} as const
