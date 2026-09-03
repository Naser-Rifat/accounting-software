-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_BANKING');

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "glAccountCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseBill" (
    "id" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "incurredOn" DATE NOT NULL,
    "dueOn" DATE,
    "amount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxCode" TEXT,
    "total" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "fxRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "vendorRef" TEXT,
    "description" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "applicationRef" TEXT,
    "costCenterId" TEXT,
    "journalEntryId" TEXT,
    "approvedOn" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "withheldTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netPaid" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "fxRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "bankAccountCode" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNote" (
    "id" TEXT NOT NULL,
    "noteNo" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "billId" TEXT,
    "issuedOn" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_code_key" ON "ExpenseCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseBill_billNo_key" ON "ExpenseBill"("billNo");

-- CreateIndex
CREATE INDEX "ExpenseBill_partyId_idx" ON "ExpenseBill"("partyId");

-- CreateIndex
CREATE INDEX "ExpenseBill_status_idx" ON "ExpenseBill"("status");

-- CreateIndex
CREATE INDEX "ExpenseBill_dueOn_idx" ON "ExpenseBill"("dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentNo_key" ON "Payment"("paymentNo");

-- CreateIndex
CREATE INDEX "Payment_partyId_idx" ON "Payment"("partyId");

-- CreateIndex
CREATE INDEX "Payment_paidOn_idx" ON "Payment"("paidOn");

-- CreateIndex
CREATE INDEX "PaymentAllocation_billId_idx" ON "PaymentAllocation"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_billId_key" ON "PaymentAllocation"("paymentId", "billId");

-- CreateIndex
CREATE UNIQUE INDEX "DebitNote_noteNo_key" ON "DebitNote"("noteNo");

-- CreateIndex
CREATE INDEX "DebitNote_partyId_idx" ON "DebitNote"("partyId");

-- CreateIndex
CREATE INDEX "DebitNote_billId_idx" ON "DebitNote"("billId");

-- AddForeignKey
ALTER TABLE "ExpenseBill" ADD CONSTRAINT "ExpenseBill_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBill" ADD CONSTRAINT "ExpenseBill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ExpenseBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ExpenseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
