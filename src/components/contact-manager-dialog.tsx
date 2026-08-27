import { useMutation, useQuery } from "convex/react"
import {
  Archive,
  ArchiveRestore,
  Check,
  ContactRound,
  LoaderCircle,
  Pencil,
  X,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getUserFacingErrorMessage } from "@/lib/errors"
import { api } from "../../convex/_generated/api"
import { type Doc } from "../../convex/_generated/dataModel"

type Contact = Doc<"contacts">

const contactKindLabels: Readonly<Record<Contact["kind"], string>> = {
  client: "Clients",
  supplier: "Fournisseurs",
}

export function ContactManagerDialog() {
  const contacts = useQuery(api.contacts.listForAdmin)
  const renameContact = useMutation(api.contacts.rename)
  const setContactActive = useMutation(api.contacts.setActive)
  const [editingId, setEditingId] = useState<string>()
  const [name, setName] = useState("")
  const [pendingId, setPendingId] = useState<string>()

  function startEditing(contact: Contact) {
    setEditingId(contact._id)
    setName(contact.name)
  }

  async function submitRename(
    event: FormEvent<HTMLFormElement>,
    contact: Contact
  ) {
    event.preventDefault()
    if (!name.trim()) {
      toast.error("Le nom du contact est obligatoire.")
      return
    }
    setPendingId(contact._id)
    try {
      await renameContact({ contactId: contact._id, name: name.trim() })
      toast.success("Contact renommé. Les anciennes commandes sont inchangées.")
      setEditingId(undefined)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(error, "Impossible de renommer le contact.")
      )
    } finally {
      setPendingId(undefined)
    }
  }

  async function toggleContact(contact: Contact) {
    const active = contact.active === false
    setPendingId(contact._id)
    try {
      await setContactActive({ active, contactId: contact._id })
      toast.success(
        active
          ? `« ${contact.name} » est de nouveau proposé.`
          : `« ${contact.name} » a été archivé.`
      )
      if (editingId === contact._id) setEditingId(undefined)
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(
          error,
          active
            ? "Impossible de réactiver le contact."
            : "Impossible d’archiver le contact."
        )
      )
    } finally {
      setPendingId(undefined)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ContactRound aria-hidden="true" />
          Contacts
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[0.2rem] border-[#6a5436] bg-[#eee1c7] ring-0 sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <p className="text-[0.66rem] font-bold tracking-[0.2em] text-primary uppercase">
            Carnet de commandes
          </p>
          <DialogTitle className="font-display text-2xl">
            Gérer les contacts
          </DialogTitle>
          <DialogDescription>
            Renommez ou archivez les clients et fournisseurs proposés dans les
            nouvelles commandes.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-primary/25 bg-primary/[0.04]">
          <ContactRound aria-hidden="true" />
          <AlertTitle>Historique préservé</AlertTitle>
          <AlertDescription>
            Un renommage ne modifie pas le nom déjà enregistré sur les anciennes
            commandes.
          </AlertDescription>
        </Alert>

        <ScrollArea className="max-h-[58svh] pr-3">
          {contacts === undefined ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Chargement des contacts…
            </p>
          ) : contacts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Les contacts apparaîtront après la première commande.
            </p>
          ) : (
            <div className="grid gap-6 py-1">
              {(["client", "supplier"] as const).map((kind) => {
                const kindContacts = contacts.filter(
                  (contact) => contact.kind === kind
                )
                if (kindContacts.length === 0) return null
                return (
                  <section className="grid gap-2" key={kind}>
                    <h3 className="font-display text-lg">
                      {contactKindLabels[kind]}
                    </h3>
                    {kindContacts.map((contact) => {
                      const active = contact.active !== false
                      const editing = editingId === contact._id
                      const pending = pendingId === contact._id
                      return (
                        <div
                          className="flex min-w-0 items-center gap-2 border-b border-border/60 py-2 last:border-b-0"
                          key={contact._id}
                        >
                          {editing ? (
                            <form
                              className="flex min-w-0 flex-1 items-center gap-2"
                              onSubmit={(event) => {
                                void submitRename(event, contact)
                              }}
                            >
                              <Input
                                aria-label={`Nouveau nom de ${contact.name}`}
                                autoFocus
                                maxLength={100}
                                onChange={(event) =>
                                  setName(event.target.value)
                                }
                                value={name}
                              />
                              <Button
                                aria-label="Enregistrer le nom"
                                disabled={pending}
                                size="icon"
                                type="submit"
                              >
                                {pending ? (
                                  <LoaderCircle
                                    aria-hidden="true"
                                    className="animate-spin motion-reduce:animate-none"
                                  />
                                ) : (
                                  <Check aria-hidden="true" />
                                )}
                              </Button>
                              <Button
                                aria-label="Annuler le renommage"
                                onClick={() => setEditingId(undefined)}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <X aria-hidden="true" />
                              </Button>
                            </form>
                          ) : (
                            <>
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {contact.name}
                              </span>
                              <Badge variant="outline">
                                {active ? "Actif" : "Archivé"}
                              </Badge>
                              <Button
                                aria-label={`Renommer ${contact.name}`}
                                disabled={pending}
                                onClick={() => startEditing(contact)}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              <Button
                                aria-label={
                                  active
                                    ? `Archiver ${contact.name}`
                                    : `Réactiver ${contact.name}`
                                }
                                disabled={pending}
                                onClick={() => {
                                  void toggleContact(contact)
                                }}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                {pending ? (
                                  <LoaderCircle
                                    aria-hidden="true"
                                    className="animate-spin motion-reduce:animate-none"
                                  />
                                ) : active ? (
                                  <Archive aria-hidden="true" />
                                ) : (
                                  <ArchiveRestore aria-hidden="true" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </section>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
