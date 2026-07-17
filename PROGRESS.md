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

## Week 3 — [2026-07-17] (Identity Module — COMPLETE)

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
      **Known-Open / Deferred Items:** - [ ] Google OAuth: Currently a mock/stub that simulates idToken validation. Needs real Google API token verification before production. - [x] RBAC guards: Route-layer Role-Based Access Control (@Roles() / JwtAuthGuard) implemented and verified in Catalog module.
      **Next week:** Phase P4 (Catalog and Inventory modules)

## Week 4 — [2026-07-17] (Catalog Module — COMPLETE)

**Plan:** Phase P4 (Catalog module)
**Done:**

- [x] Defined Zod validation schemas and types for Categories, Brands, Products, Variants, SKUs, and Moderation in `@marketplace/types` and `@marketplace/constants`
- [x] Implemented Category materialized path calculations for hierarchy trees, indexed for prefix queries
- [x] Created database schema and forward migrations mapping Product, ProductVariant, Sku, ProductImage, SizeChart, and OutboxEvent models with UUIDv7
- [x] Enabled flexible seller drafts by allowing optional categories, brands, and descriptions on products
- [x] Implemented strict draft completeness check gating transitions from `DRAFT` to `PENDING_REVIEW`
- [x] Built state-machine transitions (`SUBMIT`, `APPROVE`, `REJECT`, `SUSPEND`) in `CatalogService` following ADR-005 rules
- [x] Enforced seller ownership checks and SKU seller consistency assertions on product mutations
- [x] Implemented atomic multi-entity transaction creates and updates with Outbox event recordings (ADR-006)
- [x] Handled BigInt outbound serialization converting prices/MRPs to JavaScript Numbers for Express compatibility
- [x] Implemented JwtAuthGuard and RolesGuard to enforce role-based access control (RBAC) across catalog endpoints
- [x] Wrote 21 passed unit tests covering materialized paths, cyclic loops prevention, draft validations, and moderation paths
- [x] Wrote passed E2E integration tests validating category trees, drafts completeness checks, seller isolation, and admin moderation flows
      **Known-Open / Deferred Items:** - [ ] SKU Churn Refactor: updateProduct currently deletes and recreates all variants and SKUs on every edit. This must be refactored to perform a diff/upsert before implementing the Inventory module to prevent orphaning inventory and order reference keys. - [ ] Price-Sort Total Count Parity: The total pagination count for price-sorted queries is computed via Prisma where rather than the dynamic raw SQL, creating boundary edge cases on price range filters. Unify this under a nested count query in Phase P8 before Search/PLP polish.
      **Next week:** Phase P5 (Inventory and Orders module)
