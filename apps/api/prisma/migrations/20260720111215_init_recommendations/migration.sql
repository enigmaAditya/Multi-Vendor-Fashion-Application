-- CreateTable
CREATE TABLE "user_product_views" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_product_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_product_views_user_id_idx" ON "user_product_views"("user_id");

-- CreateIndex
CREATE INDEX "user_product_views_product_id_idx" ON "user_product_views"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_product_views_user_id_product_id_key" ON "user_product_views"("user_id", "product_id");

-- AddForeignKey
ALTER TABLE "user_product_views" ADD CONSTRAINT "user_product_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_product_views" ADD CONSTRAINT "user_product_views_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
