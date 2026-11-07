-- A client inquiry still "jauns" 4 hours after it came in pings the Telegram group, then once a day
-- until someone moves it on. Hourly during the day only (06-19 UTC is 08-21 / 09-22 in Riga).

alter table public.inquiries add column stale_pinged_at timestamptz;

create or replace function public.ping_stale_inquiries() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, name, phone, email, event_type, event_date, date_text, guests, budget_label, source, created_at,
           draft_at is not null as has_draft
    from public.inquiries
    where status = 'jauns' and created_at < now() - interval '4 hours'
      and (stale_pinged_at is null or stale_pinged_at < now() - interval '23 hours')
  loop
    perform net.http_post(
      url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
      body := jsonb_build_object('event', 'inquiry_stale', 'full_name', r.name, 'phone', r.phone, 'email', r.email,
        'event_type', r.event_type, 'date', coalesce(r.event_date::text, r.date_text), 'guests', r.guests,
        'budget', r.budget_label, 'source', r.source, 'has_draft', r.has_draft,
        'hours', floor(extract(epoch from now() - r.created_at) / 3600)),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    update public.inquiries set stale_pinged_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.ping_stale_inquiries() from public, anon, authenticated;

select cron.schedule('ping-stale-inquiries', '20 6-19 * * *', 'select public.ping_stale_inquiries()');
