-- Cut over user-owned tables from Supabase's auth.users to app_users.
--
-- Pre-launch invariant: there are no real users on the new system yet, so we
-- truncate first, drop the old FKs, and re-point them at app_users. RLS stays
-- ENABLED on these tables but the auth.uid()-based policies are dropped:
-- Spring Boot is the new authz boundary (every dashboard query carries
-- `where user_id = :authedUserId`), and the empty policy set acts as a
-- failsafe — if the app role ever loses BYPASSRLS by accident, queries
-- default-deny instead of leaking everyone's rows.

-- 1. Truncate. The CASCADE handles the old auth.users-rooted FKs cleanly.
truncate table public.profiles,
               public.tracked_bills,
               public.followed_politicians,
               public.topic_preferences
    restart identity cascade;

-- 2. Re-point FKs. `if exists` makes this idempotent against partial runs.
alter table public.profiles
    drop constraint if exists profiles_id_fkey;
alter table public.profiles
    add constraint profiles_id_fkey
    foreign key (id) references public.app_users(id) on delete cascade;

alter table public.tracked_bills
    drop constraint if exists tracked_bills_user_id_fkey;
alter table public.tracked_bills
    add constraint tracked_bills_user_id_fkey
    foreign key (user_id) references public.app_users(id) on delete cascade;

alter table public.followed_politicians
    drop constraint if exists followed_politicians_user_id_fkey;
alter table public.followed_politicians
    add constraint followed_politicians_user_id_fkey
    foreign key (user_id) references public.app_users(id) on delete cascade;

alter table public.topic_preferences
    drop constraint if exists topic_preferences_user_id_fkey;
alter table public.topic_preferences
    add constraint topic_preferences_user_id_fkey
    foreign key (user_id) references public.app_users(id) on delete cascade;

-- 3. Drop auth.uid()-based RLS policies. RLS itself stays enabled.
drop policy if exists "users can view own profile"               on public.profiles;
drop policy if exists "users can update own profile"             on public.profiles;
drop policy if exists "users can view own tracked bills"         on public.tracked_bills;
drop policy if exists "users can insert own tracked bills"       on public.tracked_bills;
drop policy if exists "users can delete own tracked bills"       on public.tracked_bills;
drop policy if exists "users can view own followed politicians"  on public.followed_politicians;
drop policy if exists "users can insert own followed politicians" on public.followed_politicians;
drop policy if exists "users can delete own followed politicians" on public.followed_politicians;
drop policy if exists "users can view own topic preferences"     on public.topic_preferences;
drop policy if exists "users can insert own topic preferences"   on public.topic_preferences;
drop policy if exists "users can delete own topic preferences"   on public.topic_preferences;
