import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

describe("seed.importWorkbook", () => {
  it("refuse un secret invalide avant toute écriture", async () => {
    process.env.SEED_SECRET = "secret-de-test-valide"
    const backend = convexTest(schema, modules)

    await expect(
      backend.mutation(api.seed.importWorkbook, {
        seedSecret: "secret-de-test-invalide",
      })
    ).rejects.toThrowError("L’import initial n’est pas autorisé")

    const products = await backend.run((ctx) =>
      ctx.db.query("products").collect()
    )
    expect(products).toHaveLength(0)
  })
})
