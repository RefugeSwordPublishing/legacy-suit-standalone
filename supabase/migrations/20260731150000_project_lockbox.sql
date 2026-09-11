-- Optional lockbox / gate code per project, shown in bold on the project card so crews can
-- get on site without hunting for it. Not required.
alter table public.projects add column if not exists lockbox_code text;
