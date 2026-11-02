-- A second "finish your profile" e-mail a week after the first, for anyone still a draft or off the site.
-- Two reminders in total, then we leave them alone.

alter table public.actors add column nudges smallint not null default 0;
update public.actors set nudges = 1 where nudged_at is not null;

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
    where a.status in ('draft', 'pending')
      and ((a.nudges = 0 and ap.created_at < now() - interval '1 day')
        or (a.nudges = 1 and a.nudged_at < now() - interval '7 days'))
      and (a.status = 'draft' or not public.actor_listed(a))
  loop
    perform net.http_post(
      url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
      body := jsonb_build_object('event', 'nudge', 'full_name', r.full_name, 'email', r.email, 'status', r.status,
        'claimed', r.claimed, 'missing', array_to_string(r.missing, ',')),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    update public.actors set nudged_at = now(), nudges = nudges + 1 where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.nudge_incomplete_profiles() from public, anon, authenticated;
