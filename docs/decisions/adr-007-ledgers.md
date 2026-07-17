# ADR-007: Append-Only Ledgers for Stock and Money

**Status:** Accepted · **Date:** 2026-07-17 · **Phase:** P2

## Context
"Current stock" and "seller balance" as mutable columns cannot answer "why is this number what it is" — the question every dispute asks.

## Decision
`inventory_ledger` (sku, warehouse, delta, reason, ref_type, ref_id, created_at) and `commission_ledger` (sub_order_item, gross_paise, commission_paise, net_paise, reason, created_at) are INSERT-only. The application DB role has no UPDATE/DELETE grant on them. Materialized current values (sku_inventory.on_hand, payout balances) are derived and must reconcile to ledger sums — a nightly job asserts this and alerts on drift.

## Consequences
- Every dispute, refund, and payout is explainable by ledger replay.
- Corrections are compensating entries, never edits.
