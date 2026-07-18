/*
  Warnings:

  - A unique constraint covering the columns `[shipmentId]` on the table `sub_orders` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[awbCode]` on the table `sub_orders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "sub_orders" ADD COLUMN     "awbCode" TEXT,
ADD COLUMN     "courierName" TEXT,
ADD COLUMN     "shipmentId" TEXT,
ADD COLUMN     "shipmentStatus" TEXT NOT NULL DEFAULT 'PENDING_SYNC';

-- CreateTable
CREATE TABLE "shipment_webhook_logs" (
    "id" TEXT NOT NULL,
    "awbCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipment_webhook_logs_awbCode_status_key" ON "shipment_webhook_logs"("awbCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sub_orders_shipmentId_key" ON "sub_orders"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "sub_orders_awbCode_key" ON "sub_orders"("awbCode");
