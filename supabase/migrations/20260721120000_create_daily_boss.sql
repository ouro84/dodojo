-- Roster de boss : le boss (et son décor) du jour, tiré une fois puis figé.
-- Une ligne par (user_id, day_date). Le tirage exclut les boss des 2 derniers
-- jours pour éviter les répétitions ; une fois posé, il ne change plus.
create table public.daily_boss (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_date date not null,
  boss_id text not null,
  background_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day_date)
);

alter table public.daily_boss enable row level security;

create policy "daily_boss_select_own"
  on public.daily_boss for select
  using (user_id = auth.uid());

create policy "daily_boss_insert_own"
  on public.daily_boss for insert
  with check (user_id = auth.uid());

-- Pas d'UPDATE ni de DELETE : le boss du jour est immuable une fois tiré.
