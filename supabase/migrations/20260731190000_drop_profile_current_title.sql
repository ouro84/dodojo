-- Issue #72 : current_title remplacé par equipped_title_code (résolu contre
-- le catalogue lib/achievements.ts) + title_manually_set. Tous les call-sites
-- (day.ts, tableau-de-chasse/page.tsx, Arena.tsx) migrés avant cette
-- migration (cf. Tasks 7 et 11 du plan issue #72).
alter table public.profiles drop column current_title;
