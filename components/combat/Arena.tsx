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
  koOutcome,
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
import { DEFAULT_BOSS_ID, getBoss } from "@/lib/bosses";
import { DEFAULT_BACKGROUND_ID, getBackground } from "@/lib/backgrounds";
import { buildShareCardParams } from "@/lib/share-card";
import {
  addTask as addTaskAction,
  addSubtask as addSubtaskAction,
  rageQuitTask as rageQuitTaskAction,
  undoRageQuit as undoRageQuitAction,
  reorderSiblings as reorderSiblingsAction,
  setTaskCompleted as setTaskCompletedAction,
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

let pulseCounter = 0;
let xpPulseCounter = 0;
let comboCounter = 0;
let optimisticIdCounter = 0;

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
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<DragOverInfo | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xpPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const maxHp = calculateBossMaxHp(tasks);
  const currentHp = calculateBossCurrentHp(tasks);
  const heroHp = calculateHeroHp(overdueTasks);
  // US-18 : héros affiché = celui équipé (fallback défaut si id inconnu).
  const equippedHero =
    getHero(profile.equipped_hero_id) ?? getHero(DEFAULT_HERO_ID)!;
  const activeTasks = tasks.filter((task) => !task.is_abandoned);
  const isEmpty = activeTasks.length === 0;

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
    };
  }, []);

  // Combo : incrémente de `hits` (tâches terminées d'un coup) et flashe la
  // bannière si un palier est atteint. `reset` remet la série à zéro.
  function bumpCombo(hits: number) {
    setComboCount((current) => {
      const next = current + hits;
      const label = comboLabel(next);
      if (label) {
        comboCounter += 1;
        const key = comboCounter;
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
    pulseCounter += 1;
    const key = pulseCounter;
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
    xpPulseCounter += 1;
    const key = xpPulseCounter;
    setXpPulse({ key, amount, kind });

    if (xpPulseTimeoutRef.current) clearTimeout(xpPulseTimeoutRef.current);
    xpPulseTimeoutRef.current = setTimeout(() => {
      setXpPulse((current) => (current?.key === key ? null : current));
    }, 1400);
  }

  function handleAdd(title: string) {
    optimisticIdCounter += 1;
    const roots = tasks.filter((task) => task.parent_id === null);
    const optimisticTask: Task = {
      id: `optimistic-${optimisticIdCounter}`,
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
    optimisticIdCounter += 1;
    const siblings = tasks.filter((task) => task.parent_id === parentId);
    const optimisticTask: Task = {
      id: `optimistic-${optimisticIdCounter}`,
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
    const cascade = computeToggleCascade(id, isCompleted, tasks);
    if (cascade.length === 0) return;

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
  }

  function confirmRageQuit() {
    const id = rageQuitConfirmId;
    setRageQuitConfirmId(null);
    if (!id) return;

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
      punchline: "Le Boss ricane : « Déjà à terre ? Relève-toi. »",
    });

    void rageQuitTaskAction(id).then((result) => {
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
    <div className="relative flex flex-1 flex-col gap-3 px-4 py-4">
      <Link
        href="/guide"
        aria-label="Manuel du Dojo"
        className="absolute right-3 top-3 z-40 text-xs text-faint hover:text-ink"
      >
        ?
      </Link>
      {showWakeUp && (
        <WakeUpRitual
          overdueTasks={overdueTasks}
          timezone={profile.timezone}
          onResolved={() => setShowWakeUp(false)}
        />
      )}
      {recap && (
        <CrepusculeRecap
          outcome={recap.outcome}
          bossName={bossName}
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
            heroFramePrefix={equippedHero.idleFramePrefix}
            heroFrameCount={equippedHero.idleFrameCount}
            heroHp={heroHp}
            heroMaxHp={HERO_MAX_HP}
            bossName={bossName}
            bossFramePrefix={boss.idleFramePrefix}
            bossFrameCount={boss.idleFrameCount}
            bossFlip={boss.flip}
            backgroundPath={background.publicPath}
            currentHp={currentHp}
            maxHp={maxHp}
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
          {xpPulse && (
            <FloatingText amount={xpPulse.amount} kind={xpPulse.kind} unit="XP" />
          )}
          {koState && (
            <PerfectOverlay
              tier={koState.tier}
              bossName={bossName}
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
          role="alertdialog"
          aria-label="Confirmer l'abandon"
          className="fixed inset-0 z-40 flex items-center justify-center bg-[oklch(0.08_0_0_/_72%)] px-6"
          onClick={() => setRageQuitConfirmId(null)}
        >
          <div
            className="flex w-full max-w-xs flex-col gap-3 rounded-lg border border-alert bg-surface p-4 text-center"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="font-display text-sm uppercase tracking-wide text-alert">
              Rage Quit ?
            </p>
            <p className="text-xs text-muted">
              Abandonner «{" "}
              {tasks.find((task) => task.id === rageQuitConfirmId)?.title}{" "}
              » coûte −{RAGE_QUIT_XP_PENALTY} XP. Le Boss rétrécit, mais il
              ricanera.
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
            className="shrink-0 font-display uppercase tracking-wide text-xp underline underline-offset-2"
          >
            Annuler
          </button>
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="font-display text-lg uppercase tracking-wide text-ink">
            Terrain vague.
          </p>
          <p className="max-w-[24ch] text-sm text-muted">
            Aucun monstre à l&apos;horizon. La rue est calme… trop calme.
          </p>
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
            onToggle={handleToggle}
            onAbandon={handleAbandon}
            onAddSubtask={handleAddSubtask}
            addingSubtaskParentId={addingSubtaskParentId}
            dragOverInfo={dragOverInfo}
          />
          <DragOverlay>
            {activeDragTaskId && (
              <div className="rounded-md border border-hp bg-surface px-3 py-2 text-sm text-ink shadow-lg">
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
          {closing ? "…" : "Rituel du Crépuscule"}
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
    </div>
  );
}
