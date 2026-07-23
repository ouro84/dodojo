-- US-53 : possession de tenues (recolors de héros). Achat = insert ; jamais
-- de DELETE ni UPDATE (RG-04). Miroir de unlocked_heroes (US-18).
create table public.unlocked_skins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  hero_id text not null,
  skin_id text not null,
  price_paid integer not null default 0,
  unlocked_at timestamptz not null default now(),
  unique (user_id, hero_id, skin_id)
);

create index unlocked_skins_user_idx on public.unlocked_skins (user_id);

alter table public.unlocked_skins enable row level security;

create policy "unlocked_skins_select_own"
  on public.unlocked_skins for select
  using (user_id = auth.uid());

create policy "unlocked_skins_insert_own"
  on public.unlocked_skins for insert
  with check (user_id = auth.uid());

-- Volontairement aucune policy UPDATE ni DELETE (RG-04).
