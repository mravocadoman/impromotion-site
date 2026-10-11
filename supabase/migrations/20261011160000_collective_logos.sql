-- Logos for the imported collectives, from their own sites or public profile pictures (2026-10-11).
update public.troupes t set logo_path = 'troupes/' || t.slug || '-logo.webp'
where t.slug in ('arprats', 'humors', 'divas', 'improv-comedy-riga', 'improvizacijas-akademija',
                 'tepat-tagad', 'jelgavas-studentu-teatris', 'plit')
  and t.logo_path is null;
