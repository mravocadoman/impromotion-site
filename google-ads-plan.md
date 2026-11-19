# Google Ads: Christmas party search campaign

**Status 2026-11-09:** LIVE (enabled) in account "Impromotion" (629-727-4403), campaign "Impromotion | Search | Ziemassvētki Rīga" (id 24448919951). As built: one ad group with all 16 keywords, Rīga 30 km (presence), AI Max text customization and URL expansion off, 10 €/day, max CPC 1,50 €, 4 sitelinks, call asset 20381931. Campaign-specific conversion goal: Submit lead forms only (Pieteikums). WhatsApp/call/e-mail clicks stay a secondary (reporting-only) conversion.

**Check 2026-11-18:** 55,56 € spent since launch, 2 form leads in Supabase (Ads counted 1; the first came before the consent fix), so about 28 € per lead. Changes: 13 phrase negatives added (the planned list had never gone in, plus kozmens, dj, muzikants from the search terms), max CPC cap raised from 1,50 € to 2,00 € (the cap was holding spend near 6 €/day), new sitelink "Cik maksā vadītājs?" to the price post, 4 callouts. Next check: switch to Maximise conversions at 10+ tracked leads; swap the Christmas copy after 20 December.

People searching for an event host in November and December are ready to book now, so search ads catch demand that Meta has to create. Nothing here is live and nothing spends until you confirm a budget.

## Before it can run

1. **Ad account.** Done: 629-727-4403, EUR, billing SIA Stonks.
2. **Conversion tag.** Live in `assets/track.js` (AW-18563708225): `Lead` (form sent, primary goal) and `Contact` (WhatsApp, call or e-mail click, secondary). Create both conversion actions in Google Ads > Goals > Website, category "Submit lead form" and "Contact". Our own Supabase count also stores `utm_source=google`, so leads show up in the admin even without cookie consent.
3. **Budget.** Your number. 10 €/day for 14 days (140 €) is enough to see whether search brings leads before Christmas.

## Campaign

| Setting | Value |
|---|---|
| Type | Search only (no Display, no Search partners) |
| Location | Rīga and 30 km around, people *in* the area |
| Language | Latvian, English |
| Bidding | Maximise clicks with a 1,50 € cap for the first week, then Maximise conversions once 10+ leads are tracked |
| Landing page | https://impromotion.lv/#brief with `?utm_source=google&utm_medium=cpc&utm_campaign=xmas` |
| Schedule | 7:00 to 23:00 |

## Ad groups and keywords (phrase match)

**Christmas party**
"ziemassvētku ballītes vadītājs", "ziemassvētku ballīte uzņēmumam", "ziemassvētku pasākuma izklaide", "korporatīvā ziemassvētku ballīte", "ballītes izklaide darbiniekiem"

**Event host**
"pasākuma vadītājs", "pasākumu vadītājs rīgā", "korporatīvo pasākumu vadītājs", "vakara vadītājs", "ballītes vadītājs", "tamada"

**Improv and show**
"improvizācijas teātris pasākumam", "improvizācijas izrāde", "aktieri pasākumam", "izklaide korporatīvajam pasākumam", "slēptais viesmīlis aktieris"

**Negatives:** darbs, vakance, vakances, cv, bezmaksas, kursi, skola, studijas, bērnu, wikipedia

## Responsive search ad (one per group, same assets)

Headlines (≤ 30 characters, all checked):
1. Pasākuma vadītājs Rīgā
2. Ziemassvētku ballītes vadītājs
3. Improvizācijas aktieri
4. Vakars bez garlaicīgām runām
5. Aktieris viesmīļa lomā
6. Korporatīvo pasākumu vadītājs
7. Latviski un angliski
8. Pieteikt pasākumu
9. Vakars, ko kolēģi atcerēsies
10. 10+ gadi improvizācijā
11. Improvizācijas izrāde ballītē
12. Smiekli bez scenārija
13. Impromotion aktieri
14. Spēles, viktorīnas un šovs
15. Uzņēmuma ballīte ar humoru

Pin headline 2 to position 1 in the Christmas group and headline 1 in the host group.

Descriptions (≤ 90 characters):
1. Vadītājs, slēptās lomas un improvizācijas izrāde jūsu Ziemassvētku ballītē Rīgā.
2. Viens no viesmīļiem ir aktieris, un kolēģi visu vakaru min, kurš tas ir.
3. Atsūtiet datumu un viesu skaitu, un sagatavosim piedāvājumu ar programmu un cenu.
4. Improvizācijas aktieri ar 10+ gadu pieredzi. Strādājam latviski un angliski.

Sitelinks: Slēptās lomas (/#lomas), Aktieri (/#aktieri), Pakalpojumi (/#pakalpojumi), Pieteikt pasākumu (/#brief).
Call asset: +371 20 381 931.

## Success line after 14 days

A lead costs under 30 € and at least one inquiry becomes a call. If not, pause and move the budget to Meta retargeting.

## Parallel campaign: Pasākumu organizēšana (proposal 2026-11-19, NOT built)

Landing page: https://impromotion.lv/pasakumu-organizesana/ (live with this commit). Nothing is built and nothing spends until you confirm the budget.

**Keyword Planner, Latvia, Nov 2025 to Oct 2026 (avg. monthly searches, top-of-page bid low to high):**

| Keyword | Searches | Bid |
|---|---|---|
| pasākumu aģentūra | 140 | 0,82-2,81 € |
| korporatīvie pasākumi | 140 | 1,53-2,58 € |
| pasākumu organizēšana | 90 | 1,12-2,15 € |
| pasākumu organizators | 50 | 0,42-1,24 € (many are job seekers: "vakances" alone is 70) |
| pasākuma aģentūras | 30 | 0,81-3,71 € |
| korporatīvais pasākums | 20 | 0,51-2,14 € |
| korporatīvo pasākumu organizēšana | 20 | 1,02-2,10 € |
| pasākuma organizēšana, pasakumu organizesana, ballīšu organizēšana, konferenču organizēšana, korporatīvo pasākumu aģentūras | 10 each | |

Russian is negligible (организация мероприятий, ивент агентство: 10 each). The only Russian term with volume is "новогоднего корпоратива" (110), which is mostly people looking for party ideas, so it is not worth a Russian ad group.

**Market size:** about 500 relevant searches a month in all of Latvia, roughly double that in November and December. This is a small, high-intent pocket, not a volume channel.

**Proposed build:**
- Campaign "Impromotion | Search | Pasākumu organizēšana": Search only, Latvia (presence), Latvian and English, Max clicks with a CPC cap of 2,50 €, 5 €/day (about 150 €/month).
- Ad group "Organizēšana": "pasākumu organizēšana", "pasākuma organizēšana", "pasakumu organizesana", "korporatīvo pasākumu organizēšana", "pasākumu organizators", "pasākumu aģentūra", "pasākuma aģentūras", "event aģentūra".
- Ad group "Korporatīvie": "korporatīvie pasākumi", "korporatīvais pasākums", "korporatīvo pasākumu aģentūras".
- Negatives: vakances, vakance, darbs, alga, cv, prakse, izglītība, studijas, kursi, augstskola, kāzu, kāzas, bērnu, dzimšanas, sporta, eži (a competitor's brand). Add the same "organizēšana" phrases as negatives in the Christmas campaign, so the two don't bid against each other.
- Expectation: 20-40 clicks a month and 1-3 leads. Judge it after 30 days on cost per lead against the Christmas campaign's ~28 €. A single organised event is worth far more than one host booking, so a higher cost per lead is acceptable here.
