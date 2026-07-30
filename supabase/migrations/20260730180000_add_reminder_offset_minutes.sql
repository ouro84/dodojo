-- Préparation issue #114 : fondation DB pour l'offset de rappel avant deadline.
-- Migration + types + note de design uniquement (périmètre validé) — aucune
-- API Inngest appelée ici, cf. docs/superpowers/plans/2026-07-30-push-inngest-migration.md § 10.

alter table profiles
  add column reminder_offset_minutes int not null default 30
  check (reminder_offset_minutes between 0 and 240);

comment on column profiles.reminder_offset_minutes is
  'Défaut utilisateur (minutes avant une deadline) pour le futur rappel de #114. Non nullable : le défaut vaut toujours quelque chose, jamais de null ambigu.';

alter table tasks
  add column reminder_offset_minutes int null
  check (reminder_offset_minutes is null or reminder_offset_minutes between 0 and 240);

comment on column tasks.reminder_offset_minutes is
  'Override par tâche pour #114. null = hérite de profiles.reminder_offset_minutes.';
