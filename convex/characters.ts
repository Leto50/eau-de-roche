import { query } from "./_generated/server"
import { requireUser } from "./lib/auth"

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const characters = await ctx.db.query("characters").collect()
    return characters
      .filter((character) => character.active)
      .sort((left, right) => left.name.localeCompare(right.name, "fr"))
  },
})
