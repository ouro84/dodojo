-- Issue #115 : le combo (série de coups à moins de 15 min d'intervalle)
-- devient authoritative côté serveur pour pouvoir moduler l'XP réellement
-- persistée (auparavant purement visuel/client, jamais fiable pour un calcul
-- économique). `last_combo_completed_at` sert de fenêtre glissante (15 min) ;
-- `combo_count` est la série en cours, remise à 0 dès qu'on décoche, abandonne
-- (rage quit) ou que la fenêtre expire. Deux caches mutables (comme
-- `profiles.gold`/`streak_days`), pas un historique — RG-04 ne s'applique pas.
alter table if exists profiles
  add column if not exists combo_count integer not null default 0,
  add column if not exists last_combo_completed_at timestamptz null;
