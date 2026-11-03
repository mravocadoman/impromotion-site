-- Automatic review for self-published talents. The level follows the experience the actor gave
-- (under 3 years "jauns", else "pieredzējis") until an admin picks one by hand; "top" stays an admin call.
-- Approved profiles are Impromotion's own team and are never touched.
alter table public.actors add column level_auto boolean not null default false;

create or replace function public.auto_level() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_admin() then
    new.level_auto := old.level_auto;  -- actors can't switch the automatic level back on
  end if;
  if tg_op = 'UPDATE' and public.is_admin() and new.level is distinct from old.level then
    new.level_auto := false;  -- an admin's choice wins from now on
  elsif new.status <> 'approved' and (new.level is null or new.level_auto) then
    new.level := case when coalesce(new.experience_years, 0) >= 3 then 'pieredzējis' else 'jauns' end;
    new.level_auto := true;
  end if;
  return new;
end;
$$;
-- Named to sort after actors_guard, which resets the level on an actor's own edit.
create trigger actors_level_auto before insert or update on public.actors
  for each row execute function public.auto_level();

-- Listed on the homepage once the card has a photo, a short text and at least one skill.
create or replace function public.actor_listed(a public.actors) returns boolean
language sql stable set search_path = public, extensions as $$
  select a.status in ('approved', 'pending') and a.show_on_site and a.full_name <> ''
     and (a.status = 'approved' or (a.photo_path is not null and coalesce(trim(a.short_bio), '') <> ''
                                    and cardinality(a.skills) > 0));
$$;

-- Backfill: every non-approved profile without a hand-picked level.
update public.actors set level = null where status <> 'approved' and level is null;
