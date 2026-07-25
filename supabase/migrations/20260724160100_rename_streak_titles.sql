-- Renomme les titres de streak déjà persistés suite au reframe
-- "Démon Intérieur" (issue #51). "Novice" (défaut, non lié aux paliers de
-- streak) reste inchangé.
update public.profiles set current_title = 'Calme' where current_title = 'Ceinture Jaune';
update public.profiles set current_title = 'Silence' where current_title = 'Ceinture Noire';
update public.profiles set current_title = 'Esprit Vide' where current_title = 'Sensei';
