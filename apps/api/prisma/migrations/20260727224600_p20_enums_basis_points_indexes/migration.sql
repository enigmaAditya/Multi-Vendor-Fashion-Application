-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('PENDING_UPLOAD', 'PENDING_REVIEW', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LIVE', 'ARCHIVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SubOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SubOrderSettlementStatus" AS ENUM ('PENDING', 'SETTLING', 'SETTLED', 'BLOCKED', 'CANCELED', 'FAILED_PERMANENT', 'CLAWBACK_REQUIRED');

-- CreateEnum
CREATE TYPE "SubOrderShipmentStatus" AS ENUM ('PENDING_SYNC', 'SYNCING', 'SYNCED', 'FAILED_SYNC', 'IN_TRANSIT', 'DELIVERED', 'RTO', 'CANCELLED', 'LOST');

-- CreateEnum
CREATE TYPE "CouponFundingType" AS ENUM ('PLATFORM', 'SELLER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterTable products
ALTER TABLE "products" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "status" TYPE "ProductStatus" USING ("status"::text::"ProductStatus");
ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"ProductStatus";

-- AlterTable sub_orders
ALTER TABLE "sub_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sub_orders" ALTER COLUMN "status" TYPE "SubOrderStatus" USING ("status"::text::"SubOrderStatus");
ALTER TABLE "sub_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"SubOrderStatus";

ALTER TABLE "sub_orders" ALTER COLUMN "settlementStatus" DROP DEFAULT;
ALTER TABLE "sub_orders" ALTER COLUMN "settlementStatus" TYPE "SubOrderSettlementStatus" USING ("settlementStatus"::text::"SubOrderSettlementStatus");
ALTER TABLE "sub_orders" ALTER COLUMN "settlementStatus" SET DEFAULT 'PENDING'::"SubOrderSettlementStatus";

ALTER TABLE "sub_orders" ALTER COLUMN "shipmentStatus" DROP DEFAULT;
ALTER TABLE "sub_orders" ALTER COLUMN "shipmentStatus" TYPE "SubOrderShipmentStatus" USING ("shipmentStatus"::text::"SubOrderShipmentStatus");
ALTER TABLE "sub_orders" ALTER COLUMN "shipmentStatus" SET DEFAULT 'PENDING_SYNC'::"SubOrderShipmentStatus";

-- AlterTable coupons
ALTER TABLE "coupons" ALTER COLUMN "discount_type" TYPE "DiscountType" USING ("discount_type"::text::"DiscountType");
ALTER TABLE "coupons" ALTER COLUMN "funding_type" DROP DEFAULT;
ALTER TABLE "coupons" ALTER COLUMN "funding_type" TYPE "CouponFundingType" USING ("funding_type"::text::"CouponFundingType");
ALTER TABLE "coupons" ALTER COLUMN "funding_type" SET DEFAULT 'PLATFORM'::"CouponFundingType";

-- AlterTable commission_rules
ALTER TABLE "commission_rules" RENAME COLUMN "ratePercent" TO "rateBasisPoints";
ALTER TABLE "commission_rules" ALTER COLUMN "rateBasisPoints" TYPE INTEGER USING ROUND("rateBasisPoints" * 100)::INTEGER;

-- AlterTable commission_ledger
ALTER TABLE "commission_ledger" RENAME COLUMN "feeRate" TO "feeRateBasisPoints";
ALTER TABLE "commission_ledger" ALTER COLUMN "feeRateBasisPoints" TYPE INTEGER USING ROUND("feeRateBasisPoints" * 100)::INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sub_orders_sellerId_status_idx" ON "sub_orders"("sellerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outbox_events_processed_idx" ON "outbox_events"("processed");
