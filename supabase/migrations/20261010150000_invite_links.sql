-- Personal invite links: the admin doesn't need to know an actor's email. The link carries a secret
-- token; the actor opens it, types their own email, and that email becomes their invite.

create table public.invite_links (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  role text not null default 'actor' check (role in ('actor', 'admin')),
  actor_id uuid references public.actors (id) on delete cascade,
  troupe_id uuid references public.troupes (id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_email extensions.citext,
  claimed_at timestamptz
);

alter table public.invite_links enable row level security;
create policy invite_links_admin on public.invite_links for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- What the login page shows for a link: whose profile it is. Token-gated, nothing else.
create function public.invite_info(p_token text)
returns table (full_name text, stage_name text, claimed boolean)
language sql stable security definer set search_path = public, extensions as $$
  select a.full_name, a.stage_name, l.claimed_email is not null
  from public.invite_links l left join public.actors a on a.id = l.actor_id
  where l.token = p_token;
$$;

-- Turn a link into an invite for the email the actor typed. A link can be claimed by one email only.
create function public.claim_invite(p_token text, p_email text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  l public.invite_links;
  e extensions.citext := lower(trim(p_email));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return false;
  end if;
  select * into l from public.invite_links where token = p_token for update;
  if not found or (l.claimed_email is not null and l.claimed_email <> e) then
    return false;
  end if;
  insert into public.invites (email, role, actor_id, troupe_id)
  values (e, l.role, l.actor_id, l.troupe_id)
  on conflict (email) do update set actor_id = coalesce(public.invites.actor_id, excluded.actor_id);
  update public.invite_links set claimed_email = e, claimed_at = coalesce(claimed_at, now()) where token = p_token;
  return true;
end;
$$;

revoke execute on function public.invite_info(text), public.claim_invite(text, text) from public;
grant execute on function public.invite_info(text), public.claim_invite(text, text) to anon, authenticated;

-- One link for every seeded actor who doesn't have an account or invite yet.
insert into public.invite_links (actor_id, troupe_id)
select a.id, a.troupe_id from public.actors a
where a.user_id is null and not exists (select 1 from public.invites i where i.actor_id = a.id);
