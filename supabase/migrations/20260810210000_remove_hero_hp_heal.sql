-- Suppression du système de heal du Héros : une pénalité HP (deadline ratée,
-- reste reporté) reste acquise pour le reste du jour local même après
-- résolution (coche, rage quit, Le Réveil). Deux colonnes complémentaires :
--
-- - tasks.hp_penalty : verrouille le poids (-10 ou -20) sur une tâche du jour
--   courant au moment de sa résolution tardive (setTaskCompleted,
--   rageQuitTask). Nullable, jamais réinitialisé à null une fois posé.
--
-- - profiles.hp_damage_locked (+ hp_damage_locked_day) : porte les restes
--   résolus via Le Réveil (completeOverdueTask / annihilateOverdueTask /
--   annihilateOverdueOlderThan). Ces tâches changent de day_date ou sortent
--   de toute requête "aujourd'hui" une fois résolues — leur dégât ne peut
--   donc pas être porté par une ligne de tâche visible, il est agrégé sur le
--   profil pour le jour local courant (même patron de cache de saut que
--   last_recurring_gen_day, cf. migration 20260802120000).
alter table tasks
  add column hp_penalty integer;

alter table profiles
  add column hp_damage_locked integer not null default 0,
  add column hp_damage_locked_day date;
