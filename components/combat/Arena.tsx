"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type ClientRect,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { DayResult, Profile, Task } from "@/types";
import {
  applyXpDelta,
  calculateBossCurrentHp,
  calculateBossMaxHp,
  calculateHeroHp,
  computeToggleCascade,
  currentStreak,
  HERO_MAX_HP,
  isOptimisticId,
  koOutcome,
  overdueHpPenalties,
  deadlineHpPenalties,
  missedDeadlineTasks,
  upcomingDeadlineCount,
  HERO_DAMAGE_PER_MISSED_DEADLINE,
  collectAbandonCascade,
  applyRageQuitPenalty,
  RAGE_QUIT_XP_PENALTY,
  comboLabel,
  comboIntensity,
  nextSiblingPosition,
  planReorder,
  summarizeDay,
  XP_PER_TASK,
  type KoTier,
} from "@/lib/game-engine";
import { DEFAULT_HERO_ID, getHero } from "@/lib/heroes";
import { getHeroSpritePrefix } from "@/lib/hero-skins";
import { DEFAULT_BOSS_ID, getBoss } from "@/lib/bosses";
import { DEFAULT_BACKGROUND_ID, getBackground } from "@/lib/backgrounds";
import { buildShareCardParams } from "@/lib/share-card";
import { emptyStateTitle, emptyStateBody } from "@/lib/copy/combat";
import { rageQuitConfirmBody, rageQuitPunchline } from "@/lib/copy/rage-quit";
import { deadlineAlertLine } from "@/lib/copy/deadline";
import { randomSeed } from "@/lib/copy/variant";
import { resolveAggressivityLevel } from "@/lib/aggressivity";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  addTask as addTaskAction,
  addSubtask as addSubtaskAction,
  rageQuitTask as rageQuitTaskAction,
  undoRageQuit as undoRageQuitAction,
  reorderSiblings as reorderSiblingsAction,
  setTaskCompleted as setTaskCompletedAction,
  setTaskDeadline as setTaskDeadlineAction,
} from "@/app/actions/tasks";
import { closeDay as closeDayAction } from "@/app/actions/day";
import { markTutorialSeen } from "@/app/actions/profile";
import BottomNav from "@/components/ui/BottomNav";
import VersusScene from "./VersusScene";
import ComboBanner from "./ComboBanner";
import ArenaCoach from "./ArenaCoach";
import TaskList from "./TaskList";
import AddTaskForm from "./AddTaskForm";
import FloatingText from "./FloatingText";
import PerfectOverlay from "./PerfectOverlay";
import LevelUpOverlay from "./LevelUpOverlay";
import WakeUpRitual from "./WakeUpRitual";
import CrepusculeRecap from "./CrepusculeRecap";
import ImpactVfx, { pickImpactVariant, type ImpactVariantId } from "./ImpactVfx";

interface ArenaProps {
  initialProfile: Profile;
  initialTasks: Task[];
  overdueTasks: Task[];
  dayResults: Array<Pick<DayResult, "day_date" | "outcome">>;
  today: string;
  bossId: string;
  backgroundId: string;
  hasSeenTutorial: boolean;
}

interface Pulse {
  key: number;
  amount: number;
  kind: "damage" | "heal";
  impactVariant?: ImpactVariantId;
}

interface XpPulse {
  key: number;
  amount: number;
  kind: "damage" | "heal";
}

interface DragOverInfo {
  overTaskId: string;
  isTopHalf: boolean;
}

// La cible de drop est le rect mesuré de la ligne survolée ; le rect
// "traduit" du dragged suit le pointeur en direct (dnd-kit translate tout
// l'élément par le delta de pointeur, pas seulement le point de saisie).
function isTopHalfDrop(activeRect: ClientRect | null, overRect: ClientRect): boolean {
  if (!activeRect) return false;
  const activeCenterY = activeRect.top + activeRect.height / 2;
  return activeCenterY < overRect.top + overRect.height / 2;
}

