-- Issue #156 : les instances de routines pouvaient se dupliquer.
--
-- Deux chemins identifiés :
--   P1 — generateRecurringInstances() mute a chaque GET de /, en lecture-puis-
--        ecriture non atomique. La route est prefetchee par le <Link href="/">
--        de BottomNav : un prefetch RSC execute le composant serveur, donc la
--        mutation. Deux executions concurrentes lisent un ensemble vide et
--        inserent chacune la leur.
--   P2 — la generation creait l'instance du jour, puis « Reporter » au Reveil
--        ramenait le reste de la veille de la meme routine sur day_date = today.
--
-- P2 est traite cote application (planRecurringGeneration + overdueTemplateIds).
-- P1 est ferme ici par une contrainte d'unicite.

-- 1. Solde des doublons existants. Aucun DELETE (RG-04) : les surnumeraires
--    passent en annihiles. On conserve la ligne cochee s'il y en a une — le
--    travail deja accompli n'est jamais efface — sinon la plus ancienne.
--    L'id departage les egalites pour rendre la migration reproductible.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, day_date, recurring_template_id
           order by is_completed desc, created_at asc, id asc
         ) as rn
  from tasks
  where recurring_template_id is not null
    and is_abandoned = false
)
update tasks
set is_abandoned = true,
    abandon_reason = 'annihilated'
where id in (select id from ranked where rn > 1);

-- 2. Contrainte d'unicite. Partielle sur is_abandoned = false : les doublons
--    soldes ci-dessus ne bloquent pas la creation de l'index, et une routine
--    annihilee n'empeche jamais une regeneration ulterieure.
create unique index if not exists tasks_recurring_unique_per_day
  on tasks (user_id, day_date, recurring_template_id)
  where recurring_template_id is not null
    and is_abandoned = false;

-- 3. Cache de saut : evite de rejouer les requetes de generation a chaque GET
--    de / (prefetch RSC compris). Ce n'est PAS un verrou — la valeur est ecrite
--    APRES un passage reussi, jamais avant. Reserver la journee en amont ferait
--    qu'un prefetch annule consommerait la reservation sans rien creer, et la
--    routine manquerait jusqu'au lendemain. La garantie vient de l'index.
alter table profiles
  add column if not exists last_recurring_gen_day date;
