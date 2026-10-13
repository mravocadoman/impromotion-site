-- A second sign-up with the same email reuses the existing profile instead of creating a duplicate.
create or replace function public.submit_application(
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

  -- Someone who already has an account: leave it to the admin, never re-link an existing profile.
  if exists (select 1 from public.profiles where email = app.email) then return 'ok'; end if;

  -- Same email again (double submit, or applied twice): keep the profile they already have.
  select i.actor_id into a_id from public.invites i join public.actors x on x.id = i.actor_id where i.email = app.email;
  if a_id is not null then
    update public.applications set status = 'invited', actor_id = a_id where id = app.id;
    return 'joined';
  end if;

  -- Reuse a prepared hidden profile only when they came through that collective's link.
  if t_id is not null then
    select id into a_id from public.actors
    where troupe_id = t_id and user_id is null
      and lower(regexp_replace(extensions.unaccent(full_name), '\s+', ' ', 'g')) = norm
    limit 1;
  end if;
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
