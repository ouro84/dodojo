-- US-18 : possession de héros. Achat = insert ; jamais de DELETE (RG-04).
create table public.unlocked_heroes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  hero_id text not null,
  price_paid integer not null default 0,
  unlocked_at timestamptz not null default now(),
  unique (user_id, hero_id)
);

create index unlocked_heroes_user_idx on public.unlocked_heroes (user_id);

alter table public.unlocked_heroes enable row level security;

create policy "unlocked_heroes_select_own"
  on public.unlocked_heroes for select
  using (user_id = auth.uid());

create policy "unlocked_heroes_insert_own"
  on public.unlocked_heroes for insert
  with check (user_id = auth.uid());

-- Volontairement aucune policy UPDATE ni DELETE (RG-04).
