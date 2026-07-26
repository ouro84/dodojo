-- US-22 : serveur OAuth 2.1 + MCP pour Gemini (PKCE, enregistrement
-- dynamique RFC 7591). Trois tables, toutes avec policy DELETE AUTORISEE
-- (donnees techniques operationnelles - jetons/codes d'autorisation/clients
-- enregistres dynamiquement - PAS un historique de combat protege par
-- RG-04, cf. CLAUDE.md paragraphe Regles de code n4).

create table public.oauth_clients (
  client_id uuid primary key default gen_random_uuid(),
  -- Client PUBLIC par defaut (PKCE seul) : ce MVP n'emet jamais de secret,
  -- la colonne reste prete pour un futur client confidentiel.
  client_secret_hash text,
  client_name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table public.oauth_authorization_codes (
  code_hash text primary key,
  client_id uuid not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text not null default 'tasks:write',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index oauth_authorization_codes_expires_idx
  on public.oauth_authorization_codes (expires_at);

create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  refresh_token_hash text unique,
  client_id uuid not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  scope text not null default 'tasks:write',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index oauth_tokens_user_idx on public.oauth_tokens (user_id);
create index oauth_tokens_client_user_idx on public.oauth_tokens (client_id, user_id);

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_tokens enable row level security;

-- oauth_clients : lecture ouverte (metadonnees non secretes -
-- client_secret_hash reste toujours NULL dans ce MVP, clients publics
-- uniquement) pour permettre au Vestiaire (session utilisateur normale) de
-- retrouver un client par nom (lib/oauth-gemini.ts). Ecriture
-- (insert/update/delete) reservee au role service_role (route
-- /oauth/register), qui bypass RLS - donc aucune policy insert/update/delete
-- ici pour authenticated/anon.
create policy "oauth_clients_select_all"
  on public.oauth_clients for select
  using (true);

-- oauth_authorization_codes : un utilisateur connecte peut creer un code
-- lie a SON propre user_id (ecran de consentement /oauth/authorize, session
-- cookie) ; aucune policy select/update pour authenticated (l'echange du
-- code contre un token se fait exclusivement via service_role,
-- /oauth/token, qui bypass RLS).
create policy "oauth_authorization_codes_insert_own"
  on public.oauth_authorization_codes for insert
  with check (user_id = auth.uid());

-- oauth_tokens : un utilisateur connecte peut voir/revoquer SES propres
-- autorisations (statut + bouton Deconnecter au Vestiaire, session cookie) ; la
-- creation/rotation d'un token reste exclusivement service_role
-- (/oauth/token), aucune policy insert/update ici.
create policy "oauth_tokens_select_own"
  on public.oauth_tokens for select
  using (user_id = auth.uid());

create policy "oauth_tokens_delete_own"
  on public.oauth_tokens for delete
  using (user_id = auth.uid());
