-- Client inquiries from the site form as a small CRM. n8n still receives the form, then logs it here
-- with log_inquiry() and asks the inquiry-draft edge function for a reply, which lands in Gmail as a
-- draft. Admin sees the pipeline with the actors who could do each event and a rough revenue figure.

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text, email text, phone text,
  event_type text, wants text[] not null default '{}',
  event_date date, date_text text, guests integer, people text,
  budget_eur integer,     -- top of the chosen budget band ("vairāk par 2000 €" counts as 2000)
  budget_label text, level text check (level in ('jauns', 'pieredzējis', 'top')),
  shortlist text, message text, page text, source text,
  status text not null default 'jauns'
    check (status in ('jauns', 'sazināts', 'piedāvājums', 'apstiprināts', 'notika', 'atteikts')),
  price_eur integer,      -- agreed with the client
  cost_eur integer,       -- paid to the performers
  notes text,
  draft_subject text, draft_text text, draft_at timestamptz
);
alter table public.inquiries enable row level security;
create policy inquiries_admin on public.inquiries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger inquiries_touch before update on public.inquiries
  for each row execute function public.touch_updated_at();

-- Called by n8n with the raw form body. The key lives only in n8n, so the public anon key alone can't write.
create function public.log_inquiry(p_key text, p jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  new_id uuid;
  d text := coalesce(p->>'date_iso', '');
begin
  if p_key is distinct from 'imp-crm-2026' then
    raise exception 'bad key';
  end if;
  -- older site versions send only "dd.mm.yyyy"
  if d !~ '^\d{4}-\d{2}-\d{2}$' and coalesce(p->>'date', '') ~ '^\d{2}\.\d{2}\.\d{4}$' then
    d := substr(p->>'date', 7, 4) || '-' || substr(p->>'date', 4, 2) || '-' || substr(p->>'date', 1, 2);
  end if;
  insert into public.inquiries (name, email, phone, event_type, wants, event_date, date_text, guests, people,
    budget_eur, budget_label, level, shortlist, message, page, source)
  values (left(p->>'name', 100), left(p->>'email', 254), left(p->>'phone', 40), left(p->>'type', 60),
    coalesce((select array_agg(left(x, 40)) from jsonb_array_elements_text(
      case when jsonb_typeof(p->'wants') = 'array' then p->'wants' else '[]'::jsonb end) x), '{}'),
    case when d ~ '^\d{4}-\d{2}-\d{2}$' then d::date end,
    left(p->>'date', 20),
    nullif(substring(coalesce(p->>'guests', '') from '^\d{1,4}'), '')::integer,
    left(p->>'people', 10),
    coalesce(case when p->>'budget_eur' ~ '^\d{1,6}$' then least((p->>'budget_eur')::integer, 2000) end,
             (select max(m[1]::integer) from regexp_matches(coalesce(p->>'budget', ''), '(\d{3,5})', 'g') m)),
    left(p->>'budget', 30),
    case when p->>'level_key' in ('jauns', 'pieredzējis', 'top') then p->>'level_key'
         when p->>'level' ilike 'jauns%' then 'jauns' when p->>'level' ilike 'pieredz%' then 'pieredzējis'
         when p->>'level' ilike 'top%' then 'top' end,
    left(p->>'actor', 600), left(p->>'message', 3000), left(p->>'page', 300), left(p->>'source', 80))
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.log_inquiry(text, jsonb) from public;
grant execute on function public.log_inquiry(text, jsonb) to anon, authenticated;

-- Listed actors who fit the inquiry: right skills, free that day (when a date is known), best first.
create function public.inquiry_candidates(p_id uuid)
returns table (actor_id uuid, name text, fee_eur integer, available boolean, skills_hit integer, vetted boolean, level text)
language sql stable security definer set search_path = public, extensions as $$
  with i as (select * from public.inquiries where id = p_id and (public.is_admin() or coalesce(auth.role(), '') = 'service_role')),
  want as (
    select distinct s from i, unnest(i.wants) w,
      jsonb_array_elements_text(coalesce(('{"pasākuma vadītājs":["Pasākumu vadīšana"],"animatori":["Animatora darbs"],'
        '"slēptās lomas":["Slēptās lomas"],"improvizācijas izrāde":["Improvizācijas izrādes"],'
        '"komandas treniņš":["Komandas treniņi","Apmācības"],"spēles un viktorīnas":["Viktorīnas","Sporta spēles"]}')::jsonb -> w, '[]'::jsonb)) s
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
revoke execute on function public.inquiry_candidates(uuid) from public, anon;
grant execute on function public.inquiry_candidates(uuid) to authenticated, service_role;
