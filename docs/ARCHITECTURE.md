# FinDesk — Architecture

Forex Bureau and Mobile Money agency management system for a single multi-branch company in Uganda.

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
    shared/          PageHeader, StatCard, SectionCard, DataTable, DemoBadge, ModulePlaceholder
  config/modules.ts  Module registry: navigation, titles, permissions, delivery phase
  domain/            Pure TypeScript: money, currency, roles. No React, no I/O.
  services/          Data access behind typed interfaces + TanStack Query options
    demo/            Clearly labelled demonstration data (to be removed)
  integrations/      (Phase 2) Supabase clients, generated types
supabase/migrations/ (Phase 2) Ordered SQL migrations
docs/                Architecture and roadmap
```

## Data flow
```text
Route loader -> service query options -> (demo | Supabase) -> domain types -> components
```
Components only receive typed domain objects. Switching a service from demo to Supabase must not change any component.

## Key decisions
1. **Money as bigint minor units** on the client (`domain/money.ts`); NUMERIC in PostgreSQL. No floats.
2. **Ledger is the source of truth.** Balances are derived from balanced double-entry postings created atomically by database functions with idempotency keys. No "balance += x" updates from the UI.
3. **Authorization in the database.** Roles in a separate `user_roles` table, checked by `has_role()` security-definer functions and RLS, scoped by branch.
4. **Reversals, not deletes.** Posted transactions are immutable; corrections are reversing entries with approval and audit records.
5. **Manual vs verified.** Mobile money entries carry a `verification` field; manual entries are never displayed as network-verified.
6. **Exchange rates are data**, versioned with history, never hardcoded.
7. **Online-only posting.** A transaction is complete only after server confirmation (PWA may cache read-only data).
