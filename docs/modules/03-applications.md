# 3. Application Management

The unit of work: one student applying to one program at one university for one intake.
**Every commission originates from an application.**

## Data

| Group | Fields |
|---|---|
| Link | studentId, universityId, programId, intakeId, counselorId, branchId |
| Identity | code (APP-2026-0001), appliedOn |
| Money | applicationFee, tuitionFee, currency |
| Offer | offerLetterUrl, offerDate, offerConditions |
| Deposit | depositAmount, depositPaidOn, depositReference, paidViaAgency |
| Outcome | status, enrollmentStatus, enrolledOn, visaStatus, visaAppliedOn, visaDecisionOn |

`tuitionFee` is snapshotted from the Program at creation and is the commission base.

## Rules

1. Status transitions follow 02-status-flows.md; illegal jumps are rejected.
2. On transition to `ENROLLED`:
   - find the CommissionAgreement in force for that university on `enrolledOn`
   - create **one Commission per schedule line** on that agreement (a ONE_TIME
     agreement yields a single row), each at status EXPECTED
   - snapshot rate, rateType, agreementId and scheduleLineId onto each
   - do NOT accrue counselor/agent commission yet (see module 8)
3. On transition to a terminal reject/withdraw status, cancel any non-received
   commission and reverse its GL entry if it was already APPROVED.
4. One student may hold several live applications; only one may reach ENROLLED
   per intake — warn on the second.
5. Application fee charged to the student creates a `StudentInvoice` line (module 6).
6. `paidViaAgency` is snapshotted from `University.collectsTuitionViaAgency` at
   creation. When true, deposit and tuition money flows through
   [module 13](13-tuition-remittance.md) as client money — never as agency revenue.
7. `branchId` is inherited from the assigned counselor and stamps the cost center
   on every voucher this application generates.

## Screens

| Route | Contents |
|---|---|
| `/applications` | Table: code, student, university, program, intake, status, visa, expected commission. Filters: status, university, intake, counselor. |
| `/applications/new` | Student picker -> university -> program (autofills tuition) -> intake |
| `/applications/[id]` | Status stepper, offer/deposit/visa panels, documents, linked commission |
