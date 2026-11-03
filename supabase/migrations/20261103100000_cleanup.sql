-- Cleanup, 2026-11-03.
-- 1. The 17 collective members imported from public sources on 2026-10-10 as invite placeholders.
--    Only rows still untouched go: no account, photo, bio, bookings or busy dates. Their invite links
--    and admin notes cascade. A member who wants in later uses the collective's join link.
delete from public.actors a
where a.slug in ('marcis-vilums', 'kaspars-breidaks', 'dzintars-rozkalns', 'valdis-sils', 'margers-janis-majors',
    'dita-nitisa', 'anete-bendika', 'elina-geida', 'kaspars-silavs', 'luize-beca', 'annija-bronica', 'andrejs-silins',
    'sintija-sirsnina-garance', 'ritvars-krastins', 'armands-krastins', 'atis-degro', 'juris-kozlovskis')
  and a.user_id is null and a.status = 'draft' and a.photo_path is null and a.short_bio is null
  and not exists (select 1 from public.bookings b where b.actor_id = a.id)
  and not exists (select 1 from public.busy_dates d where d.actor_id = a.id);

-- 2. Inquiries the n8n retry saved twice: keep the first of each pair (same contact and date, minutes apart).
delete from public.inquiries x
using public.inquiries o
where o.created_at < x.created_at and x.created_at - o.created_at < interval '10 minutes'
  and coalesce(nullif(lower(o.email), ''), nullif(o.phone, ''), '') = coalesce(nullif(lower(x.email), ''), nullif(x.phone, ''), '') and coalesce(nullif(lower(x.email), ''), nullif(x.phone, ''), '') <> ''
  and o.event_date is not distinct from x.event_date;

-- 3. The same guard inside log_inquiry, so a retry or double submit returns the row it already saved.
create or replace function public.log_inquiry(p_key text, p jsonb) returns uuid
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
  select i.id into new_id from public.inquiries i
  where i.created_at > now() - interval '10 minutes'
    and coalesce(nullif(lower(i.email), ''), nullif(i.phone, ''), '') = coalesce(lower(nullif(p->>'email', '')), nullif(p->>'phone', ''), '-')
    and i.event_date is not distinct from (case when d ~ '^\d{4}-\d{2}-\d{2}$' then d::date end)
  order by i.created_at limit 1;
  if new_id is not null then
    return new_id;
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
