"use client";

import { useEffect, useRef, useState } from "react";
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
  nextSiblingPosition,
  planReorder,
  summarizeDay,
  XP_PER_TASK,
} from "@/lib/game-engine";
import {
  addTask as addTaskAction,
  addSubtask as addSubtaskAction,
  abandonTask as abandonTaskAction,
  reorderSiblings as reorderSiblingsAction,
  setTaskCompleted as setTaskCompletedAction,
} from "@/app/actions/tasks";
import { closeDay as closeDayAction } from "@/app/actions/day";
import BottomNav from "@/components/ui/BottomNav";
import VersusScene from "./VersusScene";
import TaskList from "./TaskList";
import AddTaskForm from "./AddTaskForm";
import FloatingText from "./FloatingText";
import PerfectOverlay from "./PerfectOverlay";
import LevelUpOverlay from "./LevelUpOverlay";
import WakeUpRitual from "./WakeUpRitual";
import CrepusculeRecap from "./CrepusculeRecap";
import ImpactVfx, { pickImpactVariant, type ImpactVariantId } from "./ImpactVfx";

const BOSS_NAME = "Le Gardien de Glace";
const HERO_NAME = "Le Chevalier de Feu";

interface ArenaProps {
  initialProfile: Profile;
  initialTasks: Task[];
  overdueTasks: Task[];
  dayResults: Array<Pick<DayResult, "day_date" | "outcome">>;
  today: string;
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
}: ArenaProps) {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [xpPulse, setXpPulse] = useState<XpPulse | null>(null);
  const [showPerfect, setShowPerfect] = useState(false);
  const [levelUpValue, setLevelUpValue] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
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
  const activeTasks = tasks.filter((task) => !task.is_abandoned);
  const isEmpty = activeTasks.length === 0;

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (xpPulseTimeoutRef.current) clearTimeout(xpPulseTimeoutRef.current);
    };
  }, []);

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
      is_recurring: false,
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
      is_recurring: false,
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
      if (nextHp === 0 && calculateBossMaxHp(nextTasks) > 0) {
        setShowPerfect(true);
      }
    } else if (hpDelta < 0) {
      triggerPulse(-hpDelta, "heal");
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
      if (hpDelta > 0) setShowPerfect(false);
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

  function handleAbandon(id: string) {
    const previousSnapshot = tasks;
    const nextTasks = tasks.map((task) =>
      task.id === id ? { ...task, is_abandoned: true } : task,
    );

    setTasks(nextTasks);

    void abandonTaskAction(id).then((result) => {
      if (result.error) {
        setTasks(previousSnapshot);
        setBanner(result.error);
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
    <div className="flex flex-1 flex-col gap-3 px-4 py-4">
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
          bossName={BOSS_NAME}
          username={profile.username}
          damageDealt={recap.damageDealt}
          tasksCompleted={recap.tasksCompleted}
          tasksAbandoned={recap.tasksAbandoned}
          xpEarned={recap.xpEarned}
          remainingMonsters={activeTasks.filter((task) => !task.is_completed).length}
          streak={currentStreak(dayResults, today)}
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
            heroName={HERO_NAME}
            heroHp={heroHp}
            heroMaxHp={HERO_MAX_HP}
            bossName={BOSS_NAME}
            currentHp={currentHp}
            maxHp={maxHp}
            dimmed={isEmpty}
          />
          {pulse?.kind === "damage" && pulse.impactVariant && (
            <ImpactVfx key={pulse.key} variant={pulse.impactVariant} />
          )}
          {pulse && <FloatingText amount={pulse.amount} kind={pulse.kind} />}
          {xpPulse && (
            <FloatingText amount={xpPulse.amount} kind={xpPulse.kind} unit="XP" />
          )}
          {showPerfect && (
            <PerfectOverlay
              bossName={BOSS_NAME}
              onDismiss={() => setShowPerfect(false)}
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

      <BottomNav active="arene" />
    </div>
  );
}
