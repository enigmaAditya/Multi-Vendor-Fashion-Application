-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "amount_charged" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "discount_amount" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" TEXT NOT NULL,
    "discount_value" BIGINT NOT NULL,
    "funding_type" TEXT NOT NULL DEFAULT 'PLATFORM',
    "max_discount_amount" BIGINT,
    "min_order_amount" BIGINT NOT NULL DEFAULT 0,
    "max_redemptions" INTEGER,
    "current_redemptions" INTEGER NOT NULL DEFAULT 0,
    "max_redemptions_per_user" INTEGER NOT NULL DEFAULT 1,
    "seller_id" TEXT,
    "category_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "discount_amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_ledger" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PLATFORM_PROMO_EXPENSE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_code_idx" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_seller_id_idx" ON "coupons"("seller_id");

-- CreateIndex
CREATE INDEX "coupons_category_id_idx" ON "coupons"("category_id");

-- CreateIndex
CREATE INDEX "coupons_is_active_expires_at_idx" ON "coupons"("is_active", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_order_id_key" ON "coupon_redemptions"("order_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_user_id_idx" ON "coupon_redemptions"("coupon_id", "user_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_user_id_idx" ON "coupon_redemptions"("user_id");

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_ledger" ADD CONSTRAINT "promotion_ledger_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
