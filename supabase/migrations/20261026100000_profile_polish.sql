-- New-talent quality: an incomplete profile stays off the site, the actor's photo is cut out for the
-- yellow-ring portrait and their texts get a typo pass (edge function polish-profile), and anyone
-- still incomplete a day after signing up gets one reminder e-mail (n8n, event "nudge").

alter table public.actors
  add column photo_original_path text,  -- the upload before the cut-out
  add column text_original jsonb,       -- short_bio/bio/quip as the actor first wrote them
  add column nudged_at timestamptz;     -- when the "finish your profile" e-mail went out

-- A new talent needs a photo and the card text before the homepage shows them. Approved profiles are
-- Impromotion's own call, so they are exempt.
create or replace function public.actor_listed(a public.actors) returns boolean
language sql stable set search_path = public, extensions as $$
  select a.status in ('approved', 'pending') and a.show_on_site and a.full_name <> ''
     and (a.status = 'approved' or (a.photo_path is not null and coalesce(trim(a.short_bio), '') <> ''));
$$;

create or replace function public.public_actors()
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
  where ok.v and a.slug = any (coalesce(p_actor_slugs[1:20], '{}')) and public.actor_listed(a)
  union all
  select 'troupe', t.slug, null::boolean,
         count(*) filter (where a.id not in (select actor_id from busy))::integer, count(a.id)::integer
  from public.troupes t, ok, public.actors a
  where ok.v and t.slug = any (coalesce(p_troupe_slugs[1:10], '{}')) and t.show_on_site
    and a.troupe_id = t.id and public.actor_listed(a)
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
                   where a.troupe_id = t.id and public.actor_listed(a)), '{}')
  from public.troupes t
  where t.show_on_site
  order by t.name;
$$;

-- Same guard as before, plus the three new columns that only Impromotion writes.
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
  new.photo_original_path := old.photo_original_path;
  new.text_original := old.text_original;
  new.nudged_at := old.nudged_at;
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

-- Hand the actor's own edits (and fresh sign-ups) to the edge function. Admin edits and the
-- function's own write-back (service role) are left alone, which also stops it looping.
create or replace function public.polish_actor() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  photo boolean := new.photo_path is not null and new.photo_path not like '%-cut.webp'
    and new.photo_path not like '/assets/%' and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path);
  txt boolean := case when tg_op = 'INSERT' then coalesce(new.short_bio, new.bio, new.quip) is not null
    else (new.short_bio, new.bio, new.quip) is distinct from (old.short_bio, old.bio, old.quip) end;
  token text := (select decrypted_secret from vault.decrypted_secrets where name = 'polish_token');
begin
  if token is null or public.is_admin() or coalesce(auth.role(), '') = 'service_role' or not (photo or txt) then
    return new;
  end if;
  perform net.http_post(
    url := 'https://cflnjdiwipwkcnepunpd.supabase.co/functions/v1/polish-profile',
    body := jsonb_build_object('id', new.id, 'photo', photo, 'text', txt),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-polish-token', token)
  );
  return new;
exception when others then
  return new;  -- polishing is a nicety; never let it block the actor's save
end;
$$;
create trigger actors_polish after insert or update on public.actors
  for each row execute function public.polish_actor();

-- One reminder per profile, a day after sign-up, while it is a draft or still off the site.
create or replace function public.nudge_incomplete_profiles() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select a.id, a.full_name, a.status, a.user_id is not null as claimed, ap.email::text as email,
           array_remove(array[case when a.photo_path is null then 'photo' end,
                              case when coalesce(trim(a.short_bio), '') = '' then 'short_bio' end], null) as missing
    from public.actors a
    join lateral (select email, created_at from public.applications
                  where actor_id = a.id order by created_at desc limit 1) ap on true
    where a.status in ('draft', 'pending') and a.nudged_at is null and ap.created_at < now() - interval '1 day'
      and (a.status = 'draft' or not public.actor_listed(a))
  loop
    perform net.http_post(
      url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
      body := jsonb_build_object('event', 'nudge', 'full_name', r.full_name, 'email', r.email, 'status', r.status,
        'claimed', r.claimed, 'missing', array_to_string(r.missing, ',')),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    update public.actors set nudged_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.nudge_incomplete_profiles() from public, anon, authenticated;
revoke execute on function public.polish_actor() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('nudge-incomplete-profiles', '15 * * * *', 'select public.nudge_incomplete_profiles()');
