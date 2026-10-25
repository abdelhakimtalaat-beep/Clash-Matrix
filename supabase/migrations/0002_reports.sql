-- Adds the entity kind "report" (imported Navisworks clash reports shown on the Reports tab).
-- Run once in the Supabase SQL editor. Safe to run twice.
alter table public.entities drop constraint if exists entities_kind_check;
alter table public.entities add constraint entities_kind_check
  check (kind in ('meta','naming','tolerances','matrix','dialect','profile','codeMapping','searchSet','clashTest','report'));
