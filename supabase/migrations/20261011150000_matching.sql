-- Matching for the public brief form: experience level (set by the admin), years of experience
-- (set by the actor) and a markup that turns an actor's private minimum fee into a client price.
-- The public only ever gets yes/no answers ("fits the budget", "free that day"), never a price.

alter table public.actors
  add column level text check (level in ('jauns', 'pieredzējis', 'top')),
  add column experience_years integer check (experience_years between 0 and 60);
alter table public.troupes
  add column level text check (level in ('jauns', 'pieredzējis', 'top'));

create table public.app_settings (
  id boolean primary key default true check (id),
  client_markup_pct integer not null default 30 check (client_markup_pct between 0 and 300)
);
insert into public.app_settings default values;
alter table public.app_settings enable row level security;
create policy settings_admin on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Actors may not set their own level.
create or replace function public.guard_actor_update() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.troupe_id := old.troupe_id;
  new.sort_order := old.sort_order;
  new.slug := old.slug;
  new.level := old.level;
  if new.photo_path is distinct from old.photo_path and coalesce(new.photo_path, '') not like auth.uid()::text || '/%' then
    new.photo_path := old.photo_path;
  end if;
  -- an actor can only submit for review (draft -> pending) or pull back to draft
  if new.status not in ('draft', 'pending') or old.status in ('approved', 'hidden') then
    new.status := old.status;
  end if;
  -- edits to a live profile go live, but get flagged for the admin to look at
  if old.status = 'approved' and (new.full_name, new.stage_name, new.short_bio, new.quip, new.bio, new.photo_path, new.socials)
       is distinct from (old.full_name, old.stage_name, old.short_bio, old.quip, old.bio, old.photo_path, old.socials) then
    new.needs_review := true;
  else
    new.needs_review := old.needs_review;
  end if;
  return new;
end;
$$;

-- Collective admins may not set their collective's level either.
create or replace function public.guard_troupe_level() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not public.is_admin() then new.level := old.level; end if;
  return new;
end;
$$;
create trigger troupes_guard_level before update on public.troupes
  for each row execute function public.guard_troupe_level();

-- Suggestions for the brief form. p_budget is the whole event budget in EUR (null = no limit),
-- split evenly over p_people performers.
create function public.public_match(p_day date, p_budget integer, p_people integer, p_level text,
                                    p_skills text[], p_formats text[])
returns table (kind text, slug text, name text, photo_path text, level text, skills_hit integer,
               formats_hit integer, fits_budget boolean, available boolean, free_members integer, members integer)
language sql stable security definer set search_path = public, extensions as $$
  with s as (select client_markup_pct as m from public.app_settings limit 1),
  d as (select case when p_day >= current_date and p_day < current_date + 730 then p_day end as day),
  busy as (
    select actor_id from public.busy_dates, d where busy_dates.day = d.day
    union
    select actor_id from public.bookings, d where bookings.day = d.day and status <> 'cancelled'
  ),
  pub as (select * from public.actors where status = 'approved' and show_on_site and full_name <> '')
  select 'actor', a.slug, a.full_name, a.photo_path, a.level,
    (select count(*) from unnest(a.skills) x where x = any (coalesce(p_skills[1:20], '{}')))::integer,
    (select count(*) from unnest(a.formats) x where x = any (coalesce(p_formats[1:20], '{}')))::integer,
    case when p_budget is null or a.min_fee_eur is null then null
         else ceil(a.min_fee_eur * (100 + s.m) / 100.0) <= p_budget::numeric / greatest(coalesce(p_people, 1), 1) end,
    case when d.day is null then null else a.id not in (select actor_id from busy) end,
    null::integer, null::integer
  from pub a, s, d
  union all
  select 'troupe', t.slug, t.name, t.logo_path, t.level,
    (select count(distinct x) from pub m, unnest(m.skills) x where m.troupe_id = t.id and x = any (coalesce(p_skills[1:20], '{}')))::integer,
    (select count(distinct x) from pub m, unnest(m.formats) x where m.troupe_id = t.id and x = any (coalesce(p_formats[1:20], '{}')))::integer,
    null::boolean, null::boolean,
    case when d.day is null then null else (select count(*) from pub m where m.troupe_id = t.id and m.id not in (select actor_id from busy)) end::integer,
    (select count(*) from pub m where m.troupe_id = t.id)::integer
  from public.troupes t, d
  where t.show_on_site;
$$;
revoke execute on function public.public_match(date, integer, integer, text, text[], text[]) from public;
grant execute on function public.public_match(date, integer, integer, text, text[], text[]) to anon, authenticated;
