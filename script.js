/* ==========================================================================
   EMAIL ENDPOINT — set this once and both forms use it.
   Leave as-is and forms will show the success state without saving anything,
   which is fine for a quick preview. Replace before running real traffic.
   See README.md for the full Google Sheet + Apps Script setup.
   ========================================================================== */
var FORM_ENDPOINT = "REPLACE_WITH_YOUR_ENDPOINT";

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

/* ---- Screen 1: persona copy + 3-question hard gate ----
   Renders the headline/lede/questions for PERSONA, then reveals Screen 2
   (body.gated is removed) once all three are answered. The dynamic CTA
   text is resolved from the persona's keyed question and applied to the
   final-capture button and sticky-bar button (data-dynamic-cta) at the
   moment Screen 2 is revealed. */
var SURVEY_ANSWERS = { q1: null, q2: null, q3: null };

(function () {
  var COPY = {
    ss: {
      pain: "That bag by the door doesn't have to sit there.",
      promise: "One photo. We sort it, sell what we can, and move the rest on.",
      lede: "You know how to list things. You just haven't. Let's find out what's actually in that bag.",
      ctaKey: 'q2',
      ctaFallback: 'Get early access',
      ctaMap: {
        "Don't know what it's worth": 'Get my free grade',
        "Takes too much time to list": 'Get it off my hands',
        "Don't want to deal with buyers and haggling": 'Skip the haggling, get started'
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
            "Don't want to deal with buyers and haggling",
            'Something else'
          ]
        },
        {
          key: 'q3',
          text: 'Roughly how many items are we talking about?',
          options: ['1–5', '6–15', 'More than 15']
        }
      ]
    },
    wb: {
      pain: 'Wondering if that pile is worth anything?',
      promise: "Let's find out.",
      lede: 'No listing experience needed. Just answer three quick things.',
      ctaKey: 'q3',
      ctaFallback: 'Get early access',
      ctaMap: {
        "Not sure it's worth the effort": "See if it's worth it",
        "Don't know how to get started": 'Show me how it works',
        "Don't think my stuff is worth much": 'Get a free estimate'
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
  var qIndex = 0;
  var ctaText = copy.ctaFallback;

  var painEl = document.getElementById('hero-pain');
  var promiseEl = document.getElementById('hero-promise');
  var ledeEl = document.getElementById('hero-lede');
  var progressEl = document.getElementById('survey-progress');
  var questionsEl = document.getElementById('survey-questions');
  if (!painEl || !promiseEl || !ledeEl || !questionsEl) return;

  painEl.textContent = copy.pain;
  promiseEl.textContent = copy.promise;
  ledeEl.textContent = copy.lede;

  function renderQuestion() {
    var q = copy.questions[qIndex];
    progressEl.textContent = 'Question ' + (qIndex + 1) + ' of ' + copy.questions.length;

    var panel = document.createElement('div');
    panel.className = 'q active' + (reduceMotion ? '' : ' entering');
    panel.innerHTML = '<p class="q-text">' + q.text + '</p><div class="opts"></div>';

    var opts = panel.querySelector('.opts');
    q.options.forEach(function (label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt';
      btn.textContent = label;
      btn.addEventListener('click', function () { pick(q.key, label, btn); });
      opts.appendChild(btn);
    });

    questionsEl.innerHTML = '';
    questionsEl.appendChild(panel);
  }

  function pick(key, label, btnEl) {
    SURVEY_ANSWERS[key] = label;
    if (key === copy.ctaKey) { ctaText = copy.ctaMap[label] || copy.ctaFallback; }

    btnEl.classList.add('picked');
    var panel = questionsEl.querySelector('.q');

    var advance = function () {
      qIndex += 1;
      if (qIndex < copy.questions.length) {
        renderQuestion();
      } else {
        revealScreenTwo();
      }
    };

    if (panel && !reduceMotion) {
      panel.classList.add('leaving');
      panel.classList.remove('entering');
      setTimeout(advance, 180);
    } else {
      advance();
    }
  }

  function revealScreenTwo() {
    document.body.classList.remove('gated');

    document.querySelectorAll('[data-dynamic-cta]').forEach(function (el) {
      el.textContent = ctaText;
    });

    var how = document.querySelector('.how');
    if (how && how.scrollIntoView) {
      how.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  renderQuestion();
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

/* ---- Play the routing cascade only when it's on screen ---- */
(function () {
  var svg = document.querySelector('.cascade');
  if (!svg) return;
  if (!('IntersectionObserver' in window)) { svg.classList.add('run'); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      svg.classList.toggle('run', e.isIntersecting); // pause when scrolled away
    });
  }, { threshold: 0.3 });
  io.observe(svg);
})();

/* ---- Sticky CTA appears after the hero scrolls out of view ---- */
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

  document.getElementById('sticky-btn').addEventListener('click', function () {
    var f = document.getElementById('form-final');
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var input = f.querySelector('input[type=email]');
    if (input) setTimeout(function () { input.focus(); }, 400);
  });
})();

/* ---- Form handling: validate, POST, show inline state ---- */
(function () {
  function validEmail(v) {
    // Same rule enforced again server-side in the Apps Script doPost —
    // client-side is just for instant feedback, never trust it alone.
    return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v);
  }

  function wire(form) {
    if (!form) return;
    var okNote  = form.querySelector('.form-note.ok');
    var errNote = form.querySelector('.form-note.err');
    var input   = form.querySelector('input[type=email]');
    var button  = form.querySelector('button[type=submit]');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      errNote.classList.remove('show');

      var email = (input.value || '').trim();
      if (!validEmail(email)) {
        errNote.classList.add('show');
        input.focus();
        return;
      }

      var endpoint = form.getAttribute('data-endpoint') || FORM_ENDPOINT;
      var originalButtonText = button.textContent; // may be the persona's dynamic CTA — preserve it
      button.disabled = true;
      button.textContent = 'Just a sec…';

      // If the endpoint is still the placeholder, skip the network call and
      // just show success so the page can be previewed. Remove this branch
      // once a real endpoint is wired in, if you prefer to fail loudly.
      var isPlaceholder = !endpoint || endpoint.indexOf('REPLACE_WITH') === 0;

      var done = function () {
        form.classList.add('done');
        okNote.classList.add('show');
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
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
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
  }

  wire(document.getElementById('form-final'));
})();
