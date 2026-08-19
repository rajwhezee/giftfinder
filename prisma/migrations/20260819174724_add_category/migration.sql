-- AlterTable
ALTER TABLE "Gift" ADD COLUMN     "category" TEXT;

-- CreateIndex
CREATE INDEX "Gift_category_idx" ON "Gift"("category");
