# FinDesk — Phased roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: design system, app shell, login UI, dashboard (demo), module pages, domain + service layers, docs | Done |
| 2 | Supabase: schema, auth, branches, employees, roles & permissions, RLS | Next |
| 3 | Accounting engine: chart of accounts, double-entry ledger, posting functions, idempotency, audit trail; dashboard on live data | |
| 4 | Forex Bureau + customers | |
| 5 | Mobile Money (manual recording) | |
| 6 | Cash & float management, reconciliation | |
| 7 | Receipts (58mm / 80mm / A4 / PDF) | |
| 8 | Reports, expenses, administration | |
| 9 | PWA and desktop preparation | |
| 10 | Testing, security review, deployment | |

## Still demo / pending after Phase 1
- Dashboard figures: `src/services/demo/dashboard.demo.ts` (labelled "Demo data" in UI)
- Login form: UI only, no authentication
- All other modules: placeholders listing planned capabilities; no operations possible
- No database, migrations, RLS or server functions yet
