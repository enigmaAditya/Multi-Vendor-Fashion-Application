# FINAL IMPLEMENTATION PLAN v1.0 — Multi-Vendor Fashion Marketplace

**This is the single execution document.** It merges the roadmap, the Myntra UX reference, the component inventory, and per-module implementation guides into one build order. When this document and reality disagree, update this document.

**Companion documents:** Master Roadmap (phases/scope) · Myntra UX Pattern Reference (screen anatomy) · Client Kickoff Checklist (inputs) · Internal Pricing (money).

---

# PART 1 — FOUNDATIONS

## 1.1 Ground Rules

1. Verify against actual code, never summaries. Every review checks the real diff.
2. Money-path code is hardened from commit one: server-side amounts, timing-safe HMAC, atomic idempotency, raw webhook logs, two-stage commits.
3. Tests ship with the module. Jest + Supertest integration tests; CI green before end of day, every day.
4. TypeScript strict, zero errors, always.
5. Staging deploy from Week 4. Deployment is a habit, not a phase.
6. Client-blocked items always have a workaround (test mode, placeholder, mock). Code never waits.
7. Every "small addition" from the client goes to the change-request log the same day.

## 1.2 Week 0 — Setup

Preconditions: signed proposal + quotation + kickoff checklist, 30% advance received. Same day, trigger the long-fuse client items: Razorpay + Route application, Apple D-U-N-S, SMS DLT, domain.

```bash
# Toolchain (Mac)
node --version            # >= 20 LTS
corepack enable && pnpm --version   # >= 9
docker --version          # Docker Desktop running
pnpm add -g turbo @nestjs/cli eas-cli

# Project
mkdir -p ~/Desktop/AC/marketplace && cd ~/Desktop/AC/marketplace
git init && pnpm dlx create-turbo@latest . --package-manager pnpm
```

## 1.3 Monorepo Layout

```
marketplace/
├── apps/
│   ├── api/               # NestJS modular monolith
│   ├── customer-app/      # Expo RN
│   ├── seller-app/        # Expo RN
│   ├── web/               # Next.js storefront
│   └── admin/             # React admin
├── packages/
│   ├── types/             # zod schemas + inferred types (SOURCE OF TRUTH)
│   ├── api-client/        # typed client, used by all 4 frontends
│   ├── ui-mobile/         # shared RN component library (Part 3)
│   ├── constants/         # enums: statuses, error codes, event names
│   └── config/            # shared tsconfig/eslint/prettier
├── infra/
│   ├── docker-compose.yml # postgres:16, redis:7, meilisearch, minio, mailpit
│   ├── nginx/
│   └── github-actions/
└── docs/
    ├── architecture.md, db-schema/, decisions/ (ADRs), api/
```

Import rule (ESLint-enforced): backend modules import only each other's `index.ts` public interface. Frontends never hand-write fetch — everything via `api-client`.

## 1.4 Conventions — write these as ADR-001..008 before any feature code

| #       | Decision                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-001 | IDs: UUIDv7 everywhere                                                                                                                      |
| ADR-002 | Money: integer paise; `Money` type in `types`; format only at render                                                                        |
| ADR-003 | API envelope `{ success, data, error:{code,message,details} }`; codes in `constants`                                                        |
| ADR-004 | Auth: access JWT 15min + rotating refresh (httpOnly cookie web / SecureStore RN); per-user token version for global revocation; alg pinned  |
| ADR-005 | Order statuses: single enum + transition map; all transitions through `OrderStateMachine` service                                           |
| ADR-006 | Events: `order.placed`, `payment.captured`, `shipment.delivered`; payload schemas in `types`; emitted via outbox table, consumed via BullMQ |
| ADR-007 | Ledgers (`inventory_ledger`, `commission_ledger`): append-only; DB role has INSERT only                                                     |
| ADR-008 | Migrations: Prisma, forward-only in shared envs; reviewed against ERD                                                                       |

---

# PART 2 — WEEKS 1–2: DESIGN (Phase P1 + P2)

