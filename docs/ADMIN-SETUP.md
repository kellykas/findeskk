# Initial administrator setup

The app cannot promote accounts by itself: role changes go through `save_staff_access()`, which
refuses self-edits, and `claim_initial_admin()` only works while the company has **no** roles at all.
Making the first (or any) administrator is therefore a two-step operation in the Supabase dashboard.

Never send account passwords through chat, tickets or commits — set them in the dashboard and change
any password that has been shared elsewhere.

## 1. Create the sign-in account

Supabase dashboard → **Authentication → Users → Add user**:

- Email: the staff member's email address.
- Password: chosen by the administrator (the user should change it after first sign-in).
- Enable **Auto Confirm User** so the account can sign in immediately.

The `create_staff_profile()` trigger creates the matching row in `public.profiles`.

## 2. Grant the role

Supabase dashboard → **SQL Editor** → run the block below with the email replaced. It is safe to
re-run: it creates the profile if the trigger has not fired, updates the email/display name, and
inserts the role only once.

```sql
do $$
declare
  _email        text := 'administrator@example.com'; -- << replace
  _display_name text := 'Administrator';             -- << replace (shown in the app)
  _uid          uuid;
begin
  select id into _uid from auth.users where lower(email) = lower(_email);

  if _uid is null then
    raise exception 'No auth user for % — create the account first (Authentication → Users)', _email;
  end if;

  insert into public.profiles (id, display_name, email, active)
  values (_uid, _display_name, lower(_email), true)
  on conflict (id) do update
    set email = excluded.email,
        active = true,
        display_name = case
          when public.profiles.display_name = '' then excluded.display_name
          else public.profiles.display_name
        end;

  insert into public.user_roles (user_id, role)
  values (_uid, 'super_admin')
  on conflict (user_id, role) do nothing;
end $$;
```

`super_admin` unlocks every module and is the only role (with `company_owner`) allowed to manage
staff and branches. Additional staff can now be given roles and branches from **Employees** in the
app.

## 3. Verify

```sql
select u.email, p.display_name, p.active, r.role
from auth.users u
join public.profiles p on p.id = u.id
left join public.user_roles r on r.user_id = u.id
where lower(u.email) = lower('administrator@example.com'); -- << replace
```

Then sign out and back in (or reload) — the sidebar shows every module and the header shows the role.

## Server environment variables (deployed builds)

Employee account writes run on the server, so the deployment needs its own copies of these. Secrets
belong in the host's dashboard, never in the repository.

| Variable                        | Where to find it                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Supabase → Settings → API → Project URL (`https://<ref>.supabase.co`). Baked into the browser bundle at build time.                                                                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API Keys → **Publishable key** (or the legacy `anon` key). Also baked in at build time.                                                                         |
| `SUPABASE_URL`                  | The same project URL. The **unprefixed** name is what server functions read.                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase → Settings → **API Keys → Secret keys → `service_role`** (`sb_secret_…`), or on older dashboards **Settings → API → Project API keys → `service_role`** (a long `eyJ…` JWT). |

In Vercel: project → **Settings → Environment Variables**, add each key for Production (and Preview if
used), then **Deployments → Redeploy**. A variable only reaches a _new_ deployment, so an existing
build keeps failing until it is rebuilt.

Never give the service-role key a `VITE_` prefix: that would compile it into the browser bundle. It
bypasses row-level security entirely, so treat it like a password — roll it in Supabase if it is ever
exposed, then update the host.

If a required variable is missing, the Employees screen keeps a message on screen naming the missing
variable instead of failing silently. `SUPABASE_SERVICE_ROLE_KEY` is what makes **Add employee**
possible at all.

## Enable reversals (one-time database step)

Reversals are posted by a database function, so the project needs it once. Until this is done,
pressing **Reverse** on a mobile money transaction reports that reversals need setup. Recording,
receipts, reports and everything else keep working, so this is safe to do at any time.

1. Open `supabase/migrations/20261104120000_momo_reversals.sql` in the repository (on GitHub: the
   file → **Copy raw file**).
2. Supabase dashboard → **SQL Editor** → **New query** → paste → **Run**.
3. Confirm it exists — this should return one row:

```sql
select proname from pg_proc where proname = 'reverse_momo_transaction';
```

4. Reload the app. The **Reverse** button then asks for a reason and posts the cancelling entry.

Only a super admin, company owner or general manager can reverse, and a transaction can be reversed
once. Nothing is deleted: the original entry stays in the ledger next to its reversal.

## Manage networks and currencies (one-time database step)

Mobile money networks and traded currencies are now rows the company manages from the app, so the
database needs that structure once. Until this is done, the **Mobile money networks** and
**Currencies & rates** panels report that a one-time setup is needed; recording, receipts and
reports keep working throughout, so this is safe to do at any time.

1. Open `supabase/migrations/20261104150000_reference_data.sql` in the repository (on GitHub: the
   file → **Copy raw file**).
2. Supabase dashboard → **SQL Editor** → **New query** → paste → **Run**.
3. Confirm both tables and the four write functions exist — this should return four rows:

```sql
select proname from pg_proc
where proname in ('save_momo_network','delete_momo_network','save_fx_currency','delete_fx_currency');
```

4. Run `supabase/migrations/20261105160000_momo_network_float.sql` the same way. It makes adding
   a network create the float account that holds that wallet's money; without it, a new network
   still has to be pointed at an existing account.
5. Reload the app. **Mobile Money → Mobile money networks** can then add a network (it gets its own
   float account, and the account can be changed afterwards), and **Forex Bureau → Currencies &
   rates** can add a currency and publish its rate.

What the rules are, so nobody is surprised:

- Mobile money networks are a manager decision: only a super admin, company owner or general manager
  can add, change or switch one off, in the app and in the database. Everyone else can read them.
- Currencies and exchange rates are counter work: any active staff member can add a currency, change
  its name, switch it off, or publish a new rate, so the bureau keeps working when no manager is
  around. Only the auditor cannot, because that role is read-only by design.
- MTN and Airtel, and USD, EUR, GBP and KES, are created by the migration, so nothing existing is lost.
- A network or currency that already has transactions (or published rates) cannot be deleted — switch
  it off instead. Recorded history must keep resolving.
- A network's code never changes after it is created, because every recorded transaction stores it.
  The float account can change: earlier entries stay on the account they posted to. A new network
  gets its own asset account (`1130` upwards, named "Mobile money float — <network>"), so two
  wallets never share a balance.
- Exchange rates stay append-only. "Changing" a rate means publishing a new one from today; the old
  rate stays in history, which is what an auditor expects.

If a migration is skipped, the app keeps working with MTN, Airtel and the four original currencies,
so order of deployment does not matter.

## Why not in the app?

Creating auth accounts requires the Supabase **service role** key, which must never reach the
browser. An in-app invite flow needs a server-side function holding that key; until then, account
creation stays in the dashboard with this document as the procedure.
