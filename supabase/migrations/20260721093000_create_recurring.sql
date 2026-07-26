-- US-17 : Mode Entraînement (tâches récurrentes / quêtes).
-- Un template n'est PAS une tâche du jour : il décrit une routine et ses jours.
-- Les instances sont des lignes `tasks` normales, générées au Réveil.

-- Template de routine.
create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  weekdays integer[] not null default '{}', -- jours 0..6, lundi=0, semaine locale
  is_active boolean not null default true,  -- désactivation ≠ DELETE (esprit RG-04)
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index recurring_templates_user_idx
  on public.recurring_templates (user_id);

alter table public.recurring_templates enable row level security;

create policy "recurring_templates_select_own"
  on public.recurring_templates for select
  using (user_id = auth.uid());

create policy "recurring_templates_insert_own"
  on public.recurring_templates for insert
  with check (user_id = auth.uid());

create policy "recurring_templates_update_own"
  on public.recurring_templates for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Volontairement aucune policy DELETE (RG-04) : on désactive (is_active=false).

-- US-17 (A2) : jour de repos planifié pour une routine (n'apparaît pas ce jour,
-- ne devient pas un reste forcé). Toggle (insert/delete de la ligne du jour).
create table public.recurring_rest_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.recurring_templates (id) on delete cascade,
  day_date date not null,
  primary key (user_id, template_id, day_date)
);

alter table public.recurring_rest_days enable row level security;

create policy "recurring_rest_days_select_own"
  on public.recurring_rest_days for select
  using (user_id = auth.uid());

create policy "recurring_rest_days_insert_own"
  on public.recurring_rest_days for insert
  with check (user_id = auth.uid());

-- Le toggle "jour de repos" est réversible → DELETE autorisé UNIQUEMENT ici.
-- Ce n'est pas une donnée de combat (RG-04 protège tasks/day_results), juste une
-- préférence de planification ; retirer un jour de repos doit être possible.
create policy "recurring_rest_days_delete_own"
  on public.recurring_rest_days for delete
  using (user_id = auth.uid());

-- Lien instance → template (pour l'icône 🔁 et l'anti-doublon 1/routine/jour).
alter table public.tasks
  add column if not exists recurring_template_id uuid
    references public.recurring_templates (id) on delete set null;

create index tasks_recurring_template_idx
  on public.tasks (recurring_template_id);
