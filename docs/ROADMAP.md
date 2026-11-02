# FinDesk — Phased roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: design system, app shell, login UI, dashboard (demo), module pages, domain + service layers, docs | Done |
| 2 | Supabase: schema, auth, branches, employees, roles & permissions, RLS | In progress — staff access shipped, live verification pending |
| 3 | Accounting engine: chart of accounts, double-entry ledger, posting functions, idempotency, audit trail; dashboard on live data | In progress — ledger engine shipped; dashboard still demo |
| 4 | Forex Bureau + customers | |
| 5 | Mobile Money (manual recording) | |
| 6 | Cash & float management, reconciliation | |
| 7 | Receipts (58mm / 80mm / A4 / PDF) | |
| 8 | Reports, expenses, administration | |
| 9 | PWA and desktop preparation | |
| 10 | Testing, security review, deployment | |

## Delivered in Phase 2

- **Authentication** — `/login` signs in with Supabase Auth (email + password). `SessionProvider`
  holds the session, `/` and every module page require it, and sign-out ends the session.
- **Staff profiles** — created by a database trigger for every auth user; email, display name and
  active flag live in `public.profiles`.
- **Roles and branches** — nine roles, multi-branch assignments, and a single atomic
  `save_staff_access()` function that only super admins and the company owner may call. Staff cannot
  change their own access, and direct table writes are revoked.
- **Management screens** — `/employees` (roles, branches, active status) and `/branches`
  (create, edit, deactivate). Both are only reachable for staff admins; the interface hides what the
  database would refuse anyway.
- **First administrator** — `claim_initial_admin()` grants `super_admin` to the first signed-in user,
  and only while the company has no roles at all. Run it once, immediately after creating your own
  account.
- **Administrator setup** — see [ADMIN-SETUP.md](ADMIN-SETUP.md) to create a staff account and grant
  `super_admin` (or use the one-time claim button while no roles exist).
- **Tests** — `bun run test` covers the permission matrix, form validation, staff aggregation, auth
  error messages, money arithmetic and route matching.

## Delivered in Phase 3 (accounting engine)

- **Chart of accounts** — 25 seeded accounts across assets, liabilities, equity, income and
  expenses, each with a database-enforced normal balance. Accounts are deactivated, never deleted.
- **Double-entry ledger** — `journal_entries` + `journal_lines` with yearly references, optional
  branch, idempotency keys and reversal links.
- **Atomic posting** — `post_journal_entry()` validates staff, roles, branch access, dates, accounts
  and balance, and is the only write path; clients cannot insert or edit ledger rows.
- **Immutability** — posted entries cannot be updated or deleted; a deferred constraint trigger
  re-checks debits = credits even for direct owner writes. Corrections are reversing entries, and
  an entry can be reversed only once.
- **Derived balances** — `account_balances` security-invoker view feeds `ledger.service.ts`, with
  RLS preserved so branch users only see their branches.
- **Ledger screen** — `/ledger` shows the chart of accounts with debit, credit and signed balances
  (trial balance totals and a balanced/out-of-balance badge), plus the latest journal lines. It is
  read-only and gated by `reports.view`; the database remains the authority.
- **Verified locally** — the migrations and posting rules were executed against a throwaway
  PostgreSQL cluster: balanced/unbalanced posting, idempotent replay, double reversal, role and
  branch scoping, immutability and raw-write balance guards all behave as intended.

## Still pending in Phase 3

- Dashboard now reads ledger balances, recent postings and branch activity; it shows zeros and an
  empty state until the first entry is posted.
- No account drilldown or date filtering yet; the screen shows the whole trial balance and the
  latest 25 entries.
- Audit trail table and `/audit` module are not built; access changes and postings are not yet
  recorded in a dedicated audit log.

## Still pending in Phase 2

- Staff account creation/invites and password reset are handled in the Supabase dashboard, not in
  the app; a self-service invite flow needs a server-side service-role function.
- Live sign-in and RLS checks need a real staff account and the new migration applied.
- Approval workflow and audit records for access changes arrive with the audit trail in Phase 3.

## Still demo / pending after Phase 1

- Dashboard figures: ledger-derived only (`src/services/dashboard.service.ts`); an empty ledger shows zeros and an explicit empty state
- All operations modules (forex, mobile money, cash, customers, expenses, reports): placeholders
  listing planned capabilities; no operations possible
- No ledger, posting functions or audit trail yet
