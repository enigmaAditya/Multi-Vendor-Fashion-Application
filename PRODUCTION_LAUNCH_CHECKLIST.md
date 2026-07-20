# Production Launch & Deployment Checklist

This document provides operational instructions for deploying the Multi-Vendor Fashion Application to production environments.

---

## 1. Environment & Infrastructure Requirements

- **Runtime Environment**: Node.js v20.x or higher, pnpm v9.x.
- **Relational Database**: PostgreSQL v15+ (Hosted on AWS RDS / GCP Cloud SQL).
- **In-Memory Cache & Message Queue**: Redis v7+ (AWS ElastiCache / Redis Cloud).
- **Search Engine**: Meilisearch v1.6+ (Self-hosted Docker / Meilisearch Cloud).
- **Web Host**: Vercel / AWS ECS / Cloud Run for Next.js App (`apps/web`).
- **API Host**: AWS ECS / GCP Cloud Run / Render for NestJS API (`apps/api`).

---

## 2. Production Secrets & Configuration Audit

| Environment Variable | Description | Example / Required Format |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection URI | `postgresql://user:pass@db-host:5432/marketplace?schema=public` |
| `REDIS_URL` | Redis connection URI | `redis://default:pass@redis-host:6379` |
| `MEILISEARCH_HOST` | Meilisearch engine host | `https://search.yourdomain.com` |
| `MEILISEARCH_MASTER_KEY` | Meilisearch admin API key | Secure random string (32+ chars) |
| `JWT_ACCESS_SECRET` | Auth JWT signing key | Secure random secret key |
| `RAZORPAY_KEY_ID` | Razorpay Live Key ID | `rzp_live_xxxxxxxxxxxx` |
| `RAZORPAY_KEY_SECRET` | Razorpay Live Secret | Live Secret Key |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Webhook HMAC secret | Webhook signing secret |
| `SHIPROCKET_API_KEY` | Shiprocket API credentials | Production API token |
| `RESEND_API_KEY` | Transactional email provider API key | `re_xxxxxxxxxxxx` |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase Cloud Messaging service account | Base64 encoded JSON key |

---

## 3. Pre-Flight Database Migration & Seeding Steps

```bash
# 1. Run database schema migrations
pnpm --filter api exec prisma migrate deploy

# 2. Sync Meilisearch search index settings & attributes
pnpm --filter api run seed:search-index

# 3. Verify System Health Endpoint
curl https://api.yourdomain.com/health
# Expected Output: {"status":"OK","services":{"database":"UP","redis":"UP"}}
```

---

## 4. Operational Health & Monitoring Summary

- **Health Check Endpoint**: `GET /health` returns live health status for PostgreSQL and Redis.
- **Stock Lock Concurrency Protection**: Verified atomic stock reservation under 50 concurrent VU claims.
- **Deduplicated Multi-Channel Outbox**: BullMQ workers process `order.paid`, `shipment.dispatched`, and `payout.settled` outbox events asynchronously.
- **Security & Authorization Hardening**:
  - Class and method-level `@Roles('ADMIN')` protection on all 7 operator endpoints.
  - Method-level caller ownership validation (`order.buyerId === buyerId`, `subOrder.sellerId === sellerId`, `sku.sellerId === sellerId`) across all buyer and seller endpoints.
