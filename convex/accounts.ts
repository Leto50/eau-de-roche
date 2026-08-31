import { v } from "convex/values"

import { type Doc } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { requireAdmin, requireUser } from "./lib/auth"
import { assertFiniteRange, assertWholeNumberRange } from "./lib/numbers"
import {
  DAY_IN_MILLISECONDS,
  startOfUtcWeek,
  WEEK_IN_MILLISECONDS,
} from "./lib/time"

const WEEK_COUNT = 8
const MAX_AMOUNT = 1_000_000_000

const DEFAULT_SETTINGS = {
  cashBalance: 2_183,
  censusPerEmployee: 80,
  employeeCount: 2,
  fundsBalance: 2_713,
  key: "main" as const,
  salaryRate: 0.25,
  taxRate: 0.2,
  weeklyRent: 500,
}

const SALARY_TRANSACTION_KINDS = new Set<Doc<"transactions">["kind"]>([
  "bundle",
  "sale",
  "service",
])

function transactionFlows(transaction: Doc<"transactions">) {
  // Exchange directions describe merchandise: outgoing goods generate revenue,
  // while incoming goods generate an expense for the boutique.
  const incoming = transaction.outgoingTotal ?? Math.max(transaction.total, 0)
  const outgoing =
    transaction.incomingTotal ?? Math.abs(Math.min(transaction.total, 0))
  return { incoming, net: incoming - outgoing, outgoing }
}

function salaryRevenue(transaction: Doc<"transactions">): number {
  if (transaction.orderId || !SALARY_TRANSACTION_KINDS.has(transaction.kind)) {
    return 0
  }
  return Math.max(transactionFlows(transaction).incoming, 0)
}

function calculateSalary(revenue: number, rate: number): number {
  return Math.round((revenue * rate + Number.EPSILON) * 100) / 100
}

function summarizeActors(
  transactions: readonly Doc<"transactions">[],
  salaryRate: number
) {
  const actors = new Map<
    string,
    {
      actorCharacterId?: Doc<"transactions">["actorCharacterId"]
      actorName: string
      incoming: number
      net: number
      outgoing: number
      salaryRevenue: number
      transactionCount: number
    }
  >()

  for (const transaction of transactions) {
    const flows = transactionFlows(transaction)
    if (flows.incoming === 0 && flows.outgoing === 0) continue
    const key = transaction.actorCharacterId ?? `name:${transaction.actorName}`
    const actor = actors.get(key) ?? {
      ...(transaction.actorCharacterId
        ? { actorCharacterId: transaction.actorCharacterId }
        : {}),
      actorName: transaction.actorName,
      incoming: 0,
      net: 0,
      outgoing: 0,
      salaryRevenue: 0,
      transactionCount: 0,
    }
    actor.incoming += flows.incoming
    actor.net += flows.net
    actor.outgoing += flows.outgoing
    actor.salaryRevenue += salaryRevenue(transaction)
    actor.transactionCount += 1
    actors.set(key, actor)
  }

  return [...actors.values()]
    .map((actor) => ({
      ...actor,
      salary: calculateSalary(actor.salaryRevenue, salaryRate),
    }))
    .sort(
      (left, right) =>
        right.incoming - left.incoming ||
        right.net - left.net ||
        left.actorName.localeCompare(right.actorName, "fr")
    )
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const [storedSettings, transactions] = await Promise.all([
      ctx.db
        .query("accountSettings")
        .withIndex("by_key", (index) => index.eq("key", "main"))
        .unique(),
      ctx.db.query("transactions").collect(),
    ])
    const settings = storedSettings ?? DEFAULT_SETTINGS
    const salaryRate = settings.salaryRate ?? DEFAULT_SETTINGS.salaryRate
    const financialTransactions = transactions.filter(
      (transaction) =>
        transaction.kind !== "adjustment" && transaction.kind !== "production"
    )
    const currentWeekStartsAt = startOfUtcWeek(Date.now())
    const weeks = Array.from({ length: WEEK_COUNT }, (_, index) => {
      const startsAt = currentWeekStartsAt - index * WEEK_IN_MILLISECONDS
      const nextWeekStartsAt = startsAt + WEEK_IN_MILLISECONDS
      const endsAt = startsAt + 6.5 * DAY_IN_MILLISECONDS
      const weeklyTransactions = financialTransactions.filter(
        (transaction) =>
          transaction.occurredAt >= startsAt &&
          transaction.occurredAt < nextWeekStartsAt
      )
      const incoming = weeklyTransactions.reduce(
        (total, transaction) => total + transactionFlows(transaction).incoming,
        0
      )
      const outgoing = weeklyTransactions.reduce(
        (total, transaction) => total + transactionFlows(transaction).outgoing,
        0
      )
      const actors = summarizeActors(weeklyTransactions, salaryRate)
      return {
        actors,
        endsAt,
        incoming,
        net: incoming - outgoing,
        outgoing,
        salary: actors.reduce((total, actor) => total + actor.salary, 0),
        salaryRevenue: actors.reduce(
          (total, actor) => total + actor.salaryRevenue,
          0
        ),
        startsAt,
        transactionCount: weeklyTransactions.length,
      }
    })
    const currentWeek = weeks[0]
    const charges = {
      census: settings.censusPerEmployee * settings.employeeCount,
      rent: settings.weeklyRent,
      salary: currentWeek?.salary ?? 0,
      tax: Math.floor((currentWeek?.incoming ?? 0) * settings.taxRate),
    }
    const journalBalance = financialTransactions.reduce(
      (total, transaction) => total + transaction.total,
      0
    )

    return {
      charges: {
        ...charges,
        total: charges.census + charges.rent + charges.salary + charges.tax,
      },
      journalBalance,
      settings: {
        cashBalance: settings.cashBalance,
        censusPerEmployee: settings.censusPerEmployee,
        employeeCount: settings.employeeCount,
        fundsBalance: settings.fundsBalance,
        salaryRate,
        taxRate: settings.taxRate,
        weeklyRent: settings.weeklyRent,
      },
      weeks,
    }
  },
})