export default function Arena({
  initialProfile,
  initialTasks,
  overdueTasks,
  dayResults,
  today,
  bossId,
  backgroundId,
  hasSeenTutorial,
}: ArenaProps) {
  const boss = getBoss(bossId) ?? getBoss(DEFAULT_BOSS_ID)!;
  const background =
    getBackground(backgroundId) ?? getBackground(DEFAULT_BACKGROUND_ID)!;
  const bossName = boss.name;
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const level = resolveAggressivityLevel(profile.aggressivity_level);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [xpPulse, setXpPulse] = useState<XpPulse | null>(null);
  const [koState, setKoState] = useState<{
    tier: Exclude<KoTier, null>;
    milestone: number | null;
    damageDealt: number;
    monstersDefeated: number;
    firstVictory: boolean;
  } | null>(null);
  // US-29 : coach du 1er combat.
  const [tutorialActive, setTutorialActive] = useState(!hasSeenTutorial);
  const tutorialSeenRef = useRef(false);
  const [levelUpValue, setLevelUpValue] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  // US-15 : id en attente de confirmation de Rage Quit + toast d'annulation.
  const [rageQuitConfirmId, setRageQuitConfirmId] = useState<string | null>(null);
  // Seed figé à l'ouverture de la confirmation (voir PerfectOverlay pour la raison).
  const [rageQuitConfirmSeed, setRageQuitConfirmSeed] = useState(0);
  const rageQuitDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(rageQuitDialogRef, {
    active: rageQuitConfirmId !== null,
    onEscape: () => setRageQuitConfirmId(null),
  });
  const [undoState, setUndoState] = useState<{
    id: string;
    tasksSnapshot: Task[];
    profileSnapshot: Profile;
    punchline: string;
  } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // Combo (juice arcade, purement visuel). Monte à la chaîne des tâches terminées,
  // retombe si on décoche ou abandonne.
  const [comboCount, setComboCount] = useState(0);
  const [comboFlash, setComboFlash] = useState<{
    key: number;
    label: string;
    intensity: number;
  } | null>(null);
  const comboTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWakeUp, setShowWakeUp] = useState(overdueTasks.length > 0);
  const [recap, setRecap] = useState<ReturnType<typeof summarizeDay> | null>(null);
  const [closing, setClosing] = useState(false);
  const [addingSubtaskParentId, setAddingSubtaskParentId] = useState<string | null>(null);
  // Fix #95/#96 : ids de tâches en cours de mutation (toggle, abandon,
  // deadline) — empêche le double-tap qui envoie un id optimistic à la BDD
  // (cascade enchaînée sur la même tâche avant résolution du précédent appel
  // serveur) ou qui rollback un résultat en écrasant l'état d'un appel
  // simultané ("la case se decoche toute seule"). Toujours allouer un nouveau
  // Set sur la mutation pour déclencher le re-render (les mutations in-place
  // ne le déclenchent pas).
  const [pendingMutationIds, setPendingMutationIds] = useState<Set<string>>(
    () => new Set(),
  );
  function markPending(id: string) {
    setPendingMutationIds((prev) => new Set(prev).add(id));
  }
  function unmarkPending(id: string) {
    setPendingMutationIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<DragOverInfo | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xpPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Compteurs monotones (clés React) : des refs plutôt que des `let` de
  // module — une mutation en dehors d'un état/effet est un side effect de
  // rendu (règle react-hooks/globals), et un `let` de module serait de toute
  // façon partagé entre plusieurs instances d'Arena si le composant remonte.
  const pulseCounterRef = useRef(0);
  const xpPulseCounterRef = useRef(0);
  const comboCounterRef = useRef(0);
  const optimisticIdCounterRef = useRef(0);

  // US-05 : horloge de polling (~45s) pendant que l'Arène est montée, pour
  // détecter le franchissement d'une deadline. Recalculée en `now` plutôt
  // qu'à chaque frame : cf. design (pas de replay au chargement).
  const [now, setNow] = useState(() => new Date());
  const knownMissedDeadlineIdsRef = useRef<Set<string>>(
    new Set(missedDeadlineTasks(initialTasks, new Date()).map((t) => t.id)),
  );
  const [heroPulse, setHeroPulse] = useState<{ key: number } | null>(null);
  const [deadlineAlert, setDeadlineAlert] = useState<{
    taskId: string;
    taskTitle: string;
    message: string;
  } | null>(null);
  // Seed figé au moment où l'Arène devient vide (voir PerfectOverlay pour la
  // raison) — un nouveau passage à vide tire une nouvelle punchline.
  const [emptyStateSeed, setEmptyStateSeed] = useState(randomSeed);
  const [wasEmpty, setWasEmpty] = useState(false);
  const heroPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroPulseCounterRef = useRef(0);
  const tasksRef = useRef(tasks);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const maxHp = calculateBossMaxHp(tasks);
  const currentHp = calculateBossCurrentHp(tasks);
  const activeTasks = tasks.filter((task) => !task.is_abandoned);
  const missedDeadlines = missedDeadlineTasks(activeTasks, now);
  const heroHp = calculateHeroHp([
    ...overdueHpPenalties(overdueTasks),
    ...deadlineHpPenalties(missedDeadlines),
  ]);
  // US-18 : héros affiché = celui équipé (fallback défaut si id inconnu).
  const equippedHero =
    getHero(profile.equipped_hero_id) ?? getHero(DEFAULT_HERO_ID)!;
  // US-53 : tenue équipée (null = tenue par défaut du héros).
  const equippedHeroFramePrefix = getHeroSpritePrefix(
    equippedHero.id,
    profile.equipped_skin_id,
  );
  const isEmpty = activeTasks.length === 0;

  // Nouveau tirage de punchline empty state à chaque passage à vide (pas à
  // chaque re-rendu pendant que l'Arène reste vide — cf. poll ~45s). Ajustement
  // pendant le rendu (pattern React recommandé) plutôt qu'un effet : évite le
  // re-rendu en cascade signalé par react-hooks/set-state-in-effect.
  if (isEmpty !== wasEmpty) {
    setWasEmpty(isEmpty);
    if (isEmpty) setEmptyStateSeed(randomSeed());
  }

  // US-29 : étape du coach. "add" tant qu'aucune tâche active ; "strike" tant
  // qu'aucune n'est complétée ; se termine à la 1re complétion (ou « Passer »).
  const hasCompletedTask = tasks.some((t) => !t.is_abandoned && t.is_completed);
  const coachStep: "add" | "strike" | null = !tutorialActive
    ? null
    : activeTasks.length === 0
      ? "add"
      : hasCompletedTask
        ? null
        : "strike";

  function finishTutorial() {
    if (!tutorialSeenRef.current) {
      tutorialSeenRef.current = true;
      void markTutorialSeen();
    }
    setTutorialActive(false);
  }

  useEffect(() => {
    if (tutorialActive && hasCompletedTask && !tutorialSeenRef.current) {
      tutorialSeenRef.current = true;
      void markTutorialSeen();
      setTutorialActive(false);
    }
  }, [tutorialActive, hasCompletedTask]);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (xpPulseTimeoutRef.current) clearTimeout(xpPulseTimeoutRef.current);
      if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
      if (heroPulseTimeoutRef.current) clearTimeout(heroPulseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // US-05 : polling léger (~45s) pendant que l'Arène est montée. Ne se
  // déclenche jamais rétroactivement pour une deadline déjà ratée avant le
  // montage (cf. knownMissedDeadlineIdsRef, initialisé au chargement).
  useEffect(() => {
    const timer = setInterval(() => {
      const tick = new Date();
      const missedNow = missedDeadlineTasks(
        tasksRef.current.filter((task) => !task.is_abandoned),
        tick,
      );
      const known = knownMissedDeadlineIdsRef.current;
      const freshlyMissed = missedNow.filter((task) => !known.has(task.id));

      if (freshlyMissed.length > 0) {
        for (const task of freshlyMissed) known.add(task.id);

        heroPulseCounterRef.current += 1;
        const key = heroPulseCounterRef.current;
        setHeroPulse({ key });
        setDeadlineAlert({
          taskId: freshlyMissed[0].id,
          taskTitle: freshlyMissed[0].title,
          message: deadlineAlertLine(level, {
            taskTitle: freshlyMissed[0].title,
            damage: HERO_DAMAGE_PER_MISSED_DEADLINE,
          }),
        });

        if (heroPulseTimeoutRef.current) clearTimeout(heroPulseTimeoutRef.current);
        heroPulseTimeoutRef.current = setTimeout(() => {
          setHeroPulse((current) => (current?.key === key ? null : current));
        }, 1400);
      }

      setNow(tick);
    }, 45_000);

    return () => clearInterval(timer);
  }, []);

  // Combo : incrémente de `hits` (tâches terminées d'un coup) et flashe la
  // bannière si un palier est atteint. `reset` remet la série à zéro.
  function bumpCombo(hits: number) {
    setComboCount((current) => {
      const next = current + hits;
      const label = comboLabel(next);
      if (label) {
        comboCounterRef.current += 1;
        const key = comboCounterRef.current;
        setComboFlash({ key, label, intensity: comboIntensity(next) });
        if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
        comboTimeoutRef.current = setTimeout(() => {
          setComboFlash((c) => (c?.key === key ? null : c));
        }, 1200);
      }
      return next;
    });
  }

  function resetCombo() {
    setComboCount(0);
    setComboFlash(null);
    if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
  }

  function triggerPulse(amount: number, kind: Pulse["kind"]) {
    pulseCounterRef.current += 1;
    const key = pulseCounterRef.current;
    setPulse({
      key,
      amount,
      kind,
      impactVariant: kind === "damage" ? pickImpactVariant() : undefined,
    });

    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    pulseTimeoutRef.current = setTimeout(() => {
      setPulse((current) => (current?.key === key ? null : current));
    }, 1400);
  }

  function triggerXpPulse(amount: number, kind: XpPulse["kind"]) {
    xpPulseCounterRef.current += 1;
    const key = xpPulseCounterRef.current;
    setXpPulse({ key, amount, kind });

    if (xpPulseTimeoutRef.current) clearTimeout(xpPulseTimeoutRef.current);
    xpPulseTimeoutRef.current = setTimeout(() => {
      setXpPulse((current) => (current?.key === key ? null : current));
    }, 1400);
  }

  function handleAdd(title: string) {
    optimisticIdCounterRef.current += 1;
    const roots = tasks.filter((task) => task.parent_id === null);
    const optimisticTask: Task = {
      id: `optimistic-${optimisticIdCounterRef.current}`,
      user_id: profile.id,
      parent_id: null,
      title,
      is_completed: false,
      is_abandoned: false,
      abandon_reason: null,
      is_recurring: false,
      recurring_template_id: null,
      deadline_at: null,
      day_date: today,
      position: nextSiblingPosition(roots),
      created_at: new Date().toISOString(),
    };

    setTasks((prev) => [...prev, optimisticTask]);
    triggerPulse(20, "heal");
    setIsAdding(true);

    void addTaskAction(title).then((result) => {
      setIsAdding(false);
      if (result.error) {
        setTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
        setBanner(result.error);
        return;
      }
      // Remplace l'id optimiste par l'id réel : toute action ultérieure sur
      // cette tâche (sous-tâche, drag & drop) a besoin du vrai UUID côté serveur.
      if (result.id) {
        const realId = result.id;
        setTasks((prev) =>
          prev.map((task) =>
            task.id === optimisticTask.id ? { ...task, id: realId } : task,
          ),
        );
      }
    });
  }

  function handleAddSubtask(parentId: string, title: string) {
    optimisticIdCounterRef.current += 1;
    const siblings = tasks.filter((task) => task.parent_id === parentId);
    const optimisticTask: Task = {
      id: `optimistic-${optimisticIdCounterRef.current}`,
      user_id: profile.id,
      parent_id: parentId,
      title,
      is_completed: false,
      is_abandoned: false,
      abandon_reason: null,
      is_recurring: false,
      recurring_template_id: null,
      deadline_at: null,
      day_date: today,
      position: nextSiblingPosition(siblings),
      created_at: new Date().toISOString(),
    };

    setTasks((prev) => [...prev, optimisticTask]);
    triggerPulse(10, "heal");
    setAddingSubtaskParentId(parentId);

    void addSubtaskAction(parentId, title).then((result) => {
      setAddingSubtaskParentId(null);
      if (result.error) {
        setTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
        setBanner(result.error);
        return;
      }
      if (result.id) {
        const realId = result.id;
        setTasks((prev) =>
          prev.map((task) =>
            task.id === optimisticTask.id ? { ...task, id: realId } : task,
          ),
        );
      }
    });
  }

  async function handleToggle(id: string, isCompleted: boolean) {
    // Fix #95 : ne pas entamer une cascade sur une tâche optimistic (sa vraie
    // version serveur n'existe pas encore — l'appel échouerait). Une fois
    // addTask résolu, l'id est remplacé et ce verrou devient inopérant ; le
    // bloquer ici évite l'aller-retour serveur + le toast d'erreur incohérent.
    if (isOptimisticId(id)) return;

    const cascade = computeToggleCascade(id, isCompleted, tasks);
    if (cascade.length === 0) return;

    // Fix #3 (issues #95/#96) : si une de ces tâches est déjà en vol (toggle
    // rapide, double-cascades concurrentes), on abandonne la 2e requête —
    // sinon le rollback de l'une écrase l'état visuel de l'autre ("la case se
    // decoche toute seule"). Toutes les tâches de la cascade sont marquées en
    // pending (pas seulement la racine) car un toggle concurrent sur une
    // sous-tâche ferait aussi refluer sur le parent recalculé par `cascade`.
    const cascadeIds = cascade.map((c) => c.taskId);
    if (cascadeIds.some((cid) => pendingMutationIds.has(cid))) {
      // Si la tâche cliquée est déjà en vol, on estime que le tap est ignoré
      // (l'état visuel optimiste reflète déjà l'intention). Aucun toast —
      // l'utilisateur ne perçoit qu'une latence naturelle, pas une erreur.
      return;
    }
    const pendingBatch = new Set(cascadeIds);
    setPendingMutationIds((prev) => {
      const next = new Set(prev);
      for (const cid of pendingBatch) next.add(cid);
      return next;
    });

    try {

    const previousTasksSnapshot = tasks;
    const previousProfileSnapshot = profile;
    const previousHp = currentHp;

    const nextCompletionById = new Map(cascade.map((c) => [c.taskId, c.isCompleted]));
    const nextTasks = tasks.map((task) => {
      const nextCompleted = nextCompletionById.get(task.id);
      return nextCompleted === undefined ? task : { ...task, is_completed: nextCompleted };
    });

    setTasks(nextTasks);

    const nextHp = calculateBossCurrentHp(nextTasks);
    const hpDelta = previousHp - nextHp;

    if (hpDelta > 0) {
      triggerPulse(hpDelta, "damage");
      // US-16 : transition→0 = célébration. previousHp est le HP du Boss avant
      // ce coup (garde de transition), heroHp l'état du Héro (palier PERFECT).
      const nextMaxHp = calculateBossMaxHp(nextTasks);
      const tier = koOutcome(previousHp, nextHp, nextMaxHp, heroHp);
      if (tier) {
        // Ce KO scelle une victoire aujourd'hui : la série intégrant le jour
        // franchit-elle un palier (US-12) ? On force l'issue du jour à victory.
        const streakIfVictory = currentStreak(
          [
            ...dayResults.filter((r) => r.day_date !== today),
            { day_date: today, outcome: "victory" },
          ],
          today,
        ).length;
        const milestone = [7, 30, 100].includes(streakIfVictory)
          ? streakIfVictory
          : null;
        setKoState({
          tier,
          milestone,
          damageDealt: nextMaxHp,
          monstersDefeated: nextTasks.filter(
            (t) => !t.is_abandoned && t.is_completed,
          ).length,
          firstVictory: tutorialActive,
        });
      }
    } else if (hpDelta < 0) {
      triggerPulse(-hpDelta, "heal");
    }

    // Combo (juice arcade) : chaque tâche terminée à la chaîne monte la série ;
    // décocher la brise. N'affecte ni l'XP ni l'or.
    if (isCompleted) {
      const hits = cascade.filter((change) => change.isCompleted).length;
      if (hits > 0) bumpCombo(hits);
    } else {
      resetCombo();
    }

    const xpDelta = cascade.reduce((total, change) => {
      const task = tasks.find((t) => t.id === change.taskId);
      if (!task || task.is_abandoned) return total;
      return total + (change.isCompleted ? XP_PER_TASK : -XP_PER_TASK);
    }, 0);

    if (xpDelta !== 0) {
      const nextProfile = applyXpDelta(profile, xpDelta);
      const didLevelUp = nextProfile.level > profile.level;

      setProfile((current) => ({ ...current, level: nextProfile.level, xp: nextProfile.xp }));
      triggerXpPulse(Math.abs(xpDelta), xpDelta > 0 ? "heal" : "damage");
      if (didLevelUp) {
        setLevelUpValue(nextProfile.level);
      }
    }

    // Appels séquentiels (pas Promise.all) : chaque appel recalcule le
    // niveau/XP à partir du profil déjà persisté par le précédent — en
    // parallèle, chacun partirait du même profil pas encore à jour et
    // écraserait le gain d'XP des autres.
    let lastResult: Awaited<ReturnType<typeof setTaskCompletedAction>> | null = null;
    for (const change of cascade) {
      lastResult = await setTaskCompletedAction(change.taskId, change.isCompleted);
      if (lastResult.error) break;
    }

    if (lastResult?.error) {
      setTasks(previousTasksSnapshot);
      setProfile(previousProfileSnapshot);
      setLevelUpValue(null);
      if (hpDelta > 0) setKoState(null);
      resetCombo();
      setBanner(lastResult.error);
      return;
    }

    const { level, xp } = lastResult ?? {};
    if (level !== undefined && xp !== undefined) {
      setProfile((current) => ({ ...current, level, xp }));
    }
    } finally {
      // Fix #3 : libère le verrou quel que soit le chemin (succès, erreur
      // serveur, voire exception runtime non catchée). On enlève toutes les
      // ids de cette cascade d'un seul passage.
      setPendingMutationIds((prev) => {
        const next = new Set(prev);
        for (const cid of pendingBatch) next.delete(cid);
        return next;
      });
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragTaskId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDragOverInfo(null);
      return;
    }
    const isTopHalf = isTopHalfDrop(active.rect.current.translated, over.rect);
    setDragOverInfo({
      overTaskId: String(over.id),
      isTopHalf,
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragTaskId(null);
    setDragOverInfo(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const isTopHalf = isTopHalfDrop(active.rect.current.translated, over.rect);

    const plan = planReorder(
      String(active.id),
      {
        overTaskId: String(over.id),
        isTopHalf,
      },
      tasks,
    );

    if (!plan) {
      setBanner("Ce déplacement n'est pas autorisé.");
      return;
    }

    const previousSnapshot = tasks;
    const positionById = new Map(plan.orderedTaskIds.map((id, index) => [id, index]));
    const nextTasks = tasks.map((task) => {
      const newPosition = positionById.get(task.id);
      if (newPosition === undefined) return task;
      return { ...task, parent_id: plan.parentId, position: newPosition };
    });

    setTasks(nextTasks);

    void reorderSiblingsAction(plan.parentId, plan.orderedTaskIds).then((result) => {
      if (result.error) {
        setTasks(previousSnapshot);
        setBanner(result.error);
      }
    });
  }

  // US-15 : clic sur « × » d'une tâche active → demande de confirmation
  // (action punitive, D5). La confirmation déclenche le Rage Quit.
  function handleAbandon(id: string) {
    setRageQuitConfirmId(id);
    setRageQuitConfirmSeed(randomSeed());
  }

  function confirmRageQuit() {
    const id = rageQuitConfirmId;
    setRageQuitConfirmId(null);
    if (!id) return;

    // Fix #95 : ne pas tenter un rage quit sur une tâche optimistic — la
    // cascade serait vide et/ou la server action refusée (uuid invalide).
    if (isOptimisticId(id)) {
      setBanner("Cette tâche n'est pas encore prête, réessaie dans un instant.");
      return;
    }

    const tasksSnapshot = tasks;
    const profileSnapshot = profile;

    // Cascade optimiste (racine + sous-tâches actives) : le Boss rétrécit.
    const cascadeIds = new Set(collectAbandonCascade(id, tasks));
    const nextTasks = tasks.map((task) =>
      cascadeIds.has(task.id)
        ? { ...task, is_abandoned: true, abandon_reason: "rage_quit" as const }
        : task,
    );
    const nextProfile = applyRageQuitPenalty(profile);

    setTasks(nextTasks);
    setProfile((current) => ({ ...current, level: nextProfile.level, xp: nextProfile.xp }));
    triggerXpPulse(RAGE_QUIT_XP_PENALTY, "damage");
    resetCombo(); // abandonner brise la série
    setUndoState({
      id,
      tasksSnapshot,
      profileSnapshot,
      punchline: rageQuitPunchline(level),
    });

    // Fix #4 : verrouille la tâche (et sa cascade) le temps de la mutation
    // serveur — empêche un toggle/drag concurrent de toucher les mêmes ids.
    for (const cid of cascadeIds) markPending(cid);
    void rageQuitTaskAction(id).then((result) => {
      for (const cid of cascadeIds) unmarkPending(cid);
      if (result.error) {
        setTasks(tasksSnapshot);
        setProfile(profileSnapshot);
        setUndoState(null);
        setBanner(result.error);
        return;
      }
      if (result.level !== undefined && result.xp !== undefined) {
        setProfile((current) => ({ ...current, level: result.level!, xp: result.xp! }));
      }
    });
  }

  function handleUndoRageQuit() {
    const undo = undoState;
    setUndoState(null);
    if (!undo) return;

    setTasks(undo.tasksSnapshot);
    setProfile(undo.profileSnapshot);

    void undoRageQuitAction(undo.id).then((result) => {
      if (result.error) {
        setBanner(result.error);
        return;
      }
      if (result.level !== undefined && result.xp !== undefined) {
        setProfile((current) => ({ ...current, level: result.level!, xp: result.xp! }));
      }
    });
  }

  // US-05 : sauvegarde optimiste d'une deadline (popover ⏰ ou "Repousser +1h").
  // `deadlineAt` = null pour effacer.
  function handleSetDeadline(id: string, deadlineAt: string | null) {
    // Fix #95 : pas de deadline sur une tâche optimistic (la mutation serveur
    // ne matche aucune ligne). On n'affiche pas de toast d'erreur — l'état
    // optimistic est suffisamment bref, et la deadline sera de toute façon
    // posable dès que addTask résolu amène le vrai id.
    if (isOptimisticId(id)) return;
    // US-05 fix : une deadline modifiée (popover ou "Repousser +1h") doit pouvoir
    // re-déclencher l'Attaque Surprise si elle est ratée à nouveau — sans ce reset,
    // le Set ne garde en mémoire que le tout premier dépassement.
    knownMissedDeadlineIdsRef.current.delete(id);
    const previousSnapshot = tasks;
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, deadline_at: deadlineAt } : task)),
    );
    // Fix #4 : verrou le temps de la mutation (le popover DeadlineControl se
    // désactive sur cette ligne tant qu'on n'a pas la confirmation serveur).
    markPending(id);
    void setTaskDeadlineAction(id, deadlineAt).then((result) => {
      unmarkPending(id);
      if (result.error) {
        setTasks(previousSnapshot);
        setBanner(result.error);
      }
    });
  }

  // US-05 : action rapide du toast "Attaque Surprise" — repousse la deadline
  // d'1h à partir de MAINTENANT (pas de l'ancienne deadline ratée).
  function handlePushDeadlineOneHour(id: string) {
    const nextDeadline = new Date(Date.now() + 3_600_000).toISOString();
    handleSetDeadline(id, nextDeadline);
    setDeadlineAlert(null);
  }

  // US-07 : clôture cérémonielle. Persiste le day_result puis affiche le récap
  // figé (calculé depuis l'état courant des tâches).
  async function handleCrepuscule() {
    setClosing(true);
    const result = await closeDayAction();
    setClosing(false);
    if (result.error) {
      setBanner(result.error);
      return;
    }
    setRecap(summarizeDay(tasks, "manual"));
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
      {/* Audit UX 2026-07-24 (P1) : seul écran de l'app sans heading de page -
          sr-only pour ne pas perturber le HUD, juste un point d'entrée pour
          lecteur d'écran (WCAG 2.4.6 / 1.3.1). */}
      <h1 className="sr-only">{"L'Arène — Dodojo"}</h1>
      <Link
        href="/guide"
        aria-label="Le Guide"
        className="absolute right-3 top-3 z-40 text-xs text-faint hover:text-ink"
      >
        ?
      </Link>
      {showWakeUp && (
        <WakeUpRitual
          overdueTasks={overdueTasks}
          timezone={profile.timezone}
          aggressivityLevel={level}
          onResolved={(deferredTasks) => {
            setShowWakeUp(false);
            // Bug #70 : "Reporter" ramenait la tâche en base (day_date du
            // jour) mais l'Arène gardait son state initial (fetché avant
            // l'ouverture du Réveil) — la tâche restait invisible, comme si
            // elle avait été annihilée. On la fusionne explicitement ici.
            if (deferredTasks.length > 0) {
              setTasks((previous) => [...previous, ...deferredTasks]);
            }
          }}
        />
      )}
      {recap && (
        <CrepusculeRecap
          outcome={recap.outcome}
          bossName={bossName}
          aggressivityLevel={level}
          username={profile.username}
          damageDealt={recap.damageDealt}
          tasksCompleted={recap.tasksCompleted}
          tasksAbandoned={recap.tasksAbandoned}
          xpEarned={recap.xpEarned}
          remainingMonsters={activeTasks.filter((task) => !task.is_completed).length}
          streak={currentStreak(dayResults, today).length}
          shareCardParams={buildShareCardParams(recap, {
            username: profile.username,
            heroId: profile.equipped_hero_id,
            bossId: boss.id,
            level: profile.level,
            title: profile.current_title,
            streak: currentStreak(dayResults, today).length,
            dayDate: today,
          })}
          onDismiss={() => setRecap(null)}
        />
      )}
      <div
        key={pulse ? `fx-${pulse.key}` : "fx-idle"}
        className={`relative flex flex-col gap-3 ${
          pulse?.kind === "damage" ? "is-hit" : ""
        }`}
      >
        {pulse?.kind === "damage" && (
          <div className="hit-flash-overlay pointer-events-none absolute inset-0 z-30 rounded-lg" />
        )}
        <div className="relative">
          <VersusScene
            heroName={equippedHero.name}
            heroLabel={profile.username}
            heroFramePrefix={equippedHeroFramePrefix}
            heroFrameCount={equippedHero.idleFrameCount}
            heroHp={heroHp}
            heroMaxHp={HERO_MAX_HP}
            heroAlarm={heroPulse !== null}
            bossName={bossName}
            bossFramePrefix={boss.idleFramePrefix}
            bossFrameCount={boss.idleFrameCount}
            bossFlip={boss.flip}
            backgroundPath={background.publicPath}
            currentHp={currentHp}
            maxHp={maxHp}
            upcomingDeadlineCount={upcomingDeadlineCount(activeTasks, now)}
            dimmed={isEmpty}
          />
          {pulse?.kind === "damage" && pulse.impactVariant && (
            <ImpactVfx key={pulse.key} variant={pulse.impactVariant} />
          )}
          {comboFlash && (
            <ComboBanner
              key={comboFlash.key}
              label={comboFlash.label}
              intensity={comboFlash.intensity}
            />
          )}
          {comboCount >= 2 && (
            <span
              aria-label={`Combo en cours : ${comboCount} coups`}
              className="pointer-events-none absolute right-2 top-2 z-30 font-display text-xs uppercase tracking-wider text-gold/90"
            >
              combo ×{comboCount}
            </span>
          )}
          {pulse && <FloatingText amount={pulse.amount} kind={pulse.kind} />}
          {heroPulse && (
            <FloatingText
              amount={HERO_DAMAGE_PER_MISSED_DEADLINE}
              kind="damage"
              anchor="hero"
            />
          )}
          {xpPulse && (
            <FloatingText amount={xpPulse.amount} kind={xpPulse.kind} unit="XP" />
          )}
          {koState && (
            <PerfectOverlay
              tier={koState.tier}
              bossName={bossName}
              aggressivityLevel={level}
              username={profile.username}
              damageDealt={koState.damageDealt}
              monstersDefeated={koState.monstersDefeated}
              milestone={koState.milestone}
              firstVictory={koState.firstVictory}
              shareCardParams={buildShareCardParams(summarizeDay(tasks, "manual"), {
                username: profile.username,
                heroId: profile.equipped_hero_id,
                bossId: boss.id,
                level: profile.level,
                title: profile.current_title,
                streak: currentStreak(
                  [
                    ...dayResults.filter((r) => r.day_date !== today),
                    { day_date: today, outcome: "victory" },
                  ],
                  today,
                ).length,
                dayDate: today,
              })}
              onCrepuscule={() => {
                setKoState(null);
                void handleCrepuscule();
              }}
              onContinue={() => setKoState(null)}
            />
          )}
          {levelUpValue !== null && (
            <LevelUpOverlay
              newLevel={levelUpValue}
              aggressivityLevel={level}
              onDismiss={() => setLevelUpValue(null)}
            />
          )}
        </div>
      </div>

      {banner && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-md border border-alert bg-surface px-3 py-2 text-xs text-alert"
        >
          <span>{banner}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="shrink-0 underline"
          >
            Fermer
          </button>
        </div>
      )}

      {rageQuitConfirmId && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[oklch(0.08_0_0_/_72%)] px-6"
          onClick={() => setRageQuitConfirmId(null)}
        >
          <div
            ref={rageQuitDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirmer l'abandon"
            className="flex w-full max-w-xs flex-col gap-3 rounded-lg border border-alert bg-surface p-4 text-center"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="font-display text-sm uppercase tracking-wide text-alert">
              Rage Quit ?
            </p>
            <p className="text-xs text-muted">
              {rageQuitConfirmBody(
                level,
                {
                  taskTitle: tasks.find((task) => task.id === rageQuitConfirmId)?.title ?? "",
                  penalty: RAGE_QUIT_XP_PENALTY,
                },
                rageQuitConfirmSeed,
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRageQuitConfirmId(null)}
                className="flex-1 rounded-md border border-border px-3 py-2 text-xs text-ink"
              >
                Garder le combat
              </button>
              <button
                type="button"
                onClick={confirmRageQuit}
                className="flex-1 rounded-md border border-alert px-3 py-2 font-display text-xs uppercase tracking-wide text-alert"
              >
                Abandonner
              </button>
            </div>
          </div>
        </div>
      )}

      {undoState && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted"
        >
          <span>{undoState.punchline}</span>
          <button
            type="button"
            onClick={handleUndoRageQuit}
            className="shrink-0 font-display uppercase tracking-wide text-xp-text underline underline-offset-2"
          >
            Annuler
          </button>
        </div>
      )}

      {deadlineAlert && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-md border border-alert bg-surface px-3 py-2 text-xs text-alert"
        >
          <span>{deadlineAlert.message}</span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => handlePushDeadlineOneHour(deadlineAlert.taskId)}
              className="font-display uppercase tracking-wide text-xp-text underline underline-offset-2"
            >
              Repousser +1h
            </button>
            <button
              type="button"
              onClick={() => setDeadlineAlert(null)}
              className="underline"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="font-display text-lg uppercase tracking-wide text-ink">
            {emptyStateTitle(level)}
          </p>
          <p className="max-w-[24ch] text-sm text-muted">{emptyStateBody(level, emptyStateSeed)}</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          autoScroll={false}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <TaskList
            tasks={activeTasks}
            timezone={profile.timezone}
            onToggle={handleToggle}
            onAbandon={handleAbandon}
            onAddSubtask={handleAddSubtask}
            onSetDeadline={handleSetDeadline}
            addingSubtaskParentId={addingSubtaskParentId}
            pendingMutationIds={pendingMutationIds}
            dragOverInfo={dragOverInfo}
          />
          <DragOverlay>
            {activeDragTaskId && (
              <div className="min-w-0 max-w-xs break-words rounded-md border border-hp bg-surface px-3 py-2 text-sm text-ink">
                {tasks.find((task) => task.id === activeDragTaskId)?.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <AddTaskForm onAdd={handleAdd} pending={isAdding} />

      {!isEmpty && (
        <button
          type="button"
          onClick={handleCrepuscule}
          disabled={closing}
          className="rounded-md border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {closing ? "…" : "Terminer la journée"}
        </button>
      )}

      {coachStep && (
        <ArenaCoach
          step={coachStep}
          onSuggest={() => handleAdd("Prendre en main Dodojo")}
          onSkip={finishTutorial}
        />
      )}

      <BottomNav active="arene" />
    </main>
  );
}
