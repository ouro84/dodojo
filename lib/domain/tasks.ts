import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyXpDelta,
  hpPenaltyToLock,
  nextComboState,
  xpForCompletion,
  XP_PER_TASK,
} from "@/lib/game-engine";
import { assembleAchievementContext, applyNewAchievements } from "@/app/actions/achievements";
import { cancelDeadlineReminder } from "@/lib/inngest/deadline-reminder";
import type { DomainErrorCode } from "./errors";

// Audit #67, PR5 : `id` alimente un filtre PostgREST construit par
// interpolation de chaine. Valider le format avant construction. La garde vit
// ici (et non plus seulement dans la server action) parce que le serveur MCP
// appelle le domaine directement, sans passer par app/actions/.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CompleteTaskOutcome {
  error: DomainErrorCode | null;
  level?: number;
  xp?: number;
  leveledUp?: boolean;
  comboCount?: number;
  newAchievements?: string[];
}

export async function completeTaskForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  isCompleted: boolean,
): Promise<CompleteTaskOutcome> {
  // Fix #95 : un id `optimistic-*` arrive ici si l'utilisateur toggle une
  // tâche dont la création n'est pas encore confirmée par le serveur (tap
  // rapide avant résolution de `addTask`). Sans cette garde, l'id forgé
  // remonte jusqu'à PostgREST `.eq("id", "optimistic-N")` → 0 ligne ou erreur
  // uuid incompréhensible côté client ("Le coup n'est pas passé"). Message
  // métier dédié plutôt que l'erreur générique UUID.
  if (!UUID_RE.test(taskId)) {
    return { error: "invalid_task_id" };
  }

  const { data: existingTask, error: fetchError } = await supabase
    .from("tasks")
    .select("is_completed, is_abandoned, xp_awarded, deadline_at, deferred_at")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError || !existingTask) {
    return { error: "task_not_found" };
  }

  // Suppression du heal Héros : si la tâche portait déjà une pénalité active
  // (deadline dépassée, reste reporté) au moment où elle est cochée, son
  // poids est verrouillé sur `hp_penalty` — sinon elle sortirait des pools
  // live (missedDeadlineTasks/deferredRestHpPenalties) et les HP remonteraient.
  // Lu avant l'update ci-dessous, qui efface `deferred_at`.
  const hpPenaltyLock = isCompleted
    ? hpPenaltyToLock(existingTask, new Date())
    : null;

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      is_completed: isCompleted,
      deferred_at: null,
      ...(hpPenaltyLock !== null ? { hp_penalty: hpPenaltyLock } : {}),
    })
    .eq("id", taskId)
    .eq("user_id", userId);

  if (updateError) {
    return { error: "update_failed" };
  }

  // Issue #114 : une tâche complétée n'a plus besoin de son rappel de
  // deadline — un décochage ne reschedule rien (l'utilisateur peut re-cocher
  // avant la deadline, cf. setTaskDeadline pour la logique de (re)programmation).
  if (isCompleted) {
    await cancelDeadlineReminder(taskId);
  }

  const isRealTransition = existingTask.is_completed !== isCompleted;
  let level: number | undefined;
  let xp: number | undefined;
  let leveledUp = false;
  let comboCount: number | undefined;
  let newAchievements: string[] = [];

  // Le profil n'est jamais absent en usage normal (onboarding le garantit) ;
  // si le fetch échoue quand même, on ne bloque pas la validation de la
  // tâche pour autant — seul le gain d'XP est perdu pour ce coup.
  if (isRealTransition && !existingTask.is_abandoned) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("level, xp, combo_count, last_combo_completed_at")
      .eq("id", userId)
      .maybeSingle();

    if (!profileError && profile) {
      if (isCompleted) {
        // Issue #115 : combo server-authoritative — série de coups à moins de
        // 15 min d'intervalle, module l'XP réellement accordée à ce coup.
        const nextCombo = nextComboState(
          {
            comboCount: profile.combo_count,
            lastCompletedAt: profile.last_combo_completed_at,
          },
          new Date(),
        );
        const xpDelta = xpForCompletion(nextCombo.comboCount);
        const nextXp = applyXpDelta(profile, xpDelta);
        leveledUp = nextXp.level > profile.level;
        level = nextXp.level;
        xp = nextXp.xp;
        comboCount = nextCombo.comboCount;

        await supabase
          .from("profiles")
          .update({
            level: nextXp.level,
            xp: nextXp.xp,
            combo_count: nextCombo.comboCount,
            last_combo_completed_at: nextCombo.lastCompletedAt,
          })
          .eq("id", userId);

        await supabase
          .from("tasks")
          .update({ xp_awarded: xpDelta })
          .eq("id", taskId)
          .eq("user_id", userId);

        const ctx = await assembleAchievementContext(supabase, userId);
        newAchievements = await applyNewAchievements(supabase, userId, ctx);
      } else {
        // Décocher : rembourse exactement ce qui avait été accordé (fallback
        // flat XP_PER_TASK pour une tâche complétée avant cette migration,
        // donc sans xp_awarded stocké) et casse la série, comme un abandon.
        const refund = existingTask.xp_awarded ?? XP_PER_TASK;
        const nextXp = applyXpDelta(profile, -refund);
        leveledUp = nextXp.level > profile.level;
        level = nextXp.level;
        xp = nextXp.xp;
        comboCount = 0;

        await supabase
          .from("profiles")
          .update({
            level: nextXp.level,
            xp: nextXp.xp,
            combo_count: 0,
            last_combo_completed_at: null,
          })
          .eq("id", userId);

        await supabase
          .from("tasks")
          .update({ xp_awarded: null })
          .eq("id", taskId)
          .eq("user_id", userId);
      }
    }
  }

  return { error: null, level, xp, leveledUp, comboCount, newAchievements };
}
