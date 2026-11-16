// Shared Supabase client and option lists for the actor portal and the admin page.
// The anon key is public by design; row level security in supabase/migrations decides what it may read.
// Pinned: this module runs with the admin's session, so it must not change under us.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const SKILLS = ['Pasākumu vadīšana', 'Animatora darbs', 'Slēptās lomas', 'Improvizācijas izrādes', 'Komandas treniņi', 'Apmācības', 'Sporta spēles', 'Viktorīnas', 'Dziedāšana', 'Dejas', 'Mūzikas instruments', 'Tosti', 'Stand-up', 'Pasākumu organizēšana'];
export const FORMATS = ['Korporatīvie pasākumi', 'Kāzas', 'Dzimšanas dienas', 'Jubilejas', 'Bērnu ballītes', 'Privāti pasākumi', 'Izrādes', 'Apmācības', 'Tiešsaistes pasākumi', 'Bēres'];
export const LANGUAGES = ['latviešu', 'angļu', 'krievu', 'vācu'];
export const REGIONS = ['Rīga', 'Pierīga', 'Kurzeme', 'Zemgale', 'Vidzeme', 'Latgale', 'Visa Latvija', 'Ārzemes'];
export const SOCIALS = ['facebook', 'instagram', 'tiktok', 'youtube', 'x'];
// pending = published by the actor, live as a new talent; approved = checked by Impromotion.
export const STATUS = { draft: 'Melnraksts', pending: 'Publicēts, gaida pārbaudi', approved: 'Pārbaudīts', hidden: 'Paslēpts' };

// Site assets ('/assets/...') or files in our own bucket; nothing from other hosts.
export const photoUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('/assets/')) return path;
  if (/^[0-9a-z-]+\/[\w.-]+$/i.test(path)) return `${SUPABASE_URL}/storage/v1/object/public/actor-photos/${path}`;
  return '';
};
export const isHttps = (u) => /^https:\/\/[^\s<>"]+$/i.test(u);

// Latvian greeting in the vocative: Kristers -> "Sveiks, Krister!", Sandis -> "Sveiks, Sandi!", Leina -> "Sveika, Leina!".
// Latvian first names ending in -a or -e are women's names: Leina, Ginta, Alise. Used to pick brīva/brīvs etc.
export const isFem = (fullName) => /[ae]$/i.test(String(fullName || '').trim().split(/\s+/)[0] || '');

export function greet(fullName) {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  if (!first) return 'Sveiki!';
  if (/[ae]$/i.test(first)) return `Sveika, ${first}!`;
  const voc = /is$/i.test(first) ? first.slice(0, -1)        // Sandis -> Sandi
    : /us$/i.test(first) ? first.slice(0, -1)                  // Mikus -> Miku
    : /[sš]$/i.test(first) ? first.slice(0, -1)                // Kristers -> Krister, Andrejs -> Andrej
    : first;
  return `Sveiks, ${voc}!`;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(text, tone = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

// Magic-link login. The database refuses to create accounts for addresses that weren't invited.
export async function mountLogin(root, { redirectPath }) {
  // A personal invite link (?invite=...) lets the actor claim their profile with any email they choose.
  const token = new URLSearchParams(location.search).get('invite');
  let invite = null;
  if (token) {
    const { data } = await sb.rpc('invite_info', { p_token: token });
    invite = data?.[0] || null;
  }
  const who = invite ? esc(invite.stage_name ? `${invite.full_name} („${invite.stage_name}”)` : invite.full_name) : '';
  root.innerHTML = `
    <form class="panel login" novalidate>
      <h1 class="h2">${invite ? esc(greet(invite.full_name)) : 'Ienākt'}</h1>
      <p class="muted">${invite
        ? `Šī ir Tava personīgā saite, ar kuru vari pārņemt profilu <strong>${who}</strong> impromotion.lv lapā. Ieraksti savu e-pastu, un atsūtīsim saiti, ar kuru ienākt bez paroles. Ar šo pašu e-pastu ienāksi arī turpmāk.`
        : 'Ja Tev jau ir profils, ieraksti savu e-pastu, un atsūtīsim saiti, ar kuru ienākt bez paroles. Pirmo reizi šeit? <a href="/pievienojies/">Aizpildi pieteikumu</a>, tas aizņem minūti, un profils tiks izveidots uzreiz.'}</p>
      ${token && !invite ? '<p class="notice">Šī ielūguma saite vairs nav derīga. Palūdz Rihardam jaunu ielūguma saiti.</p>' : ''}
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
    status.textContent = 'Sūtām…';
    if (invite) {
      const { data: claimed, error: claimErr } = await sb.rpc('claim_invite', { p_token: token, p_email: email });
      if (claimErr || !claimed) { status.textContent = 'Šo ielūgumu jau izmantoja cits e-pasts. Ieraksti e-pastu, ar kuru ielūgumu izmantoji pirmo reizi, vai palūdz Rihardam jaunu saiti.'; return; }
    }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + redirectPath } });
    if (!error) { status.textContent = 'Saite nosūtīta. Pārbaudi e-pastu, arī mēstuļu mapi.'; return; }
    // No profile for this address yet: most of these are new actors who came to log in instead of signing up.
    if (/database error|not invited|signups/i.test(error.message) && !invite) {
      status.innerHTML = `Šim e-pastam vēl nav profila. Aizpildi pieteikumu (tas aizņem minūti), un pēc tam ienāksi ar šo pašu e-pastu. <a class="btn btn--sm btn--yellow" href="/pievienojies/?email=${encodeURIComponent(email)}">Aizpildīt pieteikumu →</a>`;
      return;
    }
    status.textContent = /database error|not invited|signups/i.test(error.message)
      ? 'Uz šo e-pasta adresi ielūgums nav nosūtīts. Uzraksti uz hello@impromotion.lv.'
      : /rate|seconds/i.test(error.message) ? 'Pārāk daudz mēģinājumu. Pagaidi minūti un mēģini vēlreiz.' : `Neizdevās nosūtīt saiti: ${error.message}`;
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
