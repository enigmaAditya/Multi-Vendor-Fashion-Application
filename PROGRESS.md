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

## Week 8 — [2026-07-18] (Payouts & Commission Settlement — COMPLETE)

**Plan:** Phase P5 Back Half (Payouts & Commission Settlement)
**Done:**

- [x] Added database schemas and migrations for CommissionRule, CommissionLedger, SellerLinkedAccount, and Payout models
- [x] Built processDelivery state-machine transitions and scheduled delayed BullMQ escrow checks matching the return window
- [x] Designed bidirectional atomic claims preventing settle-vs-cancel checkout races
- [x] Designed a self-healing resume path leveraging Razorpay idempotency keys to restore state post-crash without duplicate payouts
- [x] Resolved strict TypeScript compilation null-safety closure errors using stable payout constant bindings
- [x] Wrote unit and E2E integration tests validating exact commission calculations, default/override rules, and E2E crash-recovery states
      _(Note: The delivery trigger is integrated with real Shiprocket events and outbox-driven syncing)_

**Next target:** Done with initial core marketplace features.

## Week 9 — [2026-07-18] (Logistics & Shipping — COMPLETE)

**Plan:** Phase P7 (Logistics & Shipping — Shiprocket Integration)
**Done:**

- [x] Integrated real-time tracking with Shiprocket API using outbox-driven syncing and timing-safe webhook receivers
- [x] Created database schema and migrations for shipment metadata tracking and idempotent callback logging
- [x] Designed Redis locked token manager cache supporting single-flight authorization token generation
- [x] Implemented pre-settlement RTO restocking loops restoring inventory counts and updating ledgers
- [x] Implemented post-settlement RTO clawback workflows flagging sub-orders and writing outbox alert records
- [x] Wrote unit and E2E integration specs validating outbox processing, duplicate webhook rejections, and pre/post-settlement return routes

## Week 10 — [2026-07-19] (Search & Discovery — COMPLETE)

**Plan:** Phase P8 (Search & Discovery — Meilisearch Integration)
**Done:**

- [x] Added database schemas and migrations for `SearchQueryLog` model to track search behavior
- [x] Configured `SearchService` initializing settings (searchable/filterable/sortable attributes, custom ranking rules) on NestJS boot-up
- [x] Built outbox-driven index syncing (`SearchProcessor`) capturing product lifecycle and stock availability changes
- [x] Implemented dynamic faceted search proxying (`GET /search`) with filters, pricing bounds, sorting, limit/offset, and facet distributions
- [x] Logged all search queries asynchronously to `SearchQueryLog` for search discovery analytics
- [x] Decoupled price-sorting logic from raw SQL in `CatalogService`, routing through `SearchService` to close the Price-Sort Total Count Parity ticket
- [x] Guarded stock availability indexing by emitting outbox events (`stock.availability_changed`) only when product stock flips inStock true <-> false
- [x] Wrote unit and E2E integration specs validating search queries, facets distribution, admin reindex backfills, and query logging

### Week 11 — Reviews System (Phase P9)

**Done:**

- [x] Added `Review` model to Prisma schema with `status` (APPROVED/REJECTED), `orderId`, `skuId` for provenance, and `@@unique([productId, buyerId])` constraint
- [x] Implemented `ReviewsService` with verified-purchase gate traversing Order(PAID) → SubOrder → OrderItem → Sku → Variant → Product
- [x] Enforced one-review-per-buyer-per-product with 409 ConflictException on duplicates
- [x] Added XSS sanitization (HTML entity escaping) on title and comment inputs before storage
- [x] Implemented admin moderation endpoint (`PATCH /admin/reviews/:id/moderate`) with `product.updated` outbox re-emission on status change
- [x] All read paths (public listing, stats aggregation, search rating) filter `status: 'APPROVED'` consistently
- [x] Computed product review stats via DB-side `groupBy` and `aggregate` queries (no in-memory loops)
- [x] Updated `SearchService.upsertProductToIndex` to aggregate real average rating from APPROVED reviews — rating field is no longer a 0 placeholder
- [x] Wrote 8 unit tests and 11 E2E integration tests covering purchase gate (both directions), sanitization, duplicates, moderation, and stats

### Week 12 — Coupons & Promotions System (Phase P10)

**Done:**

- [x] Added `Coupon`, `CouponRedemption`, and `PromotionLedger` models to Prisma schema with `@map` annotations for snake_case column names
- [x] Updated `Order` model with `discountAmount` and `amountCharged` fields to separate pre-discount subtotals from net charged amounts
- [x] Implemented `CouponsService` with server-side code normalization, scope checking (`sellerId`/`categoryId`), min order amount validation, `FIXED`/`PERCENTAGE` calculations, and per-user redemption caps
- [x] Integrated `CouponsService` with `OrdersService.checkout`:
  - Computes net `amountCharged = totalAmount - discountAmount` server-side
  - Passes net `amountCharged` to Razorpay gateway API (`POST /v1/orders`) so customer is charged the exact discounted amount
  - Performs atomic claim on global redemption counter (`UPDATE coupons SET current_redemptions = current_redemptions + 1 WHERE ...`) inside checkout transaction
  - Atomically logs `PromotionLedger` (`PLATFORM_PROMO_EXPENSE`) for platform-funded discounts
