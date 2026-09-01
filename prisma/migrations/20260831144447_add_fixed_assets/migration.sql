-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'REDUCING_BALANCE', 'NONE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "DisposalType" AS ENUM ('SALE', 'SCRAP', 'WRITE_OFF');

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetAccountCode" TEXT NOT NULL,
    "accumulatedAccountCode" TEXT NOT NULL,
    "expenseAccountCode" TEXT NOT NULL,
    "defaultMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "defaultUsefulLifeMonths" INTEGER NOT NULL DEFAULT 36,
    "defaultReducingRate" DECIMAL(9,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "supplierPartyId" TEXT,
    "acquiredOn" DATE NOT NULL,
    "cost" DECIMAL(18,2) NOT NULL,
    "salvageValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "method" "DepreciationMethod" NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL,
    "reducingRate" DECIMAL(9,4),
    "depreciationStartOn" DATE NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposedOn" DATE,
    "disposalType" "DisposalType",
    "disposalProceeds" DECIMAL(18,2),
    "disposalEntryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationRun" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "assetCount" INTEGER NOT NULL,
    "journalEntryId" TEXT,
    "voucherNo" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepreciationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationEntry" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "openingNbv" DECIMAL(18,2) NOT NULL,
    "closingNbv" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "DepreciationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_code_key" ON "AssetCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_code_key" ON "Asset"("code");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_categoryId_idx" ON "Asset"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_periodId_key" ON "DepreciationRun"("periodId");

-- CreateIndex
CREATE INDEX "DepreciationEntry_runId_idx" ON "DepreciationEntry"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationEntry_assetId_periodId_key" ON "DepreciationEntry"("assetId", "periodId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationEntry" ADD CONSTRAINT "DepreciationEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DepreciationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationEntry" ADD CONSTRAINT "DepreciationEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
