import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import { asAuthenticatedUser, createTestBackend } from "./test.helpers"

async function insertTransaction(
  backend: ReturnType<typeof createTestBackend>,
  occurredAt: number,
  total: number,
  actorName = "Comptable test"
) {
  await backend.run((ctx) =>
    ctx.db.insert("transactions", {
      actorName,
      kind: total >= 0 ? "sale" : "purchase",
      occurredAt,
      productName: "Écriture test",
      quantity: 1,
      source: "web",
      total,
    })
  )
}

describe("accounts", () => {
  it("calcule le bilan courant et les charges initiales du classeur", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const now = Date.now()
    await insertTransaction(backend, now, 100, "Anoril Aliaria")
    await insertTransaction(backend, now, -25, "Gand Ulf")
    await insertTransaction(backend, now - 8 * 24 * 60 * 60 * 1_000, 40)
    await backend.run(async (ctx) => {
      for (const kind of ["production", "adjustment"] as const) {
        await ctx.db.insert("transactions", {
          actorName: "Alixard Veliane",
          kind,
          occurredAt: now,
          productName: "Mouvement de stock",
          quantity: 1,
          source: "web",
          total: 0,
        })
      }
    })

    const account = await employee.query(api.accounts.overview, {})

    expect(account.settings).toMatchObject({
      cashBalance: 2_183,
      censusPerEmployee: 80,
      employeeCount: 2,
      fundsBalance: 2_713,
      salaryRate: 0.25,
      taxRate: 0.2,
      weeklyRent: 500,
    })
    expect(account.weeks[0]).toMatchObject({
      actors: [
        {
          actorName: "Anoril Aliaria",
          incoming: 100,
          net: 100,
          outgoing: 0,
          salary: 25,
          salaryRevenue: 100,
          transactionCount: 1,
        },
        {
          actorName: "Gand Ulf",
          incoming: 0,
          net: -25,
          outgoing: 25,
          salary: 0,
          salaryRevenue: 0,
          transactionCount: 1,
        },
      ],
      incoming: 100,
      net: 75,
      outgoing: 25,
      salary: 25,
      salaryRevenue: 100,
      transactionCount: 2,
    })
    expect(account.charges).toEqual({
      census: 160,
      rent: 500,
      salary: 25,
      tax: 20,
      total: 705,
    })
    expect(account.journalBalance).toBe(115)
  })

  it("sépare les entrées et sorties brutes d’un échange mixte", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)

    await backend.run((ctx) =>
      ctx.db.insert("transactions", {
        actorName: "Alixard Veliane",
        incomingTotal: 80,
        kind: "exchange",
        occurredAt: Date.now(),
        outgoingTotal: 100,
        productName: "Échange mixte",
        quantity: 2,
        source: "web",
        total: 20,
      })
    )

    const account = await employee.query(api.accounts.overview, {})

    expect(account.weeks[0]).toMatchObject({
      actors: [
        {
          actorName: "Alixard Veliane",
          incoming: 100,
          net: 20,
          outgoing: 80,
          salary: 0,
          salaryRevenue: 0,
          transactionCount: 1,
        },
      ],
      incoming: 100,
      net: 20,
      outgoing: 80,
      salary: 0,
      salaryRevenue: 0,
      transactionCount: 1,
    })
    expect(account.charges.tax).toBe(20)
    expect(account.journalBalance).toBe(20)
  })

  it("calcule les salaires par personnage sur les ventes hors commande", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)
    const now = Date.now()

    await backend.run(async (ctx) => {
      const orderId = await ctx.db.insert("orders", {
        contactName: "Commande exclue",
        kind: "client",
        status: "delivered",
      })
      const transactions = [
        { actorName: "Alix", kind: "sale" as const, total: 100 },
        { actorName: "Alix", kind: "service" as const, total: 20 },
        { actorName: "Gand", kind: "bundle" as const, total: 40 },
        {
          actorName: "Alix",
          incomingTotal: 10,
          kind: "exchange" as const,
          outgoingTotal: 60,
          total: 50,
        },
        { actorName: "Alix", kind: "order" as const, total: 500 },
        {
          actorName: "Alix",
          kind: "sale" as const,
          orderId,
          total: 200,
        },
        { actorName: "Gand", kind: "purchase" as const, total: -10 },
      ]

      for (const transaction of transactions) {
        await ctx.db.insert("transactions", {
          ...transaction,
          occurredAt: now,
          productName: "Écriture test",
          quantity: 1,
          source: "web",
        })
      }
    })

    const account = await employee.query(api.accounts.overview, {})

    expect(account.weeks[0]).toMatchObject({
      actors: [
        {
          actorName: "Alix",
          salary: 30,
          salaryRevenue: 120,
        },
        {
          actorName: "Gand",
          salary: 10,
          salaryRevenue: 40,
        },
      ],
      salary: 40,
      salaryRevenue: 160,
    })
    expect(account.charges.salary).toBe(40)
  })

  it("applique le taux par défaut aux anciens paramètres comptables", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)

    await backend.run((ctx) =>
      ctx.db.insert("accountSettings", {
        cashBalance: 0,
        censusPerEmployee: 0,
        employeeCount: 1,
        fundsBalance: 0,
        key: "main",
        salaryPerEmployee: 250,
        taxRate: 0,
        updatedAt: Date.now(),
        updatedBy: "legacy",
        weeklyRent: 0,
      })
    )
    await insertTransaction(backend, Date.now(), 80, "Alix")

    const account = await employee.query(api.accounts.overview, {})

    expect(account.settings.salaryRate).toBe(0.25)
    expect(account.charges.salary).toBe(20)
  })

  it("permet à un administrateur de modifier les paramètres", async () => {
    const backend = createTestBackend()
    const admin = await asAuthenticatedUser(backend, "admin")

    await admin.mutation(api.accounts.saveSettings, {
      cashBalance: 3_000,
      censusPerEmployee: 100,
      employeeCount: 3,
      fundsBalance: 4_000,
      salaryRate: 0.3,
      taxRate: 0.15,
      weeklyRent: 600,
    })
    const account = await admin.query(api.accounts.overview, {})
    const audits = await backend.run((ctx) =>
      ctx.db.query("auditLogs").collect()
    )

    expect(account.settings).toMatchObject({
      cashBalance: 3_000,
      censusPerEmployee: 100,
      employeeCount: 3,
      fundsBalance: 4_000,
      salaryRate: 0.3,
      taxRate: 0.15,
      weeklyRent: 600,
    })
    expect(audits.at(-1)?.action).toBe("account.settings_updated")
  })

  it("réserve les paramètres comptables aux administrateurs", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)

    await expect(
      employee.mutation(api.accounts.saveSettings, {
        cashBalance: 0,
        censusPerEmployee: 0,
        employeeCount: 0,
        fundsBalance: 0,
        salaryRate: 0,
        taxRate: 0,
        weeklyRent: 0,
      })
    ).rejects.toThrowError("réservée aux administrateurs")
  })

  it("refuse un taux de salaire hors limites", async () => {
    const backend = createTestBackend()
    const admin = await asAuthenticatedUser(backend, "admin")

    await expect(
      admin.mutation(api.accounts.saveSettings, {
        cashBalance: 0,
        censusPerEmployee: 0,
        employeeCount: 0,
        fundsBalance: 0,
        salaryRate: 1.01,
        taxRate: 0,
        weeklyRent: 0,
      })
    ).rejects.toThrowError("Le taux de salaire doit être compris entre 0 et 1")
  })
})
