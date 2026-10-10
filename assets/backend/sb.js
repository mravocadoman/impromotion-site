// Shared Supabase client and option lists for the actor portal and the admin page.
// The anon key is public by design; row level security in supabase/migrations decides what it may read.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const SKILLS = ['Pasākumu vadīšana', 'Animatora darbs', 'Slēptās lomas', 'Improvizācijas izrādes', 'Komandas treniņi', 'Apmācības', 'Sporta spēles', 'Viktorīnas', 'Dziedāšana', 'Dejas', 'Mūzikas instruments', 'Tosti', 'Stand-up', 'Pasākumu organizēšana'];
export const FORMATS = ['Korporatīvie pasākumi', 'Kāzas', 'Dzimšanas dienas', 'Jubilejas', 'Bērnu ballītes', 'Privāti pasākumi', 'Izrādes', 'Apmācības', 'Tiešsaistes pasākumi', 'Bēres'];
export const LANGUAGES = ['latviešu', 'angļu', 'krievu', 'vācu'];
export const REGIONS = ['Rīga', 'Pierīga', 'Kurzeme', 'Zemgale', 'Vidzeme', 'Latgale', 'Visa Latvija', 'Ārzemes'];
export const SOCIALS = ['facebook', 'instagram', 'tiktok', 'youtube', 'x'];
export const STATUS = { draft: 'Melnraksts', pending: 'Gaida apstiprinājumu', approved: 'Apstiprināts', hidden: 'Paslēpts' };

export const photoUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('/')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/actor-photos/${path}`;
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(text, tone = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

// Magic-link login. Only invited addresses (or existing members) get a link.
export function mountLogin(root, { redirectPath }) {
  root.innerHTML = `
    <form class="panel login" novalidate>
      <h1 class="h2">Ienākt</h1>
      <p class="muted">Ierakstiet e-pastu, uz kuru saņēmāt ielūgumu. Atsūtīsim saiti, ar kuru ienākt bez paroles.</p>
      <label class="field"><span>E-pasts</span><input type="email" name="email" autocomplete="email" required></label>
      <button class="btn btn--yellow btn--lg" type="submit">Sūtīt ienākšanas saiti</button>
      <p class="login__status muted" role="status"></p>
    </form>`;
  const form = root.querySelector('form');
  const status = root.querySelector('.login__status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    if (!email) return;
    status.textContent = 'Pārbaudām…';
    const { data: invited, error: invErr } = await sb.rpc('is_invited', { p_email: email });
    if (invErr) { status.textContent = 'Neizdevās pārbaudīt e-pastu. Mēģiniet vēlreiz.'; return; }
    if (!invited) { status.textContent = 'Šis e-pasts nav uzaicināts. Rakstiet uz rihards.zeila@gmail.com.'; return; }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + redirectPath } });
    status.textContent = error ? `Neizdevās nosūtīt saiti: ${error.message}` : 'Saite nosūtīta. Pārbaudiet e-pastu (arī mēstules).';
  });
}

export async function currentProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb.from('profiles').select('id, email, role').eq('id', session.user.id).maybeSingle();
  return data;
}

// Resize to max 900px and re-encode as webp before upload, so phones don't push 8 MB photos.
export async function shrinkImage(file, max = 900) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
}
