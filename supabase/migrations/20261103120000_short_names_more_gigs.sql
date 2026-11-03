-- Public pages show actors as "Ginta R.": every word of the name but the last, plus the surname's initial.
-- Done in the RPCs, so the full surname never reaches anonymous visitors. Admin and CRM keep full names.
create or replace function public.short_name(n text) returns text
language sql immutable set search_path = public as $$
  select case when btrim(n) ~ '\s' then regexp_replace(btrim(n), '\s+(\S)\S*$', ' \1.') else btrim(n) end;
$$;

create or replace function public.public_actors()
returns table (
  slug text, full_name text, stage_name text, short_bio text, quip text, bio text, photo_path text,
  skills text[], formats text[], languages text[], regions text[], socials jsonb,
  troupe_name text, troupe_slug text, sort_order integer, vetted boolean
)
language sql stable security definer set search_path = public, extensions as $$
  select a.slug, public.short_name(a.full_name), a.stage_name, a.short_bio, a.quip, a.bio, a.photo_path,
         a.skills, a.formats, a.languages, a.regions, a.socials,
         t.name, t.slug, a.sort_order, a.status = 'approved'
  from public.actors a
  left join public.troupes t on t.id = a.troupe_id
  where public.actor_listed(a)
  order by a.status <> 'approved', a.sort_order, a.full_name;
$$;

create or replace function public.public_match(p_day date, p_budget integer, p_people integer, p_level text,
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
  pub as (select * from public.actors a where public.actor_listed(a))
  select 'actor', a.slug, public.short_name(a.full_name), a.photo_path, a.level,
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

create or replace function public.public_troupes()
returns table (
  slug text, name text, tagline text, description text, logo_path text, city text, founded_year integer,
  website text, socials jsonb, members text[]
)
language sql stable security definer set search_path = public, extensions as $$
  select t.slug, t.name, t.tagline, t.description, t.logo_path, t.city, t.founded_year, t.website, t.socials,
         coalesce((select array_agg(public.short_name(a.full_name) order by a.sort_order, a.full_name) from public.actors a
                   where a.troupe_id = t.id and public.actor_listed(a)), '{}')
  from public.troupes t
  where t.show_on_site
  order by t.name;
$$;

-- New gig options in the brief form: stand-up, music, toastmaster, dance.
create or replace function public.inquiry_candidates(p_id uuid)
returns table (actor_id uuid, name text, fee_eur integer, available boolean, skills_hit integer, vetted boolean, level text)
language sql stable security definer set search_path = public, extensions as $$
  with i as (select * from public.inquiries where id = p_id and (public.is_admin() or coalesce(auth.role(), '') = 'service_role')),
  want as (
    select distinct s from i, unnest(i.wants) w,
      jsonb_array_elements_text(coalesce(('{"pasākuma vadītājs":["Pasākumu vadīšana"],"animatori":["Animatora darbs"],'
        '"slēptās lomas":["Slēptās lomas"],"improvizācijas izrāde":["Improvizācijas izrādes"],'
        '"komandas treniņš":["Komandas treniņi","Apmācības"],"spēles un viktorīnas":["Viktorīnas","Sporta spēles"],"stand-up":["Stand-up"],'
        '"mūzika un dziesmas":["Dziedāšana","Mūzikas instruments"],"tostmeistars":["Tosti","Pasākumu vadīšana"],"dejas":["Dejas"]}')::jsonb -> w, '[]'::jsonb)) s
  ),
  busy as (
    select b.actor_id from public.busy_dates b, i where b.day = i.event_date
    union
    select k.actor_id from public.bookings k, i where k.day = i.event_date and k.status <> 'cancelled'
  )
  select a.id, a.full_name, (a.min_fee_eur * case when a.fee_unit = 'hour' then 2 else 1 end)::integer,
         case when i.event_date is null then null else a.id not in (select actor_id from busy) end,
         (select count(*) from unnest(a.skills) x where x in (select s from want))::integer,
         a.status = 'approved', a.level
  from public.actors a, i
  where public.actor_listed(a)
    and (not exists (select 1 from want) or a.skills && array(select s from want))
    and (i.level is distinct from 'top' or a.level = 'top')
  order by 4 desc nulls last, 5 desc, 6 desc, 3 nulls last
  limit 8;
$$;
