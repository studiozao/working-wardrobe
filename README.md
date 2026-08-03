# Working Wardrobe

A no-build, no-dependency landing page used to run a persona-targeted desirability test for Working Wardrobe: photograph a bag of clothes, an AI waterfall grades and routes each item to resale, donation, or recycling, and the user gets paid on whatever sells.

Two Meta ad sets drive traffic to this **one page, one URL**. A `persona` query parameter decides the headline, lede, camera-hook copy, and 3-question survey a visitor sees.

This is design direction **"1a — Proof First"**, led by an interactive camera-hook demo, with a hybrid gate: the survey itself is "soft" — all three questions are visible and answerable at once, in any order — but everything below the survey (How it works, Why bother, final capture, footer) is hard-hidden (`display:none`) until all three are answered, same as an earlier iteration of this page. A sticky bottom CTA bar appears once unlocked and the hero has scrolled out of view.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Markup only. No inline CSS/JS. |
| `style.css` | All styling — design tokens, layout, the camera-hook demo, the survey UI, the routing-cascade animation, reduced-motion overrides. |
| `script.js` | All behaviour — persona + UTM capture, the camera-hook demo, the survey + hard-gate reveal, scroll reveals, the cascade animation trigger, the sticky bar, and the email-capture POST. |

No build step. Open `index.html` directly in a browser, or serve the folder with any static file server.

Uses two Google Fonts: Schibsted Grotesk (body/display) and IBM Plex Mono (small uppercase labels/counters) — loaded via a `<link>` in `index.html`. This is a deliberate choice of design 1a; earlier iterations of this page were intentionally system-font-only to avoid a render-blocking font request on cold mobile ad traffic. That tradeoff is now accepted since it's what the chosen design specifies.

## How the persona targeting works

On load, the page reads a `persona` query param:

- `persona=ss` → **Stalled Seller** copy and questions (someone who already half-tries to sell things)
- `persona=wb` → **Wannabe** copy and questions (someone curious but has never tried)
- anything else, or no param at all → defaults to `ss`

The hero headline, lede, camera-hook note, survey questions, reassurance line, and post-signup message are all persona-specific — see the `COPY` object at the top of `script.js`.

Answering the persona's keyed question (Q2 for Stalled Seller, Q3 for Wannabe) sets the **CTA button text** dynamically and live — e.g. answering "Don't know what it's worth" changes the button to "Get my free grade" instead of the generic "Get early access", updating immediately as they tap, not just once at the end. It also may surface an **answer-echo** line in "Why bother" (e.g. "You said the haggling's the worst part — here's what replaces it") — hidden for fallback answers like "Something else".

