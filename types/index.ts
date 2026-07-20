export interface Profile {
  id: string;
  username: string;
  level: number;
  xp: number;
  gold: number;
  current_title: string;
  streak_days: number;
  timezone: string;
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
  is_recurring: boolean;
  deadline_at: string | null;
  day_date: string;
  position: number;
  created_at: string;
}
