import { ConvexError } from "convex/values"

import { authComponent } from "../auth"
import { type MutationCtx, type QueryCtx } from "../_generated/server"

type AuthenticatedContext = MutationCtx | QueryCtx

export async function requireUser(ctx: AuthenticatedContext) {
  const user = await authComponent.safeGetAuthUser(ctx)
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Vous devez être connecté pour accéder à ces données.",
    })
  }
  return user
}
