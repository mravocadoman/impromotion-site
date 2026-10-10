-- Improvizācijas teātris Pietura: Kristers, Sandis and Robins. Kristers administers the troupe profile.
insert into public.troupes (name, slug) values ('Improvizācijas teātris Pietura', 'pietura')
  on conflict (slug) do nothing;

update public.actors set troupe_id = (select id from public.troupes where slug = 'pietura')
  where slug in ('kristers-odzins', 'sandis-elsts', 'robins-reins');

update public.invite_links set troupe_id = (select id from public.troupes where slug = 'pietura')
  where actor_id in (select id from public.actors where slug in ('sandis-elsts', 'robins-reins')) and claimed_at is null;

update public.troupes set admin_actor_id = (select id from public.actors where slug = 'kristers-odzins')
  where slug = 'pietura';
