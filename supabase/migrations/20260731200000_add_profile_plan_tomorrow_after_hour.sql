-- Issue #116 : heure locale (bornée 12-23) à partir de laquelle l'Arène
-- propose de planifier une tâche pour demain / reporter une tâche du jour
-- vers demain (section "Demain"). Défaut 18 (fin de journée typique).
alter table profiles
  add column plan_tomorrow_after_hour int not null default 18
  check (plan_tomorrow_after_hour between 12 and 23);

comment on column profiles.plan_tomorrow_after_hour is
  'Heure locale (12-23) à partir de laquelle la section "Demain" de l''Arène se débloque (issue #116).';
