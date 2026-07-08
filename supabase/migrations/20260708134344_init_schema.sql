create extension if not exists pgcrypto;

-- profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  level integer not null default 1,
  xp integer not null default 0,
  gold integer not null default 0,
  current_title text not null default 'Novice',
  streak_days integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- tasks

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.tasks (id) on delete cascade,
  title text not null,
  is_completed boolean not null default false,
  is_abandoned boolean not null default false,
  is_recurring boolean not null default false,
  deadline_at timestamptz,
  day_date date not null default current_date,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index tasks_user_day_idx on public.tasks (user_id, day_date);
create index tasks_parent_idx on public.tasks (parent_id);

alter table public.tasks enable row level security;

create policy "tasks_select_own"
  on public.tasks for select
  using (user_id = auth.uid());

create policy "tasks_insert_own"
  on public.tasks for insert
  with check (user_id = auth.uid());

create policy "tasks_update_own"
  on public.tasks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Volontairement aucune policy DELETE : applique RG-04 (pas de suppression
-- destructive) au niveau base, en plus de la convention côté application.