- [x] Implemented dual coupon funding model (`PLATFORM` vs `SELLER`):
  - Platform-funded: sub-orders remain undiscounted, platform absorbs discount via `PromotionLedger` (`PLATFORM_PROMO_EXPENSE`), sellers receive full net entitlement.
  - Seller-funded: discount is deducted directly from the funding seller's `subOrder.amount`, funding seller bears the discount directly, platform expense equals 0.
  - Seller discount overflow capping: seller-funded discounts are capped to the funding seller's qualifying cart subtotal, guaranteeing $\sum \text{SubOrder.amount} \equiv \text{amountCharged}$ across multi-vendor orders with 0 paise drift.
- [x] Created `CouponsController` exposing `POST /coupons`, `GET /coupons`, `POST /coupons/validate`, and `PATCH /coupons/:id/status`
- [x] Wrote 8 unit tests and 6 E2E integration tests covering gateway net amount charging, deep discount settlement & sub-order payout reconciliation (`netPayout + totalCommission === subOrder.amount`), SELLER funding sub-order reduction, multi-vendor discount capping, 5-way concurrent claims on single-use coupons, and per-user limit enforcement

### Week 13 — Notifications System (Phase P11)

**Done:**

- [x] Added `NotificationLog`, `UserNotificationPreference`, and `UserDeviceToken` models to Prisma schema with `@map` annotations and composite unique constraint `@@unique([outboxEventId, channel, recipientId])`
- [x] Updated `LogisticsService` to emit outbox events (`shipment.dispatched`, `shipment.out_for_delivery`, `shipment.delivered`) inside the atomic webhook transaction matching Shiprocket status strings (added explicitly as part of Phase P11 to align event emitters with notification subscribers)
- [x] Built multi-channel Notification Drivers (`EmailService`, `PushService` with FCM dead token pruning, `MockSmsService` for DLT-deferred SMS)
- [x] Created `NotificationTemplatesService` implementing strict HTML/XSS entity escaping across all event types and recipient roles
- [x] Implemented `NotificationsService` with fan-out job queueing (`notifications-queue`), atomic `PENDING` log insert-as-claim gate (P2002 constraint error handling), preference checking (`UserNotificationPreference`), and dead token pruning (`UserDeviceToken`)
- [x] Built `NotificationsProcessor` outbox sweeper polling event types (`order.paid`, `shipment.dispatched`, `shipment.out_for_delivery`, `shipment.delivered`, `payout.settled`, `payment.refund_required`) without blocking Search or Logistics outbox sweepers
- [x] Created `NotificationsController` with REST endpoints for FCM device token registration/deletion and user preference updates
- [x] Wrote 7 unit tests and 4 E2E integration tests validating template XSS escaping, notification preferences, FCM dead token pruning, device token REST lifecycle, and atomic outbox fan-out dedup gate

### Week 14 — Recommendations System (Phase P12 — COMPLETE)

**Done:**

- [x] Added `UserProductView` model to Prisma schema with composite unique index `@@unique([userId, productId])` for fire-and-forget view upserts without row proliferation
- [x] Defined Zod validation schemas and TypeScript DTO types (`RecentlyViewedQuerySchema`, `TrendingQuerySchema`, `SimilarQuerySchema`, `AlsoBoughtQuerySchema`) in `@marketplace/types` with limit caps (max 50)
- [x] Implemented `RecommendationsService` with 4 automated discovery engines:
  - **Recently Viewed**: retrieves buyer browsing history filtering `product.status === 'LIVE'`, ordered by `viewedAt desc`
  - **Trending Products**: single-pass SQL score aggregation over timeframe window ($Score = 5 \times \text{Sales} + 3 \times \text{Approved Reviews} + 1 \times \text{Views}$), filtered to `LIVE` products
  - **Similar Products**: category matching with soft brand preference sorting (`brandId === target.brandId`), fallback ordering by `createdAt desc`
  - **Customers Also Bought**: bounded order co-occurrence graph traversal (`OrderItem` $\rightarrow$ `Sku` $\rightarrow$ `Variant` $\rightarrow$ `Product`), falling back to category top-sellers when co-purchase data is sparse
