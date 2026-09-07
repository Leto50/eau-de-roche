import { spawnSync } from "node:child_process"
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const BUSINESS_TABLES = [
  "accountSettings",
  "auditLogs",
  "bundleItems",
  "bundles",
  "characters",
  "contacts",
  "orderLines",
  "orders",
  "products",
  "recipeIngredients",
  "recipes",
  "stockMovements",
  "systemSettings",
  "transactionLines",
  "transactions",
]
const READ_MODELS_KEY = "read-models-v1"
const PREVIEW_REFERENCE =
  /^(?:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:)?preview\/[A-Za-z0-9._/-]+$/

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

function runConvex(args) {
  const result = spawnSync("pnpm", ["exec", "convex", ...args], {
    encoding: "utf8",
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`La commande Convex a échoué (${args[0]}).`)
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`La commande ${command} a échoué.`)
  }
}

async function filterJsonLines(path, predicate) {
  const content = await readFile(path, "utf8")
  const filtered = content
    .split("\n")
    .filter(Boolean)
    .filter((line) => predicate(JSON.parse(line)))
  await writeFile(path, filtered.length === 0 ? "" : `${filtered.join("\n")}\n`)
}

const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--")
const target = positionalArgs[0]
if (positionalArgs.length !== 1 || !target || !PREVIEW_REFERENCE.test(target)) {
  fail(
    "Usage : pnpm preview:copy-data -- [<équipe>:<projet>:]preview/<nom>\nLa destination doit obligatoirement être un déploiement Convex de preview."
  )
} else {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "eau-de-roche-preview-")
  )
  const sourceArchive = join(temporaryDirectory, "production.zip")
  const extractedDirectory = join(temporaryDirectory, "production")
  const sanitizedDirectory = join(temporaryDirectory, "business-data")
  const sanitizedArchive = join(temporaryDirectory, "business-data.zip")

  try {
    console.log("Export ponctuel de la production…")
    runConvex(["export", "--prod", "--path", sourceArchive])
    await mkdir(extractedDirectory)
    await mkdir(sanitizedDirectory)
    run("bsdtar", ["-xf", sourceArchive, "-C", extractedDirectory])

    await cp(
      join(extractedDirectory, "_tables"),
      join(sanitizedDirectory, "_tables"),
      { recursive: true }
    )
    await filterJsonLines(
      join(sanitizedDirectory, "_tables", "documents.jsonl"),
      (table) => BUSINESS_TABLES.includes(table.name)
    )

    for (const table of BUSINESS_TABLES) {
      await cp(
        join(extractedDirectory, table),
        join(sanitizedDirectory, table),
        {
          recursive: true,
        }
      )
    }
    await filterJsonLines(
      join(sanitizedDirectory, "systemSettings", "documents.jsonl"),
      (setting) => setting.key !== READ_MODELS_KEY
    )

    run("zip", ["-q", "-r", sanitizedArchive, "."], sanitizedDirectory)
    console.log(`Import des seules tables métier vers ${target}…`)
    runConvex([
      "import",
      sanitizedArchive,
      "--deployment",
      target,
      "--replace-all",
      "--yes",
    ])
    runConvex([
      "run",
      "migrations:rebuildReadModels",
      "{}",
      "--deployment",
      target,
    ])
    console.log(
      `Copie terminée vers ${target}. Les composants Better Auth, sessions et JWKS n’ont pas été exportés.`
    )
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}
