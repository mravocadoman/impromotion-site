// Tidies an actor's profile after they edit it. Called by the actors_polish trigger via pg_net.
// photo: cut the person out (OpenAI image edit) so the site's yellow-ring CSS frames it like the team portraits.
// text: a typo and punctuation pass on short_bio, bio and quip. The first versions are kept in text_original.
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const OPENAI = Deno.env.get('OPENAI_API_KEY')!;
const TOKEN = Deno.env.get('POLISH_TOKEN')!;
const LIMITS = { short_bio: 200, bio: 2000, quip: 60 } as const;
type Field = keyof typeof LIMITS;

const PHOTO_PROMPT = 'Cut the person out of this photo for a round profile avatar. Keep the person exactly as in the original: same face, same expression, same hair, same clothes, same skin tone, no beautifying, no retouching, do not redraw or change any facial feature. Remove the entire background so it is fully transparent. Reframe as a head-and-shoulders portrait: face centered horizontally, the top of the hair about 18 percent below the top edge, the face taking about a third of the image width, the shoulders and upper chest reaching the bottom edge. Nothing else in the image.';

const TEXT_PROMPT = `Tu esi latviešu valodas korektors. Saņemsi JSON ar aktiera profila tekstiem.
Izlabo tikai pareizrakstības, interpunkcijas, atstarpju, garumzīmju un locījumu kļūdas.
Nemaini saturu, stilu, vārdu izvēli, sarunvalodu, slengu, emocijzīmes, uzrunas formu un teikumu secību.
Nepārraksti un nepapildini. Neliec domuzīmes. Ja tekstā nav kļūdu, atgriez to neizmainītu.
Atbildi tikai ar JSON ar tiem pašiem laukiem.`;

async function openai(path: string, init: RequestInit) {
  const r = await fetch(`https://api.openai.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${OPENAI}`, ...init.headers } });
  const j = await r.json();
  if (!r.ok) throw new Error(`OpenAI ${path}: ${j.error?.message ?? r.status}`);
  return j;
}

async function cutPhoto(path: string) {
  const { data: file, error } = await sb.storage.from('actor-photos').download(path);
  if (error) throw error;
  const form = new FormData();
  const fields = { model: 'gpt-image-1.5', prompt: PHOTO_PROMPT, size: '1024x1024', background: 'transparent',
    output_format: 'webp', output_compression: '90', quality: 'high', input_fidelity: 'high' };
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('image[]', new File([file], 'photo', { type: file.type.startsWith('image/') ? file.type : 'image/webp' }));
  const j = await openai('images/edits', { method: 'POST', body: form });
  const bytes = Uint8Array.from(atob(j.data[0].b64_json), (c) => c.charCodeAt(0));
  const out = `${path.split('/')[0]}/${Date.now()}-cut.webp`;
  const { error: upErr } = await sb.storage.from('actor-photos').upload(out, bytes, { contentType: 'image/webp' });
  if (upErr) throw upErr;
  return out;
}

async function fixText(src: Partial<Record<Field, string>>) {
  const j = await openai('chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5.4-mini', response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: TEXT_PROMPT }, { role: 'user', content: JSON.stringify(src) }] }),
  });
  const out = JSON.parse(j.choices[0].message.content);
  const fixed: Partial<Record<Field, string>> = {};
  for (const k of Object.keys(src) as Field[]) {
    const v = typeof out[k] === 'string' ? out[k].trim() : '';
    // A proofread stays close to the original; anything longer looks like a rewrite and is dropped.
    if (v && v !== src[k] && v.length <= LIMITS[k] && v.length <= src[k]!.length * 1.15 + 10) fixed[k] = v;
  }
  return fixed;
}

async function polish(id: string, photo: boolean, text: boolean) {
  const { data: a, error } = await sb.from('actors').select('id, photo_path, short_bio, bio, quip, text_original, updated_at').eq('id', id).single();
  if (error) throw error;

  if (text) {
    const src = Object.fromEntries((Object.keys(LIMITS) as Field[]).filter((k) => a[k]?.trim()).map((k) => [k, a[k]]));
    if (Object.keys(src).length) {
      const fixed = await fixText(src);
      // Only if the actor hasn't saved again meanwhile; their next save triggers a fresh pass anyway.
      if (Object.keys(fixed).length) {
        await sb.from('actors').update({ ...fixed, text_original: a.text_original ?? src }).eq('id', id).eq('updated_at', a.updated_at);
      }
      console.log(id, 'text fixed:', Object.keys(fixed).join(', ') || 'nothing');
    }
  }

  if (photo && a.photo_path && !a.photo_path.endsWith('-cut.webp') && !a.photo_path.startsWith('/assets/')) {
    const cut = await cutPhoto(a.photo_path);
    await sb.from('actors').update({ photo_path: cut, photo_original_path: a.photo_path }).eq('id', id).eq('photo_path', a.photo_path);
    console.log(id, 'photo cut:', cut);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-polish-token') !== TOKEN) return new Response('forbidden', { status: 403 });
  const { id, photo, text } = await req.json();
  // The image edit takes up to a minute, longer than pg_net waits, so answer first and work in the background.
  EdgeRuntime.waitUntil(polish(id, !!photo, !!text).catch((e) => console.error(id, e.message)));
  return Response.json({ ok: true }, { status: 202 });
});
