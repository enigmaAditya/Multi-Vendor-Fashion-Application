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
      **Next week:** Media Module (Phase P3 Core)

## Week 5 — [2026-07-17] (Media Module — COMPLETE)

**Plan:** Phase P3 Core (Media module)
**Done:**

- [x] Created `Media` schema and migrations linking optional `mediaId` to `ProductImage` (1-to-1 unique) with UUIDv7
- [x] Configured StorageService generating secure client presigned POST policy URLs, capping file size to 5MB via `content-length-range`
- [x] Implemented magic bytes signature verification (JPEG, PNG, WebP) fetching partial object bytes (range bytes 0-99)
- [x] Exposed protected endpoints for presigned URLs, confirmation, and status checks with strict IDOR ownership checks
- [x] Handled validation failures by immediately setting status to `FAILED` and purging unverified objects
- [x] Built image processor via BullMQ, resizing to WebP (150px thumbnail & 800px detail) with atomic update claim idempotency
- [x] Emitted `media.processed` events through outbox inside completion transactions (ADR-006)
- [x] Added scheduled hourly sweeper clearing stale `PENDING_UPLOAD` objects and records
- [x] Wrote unit and E2E tests validating magic bytes, IDOR guards, double-processing prevention, and confirmation flow
      **Next week:** SKU Churn Refactor (Phase P4)

## Week 6 — [2026-07-18] (Inventory & Stock Module — COMPLETE)

**Plan:** Phase P5 (Inventory & Stock module)
**Done:**

- [x] Implemented SKU inventory schema and migrations mapping warehouse inventory levels and append-only ledger entries (ADR-007)
- [x] Built atomic concurrency-safe reservation holds with raw SQL lock checks (`onHand - reserved >= qty`)
- [x] Threaded transactional client support to enforce atomic state movements without nested transaction blocks
- [x] Added automated BullMQ queueing for reservation expiry sweeps reverting holds to stock pools
- [x] Guarded SKUs from deletion by blocking catalog adjustments when active warehouses contain positive stock
- [x] Wrote unit and E2E integration tests validating stock replenishments, concurrency claims, hold expiration, and SKU deletion guards

## Week 7 — [2026-07-18] (Orders, Checkout & Payments — COMPLETE)

**Plan:** Phase P5 (Orders, Checkout & Payments module)
**Done:**

- [x] Created Order, SubOrder, OrderItem, and Webhook Log database models with multi-item composite unique index constraints
- [x] Configured native NestJS raw request body parser options enabling secure timing-safe webhook HMAC checks
- [x] Built server-side pricing recomputation from database records to prevent client-side cart price tampering exploits
- [x] Structured multi-seller cart splitting creating distinct sub-orders and distributing item rows per seller
- [x] Implemented atomic webhook capture transactions checking idempotency logs and committing stock allocations (ADR-005)
- [x] Handled captured webhook failures and lost lock races by transitioning orders to `REFUND_REQUIRED` and emitting outbox events
- [x] Wrote unit and E2E integration tests validating amount-tampering blocks, duplicate webhook idempotency, and expired hold outcomes
      **Next target:** Payouts & Commission Settlement (Phase P5 Back Half - Razorpay Route, commission ledger, settlements)
