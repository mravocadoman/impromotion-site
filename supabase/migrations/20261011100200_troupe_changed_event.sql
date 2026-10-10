-- Collective profile edits get their own Telegram message instead of borrowing the actor "changed" event.
create or replace function public.notify_troupe_review() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.needs_review and not old.needs_review then
    perform net.http_post(
      url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
      body := jsonb_build_object('event', 'troupe_changed', 'name', new.name),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;
