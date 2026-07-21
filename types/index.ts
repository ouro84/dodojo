export interface Profile {
  id: string;
  username: string;
  level: number;
  xp: number;
  gold: number;
  current_title: string;
  streak_days: number;
  best_streak: number;
  timezone: string;
  equipped_hero_id: string;
  created_at: string;
}

export type DayOutcome = "victory" | "retreat" | "defeat";

export interface DayResult {
  id: string;
  user_id: string;
  day_date: string;
  outcome: DayOutcome;
  damage_dealt: number;
  boss_max_hp: number;
  tasks_completed: number;
  tasks_abandoned: number;
  xp_earned: number;
  gold_earned: number;
  closed_manually: boolean;
  closed_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  is_completed: boolean;
  is_abandoned: boolean;
  abandon_reason: "rage_quit" | "annihilated" | null;
  is_recurring: boolean;
  recurring_template_id: string | null;
  deadline_at: string | null;
  day_date: string;
  position: number;
  created_at: string;
}

export interface RecurringTemplate {
  id: string;
  user_id: string;
  title: string;
  weekdays: number[]; // 0..6, lundi=0, semaine locale
  is_active: boolean;
  position: number;
  created_at: string;
}

export interface Hero {
  id: string; // id logique/base, ex. "fire_knight"
  name: string;
  element: string;
  slug: string; // segment de chemin public, ex. "fire-knight"
  idleFramePrefix: string; // ex. "/sprites/mc/fire-knight/idle/frame"
  idleFrameCount: number;
  price: number; // 0 pour le héros par défaut
  isDefault: boolean;
}

export interface UnlockedHero {
  id: string;
  user_id: string;
  hero_id: string;
  price_paid: number;
  unlocked_at: string;
}
