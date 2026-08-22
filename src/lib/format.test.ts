import { describe, expect, it } from "vitest"

import { formatQuantity } from "./format"

describe("formatQuantity", () => {
  it("accorde unité au singulier", () => {
    expect(formatQuantity(1)).toBe("1 unité")
    expect(formatQuantity(-1)).toBe("-1 unité")
  })

  it("accorde unités au pluriel", () => {
    expect(formatQuantity(0)).toBe("0 unités")
    expect(formatQuantity(2)).toBe("2 unités")
  })
})
