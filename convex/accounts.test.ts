import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import { asAuthenticatedUser, createTestBackend } from "./test.helpers"

async function insertTransaction(
  backend: ReturnType<typeof createTestBackend>,
  occurredAt: number,
  total: number
) {
  await backend.run((ctx) =>
    ctx.db.insert("transactions", {
      actorName: "Comptable test",
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
    await insertTransaction(backend, now, 100)
    await insertTransaction(backend, now, -25)
    await insertTransaction(backend, now - 8 * 24 * 60 * 60 * 1_000, 40)

    const account = await employee.query(api.accounts.overview, {})

    expect(account.settings).toMatchObject({
      cashBalance: 2_183,
      censusPerEmployee: 80,
      employeeCount: 2,
      fundsBalance: 2_713,
      taxRate: 0.2,
      weeklyRent: 500,
    })
    expect(account.weeks[0]).toMatchObject({
      incoming: 100,
      net: 75,
      outgoing: 25,
      transactionCount: 2,
    })
    expect(account.charges).toEqual({
      census: 160,
      rent: 500,
      salary: 0,
      tax: 20,
      total: 680,
    })
    expect(account.journalBalance).toBe(115)
  })

  it("permet à un administrateur de modifier les paramètres", async () => {
    const backend = createTestBackend()
    const admin = await asAuthenticatedUser(backend, "admin")

    await admin.mutation(api.accounts.saveSettings, {
      cashBalance: 3_000,
      censusPerEmployee: 100,
      employeeCount: 3,
      fundsBalance: 4_000,
      salaryPerEmployee: 25,
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
      salaryPerEmployee: 25,
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
        salaryPerEmployee: 0,
        taxRate: 0,
        weeklyRent: 0,
      })
    ).rejects.toThrowError("réservée aux administrateurs")
  })
})
