import { type Doc } from "../_generated/dataModel"
import { type PreparedExchange } from "./exchange"

export function orderTransactionLabel(
  kind: Doc<"orders">["kind"],
  contactName: string
): string {
  return kind === "client"
    ? `Commande de ${contactName}`
    : `Commande auprès de ${contactName}`
}

export function withOrderTotal(
  prepared: PreparedExchange,
  kind: Doc<"orders">["kind"],
  total: number
): PreparedExchange {
  return {
    ...prepared,
    incomingTotal: kind === "supplier" ? total : 0,
    outgoingTotal: kind === "client" ? total : 0,
    total: kind === "client" ? total : -total,
  }
}
