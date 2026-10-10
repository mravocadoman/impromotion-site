-- Pietura's public profile, from its own Instagram and the Kino Bize show listing (2026-10-10).
-- Kristers (collective admin) can edit it; still hidden until the admin ticks "Rādīt kolektīvu mājaslapā".
update public.troupes set
  tagline = 'Asprātīgas improvizācijas izrādes, kuras vada skatītāju idejas',
  description = 'Pietura ir četru improvizatoru kolektīvs no Rīgas: Andris, Kristers, Robins un Sandis. Viņu izrādes nav iepriekš uzrakstītas. Tēlus, sižetu un negaidītos pavērsienus nosaka skatītāju ieteikumi, tāpēc neviens vakars neatkārtojas.

Pietura regulāri spēlē Kino Bizē Rīgā. Kolektīvu var aicināt arī uz korporatīviem un privātiem pasākumiem.',
  city = 'Rīga',
  logo_path = 'troupes/pietura-logo.webp',
  socials = '{"instagram": "https://www.instagram.com/pietura.impro/", "facebook": "https://www.facebook.com/profile.php?id=61585249411516"}'::jsonb,
  needs_review = false
where slug = 'pietura';
