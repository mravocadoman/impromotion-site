#!/usr/bin/env python3
"""Write the one shared site nav into every public page. Edit NAV below, then run: python3 tools/sync-nav.py

Pages keep their own nav markup (static site, no build step); this script is the single source for it.
The admin page has its own nav and is not touched.
"""
import re, subprocess, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ('index.html', 'blogs', 'pakalpojumi', 'pasakumu-organizesana', 'korporativie-treningi',
          'komandas-saliedesana', 'pievienojies', 'aktieriem')
# Pages with their own brief form: "Sazināties" jumps to it instead of the homepage contact section.
OWN_FORM = ('pasakumu-organizesana', 'korporativie-treningi', 'komandas-saliedesana')


def nav(f):
    top = f.split('/')[0]

    def cur(href):
        on = (href == '/blogs/' and top == 'blogs') or (href.strip('/') == top and top != 'index.html')
        return ' aria-current="page"' if on else ''

    cta = '#pieteikums' if top in OWN_FORM else '/#kontakti'
    app = ('\n      <span class="app-nav" id="app-nav" hidden><a href="/admin/" id="admin-link" hidden>Admins</a>'
           '<button class="btn btn--ghost btn--sm" type="button" id="logout">Iziet</button></span>') if top == 'aktieriem' else ''
    return f'''<nav class="nav__links" id="nav-links">
      <div class="nav__group">
        <a href="/pakalpojumi/"{cur('/pakalpojumi/')}>Pakalpojumi <span class="nav__caret" aria-hidden="true">▾</span></a>
        <div class="nav__menu">
          <a href="/pasakumu-organizesana/"{cur('/pasakumu-organizesana/')}>📋 Pasākumu organizēšana</a>
          <a href="/korporativie-treningi/"{cur('/korporativie-treningi/')}>🎯 Korporatīvie treniņi</a>
          <a href="/komandas-saliedesana/"{cur('/komandas-saliedesana/')}>🤝 Komandas saliedēšana</a>
          <a href="/pakalpojumi/#vaditaji">🎤 Pasākumu vadīšana</a>
          <a href="/pakalpojumi/#lomas">🕵️ Slēptās lomas un izrādes</a>
          <a href="/pakalpojumi/">🗂️ Visi pakalpojumi</a>
        </div>
      </div>
      <a href="/#aktieri">Aktieri</a>
      <a href="/blogs/"{cur('/blogs/')}>Blogs</a>
      <div class="nav__group">
        <a class="nav__login" href="/aktieriem/"{cur('/aktieriem/')}>Aktieriem <span class="nav__caret" aria-hidden="true">▾</span></a>
        <div class="nav__menu">
          <a href="/pievienojies/"{cur('/pievienojies/')}>🎭 Pievienoties komandai</a>
          <a href="/aktieriem/">🔑 Ienākt profilā</a>
        </div>
      </div>{app}
      <a class="btn btn--sm btn--yellow" href="{cta}">Sazināties</a>
    </nav>'''


files = [f for f in subprocess.check_output(['git', 'ls-files', '*.html'], cwd=ROOT, text=True).split()
         if f.split('/')[0] in PUBLIC]
files += [str(p.relative_to(ROOT)) for d in PUBLIC if (ROOT / d).is_dir() for p in (ROOT / d).glob('index.html')
          if str(p.relative_to(ROOT)) not in files]
for f in sorted(set(files)):
    path = ROOT / f
    s = path.read_text(encoding='utf-8')
    new, n = re.subn(r'<nav class="nav__links" id="nav-links">.*?</nav>', lambda m: nav(f), s, count=1, flags=re.S)
    if n and new != s:
        path.write_text(new, encoding='utf-8')
        print('updated', f)
