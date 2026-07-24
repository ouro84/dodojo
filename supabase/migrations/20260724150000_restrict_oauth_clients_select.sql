-- Audit #67, PR5 : oauth_clients_select_all (using (true)) s'appliquait aussi
-- au role anon - n'importe qui disposant de la cle anon publique pouvait
-- lister tous les clients OAuth enregistres (client_id, client_name,
-- redirect_uris) sans etre connecte. Le QG (lib/oauth-gemini.ts) n'en a
-- besoin qu'en session authentifiee - restreint a ce role.
drop policy if exists "oauth_clients_select_all" on public.oauth_clients;

create policy "oauth_clients_select_authenticated"
  on public.oauth_clients for select
  to authenticated
  using (true);
