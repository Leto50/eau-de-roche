import { useMutation } from "convex/react"
import { type FunctionReturnType } from "convex/server"
import { LoaderCircle, Settings2 } from "lucide-react"
import { useId, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { getUserFacingErrorMessage } from "@/lib/errors"
import { api } from "../../convex/_generated/api"

type Settings = FunctionReturnType<typeof api.accounts.overview>["settings"]

export function AccountSettingsDialog({
  settings,
}: Readonly<{ settings: Settings }>) {
  const saveSettings = useMutation(api.accounts.saveSettings)
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [cashBalance, setCashBalance] = useState("")
  const [fundsBalance, setFundsBalance] = useState("")
  const [employeeCount, setEmployeeCount] = useState("")
  const [weeklyRent, setWeeklyRent] = useState("")
  const [censusPerEmployee, setCensusPerEmployee] = useState("")
  const [salaryPerEmployee, setSalaryPerEmployee] = useState("")
  const [taxRatePercent, setTaxRatePercent] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetForm() {
    setCashBalance(settings.cashBalance.toString())
    setFundsBalance(settings.fundsBalance.toString())
    setEmployeeCount(settings.employeeCount.toString())
    setWeeklyRent(settings.weeklyRent.toString())
    setCensusPerEmployee(settings.censusPerEmployee.toString())
    setSalaryPerEmployee(settings.salaryPerEmployee.toString())
    setTaxRatePercent((settings.taxRate * 100).toString())
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) resetForm()
    setOpen(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = {
      cashBalance: Number(cashBalance),
      censusPerEmployee: Number(censusPerEmployee),
      employeeCount: Number(employeeCount),
      fundsBalance: Number(fundsBalance),
      salaryPerEmployee: Number(salaryPerEmployee),
      taxRate: Number(taxRatePercent) / 100,
      weeklyRent: Number(weeklyRent),
    }
    if (
      Object.values(values).some(
        (value) => !Number.isFinite(value) || value < 0
      ) ||
      !Number.isSafeInteger(values.cashBalance) ||
      !Number.isSafeInteger(values.censusPerEmployee) ||
      !Number.isSafeInteger(values.employeeCount) ||
      !Number.isSafeInteger(values.fundsBalance) ||
      !Number.isSafeInteger(values.salaryPerEmployee) ||
      !Number.isSafeInteger(values.weeklyRent) ||
      values.taxRate > 1
    ) {
      toast.error(
        "Vérifiez les montants entiers, le nombre d’employés et le taux compris entre 0 et 100 %."
      )
      return
    }

    setIsSubmitting(true)
    try {
      await saveSettings(values)
      toast.success("Les paramètres du compte ont été mis à jour.")
      setOpen(false)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(
          error,
          "Impossible de modifier les paramètres du compte."
        )
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline">
          <Settings2 aria-hidden="true" />
          Paramètres
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[94svh] overflow-y-auto rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Tenue du compte
          </p>
          <DialogTitle className="font-display text-2xl">
            Paramètres comptables
          </DialogTitle>
          <DialogDescription>
            Mettez à jour les montants déclarés et les charges servant au calcul
            de la semaine courante.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <Card className="gap-0 rounded-none border-primary/20 bg-primary/[0.035] py-0 ring-0">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`${fieldId}-cash`}>Caisse déclarée</Label>
                <InputGroup>
                  <InputGroupInput
                    id={`${fieldId}-cash`}
                    min="0"
                    onChange={(event) => setCashBalance(event.target.value)}
                    required
                    step="1"
                    type="number"
                    value={cashBalance}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>septims</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${fieldId}-funds`}>Fonds disponibles</Label>
                <InputGroup>
                  <InputGroupInput
                    id={`${fieldId}-funds`}
                    min="0"
                    onChange={(event) => setFundsBalance(event.target.value)}
                    required
                    step="1"
                    type="number"
                    value={fundsBalance}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>septims</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-employees`}>Employés</Label>
              <Input
                id={`${fieldId}-employees`}
                min="0"
                onChange={(event) => setEmployeeCount(event.target.value)}
                required
                step="1"
                type="number"
                value={employeeCount}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-rent`}>Loyer hebdomadaire</Label>
              <InputGroup>
                <InputGroupInput
                  id={`${fieldId}-rent`}
                  min="0"
                  onChange={(event) => setWeeklyRent(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={weeklyRent}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>septims</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-census`}>Cens par employé</Label>
              <InputGroup>
                <InputGroupInput
                  id={`${fieldId}-census`}
                  min="0"
                  onChange={(event) => setCensusPerEmployee(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={censusPerEmployee}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>septims</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-salary`}>Salaire par employé</Label>
              <InputGroup>
                <InputGroupInput
                  id={`${fieldId}-salary`}
                  min="0"
                  onChange={(event) => setSalaryPerEmployee(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={salaryPerEmployee}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>septims</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </div>

          <div className="grid gap-2 sm:max-w-56">
            <Label htmlFor={`${fieldId}-tax`}>Taxe sur les entrées</Label>
            <InputGroup>
              <InputGroupInput
                id={`${fieldId}-tax`}
                inputMode="decimal"
                max="100"
                min="0"
                onChange={(event) => setTaxRatePercent(event.target.value)}
                required
                step="any"
                type="number"
                value={taxRatePercent}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>%</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
              type="button"
              variant="ghost"
            >
              Annuler
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Settings2 aria-hidden="true" />
              )}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
