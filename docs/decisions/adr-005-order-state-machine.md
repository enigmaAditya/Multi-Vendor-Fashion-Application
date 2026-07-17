# ADR-005: Order Status State Machine

**Status:** Accepted · **Date:** 2026-07-17 · **Phase:** P2

## Context

Sub-order status drives payments, payouts, logistics, notifications, and UI. Ad-hoc status updates are how marketplaces corrupt money flows.

## Decision

Single enum per sub_order: created → confirmed → packed → ready_to_ship → shipped → out_for_delivery → delivered | cancelled | rto. Return entity has its own machine: requested → pickup_scheduled → picked → qc_pending → qc_passed|qc_failed → refunded|rejected. ALL transitions go through `OrderStateMachine.transition(id, event)` which validates against an explicit transition map, writes order_status_history, and emits the domain event in the same transaction. Raw `UPDATE ... SET status` outside the service is forbidden (DB grant: status column updates only via a SECURITY DEFINER function is v2; lint/code-review enforces now).

## Consequences

- Illegal jumps (delivered → cancelled) are impossible, not just unlikely.
- Payouts key off `delivered` + return-window timer, both derivable from history.
