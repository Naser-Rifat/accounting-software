# 15. Notifications & Reminders

An agency runs on deadlines. This module is what makes the system tell people
things instead of waiting to be asked.

**Phase 1 ships in-app only** — a bell with an unread count and an inbox at
`/notifications`. Email, SMS and WhatsApp are modelled as channels from the start
so adding one later is configuration plus a provider adapter, not a rewrite.

## Triggers

### Deadline reminders (scheduled scan)

| Event | Fires | Recipient |
|---|---|---|
| Passport expiring within 6 months of intake start | daily | Counselor |
| Visa application deadline approaching | 30 / 14 / 7 / 1 days before | Counselor |
| Application deadline for an intake | 14 / 7 days before | Counselor |
| Offer acceptance expiring | 14 / 7 / 3 days before | Counselor |
| Deposit due before enrollment | 7 days before | Counselor |
| Document requested but not uploaded | 7 days after request | Counselor |

### Financial overdue (scheduled scan)

| Event | Fires | Recipient |
|---|---|---|
| Commission claim overdue | 7 / 30 / 60 / 90 days past due | Counselor → Manager → Admin |
| Student invoice overdue | 7 / 30 days past due | Counselor, Accountant |
| Expense bill due for payment | 3 days before due | Accountant |
| Tuition held unremitted | past `tuition.heldAgeWarningDays` (30) | Accountant, Admin |
| Bank account unreconciled | 30 days | Accountant |
| Period still open past its close date | daily after month end | Accountant |
| Suspense account (9000) non-zero | daily | Accountant |
| Control account does not match its subledger | daily | Accountant, Admin |

### Events (immediate)

| Event | Recipient |
|---|---|
| Approval requested | The approver |
| Approval granted or rejected | The requester |
| Commission approved | Counselor, Accountant |
| Commission receipt recorded | Counselor |
| Application status changed | Counselor, Admin |
| Student assigned to a counselor | That counselor |
| Voucher reversed | Accountant, Admin |

## Escalation

Overdue commission escalates rather than repeating at the same person: counselor at
7 days, their branch manager at 30, admin at 60 and 90. Each level is a new
notification, so the trail of who was told what and when survives.

## Cadence

| Class | Delivery |
|---|---|
| Approvals, escalations, reversals | Immediate |
| Everything else | Rolled into one **daily digest** item created each morning |

The digest is a single inbox entry summarising what is overdue, what needs
approval, and what is due this week — not twenty separate rows. Individual
notifications still exist behind it; the digest links to them.

## Data model

```
NotificationRule    { key, event, enabled, offsetDays[], recipientRole,
                      escalationRole?, channel, template }
Notification        { userId, type, title, body, entityType, entityId,
                      severity, readAt, createdAt, idempotencyKey }
NotificationOutbox  { notificationId, channel, status, attempts, sentAt,
                      error, providerRef }
NotificationPref    { userId, type, channel, enabled }
```

`severity`: INFO, WARNING, URGENT — drives the bell colour and digest grouping.

## The two rules that keep this correct

**1. Never send inside a database transaction.** A service writes an outbox row in
the same transaction as the business change, and a worker delivers after commit. A
mail provider timing out must never roll back a posted voucher, and a committed
voucher must never fail to notify.

```
tx: post voucher + write outbox row   -> commit -> worker delivers
```

**2. Every notification carries an idempotency key.** Scans are re-runnable by
design — a cron that fires twice, or a manual re-run after a failure, must not
re-notify. Key format: `<event>:<entityId>:<offsetDays>`, unique-indexed.

## Scheduling

One endpoint, provider-agnostic, so hosting can be decided later:

```
POST /api/cron/run-reminders     header: x-cron-secret
```

Callable by Vercel Cron, a Linux crontab, or any cloud scheduler. It:

1. Rejects the request unless the secret matches (constant-time compare).
2. Runs each scan in sequence, writing notifications with idempotency keys.
3. Builds the daily digest for each user with unread items.
4. Returns counts per scan, so a failed run is visible in the scheduler's logs.

Runs daily at 08:00 **Asia/Dhaka**. All date maths uses the company timezone, not
the server's — a reminder that fires on the wrong side of midnight is a bug.

## Rules

1. Notifications are **not** the audit log. The audit log records what happened;
   notifications record who was told. Never substitute one for the other.
2. Recipients are resolved by role and branch at send time, through the same
   scoping helpers as list screens — a counselor is never notified about another
   branch's student.
3. A notification always links to the record it is about. No dead-end alerts.
4. Users may mute a notification *type*, never an escalation or an approval request.
5. Read state is per user. Nothing is auto-deleted; the inbox is archived after 90 days.

## Screens

| Route | Contents |
|---|---|
| Top bar bell | Unread count, latest 10, mark-all-read |
| `/notifications` | Full inbox: filter by type, severity, read state, date |
| `/admin/notification-rules` | Enable/disable rules, edit offsets and recipients |
| User settings | Per-type mute preferences |

## Files

| Piece | Location |
|---|---|
| Scan definitions | `src/server/services/notifications/scans/` |
| Dispatch + outbox worker | `src/server/services/notifications/dispatch.ts` |
| Channel adapters | `src/server/services/notifications/channels/` (`in-app.ts` now; `email.ts` later) |
| Cron endpoint | `src/app/api/cron/run-reminders/route.ts` |
| Bell + inbox UI | `src/features/notifications/` |
