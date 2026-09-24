import { describe, expect, it } from 'vitest'
import { importPrice } from '../setup'

describe('DSerz-style import pricing', () => {
  it('doubles landed cost, rounds UP to .99 and never goes below $9.99', () => {
    expect(importPrice(10.95)).toBe(21.99) // 21.90 → 21.99
    expect(importPrice(8.5)).toBe(17.99) // exactly 17.00 → next .99 up
    expect(importPrice(8.495)).toBe(16.99)
    expect(importPrice(3.74)).toBe(9.99) // $7.48 → floor
    expect(importPrice(0)).toBe(9.99)
    expect(importPrice(28.15)).toBe(56.99)
  })
})
