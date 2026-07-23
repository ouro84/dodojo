-- US-03 : token webhook personnel (Siri/iOS Shortcuts) — jamais en clair en
-- base, seul son hash SHA-256 est stocké (lib/webhook-token.ts).
alter table public.profiles
  add column if not exists webhook_token_hash text,
  add column if not exists webhook_token_created_at timestamptz,
  add column if not exists webhook_token_last_used_at timestamptz;

-- Sécurité par défaut : deux tokens différents ne doivent jamais partager le
-- même hash (collision quasi impossible avec SHA-256/256 bits, mais gratuit
-- à garantir en base).
create unique index if not exists profiles_webhook_token_hash_idx
  on public.profiles (webhook_token_hash)
  where webhook_token_hash is not null;

-- Pas de nouvelle policy RLS : ces colonnes suivent profiles_select_own /
-- profiles_update_own (déjà en place, 20260708134344_init_schema.sql). La
-- route webhook (app/api/webhook/add-task) lit/écrit via le client
-- service-role, hors RLS (comme app/api/cron/push-reminders, US-11).
