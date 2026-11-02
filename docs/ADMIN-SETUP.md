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

## Why not in the app?

Creating auth accounts requires the Supabase **service role** key, which must never reach the
browser. An in-app invite flow needs a server-side function holding that key; until then, account
creation stays in the dashboard with this document as the procedure.
