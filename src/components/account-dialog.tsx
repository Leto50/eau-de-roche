import { LoaderCircle, UserPlus, UserRoundCheck } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { authClient } from "@/lib/auth-client"

type AccountRole = "admin" | "user"

function isAccountRole(value: string): value is AccountRole {
  return value === "admin" || value === "user"
}

interface AccountDialogProps {
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function AccountDialog({
  onOpenChange,
  open,
}: Readonly<AccountDialogProps>) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<AccountRole>("user")
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetForm() {
    setName("")
    setEmail("")
    setPassword("")
    setRole("user")
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedName) {
      toast.error("Le nom est obligatoire.")
      return
    }

    setIsSubmitting(true)
    try {
      const result = await authClient.admin.createUser({
        email: normalizedEmail,
        name: normalizedName,
        password,
        role,
      })
      if (result.error) {
        toast.error(
          "Impossible de créer le compte. Vérifiez l’adresse e-mail et le mot de passe."
        )
        return
      }

      toast.success(`Le compte de ${normalizedName} a été créé.`)
      handleOpenChange(false)
    } catch {
      toast.error("Impossible de créer le compte.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-lg">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Administration
          </p>
          <DialogTitle className="font-display text-2xl">
            Créer un compte
          </DialogTitle>
          <DialogDescription>
            Créez un accès employé ou administrateur pour la boutique.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-primary/25 bg-primary/5">
          <UserRoundCheck aria-hidden="true" />
          <AlertTitle>Accès créé par l’administrateur</AlertTitle>
          <AlertDescription>
            Communiquez le mot de passe initial à la personne concernée par un
            moyen sûr.
          </AlertDescription>
        </Alert>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="account-name">Nom</Label>
            <Input
              autoComplete="off"
              id="account-name"
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nom et prénom"
              required
              value={name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-email">Adresse e-mail</Label>
            <Input
              autoComplete="off"
              id="account-email"
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="employe@exemple.fr"
              required
              type="email"
              value={email}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-role">Rôle</Label>
            <Select
              onValueChange={(value) => {
                if (isAccountRole(value)) setRole(value)
              }}
              value={role}
            >
              <SelectTrigger className="w-full" id="account-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Employé</SelectItem>
                <SelectItem value="admin">Administrateur</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-password">Mot de passe initial</Label>
            <Input
              autoComplete="new-password"
              id="account-password"
              maxLength={128}
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <p className="text-xs text-muted-foreground">
              Entre 12 et 128 caractères.
            </p>
          </div>

          <DialogFooter className="mt-2">
            <Button
              onClick={() => handleOpenChange(false)}
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
                <UserPlus aria-hidden="true" />
              )}
              Créer le compte
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
