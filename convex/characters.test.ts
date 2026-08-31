import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import { asAuthenticatedUser, createTestBackend } from "./test.helpers"

describe("characters", () => {
  it("crée, renomme, archive puis réactive un personnage", async () => {
    const backend = createTestBackend()
    const admin = await asAuthenticatedUser(backend, "admin")

    const characterId = await admin.mutation(api.characters.save, {
      name: "Veilleur de la boutique",
    })
    await admin.mutation(api.characters.save, {
      characterId,
      name: "Intendant de la boutique",
    })
    await admin.mutation(api.characters.setActive, {
      active: false,
      characterId,
    })
    await admin.mutation(api.characters.setActive, {
      active: true,
      characterId,
    })

    const state = await backend.run(async (ctx) => ({
      audits: await ctx.db.query("auditLogs").collect(),
      character: await ctx.db.get(characterId),
    }))
    expect(state.character).toMatchObject({
      active: true,
      name: "Intendant de la boutique",
    })
    expect(state.audits.map((audit) => audit.action)).toEqual([
      "character.created",
      "character.updated",
      "character.archived",
      "character.reactivated",
    ])
  })

  it("permet à un employé de gérer les personnages", async () => {
    const backend = createTestBackend()
    const employee = await asAuthenticatedUser(backend)

    const characterId = await employee.mutation(api.characters.save, {
      name: "Nouvel intendant",
    })

    expect(await employee.query(api.characters.list, {})).toMatchObject([
      { _id: characterId, name: "Nouvel intendant" },
    ])
  })
})
