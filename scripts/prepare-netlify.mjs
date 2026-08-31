import { access, mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const serverEntryPath = resolve("dist/server/server.js")
const functionPath = resolve(".netlify/v1/functions/server.mjs")
const functionSource = `import serverEntrypoint from "../../../dist/server/server.js"

if (typeof serverEntrypoint?.fetch !== "function") {
  throw new TypeError(
    "The TanStack Start server entry point must expose a fetch function."
  )
}

export default serverEntrypoint.fetch

export const config = {
  name: "L'eau d'Roche SSR",
  generator: "scripts/prepare-netlify.mjs",
  path: "/*",
  preferStatic: true,
}
`

await access(serverEntryPath)
await mkdir(dirname(functionPath), { recursive: true })
await writeFile(functionPath, functionSource, "utf8")

console.info("Point d’entrée SSR Netlify généré.")
