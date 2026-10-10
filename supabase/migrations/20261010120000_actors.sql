-- Impromotion actors backend.
-- Roles: 'admin' (Rihards) sees and edits everything; 'actor' edits only their own profile and busy days.
-- Only invited addresses can create an account at all. The public site reads approved profiles through
-- public_actors(), which never returns private columns (phone, fee, notes) and never bookings.

create extension if not exists citext with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------- Tables ----------

create table public.troupes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext not null unique,
  role text not null default 'actor' check (role in ('actor', 'admin')),
  created_at timestamptz not null default now()
);

-- An actor profile can exist before its owner has an account (admin seeds it, the actor claims it
-- through an invite), so the login link is user_id, not the primary key.
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
  -- only https links, so nothing like javascript: can reach the public page
  socials jsonb not null default '{}' check (jsonb_typeof(socials) = 'object' and not jsonb_path_exists(socials, '$.* ? (!(@ like_regex "^https://[^ <>\"]+$"))')),
  -- private: only the actor and admins can read these
  phone text,
  min_fee_eur integer check (min_fee_eur >= 0),
  -- consent: nothing is shown publicly or used in ads unless the actor says so
  show_on_site boolean not null default false,
  allow_ads boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'hidden')),
  needs_review boolean not null default false,
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
  primary key (actor_id, day)
);

-- A gig the agency sold. The actor sees their own gigs and fee (my_bookings), never the client or price.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.actors (id) on delete cascade,
  day date not null,
  title text not null check (char_length(title) <= 120),
  location text check (char_length(location) <= 200),
  details text check (char_length(details) <= 2000),
  status text not null default 'tentative' check (status in ('tentative', 'confirmed', 'done', 'cancelled')),
  actor_fee_eur integer check (actor_fee_eur >= 0),
  client text check (char_length(client) <= 200),
  client_price_eur integer check (client_price_eur >= 0),
  created_at timestamptz not null default now()
);

create index busy_dates_day_idx on public.busy_dates (day);
create index bookings_day_idx on public.bookings (day);

