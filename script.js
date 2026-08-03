/* ==========================================================================
   EMAIL ENDPOINT — set this once and both forms use it.
   Leave as-is and forms will show the success state without saving anything,
   which is fine for a quick preview. Replace before running real traffic.
   See README.md for the full Google Sheet + Apps Script setup.
   ========================================================================== */
var FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycbw2ydmM5X2sXiCZ3FvUaJLhvoEeai1kPGjROVquAPLKuudjL0tPAO6JESIFM7Ah-arZ/exec";

/* ---- Capture which ad this visit came from (UTM params) ----
   Read once on load, then cached in sessionStorage so it still travels
   with the sign-up even if the visitor lingers, scrolls, or the params
   get stripped by an in-app browser redirect (common on Instagram). */
var AD_SOURCE = (function () {
  var KEY = 'ww_ad_source';
  var params = new URLSearchParams(window.location.search);
  var fromUrl = {
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '',
    utm_content: params.get('utm_content') || ''
  };
  var hasUrlValue = Object.keys(fromUrl).some(function (k) { return fromUrl[k]; });

  try {
    if (hasUrlValue) {
      sessionStorage.setItem(KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    var cached = sessionStorage.getItem(KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* sessionStorage unavailable (privacy mode etc.) — fall through */ }

  return fromUrl;
})();

/* ---- Which persona is this visit? (persona query param) ----
   Same pattern as AD_SOURCE above: read from the URL, cache in
   sessionStorage, fall back to the cached value if the param is missing
   on a later view within the session (Instagram's in-app browser can
   strip query params on redirect). Falls back to "ss" if absent or
   invalid, so a bare link renders a sensible page rather than breaking. */
var PERSONA = (function () {
  var KEY = 'ww_persona';
  var VALID = ['ss', 'wb'];
  var fromUrl = new URLSearchParams(window.location.search).get('persona');

  try {
    if (fromUrl && VALID.indexOf(fromUrl) !== -1) {
      sessionStorage.setItem(KEY, fromUrl);
      return fromUrl;
    }
    var cached = sessionStorage.getItem(KEY);
    if (cached && VALID.indexOf(cached) !== -1) return cached;
  } catch (e) { /* sessionStorage unavailable (privacy mode etc.) — fall through */ }

  return 'ss';
})();

/* ---- Anonymous per-visit session id ----
   Lets funnel-drop-off rows (see sendFunnelBeacon below) be told apart
   from each other, and optionally cross-referenced against a completed
   sign-up from the same session. Cached the same way as AD_SOURCE/
   PERSONA — generated once, then reused for the rest of this tab's
   session, no PII involved. */
var SESSION_ID = (function () {
  var KEY = 'ww_session_id';
  try {
    var cached = sessionStorage.getItem(KEY);
    if (cached) return cached;
    var id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('sid-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    sessionStorage.setItem(KEY, id);
    return id;
  } catch (e) {
    return 'sid-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }
})();

/* ---- Funnel drop-off tracking ----
   Fires the instant each survey question is answered — not just on final
   email submit — so a visitor who answers Q1 then leaves still shows up
   in the data, not just the people who convert. Uses navigator.sendBeacon
   so it survives the page unloading immediately after the tap. Failures
   are swallowed on purpose: a dropped analytics beacon must never surface
   as an error to the visitor. See README.md for how these land in a
   "<Persona> - Funnel" Sheet tab, separate from real sign-ups. */
var SURVEY_ANSWERS = { q1: null, q2: null, q3: null };

function sendFunnelBeacon(stage) {
  if (!FORM_ENDPOINT || FORM_ENDPOINT.indexOf('REPLACE_WITH') === 0) return;

  var payload = JSON.stringify({
    event: 'funnel',
    session_id: SESSION_ID,
    persona: PERSONA,
    stage: stage,
    utm_source: AD_SOURCE.utm_source,
    utm_medium: AD_SOURCE.utm_medium,
    utm_campaign: AD_SOURCE.utm_campaign,
    utm_content: AD_SOURCE.utm_content,
    page_url: window.location.href,
    q1: SURVEY_ANSWERS.q1,
    q2: SURVEY_ANSWERS.q2,
    q3: SURVEY_ANSWERS.q3
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(FORM_ENDPOINT, new Blob([payload], { type: 'text/plain;charset=utf-8' }));
    } else {
      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
        keepalive: true
      }).catch(function () {});
    }
  } catch (e) { /* analytics must never break the page */ }
}

/* ---- Design 1a copy table ----
   Headline/lede are persona-specific here (unlike the previous build) —
   this is what design 1a specifies. Question wording, CTA mapping, and
   echo mapping are unchanged from before. */
var COPY = {
  ss: {
    head: "Stock that stalled. One photo and it moves.",
    lede: "You've already listed things. This is the same outcome without the evening it usually costs.",
    hookNote: "Tap the shutter — that's the whole job.",
    reassure: "Free to grade. We take a cut only from what sells.",
    doneLine: "We'll email you the moment your grades are ready to run.",
    // Which question's answer drives the answer-echo in "Why bother".
    // The CTA itself is a static "Get early access" everywhere now.
    echoKey: 'q2',
    echoMap: {
      "Don't know what it's worth": "You said you don't know what it's worth — that's the part we do.",
      "Takes too much time to list": "You said listing takes too much time — here it's one photo, not an evening.",
      "Don't want to deal with buyers and the admin": "You said the admin's the worst part — here's what replaces it."
    },
    questions: [
      {
        key: 'q1',
        text: "Do you have items you could sell but haven't got round to listing?",
        options: ['Yes', 'Not really']
      },
      {
        key: 'q2',
        text: "What's stopping you?",
        options: [
          "Don't know what it's worth",
          'Takes too much time to list',
          "Don't want to deal with buyers and the admin",
          'Something else'
        ]
      },
      {
        key: 'q3',
        text: 'Roughly how many items are we talking about, at this moment in time?',
        options: ['1 to 5', '6 to 15', 'More than 15']
      }
    ]
  },
  wb: {
    head: "Never sold a thing? Start with a photo.",
    lede: "No listings, no pricing, nothing to learn. You take one picture and we'll tell you what's there.",
    hookNote: "Have a go — nothing happens until you say so.",
    reassure: "Nothing to pay, nothing to learn. You can stop at any point.",
    doneLine: "We'll email you a free test grade first, so you can see it before you commit to anything.",
    echoKey: 'q3',
    echoMap: {
      "Not sure it's worth the effort": "You weren't sure it's worth the effort — here's the proof.",
      "Don't know how to get started": "You didn't know where to start — here's exactly how it works.",
      "Don't think my stuff is worth much": "You weren't sure your stuff was worth much — here's how we find out."
    },
    questions: [
      {
        key: 'q1',
        text: "Do you have clothes at home you think you could sell but haven't tried?",
        options: ['Yes', 'Not really']
      },
      {
        key: 'q2',
        text: 'Have you ever tried selling clothes online before?',
        options: ['Never tried', 'Tried once or twice, then stopped', 'Sell regularly']
      },
      {
        key: 'q3',
        text: "What's put you off?",
        options: [
          "Not sure it's worth the effort",
          "Don't know how to get started",
          "Don't think my stuff is worth much",
          "Just haven't got round to it"
        ]
      }
    ]
  }
};

var copy = COPY[PERSONA] || COPY.ss;
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- Hero + camera hook + survey ---- */
(function () {
  var headEl = document.getElementById('hero-head');
  var ledeEl = document.getElementById('hero-lede');
  if (headEl) headEl.textContent = copy.head;
  if (ledeEl) ledeEl.textContent = copy.lede;

  var hookNoteEl = document.getElementById('hook-note');
  if (hookNoteEl) hookNoteEl.textContent = copy.hookNote;

  var reassureEl = document.getElementById('survey-reassure');
  if (reassureEl) reassureEl.textContent = copy.reassure;

  var doneLineEl = document.getElementById('done-line');
  if (doneLineEl) doneLineEl.textContent = copy.doneLine;

  /* ---- Camera hook: one-shot tap-to-demo ----
     Fixed example content, same for both personas — illustrative proof
     of mechanism, not tied to a real photo. Idle -> scanning (flash +
     scan sweep) -> revealed (worked example shown, shutter hidden). */
  var frame = document.getElementById('hook-frame');
  var shutter = document.getElementById('hook-shutter');
  if (frame && shutter) {
    shutter.addEventListener('click', function () {
      if (frame.classList.contains('scanning') || frame.classList.contains('revealed')) return;
      frame.classList.add('scanning');
      shutter.textContent = 'Grading…';
      var delay = reduceMotion ? 0 : 1100;
      setTimeout(function () {
        frame.classList.remove('scanning');
        frame.classList.add('revealed');
      }, delay);
    });
  }

  /* ---- Survey: soft gate ----
     All three questions render at once; answers are changeable any time
     by tapping a different pill. The CTA dims until all three have an
     answer, but nothing below is ever hidden. */
  var questionsEl = document.getElementById('survey-questions');
  var barFillEl = document.getElementById('survey-bar-fill');
  var countEl = document.getElementById('survey-count');
  var progressEl = document.getElementById('survey-progress');
  var ctaWrapEl = document.getElementById('survey-cta-wrap');
  var ctaBtnEl = document.getElementById('survey-cta-btn');

  function answeredCount() {
    return copy.questions.filter(function (q) { return SURVEY_ANSWERS[q.key]; }).length;
  }

  function updateEcho() {
    var echoEl = document.getElementById('answer-echo');
    if (!echoEl) return;
    var echoText = copy.echoMap[SURVEY_ANSWERS[copy.echoKey]];
    if (echoText) {
      echoEl.textContent = echoText;
      echoEl.classList.add('show');
    } else {
      echoEl.classList.remove('show');
    }
  }

  // Unlocks Screen 2 the moment all 3 are answered — a one-way reveal,
  // not something that re-locks if an answer is later changed. Fires
  // once (guarded by body.gated) even though updateProgress() runs on
  // every tap, including re-answers.
  function unlockScreenTwo() {
    if (!document.body.classList.contains('gated')) return;
    document.body.classList.remove('gated');

    var screenTwo = document.querySelector('.screen-two');
    if (screenTwo && !reduceMotion) {
      screenTwo.classList.add('revealing');
      screenTwo.addEventListener('animationend', function handler() {
        screenTwo.classList.remove('revealing');
        screenTwo.removeEventListener('animationend', handler);
      });
    }

    var how = document.querySelector('.how');
    if (how && how.scrollIntoView) {
      how.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function updateProgress() {
    var n = answeredCount();
    var total = copy.questions.length;
    if (barFillEl) barFillEl.style.width = (n / total * 100) + '%';
    if (countEl) countEl.textContent = n + '/' + total;
    if (progressEl) progressEl.textContent = n + ' of ' + total + ' answered';

    var complete = n === total;
    if (ctaWrapEl) ctaWrapEl.setAttribute('data-locked', String(!complete));
    if (ctaBtnEl) ctaBtnEl.disabled = !complete;
    if (complete) unlockScreenTwo();
  }

  function renderQuestions() {
    questionsEl.innerHTML = '';
    copy.questions.forEach(function (q) {
      var block = document.createElement('div');
      block.className = 'q-block';

      var text = document.createElement('p');
      text.className = 'q-text';
      text.textContent = q.text;
      block.appendChild(text);

      var opts = document.createElement('div');
      opts.className = 'q-opts';
      q.options.forEach(function (label) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'q-opt';
        btn.textContent = label;
        btn.addEventListener('click', function () {
          SURVEY_ANSWERS[q.key] = label;
          sendFunnelBeacon(q.key); // fires on every answer, including changes
          opts.querySelectorAll('.q-opt').forEach(function (o) {
            o.classList.toggle('picked', o === btn);
          });
          updateEcho();
          updateProgress();
        });
        opts.appendChild(btn);
      });
      block.appendChild(opts);
      questionsEl.appendChild(block);
    });
  }

  renderQuestions();
  updateProgress();

  // The inline CTA has no email field of its own — once unlocked, it
  // just takes the visitor to the real form at the bottom rather than
  // duplicating email collection in two places.
  if (ctaBtnEl) {
    ctaBtnEl.addEventListener('click', function () {
      var f = document.getElementById('form-final');
      if (!f) return;
      f.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      var input = f.querySelector('input[type=email]');
      if (input) setTimeout(function () { input.focus(); }, reduceMotion ? 0 : 400);
    });
  }
})();

/* ---- Scroll reveal ---- */
(function () {
  var els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.15 });
  els.forEach(function (el) { io.observe(el); });
})();

/* ---- Play the routing cascade only when it's on screen ----
   A beat of stillness (450ms) before it starts, so arriving at this
   section reads as "watch this" rather than something that was already
   moving. Skipped under reduced motion, same as everywhere else. */
(function () {
  var svg = document.querySelector('.cascade');
  if (!svg) return;
  if (!('IntersectionObserver' in window) || reduceMotion) { svg.classList.add('run'); return; }

  var startTimer = null;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        startTimer = setTimeout(function () { svg.classList.add('run'); }, 450);
      } else {
        clearTimeout(startTimer);
        svg.classList.remove('run'); // pause when scrolled away
      }
    });
  }, { threshold: 0.3 });
  io.observe(svg);
})();

