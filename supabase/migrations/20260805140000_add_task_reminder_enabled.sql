alter table tasks
  add column reminder_enabled boolean not null default true;

comment on column tasks.reminder_enabled is
  'Issue #114 : désactive la notif de rappel pour cette tâche précise, indépendamment de reminder_offset_minutes.';
