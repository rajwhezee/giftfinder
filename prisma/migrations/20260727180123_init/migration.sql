-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "affiliateUrl" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "occasions" TEXT[],
    "interests" TEXT[],
    "ageMin" INTEGER NOT NULL,
    "ageMax" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gift_platform_idx" ON "Gift"("platform");

-- CreateIndex
CREATE INDEX "Gift_occasions_idx" ON "Gift" USING GIN ("occasions");

-- CreateIndex
CREATE INDEX "Gift_interests_idx" ON "Gift" USING GIN ("interests");