create table public.invites (
  email extensions.citext primary key,
  role text not null default 'actor' check (role in ('actor', 'admin')),
  troupe_id uuid references public.troupes (id) on delete set null,
  actor_id uuid references public.actors (id) on delete cascade,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- ---------- Helpers ----------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.is_member() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create function public.my_actor_id() returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select id from public.actors where user_id = auth.uid();
$$;

-- Apply an invite to an account: role (never demoting an admin) and the actor profile.
create function public.apply_invite(p_user uuid, p_email extensions.citext, p_role text, p_troupe uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.profiles
     set role = case when role = 'admin' or p_role = 'admin' then 'admin' else 'actor' end
   where id = p_user;
  if p_actor is not null then
    update public.actors set user_id = p_user where id = p_actor and user_id is null;
  elsif p_role = 'actor' and not exists (select 1 from public.actors where user_id = p_user) then
    insert into public.actors (user_id, troupe_id) values (p_user, p_troupe);
  end if;
end;
$$;

-- New auth user: only invited addresses may sign up at all.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites where email = new.email::citext;
  if inv.email is null then
    raise exception 'not invited';
  end if;
  insert into public.profiles (id, email, role) values (new.id, new.email, 'actor');
  perform public.apply_invite(new.id, inv.email, inv.role, inv.troupe_id, inv.actor_id);
  update public.invites set accepted_at = now() where email = inv.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- An invite for someone who already has an account takes effect straight away.
create function public.handle_invite() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid;
begin
  if tg_op = 'UPDATE' and old.role = 'admin' then
    new.role := 'admin';  -- re-inviting an admin as an actor must not demote them
  end if;
  select id into uid from public.profiles where email = new.email;
  if uid is not null then
    perform public.apply_invite(uid, new.email, new.role, new.troupe_id, new.actor_id);
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;
  return new;
end;
$$;

create trigger invites_apply
  before insert or update on public.invites
  for each row when (pg_trigger_depth() = 0)
  execute function public.handle_invite();

-- Actors may edit their profile, but not approve themselves, move themselves, take another slug
-- or point their photo at someone else's file. Runs only for signed-in non-admins, so migrations,
-- the SQL editor and the auth trigger are unaffected.
create function public.guard_actor_update() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.troupe_id := old.troupe_id;
  new.sort_order := old.sort_order;
  new.slug := old.slug;
  if new.photo_path is distinct from old.photo_path and coalesce(new.photo_path, '') not like auth.uid()::text || '/%' then
    new.photo_path := old.photo_path;
  end if;
  -- an actor can only submit for review (draft -> pending) or pull back to draft
  if new.status not in ('draft', 'pending') or old.status in ('approved', 'hidden') then
    new.status := old.status;
  end if;
  -- edits to a live profile go live, but get flagged for the admin to look at
  if old.status = 'approved' and (new.full_name, new.stage_name, new.short_bio, new.quip, new.bio, new.photo_path, new.socials)
       is distinct from (old.full_name, old.stage_name, old.short_bio, old.quip, old.bio, old.photo_path, old.socials) then
    new.needs_review := true;
  else
    new.needs_review := old.needs_review;
  end if;
  return new;
end;
$$;

create trigger actors_guard
  before update on public.actors
  for each row execute function public.guard_actor_update();

-- Tell Rihards on Telegram (via n8n) when a profile is submitted or a live one changes.
create function public.notify_actor_review() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  ev text;
begin
  if new.status = 'pending' and old.status is distinct from 'pending' then
    ev := 'submitted';
  elsif new.needs_review and not old.needs_review then
    ev := 'changed';
  else
    return new;
  end if;
  perform net.http_post(
    url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
    body := jsonb_build_object('event', ev, 'full_name', new.full_name, 'stage_name', new.stage_name),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

create trigger actors_notify
  after update on public.actors
  for each row execute function public.notify_actor_review();

-- Public, read-only list of approved profiles for the website. No private columns.
create function public.public_actors()
returns table (
  slug text, full_name text, stage_name text, short_bio text, quip text, bio text, photo_path text,
  skills text[], formats text[], languages text[], regions text[], socials jsonb,
  troupe_name text, troupe_slug text, sort_order integer
)
language sql stable security definer set search_path = public, extensions as $$
  select a.slug, a.full_name, a.stage_name, a.short_bio, a.quip, a.bio, a.photo_path,
         a.skills, a.formats, a.languages, a.regions, a.socials,
         t.name, t.slug, a.sort_order
  from public.actors a
  left join public.troupes t on t.id = a.troupe_id
  where a.status = 'approved' and a.show_on_site and a.full_name <> ''
  order by a.sort_order, a.full_name;
$$;

-- An actor's own gigs, without the client name or price.
create function public.my_bookings()
returns table (id uuid, day date, title text, location text, details text, status text, actor_fee_eur integer)
language sql stable security definer set search_path = public, extensions as $$
  select b.id, b.day, b.title, b.location, b.details, b.status, b.actor_fee_eur
  from public.bookings b
  where b.actor_id = public.my_actor_id() and b.status <> 'cancelled'
  order by b.day;
$$;

-- ---------- Privileges ----------
-- Supabase lets anon and authenticated execute new public functions by default; keep only what's needed.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.public_actors() to anon, authenticated;
grant execute on function public.my_bookings(), public.is_admin(), public.is_member(), public.my_actor_id() to authenticated;

-- ---------- Row level security ----------

alter table public.troupes enable row level security;
alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.actors enable row level security;
alter table public.actor_admin_notes enable row level security;
alter table public.busy_dates enable row level security;
alter table public.bookings enable row level security;

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

-- The bookings table itself is admin-only; actors read theirs through my_bookings().
create policy bookings_admin on public.bookings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Photos ----------
-- Public bucket (the site shows the photos); only members may write, and an actor only in their own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('actor-photos', 'actor-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'actor-photos' and public.is_member()
              and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'actor-photos' and public.is_member()
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- Seed ----------

insert into public.troupes (name, slug) values ('Impromotion', 'impromotion');