export const saveSettings = mutation({
  args: {
    cashBalance: v.number(),
    censusPerEmployee: v.number(),
    employeeCount: v.number(),
    fundsBalance: v.number(),
    salaryRate: v.number(),
    taxRate: v.number(),
    weeklyRent: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx)
    assertWholeNumberRange(
      args.cashBalance,
      0,
      MAX_AMOUNT,
      "La caisse déclarée"
    )
    assertWholeNumberRange(
      args.fundsBalance,
      0,
      MAX_AMOUNT,
      "Les fonds disponibles"
    )
    assertWholeNumberRange(
      args.employeeCount,
      0,
      10_000,
      "Le nombre d’employés"
    )
    assertWholeNumberRange(
      args.weeklyRent,
      0,
      MAX_AMOUNT,
      "Le loyer hebdomadaire"
    )
    assertWholeNumberRange(
      args.censusPerEmployee,
      0,
      MAX_AMOUNT,
      "Le cens par employé"
    )
    assertFiniteRange(args.salaryRate, 0, 1, "Le taux de salaire")
    assertFiniteRange(args.taxRate, 0, 1, "Le taux de taxe")

    const existing = await ctx.db
      .query("accountSettings")
      .withIndex("by_key", (index) => index.eq("key", "main"))
      .unique()
    const details = {
      ...args,
      key: "main" as const,
      updatedAt: Date.now(),
      updatedBy: String(user._id),
    }
    let settingsId
    if (existing) {
      await ctx.db.replace(existing._id, details)
      settingsId = existing._id
    } else {
      settingsId = await ctx.db.insert("accountSettings", details)
    }
    await ctx.db.insert("auditLogs", {
      action: "account.settings_updated",
      actorUserId: String(user._id),
      createdAt: Date.now(),
      detail: `${args.cashBalance}:${args.fundsBalance}:${args.employeeCount}:${args.salaryRate}`,
      entityId: settingsId,
      entityType: "account_settings",
    })
  },
})
