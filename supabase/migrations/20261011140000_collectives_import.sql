-- Outreach CRM for collectives: business contacts, sources and status. Admin only, because any
-- signed-in actor may read public.troupes.
create table public.troupe_admin_notes (
  troupe_id uuid primary key references public.troupes (id) on delete cascade,
  contact_email text check (char_length(contact_email) <= 254),
  contact_phone text check (char_length(contact_phone) <= 40),
  outreach_status text not null default 'nav sazināts'
    check (outreach_status in ('nav sazināts', 'uzrakstīts', 'atbildēja', 'sadarbojas', 'atteica')),
  notes text check (char_length(notes) <= 4000),
  sources text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.troupe_admin_notes enable row level security;
create policy troupe_notes_admin on public.troupe_admin_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.troupe_admin_notes (troupe_id, outreach_status)
  select id, 'sadarbojas' from public.troupes where slug in ('impromotion', 'pietura') on conflict do nothing;

alter table public.troupes drop constraint troupes_founded_year_check;
alter table public.troupes add constraint troupes_founded_year_check check (founded_year between 1900 and 2100);

-- Latvian improv collectives found in public sources on 2026-10-10. All hidden until they agree.
insert into public.troupes (slug, name, tagline, description, city, founded_year, website, socials) values
('arprats', 'Improvizatoru apvienība ĀrprāTS',
 'Rīgas improvizatori, kas kopš 2015. gada spēlē ainas bez scenārija',
 'ĀrprāTS uz skatuves rada stāstus kopš 2015. gada un spēlē gan īsās, gan garās formas improvizāciju. Kolektīvs balstās teātra sporta tradīcijā un rīko numurētas sezonas izrādes, kurās skatītāju idejas kļūst par sižeta pamatu. Izrādes notiek Willa teātrī Rīgā, un ĀrprāTS spēlē arī korporatīvos pasākumos.',
 'Rīga', 2015, 'https://arpratslv.wordpress.com/',
 '{"facebook": "https://www.facebook.com/arprats/", "instagram": "https://www.instagram.com/arprats.impro/"}'),
('humors', 'Humors',
 'Garās formas improvizācija: 2x2=Improvizācija un Gandrīz draugi',
 'Humors veido improvizācijas vakarus “2x2=Improvizācija” un “Gandrīz draugi”. Izrādē 2x2 katrā daļā uz skatuves kāpj cits duets: Mārcis Viļums ar Kasparu Breidaku un Dzintars Rožkalns ar Valdi Silu. Izrādes notiek kultūras telpā “Pauze” Rīgā, un improvizatori uzstājas arī pasākumos.',
 'Rīga', null, 'https://www.humors.lv/',
 '{"facebook": "https://www.facebook.com/Humorslv1/", "instagram": "https://www.instagram.com/humorslv_/", "tiktok": "https://www.tiktok.com/@humorslv", "youtube": "https://www.youtube.com/@humorslv"}'),
('divas', 'Improvizācijas teātris DIVAS',
 'Improvizācijas duets ar īpašiem viesiem un uz vietas dzimušām dziesmām',
 'DIVAS ir Anetes Bendikas un Elīnas Geidas improvizācijas duets, kas pirmo izrādi nospēlēja 2019. gadā. Pazīstamākajā formātā skatītāji uzdod jautājumus īpašam viesim, un viņa stāsti kļūst par ainu iedvesmu. Izrādēs bieži skan improvizētas dziesmas, un tās notiek Mūzikas namā “Daile”, kinogalerijā K. Suns un citviet Latvijā.',
 'Rīga', 2019, null,
 '{"facebook": "https://www.facebook.com/divas.improvizacija/", "instagram": "https://www.instagram.com/divas_duoimpro/"}'),
('improv-comedy-riga', 'Improv Comedy Riga',
 'Improvizēta komēdija un meistarklases angļu valodā',
 'Improv Comedy Riga ir improvizācijas kolektīvs, kas strādā angļu valodā. Tas aicina uz Rīgu ārvalstu pasniedzējus, rīko viņu meistarklases un kopā ar viesiem spēlē improvizētas komēdijas izrādes. Sastāvs mainās, un uz skatuves satiekas vietējie improvizatori un viesmākslinieki.',
 'Rīga', null, 'https://www.icr.lv/',
 '{"facebook": "https://www.facebook.com/ImprovComedyRiga/", "instagram": "https://www.instagram.com/improvcomedyriga/"}'),
('improvizacijas-akademija', 'Improvizācijas akadēmija',
 'Improvizācijas teātra skola Rīgā ar četriem līmeņiem un savu pasniedzēju grupu',
 'Improvizācijas akadēmija ir improvizācijas teātra skola Rīgā, kas māca četros līmeņos. Sezonas izrādēs spēlē gan audzēkņi, gan pasniedzēju grupa, un akadēmija brauc arī uz reģioniem ar meistarklasēm un izrādēm.',
 'Rīga', null, null,
 '{"facebook": "https://www.facebook.com/improvizacijasakademija/"}'),
('tepat-tagad', 'Improvizācijas teātris TEPAT TAGAD',
 'Stāsti, kas rodas skatītāju acu priekšā un nekad neatkārtojas',
 'TEPAT TAGAD veido improvizācijas izrādes bez scenārija un iepriekš sagatavotiem dialogiem. Vakari parasti ir divās daļās, un stāsta virzienu nosaka skatītāju idejas. Kolektīvs spēlē teātrī klubā “Hamlets” Vecrīgā un 2026. gadā uzstājās arī Liepājā.',
 'Rīga', null, null,
 '{"facebook": "https://www.facebook.com/tepat.tagad/", "instagram": "https://www.instagram.com/tepat.tagad.impro/"}'),
('jelgavas-studentu-teatris', 'Jelgavas Studentu teātris',
 'Viens no vecākajiem studentu teātriem Latvijā, kur aizsākās teātra sports',
 'Jelgavas Studentu teātris darbojas Latvijas Biozinātņu un tehnoloģiju universitātē, un tā saknes ir 1946. gadā dibinātajā drāmas kopā. Teātrī mijas iestudējumi un improvizācija: tas rīko teātra sporta un garās formas improvizācijas vakarus, kā arī augstskolu teātra sporta turnīrus.',
 'Jelgava', 1946, 'https://www.jst.lv/',
 '{"facebook": "https://www.facebook.com/studentuteatris/", "instagram": "https://www.instagram.com/studentuteatris/", "youtube": "https://www.youtube.com/@llustudentuteatris8517", "x": "https://x.com/LLU_JST"}'),
('plit', 'PLIT',
 'Carnikavas jauniešu improvizācijas teātris, kas spēlē par ziedojumiem labdarībai',
 'PLIT jeb “Pasaulē labākais improvizācijas teātris” ir Carnikavas jauniešu improvizācijas kolektīvs, kas darbojas kopš 2012. gada. Vairākas reizes gadā tas spēlē humoristiskas izrādes Carnikavas tautas namā “Ozolaine”, un ieeja ir par ziedojumiem labdarībai.',
 'Carnikava', 2012, 'https://kultura.carnikava.lv/lv/kolektivi/1900-improvizacijas-teatris-plit',
 '{"facebook": "https://www.facebook.com/plitimpro/"}')
on conflict (slug) do nothing;

insert into public.troupe_admin_notes (troupe_id, contact_email, contact_phone, notes, sources)
select t.id, v.email, v.phone, v.notes, v.sources
from (values
  ('arprats', 'arprats.impro@gmail.com', '+371 28645507',
   'Aktīvi: S12 izrādes 6.11. un 4.12. Willa teātrī. Mājaslapa novecojusi. Dalībnieki tikai ar vārdiem (ap 2020): Jānis, Signe, Laura, Santa, Māra, Kristaps, Mārtiņš, Ivars, Matīss.',
   array['https://arpratslv.wordpress.com/kontakti/', 'https://www.bezrindas.lv/lv/teatra-biletes/improvizatoru-apvieniba-arprats/']),
  ('humors', 'valdis@humors.lv', '+371 29334583',
   'Zīmols, nevis viens kolektīvs (SIA “Have A Good Day”). 2x2 datumi: 21.10., 12.11., 25.11., 9.12. Pauzē. Paši arī pārdod priekšnesumus pasākumos, daļēji konkurenti. Kontakts ir Valda Sila adrese.',
   array['https://www.humors.lv/kontakti', 'https://www.aula.lv/pasakumi/improvizacija-2x2']),
  ('divas', 'geida.anete@gmail.com', null,
   'E-pasts redzēts tikai FB meklēšanas fragmentā, pārbaudīt. Izrādes 20.11., 25.11., 16.12. Vada arī pasākumus, daļēji konkurenti.',
   array['https://www.aula.lv/pasakumi/improvizacijas-teatris-tikai-divas', 'https://www.facebook.com/divas.improvizacija/']),
  ('improv-comedy-riga', 'improvcomedyriga@gmail.com', null,
   'Angliski. Dibinātājs Kaspars Silavs. Sastāvs mainās. Pēdējā zināmā izrāde ap 14.03.2026.',
   array['https://www.icr.lv/', 'https://www.aula.lv/en/pasakumi-1/improv-comedy-riga-show-14-03']),
  ('improvizacijas-akademija', null, null,
   'Skola, ap 70 audzēkņu (2026. g. pavasaris). Dibinātāji ap Kasparu Silavu un Dzintaru Rožkalnu. Iespējams sasniedzams caur valdis@humors.lv. Labākais avots jauniem improvizatoriem.',
   array['https://www.facebook.com/improvizacijasakademija/', 'https://staburags.lv/zinas/tambore-moskisus-un-maca-cilvekiem-atverties-kaspars-silavs-no-neretas-iedos-balsi-pat-kafijas-kruzei/']),
  ('tepat-tagad', null, null,
   'Biedrība “Nopietni nenopietni”. Izrādes 28.02.2026 Liepājā, 20.05.2026 Hamletā. Rudens datumi nav atrasti. Pārbaudīt Krastiņu vārdus.',
   array['https://shop.aula.lv/event/improvizcijas-vakars-ar-tepat-tagad-2005-yq6rms']),
  ('jelgavas-studentu-teatris', 'miniatra.jst@gmail.com', '+371 26323327',
   'Studentu teātris ar improvizācijas virzienu. Kontakts ir atbalsta biedrības MINIATRA. Režisore Astra Kacena.',
   array['https://www.jst.lv/kontakti', 'https://www.jst.lv/par-te%C4%81tri']),
  ('plit', null, null,
   'Jauniešu kolektīvs, vadītājs Juris Kozlovskis (arī Spiediens, konkurents). Izrāde 23.03.2026 Ozolainē.',
   array['https://kultura.carnikava.lv/lv/kolektivi/1900-improvizacijas-teatris-plit', 'https://www.facebook.com/plitimpro/'])
) as v(slug, email, phone, notes, sources)
join public.troupes t on t.slug = v.slug
on conflict (troupe_id) do nothing;

-- Performers named in public show listings: hidden draft profiles, one per person, so outreach can use
-- personal invite links. Each person sits in one collective; other groups are in the admin note.
insert into public.actors (slug, full_name, troupe_id, status, show_on_site, sort_order)
select v.slug, v.full_name, t.id, 'draft', false, 200
from (values
  ('marcis-vilums', 'Mārcis Viļums', 'humors'),
  ('kaspars-breidaks', 'Kaspars Breidaks', 'humors'),
  ('dzintars-rozkalns', 'Dzintars Rožkalns', 'humors'),
  ('valdis-sils', 'Valdis Sils', 'humors'),
  ('margers-janis-majors', 'Marģers Jānis Majors', 'humors'),
  ('dita-nitisa', 'Dita Nitiša', 'humors'),
  ('anete-bendika', 'Anete Bendika', 'divas'),
  ('elina-geida', 'Elīna Geida', 'divas'),
  ('kaspars-silavs', 'Kaspars Silavs', 'improv-comedy-riga'),
  ('luize-beca', 'Luīze Beča', 'improv-comedy-riga'),
  ('annija-bronica', 'Annija Broniča', 'tepat-tagad'),
  ('andrejs-silins', 'Andrejs Siliņš', 'tepat-tagad'),
  ('sintija-sirsnina-garance', 'Sintija Sirsniņa-Garance', 'tepat-tagad'),
  ('ritvars-krastins', 'Ritvars Krastiņš', 'tepat-tagad'),
  ('armands-krastins', 'Armands Krastiņš', 'tepat-tagad'),
  ('atis-degro', 'Atis Degro', 'tepat-tagad'),
  ('juris-kozlovskis', 'Juris Kozlovskis', 'plit')
) as v(slug, full_name, troupe)
join public.troupes t on t.slug = v.troupe
on conflict (slug) do nothing;

insert into public.actor_admin_notes (actor_id, notes)
select a.id, v.notes
from (values
  ('marcis-vilums', '2x2=Improvizācija. Avots: humors.lv/izrades'),
  ('kaspars-breidaks', '2x2=Improvizācija, arī ICR izrādēs. Dzīvesprieka skola. Avots: humors.lv/izrades'),
  ('dzintars-rozkalns', '2x2 un Gandrīz draugi, Improvizācijas akadēmijas dibinātājs. Avots: humors.lv/izrades'),
  ('valdis-sils', '2x2 un Gandrīz draugi, Humors kontaktpersona (valdis@humors.lv). Avots: humors.lv/kontakti'),
  ('margers-janis-majors', 'Gandrīz draugi. Avots: humors.lv/izrades'),
  ('dita-nitisa', 'Gandrīz draugi. Avots: humors.lv/izrades'),
  ('anete-bendika', 'DIVAS. Avots: aula.lv'),
  ('elina-geida', 'DIVAS, arī ICR izrādēs, agrāk Gandrīz draugi. Avots: aula.lv'),
  ('kaspars-silavs', 'ICR dibinātājs, Improvizācijas akadēmijas dibinātājs. Avots: staburags.lv'),
  ('luize-beca', 'ICR izrādes. Avots: aula.lv'),
  ('annija-bronica', 'TEPAT TAGAD. Avots: shop.aula.lv'),
  ('andrejs-silins', 'TEPAT TAGAD. Avots: shop.aula.lv'),
  ('sintija-sirsnina-garance', 'TEPAT TAGAD. Avots: shop.aula.lv'),
  ('ritvars-krastins', 'TEPAT TAGAD, vārds no “Ritvars un Armands Krastiņi”, pārbaudīt. Avots: shop.aula.lv'),
  ('armands-krastins', 'TEPAT TAGAD, vārds no “Ritvars un Armands Krastiņi”, pārbaudīt. Avots: shop.aula.lv'),
  ('atis-degro', 'TEPAT TAGAD. Avots: shop.aula.lv'),
  ('juris-kozlovskis', 'PLIT vadītājs, arī Spiediens (konkurents). Avots: kultura.carnikava.lv')
) as v(slug, notes)
join public.actors a on a.slug = v.slug
on conflict (actor_id) do nothing;

insert into public.invite_links (actor_id, troupe_id)
select a.id, a.troupe_id from public.actors a
where a.sort_order = 200 and a.user_id is null
  and not exists (select 1 from public.invite_links l where l.actor_id = a.id);
