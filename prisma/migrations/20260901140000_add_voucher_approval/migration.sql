-- Maker-checker approval for manual journal vouchers.
--
-- docs/03-accounting-standards.md rule 9 (audit trail) and docs/02-status-flows.md.
-- A hand-entered voucher no longer reaches the ledger on the strength of one
-- person's click: it is created PENDING_APPROVAL and a *different* user posts it.
--
-- Reports are unaffected: every report query filters on
-- status IN ('POSTED','REVERSED'), so a pending voucher is invisible to the
-- trial balance and the financial statements until it is approved.

-- ---------------------------------------------------------------------------
-- 1. The new status.
--    Safe inside Prisma's migration transaction on PostgreSQL 12+: adding an
--    enum value is transactional as long as the value is not *used* in the same
--    transaction, and nothing below writes it.
-- ---------------------------------------------------------------------------

ALTER TYPE "VoucherStatus" ADD VALUE 'PENDING_APPROVAL' BEFORE 'POSTED';

-- ---------------------------------------------------------------------------
-- 2. Who submitted, who approved, who rejected and why.
--    Nullable because every existing voucher predates the workflow, and
--    system-generated postings never enter it.
-- ---------------------------------------------------------------------------

ALTER TABLE "JournalEntry"
  ADD COLUMN "submittedBy"     TEXT,
  ADD COLUMN "submittedAt"     TIMESTAMP(3),
  ADD COLUMN "approvedBy"      TEXT,
  ADD COLUMN "approvedAt"      TIMESTAMP(3),
  ADD COLUMN "rejectedBy"      TEXT,
  ADD COLUMN "rejectedAt"      TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- ---------------------------------------------------------------------------
-- 3. A submitted voucher is frozen, exactly like a posted one.
--    Without this a maker could alter the amounts after the checker opened it.
--    Its lines are already protected: journal_line_posted_immutable refuses any
--    line change when the parent entry is not DRAFT.
--
--    PENDING_APPROVAL -> POSTED (approve) and PENDING_APPROVAL -> DRAFT
--    (reject, so the maker can correct it) both remain allowed, because only
--    the listed header columns are frozen, not "status" itself.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_voucher_immutable() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION
        'Voucher % is % and cannot be deleted. Reverse it instead.',
        OLD."voucherNo", LOWER(OLD."status"::text);
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" IN ('POSTED', 'PENDING_APPROVAL') AND (
       NEW."voucherNo"   IS DISTINCT FROM OLD."voucherNo"
    OR NEW."voucherType" IS DISTINCT FROM OLD."voucherType"
    OR NEW."entryDate"   IS DISTINCT FROM OLD."entryDate"
    OR NEW."currency"    IS DISTINCT FROM OLD."currency"
    OR NEW."fxRate"      IS DISTINCT FROM OLD."fxRate"
    OR NEW."periodId"    IS DISTINCT FROM OLD."periodId"
    OR NEW."narration"   IS DISTINCT FROM OLD."narration"
    OR NEW."sourceType"  IS DISTINCT FROM OLD."sourceType"
    OR NEW."sourceId"    IS DISTINCT FROM OLD."sourceId"
  ) THEN
    RAISE EXCEPTION
      'Voucher % is % and cannot be edited. %',
      OLD."voucherNo",
      LOWER(OLD."status"::text),
      CASE WHEN OLD."status" = 'POSTED'
           THEN 'Reverse it instead.'
           ELSE 'Reject it first so the maker can correct it.'
      END;
  END IF;

  IF OLD."status" = 'REVERSED' AND NEW."status" <> 'REVERSED' THEN
    RAISE EXCEPTION 'Voucher % is reversed and cannot be reopened.', OLD."voucherNo";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 4. A voucher may never be approved by the person who submitted it.
--    Enforced here as well as in the service, because maker-checker is worth
--    nothing if a direct SQL update or a future code path can sidestep it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_approver_is_not_maker() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" = 'POSTED' AND OLD."status" = 'PENDING_APPROVAL' THEN
    IF NEW."approvedBy" IS NULL THEN
      RAISE EXCEPTION 'Voucher % cannot be posted without an approver.', NEW."voucherNo";
    END IF;
    IF NEW."approvedBy" = COALESCE(NEW."submittedBy", NEW."createdBy") THEN
      RAISE EXCEPTION
        'Voucher % was submitted by % and cannot be approved by the same user.',
        NEW."voucherNo", NEW."approvedBy";
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_maker_checker
  BEFORE UPDATE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION assert_approver_is_not_maker();

-- Note: no partial index on status = 'PENDING_APPROVAL'. PostgreSQL refuses to
-- *use* an enum value in the same transaction that adds it, and the existing
-- JournalEntry_status_idx already serves the review queue.
