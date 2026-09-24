-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SENT', 'ACKNOWLEDGED', 'PARTIALLY_PAID', 'PAID', 'DISPUTED', 'WRITTEN_OFF', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('SCHOLARSHIP_REDUCTION', 'PARTIAL_WITHDRAWAL', 'UNIVERSITY_DISPUTE', 'CURRENCY_DIFFERENCE', 'BONUS', 'CORRECTION');

-- CreateEnum
CREATE TYPE "InternalCommissionStatus" AS ENUM ('ACCRUED', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('APPLICATION', 'SERVICE', 'VISA_PROCESSING', 'COUNSELING', 'DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "claimId" TEXT;

-- CreateTable
CREATE TABLE "CommissionClaim" (
    "id" TEXT NOT NULL,
    "claimNo" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "claimedOn" DATE,
    "dueOn" DATE,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(18,8),
    "baseAmount" DECIMAL(18,2),
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" TEXT,
    "invoiceUrl" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionAdjustment" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" "AdjustmentReason" NOT NULL,
    "note" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalCommission" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "counselorId" TEXT,
    "agentId" TEXT,
    "rateType" "RateType" NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "earnedAmount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(18,8),
    "baseCurrencyAmount" DECIMAL(18,2),
    "status" "InternalCommissionStatus" NOT NULL DEFAULT 'ACCRUED',
    "approvedOn" DATE,
    "paidOn" DATE,
    "journalEntryId" TEXT,
    "paymentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "applicationId" TEXT,
    "issuedOn" DATE,
    "dueOn" DATE,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "feeType" "FeeType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "taxCode" TEXT,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "StudentInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "withheldTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(18,8) NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "unallocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bankAccountCode" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptAllocation" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "claimId" TEXT,
    "invoiceId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ReceiptAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "noteNo" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "issuedOn" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedOn" TIMESTAMP(3),
    "paidOn" DATE,
    "bankAccountCode" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionClaim_claimNo_key" ON "CommissionClaim"("claimNo");

-- CreateIndex
CREATE INDEX "CommissionClaim_universityId_status_idx" ON "CommissionClaim"("universityId", "status");

-- CreateIndex
CREATE INDEX "CommissionClaim_status_dueOn_idx" ON "CommissionClaim"("status", "dueOn");

-- CreateIndex
CREATE INDEX "CommissionAdjustment_commissionId_idx" ON "CommissionAdjustment"("commissionId");

-- CreateIndex
CREATE INDEX "InternalCommission_partyId_status_idx" ON "InternalCommission"("partyId", "status");

-- CreateIndex
CREATE INDEX "InternalCommission_status_idx" ON "InternalCommission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InternalCommission_commissionId_partyId_key" ON "InternalCommission"("commissionId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInvoice_invoiceNo_key" ON "StudentInvoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "StudentInvoice_studentId_idx" ON "StudentInvoice"("studentId");

-- CreateIndex
CREATE INDEX "StudentInvoice_status_dueOn_idx" ON "StudentInvoice"("status", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInvoiceLine_invoiceId_seq_key" ON "StudentInvoiceLine"("invoiceId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNo_key" ON "Receipt"("receiptNo");

-- CreateIndex
CREATE INDEX "Receipt_partyId_idx" ON "Receipt"("partyId");

-- CreateIndex
CREATE INDEX "Receipt_receivedOn_idx" ON "Receipt"("receivedOn");

-- CreateIndex
CREATE INDEX "ReceiptAllocation_claimId_idx" ON "ReceiptAllocation"("claimId");

-- CreateIndex
CREATE INDEX "ReceiptAllocation_invoiceId_idx" ON "ReceiptAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_noteNo_key" ON "CreditNote"("noteNo");

-- CreateIndex
CREATE INDEX "CreditNote_partyId_idx" ON "CreditNote"("partyId");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_creditNoteId_key" ON "Refund"("creditNoteId");

-- CreateIndex
CREATE INDEX "Refund_studentId_idx" ON "Refund"("studentId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "CommissionClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionClaim" ADD CONSTRAINT "CommissionClaim_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionClaim" ADD CONSTRAINT "CommissionClaim_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalCommission" ADD CONSTRAINT "InternalCommission_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalCommission" ADD CONSTRAINT "InternalCommission_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalCommission" ADD CONSTRAINT "InternalCommission_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalCommission" ADD CONSTRAINT "InternalCommission_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "Counselor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalCommission" ADD CONSTRAINT "InternalCommission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalCommission" ADD CONSTRAINT "InternalCommission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvoice" ADD CONSTRAINT "StudentInvoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvoice" ADD CONSTRAINT "StudentInvoice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvoice" ADD CONSTRAINT "StudentInvoice_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvoiceLine" ADD CONSTRAINT "StudentInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "StudentInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "CommissionClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "StudentInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "StudentInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

