export type AggressivityLevel = "doux" | "direct" | "brut";

export interface Profile {
  id: string;
  username: string;
  level: number;
  xp: number;
  gold: number;
  current_title: string;
  equipped_title_code: string | null;
  title_manually_set: boolean;
  streak_days: number;
  best_streak: number;
  timezone: string;
  aggressivity_level: AggressivityLevel;
  equipped_hero_id: string;
  equipped_skin_id: string | null;
  has_seen_tutorial: boolean;
  last_reminder_sent_on: string | null;
  webhook_token_hash: string | null;
  webhook_token_created_at: string | null;
  webhook_token_last_used_at: string | null;
  // Issue #115 : combo server-authoritative — cf. lib/game-engine.ts (nextComboState).
  combo_count: number;
  last_combo_completed_at: string | null;
  // Préparation issue #114 : défaut utilisateur (minutes avant deadline),
  // toujours renseigné (non nullable en base).
  reminder_offset_minutes: number;
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
  // Issue #101 (Axe A, by-pass spec A4-overdue) : timestamp posé au Report
  // d'un reste via Le Réveil. Persiste jusqu'à résolution (coche/rage quit)
  // pour porter la pénalité -20 "reste reporté". Nullable : une tâche normale
  // sans reste reporté n'a pas ce flag.
  deferred_at: string | null;
  // Issue #115 : XP réellement accordée à la complétion (inclut le bonus
  // combo). Nullable : jamais complétée, ou complétée avant cette colonne.
  xp_awarded: number | null;
  // Préparation issue #114 : override par tâche. null = hérite de
  // profiles.reminder_offset_minutes.
  reminder_offset_minutes: number | null;
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

// US-22 : serveur OAuth 2.1 + MCP pour Gemini. Client public par defaut
// (client_secret_hash reste null dans ce MVP, PKCE seul).
export interface OAuthClient {
  client_id: string;
  client_secret_hash: string | null;
  client_name: string;
  redirect_uris: string[];
  created_at: string;
}

export interface OAuthAuthorizationCode {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  expires_at: string;
  created_at: string;
}

export interface OAuthToken {
  id: string;
  access_token_hash: string;
  refresh_token_hash: string | null;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: string;
  created_at: string;
}

export interface Skin {
  id: string; // ex "water_priestess_ember"
  heroId: string; // ref Hero.id
  name: string;
  price: number; // 0 pour la tenue "default"
  isDefault: boolean;
  swatchColor: string; // hex, puce dans Le Marché Noir
}

export interface UnlockedSkin {
  id: string;
  user_id: string;
  hero_id: string;
  skin_id: string;
  price_paid: number;
  unlocked_at: string;
}

// US-11 : ligne brute de push_subscriptions. Distinct du sous-ensemble soumis
// par le client (endpoint + keys, sans id/created_at) — voir
// app/actions/push.ts (SerializedPushSubscription). Nom volontairement
// suffixé "Row" pour ne jamais entrer en collision avec le type global
// navigateur `PushSubscription` (lib.dom.d.ts) dans les fichiers qui
// importent les deux.
export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}
