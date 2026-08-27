import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { internal } from "./_generated/api"
import { assertAdminContinuity } from "./auth"
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

describe("auth.assertAdminContinuity", () => {
  const lastAdmin = [
    { banned: false, id: "admin-1", role: "admin" },
    { banned: false, id: "employee-1", role: "user" },
  ]

  it.each([
    ["/admin/ban-user", { userId: "admin-1" }],
    ["/admin/remove-user", { userId: "admin-1" }],
    ["/admin/set-role", { role: "user", userId: "admin-1" }],
  ])("bloque %s pour le dernier administrateur actif", async (path, body) => {
    await expect(
      assertAdminContinuity({
        body,
        context: {
          internalAdapter: { listUsers: async () => lastAdmin },
        },
        path,
      })
    ).rejects.toThrowError("dernier administrateur actif")
  })

  it("autorise une rétrogradation lorsqu’un autre administrateur reste actif", async () => {
    await expect(
      assertAdminContinuity({
        body: { role: "user", userId: "admin-1" },
        context: {
          internalAdapter: {
            listUsers: async () => [
              ...lastAdmin,
              { banned: false, id: "admin-2", role: "admin" },
            ],
          },
        },
        path: "/admin/set-role",
      })
    ).resolves.toBeUndefined()
  })
})
