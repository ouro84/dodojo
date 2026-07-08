export interface Profile {
  id: string;
  username: string;
  level: number;
  xp: number;
  gold: number;
  current_title: string;
  streak_days: number;
  created_at: string;
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
