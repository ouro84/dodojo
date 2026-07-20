"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Profile, Task } from "@/types";
import {
  applyXpDelta,
  calculateBossCurrentHp,
  calculateBossMaxHp,
  calculateHeroHp,
  canNestTask,
  HERO_MAX_HP,
  nextSiblingPosition,
  XP_PER_TASK,
} from "@/lib/game-engine";
import {
  addTask as addTaskAction,
  addSubtask as addSubtaskAction,
  abandonTask as abandonTaskAction,
  nestTask as nestTaskAction,
  setTaskCompleted as setTaskCompletedAction,
} from "@/app/actions/tasks";
import BottomNav from "@/components/ui/BottomNav";
import VersusScene from "./VersusScene";
import TaskList from "./TaskList";
import AddTaskForm from "./AddTaskForm";
import FloatingText from "./FloatingText";
import PerfectOverlay from "./PerfectOverlay";
import LevelUpOverlay from "./LevelUpOverlay";
import ImpactVfx, { pickImpactVariant, type ImpactVariantId } from "./ImpactVfx";

const BOSS_NAME = "Le Gardien de Glace";
const HERO_NAME = "Le Chevalier de Feu";

interface ArenaProps {
  initialProfile: Profile;
  initialTasks: Task[];
  overdueTasks: Task[];
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

let pulseCounter = 0;
let xpPulseCounter = 0;
let optimisticIdCounter = 0;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Arena({ initialProfile, initialTasks, overdueTasks }: ArenaProps) {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [xpPulse, setXpPulse] = useState<XpPulse | null>(null);
  const [showPerfect, setShowPerfect] = useState(false);
  const [levelUpValue, setLevelUpValue] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addingSubtaskParentId, setAddingSubtaskParentId] = useState<string | null>(null);
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
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
      day_date: todayIso(),
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
      day_date: todayIso(),
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
      }
    });
  }

  function handleToggle(id: string, isCompleted: boolean) {
    const target = tasks.find((task) => task.id === id);
    if (!target || target.is_completed === isCompleted) return;

    const previousTasksSnapshot = tasks;
    const previousProfileSnapshot = profile;
    const previousHp = currentHp;
    const nextTasks = tasks.map((task) =>
      task.id === id ? { ...task, is_completed: isCompleted } : task,
    );

    setTasks(nextTasks);

    const nextHp = calculateBossCurrentHp(nextTasks);
    const delta = previousHp - nextHp;

    if (isCompleted) {
      triggerPulse(delta, "damage");
      if (nextHp === 0 && calculateBossMaxHp(nextTasks) > 0) {
        setShowPerfect(true);
      }
    } else {
      triggerPulse(-delta, "heal");
    }

    if (!target.is_abandoned) {
      const xpDelta = isCompleted ? XP_PER_TASK : -XP_PER_TASK;
      const nextProfile = applyXpDelta(profile, xpDelta);
      const didLevelUp = nextProfile.level > profile.level;

      setProfile((current) => ({ ...current, level: nextProfile.level, xp: nextProfile.xp }));
      triggerXpPulse(XP_PER_TASK, isCompleted ? "heal" : "damage");
      if (didLevelUp) {
        setLevelUpValue(nextProfile.level);
      }
    }

    void setTaskCompletedAction(id, isCompleted).then((result) => {
      if (result.error) {
        setTasks(previousTasksSnapshot);
        setProfile(previousProfileSnapshot);
        setLevelUpValue(null);
        if (isCompleted) setShowPerfect(false);
        setBanner(result.error);
        return;
      }

      const { level, xp } = result;
      if (level !== undefined && xp !== undefined) {
        setProfile((current) => ({ ...current, level, xp }));
      }
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragTaskId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragTaskId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const taskToNest = tasks.find((task) => task.id === active.id);
    const targetParent = tasks.find((task) => task.id === over.id);
    if (!taskToNest || !targetParent) return;

    const check = canNestTask(taskToNest, targetParent, tasks);
    if (!check.allowed) {
      setBanner(check.reason ?? "Imbrication impossible.");
      return;
    }

    const previousSnapshot = tasks;
    const siblings = tasks.filter(
      (task) => task.parent_id === targetParent.id && task.id !== taskToNest.id,
    );
    const position = nextSiblingPosition(siblings);
    const nextTasks = tasks.map((task) =>
      task.id === taskToNest.id
        ? { ...task, parent_id: targetParent.id, position }
        : task,
    );

    setTasks(nextTasks);

    void nestTaskAction(taskToNest.id, targetParent.id).then((result) => {
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

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-4">
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
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <TaskList
            tasks={activeTasks}
            onToggle={handleToggle}
            onAbandon={handleAbandon}
            onAddSubtask={handleAddSubtask}
            addingSubtaskParentId={addingSubtaskParentId}
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

      <BottomNav active="arene" />
    </div>
  );
}
