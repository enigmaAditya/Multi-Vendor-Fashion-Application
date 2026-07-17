# ADR-004: Authentication & Session Model

**Status:** Accepted · **Date:** 2026-07-17 · **Phase:** P2

## Context

Customers (phone OTP + Google), sellers (same identity, seller role post-KYC), admin/staff (email+password+role). Mobile + web clients.

## Decision

- Access JWT, 15 min, HS256 pinned (reject any other alg). Claims: sub, roles, token_version.
- Refresh token: opaque, hashed at rest, rotating on every use; reuse detection bumps user.token_version → global logout.
- Storage: SecureStore (RN), httpOnly SameSite=Lax cookie (web).
- RBAC via `@Roles()` guard; seller resources additionally scoped by `seller_id` ownership checks in services (never trust client-sent seller_id).
- Dev OTP delivery: mailpit/console, gated by `NODE_ENV !== 'production'` from day one.

## Consequences

- Logout-everywhere and token theft response are O(1) (version bump).
- The seller-isolation check pattern (`WHERE seller_id = ctx.sellerId`) is mandatory in every seller-facing query and is a named item in the P11 security sweep.
