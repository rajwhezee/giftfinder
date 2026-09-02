-- AlterTable
ALTER TABLE "Gift" ADD COLUMN     "brand" TEXT;

-- CreateIndex
CREATE INDEX "Gift_brand_idx" ON "Gift"("brand");
