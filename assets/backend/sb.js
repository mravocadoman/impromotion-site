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
export const STATUS = { draft: 'Melnraksts', pending: 'Gaida apstiprinājumu', approved: 'Apstiprināts', hidden: 'Paslēpts' };

// Site assets ('/assets/...') or files in our own bucket; nothing from other hosts.
export const photoUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('/assets/')) return path;
  if (/^[0-9a-z-]+\/[\w.-]+$/i.test(path)) return `${SUPABASE_URL}/storage/v1/object/public/actor-photos/${path}`;
  return '';
};
export const isHttps = (u) => /^https:\/\/[^\s<>"]+$/i.test(u);

// Latvian greeting in the vocative: Kristers -> "Sveiks, Krister!", Sandis -> "Sveiks, Sandi!", Leina -> "Sveika, Leina!".
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

// Magic-link login, with the 6-digit code from the same email as a fallback.
// Links break when a mail scanner opens them first, when an older link is clicked after a newer one was sent,
// or when the email app opens them in its own browser; the code works in all of those cases.
// The database refuses to create accounts for addresses that weren't invited.
export async function mountLogin(root, { redirectPath }) {
  // A personal invite link (?invite=...) lets the actor claim their profile with any email they choose.
  const token = new URLSearchParams(location.search).get('invite');
  let invite = null;
  if (token) {
    const { data } = await sb.rpc('invite_info', { p_token: token });
    invite = data?.[0] || null;
  }
  // A dead link comes back as #error_code=otp_expired (or ?error_code=...); say so instead of silently showing the form again.
  const back = new URLSearchParams(location.hash.slice(1) || location.search);
  const linkError = back.get('error_code') || back.get('error');
  if (linkError) history.replaceState(null, '', location.pathname + (token ? `?invite=${encodeURIComponent(token)}` : ''));
  const who = invite ? esc(invite.stage_name ? `${invite.full_name} („${invite.stage_name}”)` : invite.full_name) : '';
  root.innerHTML = `
    <form class="panel login" novalidate>
      <h1 class="h2">${invite ? esc(greet(invite.full_name)) : 'Ienākt'}</h1>
      <p class="muted">${invite
        ? `Šī ir jūsu personīgā saite, lai pārņemtu profilu <strong>${who}</strong> impromotion.lv lapā. Ierakstiet savu e-pastu. Atsūtīsim saiti un kodu, ar ko ienākt bez paroles, un ar šo e-pastu ienāksiet arī turpmāk.`
        : 'Ierakstiet e-pastu, ar kuru esat uzaicināts. Atsūtīsim saiti un kodu, ar ko ienākt bez paroles.'}</p>
      ${token && !invite ? '<p class="notice">Šī ielūguma saite nav derīga. Palūdziet Rihardam jaunu.</p>' : ''}
      ${linkError ? '<p class="notice">Šī ienākšanas saite vairs nav derīga (tā jau izmantota vai ir atsūtīta jaunāka). Pieprasiet jaunu un ierakstiet kodu no vēstules.</p>' : ''}
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
      if (claimErr || !claimed) { status.textContent = 'Šo ielūgumu jau izmantoja cits e-pasts. Ierakstiet to pašu e-pastu vai palūdziet Rihardam jaunu saiti.'; return; }
    }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + redirectPath } });
    if (!error) { mountCode(root, email, { redirectPath }); return; }
    status.textContent = /database error|not invited|signups/i.test(error.message)
      ? 'Šis e-pasts nav uzaicināts. Rakstiet uz rihards.zeila@gmail.com.'
      : /rate|seconds/i.test(error.message) ? 'Pārāk daudz mēģinājumu. Pagaidiet minūti un mēģiniet vēlreiz.' : `Neizdevās nosūtīt saiti: ${error.message}`;
  });
}

// Step two: the email carries both a link and a 6-digit code. Only the newest email works.
function mountCode(root, email, { redirectPath }) {
  root.innerHTML = `
    <form class="panel login login--code" novalidate>
      <h1 class="h2">Pārbaudiet e-pastu</h1>
      <p class="muted">Nosūtījām vēstuli uz <strong>${esc(email)}</strong> (ja nav, skatieties mēstulēs). Nospiediet pogu vēstulē vai ierakstiet šeit 6 ciparu kodu no tās. Derīga ir tikai jaunākā vēstule.</p>
      <label class="field"><span>Kods no e-pasta</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required></label>
      <button class="btn btn--yellow btn--lg" type="submit">Ienākt</button>
      <p class="login__status muted" role="status"></p>
      <p class="small"><button class="btn btn--ghost btn--sm" type="button" data-back>Cits e-pasts / sūtīt vēlreiz</button></p>
    </form>`;
  const form = root.querySelector('form');
  const status = root.querySelector('.login__status');
  form.code.focus();
  root.querySelector('[data-back]').addEventListener('click', () => mountLogin(root, { redirectPath }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = form.code.value.replace(/\D/g, '');
    if (code.length !== 6) { status.textContent = 'Kodā ir 6 cipari.'; return; }
    status.textContent = 'Pārbaudām…';
    const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
    // On success onAuthStateChange(SIGNED_IN) re-renders the page.
    if (error) status.textContent = /expired|invalid/i.test(error.message)
      ? 'Kods nav derīgs vai novecojis. Pārbaudiet, vai tas ir no jaunākās vēstules, vai sūtiet vēlreiz.'
      : `Neizdevās ienākt: ${error.message}`;
  });
}

export async function currentProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb.from('profiles').select('id, email, role').eq('id', session.user.id).maybeSingle();
  // Signed in but no profile row: say so instead of showing the login form again, which loops forever.
  return data || { id: session.user.id, email: session.user.email, role: null };
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
