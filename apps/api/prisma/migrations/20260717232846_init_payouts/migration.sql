-- AlterTable
ALTER TABLE "sub_orders" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "settlementStatus" TEXT NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "sellerId" TEXT,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_ledger" (
    "id" TEXT NOT NULL,
    "subOrderId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "feeRate" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_linked_accounts" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "gatewayAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_linked_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "subOrderId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "gatewayTransferId" TEXT,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_rules_categoryId_key" ON "commission_rules"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "commission_rules_sellerId_key" ON "commission_rules"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_linked_accounts_sellerId_key" ON "seller_linked_accounts"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_subOrderId_key" ON "payouts"("subOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_idempotencyKey_key" ON "payouts"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_subOrderId_fkey" FOREIGN KEY ("subOrderId") REFERENCES "sub_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_linked_accounts" ADD CONSTRAINT "seller_linked_accounts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_subOrderId_fkey" FOREIGN KEY ("subOrderId") REFERENCES "sub_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
