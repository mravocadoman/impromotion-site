-- Two public tiers. "approved" = checked by Impromotion (vetted pros). "pending" = the actor published
-- their own profile and it is live straight away as a new, not-yet-checked talent. The admin still
-- gets a Telegram ping on every publish and can hide a profile in one click.

drop function public.public_actors();
create function public.public_actors()
returns table (
  slug text, full_name text, stage_name text, short_bio text, quip text, bio text, photo_path text,
  skills text[], formats text[], languages text[], regions text[], socials jsonb,
  troupe_name text, troupe_slug text, sort_order integer, vetted boolean
)
language sql stable security definer set search_path = public, extensions as $$
  select a.slug, a.full_name, a.stage_name, a.short_bio, a.quip, a.bio, a.photo_path,
         a.skills, a.formats, a.languages, a.regions, a.socials,
         t.name, t.slug, a.sort_order, a.status = 'approved'
  from public.actors a
  left join public.troupes t on t.id = a.troupe_id
  where a.status in ('approved', 'pending') and a.show_on_site and a.full_name <> ''
  order by a.status <> 'approved', a.sort_order, a.full_name;
$$;
revoke execute on function public.public_actors() from public;
grant execute on function public.public_actors() to anon, authenticated;

drop function public.public_match(date, integer, integer, text, text[], text[]);
create function public.public_match(p_day date, p_budget integer, p_people integer, p_level text,
                                    p_skills text[], p_formats text[])
returns table (kind text, slug text, name text, photo_path text, level text, skills_hit integer,
               formats_hit integer, fits_budget boolean, available boolean, free_members integer, members integer, vetted boolean)
language sql stable security definer set search_path = public, extensions as $$
  with s as (select client_markup_pct as m from public.app_settings limit 1),
  d as (select case when p_day >= current_date and p_day < current_date + 730 then p_day end as day),
  busy as (
    select actor_id from public.busy_dates, d where busy_dates.day = d.day
    union
    select actor_id from public.bookings, d where bookings.day = d.day and status <> 'cancelled'
  ),
  pub as (select * from public.actors where status in ('approved', 'pending') and show_on_site and full_name <> '')
  select 'actor', a.slug, a.full_name, a.photo_path, a.level,
    (select count(*) from unnest(a.skills) x where x = any (coalesce(p_skills[1:20], '{}')))::integer,
    (select count(*) from unnest(a.formats) x where x = any (coalesce(p_formats[1:20], '{}')))::integer,
    case when p_budget is null or a.min_fee_eur is null then null
         else ceil(a.min_fee_eur * (case when a.fee_unit = 'hour' then 2 else 1 end) * (100 + s.m) / 100.0) <= p_budget::numeric / greatest(coalesce(p_people, 1), 1) end,
    case when d.day is null then null else a.id not in (select actor_id from busy) end,
    null::integer, null::integer, a.status = 'approved'
  from pub a, s, d
  union all
  select 'troupe', t.slug, t.name, t.logo_path, t.level,
    (select count(distinct x) from pub m, unnest(m.skills) x where m.troupe_id = t.id and x = any (coalesce(p_skills[1:20], '{}')))::integer,
    (select count(distinct x) from pub m, unnest(m.formats) x where m.troupe_id = t.id and x = any (coalesce(p_formats[1:20], '{}')))::integer,
    null::boolean, null::boolean,
    case when d.day is null then null else (select count(*) from pub m where m.troupe_id = t.id and m.id not in (select actor_id from busy)) end::integer,
    (select count(*) from pub m where m.troupe_id = t.id)::integer, true
  from public.troupes t, d
  where t.show_on_site;
$$;
revoke execute on function public.public_match(date, integer, integer, text, text[], text[]) from public;
grant execute on function public.public_match(date, integer, integer, text, text[], text[]) to anon, authenticated;

create or replace function public.public_availability(p_day date, p_actor_slugs text[], p_troupe_slugs text[])
returns table (kind text, slug text, available boolean, free_members integer, members integer)
language sql stable security definer set search_path = public, extensions as $$
  with busy as (
    select actor_id from public.busy_dates where day = p_day
    union
    select actor_id from public.bookings where day = p_day and status <> 'cancelled'
  ),
  ok as (select p_day >= current_date and p_day < current_date + 730 as v)
  select 'actor', a.slug, a.id not in (select actor_id from busy), null::integer, null::integer
  from public.actors a, ok
  where ok.v and a.slug = any (coalesce(p_actor_slugs[1:20], '{}')) and a.status in ('approved', 'pending') and a.show_on_site
  union all
  select 'troupe', t.slug, null::boolean,
         count(*) filter (where a.id not in (select actor_id from busy))::integer, count(a.id)::integer
  from public.troupes t, ok, public.actors a
  where ok.v and t.slug = any (coalesce(p_troupe_slugs[1:10], '{}')) and t.show_on_site
    and a.troupe_id = t.id and a.status in ('approved', 'pending') and a.show_on_site
  group by t.slug;
$$;

create or replace function public.public_troupes()
returns table (
  slug text, name text, tagline text, description text, logo_path text, city text, founded_year integer,
  website text, socials jsonb, members text[]
)
language sql stable security definer set search_path = public, extensions as $$
  select t.slug, t.name, t.tagline, t.description, t.logo_path, t.city, t.founded_year, t.website, t.socials,
         coalesce((select array_agg(a.full_name order by a.sort_order, a.full_name) from public.actors a
                   where a.troupe_id = t.id and a.status in ('approved', 'pending') and a.show_on_site and a.full_name <> ''), '{}')
  from public.troupes t
  where t.show_on_site
  order by t.name;
$$;
