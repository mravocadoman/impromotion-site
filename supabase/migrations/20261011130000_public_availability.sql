-- Availability for the public brief form: is each chosen actor free on one date, and how many
-- public members of a chosen collective are free. Only yes/no or a count for that day, only for
-- profiles shown on the site, and only for dates from today up to two years ahead.
create function public.public_availability(p_day date, p_actor_slugs text[], p_troupe_slugs text[])
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
  where ok.v and a.slug = any (coalesce(p_actor_slugs[1:20], '{}')) and a.status = 'approved' and a.show_on_site
  union all
  select 'troupe', t.slug, null::boolean,
         count(*) filter (where a.id not in (select actor_id from busy))::integer, count(a.id)::integer
  from public.troupes t, ok, public.actors a
  where ok.v and t.slug = any (coalesce(p_troupe_slugs[1:10], '{}')) and t.show_on_site
    and a.troupe_id = t.id and a.status = 'approved' and a.show_on_site
  group by t.slug;
$$;

revoke execute on function public.public_availability(date, text[], text[]) from public;
grant execute on function public.public_availability(date, text[], text[]) to anon, authenticated;
