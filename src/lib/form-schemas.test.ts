import { describe, expect, it } from "vitest"

import {
  accountFormSchema,
  bundleFormSchema,
  operationFormSchema,
  passwordResetFormSchema,
  priceDraftSchema,
  productFormSchema,
  recipeFormSchema,
} from "./form-schemas"

describe("form schemas", () => {
  it("valide un compte uniquement avec un e-mail et un mot de passe corrects", () => {
    expect(
      accountFormSchema.safeParse({
        email: "invalide",
        name: " ",
        password: "court",
        role: "user",
      }).success
    ).toBe(false)
    expect(
      accountFormSchema.safeParse({
        email: "employe@example.fr",
        name: "Employé",
        password: "mot-de-passe-solide",
        role: "user",
      }).success
    ).toBe(true)

    const emptyEmail = accountFormSchema.safeParse({
      email: "",
      name: "Employé",
      password: "mot-de-passe-solide",
      role: "user",
    })
    expect(emptyEmail.success).toBe(false)
    if (!emptyEmail.success) {
      expect(
        emptyEmail.error.issues.filter((issue) => issue.path[0] === "email")
      ).toHaveLength(1)
    }
  })

  it("associe la confirmation du mot de passe à son champ", () => {
    const result = passwordResetFormSchema.safeParse({
      confirmation: "mot-de-passe-different",
      password: "mot-de-passe-solide",
    })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues[0]?.path).toEqual(["confirmation"])
  })

  it("refuse les rapports de prix incomplets ou hors limite", () => {
    expect(
      priceDraftSchema.safeParse({ septims: "5", units: "0" }).success
    ).toBe(false)
    expect(
      priceDraftSchema.safeParse({ septims: "1000000001", units: "1" }).success
    ).toBe(false)
    expect(
      priceDraftSchema.safeParse({ septims: "5", units: "2" }).success
    ).toBe(true)
  })

  it("place une erreur sur la ligne dupliquée d’un lot", () => {
    const result = bundleFormSchema.safeParse({
      items: [
        { key: 0, productId: "produit", quantity: "1" },
        { key: 1, productId: "produit", quantity: "2" },
      ],
      name: "Lot",
      price: { septims: "", units: "1" },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.at(-1)?.path).toEqual([
        "items",
        1,
        "productId",
      ])
    }
  })

  it("interdit à une potion d’être son propre ingrédient", () => {
    const result = recipeFormSchema.safeParse({
      effect: "",
      family: "Soin",
      ingredients: [{ key: 0, productId: "potion", quantity: "1" }],
      name: "Potion",
      outputProductId: "potion",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.at(-1)?.path).toEqual([
        "ingredients",
        0,
        "productId",
      ])
    }
  })

  it("applique les règles propres au mode de production", () => {
    const result = operationFormSchema.safeParse({
      agreedTotal: "",
      characterId: "personnage",
      comment: "",
      counterparty: "",
      discount: "",
      linkedOrderMode: false,
      occurredOn: "2020-01-01",
      productId: "",
      productionMode: true,
      quantity: "0",
      tradeLines: [],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.at(-1))).toEqual(
        expect.arrayContaining(["productId", "quantity"])
      )
    }
  })

  it("ignore les anciens champs de stock d’un service mais exige le motif de remise à zéro", () => {
    const base = {
      adjustmentReason: "",
      category: "service" as const,
      craftable: false,
      minimumStock: "valeur masquée",
      name: "Conseil alchimique",
      originalStock: 0,
      purchasePrice: { septims: "", units: "1" },
      salePrice: { septims: "10", units: "1" },
      targetStock: "valeur masquée",
    }
    expect(productFormSchema.safeParse(base).success).toBe(true)
    expect(
      productFormSchema.safeParse({ ...base, originalStock: 3 }).success
    ).toBe(false)
    expect(
      productFormSchema.safeParse({
        ...base,
        adjustmentReason: "Passage en service",
        originalStock: 3,
      }).success
    ).toBe(true)
  })

  it("exige explicitement le total d’une commande déjà liée", () => {
    const result = operationFormSchema.safeParse({
      agreedTotal: "",
      characterId: "personnage",
      comment: "",
      counterparty: "",
      discount: "",
      linkedOrderMode: true,
      occurredOn: "2020-01-01",
      productId: "",
      productionMode: false,
      quantity: "1",
      tradeLines: [
        {
          direction: "outgoing",
          id: "produit",
          kind: "product",
          name: "Potion",
          quantity: "1",
          unitPrice: { septims: "10", units: "1" },
        },
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues[0]?.path).toEqual(["agreedTotal"])
  })
})
