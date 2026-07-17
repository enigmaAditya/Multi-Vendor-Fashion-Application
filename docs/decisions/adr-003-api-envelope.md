# ADR-003: API Response Envelope & Error Codes

**Status:** Accepted · **Date:** 2026-07-17 · **Phase:** P2

## Context

Four frontends consume one API; error handling must be uniform and machine-readable.

## Decision

Every response: `{ success: boolean, data?: T, error?: { code, message, details? } }`. Error codes are an enum in `packages/constants` (e.g. `AUTH_OTP_EXPIRED`, `INV_OUT_OF_STOCK`, `PAY_SIGNATURE_INVALID`). HTTP status semantics preserved (400/401/403/404/409/422/429/500). Validation errors carry `details: { field: message }`.

## Consequences

- `api-client` unwraps the envelope once; screens switch on `error.code`, never on message strings.
- New codes require a constants PR — no ad-hoc string errors.
