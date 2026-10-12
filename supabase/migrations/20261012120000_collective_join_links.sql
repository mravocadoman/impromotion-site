-- One reusable join link per collective. The collective shares it in its own group chat; each actor
-- fills in /pievienojies/?k=<token>, lands in that collective (reusing a prepared hidden profile with the
-- same name if there is one) and can log in at /aktieriem/ with the email they gave. No personal links.

create table public.troupe_join_links (
  troupe_id uuid primary key references public.troupes (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.troupe_join_links enable row level security;
create policy troupe_join_links_admin on public.troupe_join_links for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.troupe_join_links (troupe_id) select id from public.troupes on conflict do nothing;

create function public.troupe_join_link_create() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.troupe_join_links (troupe_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger troupes_join_link after insert on public.troupes
  for each row execute function public.troupe_join_link_create();
revoke execute on function public.troupe_join_link_create() from public, anon, authenticated;

alter table public.applications add column troupe_id uuid references public.troupes (id) on delete set null;

-- What the join page shows for a link: the collective's name and logo, nothing else.
create function public.troupe_join_info(p_token text)
returns table (name text, logo_path text)
language sql stable security definer set search_path = public, extensions as $$
  select t.name, t.logo_path from public.troupe_join_links l join public.troupes t on t.id = l.troupe_id
  where l.token = p_token and char_length(p_token) between 20 and 100;
$$;
revoke execute on function public.troupe_join_info(text) from public;
grant execute on function public.troupe_join_info(text) to anon, authenticated;

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
  -- people who join through a collective's link are vouched for by the collective: never auto-reject
  if new.verdict = 'weak' and new.troupe_id is null then
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
      'experience_years', new.experience_years, 'min_fee_eur', new.min_fee_eur, 'fee_unit', new.fee_unit, 'joined', new.troupe_id is not null,
      'email', new.email::text, 'phone', new.phone, 'links', new.links, 'about', left(new.about, 400),
      'score', new.score, 'verdict', new.verdict, 'notes', array_to_string(new.score_notes, '; ')),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

drop function public.submit_application(text, text, text, text, text, integer, text[], text[], text[], text[], integer, text, text, boolean, text);
create function public.submit_application(
  p_full_name text, p_stage_name text, p_email text, p_phone text, p_troupes text, p_experience_years integer,
  p_skills text[], p_formats text[], p_languages text[], p_regions text[], p_min_fee_eur integer,
  p_links text, p_about text, p_consent boolean, p_fee_unit text default 'event', p_join_token text default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  t_id uuid;
  t_name text;
  app public.applications;
  a_id uuid;
  norm text := lower(regexp_replace(extensions.unaccent(trim(coalesce(p_full_name, ''))), '\s+', ' ', 'g'));
begin
  if not coalesce(p_consent, false) then return 'consent'; end if;
  if public.is_banned_name(p_full_name) or public.is_banned_email(p_email) then return 'ok'; end if;
  if (select count(*) from public.applications where created_at > now() - interval '1 hour') >= 40 then
    return 'busy';
  end if;
  if p_join_token is not null then
    select l.troupe_id, t.name into t_id, t_name
    from public.troupe_join_links l join public.troupes t on t.id = l.troupe_id where l.token = p_join_token;
    if t_id is null then return 'badlink'; end if;
  end if;

  insert into public.applications (full_name, stage_name, email, phone, troupes, troupe_id, experience_years, skills, formats,
    languages, regions, min_fee_eur, fee_unit, links, about, consent)
  values (trim(p_full_name), nullif(trim(p_stage_name), ''), lower(trim(p_email)), nullif(trim(p_phone), ''),
    coalesce(t_name, nullif(trim(p_troupes), '')), t_id, p_experience_years,
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_skills, '{}')) x limit 20) s),
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_formats, '{}')) x limit 20) s),
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_languages, '{}')) x limit 10) s),
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_regions, '{}')) x limit 10) s),
    p_min_fee_eur, case when p_fee_unit = 'hour' then 'hour' else 'event' end,
    nullif(trim(p_links), ''), nullif(trim(p_about), ''), true)
  returning * into app;

  if t_id is null then return 'ok'; end if;
  -- Someone who already has an account: leave it to the admin, never re-link an existing profile.
  if exists (select 1 from public.profiles where email = app.email) then return 'ok'; end if;

  select id into a_id from public.actors
  where troupe_id = t_id and user_id is null
    and lower(regexp_replace(extensions.unaccent(full_name), '\s+', ' ', 'g')) = norm
  limit 1;
  if a_id is null then
    insert into public.actors (full_name, stage_name, troupe_id, phone, experience_years, skills, formats, languages, regions,
      min_fee_eur, fee_unit, bio, status, show_on_site)
    values (app.full_name, app.stage_name, t_id, app.phone, app.experience_years, app.skills, app.formats, app.languages,
      app.regions, app.min_fee_eur, app.fee_unit, app.about, 'draft', false)
    returning id into a_id;
  else
    update public.actors set
      stage_name = coalesce(stage_name, app.stage_name), phone = coalesce(phone, app.phone),
      experience_years = coalesce(experience_years, app.experience_years),
      skills = case when skills = '{}' then app.skills else skills end,
      formats = case when formats = '{}' then app.formats else formats end,
      languages = case when languages = '{}' then app.languages else languages end,
      regions = case when regions = '{}' then app.regions else regions end,
      min_fee_eur = coalesce(min_fee_eur, app.min_fee_eur),
      fee_unit = case when min_fee_eur is null then app.fee_unit else fee_unit end,
      bio = coalesce(bio, app.about)
    where id = a_id;
  end if;

  insert into public.invites (email, role, troupe_id, actor_id) values (app.email, 'actor', t_id, a_id)
  on conflict (email) do nothing;
  update public.applications set status = 'invited', actor_id = a_id where id = app.id;
  return 'joined';
exception
  when unique_violation then return 'duplicate';
  when check_violation then return 'invalid';
end;
$$;
revoke execute on function public.submit_application(text, text, text, text, text, integer, text[], text[], text[], text[], integer, text, text, boolean, text, text) from public;
grant execute on function public.submit_application(text, text, text, text, text, integer, text[], text[], text[], text[], integer, text, text, boolean, text, text) to anon, authenticated;
