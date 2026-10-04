-- Issue #215 : une souscription rejetée 404/410 par le service push était
-- supprimée en silence, donc impossible à resynchroniser (rien ne permettait
-- de savoir qu'un appareil avait été abonné par CET utilisateur). On la
-- marque expirée à la place : les envois l'ignorent, et le client peut la
-- remplacer par une souscription fraîche au prochain chargement de l'Arène.
alter table public.push_subscriptions
  add column if not exists expired_at timestamptz;
