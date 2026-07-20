-- US-18 : l'or gagné du jour, écrit à la clôture (Crépuscule) / au backfill.
-- Recalculé depuis les tâches + le streak, jamais accumulé (idempotence).
alter table public.day_results
  add column gold_earned integer not null default 0;
