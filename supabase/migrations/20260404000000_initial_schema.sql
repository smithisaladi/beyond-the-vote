-- profiles: one row per auth user, created automatically on sign-up
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- followed_politicians: tracks which politicians a user follows
create table public.followed_politicians (
  user_id       uuid not null references auth.users on delete cascade,
  politician_id text not null,  -- bioguideId from Congress API
  created_at    timestamptz not null default now(),
  primary key (user_id, politician_id)
);

-- tracked_bills: bills a user is tracking
create table public.tracked_bills (
  user_id    uuid not null references auth.users on delete cascade,
  bill_id    text not null,  -- e.g. "118-s-1247"
  created_at timestamptz not null default now(),
  primary key (user_id, bill_id)
);

-- topic_preferences: topics a user has selected
create table public.topic_preferences (
  user_id uuid not null references auth.users on delete cascade,
  topic   text not null,
  primary key (user_id, topic)
);

-- ─── Row-level security ───────────────────────────────────────────────────────

alter table public.profiles           enable row level security;
alter table public.followed_politicians enable row level security;
alter table public.tracked_bills       enable row level security;
alter table public.topic_preferences   enable row level security;

-- profiles
create policy "users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- followed_politicians
create policy "users can view own followed politicians"
  on public.followed_politicians for select
  using (auth.uid() = user_id);

create policy "users can insert own followed politicians"
  on public.followed_politicians for insert
  with check (auth.uid() = user_id);

create policy "users can delete own followed politicians"
  on public.followed_politicians for delete
  using (auth.uid() = user_id);

-- tracked_bills
create policy "users can view own tracked bills"
  on public.tracked_bills for select
  using (auth.uid() = user_id);

create policy "users can insert own tracked bills"
  on public.tracked_bills for insert
  with check (auth.uid() = user_id);

create policy "users can delete own tracked bills"
  on public.tracked_bills for delete
  using (auth.uid() = user_id);

-- topic_preferences
create policy "users can view own topic preferences"
  on public.topic_preferences for select
  using (auth.uid() = user_id);

create policy "users can insert own topic preferences"
  on public.topic_preferences for insert
  with check (auth.uid() = user_id);

create policy "users can delete own topic preferences"
  on public.topic_preferences for delete
  using (auth.uid() = user_id);

-- ─── Auto-create profile on sign-up ──────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
