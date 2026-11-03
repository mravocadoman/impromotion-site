-- The CRM's cast: an admin assigns actors to an inquiry, which creates their bookings (inquiry_id).
-- The inquiry's status then drives those bookings:
--   apstiprināts -> bookings confirmed, each actor gets the details by e-mail (n8n, event booking_confirmed)
--   notika       -> bookings done, and a new talent who played becomes approved (the main grid)
--   atteikts     -> bookings cancelled
-- A new event date moves the open bookings with it.

alter table public.bookings add column inquiry_id uuid references public.inquiries (id) on delete set null;
create index bookings_inquiry_idx on public.bookings (inquiry_id);

-- A booking added to an already confirmed inquiry is confirmed straight away.
create or replace function public.booking_from_inquiry() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.inquiry_id is not null and new.status = 'tentative'
     and exists (select 1 from public.inquiries where id = new.inquiry_id and status = 'apstiprināts') then
    new.status := 'confirmed';
  end if;
  return new;
end;
$$;
create trigger bookings_from_inquiry before insert on public.bookings
  for each row execute function public.booking_from_inquiry();

-- Every inquiry booking that becomes confirmed tells its actor once.
create or replace function public.notify_booking_confirmed() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  a public.actors;
  q public.inquiries;
  mail text;
begin
  if new.inquiry_id is null or new.status <> 'confirmed'
     or (tg_op = 'UPDATE' and old.status = 'confirmed' and old.day = new.day) then
    return new;
  end if;
  select * into a from public.actors where id = new.actor_id;
  select * into q from public.inquiries where id = new.inquiry_id;
  mail := coalesce((select email::text from auth.users where id = a.user_id),
                   (select email::text from public.applications where actor_id = a.id order by created_at desc limit 1));
  perform net.http_post(
    url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
    body := jsonb_build_object('event', 'booking_confirmed', 'full_name', a.full_name, 'email', mail,
      'date', new.day, 'moved', tg_op = 'UPDATE' and old.status = 'confirmed',
      'event_type', q.event_type, 'guests', q.guests, 'location', new.location, 'fee_eur', new.actor_fee_eur,
      'cast', (select string_agg(x.full_name, ', ' order by x.full_name) from public.bookings b
               join public.actors x on x.id = b.actor_id
               where b.inquiry_id = new.inquiry_id and b.status = 'confirmed' and b.actor_id <> new.actor_id)),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;  -- a failed ping must never block the booking
end;
$$;
create trigger bookings_notify_confirmed after insert or update of status, day on public.bookings
  for each row execute function public.notify_booking_confirmed();

create or replace function public.inquiry_drives_bookings() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.event_date is distinct from old.event_date and new.event_date is not null then
    update public.bookings set day = new.event_date
    where inquiry_id = new.id and status in ('tentative', 'confirmed');
  end if;
  if new.status is distinct from old.status then
    if new.status = 'apstiprināts' then
      update public.bookings set status = 'confirmed' where inquiry_id = new.id and status = 'tentative';
    elsif new.status = 'notika' then
      update public.bookings set status = 'done' where inquiry_id = new.id and status = 'confirmed';
      update public.actors set status = 'approved'
      where status = 'pending' and id in (select actor_id from public.bookings where inquiry_id = new.id and status = 'done');
    elsif new.status = 'atteikts' then
      update public.bookings set status = 'cancelled' where inquiry_id = new.id and status in ('tentative', 'confirmed');
    end if;
  end if;
  return new;
end;
$$;
create trigger inquiries_drive_bookings after update of status, event_date on public.inquiries
  for each row execute function public.inquiry_drives_bookings();

revoke execute on function public.booking_from_inquiry(), public.notify_booking_confirmed(), public.inquiry_drives_bookings()
  from public, anon, authenticated;

-- Candidates: the inquiry's own cast first and never "busy" because of this very inquiry.
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
      and k.inquiry_id is distinct from p_id
  ),
  cast_ as (select actor_id from public.bookings where inquiry_id = p_id and status <> 'cancelled')
  select a.id, a.full_name, (a.min_fee_eur * case when a.fee_unit = 'hour' then 2 else 1 end)::integer,
         case when i.event_date is null then null else a.id not in (select actor_id from busy) end,
         (select count(*) from unnest(a.skills) x where x in (select s from want))::integer,
         a.status = 'approved', a.level
  from public.actors a, i
  where a.id in (select actor_id from cast_)
     or (public.actor_listed(a)
         and (not exists (select 1 from want) or a.skills && array(select s from want))
         and (i.level is distinct from 'top' or a.level = 'top'))
  order by a.id in (select actor_id from cast_) desc, 4 desc nulls last, 5 desc, 6 desc, 3 nulls last
  limit 8;
$$;

