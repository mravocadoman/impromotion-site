# Impromotion

impromotion.lv rebuilt from WordPress (Divi) into a hand-coded static site. Single page, Latvian, no build step, no dependencies.

## Files

- `index.html`: all content
- `styles.css`: all styles (tokens at the top of `:root`)
- `main.js`: interactions (spotlight hero, scene slot machine, flip-card game, actor modal, ticket pre-fill, WhatsApp/e-mail brief)
- `assets/img/`: optimized images
- `_source/`: original WordPress images and HTML, for reference only. **Do not deploy.**

## Run locally

```bash
python3 -m http.server 4173
```

## Deploy

Push to `main` and GitHub Actions deploys it (`.github/workflows/deploy.yml`):

1. It stamps `?v=<commit>` on every link to our own CSS, JS and images in every HTML page. SiteGround tells browsers to cache those files for a year, so without this a replaced image keeps its old cached copy.
2. It rsyncs the site's own files over SSH (port 18765) into `www/impromotion.lv/public_html/`. There is no `--delete`, because the old WordPress files still live there.
3. It flushes SiteGround's dynamic cache with `site-tools-client domain-all update id=1 flush_cache=1`.

The repo secrets are `SG_SSH_KEY`, `SG_HOST` and `SG_USER`. The deploy key lives at `~/.ssh/impromotion_siteground` on Rihards' Mac and is imported as "Github" in Site Tools → Devs → SSH Keys Manager.

New top-level files or folders have to be added to the rsync list in the workflow.

## Lead form

The brief form posts to the n8n workflow "Impromotion — mājaslapas pieteikumi" (`/webhook/impromotion-lead`). That workflow saves the lead to the n8n table "Impromotion pieteikumi", e-mails rihards.zeila@gmail.com and pings WhatsApp through CallMeBot.

## Blog

The posts live in `blogs/<slug>/index.html`, built from `blogs/_template.html` (the template is never deployed). After adding a post, add its card to `blogs/index.html` and its URL to `sitemap.xml`.

## Actor backend

Supabase project `impromotion` (ref `cflnjdiwipwkcnepunpd`, eu-north-1). The schema, access rules and seed are in `supabase/migrations/`. Apply new migrations with `supabase db push`; the DB password is in `~/.config/impromotion/supabase-db-password` on Rihards' Mac.

- `/aktieriem/`: actor portal. Magic-link login; only invited emails can create an account.
- `/admin/`: admin. Actors, invites, troupes, bookings ("haltūras"), and a "free on date" filter.
- The homepage reads approved profiles through the `public_actors()` RPC. The static cards in `index.html` are only a fallback for when the API is unreachable.
- When a profile is submitted or a live one changes, the database calls the n8n workflow "Impromotion — aktieru profilu paziņojumi" through pg_net, and that workflow sends a Telegram message.
- Auth email: Supabase's built-in SMTP only reaches project team members. Real actors need the custom SMTP in Supabase → Authentication → Emails.

## Site nav

Every public page carries the same nav markup. Change it in `tools/sync-nav.py` and run `python3 tools/sync-nav.py`; new top-level page folders also go into its `PUBLIC` list and into the rsync list in `.github/workflows/deploy.yml`.
