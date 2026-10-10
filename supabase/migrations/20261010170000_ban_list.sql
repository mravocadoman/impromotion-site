-- Ban list. A banned person can never be invited, claim an invite link, create an account or be
-- added back as an actor profile. Entries are matched by email and/or by full name.

create extension if not exists unaccent with schema extensions;

create table public.banned (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email extensions.citext unique,
  reason text,
  created_at timestamptz not null default now(),
  check (full_name is not null or email is not null)
);

alter table public.banned enable row level security;
create policy banned_admin on public.banned for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create function public.is_banned_email(p_email text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.banned where email = p_email::citext);
$$;

-- Name match ignores case, accents and extra spaces, so "Iluta  Reinberga" or "ILUTA REINBERGA" also match.
create function public.is_banned_name(p_name text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.banned b
    where b.full_name is not null
      and lower(regexp_replace(extensions.unaccent(b.full_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(extensions.unaccent(trim(coalesce(p_name, ''))), '\s+', ' ', 'g'))
  );
$$;


-- Actor profiles: no banned name, ever.
create function public.reject_banned_actor() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.is_banned_name(new.full_name) then
    raise exception 'banned';
  end if;
  return new;
end;
$$;

create trigger actors_no_banned
  before insert or update of full_name on public.actors
  for each row execute function public.reject_banned_actor();

-- Invites and sign-ups: no banned email, ever.
create function public.reject_banned_invite() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.is_banned_email(new.email) then
    raise exception 'banned';
  end if;
  return new;
end;
$$;

create trigger invites_no_banned
  before insert or update on public.invites
  for each row execute function public.reject_banned_invite();

create function public.reject_banned_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.is_banned_email(new.email) then
    raise exception 'not invited';
  end if;
  return new;
end;
$$;

create trigger auth_users_no_banned
  before insert on auth.users
  for each row execute function public.reject_banned_user();

revoke execute on function public.is_banned_email(text), public.is_banned_name(text) from public, anon, authenticated;

-- Iluta Reinberga: removed from the site and permanently banned (owner's decision, 2026-10-10).
insert into public.banned (full_name, reason) values ('Iluta Reinberga', 'Owner ban, 2026-10-10');
delete from public.actors where slug = 'iluta-reinberga';