There are three CTA touchpoints, all sharing the same dynamic text: a button right under the survey (locked/dimmed until all 3 are answered — clicking it scrolls to the real form and focuses the email field, it doesn't collect email itself), the sticky bottom bar (visible once unlocked and the hero is scrolled past), and the actual email form in the final green card at the bottom of the page.

## What's different from the very first pass at design 1a

Design 1a was first implemented as a fully "soft" gate — nothing hidden below the survey, the CTA just dimming until complete. That was reverted: everything below the survey (How it works onward, including the footer) is hidden via `body.gated .screen-two { display: none }` until all 3 questions are answered, same mechanism as an earlier iteration of this page, with a fade/slide-in transition (`.screen-two.revealing`) on unlock rather than an instant cut. The sticky bar was also brought back. The FAQ section and the three-checkmark trust strip remain dropped — neither is part of design 1a's layout, so they'd need to be reintroduced deliberately if wanted.

**Known bug fixed in this pass:** the camera-hook demo's item-name text ("Wool jumper") was invisible — it shared the class name `.item` with the routing cascade's travelling squares, which sets `.item { opacity: 0 }` globally. Renamed to `.hook-item-name`. A small hand-drawn SVG icon (same inline style as the proof card) was also added next to the item name and price, so the reveal shows a graphic alongside the text, not just numbers.

## Ad links — persona + UTM tags

Both the persona and standard UTM parameters travel in the query string and are cached in `sessionStorage` on first load, so they survive Instagram's in-app browser stripping the query string on an internal redirect.

```
Stalled Seller ad set, effort hook:
  https://yourdomain.com/
    ?persona=ss&utm_source=instagram&utm_medium=paid_social
    &utm_campaign=stalled_seller&utm_content=hook_effort

Wannabe ad set, curiosity hook:
  https://yourdomain.com/
    ?persona=wb&utm_source=instagram&utm_medium=paid_social
    &utm_campaign=wannabe&utm_content=hook_curiosity
```

Give each ad creative its own `utm_content` value — no code changes needed to add a third or fourth ad.

## Collecting sign-ups in a Google Sheet

The email form POSTs to `FORM_ENDPOINT` (set at the top of `script.js`). It's a placeholder until you wire it up — until then, submissions just show the success state without saving anything, which is fine for previewing the page.

To collect real sign-ups in a Google Sheet with no separate backend:

**Each persona gets its own tab, not a shared sheet.** Stalled Seller and Wannabe ask three different questions — a single "Q2" column would mean "what's stopping you" for one persona and "have you tried selling before" for the other, which is confusing the moment both are in the same view. The script below routes each submission to a **"Stalled Seller"** tab or a **"Wannabe"** tab (auto-created on first submission, with headers that match that persona's actual questions), inside the same spreadsheet.

**Drop-off is tracked too, not just completed sign-ups.** `script.js` fires a beacon the instant each survey question is answered — not just on final email submit — so a visitor who answers Q1 and closes the tab still shows up in the data. These land in a separate **"Stalled Seller - Funnel"** / **"Wannabe - Funnel"** tab (also auto-created), keyed by an anonymous `session_id`, so your real sign-up tabs stay a clean list of actual leads rather than being mixed with abandoned attempts.

1. Create a new Google Sheet. You don't need to add any tabs or headers yourself — the script creates all four tabs (with the right headers) the first time each persona/event type gets a real submission.

2. In the Sheet: **Extensions → Apps Script**. Delete any starter code and paste:

   ```js
   function doPost(e) {
     var data = JSON.parse(e.postData.contents);
     var ss = SpreadsheetApp.getActiveSpreadsheet();

     if (data.event === 'funnel') {
       return logFunnelEvent(ss, data);
     }
     return logSignup(ss, data);
   }

   // Real sign-ups only — requires a valid email. One tab per persona,
   // since their questions mean different things (a shared "Q2" column
   // would be ambiguous). Persona is implicit in which tab the row lands
   // in, so it's not repeated as its own column.
   function logSignup(ss, data) {
     var email = (data.email || '').toString().trim();
     var isValid = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
     if (!isValid) {
       return jsonOut({ ok: false, error: 'invalid_email' });
     }

     var SHEETS = {
       ss: {
         name: 'Stalled Seller',
         headers: ['Timestamp', 'Email', 'Session ID', 'Source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'Landing Page',
           "Q1: Got items to sell?", "Q2: What's stopping you?", 'Q3: How many items?']
       },
       wb: {
         name: 'Wannabe',
         headers: ['Timestamp', 'Email', 'Session ID', 'Source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'Landing Page',
           'Q1: Have clothes to sell?', 'Q2: Tried selling before?', "Q3: What's put you off?"]
       }
     };
     var config = SHEETS[data.persona] || SHEETS.ss;
     var sheet = getOrCreateSheet(ss, config.name, config.headers);

     sheet.appendRow([
       new Date(),
       email,
       data.session_id || '',
       data.source || '',
       data.utm_source || '',
       data.utm_medium || '',
       data.utm_campaign || '',
       data.utm_content || '',
       data.page_url || '',
       data.q1 || '',
       data.q2 || '',
       data.q3 || ''
     ]);
     return jsonOut({ ok: true });
   }

   // Fired after every single question, whether or not they ever submit an
   // email. No email column here on purpose — this tab is for counting
   // how far people get, not for contacting them.
   function logFunnelEvent(ss, data) {
     var FUNNEL_SHEETS = {
       ss: { name: 'Stalled Seller - Funnel' },
       wb: { name: 'Wannabe - Funnel' }
     };
     var headers = ['Timestamp', 'Session ID', 'Stage', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'Landing Page', 'Q1', 'Q2', 'Q3'];
     var config = FUNNEL_SHEETS[data.persona] || FUNNEL_SHEETS.ss;
     var sheet = getOrCreateSheet(ss, config.name, headers);

     sheet.appendRow([
       new Date(),
       data.session_id || '',
       data.stage || '',
       data.utm_source || '',
       data.utm_medium || '',
       data.utm_campaign || '',
       data.utm_content || '',
       data.page_url || '',
       data.q1 || '',
       data.q2 || '',
       data.q3 || ''
     ]);
     return jsonOut({ ok: true });
   }

   function getOrCreateSheet(ss, name, headers) {
     var sheet = ss.getSheetByName(name);
     if (!sheet) {
       sheet = ss.insertSheet(name);
       sheet.appendRow(headers);
     }
     return sheet;
   }

   function jsonOut(obj) {
     return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
   }
   ```

3. **Deploy → New deployment → type "Web app"**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click Deploy, authorise it, and copy the Web app URL (ends in `/exec`).

4. Paste that URL into `FORM_ENDPOINT` in `script.js`, replacing `REPLACE_WITH_YOUR_ENDPOINT`. Every valid submission becomes a new row automatically.

**Reading the funnel data:** each row in a `- Funnel` tab is one moment someone answered a question — `Stage` is `q1`, `q2`, or `q3`, and the `Q1`/`Q2`/`Q3` columns show every answer given up to that point. To see drop-off, count distinct `Session ID`s per stage — e.g. if 100 sessions have a `q1` row but only 40 have a `q3` row, 60% dropped off somewhere in the survey. A session that also completed sign-up will have the same `Session ID` in both the `- Funnel` tab and the persona's main tab, so you can cross-reference which drop-offs did or didn't come back and convert within the same visit.

**If you already have "Stalled Seller"/"Wannabe" tabs from before this change:** they won't automatically pick up the new "Session ID" column or the funnel tabs. Easiest fix is to delete those two tabs (they should only have test rows in them) and let the script recreate them with the new headers on the next submission — or manually add a "Session ID" header to the existing tabs if you want to keep the rows already in them.

**Important:** the fetch in `script.js` sends the request as `text/plain`, not `application/json`. This is deliberate — Apps Script web apps don't implement CORS preflight (`OPTIONS`), and `application/json` would trigger one that fails silently. Don't change that header without also adding a `doOptions()` handler in the script.

## Deploying

Any static host works — GitHub Pages, Netlify, Vercel, S3. Since `index.html` has no build step, pushing to `main` and enabling GitHub Pages on this repo is enough.

## What's deliberately preserved across edits

This page has been iterated on across several rounds. A few things are intentional and shouldn't be casually "cleaned up":

- **No fabricated stats or testimonials.** Don't invent a number or quote to strengthen the "why bother" section — if a real one isn't available, leave it out (as it currently is) rather than make one up.
- **The routing cascade SVG animation** in the "How it works" section is hand-built, not a stock illustration or Lottie file. The camera-hook demo (item silhouette, grade, route) uses the same hand-built inline-SVG/CSS approach — no stock photography, no generic illustration, no Lottie.
- **The email copy never promises payment for the whole bag** — only for whatever actually sells.
- **Accessibility**: `prefers-reduced-motion` is respected throughout (including the camera-hook's flash/scan/reveal animations), focus-visible states are explicit, and form errors use `role="alert"`.
- **Colour has one job each.** `--ochre` is the only action colour (every tappable CTA button). `--green` never appears on a button; it marks resolution only (the final card, the cascade's resale outcome). Don't reach for green on a new button.
- **One typeface pairing, one job each.** Schibsted Grotesk for body/display, IBM Plex Mono only for small uppercase labels/counters (eyebrows, the survey count, the camera caption). Don't introduce a third face without a real reason.
- **The proof card** (item silhouette + grade + route) lives in "How it works" now, right before the cascade — it leads into the cascade as one worked example, not a duplicate of it. It started in the hero and was moved here because it clashed with the bolder sans headline; it's still flagged for design review, and the explicitly stated fallback if it stops earning its place is to cut it, not keep patching it.
