<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# FinDesk architecture rules

Read `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` before changing code.

- Layers: `src/routes` (pages) → `src/components` (presentation) → `src/services` (data access) → `src/domain` (pure logic). Components never import demo data or Supabase directly; why: backend swaps must not touch UI.
- Money is `bigint` minor units via `src/domain/money.ts`; never use JS floats for amounts. Why: financial accuracy.
- Authoritative financial calculations and balance changes happen only in PostgreSQL (NUMERIC, double-entry ledger, security-definer functions). Why: client code is untrusted.
- Frontend role checks are cosmetic; authorization is enforced by RLS/server functions. Why: hidden buttons are not security.
- Modules are declared once in `src/config/modules.ts` (nav, titles, phase); add there before adding a route. Why: single source of truth.
- Demo data lives only in `src/services/demo/` and must be labelled as demo in the UI. Why: never present fake data as real.
- Mobile money entries recorded manually must never be shown as network-verified. Why: regulatory honesty.
- No new dependencies without clear need; prefer existing shadcn/ui components.
