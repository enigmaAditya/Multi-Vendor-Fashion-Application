# Progress Log

> Updated every Friday. Format: week, plan reference, done, blocked, next.

## Week 1 — [dates]

**Plan:** Part 2 (wireframes + ADRs + skeleton)
**Done:**

- [x] ADR-001..008 committed (dates filled)
- [x] Repo scaffold, docker-compose up, CI green
- [ ] Wireframes: A1–A3, B1–B4 …
      **Blocked / client dependencies triggered:**
- [ ] Razorpay + Route application sent (date: )
- [ ] Apple D-U-N-S requested (date: )
- [ ] SMS DLT registration started (date: )
- [ ] Domain purchased (date: )
      **Next week:** finish wireframes C–I + seller/admin, ERD draft
      **Client update sent:** [date]

## Week 3 — [2026-07-17]

**Plan:** Phase P3 (Identity module)
**Done:**

- [x] Defined Zod and TypeScript schemas/types for JWTs, OTP payloads, and OAuth responses in `@marketplace/types` and `@marketplace/constants`
- [x] Implemented Postgres schema and migrations for users, refresh tokens, oauth, otp requests, and devices
- [x] Resolved PostgreSQL/Redis local port conflicts and configured Docker Postgres/Redis services
- [x] Created Redis-throttled OTP generate and verify services with a 3-try cap, 5-min TTL, and 60s throttle limit
- [x] Implemented JWT access tokens and rotating refresh tokens with hashed storage at rest and token theft reuse detection (global session invalidation)
- [x] Wired NestJS controller endpoints for OTP request/verify, Google OAuth, session refresh, and logout
- [x] Configured Prisma 7 PostgreSQL driver adapter (`@prisma/adapter-pg` and `pg`) with connection reuse and pool ending in tests
- [x] Wrote 10 passed unit tests verifying OTP retry thresholds, throttle windows, and token version rotation
- [x] Wrote passed E2E integration tests validating the complete authentication lifecycle against active Postgres & Redis
      **Known-Open / Deferred Items:** - [ ] Google OAuth: Currently a mock/stub that simulates idToken validation. Needs real Google API token verification before production. - [ ] RBAC guards: Route-layer Role-Based Access Control (@Roles() / JwtAuthGuard) are deferred to seller/admin modules.
      **Next week:** Phase P4 (Catalog and Inventory modules)
