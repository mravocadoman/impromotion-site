-- Applications from improvisers who want to join (public form at /pievienojies/).
-- Anyone may submit through submit_application(); only the admin can read them. Banned people are
-- accepted silently and never stored, so the form doesn't reveal the ban.

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null check (char_length(full_name) between 2 and 80),
  stage_name text check (char_length(stage_name) <= 40),
  email extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (char_length(phone) <= 40),
  troupes text check (char_length(troupes) <= 200),
  experience_years integer check (experience_years between 0 and 60),
  skills text[] not null default '{}',
  formats text[] not null default '{}',
  languages text[] not null default '{}',
  regions text[] not null default '{}',
  min_fee_eur integer check (min_fee_eur >= 0 and min_fee_eur <= 100000),
  links text check (char_length(links) <= 600),
  about text check (char_length(about) <= 1500),
  consent boolean not null check (consent),
  status text not null default 'new' check (status in ('new', 'invited', 'rejected')),
  admin_note text,
  actor_id uuid references public.actors (id) on delete set null
);

-- One open application per email at a time.
create unique index applications_one_open_per_email on public.applications (email) where status = 'new';

alter table public.applications enable row level security;
create policy applications_admin on public.applications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create function public.submit_application(
  p_full_name text, p_stage_name text, p_email text, p_phone text, p_troupes text, p_experience_years integer,
  p_skills text[], p_formats text[], p_languages text[], p_regions text[], p_min_fee_eur integer,
  p_links text, p_about text, p_consent boolean
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
    languages, regions, min_fee_eur, links, about, consent)
  values (trim(p_full_name), nullif(trim(p_stage_name), ''), lower(trim(p_email)), nullif(trim(p_phone), ''),
    nullif(trim(p_troupes), ''), p_experience_years,
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_skills, '{}')) x limit 20) s),
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_formats, '{}')) x limit 20) s),
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_languages, '{}')) x limit 10) s),
    (select coalesce(array_agg(left(x, 40)), '{}') from (select x from unnest(coalesce(p_regions, '{}')) x limit 10) s),
    p_min_fee_eur, nullif(trim(p_links), ''), nullif(trim(p_about), ''), true);
  return 'ok';
exception
  when unique_violation then return 'duplicate';
  when check_violation then return 'invalid';
end;
$$;

revoke execute on function public.submit_application(text, text, text, text, text, integer, text[], text[], text[], text[], integer, text, text, boolean) from public;
grant execute on function public.submit_application(text, text, text, text, text, integer, text[], text[], text[], text[], integer, text, text, boolean) to anon, authenticated;

-- Telegram ping for each new application (same n8n webhook as profile reviews).
create function public.notify_application() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
    body := jsonb_build_object('event', 'application', 'full_name', new.full_name, 'stage_name', new.stage_name,
      'troupes', new.troupes, 'skills', array_to_string(new.skills, ', '), 'min_fee_eur', new.min_fee_eur),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

create trigger applications_notify
  after insert on public.applications
  for each row execute function public.notify_application();

revoke execute on function public.notify_application() from public, anon, authenticated;