/* ---- Sticky CTA appears after the hero scrolls out of view ----
   CSS already forces it hidden while body.gated — this only controls
   visibility once the survey is complete. */
(function () {
  var sticky = document.getElementById('sticky');
  var hero = document.querySelector('.hero');
  var finalForm = document.getElementById('form-final');
  if (!sticky || !hero) return;

  function setHidden(hidden) {
    sticky.classList.toggle('show', !hidden);
    sticky.setAttribute('aria-hidden', String(hidden));
  }

  if ('IntersectionObserver' in window) {
    // Show once the hero is gone
    new IntersectionObserver(function (entries) {
      setHidden(entries[0].isIntersecting);
    }, { threshold: 0 }).observe(hero);

    // Hide again once the final form is in view (no need to nag)
    if (finalForm) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) setHidden(true);
      }, { threshold: 0.2 }).observe(finalForm);
    }
  }

  var stickyBtn = document.getElementById('sticky-btn');
  if (stickyBtn) {
    stickyBtn.addEventListener('click', function () {
      var f = document.getElementById('form-final');
      if (!f) return;
      f.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      var input = f.querySelector('input[type=email]');
      if (input) setTimeout(function () { input.focus(); }, reduceMotion ? 0 : 400);
    });
  }
})();

/* ---- Form handling: validate, POST, show inline state ---- */
(function () {
  function validEmail(v) {
    // Same rule enforced again server-side in the Apps Script doPost —
    // client-side is just for instant feedback, never trust it alone.
    return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v);
  }

  var form = document.getElementById('form-final');
  if (!form) return;

  var errNote = form.querySelector('.form-note.err');
  var input = form.querySelector('input[type=email]');
  var button = form.querySelector('button[type=submit]');
  var card = form.closest('.card');
  var doneState = document.getElementById('done-state');

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    errNote.classList.remove('show');

    var email = (input.value || '').trim();
    if (!validEmail(email)) {
      errNote.classList.add('show');
      input.focus();
      return;
    }

    var originalButtonText = button.textContent; // the persona's dynamic CTA — preserve it
    button.disabled = true;
    button.textContent = 'Just a sec…';

    // If the endpoint is still the placeholder, skip the network call and
    // just show success so the page can be previewed. Remove this branch
    // once a real endpoint is wired in, if you prefer to fail loudly.
    var isPlaceholder = !FORM_ENDPOINT || FORM_ENDPOINT.indexOf('REPLACE_WITH') === 0;

    var done = function () {
      if (card) card.classList.add('done');
      if (doneState) doneState.classList.add('show');
    };
    var failed = function () {
      button.disabled = false;
      button.textContent = originalButtonText;
      errNote.textContent = "Something went wrong sending that. Please try again.";
      errNote.classList.add('show');
    };

    if (isPlaceholder) { done(); return; }

    // Content-Type is text/plain on purpose: Apps Script web apps don't
    // implement CORS preflight (OPTIONS), and application/json would
    // trigger one. text/plain keeps this a "simple request" that skips
    // preflight entirely — the body is still valid JSON, just labelled
    // as text. The Apps Script side does JSON.parse(e.postData.contents).
    fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        event: 'signup',
        session_id: SESSION_ID,
        email: email,
        source: form.id,
        utm_source: AD_SOURCE.utm_source,
        utm_medium: AD_SOURCE.utm_medium,
        utm_campaign: AD_SOURCE.utm_campaign,
        utm_content: AD_SOURCE.utm_content,
        page_url: window.location.href,
        persona: PERSONA,
        q1: SURVEY_ANSWERS.q1,
        q2: SURVEY_ANSWERS.q2,
        q3: SURVEY_ANSWERS.q3
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) { if (data && data.ok) { done(); } else { failed(); } })
    .catch(failed);
  });
})();
