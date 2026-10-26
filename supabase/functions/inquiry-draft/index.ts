// Writes a reply draft for a new client inquiry. The inquiries_draft trigger calls it with {id} (pg_net,
// shared token); the draft is stored on the inquiry and handed to n8n, which saves it in Gmail as a draft,
// so Rihards only edits and sends. One draft per inquiry.
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const OPENAI = Deno.env.get('OPENAI_API_KEY')!;
const TOKEN = Deno.env.get('POLISH_TOKEN')!;
const N8N = 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-actor-event?k=imp-actor-2026';

const SYSTEM = `Tu raksti e-pasta atbildes melnrakstu Rihardam Zeiļam no Impromotion. Impromotion piedāvā improvizācijas aktierus un vadītājus pasākumiem: pasākumu vadīšana, slēptās lomas, improvizācijas izrādes un priekšnesumi, animatori, komandas treniņi, spēles un viktorīnas. Klients aizpildīja pieteikumu mājaslapā.

Raksti dabiskā latviešu valodā, kā pieredzējis pasākumu speciālists raksta klientam. Klientu uzrunā ar "Jūs" (ar lielo burtu). Teikumi īsi un skaidri, latviska teikumu uzbūve, nevis tulkota no angļu valodas.
- Sāc ar "Labdien, <vārds>!" (vārds uzrunas formā, ja tas ir dabiski) vai "Labdien!", ja vārda nav.
- Pateicies un vienā teikumā atkārto galveno par pasākumu (pasākums, datums, vieta, viesi). Nesāc to ar "Izlasīju".
- Nelieto izdomātus vārdus pēdiņās. Pēdiņās tikai nosaukumi.
- Ja klients uzdod jautājumus, atbildi uz tiem. Piedāvā vienu vai divus konkrētus formātus, kas der tieši šim pasākumam.
- Ja datumā ir brīvi piemēroti aktieri, pasaki, ka šajā datumā mums ir brīvi aktieri. Vārdus nesauc. Ja klients pats izvēlējās aktierus, apstiprini tos tikai tad, ja viņi ir brīvi.
- Nekad neizdomā cenas, vārdus, faktus vai solījumus. Kur vajag cenu, ieliec [CENA]. Ja trūkst svarīgas informācijas (sākuma laiks, ilgums, valoda, vieta), pajautā divus vai trīs konkrētus jautājumus.
- Piedāvā īsu zvanu.
- Bez domuzīmēm, bez emocijzīmēm, bez izsaukuma zīmju virknēm, bez reklāmas žargona. Valūta aiz skaitļa (300 €).
- Beigās: "Ar cieņu," un jaunā rindā "Rihards Zeiļa", "Impromotion", "impromotion.lv".
- Līdz 170 vārdiem.
Atbildi tikai ar JSON: {"subject": "...", "text": "..."}. Temats īss, piemēram "Par Jūsu pasākumu 10. decembrī".`;

Deno.serve(async (req) => {
  if (!TOKEN || req.headers.get('x-polish-token') !== TOKEN) return new Response('forbidden', { status: 403 });
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== 'string') return new Response('bad request', { status: 400 });
  const { data: i, error } = await sb.from('inquiries').select('*').eq('id', id).single();
  if (error) return new Response('not found', { status: 404 });
  if (!i.email) return Response.json({ skip: 'no email' });
  if (i.draft_text) return Response.json({ skip: 'already drafted' });

  const { data: cands } = await sb.rpc('inquiry_candidates', { p_id: id });
  const free = (cands ?? []).filter((c: { available: boolean | null }) => c.available !== false).length;
  const facts = {
    vārds: i.name, pasākums: i.event_type, interesē: i.wants, datums: i.date_text, viesi: i.guests,
    cik_izpildītāju: i.people, budžets: i.budget_label, līmenis: i.level, klienta_izvēlētie_aktieri: i.shortlist,
    ziņa: i.message, brīvi_piemēroti_aktieri_datumā: i.event_date ? free : 'datums nav zināms',
  };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5.5', response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(facts) }] }),
  });
  const j = await r.json();
  if (!r.ok) return new Response(`OpenAI: ${j.error?.message ?? r.status}`, { status: 502 });
  const out = JSON.parse(j.choices[0].message.content);
  const subject = String(out.subject || 'Par Jūsu pasākumu').slice(0, 150);
  const text = String(out.text || '').slice(0, 4000);
  if (!text) return new Response('empty draft', { status: 502 });
  await sb.from('inquiries').update({ draft_subject: subject, draft_text: text, draft_at: new Date().toISOString() }).eq('id', id);
  await fetch(N8N, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'inquiry_draft', full_name: i.name, to: i.email, subject, text }) });
  return Response.json({ ok: true });
});
