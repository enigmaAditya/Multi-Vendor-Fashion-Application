# ADR-008: Database Migration Policy

**Status:** Accepted · **Date:** 2026-07-17 · **Phase:** P2

## Context
One schema, three environments (local/staging/prod), fixed-price timeline — migration chaos is unaffordable.

## Decision
Prisma Migrate. Forward-only in staging/prod (no down-migrations applied to shared envs; fixes are new forward migrations). Every migration PR includes the updated ERD fragment and is reviewed against docs/db-schema. Destructive changes (drop/rename) require an expand-migrate-contract sequence. Seeds are idempotent scripts, never migrations.

## Consequences
- Staging is always migratable from any commit on main.
- Schema drift between docs and DB is caught at review, not in production.
