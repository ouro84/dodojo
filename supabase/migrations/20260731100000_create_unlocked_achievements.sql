-- Issue #72 : journal append-only des succès débloqués. Toute la logique de
-- condition est en TypeScript pur (lib/achievements.ts) — cette table ne
-- contient aucune logique métier, uniquement l'état. Jamais de DELETE/UPDATE
-- (RG-04, même patron que unlocked_heroes/unlocked_skins).
create table public.unlocked_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, code)
);

create index unlocked_achievements_user_idx on public.unlocked_achievements (user_id);

alter table public.unlocked_achievements enable row level security;

create policy "unlocked_achievements_select_own"
  on public.unlocked_achievements for select
  using (user_id = auth.uid());

create policy "unlocked_achievements_insert_own"
  on public.unlocked_achievements for insert
  with check (user_id = auth.uid());

-- Volontairement aucune policy UPDATE ni DELETE (RG-04).
