import { describe, expect, it } from "vitest"

import {
  priceDraftFromValue,
  priceDraftToValue,
  priceRatioFromValue,
} from "./prices"

describe("priceRatioFromValue", () => {
  it("retrouve les rapports importés depuis le classeur", () => {
    expect(priceRatioFromValue(0.3333333333333333)).toEqual({
      septims: 1,
      units: 3,
    })
    expect(priceRatioFromValue(0.06666666666666667)).toEqual({
      septims: 1,
      units: 15,
    })
    expect(priceRatioFromValue(1.5)).toEqual({ septims: 3, units: 2 })
  })
})

describe("priceDraft", () => {
  it("prépare et relit un prix saisi comme un rapport", () => {
    expect(priceDraftFromValue(1 / 4)).toEqual({
      septims: "1",
      units: "4",
    })
    expect(priceDraftToValue({ septims: "1", units: "4" })).toBe(1 / 4)
  })

  it("refuse les fractions de septim ou d’unité dans le rapport", () => {
    expect(priceDraftToValue({ septims: "1.5", units: "4" })).toBeNaN()
    expect(priceDraftToValue({ septims: "1", units: "4.5" })).toBeNaN()
  })
})
