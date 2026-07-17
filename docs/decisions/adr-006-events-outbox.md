# ADR-006: Domain Events via Transactional Outbox

**Status:** Accepted · **Date:** 2026-07-17 · **Phase:** P2

## Context

Modules must react to each other (search sync, notifications, payouts) without direct coupling, and events must not be lost if the process dies between DB commit and queue publish.

## Decision

Events (`order.placed`, `payment.captured`, `shipment.delivered`, `product.updated`, `inventory.changed`, `return.qc_passed`, …) are written to an `outbox` table in the SAME transaction as the state change. A BullMQ relay polls/notifies and publishes to per-consumer queues; consumers are idempotent (dedupe on event_id). Payload schemas live in `packages/types`; naming is past-tense dot notation.

## Consequences

- At-least-once delivery; consumers MUST be idempotent (tested).
- Adding a consumer never touches the producer.
- The outbox table is also the audit trail of everything that happened.
