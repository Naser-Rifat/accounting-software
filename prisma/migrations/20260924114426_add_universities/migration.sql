-- CreateEnum
CREATE TYPE "ProgramLevel" AS ENUM ('FOUNDATION', 'DIPLOMA', 'BACHELOR', 'MASTER', 'PHD');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "AppliesTo" AS ENUM ('FIRST_YEAR_TUITION', 'TOTAL_TUITION', 'PER_STUDENT');

-- CreateEnum
CREATE TYPE "EligibilityTrigger" AS ENUM ('ENROLLMENT', 'CENSUS_DATE', 'ARRIVAL');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('ONE_TIME', 'PER_YEAR', 'PER_SEMESTER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TriggerEvent" AS ENUM ('ENROLLMENT', 'CENSUS_DATE', 'ARRIVAL', 'RE_ENROLLMENT', 'FIXED_DATE');

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "collectsTuitionViaAgency" BOOLEAN NOT NULL DEFAULT false,
    "withholdingRate" DECIMAL(9,4),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNo" TEXT,
    "bankSwift" TEXT,
    "bankIban" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversityContact" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversityContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "ProgramLevel" NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "tuitionFee" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "intakeMonths" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionAgreement" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "rateType" "RateType" NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "appliesTo" "AppliesTo" NOT NULL,
    "eligibilityTrigger" "EligibilityTrigger" NOT NULL,
    "scheduleType" "ScheduleType" NOT NULL,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL,
    "contractUrl" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionScheduleLine" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "percentOfTotal" DECIMAL(9,4) NOT NULL,
    "triggerEvent" "TriggerEvent" NOT NULL,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CommissionScheduleLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "University_partyId_key" ON "University"("partyId");

-- CreateIndex
CREATE INDEX "University_name_idx" ON "University"("name");

-- CreateIndex
CREATE INDEX "University_country_idx" ON "University"("country");

-- CreateIndex
CREATE INDEX "University_isActive_idx" ON "University"("isActive");

-- CreateIndex
CREATE INDEX "UniversityContact_universityId_idx" ON "UniversityContact"("universityId");

-- CreateIndex
CREATE INDEX "Program_level_idx" ON "Program"("level");

-- CreateIndex
CREATE UNIQUE INDEX "Program_universityId_name_level_key" ON "Program"("universityId", "name", "level");

-- CreateIndex
CREATE INDEX "CommissionAgreement_universityId_effectiveFrom_idx" ON "CommissionAgreement"("universityId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommissionAgreement_isActive_idx" ON "CommissionAgreement"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionScheduleLine_agreementId_seq_key" ON "CommissionScheduleLine"("agreementId", "seq");

-- AddForeignKey
ALTER TABLE "University" ADD CONSTRAINT "University_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversityContact" ADD CONSTRAINT "UniversityContact_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAgreement" ADD CONSTRAINT "CommissionAgreement_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionScheduleLine" ADD CONSTRAINT "CommissionScheduleLine_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "CommissionAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written, as with the accounting integrity constraints: Prisma schema
-- language cannot express either of these.
-- ---------------------------------------------------------------------------

-- docs/01-domain-model.md invariant 6: active agreements of one university
-- never overlap in time. The service checks this too; the constraint makes it
-- impossible even for a SQL client or a future code path that forgets.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "CommissionAgreement"
  ADD CONSTRAINT "CommissionAgreement_no_overlap"
  EXCLUDE USING gist (
    "universityId" WITH =,
    daterange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::date), '[]') WITH &&
  )
  WHERE ("isActive");

-- At most one primary contact per university.
CREATE UNIQUE INDEX "UniversityContact_one_primary"
  ON "UniversityContact"("universityId")
  WHERE "isPrimary";
