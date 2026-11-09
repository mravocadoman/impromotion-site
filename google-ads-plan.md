# Google Ads: Christmas party search campaign

**Status 2026-11-09:** built as a saved draft in account 629-727-4403 ("Impromotion | Search | Ziemassvētki Rīga"), not published. As built: one ad group with all 16 keywords, Rīga 30 km (presence), AI Max text customization and URL expansion off, 10 €/day, max CPC 1,50 €. Sitelinks and call asset not added yet.

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
