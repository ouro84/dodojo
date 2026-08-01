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
  HERO_DAMAGE_PER_OVERDUE_TASK,
  collectAbandonCascade,
  applyRageQuitPenalty,
  RAGE_QUIT_XP_PENALTY,
  comboLabel,
  comboIntensity,
  nextComboState,
  type ComboState,
  insertNewActiveTaskId,
  nextDayKey,
  isPlanningUnlocked,
  nextSiblingPosition,
  planCompletionReorder,
  planReorder,
  summarizeDay,
  XP_PER_TASK,
  deferredRestHpPenalties,
  type KoTier,
} from "@/lib/game-engine";
import { DEFAULT_HERO_ID, getHero } from "@/lib/heroes";
import { getHeroSpriteBase } from "@/lib/hero-skins";
import { DEFAULT_BOSS_ID, getBoss } from "@/lib/bosses";
import { DEFAULT_BACKGROUND_ID, getBackground } from "@/lib/backgrounds";
import { heroSpriteMeta } from "@/lib/sprite-metadata";
import {
  ATTACK_DURATION_MS,
  DEATH_DURATION_MS,
  KO_FADE_MS,
  SP_ATTACK_DURATION_MS,
  addPendingHit,
  hitStopMs,
  impactDelayMs,
  pickAttackAnim,
  shouldForceFlush,
  type HeroAttackAnim,
  type PendingHits,
} from "@/lib/combat-animation";
import { buildShareCardParams } from "@/lib/share-card";
import { emptyStateTitle, emptyStateBody } from "@/lib/copy/combat";
import { rageQuitConfirmBody, rageQuitPunchline } from "@/lib/copy/rage-quit";
import { deadlineAlertLine } from "@/lib/copy/deadline";
import { planningUnlockedLine } from "@/lib/copy/planning";
import { randomSeed } from "@/lib/copy/variant";
import { resolveAggressivityLevel } from "@/lib/aggressivity";
import { createKeyedQueue } from "@/lib/async-queue";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  addTask as addTaskAction,
  addSubtask as addSubtaskAction,
  addTomorrowTask as addTomorrowTaskAction,
  reportToTomorrow as reportToTomorrowAction,
  bringToToday as bringToTodayAction,
  annihilateOverdueTask as annihilateTaskAction,
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
import AchievementToast from "./AchievementToast";
import { getAchievement } from "@/lib/achievements";
import WakeUpRitual from "./WakeUpRitual";
import CrepusculeRecap from "./CrepusculeRecap";
import TomorrowSection from "./TomorrowSection";
import { pickVfxVariant } from "./HeroVfx";
import KoSlam from "./KoSlam";

interface ArenaProps {
  initialProfile: Profile;
  initialTasks: Task[];
  initialTomorrowTasks: Task[];
  overdueTasks: Task[];
  dayResults: Array<Pick<DayResult, "day_date" | "outcome">>;
  today: string;
  bossId: string;
  backgroundId: string;
  hasSeenTutorial: boolean;
  initialNewAchievements: string[];
}

