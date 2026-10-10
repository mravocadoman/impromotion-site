-- Automatic first pass over applications. Every new application gets a 0-100 score, a verdict and
-- the reasons. Weak ones are filed as rejected straight away (nothing is sent to the applicant, and
-- the admin can restore them); good and maybe ones go to Rihards on Telegram with contact links.

alter table public.applications
  add column score integer,
  add column verdict text check (verdict in ('good', 'maybe', 'weak')),
  add column score_notes text[] not null default '{}',
  add column auto_rejected boolean not null default false;

create function public.score_application() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  s integer := 0;
  notes text[] := '{}';
  link_count integer := coalesce(array_length(regexp_split_to_array(coalesce(new.links, ''), 'https://'), 1), 1) - 1;
  about_len integer := char_length(coalesce(new.about, ''));
  core text[] := array['Pasākumu vadīšana', 'Improvizācijas izrādes', 'Slēptās lomas', 'Animatora darbs'];
begin
  -- experience
  if new.experience_years >= 5 then s := s + 25; notes := notes || format('%s g. pieredze', new.experience_years);
  elsif new.experience_years >= 2 then s := s + 18; notes := notes || format('%s g. pieredze', new.experience_years);
  elsif new.experience_years = 1 then s := s + 10; notes := notes || 'tikai 1 g. pieredze';
  else notes := notes || 'pieredze nav norādīta vai 0';
  end if;
  -- belongs to a group
  if new.troupes is not null then s := s + 10; notes := notes || ('kolektīvs: ' || left(new.troupes, 60)); end if;
  -- something we can watch
  if link_count >= 2 then s := s + 20; notes := notes || format('%s saites', link_count);
  elsif link_count = 1 then s := s + 15; notes := notes || '1 saite';
  else notes := notes || 'nav saišu uz video vai profiliem';
  end if;
  -- wrote about themselves
  if about_len >= 200 then s := s + 15;
  elsif about_len >= 60 then s := s + 8;
  else notes := notes || 'gandrīz nekas nav uzrakstīts par sevi';
  end if;
  -- what they do
  if new.skills && core then s := s + 10; else notes := notes || 'nav galveno prasmju (vadīšana, izrādes, lomas, animatori)'; end if;
  if coalesce(array_length(new.skills, 1), 0) >= 3 then s := s + 5; end if;
  if new.languages && array['angļu', 'krievu'] then s := s + 5; notes := notes || ('valodas: ' || array_to_string(new.languages, ', ')); end if;
  if new.phone is not null then s := s + 5; end if;
  -- fee
  if new.min_fee_eur is null then notes := notes || 'honorārs nav norādīts';
  elsif new.min_fee_eur <= 400 then s := s + 10; notes := notes || format('no %s €', new.min_fee_eur);
  elsif new.min_fee_eur <= 800 then s := s + 5; notes := notes || format('no %s € (dārgāk)', new.min_fee_eur);
  else notes := notes || format('no %s € (ļoti dārgi)', new.min_fee_eur);
  end if;

  new.score := least(s, 100);
  new.score_notes := notes;
  new.verdict := case when new.score >= 60 then 'good' when new.score >= 35 then 'maybe' else 'weak' end;
  if new.verdict = 'weak' then
    new.status := 'rejected';
    new.auto_rejected := true;
  end if;
  return new;
end;
$$;

create trigger applications_score
  before insert on public.applications
  for each row execute function public.score_application();

-- Richer Telegram payload: score, verdict and contact details so Rihards can reach out directly.
create or replace function public.notify_application() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026',
    body := jsonb_build_object('event', 'application', 'full_name', new.full_name, 'stage_name', new.stage_name,
      'troupes', new.troupes, 'skills', array_to_string(new.skills, ', '), 'formats', array_to_string(new.formats, ', '),
      'languages', array_to_string(new.languages, ', '), 'regions', array_to_string(new.regions, ', '),
      'experience_years', new.experience_years, 'min_fee_eur', new.min_fee_eur,
      'email', new.email::text, 'phone', new.phone, 'links', new.links, 'about', left(new.about, 400),
      'score', new.score, 'verdict', new.verdict, 'notes', array_to_string(new.score_notes, '; ')),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

revoke execute on function public.score_application() from public, anon, authenticated;
