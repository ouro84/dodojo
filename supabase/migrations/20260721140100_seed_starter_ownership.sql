-- US-29 : le modèle « possession strictement en base » retire la gratuité
-- implicite du héros par défaut. Les profils existants équipés d'un héros sans
-- ligne de possession reçoivent une ligne offerte (price_paid=0), pour rester
-- cohérents (héros équipé = possédé).
insert into public.unlocked_heroes (user_id, hero_id, price_paid)
select p.id, p.equipped_hero_id, 0
from public.profiles p
where not exists (
  select 1 from public.unlocked_heroes u
  where u.user_id = p.id and u.hero_id = p.equipped_hero_id
)
on conflict (user_id, hero_id) do nothing;
