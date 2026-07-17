# ADR-002: Money Representation

**Status:** Accepted · **Date:** 2026-07-17 · **Phase:** P2

## Context
Floating point cannot represent currency exactly. Commission splits, coupons, and refunds must reconcile to zero error across ledgers.

## Decision
All monetary values are integer paise (`bigint` in Postgres, `number` guarded by a branded `Paise` type in `packages/types`). Formatting to ₹ happens only at render. Percentages (commission, discounts) are computed in integer math with explicit rounding rules: round half-up, remainder assigned to the platform line item so per-order sums are exact.

## Consequences
- `1,29,900` paise not `1299.00`. Every API field carrying money is suffixed `_paise`.
- No `float`/`numeric` money columns anywhere; lint rule + migration review enforce.
- Rounding rule is documented once here and referenced by payout tests.