- [x] Created `RecommendationsController` with REST endpoints for view tracking (authenticated), recently-viewed (authenticated), trending (public), similar (public), and also-bought (public)
- [x] Formatted uniform product cards calculating lowest SKU price (`variant.skus.price`) and aggregated live stock (`variant.skus.inventories`)
- [x] Wrote 5 unit tests and 4 E2E integration tests validating view tracking upsert, recently-viewed ordering, SQL score aggregation, soft brand sorting, co-occurrence traversal, and category fallback
- [x] Executed full test suite (14 unit test suites / 85 tests, 13 E2E test suites / 45 tests) with **100% PASSING GREEN**
- [x] Executed `pnpm --filter api run lint` and `pnpm --filter api run build` with **0 errors and 0 warnings**

### Week 15 — Admin Panel Backend & Security Sweep (Phase P13a — COMPLETE)

**Done:**

- [x] Defined Zod validation schemas and TypeScript DTOs (`SellerKycApprovalSchema`, `CommissionRuleUpdateSchema`, `ProductModerationSchema`, `ReviewModerationSchema`, `FinancialReportQuerySchema`) in `@marketplace/types`
- [x] Built `AdminService` implementing seller KYC approvals (+ `seller.approved`/`seller.rejected` outbox emissions), commission rule overrides (`CommissionRule`), product moderation (+ `product.updated` outbox emissions for search re-indexing), review moderation reuse (`ReviewsService`), and SQL ledger aggregations (`GMV`, `Commission`, `Payouts`, `PromoExpenses`)
- [x] Created `AdminController` exposing 7 `/admin/*` REST endpoints, every single route decorated with `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('ADMIN')`
- [x] Conducted comprehensive **Security Sweep**: wrote 3 E2E security tests verifying that EVERY single `/admin/*` route returns `403 Forbidden` for BUYER and SELLER tokens and `401 Unauthorized` for unauthenticated requests
- [x] Wrote 6 unit tests and 4 E2E integration tests validating seller KYC status transitions, commission rule creation, product moderation outbox re-indexing, and financial ledger summaries with ADMIN token
- [x] Executed full test suite (15 unit test suites / 91 tests, 14 E2E test suites / 52 tests) with **100% PASSING GREEN**
- [x] Executed `pnpm --filter api run lint` and `pnpm --filter api run build` with **0 errors and 0 warnings**

### Week 15 — Admin Dashboard Web UI (Phase P13b — COMPLETE)

**Done:**

- [x] Implemented Next.js 16 App Router UI (`apps/web`) with dark mode glassmorphism design system (`globals.css`), Google Fonts (`Outfit`/`Inter`), responsive data tables, status badges, and action modals
- [x] Built strongly-typed admin API fetch client (`apps/web/app/lib/admin-client.ts`) with `formatRupees` currency converter handling Paise-to-Rupees conversions (e.g. `129900` $\rightarrow$ `₹1,299.00`)
- [x] Built 6 interactive operator views in `apps/web/app/page.tsx`:
  - **Overview**: KPI stat cards for Gross Merchandise Value (GMV), Platform Commissions, Settled Payouts, and Platform Promo Expenses
  - **Seller KYC**: Status filter (`ALL`, `ACTIVE`, `SUSPENDED`) matching backend query parameters, seller list, and modal for approving/rejecting seller KYC
  - **Catalog Moderation**: Product moderation queue cards showing title, slug, seller, category, and Approve (`LIVE`), Reject (`REJECTED`), Suspend (`SUSPENDED`) actions
  - **Review Moderation**: Operator review approval/rejection interface
  - **Commission Rules**: Category and seller commission rate override configurator
  - **Financial Ledgers**: Real-time aggregated financial ledger breakdown cards
- [x] Handled server-truth action state & explicit alert notifications (no silent failures or optimistic state misrepresentation)
- [x] Executed `pnpm --filter web run typecheck` — **0 Errors**
- [x] Executed `pnpm --filter web run lint` — **0 Errors, 0 Warnings**
- [x] Executed Next.js Production Build (`pnpm --filter web run build`) — **Completed successfully in 1.6s**

### Week 15 — Customer Storefront: Browse & Discovery (Phase P14a — COMPLETE)

**Done:**

- [x] Verified exact backend REST endpoint routes (`GET /categories/tree`, `GET /products/:slug`, `GET /search`, `POST /recommendations/views/:productId`)
- [x] Built strongly-typed storefront API client (`apps/web/app/lib/storefront-client.ts`) with non-blocking fire-and-forget product view tracking (`.catch(() => {})`)
- [x] Implemented Next.js Server Components with dynamic SSR metadata (`generateMetadata`) and Schema.org JSON-LD Product structured data for SEO
- [x] Created storefront pages and reusable UI components (`Navbar`, `Footer`, `ProductCard`, `RecommendationCarousel`):
  - **Storefront Home (`/`)**: Hero banner, category grid, and *Trending Products* recommendation carousel
  - **Product Listing Page (`/products`)**: Instant Meilisearch search, category filter sidebar, and grid of `LIVE` products
  - **Product Detail Page (`/products/[slug]`)**: Dynamic SKU variant selector (size, color, stock availability, price in Rupees), image gallery, fire-and-forget view tracking, and 2 discovery carousels (*Similar Products*, *Customers Also Bought*)
