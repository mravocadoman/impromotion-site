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

Upload `index.html`, `styles.css`, `main.js` and `assets/` to any static host (Cloudflare Pages, Netlify, Vercel, or plain hosting), then point the impromotion.lv DNS at it.

The contact form has no backend. It opens WhatsApp (+371 26673384) or a mailto to rihards.zeila@gmail.com with the message already written.
