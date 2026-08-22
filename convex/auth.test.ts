import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

describe("auth.bootstrapAdmin", () => {
  it("refuse un mot de passe trop court avant de créer un utilisateur", async () => {
    process.env.INITIAL_ADMIN_EMAIL = "administrateur@example.test"
    process.env.INITIAL_ADMIN_PASSWORD = "trop-court"
    const backend = convexTest(schema, modules)
    betterAuthTest.register(backend)

    await expect(
      backend.mutation(internal.auth.bootstrapAdmin, {
        name: "Administrateur test",
      })
    ).rejects.toThrowError("entre 12 et 128 caractères")
  })
})