- [x] Relocated Admin Dashboard cleanly to `apps/web/app/admin/page.tsx`
- [x] Executed `pnpm --filter web run typecheck` — **0 Errors**
- [x] Executed `pnpm --filter web run lint` — **0 Errors, 0 Warnings**
- [x] Executed Next.js Production Build (`pnpm --filter web run build`) — **Successfully compiled 5 static/dynamic SSR routes in 1.8s**

---

## 🏆 Backend Core Completion Summary (13 / 13 Modules Complete)

All 13 core backend modules are implemented, tested, linted, built, and verified green on `main`:

| # | Module | Core Responsibilities & Correctness Guarantees | Status |
| :---: | :--- | :--- | :---: |
| 1 | **Identity & Auth** | OTP throttling, JWT rotation, session invalidation, theft detection | ✅ COMPLETE |
| 2 | **Catalog** | Materialized category paths, strict draft completeness, moderation state machine | ✅ COMPLETE |
| 3 | **Media** | S3/MinIO presigned uploads, magic-bytes verification, BullMQ webp resizing | ✅ COMPLETE |
| 4 | **SKU Stability** | In-place SKU diff/upsert preventing orphan inventory & order reference keys | ✅ COMPLETE |
| 5 | **Inventory** | Atomic 2-phase stock reservation (`PENDING` lock $\rightarrow$ `COMMITTED`), anti-overselling | ✅ COMPLETE |
| 6 | **Orders & Checkout** | Atomic stock reservation claim, Razorpay HMAC verification, outbox event generation | ✅ COMPLETE |
| 7 | **Payouts & Settlement**| Self-healing webhook sync, dual-entry accounting (`netPayout + commission === subOrder.amount`) | ✅ COMPLETE |
| 8 | **Logistics & Shiprocket**| Atomic webhook status transitions, auto-RTO inventory restock, shipment events outbox | ✅ COMPLETE |
| 9 | **Search & Analytics** | Meilisearch outbox sweeper, dynamic faceted search, query logging, rating indexing | ✅ COMPLETE |
| 10 | **Reviews System** | Verified purchase gate (PAID Order $\rightarrow$ Product hop), one review per user, XSS escaping | ✅ COMPLETE |
| 11 | **Coupons & Promotions**| Dual funding (PLATFORM vs SELLER), seller discount capping, 0-drift payout reconciliation | ✅ COMPLETE |
| 12 | **Notifications** | Deduplicated multi-channel fan-out (Email, FCM push with dead-token pruning, Mock SMS) | ✅ COMPLETE |
| 14 | **Admin Control Surface** | # Multi-Vendor Fashion Application — Progress Tracker

## Completed Phases Overview
- **Phase P1 through P13a**: Backend Core Services (Identity, Catalog, Media, SKU, Inventory, Orders, Payouts, Logistics, Search, Reviews, Coupons, Notifications, Recommendations, Admin).
- **Phase P13b**: Admin Dashboard Web UI (`apps/web/app/admin/page.tsx`).
- **Phase P14a**: Customer Storefront — Browse & Discovery (`apps/web/app/(storefront)/...` with SSR PLP/PDP & recommendation carousels).
- **Phase P14b**: Customer Storefront — Cart & Atomic Checkout Flow (`apps/web/app/(storefront)/cart`, `checkout`, `orders/confirmation`, and `GET /orders/:id` with IDOR protection).
- **Phase P14c**: Customer Storefront — Post-Purchase & Reviews (`apps/web/app/(storefront)/orders`, `orders/[id]`, and `ReviewFormModal.tsx`).
- **Phase P15**: Seller Merchant Portal (`apps/web/app/seller/page.tsx` with catalog creation, stock replenishment, AWB dispatch, and payout ledgers).
- **Phase P16**: Pre-Production Security Sweep, Load Testing & Launch Readiness (`GET /health`, `security-sweep.e2e-spec.ts`, k6 load scripts, and `PRODUCTION_LAUNCH_CHECKLIST.md`).

## Overall Quality & Verification Metrics
- **NestJS Backend Unit Tests**: 15 Test Suites, 91 Tests (100% Passing Green).
- **NestJS Backend E2E Tests**: 15 Test Suites, 71 Tests (100% Passing Green, including role escalation & IDOR sweeps).
- **Next.js Web App Build**: `pnpm --filter web run build` (Next.js 16.2.0 production build compiled 11 routes in 0.78s with 0 Errors).
- **ESLint & Typecheck**: `pnpm --filter web run typecheck` & `pnpm --filter web run lint` (0 Errors, 0 Warnings).
