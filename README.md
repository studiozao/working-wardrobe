# Working Wardrobe

A no-build, no-dependency landing page used to run a persona-gated desirability test for Working Wardrobe: photograph a bag of clothes, an AI waterfall grades and routes each item to resale, donation, or recycling, and the user gets paid on whatever sells.

Two Meta ad sets drive traffic to this **one page, one URL**. A `persona` query parameter decides which headline and 3-question mini-survey a visitor sees; everything after that (How it works, Why different, FAQ, final capture) is shared and identical.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Markup only. No inline CSS/JS. |
| `style.css` | All styling — design tokens, layout, the survey UI, the routing-cascade animation, reduced-motion overrides. |
| `script.js` | All behaviour — persona + UTM capture, the 3-question hard gate, scroll reveals, the cascade animation trigger, the sticky bar, and the email-capture POST. |

No build step. Open `index.html` directly in a browser, or serve the folder with any static file server.

## How the persona gate works

On load, the page reads a `persona` query param:

- `persona=ss` → **Stalled Seller** copy and questions (someone who already half-tries to sell things)
- `persona=wb` → **Wannabe** copy and questions (someone curious but has never tried)
- anything else, or no param at all → defaults to `ss`

Nothing below the fold — no "How it works", no FAQ, no email form, no sticky bar — is reachable until all 3 questions are answered. This is a hard gate (`body.gated .screen-two { display: none }` in `style.css`), not just something scrolled past.

Answering the persona's keyed question (Q2 for Stalled Seller, Q3 for Wannabe) also sets the **final CTA button text** dynamically — e.g. answering "Don't know what it's worth" changes the button to "Get my free grade" instead of the generic "Get early access". See the `COPY` object at the top of `script.js` for the full copy + CTA mapping per persona.

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

1. Create a new Google Sheet. You don't need to add any tabs or headers yourself — the script creates both tabs (with the right headers) the first time each persona gets a real submission.

2. In the Sheet: **Extensions → Apps Script**. Delete any starter code and paste:

   ```js
   function doPost(e) {
     var data = JSON.parse(e.postData.contents);
     var email = (data.email || '').toString().trim();
     var isValid = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
     if (!isValid) {
       return ContentService.createTextOutput(
         JSON.stringify({ ok: false, error: 'invalid_email' })
       ).setMimeType(ContentService.MimeType.JSON);
     }

     // One tab per persona — their questions mean different things, so a
     // shared "Q2" column would be ambiguous. Persona is implicit in which
     // tab the row lands in, so it's not repeated as its own column.
     var SHEETS = {
       ss: {
         name: 'Stalled Seller',
         headers: ['Timestamp', 'Email', 'Source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'Landing Page',
           "Q1: Got items to sell?", "Q2: What's stopping you?", 'Q3: How many items?']
       },
       wb: {
         name: 'Wannabe',
         headers: ['Timestamp', 'Email', 'Source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'Landing Page',
           'Q1: Have clothes to sell?', 'Q2: Tried selling before?', "Q3: What's put you off?"]
       }
     };
     var config = SHEETS[data.persona] || SHEETS.ss;

     var ss = SpreadsheetApp.getActiveSpreadsheet();
     var sheet = ss.getSheetByName(config.name);
     if (!sheet) {
       sheet = ss.insertSheet(config.name);
       sheet.appendRow(config.headers);
     }

     sheet.appendRow([
       new Date(),
       email,
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
     return ContentService.createTextOutput(
       JSON.stringify({ ok: true })
     ).setMimeType(ContentService.MimeType.JSON);
   }
   ```

3. **Deploy → New deployment → type "Web app"**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click Deploy, authorise it, and copy the Web app URL (ends in `/exec`).

4. Paste that URL into `FORM_ENDPOINT` in `script.js`, replacing `REPLACE_WITH_YOUR_ENDPOINT`. Every valid submission becomes a new row automatically.

**Important:** the fetch in `script.js` sends the request as `text/plain`, not `application/json`. This is deliberate — Apps Script web apps don't implement CORS preflight (`OPTIONS`), and `application/json` would trigger one that fails silently. Don't change that header without also adding a `doOptions()` handler in the script.

## Deploying

Any static host works — GitHub Pages, Netlify, Vercel, S3. Since `index.html` has no build step, pushing to `main` and enabling GitHub Pages on this repo is enough.

## What's deliberately preserved across edits

This page has been iterated on across several rounds. A few things are intentional and shouldn't be casually "cleaned up":

- **No fabricated stats or testimonials.** The one stat used (31% keep a bag that never leaves the house) is real research data, not invented copy.
- **The routing cascade SVG animation** in the "How it works" section is hand-built, not a stock illustration or Lottie file.
- **The email copy never promises payment for the whole bag** — only for whatever actually sells. The one exception, "What if nothing sells?" in the FAQ, is deliberately blunt.
- **Accessibility**: `prefers-reduced-motion` is respected throughout, focus-visible states are explicit, and form errors use `aria-live`/`role="alert"`.
- **Colour has one job each.** `--ochre` is the only action colour (every tappable CTA button) — full saturation on Screen 2, `--ochre-soft` only on Screen 1's question options and progress dots. `--green` never appears on a button; it marks resolution only (the final card, the cascade's resale outcome, the trust checkmarks). Don't reach for green on a new button or ochre-soft on a new Screen 2 CTA — re-read section 5 of the design brief before changing this.
- **One typeface, one job each.** There's no serif/italic anywhere on the page anymore — hierarchy is weight and colour only (`.pain` 500/soft, `.promise` 800/full ink). A serif-italic headline reads as editorial/lifestyle-blog, not the bold flat sans this category's actual Instagram ads use. Don't reintroduce a second typeface without a real reason.
- **The proof card** (item silhouette + grade + route) lives in "How it works" now, right before the cascade — it leads into the cascade as one worked example, not a duplicate of it. It started in the hero and was moved here because it clashed with the bolder sans headline; it's still flagged for design review, and the explicitly stated fallback if it stops earning its place is to cut it, not keep patching it.
