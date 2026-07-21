-- US-12 : record all-time de série (jours de victoire consécutifs). Cache
-- rafraîchi à la clôture ; source de vérité = day_results.
alter table public.profiles
  add column best_streak integer not null default 0;
