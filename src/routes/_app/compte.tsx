import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Landmark,
  ReceiptText,
  Scale,
  UsersRound,
} from "lucide-react"

import { AccountSettingsDialog } from "@/components/account-settings-dialog"
import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/page-skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "../../../convex/_generated/api"
import { useHydrated } from "@/hooks/use-hydrated"
import { authClient } from "@/lib/auth-client"
import { formatDecimalSeptims, formatNumber, formatSeptims } from "@/lib/format"
import { cn } from "@/lib/utils"

const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
})

function formatWeek(startsAt: number, endsAt: number): string {
  return `Du ${shortDateFormatter.format(startsAt)} au ${shortDateFormatter.format(endsAt)}`
}

export const Route = createFileRoute("/_app/compte")({
  component: AccountPage,
  errorComponent: PageError,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.accounts.overview, {})
    )
  },
  pendingComponent: PageSkeleton,
})

function AccountPage() {
  const { data: session } = authClient.useSession()
  const isHydrated = useHydrated()
  const { data } = useSuspenseQuery(convexQuery(api.accounts.overview, {}))
  const isAdmin =
    isHydrated && (session?.user.role?.split(",").includes("admin") ?? false)
  const currentWeek = data.weeks[0]
  const resultAfterCharges = (currentWeek?.net ?? 0) - data.charges.total

  return (
    <div className="animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <PageHeader
        action={
          isAdmin ? <AccountSettingsDialog settings={data.settings} /> : null
        }
        eyebrow="Tenue de boutique"
        title="Compte"
      >
        Suivez les entrées, les sorties et les charges de L’eau de Roche sans
        refaire les calculs du classeur.
      </PageHeader>

      <section className="mt-7 grid gap-4 md:grid-cols-3">
        <AccountMetric
          description="Montant compté manuellement"
          icon={Coins}
          label="Caisse déclarée"
          value={formatDecimalSeptims(data.settings.cashBalance)}
        />
        <AccountMetric
          description="Réserve disponible déclarée"
          icon={Landmark}
          label="Fonds"
          value={formatDecimalSeptims(data.settings.fundsBalance)}
        />
        <AccountMetric
          description="Somme de toutes les transactions"
          icon={Scale}
          label="Solde du journal"
          tone={data.journalBalance >= 0 ? "positive" : "negative"}
          value={formatSeptims(data.journalBalance)}
        />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        <Card className="rounded-none border-[#5b462b]/35 bg-[#fff8e7]/30 py-0 ring-0">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="flex items-center gap-2 font-display text-xl">
              <ReceiptText aria-hidden="true" className="size-5 text-primary" />
              Bilan hebdomadaire
            </CardTitle>
            <CardDescription>
              Les huit dernières semaines, calculées depuis le journal.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 max-md:hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#684f2d]/8 hover:bg-[#684f2d]/8">
                  <TableHead className="pl-4">Semaine</TableHead>
                  <TableHead className="text-right">Entrées</TableHead>
                  <TableHead className="text-right">Sorties</TableHead>
                  <TableHead className="pr-4 text-right">Solde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.weeks.map((week, index) => (
                  <TableRow className="border-[#5b462b]/20" key={week.startsAt}>
                    <TableCell className="pl-4">
                      <p className="font-semibold">
                        {formatWeek(week.startsAt, week.endsAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(week.transactionCount)} mouvement
                        {week.transactionCount === 1 ? "" : "s"}
                      </p>
                      {index === 0 ? (
                        <Badge className="mt-1" variant="outline">
                          Semaine en cours
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-[#456044] tabular-nums">
                      {formatSeptims(week.incoming)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-[#8a3e2f] tabular-nums">
                      {formatSeptims(week.outgoing)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "pr-4 text-right font-display text-base tabular-nums",
                        week.net >= 0 ? "text-[#456044]" : "text-[#8a3e2f]"
                      )}
                    >
                      {week.net > 0 ? "+" : ""}
                      {formatSeptims(week.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardContent className="grid divide-y divide-border/70 px-0 py-0 md:hidden">
            {data.weeks.map((week, index) => (
              <div className="grid gap-3 p-4" key={week.startsAt}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {formatWeek(week.startsAt, week.endsAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(week.transactionCount)} mouvement
                      {week.transactionCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {index === 0 ? (
                    <Badge variant="outline">En cours</Badge>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2 text-right">
                  <div>
                    <p className="text-[0.62rem] font-bold tracking-wider text-muted-foreground uppercase">
                      Entrées
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#456044] tabular-nums">
                      {formatSeptims(week.incoming)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.62rem] font-bold tracking-wider text-muted-foreground uppercase">
                      Sorties
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#8a3e2f] tabular-nums">
                      {formatSeptims(week.outgoing)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.62rem] font-bold tracking-wider text-muted-foreground uppercase">
                      Solde
                    </p>
                    <p
                      className={cn(
                        "mt-1 font-display text-sm tabular-nums",
                        week.net >= 0 ? "text-[#456044]" : "text-[#8a3e2f]"
                      )}
                    >
                      {week.net > 0 ? "+" : ""}
                      {formatSeptims(week.net)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="h-fit rounded-none border-t-[3px] border-[#5b462b]/35 border-t-primary/60 bg-[#fff8e7]/30 ring-0">
          <CardHeader>
            <CardTitle className="font-display text-xl">
              Charges de la semaine
            </CardTitle>
            <CardDescription>
              Estimation avec les paramètres comptables actuels.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ChargeRow
              icon={Landmark}
              label="Loyer"
              value={data.charges.rent}
            />
            <ChargeRow
              detail={`${formatNumber(data.settings.employeeCount)} employé${data.settings.employeeCount === 1 ? "" : "s"}`}
              icon={UsersRound}
              label="Cens"
              value={data.charges.census}
            />
            <ChargeRow
              detail={`${formatNumber(data.settings.taxRate * 100)} % des entrées`}
              icon={ArrowUpRight}
              label="Taxe"
              value={data.charges.tax}
            />
            <ChargeRow
              icon={ArrowDownLeft}
              label="Salaires"
              value={data.charges.salary}
            />
            <Separator className="my-1" />
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[0.65rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                  Total des charges
                </p>
                <p className="mt-1 font-display text-2xl text-primary tabular-nums">
                  {formatDecimalSeptims(data.charges.total)}
                </p>
              </div>
            </div>
            <Separator className="my-1" />
            <div>
              <p className="text-xs text-muted-foreground">
                Résultat courant après charges
              </p>
              <p
                className={cn(
                  "mt-1 font-display text-xl tabular-nums",
                  resultAfterCharges >= 0 ? "text-[#456044]" : "text-[#8a3e2f]"
                )}
              >
                {resultAfterCharges > 0 ? "+" : ""}
                {formatDecimalSeptims(resultAfterCharges)}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function AccountMetric({
  description,
  icon: Icon,
  label,
  tone,
  value,
}: Readonly<{
  description: string
  icon: typeof Coins
  label: string
  tone?: "negative" | "positive"
  value: string
}>) {
  return (
    <Card className="rounded-none border-[#5b462b]/35 bg-[#fff8e7]/30 ring-0">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {label}
        </CardDescription>
        <CardTitle
          className={cn(
            "font-display text-2xl tabular-nums",
            tone === "positive" && "text-[#456044]",
            tone === "negative" && "text-[#8a3e2f]"
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {description}
      </CardContent>
    </Card>
  )
}

function ChargeRow({
  detail,
  icon: Icon,
  label,
  value,
}: Readonly<{
  detail?: string
  icon: typeof Coins
  label: string
  value: number
}>) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          {detail ? (
            <p className="truncate text-xs text-muted-foreground">{detail}</p>
          ) : null}
        </div>
      </div>
      <p className="shrink-0 font-semibold tabular-nums">
        {formatDecimalSeptims(value)}
      </p>
    </div>
  )
}
