-- A new inquiry with an e-mail address gets a reply draft (edge function inquiry-draft, same shared token
-- as polish-profile). Does nothing until the token is in the vault, and never blocks the insert.
create or replace function public.draft_inquiry_reply() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  token text := (select decrypted_secret from vault.decrypted_secrets where name = 'polish_token');
begin
  if token is null or coalesce(new.email, '') = '' then
    return new;
  end if;
  perform net.http_post(
    url := 'https://cflnjdiwipwkcnepunpd.supabase.co/functions/v1/inquiry-draft',
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-polish-token', token),
    timeout_milliseconds := 120000
  );
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.draft_inquiry_reply() from public, anon, authenticated;
create trigger inquiries_draft after insert on public.inquiries
  for each row execute function public.draft_inquiry_reply();