**Track A — Wireframes (client-facing):** all 32 customer screens from the Myntra UX Pattern Reference, in order A→I, plus seller-app (~15 screens: KYC ×3, catalog ×4, orders ×4, payouts ×2, profile ×2) and admin (~12 views). Each annotated: pattern source, what changed, marketplace-specific additions (seller grouping in cart, split-shipment messaging, "Sold by" line). Include empty states (cart, wishlist, orders, zero-results, no-network) and the 4 connected flows (guest→auth-gate→checkout, search→filter→PDP→bag, delivery→return→refund, exchange with restock check). Client sign-off = M1.

**Track B — Technical design (parallel):**

- `docs/architecture.md`: 15 modules, responsibilities, owned tables, public interface, events in/out
- Full ERD module-by-module (target 80–120 tables per the roadmap's Phase 3 list)
- Sequence diagrams: multi-seller checkout, return/QC/refund, Route payout, payment-failure recovery
- ADRs 001–008 committed

**Exit gate:** signed wireframes + defensible schema. No Week 3 without both.

---

# PART 3 — UI COMPONENT INVENTORY (`packages/ui-mobile`)

Build these BEFORE any screen (Week 7, two days). Screens then become assembly. The seller app reuses ~60% of them — this is what makes two apps affordable.

## 3.1 Primitives (7)

| Component     | Props / variants                                                                 | Used by                                                         |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Button`      | variant: primary/secondary/ghost/danger; size; loading; disabled; icon           | every screen                                                    |
| `TextField`   | label, error, prefix/suffix, keyboard type; variants: text/phone/pincode/otp-box | auth, address, coupons, KYC                                     |
| `Chip`        | selected, disabled, strikethrough (out-of-stock), count badge                    | size pills, filter values, status filters                       |
| `BottomSheet` | snap points, header, sticky footer slot                                          | size chart, sort, qty/size editors, review form, cancel reasons |
| `Badge`       | color semantic: success/info/warn/muted                                          | order status, verified buyer, default address                   |
| `Skeleton`    | shapes: card/line/circle; shimmer                                                | all list/detail loading states                                  |
| `EmptyState`  | icon, title, subtitle, CTA                                                       | cart, wishlist, orders, zero-results, no-network                |

## 3.2 Commerce components (10)

| Component           | Anatomy                                                                                          | Used by                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `ProductCard`       | 3:4 image, heart overlay (top-right), brand bold, name muted, `PriceBlock`, rating chip on image | PLP, wishlist, similar rail, recently viewed     |
| `PriceBlock`        | price, struck MRP, % off accent; sizes sm/md/lg                                                  | ProductCard, PDP, cart items, order items        |
| `SizePillRow`       | Chip row; stock-aware (strike OOS); onSelect; "Size chart" link slot                             | PDP, wishlist move-to-bag sheet, exchange flow   |
| `RatingChip`        | star + value + count; tap → reviews                                                              | ProductCard, PDP header                          |
| `QtyStepper`        | −/+, min/max from stock                                                                          | cart, quick-add                                  |
| `ImageCarousel`     | paged, dots, tap → lightbox                                                                      | PDP                                              |
| `CartItemRow`       | thumb, brand/name, size+qty chips (open BottomSheet editors), PriceBlock, remove/move actions    | cart                                             |
| `SellerGroupHeader` | "Sold by X • delivery by DATE"                                                                   | cart (multi-vendor grouping), order confirmation |
| `PriceSummaryCard`  | rows: bag total, discount, coupon, shipping, total; savings banner                               | cart, checkout, order detail                     |
| `CouponRow`         | code, benefit, conditions, Apply/greyed-with-reason                                              | coupons screen                                   |

## 3.3 Structure & flow components (8)

| Component        | Anatomy                                                                                               | Used by                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `SearchBar`      | icon, placeholder, tap-through or live mode                                                           | home (pinned), search screen                                   |
| `FilterDrawer`   | full-screen, left rail categories, right values w/ counts, sticky "Apply (N)"                         | PLP; admin reuses pattern on web                               |
| `SortSheet`      | radio list in BottomSheet                                                                             | PLP                                                            |
| `ModuleRenderer` | renders admin-configured home modules: banner-carousel / category-circles / product-rail / brand-grid | home feed                                                      |
| `StatusTimeline` | vertical steps, timestamps, active/complete/pending states                                            | order tracking, return status, seller order detail             |
| `AddressCard`    | radio-select or display mode, HOME/WORK tag, default badge, edit/delete                               | address list, checkout                                         |
| `OrderCard`      | thumb, name, colored status line, ETA/date                                                            | orders list (customer + seller apps)                           |
| `StepFlow`       | header progress, back handling, per-step validate                                                     | return/exchange (4 steps), KYC (3 steps), add product (seller) |

**Definition of done per component:** typed props from `packages/types`, all variants in a Storybook-style demo screen (`apps/customer-app/src/dev/gallery`), dark-safe colors from theme tokens, no hardcoded hex.

---

# PART 4 — BACKEND MODULE IMPLEMENTATION GUIDES

Order of construction. Each guide: key tables → endpoints → core logic → tests that must exist.

## 4.1 Identity (Week 3)

- **Tables:** users, roles, user_roles, sessions/refresh_tokens (hashed, rotated), oauth_accounts, otp_requests, devices, addresses
- **Endpoints:** POST /auth/otp/request, /auth/otp/verify, /auth/oauth/google, /auth/refresh, /auth/logout; CRUD /me/addresses
- **How:** OTP → random 6-digit, hash stored, 5-min TTL, max 3 tries, resend throttle (Redis). Dev mode: OTP to mailpit/console **gated by `NODE_ENV` from day one**. Refresh rotation: on use, invalidate old, issue new; reuse detection bumps token_version (global logout). Guards: `@Roles()` decorator reading JWT claims.
- **Tests:** OTP happy path, replay refresh token → all sessions killed, role escalation attempt → 403.

## 4.2 Catalog (Week 4)

- **Tables:** categories (parent_id + path materialized), brands, products, product_variants (color level), skus (size level: price, mrp, stock ref), attributes, attribute_values, product_attribute_map, product_images, size_charts
- **Endpoints:** public GET /categories/tree, /products (paginated+filtered), /products/:slug; seller POST/PATCH product+variant+sku; admin approve/reject
- **How:** product → variants → skus strictly: price & stock live ONLY on sku. Slugs unique, generated server-side. Product status: draft → pending_review → live → suspended. Emit `product.updated` on any change (feeds search sync).
- **Tests:** variant/SKU integrity (can't create SKU without variant), moderation transitions.

## 4.3 Media (Week 4)

- **How:** client asks POST /media/presign → uploads direct to MinIO/S3 → confirms → BullMQ job: validate (magic bytes, dimensions), resize (thumb/card/detail), WebP, write product_images rows. Never proxy file bytes through the API.
- **Tests:** reject non-image masquerading as jpg; job idempotent on retry.

## 4.4 Inventory (Week 5)

- **Tables:** sku_inventory (seller × warehouse × sku, on_hand, reserved), inventory_reservations (order_ref, qty, expires_at, status), inventory_ledger (append-only: delta, reason, ref)
- **How:** reservation = single atomic UPDATE `SET reserved = reserved + $qty WHERE on_hand - reserved >= $qty` + reservation row; confirm converts to on_hand decrement + ledger entry; release on payment failure or TTL (BullMQ sweeper every minute). ALL stock math in SQL, never read-modify-write in JS.
- **Tests:** two concurrent checkouts, last unit → exactly one succeeds. Sweeper releases expired.

## 4.5 Cart & Wishlist (Week 5–6)

- **How:** cart hot-path in Redis hash (user → {sku: qty}), snapshot to PG on mutation (async). GET /cart hydrates: live price, stock, seller grouping, ETA per seller — cart NEVER trusts stored prices; always recompute.
- **Tests:** price change between add and view reflects; OOS item flagged not silently dropped.

## 4.6 Orders + Checkout + Payments (Weeks 13–16) — the crown jewel

- **Tables:** orders, sub_orders (per seller), order_items (denormalized name/price snapshot), order_status_history, payments, payment_attempts, refunds, webhook_events (raw), cancellations
- **Checkout sequence (must match Phase-2 diagram):**
  1. POST /checkout/quote → server computes: items (live sku price), per-seller split, shipping, coupon, total. Returns quote_id (Redis, 10 min).
  2. POST /checkout/confirm {quote_id, address, payment_method} → in ONE transaction: create order + sub_orders + items, reserve inventory; then create Razorpay order for quoted amount. Idempotency-Key header → same response on retry.
  3. Client pays via Razorpay checkout.
  4. POST /payments/verify (HMAC timing-safe) AND webhook both funnel to one idempotent `confirmPayment()` — atomic `UPDATE payments SET status='captured' WHERE id=$1 AND status='pending'` guards double-processing. On capture: confirm reservations, transition sub_orders → confirmed, emit events.
  5. Reconciliation cron: pending payments > 15 min → query Razorpay API → settle or release.
- **COD:** skip 3–4; sub_orders → confirmed immediately; COD cap + pincode rules in quote step.
- **Refunds:** two-stage — refund row 'initiated' → Razorpay call → webhook confirms → 'completed' + ledger. Never mark done on API response alone.
- **Tests (minimum 15):** amount tampering (client total ignored), replayed webhook, forged signature, double confirm, reservation release on failure, split math to the paisa.

## 4.7 Payouts (Week 15–16, inside P5)

- **Tables:** seller_linked_accounts (Route), settlements, seller_payouts, payout_line_items, commission_ledger (append-only)
- **How:** on `shipment.delivered` + return-window close (BullMQ delayed job): compute commission per line → ledger entries → weekly payout run groups eligible line items → Razorpay Route transfer → settlement row. Seller dashboard reads ONLY ledger + payouts (single source, reconciles by construction).
- **Tests:** commission math per category rate; return before window close → line item excluded.

## 4.8 Search (Weeks 16–17)

- **How:** Meilisearch index settings as code (searchable/filterable/sortable attrs, synonyms, ranking rules incl. sales_velocity, rating, in_stock). BullMQ consumer on `product.updated`/`inventory.changed` upserts documents. GET /search proxies with facets → FilterDrawer counts. Log every query {q, filters, results_count} → search_queries_log.
- **Tests:** OOS product sinks in ranking; facet counts match; sync worker idempotent.

## 4.9 Logistics (Weeks 21–23)

- **Tables:** shipments, shipment_items, tracking_events, pincode_serviceability (cache), ndr_events, returns, return_items, exchanges
- **How:** on sub_order → ready_to_ship: Shiprocket order + AWB → label URL to seller app. Webhook → tracking_events → OrderStateMachine transition → customer notification. Serviceability: GET /serviceability/:pincode cached 24h in Redis (feeds PDP ETA). Returns: request → reverse pickup → QC result webhook/admin action → QC pass triggers refund (4.6 pipeline) + restock ledger entry. Exchange: return leg + linked forward sub_order with price-diff = 0 rule and live stock check on the replacement size. NDR: webhook → ndr_events → re-attempt or RTO flow surfaced in admin.

## 4.10 Reviews · Coupons · Notifications (Weeks 23–24)

- **Reviews:** verified-purchase only (join on delivered order_items); photos via media pipeline; moderation state; size-fit answer stored from day one (aggregate UI is v2).
- **Coupons:** rules as typed JSON (min_cart, scope category/brand, first_order, usage caps, stacking=false default). Evaluated INSIDE checkout quote step (4.6) — never a separate discount path. Redemption row on order confirm, released on cancellation.
- **Notifications:** notification module consumes domain events → template registry (FCM/SMS/email per event) → BullMQ send with retry → notification_log. SMS templates must match DLT-approved text exactly.

## 4.11 Admin (Weeks 21–26, parallel)

React app consuming existing admin endpoints; build in this order: seller KYC review → catalog moderation → orders console (search + refund override) → commissions & payout runs → coupons/banners (writes ModuleRenderer config) → dashboards (SQL views, no BI tooling).

---

# PART 5 — SCREEN ASSEMBLY MAP (customer app, Weeks 8–12)

| Week   | Screens (UX ref IDs)                                                                         | Components consumed                                                     | Backend needed               |
| ------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| 8      | A1–A3 auth, B3 nav shell, I1 profile hub                                                     | Button, TextField(otp), StepFlow                                        | 4.1                          |
| 8–9    | B1 home, B2 category, C1–C3 search (interim)                                                 | ModuleRenderer, SearchBar, ProductCard                                  | 4.2, PG full-text            |
| 9–10   | D1–D3 PLP + filter + sort                                                                    | ProductCard, FilterDrawer, SortSheet, Skeleton                          | 4.2                          |
| 10–11  | E1–E4 PDP + size chart + zoom + reviews section                                              | ImageCarousel, SizePillRow, PriceBlock, RatingChip, BottomSheet         | 4.2, 4.9 serviceability stub |
| 11     | F1 wishlist, F2 cart, F3 coupons                                                             | CartItemRow, SellerGroupHeader, PriceSummaryCard, CouponRow, QtyStepper | 4.5                          |
| 12     | G1 address, I2 address book, B4 notifications, I4 settings (+account deletion), empty states | AddressCard, EmptyState                                                 | 4.1                          |
| **12** | **M2 DEMO on staging → 20% payment**                                                         |                                                                         |                              |
| 13–16  | G2 payment, G3 confirmation, H1–H3 orders/tracking/cancel                                    | StatusTimeline, OrderCard, PriceSummaryCard                             | 4.6                          |
| 21–23  | H4 return/exchange, I3 support                                                               | StepFlow, StatusTimeline                                                | 4.9                          |
| 23–24  | H5 rate & review                                                                             | BottomSheet form                                                        | 4.10                         |

Website (Next.js) mirrors weeks 10–12 flows with SSR + product structured data + sitemap; seller app (Weeks 17–21) assembles from the same `ui-mobile` inventory per its 15 wireframed screens.

---

# PART 6 — MASTER SCHEDULE & GATES

| Weeks | Work                                                                                                 | Gate                                |
| ----- | ---------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 0     | Signing, advance, long-fuse triggers, machine setup                                                  | Advance received                    |
| 1–2   | Wireframes (all 3 surfaces) + architecture + ERD + ADRs                                              | **M1 sign-off**                     |
| 3–6   | Backend core: identity → catalog → media → inventory → cart; staging live Wk4; seed data             | CI green, staging demo-able         |
| 7     | `ui-mobile` component inventory + api-client + app/web scaffolds                                     | Gallery screen complete             |
| 8–12  | Customer app + website screens per Part 5                                                            | **M2 demo → 20%**                   |
| 13–16 | Orders/checkout/payments/payouts (4.6–4.7) + search (4.8)                                            | E2E test-mode purchase              |
| 17–21 | Seller app                                                                                           | **M3 demo → 25%**                   |
| 21–24 | Logistics, reviews/coupons/notifications; admin in parallel (→26)                                    | Return+exchange E2E                 |
| 26–28 | Security sweep (IDOR seller isolation, payment tampering, XSS, uploads) + k6 load on checkout/search | Findings closed                     |
| 28–30 | Production infra, live payment, DLT SMS live, store submissions, backup drill, runbook               | **M4 launch → 25% + code handover** |

## Client-dependency tracker (check every Friday; escalate in writing same day)

| Dependency              | Needed by  | Workaround                               |
| ----------------------- | ---------- | ---------------------------------------- |
| Brand assets            | Wk 7       | Neutral theme tokens, swap in one file   |
| Razorpay Route approval | Wk 14      | Test keys + Route sandbox                |
| Pilot seller data       | Wk 6 / 17  | Generated seed catalog                   |
| DLT SMS approval        | Wk 28 prod | mailpit/console OTP (env-gated)          |
| Apple account (D-U-N-S) | Wk 26      | Android-first EAS internal builds        |
| Policy decisions        | Wk 13      | Checklist bracket defaults, configurable |

## Cadence

Daily: EOD commit, CI green. Weekly: Friday review vs this plan, `PROGRESS.md`, short written client update. Per milestone: staging demo → written sign-off → invoice → next phase.

---

**Start now:** ADR-001..008 → wireframe A1. Week 1 is paper, not code.
