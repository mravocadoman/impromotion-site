-- Troupe profiles. Each troupe has one troupe admin (one of its actors) who edits the troupe's
-- public info from the actor portal. Only the Impromotion admin decides whether a troupe is shown
-- on the site, who its admin is and its slug. Edits by a troupe admin are flagged for review.

alter table public.troupes
  add column tagline text check (char_length(tagline) <= 120),
  add column description text check (char_length(description) <= 2000),
  add column logo_path text check (logo_path is null or logo_path ~ '^[0-9a-z-]+/[A-Za-z0-9_.-]+$'),
  add column city text check (char_length(city) <= 60),
  add column founded_year integer check (founded_year between 1950 and 2100),
  add column socials jsonb not null default '{}' check (jsonb_typeof(socials) = 'object' and not jsonb_path_exists(socials, '$.* ? (!(@ like_regex "^https://[^ <>\"]+$"))')),
  add column show_on_site boolean not null default false,
  add column needs_review boolean not null default false,
  add column admin_actor_id uuid references public.actors (id) on delete set null,
  add column updated_at timestamptz not null default now();

create function public.is_troupe_admin(p_troupe uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.troupes t join public.actors a on a.id = t.admin_actor_id
    where t.id = p_troupe and a.user_id = auth.uid()
  );
$$;

-- Troupe admins may update their own troupe; everything else stays admin-only (troupes_admin policy).
create policy troupes_troupe_admin_update on public.troupes for update to authenticated
  using (public.is_troupe_admin(id)) with check (public.is_troupe_admin(id));

create function public.guard_troupe_update() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.id := old.id;
  new.slug := old.slug;
  new.admin_actor_id := old.admin_actor_id;
  new.show_on_site := old.show_on_site;
  new.created_at := old.created_at;
  if new.logo_path is distinct from old.logo_path and coalesce(new.logo_path, '') not like auth.uid()::text || '/%' then
    new.logo_path := old.logo_path;
  end if;
  if (new.name, new.tagline, new.description, new.logo_path, new.city, new.founded_year, new.socials, new.website)
       is distinct from (old.name, old.tagline, old.description, old.logo_path, old.city, old.founded_year, old.socials, old.website) then
    new.needs_review := true;
  else
    new.needs_review := old.needs_review;
  end if;
  return new;
end;
$$;

create trigger troupes_guard
  before update on public.troupes
  for each row execute function public.guard_troupe_update();

-- Telegram ping when a troupe admin edits the profile (reuses the actor "changed" event).
create function public.notify_troupe_review() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.needs_review and not old.needs_review then
    perform net.http_post(
      url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
      body := jsonb_build_object('event', 'changed', 'full_name', 'Trupa ' || new.name, 'stage_name', null),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;

create trigger troupes_notify
  after update on public.troupes
  for each row execute function public.notify_troupe_review();

-- The troupe a signed-in actor administers, if any.
create function public.my_troupe_id() returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select t.id from public.troupes t join public.actors a on a.id = t.admin_actor_id
  where a.user_id = auth.uid() limit 1;
$$;

-- Members of my troupe, for the troupe admin. Names and status only, nothing private.
create function public.my_troupe_members()
returns table (full_name text, stage_name text, status text, show_on_site boolean, claimed boolean)
language sql stable security definer set search_path = public, extensions as $$
  select a.full_name, a.stage_name, a.status, a.show_on_site, a.user_id is not null
  from public.actors a
  where a.troupe_id = public.my_troupe_id()
  order by a.sort_order, a.full_name;
$$;

-- Public troupe profiles with the names of their publicly shown members.
create function public.public_troupes()
returns table (
  slug text, name text, tagline text, description text, logo_path text, city text, founded_year integer,
  website text, socials jsonb, members text[]
)
language sql stable security definer set search_path = public, extensions as $$
  select t.slug, t.name, t.tagline, t.description, t.logo_path, t.city, t.founded_year, t.website, t.socials,
         coalesce((select array_agg(a.full_name order by a.sort_order, a.full_name) from public.actors a
                   where a.troupe_id = t.id and a.status = 'approved' and a.show_on_site and a.full_name <> ''), '{}')
  from public.troupes t
  where t.show_on_site
  order by t.name;
$$;

revoke execute on function public.is_troupe_admin(uuid), public.my_troupe_id(), public.my_troupe_members(), public.public_troupes() from public;
grant execute on function public.is_troupe_admin(uuid), public.my_troupe_id(), public.my_troupe_members() to authenticated;
grant execute on function public.public_troupes() to anon, authenticated;
revoke execute on function public.notify_troupe_review() from public, anon, authenticated;
