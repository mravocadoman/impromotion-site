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

1. It stamps `?v=<commit>` on the CSS/JS links in every HTML page. SiteGround tells browsers to cache those files for a year.
2. It rsyncs the site's own files over SSH (port 18765) into `www/impromotion.lv/public_html/`. There is no `--delete`, because the old WordPress files still live there.
3. It flushes SiteGround's dynamic cache with `site-tools-client domain-all update id=1 flush_cache=1`.

The repo secrets are `SG_SSH_KEY`, `SG_HOST` and `SG_USER`. The deploy key lives at `~/.ssh/impromotion_siteground` on Rihards' Mac and is imported as "Github" in Site Tools → Devs → SSH Keys Manager.

New top-level files or folders have to be added to the rsync list in the workflow.

## Lead form

The brief form posts to the n8n workflow "Impromotion — mājaslapas pieteikumi" (`/webhook/impromotion-lead`). That workflow saves the lead to the n8n table "Impromotion pieteikumi", e-mails rihards.zeila@gmail.com and pings WhatsApp through CallMeBot.

## Blog

The posts live in `blogs/<slug>/index.html`, built from `blogs/_template.html` (the template is never deployed). After adding a post, add its card to `blogs/index.html` and its URL to `sitemap.xml`.
