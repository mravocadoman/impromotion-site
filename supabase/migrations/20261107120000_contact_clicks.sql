-- WhatsApp, call and e-mail link clicks from the site, counted without cookies or personal data
-- (kind, page path, lead source tag). The Meta pixel gets a "Contact" event too, but only with
-- consent, so this table is the full count.
create table public.contact_clicks (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('whatsapp', 'call', 'email')),
  page text,
  source text
);
alter table public.contact_clicks enable row level security;
create policy contact_clicks_admin on public.contact_clicks for select to authenticated using (public.is_admin());

create function public.log_contact_click(p_kind text, p_page text default null, p_source text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.contact_clicks (kind, page, source)
  select p_kind, left(p_page, 200), left(p_source, 80)
  where p_kind in ('whatsapp', 'call', 'email');
$$;
revoke all on function public.log_contact_click(text, text, text) from public;
grant execute on function public.log_contact_click(text, text, text) to anon, authenticated;
