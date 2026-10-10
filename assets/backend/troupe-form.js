// The troupe profile form, shared by the actor portal (troupe admin edits own troupe) and the admin page.
import { sb, SOCIALS, photoUrl, isHttps, esc, toast, shrinkImage } from './sb.js';

export function renderTroupeForm(root, troupe, { admin = false, members = [], onSaved } = {}) {
  const t = { socials: {}, ...troupe };
  root.innerHTML = `
    <form class="actor-form" novalidate>
      <div class="actor-form__top">
        <div class="photo-pick">
          <img class="photo-pick__img" src="${esc(photoUrl(t.logo_path)) || '/assets/img/apple-touch-icon.png'}" alt="">
          <label class="btn btn--ghost btn--sm">Mainīt logo<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-logo></label>
          <p class="muted small">Logo vai kopbilde. Kvadrāts, max 3 MB.</p>
        </div>
        <div class="actor-form__names">
          <label class="field"><span>Kolektīva nosaukums</span><input name="name" value="${esc(t.name)}" maxlength="80" required></label>
          <label class="field"><span>Viens teikums par kolektīvu <em class="count" data-count="tagline"></em></span><input name="tagline" value="${esc(t.tagline)}" maxlength="120" placeholder="Piemēram: Improvizācija, kas notiek tieši tagad"></label>
          <p class="status-badge status-badge--${t.show_on_site ? 'approved' : 'draft'}">${t.show_on_site ? 'Redzama mājaslapā' : 'Vēl nav mājaslapā'}</p>
        </div>
      </div>

      <label class="field"><span>Par kolektīvu <em class="count" data-count="description"></em></span><textarea name="description" rows="7" maxlength="2000" placeholder="Kas jūs esat, ko spēlējat, kur var redzēt jūsu izrādes">${esc(t.description)}</textarea></label>
      <div class="grid2">
        <label class="field"><span>Pilsēta</span><input name="city" value="${esc(t.city)}" maxlength="60" placeholder="Rīga"></label>
        <label class="field"><span>Dibināta (gads)</span><input type="number" name="founded_year" value="${esc(t.founded_year)}" min="1950" max="2100"></label>
      </div>

      <fieldset><legend>Saites</legend>
        <div class="grid2">
          <label class="field"><span>Mājaslapa</span><input type="url" name="website" value="${esc(t.website)}" placeholder="https://"></label>
          ${SOCIALS.map((s) => `<label class="field"><span>${s}</span><input type="url" name="social_${s}" value="${esc(t.socials?.[s])}" placeholder="https://"></label>`).join('')}
        </div>
      </fieldset>

      ${members.length ? `<fieldset><legend>Kolektīva aktieri</legend>
        <ul class="plain-list">${members.map((m) => `<li><span>${esc(m.full_name)}${m.stage_name ? ` <span class="muted">“${esc(m.stage_name)}”</span>` : ''}</span><span class="muted small">${m.claimed ? (m.show_on_site && m.status === 'approved' ? 'mājaslapā' : 'profils nav publisks') : 'vēl nav pieslēdzies'}</span></li>`).join('')}</ul>
        ${admin ? '' : '<p class="muted small">Jaunus aktierus kolektīvam pievieno Impromotion. Raksti Rihardam.</p>'}
      </fieldset>` : ''}

      ${admin ? `
      <fieldset class="admin-only"><legend>Admins</legend>
        <div class="grid2">
          <label class="field"><span>Kolektīva admins</span><select name="admin_actor_id"><option value="">Nav</option>${members.map((m) => `<option value="${m.id}" ${t.admin_actor_id === m.id ? 'selected' : ''}>${esc(m.full_name)}</option>`).join('')}</select></label>
          <label class="field"><span>Adrese (slug)</span><input name="slug" value="${esc(t.slug)}" pattern="[a-z0-9\-]+" maxlength="60"></label>
        </div>
        <label class="check"><input type="checkbox" name="show_on_site" ${t.show_on_site ? 'checked' : ''}> Rādīt kolektīvu mājaslapā</label>
      </fieldset>` : t.approved ? `
      <fieldset><legend>Redzamība</legend>
        <label class="check"><input type="checkbox" name="show_on_site" ${t.show_on_site ? 'checked' : ''}> Rādīt kolektīvu impromotion.lv mājaslapā</label>
        <p class="muted small">Izmaiņas aprakstā Impromotion apskatīs pēc saglabāšanas.</p>
      </fieldset>` : '<p class="muted small">Pēc saglabāšanas Impromotion izmaiņas apskatīs un ieliks kolektīvu mājaslapā.</p>'}

      <div class="actor-form__actions"><button class="btn btn--yellow btn--lg" type="submit">Saglabāt</button></div>
    </form>`;

  const form = root.querySelector('form');
  let newLogoPath = null;

  const updateCount = (n) => { const el = form.querySelector(`[data-count="${n}"]`); el.textContent = `${form[n].value.length}/${form[n].maxLength}`; };
  ['tagline', 'description'].forEach((n) => { updateCount(n); form[n].addEventListener('input', () => updateCount(n)); });

  form.querySelector('[data-logo]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const blob = await shrinkImage(file);
    const { data: { user } } = await sb.auth.getUser();
    // Same bucket and folder rule as actor photos: you may only write into your own user folder.
    const path = `${user.id}/troupe-${Date.now()}.webp`;
    const { error } = await sb.storage.from('actor-photos').upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (error) { toast(`Logo neaugšupielādējās: ${error.message}`, 'error'); return; }
    newLogoPath = path;
    form.querySelector('.photo-pick__img').src = photoUrl(path);
    toast('Logo augšupielādēts. Nospiediet "Saglabāt".');
  });

  let saving = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    const fd = new FormData(form);
    const row = {
      name: fd.get('name').trim(),
      tagline: fd.get('tagline').trim() || null,
      description: fd.get('description').trim() || null,
      city: fd.get('city').trim() || null,
      founded_year: fd.get('founded_year') ? Number(fd.get('founded_year')) : null,
      website: fd.get('website').trim() || null,
      socials: Object.fromEntries(SOCIALS.map((s) => [s, fd.get(`social_${s}`).trim()]).filter(([, v]) => v)),
    };
    if (newLogoPath) row.logo_path = newLogoPath;
    if (!admin && t.approved) row.show_on_site = fd.has('show_on_site');
    if (admin) {
      row.admin_actor_id = fd.get('admin_actor_id') || null;
      row.slug = fd.get('slug').trim() || t.slug;
      row.show_on_site = fd.has('show_on_site');
      row.needs_review = false;
    }
    if (!row.name) return toast('Ierakstiet kolektīva nosaukumu.', 'error');
    const badLink = [row.website, ...Object.values(row.socials)].find((u) => u && !isHttps(u));
    if (badLink) return toast('Saitēm jāsākas ar https://', 'error');
    saving = true;
    const { error } = await sb.from('troupes').update(row).eq('id', t.id);
    saving = false;
    if (error) return toast(`Neizdevās saglabāt: ${error.message}`, 'error');
    toast('Kolektīva profils saglabāts.');
    onSaved?.();
  });
}
