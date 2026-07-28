-- Issue #101 (Axe A, by-pass spec A4-overdue) : nouvelle colonne
-- `tasks.deferred_at` (timestamptz nullable). Positionnée à `now()` quand un
-- reste est reporté via Le Réveil (deferOverdueTask / deferAllOverdue). Elle
-- persiste jusqu'à résolution (coche, rage quit) et porte la pénalité
-- -20 HP — par défaut, après Report, une tâche avait son `day_date` mis au
-- jour courant et sortait immédiatement du pool overdue côté serveur, donc
-- la pénalité disparaissait sans action de l'utilisateur. `deferred_at`
-- conserve la pénalité "reste reporté" active jusqu'à résolution.
--
-- Aucune policy DELETE/UPDATE n'est ajoutée (RG-04 : seule `deferred_at`
-- est mutable, jamais la ligne `tasks` supprimée).

alter table if exists tasks
  add column if not exists deferred_at timestamptz null;
