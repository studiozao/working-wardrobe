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
  // Growing-pile glyph for the batch-size question — read by eye, not by
  // counting. Tier 1/2/3 stack progressively taller bars, same stroke
  // weight and colour language as the routing cascade.
  var BARS = [
    { y: 20, h: 4 },
    { y: 13, h: 4 },
    { y: 6,  h: 4 }
  ];
  function pileGlyph(tier) {
    var rects = BARS.slice(0, tier).map(function (b) {
      return '<rect x="4" y="' + b.y + '" width="20" height="' + b.h + '" rx="2"/>';
    }).join('');
    return '<svg class="glyph" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">' + rects + '</svg>';
  }

  // Headline + lede are shared across both personas — only the questions
  // (and what they unlock: CTA text, answer-echo) differ. The old
  // per-persona headline presumed a selling history that doesn't fit
  // Wannabes, so this stays neutral on whether the visitor's tried before.
  var HERO_COPY = {
    pain: "That bag by the door doesn't have to sit there.",
    promise: "One photo. We'll tell you what it's worth, and take it from there.",
    lede: "Answer three quick things and we'll show you what's actually in it for you."
  };

  var COPY = {
    ss: {
      ctaKey: 'q2',
      ctaFallback: 'Get early access',
      ctaMap: {
        "Don't know what it's worth": 'Get my free grade',
        "Takes too much time to list": 'Get it off my hands',
        "Don't want to deal with buyers and haggling": 'Skip the haggling, get started'
      },
      // Echoes the visitor's own Q2 answer back in Screen 2 (optional — see
      // the answer-echo note in index.html / style.css). Fallback answers
      // ("Something else") have no line and stay hidden, on purpose.
      echoMap: {
        "Don't know what it's worth": "You said you don't know what it's worth — that's the part we do.",
        "Takes too much time to list": "You said listing takes too much time — here it's one photo, not an evening.",
        "Don't want to deal with buyers and haggling": "You said the haggling's the worst part — here's what replaces it."
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
          // Objects (not plain strings) so a pile-size glyph renders
          // alongside each option — see renderQuestion().
          options: [
            { label: '1–5', glyphTier: 1 },
            { label: '6–15', glyphTier: 2 },
            { label: 'More than 15', glyphTier: 3 }
          ]
        }
      ]
    },
    wb: {
      ctaKey: 'q3',
      ctaFallback: 'Get early access',
      ctaMap: {
        "Not sure it's worth the effort": "See if it's worth it",
        "Don't know how to get started": 'Show me how it works',
        "Don't think my stuff is worth much": 'Get a free estimate'
      },
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
  var qIndex = 0;
  var ctaText = copy.ctaFallback;

  // Pacing accelerates Q1 → Q3: the highlighted "picked" state holds
  // longest on the first tap (still new, needs the moment to register)
  // and shortest on the last (should feel like the fastest, most automatic
  // tap of the three, building momentum toward the reveal).
  var PICKED_HOLD_MS = [320, 220, 150];
  var LEAVE_MS = 180;
  var BRIDGE_HOLD_MS = 650;

  var painEl = document.getElementById('hero-pain');
  var promiseEl = document.getElementById('hero-promise');
  var ledeEl = document.getElementById('hero-lede');
  var progressEl = document.getElementById('survey-progress');
  var dotsEl = document.getElementById('survey-dots');
  var questionsEl = document.getElementById('survey-questions');
  if (!painEl || !promiseEl || !ledeEl || !questionsEl) return;

  painEl.textContent = HERO_COPY.pain;
  promiseEl.textContent = HERO_COPY.promise;
  ledeEl.textContent = HERO_COPY.lede;

  function renderDots() {
    if (!dotsEl) return;
    var dots = dotsEl.querySelectorAll('.dot');
    dots.forEach(function (dot, i) {
      dot.classList.toggle('done', i < qIndex);
      dot.classList.toggle('current', i === qIndex);
    });
  }

  function renderQuestion() {
    var q = copy.questions[qIndex];
    if (progressEl) progressEl.textContent = 'Question ' + (qIndex + 1) + ' of ' + copy.questions.length;
    renderDots();

    var panel = document.createElement('div');
    panel.className = 'q active' + (reduceMotion ? '' : ' entering');
    panel.innerHTML = '<p class="q-text">' + q.text + '</p><div class="opts"></div>';

    var opts = panel.querySelector('.opts');
    q.options.forEach(function (option) {
      var hasGlyph = typeof option === 'object';
      var label = hasGlyph ? option.label : option;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = hasGlyph ? 'opt opt-glyph' : 'opt';
      if (hasGlyph) {
        btn.innerHTML = pileGlyph(option.glyphTier) + '<span>' + label + '</span>';
      } else {
        btn.textContent = label;
      }
      btn.addEventListener('click', function () { pick(q.key, label, btn, opts); });
      opts.appendChild(btn);
    });

    questionsEl.innerHTML = '';
    questionsEl.appendChild(panel);
  }

  function pick(key, label, btnEl, optsEl) {
    SURVEY_ANSWERS[key] = label;
    if (key === copy.ctaKey) { ctaText = copy.ctaMap[label] || copy.ctaFallback; }

    // Register the choice (a half-second "yes, that's logged") before
    // anything moves — the interaction-design equivalent of a nod, and
    // what keeps this feeling like a conversation rather than a form.
    btnEl.classList.add('picked');
    Array.prototype.forEach.call(optsEl.children, function (el) {
      if (el !== btnEl) el.disabled = true;
    });

    var panel = questionsEl.querySelector('.q');
    var isLast = qIndex >= copy.questions.length - 1;

    var advance = function () {
      var leave = function () {
        if (panel && !reduceMotion) {
          panel.classList.add('leaving');
          panel.classList.remove('entering');
          setTimeout(afterLeave, LEAVE_MS);
        } else {
          afterLeave();
        }
      };
      var afterLeave = function () {
        if (isLast) {
          showBridge();
        } else {
          qIndex += 1;
          renderQuestion();
        }
      };
      leave();
    };

    var hold = reduceMotion ? 0 : (PICKED_HOLD_MS[qIndex] || PICKED_HOLD_MS[PICKED_HOLD_MS.length - 1]);
    setTimeout(advance, hold);
  }

  // The reveal is a beat, not a page load: a short bridging line shown in
  // place of Q3's options, then Screen 2 unhides underneath it.
  function showBridge() {
    renderDots();
    var bridge = document.createElement('p');
    bridge.className = 'survey-bridge';
    bridge.textContent = "Right — here's how it actually works.";
    questionsEl.innerHTML = '';
    questionsEl.appendChild(bridge);

    setTimeout(revealScreenTwo, reduceMotion ? 0 : BRIDGE_HOLD_MS);
  }

  function revealScreenTwo() {
    document.body.classList.remove('gated');

    document.querySelectorAll('[data-dynamic-cta]').forEach(function (el) {
      el.textContent = ctaText;
    });

    var echoEl = document.getElementById('answer-echo');
    if (echoEl) {
      var echoText = copy.echoMap && copy.echoMap[SURVEY_ANSWERS[copy.ctaKey]];
      if (echoText) {
        echoEl.textContent = echoText;
        echoEl.classList.add('show');
      }
    }

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

/* ---- Play the routing cascade only when it's on screen ----
   A beat of stillness (450ms) before it starts, so arriving at this
   section reads as "watch this" rather than something that was already
   moving. Skipped under reduced motion, same as everywhere else. */
(function () {
  var svg = document.querySelector('.cascade');
  if (!svg) return;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
