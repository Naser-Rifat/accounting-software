-- Accounting integrity constraints.
--
-- These enforce docs/03-accounting-standards.md at the database level, so a
-- corrupt ledger is impossible even if application code has a bug, a migration
-- script goes wrong, or somebody edits data by hand in a SQL client.
--
-- Prisma schema language cannot express any of these.

-- ---------------------------------------------------------------------------
-- 1. Every line has exactly one of debit/credit, and neither is negative.
--    Rule 1: double entry. A line that is both, or neither, is meaningless.
-- ---------------------------------------------------------------------------

ALTER TABLE "JournalLine"
  ADD CONSTRAINT "journal_line_debit_xor_credit"
  CHECK (
    "debit" >= 0 AND "credit" >= 0
    AND (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
  );

-- ---------------------------------------------------------------------------
-- 2. Every voucher balances: sum(debit) = sum(credit).
--    DEFERRED, so lines can be inserted one at a time and the check runs once
--    at COMMIT. An unbalanced voucher can never be committed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_voucher_balanced() RETURNS TRIGGER AS $$
DECLARE
  v_entry_id TEXT;
  v_debit    NUMERIC(18,2);
  v_credit   NUMERIC(18,2);
BEGIN
  v_entry_id := COALESCE(NEW."entryId", OLD."entryId");

  SELECT COALESCE(SUM("debit"), 0), COALESCE(SUM("credit"), 0)
    INTO v_debit, v_credit
    FROM "JournalLine"
   WHERE "entryId" = v_entry_id;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION
      'Unbalanced voucher %: debits %, credits %, difference %',
      v_entry_id, v_debit, v_credit, (v_debit - v_credit);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_line_balanced
  AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_voucher_balanced();

-- ---------------------------------------------------------------------------
-- 3. Control accounts require a party; non-control accounts forbid one; group
--    accounts accept no postings at all.
--    Rule 7: subsidiary ledgers must reconcile to their control account, which
--    is only possible if every control line names whose balance it is.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_control_account_party() RETURNS TRIGGER AS $$
DECLARE
  v_is_control BOOLEAN;
  v_is_group   BOOLEAN;
  v_code       TEXT;
BEGIN
  SELECT "isControl", "isGroup", "code"
    INTO v_is_control, v_is_group, v_code
    FROM "Account"
   WHERE "id" = NEW."accountId";

  IF v_is_group THEN
    RAISE EXCEPTION 'Account % is a group heading and cannot be posted to', v_code;
  END IF;

  IF v_is_control AND NEW."partyId" IS NULL THEN
    RAISE EXCEPTION 'Account % is a control account and requires a party on every line', v_code;
  END IF;

  IF NOT v_is_control AND NEW."partyId" IS NOT NULL THEN
    RAISE EXCEPTION 'Account % is not a control account; a party may not be set', v_code;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_line_control_party
  BEFORE INSERT OR UPDATE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION assert_control_account_party();

-- ---------------------------------------------------------------------------
-- 4. Posted vouchers are immutable, and reversed ones cannot be reopened.
--    Rule 5: corrections are reversals or credit notes, never edits.
--    DRAFT -> POSTED and POSTED -> REVERSED remain allowed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_voucher_immutable() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION
        'Voucher % is posted and cannot be deleted. Reverse it instead.', OLD."voucherNo";
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'POSTED' AND (
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
      'Voucher % is posted and immutable. Reverse it instead of editing.', OLD."voucherNo";
  END IF;

  IF OLD."status" = 'REVERSED' AND NEW."status" <> 'REVERSED' THEN
    RAISE EXCEPTION 'Voucher % is reversed and cannot be reopened.', OLD."voucherNo";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_immutable
  BEFORE UPDATE OR DELETE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION assert_voucher_immutable();

-- ---------------------------------------------------------------------------
-- 5. Lines of a non-DRAFT voucher cannot be added, changed or removed.
--    Posting flow is therefore: create entry as DRAFT -> insert lines ->
--    flip to POSTED. After that the voucher is frozen.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_posted_lines_immutable() RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
  v_no     TEXT;
BEGIN
  SELECT "status", "voucherNo" INTO v_status, v_no
    FROM "JournalEntry"
   WHERE "id" = COALESCE(NEW."entryId", OLD."entryId");

  -- NULL when the parent entry is already gone (cascade delete of a draft).
  IF v_status IS NOT NULL AND v_status <> 'DRAFT' THEN
    RAISE EXCEPTION
      'Voucher % is posted; its lines cannot be changed. Reverse it instead.', v_no;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_line_posted_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION assert_posted_lines_immutable();
