-- US-15 : distingue en base un abandon "Rage Quit" (punitif, en cours de journée,
-- malus XP) d'un "Annihiler" serein (reste nettoyé au Réveil, sans malus).
-- Sans cette colonne, les deux sont indistinguables (tous is_abandoned=true),
-- ce qui empêche le refund ciblé de l'undo et les futures stats du Tableau de Chasse.
alter table public.tasks
  add column if not exists abandon_reason text
    check (abandon_reason in ('rage_quit', 'annihilated'));

-- Nullable : une tâche active ou complétée n'a pas de raison d'abandon.
-- Pas de nouvelle policy DELETE (RG-04 inchangé) : l'undo repasse is_abandoned
-- à false via UPDATE, jamais de suppression de ligne.
