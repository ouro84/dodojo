import { calculateBossCurrentHp, dayKey, type HpTask } from "./game-engine";

export const REMINDER_HOUR = 17;
export const REMINDER_MINUTE = 30;
// Largeur totale de la fenêtre (±10 min autour de 17h30), calée sur la
// cadence du cron Inngest de fan-out (*/15, cf. reminder-fanout.ts) avec
// marge. Avec le fan-out, cette fenêtre EST le sélecteur des utilisateurs
// dus à chaque run — ne pas la réduire sans revoir la cadence du cron.
// Mode de défaillance : un retard de queue Inngest > 10 min fait sauter le
// rappel du jour pour les profils concernés (le lendemain repart normalement).
export const REMINDER_WINDOW_MINUTES = 20;

function localMinutesSinceMidnight(nowUtc: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(nowUtc);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

// Vrai si l'heure locale (fuseau IANA donné) tombe dans la fenêtre 17h30 ± 10 min.
export function isWithinReminderWindow(nowUtc: Date, timezone: string): boolean {
  const target = REMINDER_HOUR * 60 + REMINDER_MINUTE;
  const current = localMinutesSinceMidnight(nowUtc, timezone);
  return Math.abs(current - target) <= REMINDER_WINDOW_MINUTES / 2;
}

export interface ReminderCandidate {
  profileId: string;
  timezone: string;
  lastReminderSentOn: string | null;
  hasSubscription: boolean;
  todayTasks: HpTask[]; // tâches du jour LOCAL courant de ce profil
  dayResultExists: boolean; // ligne day_results pour (user_id, jour local courant)
}

// US-11 : les 5 conditions du design
// (docs/superpowers/specs/2026-07-22-us11-push-design.md).
export function isReminderEligible(candidate: ReminderCandidate, nowUtc: Date): boolean {
  if (!candidate.hasSubscription) return false; // (1) souscription
  if (!isWithinReminderWindow(nowUtc, candidate.timezone)) return false; // (2) fenêtre horaire
  const today = dayKey(nowUtc, candidate.timezone);
  if (candidate.lastReminderSentOn === today) return false; // (3) pas déjà envoyé aujourd'hui
  if (candidate.dayResultExists) return false; // (5) jour pas déjà clôturé
  return calculateBossCurrentHp(candidate.todayTasks) > 0; // (4) Boss encore vivant
}

export function selectReminderEligibleProfiles(
  candidates: ReminderCandidate[],
  nowUtc: Date,
): string[] {
  return candidates.filter((c) => isReminderEligible(c, nowUtc)).map((c) => c.profileId);
}