interface Pulse {
  key: number;
  amount: number;
  kind: "damage" | "heal";
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
  initialTomorrowTasks,
  overdueTasks,
  dayResults,
  today,
  bossId,
  backgroundId,
  hasSeenTutorial,
  initialNewAchievements,
}: ArenaProps) {
  const boss = getBoss(bossId) ?? getBoss(DEFAULT_BOSS_ID)!;
  const background =
    getBackground(backgroundId) ?? getBackground(DEFAULT_BACKGROUND_ID)!;
  const bossName = boss.name;
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const level = resolveAggressivityLevel(profile.aggressivity_level);
  const activeTitleText = profile.equipped_title_code
    ? (getAchievement(profile.equipped_title_code)?.title ?? "")
    : "";
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  // Issue #116 : section "Demain" — state client distinct de `tasks`, jamais
  // fusionné (garantit que calculateBossMaxHp/calculateHeroHp, qui ne lisent
  // que `tasks`, ne voient jamais une tâche de demain).
  const [tomorrowTasks, setTomorrowTasks] = useState<Task[]>(initialTomorrowTasks);
  const [isAddingTomorrow, setIsAddingTomorrow] = useState(false);
  const [addingTomorrowSubtaskParentId, setAddingTomorrowSubtaskParentId] = useState<string | null>(null);
  const [reportUndo, setReportUndo] = useState<{ id: string; taskTitle: string } | null>(null);
  const tomorrowSectionRef = useRef<HTMLDivElement>(null);
  const [wasPlanningUnlocked, setWasPlanningUnlocked] = useState(false);
  const [planningVoiceSeed, setPlanningVoiceSeed] = useState(randomSeed);
  const optimisticTomorrowIdCounterRef = useRef(0);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [xpPulse, setXpPulse] = useState<XpPulse | null>(null);
  const [koState, setKoState] = useState<{
    tier: Exclude<KoTier, null>;
    milestone: number | null;
    damageDealt: number;
    monstersDefeated: number;
    firstVictory: boolean;
  } | null>(null);
  // Issue #48 : séquence de mort du Boss avant l'overlay (death -> slam K.O.
  // -> fondu -> PerfectOverlay), cf. startKoSequence.
  const koSequenceRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [koSlam, setKoSlam] = useState(false);
  // US-29 : coach du 1er combat.
  const [tutorialActive, setTutorialActive] = useState(!hasSeenTutorial);
  const tutorialSeenRef = useRef(false);
  const [levelUpValue, setLevelUpValue] = useState<number | null>(null);
  const [achievementQueue, setAchievementQueue] = useState<string[]>(initialNewAchievements);
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

  // Issue #48 : animations de combat. Reprend exactement le patron déjà
  // utilisé par IdleSprite/ImpactVfx pour détecter prefers-reduced-motion.
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [heroAnim, setHeroAnim] = useState<{
    state: "idle" | "attack" | "hurt";
    anim?: HeroAttackAnim;
    key: number;
  } | null>(null);
  // Boss déjà K.O. au chargement (reste d'une session précédente) : on fige
  // sur death sans jouer la séquence (pas de slam, pas d'overlay).
  const [bossAnim, setBossAnim] = useState<{
    state: "idle" | "attack" | "hurt" | "death";
    key: number;
  }>(() => ({
    state: calculateBossCurrentHp(initialTasks) === 0 ? "death" : "idle",
    key: 0,
  }));
  const [frozen, setFrozen] = useState(false);
  const [vfxVariant, setVfxVariant] = useState<string | null>(null);
  const pendingHitRef = useRef<PendingHits | null>(null);
  const animKeyRef = useRef(0);
  // Issue #144 : sérialise les écritures de position par groupe de fratrie
  // (parentId) — deux reorderSiblingsAction concurrents sur le même groupe
  // ne doivent jamais s'écraser selon l'ordre d'arrivée réseau.
  const reorderQueueRef = useRef(createKeyedQueue<string | null>());
  const impactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Issue #48 (Task 4.1) : attaque du Boss sur deadline ratée / Rage Quit.
  const [bossAttackReason, setBossAttackReason] = useState<
    "deadline" | "rage_quit" | "recap" | null
  >(null);
  const bossAttackPendingRef = useRef<null | "deadline" | "rage_quit" | "recap">(null);
  // Miroir de heroAnim (même patron que tasksRef) : triggerBossAttack est
  // appelée depuis le polling deadline, un effet à deps `[]` (fermeture figée
  // au montage) — lire heroAnim directement y renverrait toujours sa valeur
  // initiale (null) et désactiverait la garde anti-chevauchement des animes.
  const heroAnimRef = useRef(heroAnim);
  // Task 4.2 : une seule attaque récapitulative par montage de l'Arène.
  const recapPlayedRef = useRef(false);

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
  // Issue #115 : horodatage (ISO) du dernier coup, pour le calcul optimiste
  // local de la fenêtre de 15 min — resynchronisé par la réponse serveur
  // (source de vérité), jamais persisté seul côté client.
  const lastComboCompletedAtRef = useRef<string | null>(null);
  const optimisticIdCounterRef = useRef(0);

  // US-05 : horloge de polling (~45s) pendant que l'Arène est montée, pour
  // détecter le franchissement d'une deadline. Recalculée en `now` plutôt
  // qu'à chaque frame : cf. design (pas de replay au chargement).
  const [now, setNow] = useState(() => new Date());
  const knownMissedDeadlineIdsRef = useRef<Set<string>>(
    new Set(missedDeadlineTasks(initialTasks, new Date()).map((t) => t.id)),
  );
  const [heroPulse, setHeroPulse] = useState<{ key: number } | null>(null);
  // A3 (issue #101) : pulse "heal" gold côté Héros à chaque remontée de
  // heroHp (coche d'une pénalité, rage quit d'une deadline ratée). Pas
  // étendu au Réveil (limité à l'Arène, cf. spec A3).
  const [heroHealPulse, setHeroHealPulse] = useState<{
    key: number;
    amount: number;
  } | null>(null);
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
  const heroHealPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroHealPulseCounterRef = useRef(0);
  // A3 : ref du heroHp précédent pour détecter les remontées (delta > 0).
  // Initialisé à null pour ne pas pulser au montage (au 1er rendu, on
  // initialise simplement le ref sans émettre de pulse).
  const prevHeroHpRef = useRef<number | null>(null);
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
    // By-pass A4-overdue (issue #101) : pénalité -20 persistante des restes
    // déferrés depuis Le Réveil. Le state local `tasks` contient déjà les
    // tâches rapportées par `onResolved(deferredTasks)` (cf. Bug #70) — on
    // les passe au pool via `deferred_at` non-null + !is_completed && !is_abandoned.
    ...deferredRestHpPenalties(tasks),
  ]);
  // A4 (issue #101) : sets d'ids pour activer les chips pénalité -10/-20 HP
  // sur les TaskRow correspondantes. Déjà filtrées `!is_completed &&
  // !is_abandoned` côté calcul (activeTasks filtre `is_abandoned` ;
  // missedDeadlineTasks + overdueTasks sont recalculés à chaque rendu, donc
  // les chips disparaissent dès résolution). Pas de useMemo : la règle
  // react-hooks/preserve-manual-memoization bloque les dep arrays contenant
  // missedDeadlines (nouvelle réf à chaque rendu) — cf. CLAUDE.md note.
  // By-pass A4-overdue : on ajoute les tâches déferrées (deferred_at != null)
  // au set "reste reporté" pour que leur chip -20 reste visible après Report,
  // jusqu'à résolution (coche/rage quit clear le deferred_at).
  const missedDeadlineIds = new Set(missedDeadlines.map((t) => t.id));
  const overdueRestIds = new Set([
    ...overdueTasks
      .filter((t) => !t.is_completed && !t.is_abandoned)
      .map((t) => t.id),
    ...tasks
      .filter((t) => t.deferred_at != null && !t.is_completed && !t.is_abandoned)
      .map((t) => t.id),
  ]);
  // Issue #116 : jour de demain + gate heure seuil. `now`/`profile.timezone`
  // sont déjà recalculés par le polling ~45s existant (US-05) — pas de timer
  // dédié pour ce gate.
  const tomorrowDayDate = nextDayKey(today);
  const planningUnlocked = isPlanningUnlocked(now, profile.timezone, profile.plan_tomorrow_after_hour);
  const activeTomorrowTasks = tomorrowTasks.filter((task) => !task.is_abandoned);

  // US-18 : héros affiché = celui équipé (fallback défaut si id inconnu).
  const equippedHero =
    getHero(profile.equipped_hero_id) ?? getHero(DEFAULT_HERO_ID)!;
  // US-53 : tenue équipée (null = tenue par défaut du héros).
  const equippedHeroSpriteBase = getHeroSpriteBase(
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

  // Issue #116 : nouvelle punchline uniquement à la transition false→true (pas
  // à chaque re-rendu pendant le poll ~45s) — même patron que wasEmpty.
  if (planningUnlocked !== wasPlanningUnlocked) {
    setWasPlanningUnlocked(planningUnlocked);
    if (planningUnlocked) setPlanningVoiceSeed(randomSeed());
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
      // A3 : cleanup du timeout heal pulse (sinon fuite + setHeroHealPulse
      // sur un composant démonté = warning React).
      if (heroHealPulseTimeoutRef.current) clearTimeout(heroHealPulseTimeoutRef.current);
      // Issue #48 : timers d'impact/hit-stop des animations de combat.
      if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
      koSequenceRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    heroAnimRef.current = heroAnim;
  }, [heroAnim]);

  // Task 4.2 : ce qui était déjà raté avant l'ouverture de l'Arène (deadlines
  // dépassées, restes reportés au Réveil) se solde par une seule attaque du
  // Boss, jamais une par élément. Ce comportement revient sur l'entrée
  // « pas de replay au chargement » de CLAUDE.md (US-05) — voir Task 5.1.
  useEffect(() => {
    if (recapPlayedRef.current || reducedMotion) return;
    if (showWakeUp) return; // Le Réveil bloque : on attend sa fermeture.
    const hadPenalties = missedDeadlines.length > 0 || overdueTasks.length > 0;
    if (!hadPenalties) return;
    recapPlayedRef.current = true;
    triggerBossAttack("recap");
  }, [missedDeadlines.length, overdueTasks.length, reducedMotion, showWakeUp]);

  // Renaissance : une tâche ajoutée après le K.O. re-soigne le Boss (cf.
  // koOutcome, garde prevBossHp===0). La séquence de mort en cours est
  // annulée — pas de slam, pas d'overlay. Ajustement pendant le rendu (même
  // patron que wasEmpty/CharacterSprite) plutôt qu'un effet : évite le
  // re-rendu en cascade signalé par react-hooks/set-state-in-effect.
  const [prevCurrentHpForRenaissance, setPrevCurrentHpForRenaissance] = useState(currentHp);
  if (currentHp !== prevCurrentHpForRenaissance) {
    setPrevCurrentHpForRenaissance(currentHp);
    if (currentHp > 0) {
      cancelKoSequence();
      setBossAnim((prev) => (prev.state === "death" ? { state: "idle", key: prev.key + 1 } : prev));
    }
  }

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
        triggerBossAttack("deadline");
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

  // A3 (issue #101) : à chaque remontée de heroHp (delta > 0), on émet un
  // pulse "heal" gold au-dessus du Héros. Les baisses (delta <= 0) ne se
  // déclenchent pas ici — elles sont déjà couvertes par heroPulse existant
  // (polling deadline). On évite aussi un pulse au montage via prevHeroHpRef
  // initialisé à null (premier rendu : on se contente d'amorcer le ref).
  useEffect(() => {
    const prev = prevHeroHpRef.current;
    if (prev === null) {
      prevHeroHpRef.current = heroHp;
      return;
    }
    const delta = heroHp - prev;
    prevHeroHpRef.current = heroHp;

    if (delta > 0) {
      heroHealPulseCounterRef.current += 1;
      const key = heroHealPulseCounterRef.current;
      setHeroHealPulse({ key, amount: delta });
      if (heroHealPulseTimeoutRef.current) clearTimeout(heroHealPulseTimeoutRef.current);
      heroHealPulseTimeoutRef.current = setTimeout(() => {
        setHeroHealPulse((current) => (current?.key === key ? null : current));
      }, 1400);
    }
  }, [heroHp]);

  // Combo : incrémente de `hits` (tâches terminées d'un coup) et flashe la
  // bannière si un palier est atteint. `reset` remet la série à zéro.
  // Issue #115 : le combo module désormais l'XP réelle (calculée
  // server-authoritative dans setTaskCompleted). Ce guess optimiste applique
  // la même fenêtre de 15 min localement pour un feedback instantané ; il est
  // resynchronisé silencieusement sur `comboCount` renvoyé par le serveur une
  // fois la réponse arrivée (cf. fin de handleToggle), sans redéclencher le
  // flash si la valeur ne change pas.
  function bumpComboOptimistic(hits: number) {
    const now = new Date();
    let state: ComboState = {
      comboCount,
      lastCompletedAt: lastComboCompletedAtRef.current,
    };
    for (let i = 0; i < hits; i += 1) {
      state = nextComboState(state, now);
    }
    lastComboCompletedAtRef.current = state.lastCompletedAt;

    const label = comboLabel(state.comboCount);
    if (label) {
      comboCounterRef.current += 1;
      const key = comboCounterRef.current;
      setComboFlash({ key, label, intensity: comboIntensity(state.comboCount) });
      if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
      comboTimeoutRef.current = setTimeout(() => {
        setComboFlash((c) => (c?.key === key ? null : c));
      }, 1200);
    }
    setComboCount(state.comboCount);
  }

  function resetCombo() {
    setComboCount(0);
    setComboFlash(null);
    lastComboCompletedAtRef.current = null;
    if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
  }

  function triggerPulse(amount: number, kind: Pulse["kind"]) {
    pulseCounterRef.current += 1;
    const key = pulseCounterRef.current;
    setPulse({ key, amount, kind });

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

  // Issue #48 : dégâts calés sur la frame d'impact du coup de héros. Sous
  // reduced-motion, aucun gating : le feedback reste instantané (spec §9).
  function triggerHeroAttack(hpDelta: number, xpDelta: number, isFatal: boolean) {
    if (reducedMotion) {
      triggerPulse(hpDelta, "damage");
      triggerXpPulse(Math.abs(xpDelta), xpDelta >= 0 ? "heal" : "damage");
      return;
    }

    const now = Date.now();
    pendingHitRef.current = addPendingHit(pendingHitRef.current, hpDelta, xpDelta, now);
    const hits = pendingHitRef.current.hits;

    animKeyRef.current += 1;
    const key = animKeyRef.current;
    const anim = pickAttackAnim(comboCount, isFatal, Math.random);
    setHeroAnim({ state: "attack", anim, key });
    setVfxVariant(pickVfxVariant(equippedHero.slug));

    const meta = heroSpriteMeta(equippedHero.slug).anims[anim];
    const delay = impactDelayMs(
      meta.frames,
      meta.impactFrame,
      anim === "sp_atk" ? SP_ATTACK_DURATION_MS : ATTACK_DURATION_MS,
    );

    if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
    impactTimerRef.current = setTimeout(
      () => flushImpact(isFatal, hits),
      shouldForceFlush(pendingHitRef.current, now) ? 0 : delay,
    );
  }

  // Flush du/des coup(s) en attente : applique les dégâts+XP cumulés au
  // moment de l'impact visuel, joue le hurt/death du Boss, puis le hit-stop.
  function flushImpact(isFatal: boolean, hits: number) {
    const pending = pendingHitRef.current;
    pendingHitRef.current = null;
    if (!pending) return;

    triggerPulse(pending.damage, "damage");
    triggerXpPulse(Math.abs(pending.xp), pending.xp >= 0 ? "heal" : "damage");
    setBossAnim((prev) => ({
      state: isFatal ? "death" : "hurt",
      key: prev.key + 1,
    }));

    const stop = hitStopMs({ isFatal, comboCount, hits });
    setFrozen(true);
    if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
    freezeTimerRef.current = setTimeout(() => setFrozen(false), stop);
  }

  // Issue #48 (Task 4.1) : contre-attaque du Boss (deadline ratée, Rage Quit,
  // récapitulatif au chargement — Task 4.2). Héros et Boss n'animent jamais en
  // même temps : si le héros est en train de frapper, l'attaque attend la fin
  // de son anim (rejouée depuis onHeroAttackEnd, cf. plus bas).
  function triggerBossAttack(reason: "deadline" | "rage_quit" | "recap") {
    if (reducedMotion) return;
    if (heroAnimRef.current?.state === "attack") {
      bossAttackPendingRef.current = reason;
      return;
    }
    animKeyRef.current += 1;
    setBossAnim({ state: "attack", key: animKeyRef.current });
    setBossAttackReason(reason);
  }

  function onBossImpact() {
    animKeyRef.current += 1;
    setHeroAnim({ state: "hurt", key: animKeyRef.current });
    const stop = hitStopMs({ isFatal: false, comboCount: 0, hits: 1 });
    setFrozen(true);
    if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
    freezeTimerRef.current = setTimeout(() => setFrozen(false), stop);

    if (bossAttackReason === "rage_quit") {
      // Rage Quit : -5 XP, aucun HP. L'anim est narrative, la jauge ne bouge pas.
      triggerXpPulse(RAGE_QUIT_XP_PENALTY, "damage");
    }
    // deadline / recap : les HP sont déjà décomptés par le calcul de heroHp,
    // le FloatingText et le clignotement de jauge existants restent en place.
  }

  // Rejoue une attaque du Boss mise en attente pendant que le héros frappait.
  function onHeroAttackEnd() {
    if (bossAttackPendingRef.current) {
      const reason = bossAttackPendingRef.current;
      bossAttackPendingRef.current = null;
      triggerBossAttack(reason);
    }
  }

  type KoPayload = NonNullable<Parameters<typeof setKoState>[0]>;

  // Décale l'ouverture de PerfectOverlay pour laisser la mort du Boss et le
  // slam « K.O. » se jouer : death (DEATH_DURATION_MS) -> slam + fondu
  // (KO_FADE_MS) -> setKoState (ouvre l'overlay). Sous reduced-motion, aucun
  // délai : l'overlay s'ouvre immédiatement (comportement pré-#48).
  function startKoSequence(payload: KoPayload) {
    if (reducedMotion) {
      setKoState(payload);
      return;
    }
    koSequenceRef.current.push(
      setTimeout(() => setKoSlam(true), DEATH_DURATION_MS),
      setTimeout(() => {
        setKoSlam(false);
        setKoState(payload);
      }, DEATH_DURATION_MS + KO_FADE_MS),
    );
  }

  function cancelKoSequence() {
    koSequenceRef.current.forEach(clearTimeout);
    koSequenceRef.current = [];
    setKoSlam(false);
  }

  function handleAdd(title: string) {
    optimisticIdCounterRef.current += 1;
    // Bug #111 reorder : exclure les racines abandonnées. `roots.map(id)` nourrit
    // `reorderSiblingsAction`, qui rejette (`is_abandoned`) tout id abandonné —
    // sur ce compte partagé qui accumule des racines "Rage Quit"/"Annihiler"
    // (RG-04, jamais de DELETE), une seule racine abandonnée suffisait à faire
    // échouer le reorder et, via le rollback, à effacer la tâche qu'on venait
    // d'ajouter (cf. previousSnapshot ci-dessous).
    const roots = tasks.filter((task) => task.parent_id === null && !task.is_abandoned);
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
      deferred_at: null,
      xp_awarded: null,
      reminder_offset_minutes: null,
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

        // Issue #111 : si des tâches racines sont déjà complétées, place la
        // nouvelle tâche juste au-dessus d'elles plutôt qu'en toute fin.
        const completedRootIds = new Set(
          roots.filter((task) => task.is_completed).map((task) => task.id),
        );
        if (completedRootIds.size > 0) {
          const orderedIds = insertNewActiveTaskId(
            roots.map((task) => task.id),
            realId,
            completedRootIds,
          );
          // Rollback ciblé sur les positions touchées, capturées depuis le
          // `prev` réel de ce setTasks (pas un `tasks` de fermeture, stale
          // depuis avant l'ajout optimiste) — un reorder en erreur ne doit
          // jamais effacer la tâche qui vient d'être ajoutée avec succès.
          const previousPositions = new Map<string, number>();
          setTasks((prev) => {
            const positionByTaskId = new Map(orderedIds.map((taskId, index) => [taskId, index]));
            return prev.map((task) => {
              const position = positionByTaskId.get(task.id);
              if (position === undefined) return task;
              previousPositions.set(task.id, task.position);
              return { ...task, position };
            });
          });
          void reorderQueueRef.current
            .run(null, () => reorderSiblingsAction(null, orderedIds))
            .then((reorderResult) => {
              if (reorderResult.error) {
                setTasks((prev) =>
                  prev.map((task) =>
                    previousPositions.has(task.id)
                      ? { ...task, position: previousPositions.get(task.id)! }
                      : task,
                  ),
                );
              }
            });
        }
      }
    });
  }

  function handleAddSubtask(parentId: string, title: string) {
    optimisticIdCounterRef.current += 1;
    // Cf. handleAdd : exclure les sous-tâches abandonnées du pool de reorder.
    const siblings = tasks.filter(
      (task) => task.parent_id === parentId && !task.is_abandoned,
    );
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
      deferred_at: null,
      xp_awarded: null,
      reminder_offset_minutes: null,
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

        const completedSiblingIds = new Set(
          siblings.filter((task) => task.is_completed).map((task) => task.id),
        );
        if (completedSiblingIds.size > 0) {
          const orderedIds = insertNewActiveTaskId(
            siblings.map((task) => task.id),
            realId,
            completedSiblingIds,
          );
          // Cf. handleAdd : rollback ciblé sur les positions, jamais sur un
          // snapshot stale d'avant l'ajout.
          const previousPositions = new Map<string, number>();
          setTasks((prev) => {
            const positionByTaskId = new Map(orderedIds.map((taskId, index) => [taskId, index]));
            return prev.map((task) => {
              const position = positionByTaskId.get(task.id);
              if (position === undefined) return task;
              previousPositions.set(task.id, task.position);
              return { ...task, position };
            });
          });
          void reorderQueueRef.current
            .run(parentId, () => reorderSiblingsAction(parentId, orderedIds))
            .then((reorderResult) => {
              if (reorderResult.error) {
                setTasks((prev) =>
                  prev.map((task) =>
                    previousPositions.has(task.id)
                      ? { ...task, position: previousPositions.get(task.id)! }
                      : task,
                  ),
                );
              }
            });
        }
      }
    });
  }

  // Issue #116 : ajout direct dans la section "Demain".
  function handleAddTomorrow(title: string) {
    optimisticTomorrowIdCounterRef.current += 1;
    const roots = tomorrowTasks.filter((task) => task.parent_id === null && !task.is_abandoned);
    const optimisticTask: Task = {
      id: `optimistic-tomorrow-${optimisticTomorrowIdCounterRef.current}`,
      user_id: profile.id,
      parent_id: null,
      title,
      is_completed: false,
      is_abandoned: false,
      abandon_reason: null,
      is_recurring: false,
      recurring_template_id: null,
      deadline_at: null,
      deferred_at: null,
      xp_awarded: null,
      reminder_offset_minutes: null,
      day_date: tomorrowDayDate,
      position: nextSiblingPosition(roots),
      created_at: new Date().toISOString(),
    };

    setTomorrowTasks((prev) => [...prev, optimisticTask]);
    setIsAddingTomorrow(true);

    void addTomorrowTaskAction(title).then((result) => {
      setIsAddingTomorrow(false);
      if (result.error) {
        setTomorrowTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
        setBanner(result.error);
        return;
      }
      if (result.id) {
        const realId = result.id;
        setTomorrowTasks((prev) =>
          prev.map((task) => (task.id === optimisticTask.id ? { ...task, id: realId } : task)),
        );
      }
    });
  }

  // Issue #116 : sous-tâche dans la section "Demain" (même mécanisme serveur
  // addSubtask que l'Arène du jour — hérite désormais du day_date du parent).
  function handleAddTomorrowSubtask(parentId: string, title: string) {
    optimisticTomorrowIdCounterRef.current += 1;
    const siblings = tomorrowTasks.filter(
      (task) => task.parent_id === parentId && !task.is_abandoned,
    );
    const optimisticTask: Task = {
      id: `optimistic-tomorrow-${optimisticTomorrowIdCounterRef.current}`,
      user_id: profile.id,
      parent_id: parentId,
      title,
      is_completed: false,
      is_abandoned: false,
      abandon_reason: null,
      is_recurring: false,
      recurring_template_id: null,
      deadline_at: null,
      deferred_at: null,
      xp_awarded: null,
      reminder_offset_minutes: null,
      day_date: tomorrowDayDate,
      position: nextSiblingPosition(siblings),
      created_at: new Date().toISOString(),
    };

    setTomorrowTasks((prev) => [...prev, optimisticTask]);
    setAddingTomorrowSubtaskParentId(parentId);

    void addSubtaskAction(parentId, title).then((result) => {
      setAddingTomorrowSubtaskParentId(null);
      if (result.error) {
        setTomorrowTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
        setBanner(result.error);
        return;
      }
      if (result.id) {
        const realId = result.id;
        setTomorrowTasks((prev) =>
          prev.map((task) => (task.id === optimisticTask.id ? { ...task, id: realId } : task)),
        );
      }
    });
  }

  // Issue #116 : deadline sur une tâche de la section "Demain" (même action
  // serveur setTaskDeadline, générique sur id+deadlineAt).
  function handleSetTomorrowDeadline(id: string, deadlineAt: string | null) {
    if (isOptimisticId(id)) return;
    const previousSnapshot = tomorrowTasks;
    setTomorrowTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, deadline_at: deadlineAt } : task)),
    );
    markPending(id);
    void setTaskDeadlineAction(id, deadlineAt).then((result) => {
      unmarkPending(id);
      if (result.error) {
        setTomorrowTasks(previousSnapshot);
        setBanner(result.error);
      }
    });
  }

  // Issue #116 : abandon d'une tâche "Demain" — toujours annihilated, jamais
  // de Rage Quit (pas de combat en cours sur une tâche pas encore
  // "aujourd'hui"). Réutilise l'action serveur annihilateOverdueTask
  // (comportement identique : is_abandoned=true, cascade sous-tâches, aucun
  // filtre de day_date côté serveur).
  function handleAnnihilateTomorrow(id: string) {
    if (isOptimisticId(id)) return;
    const cascadeIds = new Set([
      id,
      ...tomorrowTasks.filter((task) => task.parent_id === id).map((task) => task.id),
    ]);
    const previousSnapshot = tomorrowTasks;
    setTomorrowTasks((prev) =>
      prev.map((task) =>
        cascadeIds.has(task.id)
          ? { ...task, is_abandoned: true, abandon_reason: "annihilated" as const }
          : task,
      ),
    );
    for (const cid of cascadeIds) markPending(cid);
    void annihilateTaskAction(id).then((result) => {
      for (const cid of cascadeIds) unmarkPending(cid);
      if (result.error) {
        setTomorrowTasks(previousSnapshot);
        setBanner(result.error);
      }
    });
  }

  // Issue #116 : report proactif d'une tâche du jour vers demain. Jamais de
  // malus (≠ Le Réveil) : la tâche sort simplement du pool du jour, le Boss
  // rétrécit automatiquement (calculateBossMaxHp ne lit plus cette tâche).
  function handleReportToTomorrow(id: string) {
    if (isOptimisticId(id)) return;
    const cascadeIds = new Set([
      id,
      ...tasks.filter((task) => task.parent_id === id).map((task) => task.id),
    ]);
    const tasksSnapshot = tasks;
    const tomorrowSnapshot = tomorrowTasks;
    const reportedTitle = tasks.find((task) => task.id === id)?.title ?? "";

    const moved = tasks
      .filter((task) => cascadeIds.has(task.id))
      .map((task) => ({ ...task, day_date: tomorrowDayDate, deadline_at: null, deferred_at: null }));

    setTasks((prev) => prev.filter((task) => !cascadeIds.has(task.id)));
    setTomorrowTasks((prev) => [...prev, ...moved]);
    setReportUndo({ id, taskTitle: reportedTitle });

    for (const cid of cascadeIds) markPending(cid);
    void reportToTomorrowAction(id).then((result) => {
      for (const cid of cascadeIds) unmarkPending(cid);
      if (result.error) {
        setTasks(tasksSnapshot);
        setTomorrowTasks(tomorrowSnapshot);
        setReportUndo(null);
        setBanner(result.error);
        return;
      }
      if (result.reportedTasks?.length) {
        const byId = new Map(result.reportedTasks.map((task) => [task.id, task]));
        setTomorrowTasks((prev) => prev.map((task) => byId.get(task.id) ?? task));
      }
    });
  }

  // Issue #116 : ramène une tâche à aujourd'hui — depuis la section "Demain"
  // (changement d'avis) OU via "Annuler" juste après un report (même action).
  function handleBringToToday(id: string) {
    if (isOptimisticId(id)) return;
    const cascadeIds = new Set([
      id,
      ...tomorrowTasks.filter((task) => task.parent_id === id).map((task) => task.id),
    ]);
    const tasksSnapshot = tasks;
    const tomorrowSnapshot = tomorrowTasks;

    const moved = tomorrowTasks
      .filter((task) => cascadeIds.has(task.id))
      .map((task) => ({ ...task, day_date: today, deadline_at: null, deferred_at: null }));

    setTomorrowTasks((prev) => prev.filter((task) => !cascadeIds.has(task.id)));
    setTasks((prev) => [...prev, ...moved]);
    if (reportUndo?.id === id) setReportUndo(null);

    for (const cid of cascadeIds) markPending(cid);
    void bringToTodayAction(id).then((result) => {
      for (const cid of cascadeIds) unmarkPending(cid);
      if (result.error) {
        setTasks(tasksSnapshot);
        setTomorrowTasks(tomorrowSnapshot);
        setBanner(result.error);
        return;
      }
      if (result.broughtBackTasks?.length) {
        const byId = new Map(result.broughtBackTasks.map((task) => [task.id, task]));
        setTasks((prev) => prev.map((task) => byId.get(task.id) ?? task));
      }
    });
  }

  function scrollToTomorrowSection() {
    tomorrowSectionRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
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

    const reorderPlans = planCompletionReorder(tasks, cascade);
    const positionByTaskId = new Map<string, number>();
    for (const plan of reorderPlans) {
      plan.orderedTaskIds.forEach((id, index) => positionByTaskId.set(id, index));
    }

    const nextCompletionById = new Map(cascade.map((c) => [c.taskId, c.isCompleted]));
    const nextTasks = tasks.map((task) => {
      const nextCompleted = nextCompletionById.get(task.id);
      const nextPosition = positionByTaskId.get(task.id);
      return {
        ...task,
        is_completed: nextCompleted === undefined ? task.is_completed : nextCompleted,
        position: nextPosition === undefined ? task.position : nextPosition,
      };
    });

    setTasks(nextTasks);

    const nextHp = calculateBossCurrentHp(nextTasks);
    const hpDelta = previousHp - nextHp;
    // Calculé ici (avant le branchement hpDelta) pour alimenter le gating
    // d'animation ci-dessous, qui a besoin du montant d'XP au moment du coup.
    const xpDelta = cascade.reduce((total, change) => {
      const task = tasks.find((t) => t.id === change.taskId);
      if (!task || task.is_abandoned) return total;
      return total + (change.isCompleted ? XP_PER_TASK : -XP_PER_TASK);
    }, 0);

    if (hpDelta > 0) {
      // US-16 : transition→0 = célébration. previousHp est le HP du Boss avant
      // ce coup (garde de transition), heroHp l'état du Héro (palier PERFECT).
      const nextMaxHp = calculateBossMaxHp(nextTasks);
      const isFatal = nextHp === 0;
      triggerHeroAttack(hpDelta, xpDelta, isFatal);
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
        startKoSequence({
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
      if (hits > 0) bumpComboOptimistic(hits);
    } else {
      resetCombo();
    }

    if (xpDelta !== 0) {
      const nextProfile = applyXpDelta(profile, xpDelta);
      const didLevelUp = nextProfile.level > profile.level;

      setProfile((current) => ({ ...current, level: nextProfile.level, xp: nextProfile.xp }));
      // Dégâts (hpDelta > 0) hors reduced-motion : le pulse XP est déjà pris
      // en charge par flushImpact (coalescé avec les dégâts au moment de
      // l'impact) — le déclencher aussi ici doublerait le montant affiché.
      if (!(hpDelta > 0 && !reducedMotion)) {
        triggerXpPulse(Math.abs(xpDelta), xpDelta > 0 ? "heal" : "damage");
      }
      if (didLevelUp) {
        setLevelUpValue(nextProfile.level);
      }
    }

    // Appels séquentiels (pas Promise.all) : chaque appel recalcule le
    // niveau/XP à partir du profil déjà persisté par le précédent — en
    // parallèle, chacun partirait du même profil pas encore à jour et
    // écraserait le gain d'XP des autres.
    let lastResult: Awaited<ReturnType<typeof setTaskCompletedAction>> | null = null;
    const newAchievementCodes: string[] = [];
    for (const change of cascade) {
      lastResult = await setTaskCompletedAction(change.taskId, change.isCompleted);
      if (lastResult.newAchievements?.length) newAchievementCodes.push(...lastResult.newAchievements);
      if (lastResult.error) break;
    }
    if (newAchievementCodes.length > 0) {
      setAchievementQueue((prev) => [...prev, ...newAchievementCodes]);
    }

    if (lastResult?.error) {
      setTasks(previousTasksSnapshot);
      setProfile(previousProfileSnapshot);
      setLevelUpValue(null);
      if (hpDelta > 0) {
        cancelKoSequence();
        setKoState(null);
      }
      resetCombo();
      setBanner(lastResult.error);
      return;
    }

    const { level, xp, comboCount: serverComboCount } = lastResult ?? {};
    if (level !== undefined && xp !== undefined) {
      setProfile((current) => ({ ...current, level, xp }));
    }
    if (serverComboCount !== undefined) {
      setComboCount(serverComboCount);
    }

    // Issue #111 : persistance best-effort du nouvel ordre. Un échec ici ne
    // remet pas en cause la complétion déjà confirmée (c'est un bonus visuel,
    // pas une règle métier critique) — seule la position optimiste de ce
    // groupe est restaurée si l'appel échoue.
    for (const plan of reorderPlans) {
      void reorderQueueRef.current
        .run(plan.parentId, () => reorderSiblingsAction(plan.parentId, plan.orderedTaskIds))
        .then((result) => {
          if (result.error) {
            setTasks((current) =>
              current.map((task) => {
                const previous = previousTasksSnapshot.find((t) => t.id === task.id);
                return previous && task.parent_id === plan.parentId
                  ? { ...task, position: previous.position }
                  : task;
              }),
            );
          }
        });
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

    void reorderQueueRef.current
      .run(plan.parentId, () => reorderSiblingsAction(plan.parentId, plan.orderedTaskIds))
      .then((result) => {
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
    // Issue #48 : la contre-attaque du Boss porte le pulse -XP à l'impact
    // (onBossImpact) ; sous reduced-motion, aucune anim ne se joue, le pulse
    // reste donc immédiat pour ne jamais perdre le feedback.
    if (reducedMotion) {
      triggerXpPulse(RAGE_QUIT_XP_PENALTY, "damage");
    } else {
      triggerBossAttack("rage_quit");
    }
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
    const newAchievements = result.newAchievements;
    if (newAchievements?.length) {
      setAchievementQueue((prev) => [...prev, ...newAchievements]);
    }
    setRecap(summarizeDay(tasks, "manual"));
  }

  return (
    <main className="screen-main relative h-dvh gap-3 overflow-hidden px-4 py-4">
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
            title: activeTitleText,
            streak: currentStreak(dayResults, today).length,
            dayDate: today,
          })}
          onDismiss={() => setRecap(null)}
          onPlanTomorrow={planningUnlocked ? scrollToTomorrowSection : undefined}
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
            heroSpriteBase={equippedHeroSpriteBase}
            heroSlug={equippedHero.slug}
            heroHp={heroHp}
            heroMaxHp={HERO_MAX_HP}
            heroAlarm={heroPulse !== null}
            // A2 (issue #101) : breakdown des pénalités Héros pour le
            // popover de transparence du calcul. overdueTasks et
            // missedDeadlines sont déjà calculés plus haut. By-pass
            // A4-overdue : on inclut aussi les tâches déferrées de `tasks`
            // car `overdueTasks` est re-fetché après Report (revalidatePath)
            // et n'inclut plus la tâche reportée (day_date = today).
            heroPenaltiesBreakdown={{
              overdueCount: new Set([
                ...overdueTasks.filter(
                  (t) => !t.is_completed && !t.is_abandoned,
                ).map((t) => t.id),
                ...tasks.filter(
                  (t) => t.deferred_at != null && !t.is_completed && !t.is_abandoned,
                ).map((t) => t.id),
              ]).size,
              overdueHpPerItem: HERO_DAMAGE_PER_OVERDUE_TASK,
              missedCount: missedDeadlines.length,
              missedHpPerItem: HERO_DAMAGE_PER_MISSED_DEADLINE,
            }}
            bossName={bossName}
            bossSpriteBase={boss.spriteBase}
            bossSlug={boss.slug}
            bossFlip={boss.flip}
            bossFallbackHurtDeath={boss.fallbackHurtDeath}
            backgroundPath={background.publicPath}
            currentHp={currentHp}
            maxHp={maxHp}
            upcomingDeadlineCount={upcomingDeadlineCount(activeTasks, now)}
            dimmed={isEmpty}
            vfxVariant={vfxVariant}
            reducedMotion={reducedMotion}
            heroState={heroAnim?.state ?? "idle"}
            heroAttackAnim={heroAnim?.anim}
            heroStateKey={heroAnim?.key ?? 0}
            bossState={bossAnim.state}
            bossStateKey={bossAnim.key}
            frozen={frozen}
            onBossImpact={onBossImpact}
            onHeroAttackEnd={onHeroAttackEnd}
          />
          {koSlam && <KoSlam />}
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
          {heroHealPulse && (
            <FloatingText
              amount={heroHealPulse.amount}
              kind="heal"
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
                title: activeTitleText,
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
              onPlanTomorrow={planningUnlocked ? scrollToTomorrowSection : undefined}
            />
          )}
          {levelUpValue !== null && (
            <LevelUpOverlay
              newLevel={levelUpValue}
              aggressivityLevel={level}
              onDismiss={() => setLevelUpValue(null)}
            />
          )}
          <AchievementToast
            codes={achievementQueue}
            onDismissAll={() => setAchievementQueue([])}
          />
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

      {reportUndo && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted"
        >
          <span>« {reportUndo.taskTitle} » repoussée à demain.</span>
          <button
            type="button"
            onClick={() => handleBringToToday(reportUndo.id)}
            className="shrink-0 font-display uppercase tracking-wide text-xp-text underline underline-offset-2"
          >
            Annuler
          </button>
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
            onReportTomorrow={handleReportToTomorrow}
            showReportTomorrow={planningUnlocked}
            addingSubtaskParentId={addingSubtaskParentId}
            pendingMutationIds={pendingMutationIds}
            // A4 (issue #101) : chips -10/-20 HP sur les tâches en pénalité.
            missedDeadlineIds={missedDeadlineIds}
            overdueRestIds={overdueRestIds}
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

      {planningUnlocked && (
        <div ref={tomorrowSectionRef}>
          <TomorrowSection
            tasks={activeTomorrowTasks}
            timezone={profile.timezone}
            aggressivityLevel={level}
            voiceSeed={planningVoiceSeed}
            onAdd={handleAddTomorrow}
            onAddSubtask={handleAddTomorrowSubtask}
            onSetDeadline={handleSetTomorrowDeadline}
            onAnnihilate={handleAnnihilateTomorrow}
            onBringToToday={handleBringToToday}
            addingSubtaskParentId={addingTomorrowSubtaskParentId}
            isAdding={isAddingTomorrow}
            pendingMutationIds={pendingMutationIds}
          />
        </div>
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
