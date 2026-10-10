-- Fix: append notes with array_append (a bare literal after text[] || is parsed as an array).
create or replace function public.score_application() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  s integer := 0;
  notes text[] := '{}';
  link_count integer := coalesce(array_length(regexp_split_to_array(coalesce(new.links, ''), 'https://'), 1), 1) - 1;
  about_len integer := char_length(coalesce(new.about, ''));
  core text[] := array['Pasākumu vadīšana', 'Improvizācijas izrādes', 'Slēptās lomas', 'Animatora darbs'];
begin
  -- experience
  if new.experience_years >= 5 then s := s + 25; notes := array_append(notes, format('%s g. pieredze', new.experience_years));
  elsif new.experience_years >= 2 then s := s + 18; notes := array_append(notes, format('%s g. pieredze', new.experience_years));
  elsif new.experience_years = 1 then s := s + 10; notes := array_append(notes, 'tikai 1 g. pieredze');
  else notes := array_append(notes, 'pieredze nav norādīta vai 0');
  end if;
  -- belongs to a group
  if new.troupes is not null then s := s + 10; notes := array_append(notes, ('kolektīvs: ' || left(new.troupes, 60))); end if;
  -- something we can watch
  if link_count >= 2 then s := s + 20; notes := array_append(notes, format('%s saites', link_count));
  elsif link_count = 1 then s := s + 15; notes := array_append(notes, '1 saite');
  else notes := array_append(notes, 'nav saišu uz video vai profiliem');
  end if;
  -- wrote about themselves
  if about_len >= 200 then s := s + 15;
  elsif about_len >= 60 then s := s + 8;
  else notes := array_append(notes, 'gandrīz nekas nav uzrakstīts par sevi');
  end if;
  -- what they do
  if new.skills && core then s := s + 10; else notes := array_append(notes, 'nav galveno prasmju (vadīšana, izrādes, lomas, animatori)'); end if;
  if coalesce(array_length(new.skills, 1), 0) >= 3 then s := s + 5; end if;
  if new.languages && array['angļu', 'krievu'] then s := s + 5; notes := array_append(notes, ('valodas: ' || array_to_string(new.languages, ', '))); end if;
  if new.phone is not null then s := s + 5; end if;
  -- fee
  if new.min_fee_eur is null then notes := array_append(notes, 'honorārs nav norādīts');
  elsif new.min_fee_eur <= 400 then s := s + 10; notes := array_append(notes, format('no %s €', new.min_fee_eur));
  elsif new.min_fee_eur <= 800 then s := s + 5; notes := array_append(notes, format('no %s € (dārgāk)', new.min_fee_eur));
  else notes := array_append(notes, format('no %s € (ļoti dārgi)', new.min_fee_eur));
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
