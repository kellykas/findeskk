# FinDesk — Architecture

Forex Bureau and Mobile Money agency management system for a single-branch company in Uganda.

## Stack
- TanStack Start (React 19, TypeScript, Vite), Tailwind CSS v4, shadcn/ui
- Backend (Phase 2+): Supabase PostgreSQL, Auth, RLS, Storage
- Source control: GitHub (two-way sync)

## Folder structure
```text
src/
  routes/            Pages (file-based routing). Thin: compose components + services.
  components/
    ui/              shadcn primitives (do not add business logic)
    layout/          AppShell (sidebar, top bar, mobile drawer)
    shared/          PageHeader, StatCard, SectionCard, DataTable, AccessDenied, ModulePlaceholder
  config/modules.ts  Module registry: navigation, titles, permissions, delivery phase
  domain/            Pure TypeScript: money, currency, roles. No React, no I/O.
  services/          Data access behind typed interfaces + TanStack Query options
  integrations/      (Phase 2) Supabase clients, generated types
supabase/migrations/ (Phase 2) Ordered SQL migrations
docs/                Architecture and roadmap
```

## Data flow
```text
Route loader -> service query options -> (demo | Supabase) -> domain types -> components
```
Components only receive typed domain objects. The dashboard now reads ledger balances and journal entries directly; an empty ledger renders zeros and an explicit empty state, never sample data.

## Authentication and staff access (Phase 2)

```text
/login -> auth.service (Supabase Auth) -> SessionProvider -> viewer (profile + roles + branches)
      -> AppShell (requires session, filters navigation by permission)
      -> /employees (staff admins only; enforced by RLS and service-role server functions)
```

- The session is resolved in the browser only (`src/hooks/use-session.tsx`); SSR renders a loading
  state and protected pages never render without a viewer. This is a UX gate — PostgreSQL RLS is the
  security boundary.
- The viewer is `profiles` + `user_roles` + `branch_assignments` for the signed-in user. Inactive
  profiles and profiles without roles see an access screen instead of the app.
- `src/domain/access.ts` maps roles to permissions for navigation and gating. It intentionally
  mirrors `public.is_staff_admin()`: only `super_admin` and `company_owner` can manage staff.
- Staff accounts are created, edited and deleted in `/employees` through the server functions in
  `src/functions/staffAccounts.ts`. Each call carries the caller's Supabase access token in its
  payload, because the browser session lives in local storage and framework server-function calls
  send no Authorization header; the server verifies that token with Supabase, checks the caller is a
  staff admin, then uses the service-role client, whose key never reaches the browser. The trigger
  `create_staff_profile()`
  still creates the matching profile. The server refuses changing your own access, removing the last
  administrator, and deleting a staff member who already posted ledger entries.
- The first administrator is appointed with `claim_initial_admin()`, which only succeeds while
  `public.user_roles` is empty. It is one-time by construction; later claims return `false`.
- The company runs one branch, so there is no branch management screen: new staff are assigned to
  the single active branch automatically. Branches are deactivated rather than deleted, so
  historical data and assignments stay intact.

### Employee ID cards

`/employees → ID card` issues one card per staff profile: a photo in the private `staff-photos`
bucket, a unique employee number (`FD-0001`, editable by an administrator) and a random
`id_card_token`. The card is laid out at CR80 size, portrait (54 × 85.6 mm) and printed through the browser's
own print-to-PDF, so the file is vector-crisp without a PDF dependency. The printed QR code opens
`/id/<token>`, a public route that reads `public.get_staff_id_card()` — a security-definer function
returning only the printed fields (name, number, role, branch, status, photo path) and never the
email, phone or any transaction. The photo itself is served through a short-lived signed URL minted
by a server function, because the bucket stays private. Writes go through a server function too:
`profiles` is not writable from the browser, and creating that photo path needs the service role.

## Accounting ledger (Phase 3)

```text
post_journal_entry(entry_date, description, branch, lines, idempotency_key)
   -> validates staff, roles, branch, lines, balance
   -> journal_entries + journal_lines (balanced, immutable)
   -> account_balances view (security invoker) -> ledger.service -> future UI
```

- `public.accounts` is the chart of accounts: asset, liability, equity, income and expense,
  each with a normal balance enforced by a check constraint, and a seeded set of system accounts.
- `public.journal_entries` / `public.journal_lines` store double-entry postings. Entries carry a
  yearly reference (`JV-2026-000001`), an optional branch, an optional idempotency key and a
  one-to-one `reverses_entry_id` link for corrections.
- `post_journal_entry()` is the only write path. It requires an active staff profile with a ledger
  role (`super_admin`, `company_owner`, `accountant`), rejects future dates, unknown or inactive
  accounts, fewer than two lines, non-positive amounts and unbalanced entries, and checks branch
  access. Replaying an idempotency key returns the original entry id instead of posting twice.
- Corrections are reversing entries. Update/delete triggers refuse any change to posted entries,
  and a deferred constraint trigger re-verifies debits = credits, so even `service_role` cannot
  write an unbalanced entry.
- `public.account_balances` is a security-invoker view, so RLS on `journal_lines` still applies: a
  teller sees balances derived only from their assigned branches. Company-wide roles are
  `super_admin`, `company_owner`, `accountant`, `auditor` and `general_manager`.
- The ledger is kept in the base currency (UGX). Foreign currency holdings post their UGX value at
  acquisition cost; rate history and inventory arrive in Phase 4.
- `src/domain/ledger.ts` holds the pure rules (line validation, normal balances, trial balance) and
  `src/services/ledger.service.ts` the typed reads/posting. `/ledger` renders the trial balance and
  recent journal lines read-only for roles with `reports.view`.

## Key decisions
1. **Money as bigint minor units** on the client (`domain/money.ts`); NUMERIC in PostgreSQL. No floats.
2. **Ledger is the source of truth.** Balances are derived from balanced double-entry postings created atomically by database functions with idempotency keys. No "balance += x" updates from the UI.
3. **Authorization in the database.** Roles in a separate `user_roles` table, checked by `has_role()` security-definer functions and RLS, scoped by branch. Access changes go through `save_staff_access()`; direct writes to `user_roles`, `branch_assignments` and `profiles` are revoked from clients.
4. **Reversals, not deletes.** Posted transactions are immutable; corrections are reversing entries with approval and audit records.
5. **Manual vs verified.** Mobile money entries carry a `verification` field; manual entries are never displayed as network-verified.
6. **Exchange rates are data**, versioned with history, never hardcoded.
7. **Online-only posting.** A transaction is complete only after server confirmation (PWA may cache read-only data).
