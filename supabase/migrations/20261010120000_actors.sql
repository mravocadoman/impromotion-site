-- Impromotion actors backend.
-- Roles: 'admin' (Rihards) sees and edits everything; 'actor' edits only their own profile and busy dates;
-- anyone else who signs in gets 'none' and can do nothing. The public site reads approved profiles
-- through public_actors(), which never returns private columns (phone, fee, notes).

create extension if not exists citext;

-- ---------- Tables ----------

create table public.troupes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text,
  website text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null,
  role text not null default 'none' check (role in ('none', 'actor', 'admin')),
  created_at timestamptz not null default now()
);

-- An actor profile can exist before its owner has an account (admin seeds it, the actor
-- claims it through an invite), so the login link is user_id, not the primary key.
create table public.actors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  troupe_id uuid references public.troupes (id) on delete set null,
  full_name text not null default '',
  stage_name text,
  slug text unique check (slug is null or slug ~ '^[a-z0-9-]+$'),
  short_bio text check (char_length(short_bio) <= 200),
  quip text check (char_length(quip) <= 60),
  bio text check (char_length(bio) <= 2000),
  photo_path text,
  skills text[] not null default '{}',
  formats text[] not null default '{}',
  languages text[] not null default '{}',
  regions text[] not null default '{}',
  socials jsonb not null default '{}',
  -- private: only the actor and admins can read these
  phone text,
  min_fee_eur integer check (min_fee_eur >= 0),
  -- consent: nothing is shown publicly or used in ads unless the actor says so
  show_on_site boolean not null default false,
  allow_ads boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'hidden')),
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

-- Admin-only notes live apart so an actor reading their own row never sees them.
create table public.actor_admin_notes (
  actor_id uuid primary key references public.actors (id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table public.busy_dates (
  actor_id uuid not null references public.actors (id) on delete cascade,
  day date not null,
  note text check (char_length(note) <= 200),
  primary key (actor_id, day)
);

create index busy_dates_day_idx on public.busy_dates (day);

create table public.invites (
  email citext primary key,
  role text not null default 'actor' check (role in ('actor', 'admin')),
  troupe_id uuid references public.troupes (id) on delete set null,
  actor_id uuid references public.actors (id) on delete cascade,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- ---------- Helpers ----------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.my_actor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.actors where user_id = auth.uid();
$$;

-- Lets the login page tell an invited address from a stranger before sending a link.
create function public.is_invited(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invites where email = p_email::citext)
      or exists (select 1 from public.profiles where email = p_email::citext and role <> 'none');
$$;

-- New auth user: create the profile, and the actor row if the address was invited as an actor.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites where email = new.email::citext;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, coalesce(inv.role, 'none'));
  if inv.actor_id is not null then
    update public.actors set user_id = new.id where id = inv.actor_id and user_id is null;
  elsif inv.role = 'actor' then
    insert into public.actors (user_id, troupe_id) values (new.id, inv.troupe_id);
  end if;
  if inv.email is not null then
    update public.invites set accepted_at = now() where email = inv.email;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Actors may edit their profile, but not approve themselves or move themselves around.
create function public.guard_actor_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if not public.is_admin() then
    new.id := old.id;
    new.user_id := old.user_id;
    new.troupe_id := old.troupe_id;
    new.sort_order := old.sort_order;
    -- an actor can only submit for review (draft -> pending) or pull back to draft
    if new.status not in ('draft', 'pending') or old.status in ('approved', 'hidden') then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger actors_guard
  before update on public.actors
  for each row execute function public.guard_actor_update();

-- Public, read-only view of approved profiles for the website. No private columns.
create function public.public_actors()
returns table (
  slug text, full_name text, stage_name text, short_bio text, quip text, bio text, photo_path text,
  skills text[], formats text[], languages text[], regions text[], socials jsonb,
  troupe_name text, troupe_slug text, sort_order integer
)
language sql stable security definer set search_path = public as $$
  select a.slug, a.full_name, a.stage_name, a.short_bio, a.quip, a.bio, a.photo_path,
         a.skills, a.formats, a.languages, a.regions, a.socials,
         t.name, t.slug, a.sort_order
  from public.actors a
  left join public.troupes t on t.id = a.troupe_id
  where a.status = 'approved' and a.show_on_site and a.full_name <> ''
  order by a.sort_order, a.full_name;
$$;

-- ---------- Row level security ----------

alter table public.troupes enable row level security;
alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.actors enable row level security;
alter table public.actor_admin_notes enable row level security;
alter table public.busy_dates enable row level security;

create policy troupes_read on public.troupes for select to authenticated using (true);
create policy troupes_admin on public.troupes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy invites_admin on public.invites for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy actors_read on public.actors for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy actors_update on public.actors for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy actors_admin_insert on public.actors for insert to authenticated with check (public.is_admin());
create policy actors_admin_delete on public.actors for delete to authenticated using (public.is_admin());

create policy notes_admin on public.actor_admin_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy busy_read on public.busy_dates for select to authenticated using (actor_id = public.my_actor_id() or public.is_admin());
create policy busy_write on public.busy_dates for all to authenticated using (actor_id = public.my_actor_id() or public.is_admin()) with check (actor_id = public.my_actor_id() or public.is_admin());

revoke all on function public.public_actors() from public;
grant execute on function public.public_actors() to anon, authenticated;
grant execute on function public.is_invited(text) to anon, authenticated;

-- ---------- Photos ----------
-- Public bucket (the site shows the photos), but each actor may only write inside their own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('actor-photos', 'actor-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'actor-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'actor-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'actor-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- Seed ----------

insert into public.troupes (name, slug, description)
values ('Impromotion', 'impromotion', 'Impromotion pamatkomanda');

insert into public.invites (email, role) values ('rihards.zeila@gmail.com', 'admin');
