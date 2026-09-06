-- Issue #201 : rate limit autoritaire sur /api/mcp. Un compteur pose sur
-- oauth_tokens serait efface a chaque rotation de refresh token
-- (handleRefreshTokenGrant, app/oauth/token/route.ts, supprime puis recree la
-- ligne) - table separee, cle user_id, pour survivre a la rotation.
create table public.mcp_rate_limit (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count int not null default 0
);

alter table public.mcp_rate_limit enable row level security;
-- Aucune policy : ecriture/lecture exclusivement service-role (meme patron
-- que l'ecriture sur oauth_tokens), /api/mcp n'a jamais de cookie de session.

-- Fonction atomique : lit + incremente + reset de fenetre en un seul aller-
-- retour, evite la course lecture-puis-ecriture d'une implementation cote
-- application (deux requetes concurrentes liraient le meme compteur avant
-- que l'une des deux n'ecrive).
create or replace function public.consume_mcp_quota(
  p_user_id uuid,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_window_started_at timestamptz;
  v_request_count int;
  v_now timestamptz := now();
begin
  insert into public.mcp_rate_limit (user_id, window_started_at, request_count)
  values (p_user_id, v_now, 0)
  on conflict (user_id) do nothing;

  select window_started_at, request_count
    into v_window_started_at, v_request_count
    from public.mcp_rate_limit
    where user_id = p_user_id
    for update;

  if v_now - v_window_started_at > (p_window_seconds || ' seconds')::interval then
    v_window_started_at := v_now;
    v_request_count := 0;
  end if;

  if v_request_count >= p_limit then
    -- Persister un eventuel reset de fenetre meme si la requete est
    -- refusee, sinon une fenetre expiree ne redemarre jamais tant que
    -- personne ne passe sous la limite.
    update public.mcp_rate_limit
      set window_started_at = v_window_started_at, request_count = v_request_count
      where user_id = p_user_id;
    return false;
  end if;

  update public.mcp_rate_limit
    set window_started_at = v_window_started_at, request_count = v_request_count + 1
    where user_id = p_user_id;
  return true;
end;
$$;

-- IMPORTANT : nommer explicitement anon/authenticated ci-dessous, pas
-- seulement "from public". Sur un projet Supabase-hoste, les privileges par
-- defaut du bootstrap ("alter default privileges for role postgres in
-- schema public grant all on functions to postgres, anon, authenticated,
-- service_role") accordent a anon/authenticated un GRANT EXECUTE EXPLICITE
-- au moment du CREATE FUNCTION (les migrations s'appliquent en tant que
-- postgres, dans le schema public) - un simple "revoke ... from public" ne
-- touche que le GRANT PUBLIC implicite et laisse ces grants explicites
-- intacts, donc n'importe qui muni de la cle anon pourrait toujours appeler
-- ce RPC via PostgREST. Toute future fonction security definer (PR3/PR4) qui
-- copie ce bloc doit garder cette liste de roles explicite.
revoke execute on function public.consume_mcp_quota(uuid, int, int) from public, anon, authenticated;
grant execute on function public.consume_mcp_quota(uuid, int, int) to service_role;
