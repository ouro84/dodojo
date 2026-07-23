-- US-20 : analytics minimal de partage — mesure si la feature est réellement
-- utilisée (raison même de sa priorisation dans l'audit Sprint 3). Journal
-- d'événements en écriture seule, jamais de policy UPDATE/DELETE (RG-04).
create table public.share_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('perfect_overlay', 'crepuscule')),
  event text not null check (event in ('share_clicked', 'share_succeeded', 'share_downloaded')),
  outcome text not null check (outcome in ('victory', 'retreat', 'defeat')),
  created_at timestamptz not null default now()
);

create index share_events_user_created_idx on public.share_events (user_id, created_at);

alter table public.share_events enable row level security;

create policy "share_events_select_own"
  on public.share_events for select
  using (user_id = auth.uid());

create policy "share_events_insert_own"
  on public.share_events for insert
  with check (user_id = auth.uid());

-- Volontairement aucune policy UPDATE/DELETE : journal d'événements immuable.
