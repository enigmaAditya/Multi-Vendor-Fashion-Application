-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_reservationCode_skuId_key" ON "inventory_reservations"("reservationCode", "skuId");
