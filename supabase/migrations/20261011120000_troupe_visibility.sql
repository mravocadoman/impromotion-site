-- Collective admins may hide or re-show their collective once the Impromotion admin has approved it
-- (turned it on at least once). Before that, visibility stays admin-only.
alter table public.troupes add column approved boolean not null default false;

create or replace function public.guard_troupe_update() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then
    if new.show_on_site then new.approved := true; end if;
    return new;
  end if;
  new.id := old.id;
  new.slug := old.slug;
  new.admin_actor_id := old.admin_actor_id;
  new.approved := old.approved;
  new.created_at := old.created_at;
  if not old.approved then
    new.show_on_site := old.show_on_site;
  end if;
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

-- Pietura goes live (owner's decision, 2026-10-10).
update public.troupes set show_on_site = true where slug = 'pietura';
