"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile, Task } from "@/types";
import {
  calculateBossCurrentHp,
  calculateBossMaxHp,
  calculateHeroHp,
  HERO_MAX_HP,
} from "@/lib/game-engine";
import {
  addTask as addTaskAction,
  abandonTask as abandonTaskAction,
  setTaskCompleted as setTaskCompletedAction,
} from "@/app/actions/tasks";
import BottomNav from "@/components/ui/BottomNav";
import VersusScene from "./VersusScene";
import TaskList from "./TaskList";
import AddTaskForm from "./AddTaskForm";
import FloatingText from "./FloatingText";
import PerfectOverlay from "./PerfectOverlay";
import ImpactVfx, { pickImpactVariant, type ImpactVariantId } from "./ImpactVfx";

const BOSS_NAME = "Le Gardien de Glace";
const HERO_NAME = "Le Chevalier de Feu";

interface ArenaProps {
  profile: Profile;
  initialTasks: Task[];
  overdueTasks: Task[];
}

interface Pulse {
  key: number;
  amount: number;
  kind: "damage" | "heal";
  impactVariant?: ImpactVariantId;
}

let pulseCounter = 0;
let optimisticIdCounter = 0;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Arena({ profile, initialTasks, overdueTasks }: ArenaProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [showPerfect, setShowPerfect] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maxHp = calculateBossMaxHp(tasks);
  const currentHp = calculateBossCurrentHp(tasks);
  const heroHp = calculateHeroHp(overdueTasks);
  const activeTasks = tasks.filter((task) => !task.is_abandoned);
  const isEmpty = activeTasks.length === 0;

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
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

  function handleAdd(title: string) {
    optimisticIdCounter += 1;
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
      position: tasks.length,
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

  function handleToggle(id: string, isCompleted: boolean) {
    const target = tasks.find((task) => task.id === id);
    if (!target || target.is_completed === isCompleted) return;

    const previousSnapshot = tasks;
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

    void setTaskCompletedAction(id, isCompleted).then((result) => {
      if (result.error) {
        setTasks(previousSnapshot);
        if (isCompleted) setShowPerfect(false);
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
          {showPerfect && (
            <PerfectOverlay
              bossName={BOSS_NAME}
              onDismiss={() => setShowPerfect(false)}
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
        <TaskList
          tasks={activeTasks}
          onToggle={handleToggle}
          onAbandon={handleAbandon}
        />
      )}

      <AddTaskForm onAdd={handleAdd} pending={isAdding} />

      <BottomNav active="arene" />
    </div>
  );
}
