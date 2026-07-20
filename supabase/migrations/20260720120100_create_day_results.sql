create table public.day_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_date date not null,
  outcome text not null check (outcome in ('victory', 'retreat', 'defeat')),
  damage_dealt integer not null default 0,
  boss_max_hp integer not null default 0,
  tasks_completed integer not null default 0,
  tasks_abandoned integer not null default 0,
  xp_earned integer not null default 0,
  closed_manually boolean not null default false,
  closed_at timestamptz not null default now(),
  unique (user_id, day_date)
);

create index day_results_user_day_idx on public.day_results (user_id, day_date);

alter table public.day_results enable row level security;

create policy "day_results_select_own"
  on public.day_results for select
  using (user_id = auth.uid());

create policy "day_results_insert_own"
  on public.day_results for insert
  with check (user_id = auth.uid());

create policy "day_results_update_own"
  on public.day_results for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Volontairement aucune policy DELETE (RG-04).
