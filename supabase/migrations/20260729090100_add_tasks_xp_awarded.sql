-- Issue #115 : montant d'XP réellement accordé à la complétion de cette
-- tâche (peut inclure un bonus combo, cf. comboXpBonus dans
-- lib/game-engine.ts). Nécessaire pour que le décochage rembourse exactement
-- ce qui a été gagné plutôt qu'un flat XP_PER_TASK, qui désynchroniserait
-- l'économie XP dès qu'un bonus combo a été appliqué à la complétion.
-- Nullable : une tâche jamais complétée, ou complétée avant cette migration,
-- n'a pas de valeur (fallback flat XP_PER_TASK au décochage, cf. setTaskCompleted).
alter table if exists tasks
  add column if not exists xp_awarded integer null;
