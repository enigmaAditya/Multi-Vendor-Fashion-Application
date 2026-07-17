# ADR-001: Entity Identifiers

**Status:** Accepted · **Date:** 2026-07-17 · **Phase:** P2

## Context

Every table needs a primary key strategy. Options: serial integers (leak volume, enumerable → IDOR-friendly), UUIDv4 (random → poor index locality at scale), UUIDv7 (time-ordered, random suffix).

## Decision

UUIDv7 for all entity primary keys, generated application-side (`uuidv7` npm package), stored as Postgres `uuid`. Human-facing references (order number `ORD-XXXXXX`, AWB) are separate display columns, never the PK.

## Consequences

- Non-enumerable IDs close one whole IDOR class by default (authz checks still mandatory).
- Time-ordering keeps B-tree inserts append-mostly.
- Never expose sequence-based counts to clients.
