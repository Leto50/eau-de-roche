import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex } from "@convex-dev/better-auth/plugins"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal"
import { admin } from "better-auth/plugins"
import { ConvexError, v } from "convex/values"

import { components } from "./_generated/api"
import { type DataModel } from "./_generated/dataModel"
import { internalMutation, query } from "./_generated/server"
import authConfig from "./auth.config"
import authSchema from "./betterAuth/schema"

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000"

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
  }
)

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
}

function bodyString(
  body: unknown,
  property: "name" | "password" | "role"
): string | undefined {
  if (!isRecord(body)) return undefined
  const value = body[property]
  return typeof value === "string" ? value : undefined
}

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      disableSignUp: true,
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      requireEmailVerification: false,
    },
    hooks: {
      before: createAuthMiddleware(async (requestContext) => {
        if (requestContext.path !== "/admin/create-user") return

        const name = bodyString(requestContext.body, "name")?.trim()
        const password = bodyString(requestContext.body, "password")
        const role = bodyString(requestContext.body, "role")
        if (!name || name.length > 100) {
          throw new APIError("BAD_REQUEST", {
            message: "Le nom doit contenir entre 1 et 100 caractères.",
          })
        }
        if (!password || password.length < 12 || password.length > 128) {
          throw new APIError("BAD_REQUEST", {
            message:
              "Le mot de passe doit contenir entre 12 et 128 caractères.",
          })
        }
        if (role !== "admin" && role !== "user") {
          throw new APIError("BAD_REQUEST", {
            message: "Le rôle doit être employé ou administrateur.",
          })
        }
      }),
    },
    plugins: [convex({ authConfig }), admin()],
    telemetry: {
      enabled: false,
    },
  }) satisfies BetterAuthOptions

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx))

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => authComponent.safeGetAuthUser(ctx),
})

export const bootstrapAdmin = internalMutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
    if (!email) {
      throw new ConvexError({
        code: "MISSING_CONFIGURATION",
        message: "INITIAL_ADMIN_EMAIL doit être configurée.",
      })
    }

    const name = args.name.trim()
    if (!name || name.length > 100) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Le nom doit contenir entre 1 et 100 caractères.",
      })
    }

    const auth = createAuth(ctx)
    const authContext = await auth.$context
    const existing = await authContext.internalAdapter.findUserByEmail(email)
    if (existing) {
      await authContext.internalAdapter.updateUserByEmail(email, {
        role: "admin",
      })
      return { created: false, email, name: existing.user.name }
    }

    const password = process.env.INITIAL_ADMIN_PASSWORD
    if (!password) {
      throw new ConvexError({
        code: "MISSING_CONFIGURATION",
        message: "INITIAL_ADMIN_PASSWORD doit être configurée.",
      })
    }
    if (password.length < 12 || password.length > 128) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Le mot de passe doit contenir entre 12 et 128 caractères.",
      })
    }

    await auth.api.createUser({
      body: {
        email,
        name,
        password,
        role: "admin",
      },
    })

    return { created: true, email, name }
  },
})

export const removeUserByEmail = internalMutation({
  args: {
    confirmation: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase()
    const confirmation = args.confirmation.trim().toLowerCase()
    if (!email || confirmation !== email) {
      throw new ConvexError({
        code: "INVALID_CONFIRMATION",
        message: "L’adresse de confirmation ne correspond pas.",
      })
    }

    const authContext = await createAuth(ctx).$context
    const existing = await authContext.internalAdapter.findUserByEmail(email)
    if (!existing) return { email, removed: false }

    await authContext.internalAdapter.deleteUser(existing.user.id)
    return { email, removed: true }
  },
})
