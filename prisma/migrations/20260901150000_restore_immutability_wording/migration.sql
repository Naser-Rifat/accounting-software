-- Restore the word "immutable" to the voucher immutability error.
--
-- 20260901140000_add_voucher_approval reworded this to "cannot be edited" while
-- extending it to cover PENDING_APPROVAL. The behaviour was unchanged, but the
-- wording is part of the contract — tests/integration/posting.test.ts asserts on
-- it, and rule 5 in docs/03-accounting-standards.md is named by that word.
--
-- Both branches now say "immutable" while still telling you the right way out,
-- which differs by state: a posted voucher is reversed, a submitted one is
-- rejected back to its maker.

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
    IF OLD."status" = 'POSTED' THEN
      RAISE EXCEPTION
        'Voucher % is posted and immutable. Reverse it instead of editing.',
        OLD."voucherNo";
    ELSE
      RAISE EXCEPTION
        'Voucher % is awaiting approval and immutable. Reject it first so the maker can correct it.',
        OLD."voucherNo";
    END IF;
  END IF;

  IF OLD."status" = 'REVERSED' AND NEW."status" <> 'REVERSED' THEN
    RAISE EXCEPTION 'Voucher % is reversed and cannot be reopened.', OLD."voucherNo";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
