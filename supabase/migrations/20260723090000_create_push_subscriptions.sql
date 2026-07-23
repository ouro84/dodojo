-- US-11 : notifications push de rappel (17h30 heure locale).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (user_id = auth.uid());

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Policy DELETE AUTORISÉE ici (contrairement à tasks/day_results, RG-04) :
-- donnée technique d'appareil (endpoint expiré ou désinscription explicite),
-- pas un historique de combat protégé.
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

-- Idempotence d'envoi : empêche un double rappel le même jour local si le
-- cron externe repasse plusieurs fois dans la fenêtre 17h30.
alter table public.profiles
  add column if not exists last_reminder_sent_on date;
