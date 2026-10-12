-- Fees can be per event or per hour. For scoring and budget matching an hourly fee counts as a
-- two-hour gig (most events are 1 to 2 hours).
alter table public.applications add column fee_unit text not null default 'event' check (fee_unit in ('event', 'hour'));
alter table public.actors add column fee_unit text not null default 'event' check (fee_unit in ('event', 'hour'));

drop function public.submit_application(text, text, text, text, text, integer, text[], text[], text[], text[], integer, text, text, boolean);
create function public.submit_application(
  p_full_name text, p_stage_name text, p_email text, p_phone text, p_troupes text, p_experience_years integer,
  p_skills text[], p_formats text[], p_languages text[], p_regions text[], p_min_fee_eur integer,
  p_links text, p_about text, p_consent boolean, p_fee_unit text default 'event'
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  clip_arr text[];
begin
  if not coalesce(p_consent, false) then return 'consent'; end if;
  if public.is_banned_name(p_full_name) or public.is_banned_email(p_email) then return 'ok'; end if;
  -- crude flood guard: at most 40 applications per hour across the whole site
  if (select count(*) from public.applications where created_at > now() - interval '1 hour') >= 40 then
    return 'busy';
  end if;
  insert into public.applications (full_name, stage_name, email, phone, troupes, experience_years, skills, formats,
    languages, regions, min_fee_eur, fee_unit, links, about, consent)
  values (trim(p_full_name), nullif(trim(p_stage_name), ''), lower(trim(p_email)), nullif(trim(p_phone), ''),
    nullif(trim(p_troupes), ''), p_experience_years,
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_skills, '{}')) x limit 20) s),
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_formats, '{}')) x limit 20) s),
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_languages, '{}')) x limit 10) s),
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_regions, '{}')) x limit 10) s),
    p_min_fee_eur, case when p_fee_unit = 'hour' then 'hour' else 'event' end, nullif(trim(p_links), ''), nullif(trim(p_about), ''), true);
  return 'ok';
exception
  when unique_violation then return 'duplicate';
  when check_violation then return 'invalid';
end;
$$;
revoke execute on function public.submit_application(text, text, text, text, text, integer, text[], text[], text[], text[], integer, text, text, boolean, text) from public;
grant execute on function public.submit_application(text, text, text, text, text, integer, text[], text[], text[], text[], integer, text, text, boolean, text) to anon, authenticated;

create or replace function public.score_application() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  s integer := 0;
  notes text[] := '{}';
  link_count integer := coalesce(array_length(regexp_split_to_array(coalesce(new.links, ''), 'https://'), 1), 1) - 1;
  about_len integer := char_length(coalesce(new.about, ''));
  fee integer := case when new.fee_unit = 'hour' then new.min_fee_eur * 2 else new.min_fee_eur end;
  unit text := case when new.fee_unit = 'hour' then ' €/h' else ' €' end;
  core text[] := array['Pasākumu vadīšana', 'Improvizācijas izrādes', 'Slēptās lomas', 'Animatora darbs'];
begin
  -- experience
  if new.experience_years >= 5 then s := s + 25; notes := array_append(notes, format('%s g. pieredze', new.experience_years));
  elsif new.experience_years >= 2 then s := s + 18; notes := array_append(notes, format('%s g. pieredze', new.experience_years));
  elsif new.experience_years = 1 then s := s + 10; notes := array_append(notes, 'tikai 1 g. pieredze');
  else notes := array_append(notes, 'pieredze nav norādīta vai 0');
  end if;
  -- belongs to a group
  if new.troupes is not null then s := s + 10; notes := array_append(notes, ('kolektīvs: ' || left(new.troupes, 60))); end if;
  -- something we can watch
  if link_count >= 2 then s := s + 20; notes := array_append(notes, format('%s saites', link_count));
  elsif link_count = 1 then s := s + 15; notes := array_append(notes, '1 saite');
  else notes := array_append(notes, 'nav saišu uz video vai profiliem');
  end if;
  -- wrote about themselves
  if about_len >= 200 then s := s + 15;
  elsif about_len >= 60 then s := s + 8;
  else notes := array_append(notes, 'gandrīz nekas nav uzrakstīts par sevi');
  end if;
  -- what they do
  if new.skills && core then s := s + 10; else notes := array_append(notes, 'nav galveno prasmju (vadīšana, izrādes, lomas, animatori)'); end if;
  if coalesce(array_length(new.skills, 1), 0) >= 3 then s := s + 5; end if;
  if new.languages && array['angļu', 'krievu'] then s := s + 5; notes := array_append(notes, ('valodas: ' || array_to_string(new.languages, ', '))); end if;
  if new.phone is not null then s := s + 5; end if;
  -- fee
  if new.min_fee_eur is null then notes := array_append(notes, 'honorārs nav norādīts');
  elsif fee <= 400 then s := s + 10; notes := array_append(notes, format('no %s%s', new.min_fee_eur, unit));
  elsif fee <= 800 then s := s + 5; notes := array_append(notes, format('no %s%s (dārgāk)', new.min_fee_eur, unit));
  else notes := array_append(notes, format('no %s%s (ļoti dārgi)', new.min_fee_eur, unit));
  end if;

  new.score := least(s, 100);
  new.score_notes := notes;
  new.verdict := case when new.score >= 60 then 'good' when new.score >= 35 then 'maybe' else 'weak' end;
  if new.verdict = 'weak' then
    new.status := 'rejected';
    new.auto_rejected := true;
  end if;
  return new;
end;
$$;

create or replace function public.notify_application() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
    body := jsonb_build_object('event', 'application', 'full_name', new.full_name, 'stage_name', new.stage_name,
      'troupes', new.troupes, 'skills', array_to_string(new.skills, ', '), 'formats', array_to_string(new.formats, ', '),
      'languages', array_to_string(new.languages, ', '), 'regions', array_to_string(new.regions, ', '),
      'experience_years', new.experience_years, 'min_fee_eur', new.min_fee_eur, 'fee_unit', new.fee_unit,
      'email', new.email::text, 'phone', new.phone, 'links', new.links, 'about', left(new.about, 400),
      'score', new.score, 'verdict', new.verdict, 'notes', array_to_string(new.score_notes, '; ')),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

create or replace function public.public_match(p_day date, p_budget integer, p_people integer, p_level text,
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
         else ceil(a.min_fee_eur * (case when a.fee_unit = 'hour' then 2 else 1 end) * (100 + s.m) / 100.0) <= p_budget::numeric / greatest(coalesce(p_people, 1), 1) end,
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
