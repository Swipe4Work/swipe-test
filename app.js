/* Swipe4Work – feed-prototype
 * Twee varianten in één app, om te toetsen welke manier prettiger voelt:
 *   feed  = voorgestelde manier (scrollen, opzij vegen om te bewaren, shortlist, vergelijken, bewust solliciteren)
 *   swipe = huidige app (links "Niet geïnteresseerd", rechts "Koffie doen" = direct solliciteren)
 * Variant kiezen: ?v=feed of ?v=swipe  (zonder parameter: willekeurig).  ?debug toont de variant.
 */
(() => {
  'use strict';
  const CFG = window.CONFIG || {};
  const ALL = window.VACANCIES || [];
  const byId = Object.fromEntries(ALL.map(v => [v.id, v]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  const RESULTS_KEY = 'swipe4work-feed-test-results';

  /* ---------- helpers: data ---------- */
  const SHORT = {
    'Techniek, Productie, Logistiek & Groen': 'Techniek & Productie', 'Finance, HR & Administratie': 'Finance & HR',
    'Marketing & Communicatie': 'Marketing', 'Beleid & Organisatie': 'Beleid & Organisatie', 'Onderwijs & Kinderopvang': 'Onderwijs',
    'Horeca & Retail': 'Horeca & Retail', 'Sales & Inkoop': 'Sales & Inkoop', 'Zorg & Welzijn': 'Zorg & Welzijn', 'ICT': 'ICT'
  };
  const short = c => SHORT[c] || c;
  const plain = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const num = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  // Salaris genormaliseerd naar €/maand (fulltime), zodat vacatures onderling vergelijkbaar zijn.
  function monthly(v) {
    if (v._m !== undefined) return v._m;
    const n = (v.salary.match(/\d[\d.]*(?:,\d+)?/g) || []).map(num).filter(x => !isNaN(x));
    let m = n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
    if (m && /p\/u/.test(v.salary)) m *= 160;
    return (v._m = m);
  }
  const eur = n => '€' + Math.round(n).toLocaleString('nl-NL');
  const maxHours = v => Math.max(...(v.hours.match(/\d+/g) || [0]).map(Number));
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffled(arr, seed) { const r = mulberry(seed), a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- icons ---------- */
  const I = {
    bookmark: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
    check: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    xBig: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    arrow: '<svg width="16" height="14" viewBox="0 0 19 17" fill="currentColor"><path d="M13.97 5.76H0v5.74h13.97v.01L7.09 16.63h5.84l5.92-8.31L12.93 0H7.09z"/></svg>'
  };

  /* ---------- state ---------- */
  const params = new URLSearchParams(location.search);
  let variant = params.get('v');
  if (variant !== 'feed' && variant !== 'swipe') variant = store.sget('variant') || (Math.random() < .5 ? 'feed' : 'swipe');
  store.sset('variant', variant);

  const S = {
    pid: 'p' + Math.random().toString(36).slice(2, 8), variant, t0: 0, view: 'intro',
    order: [], seen: new Set(), dwell: {}, saved: [], applied: new Set(), removedCount: 0,
    decided: [], idx: 0, shownAt: 0, events: [],
    detailOpens: 0, shortlistViews: 0, compareViews: 0, slView: 'list', sort: 'saved'
  };
  window.__S = S; // handig bij testen
  const log = (type, data = {}) => S.events.push({ t: S.t0 ? Date.now() - S.t0 : 0, type, ...data });
  const seenCount = () => S.variant === 'feed' ? S.seen.size : S.decided.length;

  /* ---------- dom refs ---------- */
  const main = $('#main'), topbar = $('#topbar'), tabs = $('#tabs'), doneBtn = $('#doneBtn'), sheetRoot = $('#sheetRoot'), toastEl = $('#toast');
  if (params.has('debug')) { const d = $('#debug'); d.hidden = false; d.textContent = 'variant: ' + variant; }

  function screen(name) {
    let s = $('#scr-' + name);
    if (!s) { s = document.createElement('section'); s.className = 'screen'; s.id = 'scr-' + name; main.appendChild(s); }
    return s;
  }
  function show(name) {
    S.view = name; screen(name);
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + name));
    const inTest = ['feed', 'shortlist', 'deck'].includes(name);
    topbar.hidden = name === 'intro';
    tabs.hidden = !(S.variant === 'feed' && (name === 'feed' || name === 'shortlist'));
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    updateDone(inTest);
    if (name === 'feed') resumeDwell(); else pauseDwell();
    if (name === 'shortlist') { S.shortlistViews++; log('view_shortlist'); renderShortlist(); }
  }
  function updateDone(inTest = ['feed', 'shortlist', 'deck'].includes(S.view)) {
    doneBtn.hidden = !(inTest && seenCount() >= (CFG.minSeenBeforeDone || 5));
  }

  /* ---------- toast & sheets ---------- */
  let toastT;
  function toast(msg, action) {
    toastEl.innerHTML = `<span>${msg}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    if (action) $('button', toastEl).onclick = () => { toastEl.classList.remove('show'); action.fn(); };
    toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), action ? 4500 : 2200);
  }
  function openSheet(html, cls = '') {
    sheetRoot.innerHTML = `<div class="sheet-backdrop"><div class="sheet ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
  }
  function closeSheet() { sheetRoot.innerHTML = ''; }
  const sheetOpen = () => !!sheetRoot.firstElementChild;

  function detailsSheet(id, ctx) {
    const v = byId[id]; S.detailOpens++; log('details', { id, ctx });
    let actions = '';
    if (ctx === 'feed') {
      actions = S.saved.includes(id)
        ? `<button class="btn btn-ghost" data-close>Sluiten</button><button class="btn" disabled>${I.check.replace(/26/g, '16')} In je lijst</button>`
        : `<button class="btn btn-ghost" data-close>Sluiten</button><button class="btn btn-yellow" data-sheet="save" data-id="${id}">${I.bookmark.replace(/24/g, '16')} Bewaar</button>`;
    } else if (ctx === 'shortlist') {
      actions = S.applied.has(id)
        ? `<button class="btn btn-ghost" data-close>Sluiten</button><button class="btn" disabled>Gesolliciteerd ✓</button>`
        : `<button class="btn btn-ghost" data-close>Sluiten</button><button class="btn" data-sheet="apply" data-id="${id}">Solliciteer</button>`;
    } else {
      actions = `<button class="btn btn-ghost" data-sheet="no" data-id="${id}">Niet interessant</button><button class="btn btn-yellow" data-sheet="yes" data-id="${id}">Koffie doen ☕</button>`;
    }
    openSheet(`
      <div class="sheet-scroll">
        <div class="sheet-hero" style="background-image:url(img/${v.img})"><button class="sheet-x" data-close aria-label="Sluiten">${I.x}</button></div>
        <div class="sheet-in">
          <span class="kicker">${esc(short(v.cat))}</span>
          <h1>${esc(v.title)}</h1>
          <p class="loc">${I.pin}${esc(v.loc)}</p>
          <div class="pills"><span class="pill pill-salary">${esc(v.salary)}</span><span class="pill">${esc(v.hours)}</span></div>
          <div class="prose">${v.intro}${v.body}</div>
          <div class="facts">${Object.entries(v.facts).filter(([k]) => k !== 'Vaardigheden').map(([k, x]) => `<div><b>${esc(k)}:</b> ${esc(x)}</div>`).join('')}
            ${v.facts.Vaardigheden ? `<div><b>Vaardigheden:</b> ${esc(v.facts.Vaardigheden)}</div>` : ''}</div>
        </div>
      </div>
      <div class="sheet-actions">${actions}</div>`);
  }

  sheetRoot.addEventListener('click', e => {
    if (e.target.classList.contains('sheet-backdrop') || e.target.closest('[data-close]')) return closeSheet();
    const b = e.target.closest('[data-sheet]'); if (!b) return;
    const id = b.dataset.id, act = b.dataset.sheet;
    closeSheet();
    if (act === 'save') { const sl = $(`.slide[data-id="${id}"]`); if (sl) saveSlide(sl, 'sheet'); }
    else if (act === 'apply') confirmApply(id);
    else if (act === 'yes' || act === 'no') flyOut($('#deck .card:not(.under)'), act === 'yes' ? 1 : -1, () => decide(act === 'yes' ? 'r' : 'l'));
    else if (act === 'finish') goSurvey();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sheetOpen()) return closeSheet();
    if (sheetOpen() || e.target.matches('input,textarea')) return;
    if (S.view === 'feed') {
      const feed = $('#feed'); if (!feed) return;
      const i = Math.round(feed.scrollTop / feed.clientHeight), slides = $$('.slide', feed);
      if (e.key === 'ArrowDown') { e.preventDefault(); slides[Math.min(i + 1, slides.length - 1)].scrollIntoView({ behavior: 'smooth' }); }
      if (e.key === 'ArrowUp') { e.preventDefault(); slides[Math.max(i - 1, 0)].scrollIntoView({ behavior: 'smooth' }); }
      if (e.key === 'ArrowRight' && slides[i] && slides[i].dataset.id) saveSlide(slides[i], 'key');
    } else if (S.view === 'deck') {
      const top = $('#deck .card:not(.under)'); if (!top) return;
      if (e.key === 'ArrowRight') flyOut(top, 1, () => decide('r'));
      if (e.key === 'ArrowLeft') flyOut(top, -1, () => decide('l'));
    }
  });

  /* ---------- swipe-gebaar ---------- */
  function flyOut(node, dir, cb) {
    if (!node || node.dataset.flying) return; node.dataset.flying = 1;
    node.style.transition = 'transform .32s cubic-bezier(.5,0,.8,.4), opacity .32s';
    node.style.transform = `translateX(${dir * (window.innerWidth + 100)}px) rotate(${dir * 16}deg)`;
    node.style.opacity = '0';
    setTimeout(cb, 300);
  }
  function makeSwipe(node, { onRight, onLeft, progress, rotate = 0, threshold = 96 }) {
    let sx = 0, sy = 0, dx = 0, id = null, lock = null, t0 = 0;
    node.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0) || node.dataset.flying) return;
      sx = e.clientX; sy = e.clientY; dx = 0; id = e.pointerId; lock = null; t0 = performance.now();
    });
    node.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - sx, my = e.clientY - sy;
      if (!lock && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
        lock = Math.abs(mx) > Math.abs(my) * 1.2 ? 'x' : 'y';
        if (lock === 'x') { try { node.setPointerCapture(id); } catch (err) {} node.classList.add('dragging'); } else id = null;
      }
      if (lock !== 'x') return;
      dx = mx;
      // zonder handler voor links: kaart geeft weerstand en veert terug
      const eff = (dx < 0 && !onLeft) ? dx * .25 : (dx > 0 && !onRight) ? dx * .25 : dx;
      node.style.transform = `translateX(${eff}px) rotate(${eff * rotate}deg)`;
      progress && progress(eff / threshold);
    });
    const end = e => {
      if (e.pointerId !== id) return; const wasX = lock === 'x'; id = null;
      if (!wasX) return;
      node.classList.remove('dragging');
      node.dataset.dragged = 1; setTimeout(() => delete node.dataset.dragged, 120); // voorkomt dat een sleep als tik telt
      const v = dx / Math.max(1, performance.now() - t0);
      if (e.type !== 'pointercancel' && ((dx > threshold || (v > .6 && dx > 40)) && onRight)) { flyOut(node, 1, onRight); progress && progress(1); }
      else if (e.type !== 'pointercancel' && ((dx < -threshold || (v < -.6 && dx < -40)) && onLeft)) { flyOut(node, -1, onLeft); progress && progress(-1); }
      else {
        node.style.transition = 'transform .35s cubic-bezier(.17,.84,.44,1)'; node.style.transform = '';
        progress && progress(0); setTimeout(() => { node.style.transition = ''; }, 360);
      }
    };
    node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end);
  }

  /* ---------- kaart ---------- */
  function cardInner(v, extras = '') {
    return `
      <div class="card-media" style="background-image:url(img/${v.img})"><span class="chip">${esc(short(v.cat))}</span></div>
      ${extras}
      <div class="card-body">
        <h2>${esc(v.title)}</h2>
        <p class="loc">${I.pin}${esc(v.loc)}</p>
        <div class="pills"><span class="pill pill-salary">${esc(v.salary)}</span><span class="pill">${esc(v.hours)}</span></div>
        <p class="intro">${esc(plain(v.intro))}</p>
        <button class="link" data-act="details" data-id="${v.id}">Lees meer</button>
      </div>`;
  }

  /* =====================================================
   *  INTRO
   * ===================================================== */
  function renderIntro() {
    const s = screen('intro'); s.classList.add('scroll');
    const feed = S.variant === 'feed';
    s.innerHTML = `<div class="page">
      <div class="switch-row">
        <img src="logo.svg" class="intro-logo" alt="Swipe4Work">
        <div class="variant-switch" role="group" aria-label="Testversie"><span class="kicker">Versie</span>
          <div class="seg"><button data-variant="feed" class="${feed ? 'on' : ''}">Feed</button><button data-variant="swipe" class="${feed ? '' : 'on'}">Swipe</button></div></div>
      </div>
      <div>
        <span class="kicker">Gebruikerstest</span>
        <h1 style="margin-top:8px">Kijk rustig rond tussen vacatures</h1>
      </div>
      <p>Je krijgt zo een reeks echte vacatures te zien. Er wordt niets écht verstuurd: dit is een test van een nieuw idee.</p>
      <ul class="steps">
        ${feed ? `
        <li><span class="ico">👆</span><span><b>Scroll door de vacatures</b> zoals je door een feed scrolt. Niet interessant? Dan scroll je gewoon verder.</span></li>
        <li><span class="ico">👉</span><span><b>Lijkt er één leuk?</b> Veeg de kaart naar rechts (of tik op het bladwijzer-icoon) om hem te bewaren.</span></li>
        <li><span class="ico">📋</span><span>In <b>Mijn lijst</b> vergelijk je de vacatures die je bewaard hebt en solliciteer je pas als je het zeker weet.</span></li>` : `
        <li><span class="ico">👈</span><span><b>Veeg naar links</b> als een vacature niet interessant is.</span></li>
        <li><span class="ico">☕</span><span><b>Veeg naar rechts</b> voor “Koffie doen”. Dat betekent dat je direct solliciteert.</span></li>
        <li><span class="ico">📄</span><span>Wil je eerst meer weten? Tik op <b>Lees meer</b> voor alle details.</span></li>`}
      </ul>
      <p>Neem de tijd en kijk zoveel vacatures als je wilt. Tik op <b>Klaar</b> (rechtsboven) als je genoeg gezien hebt. Daarna volgen een paar korte vragen.</p>
      <div class="spacer"></div>
      <button class="btn btn-block" id="startBtn">Start ${I.arrow}</button>
      <p class="fine">De test is anoniem. We bewaren alleen hoe je met de vacatures omgaat.</p>
    </div>`;
    $('#startBtn').onclick = startTest;
    $$('[data-variant]', s).forEach(b => b.onclick = () => {
      if (b.dataset.variant === S.variant) return;
      S.variant = b.dataset.variant; store.sset('variant', S.variant);
      try { history.replaceState(null, '', '?v=' + S.variant + (params.has('debug') ? '&debug' : '')); } catch (e) {}
      const d = $('#debug'); if (!d.hidden) d.textContent = 'variant: ' + S.variant;
      renderIntro();
    });
    show('intro');
  }

  function startTest() {
    S.t0 = Date.now();
    S.order = shuffled(ALL, Math.floor(Math.random() * 1e9)).map(v => v.id);
    log('start', { variant: S.variant });
    if (S.variant === 'feed') { buildFeed(); show('feed'); } else { buildDeck(); show('deck'); }
  }

  /* =====================================================
   *  VARIANT A – FEED
   * ===================================================== */
  const visible = new Set(), dwellStart = {}, dwellTimers = {};
  function startDwell(id) {
    if (dwellStart[id] || S.view !== 'feed') return;
    dwellStart[id] = performance.now();
    dwellTimers[id] = setTimeout(() => { if (!S.seen.has(id)) { S.seen.add(id); log('seen', { id }); updateDone(); } }, 350);
  }
  function endDwell(id) {
    if (!dwellStart[id]) return;
    clearTimeout(dwellTimers[id]);
    if (S.seen.has(id)) S.dwell[id] = (S.dwell[id] || 0) + (performance.now() - dwellStart[id]);
    delete dwellStart[id];
  }
  const pauseDwell = () => Object.keys(dwellStart).forEach(endDwell);
  const resumeDwell = () => visible.forEach(startDwell);

  function buildFeed() {
    const s = screen('feed');
    s.innerHTML = `<div class="feed" id="feed">
      ${S.order.map(id => {
        const v = byId[id];
        return `<section class="slide" data-id="${id}">
          <div class="reveal">${I.bookmark} Bewaren</div>
          <div class="card">
            ${cardInner(v, `<button class="save-btn" data-act="save" data-id="${id}" aria-label="Bewaar vacature">${I.bookmark}</button><span class="stamp stamp-yes">Bewaard</span>`)}
          </div>
          <div class="saved-ph"><span class="tick">${I.check}</span><div><strong>${esc(v.title)}</strong><small>staat in je lijst</small></div>
            <button class="link" data-act="undo" data-id="${id}">Ongedaan maken</button></div>
        </section>`;
      }).join('')}
      <section class="slide" data-end="1"><div class="end-card"><h2>Dat waren ze!</h2>
        <p>Je bent aan het einde van de vacatures gekomen.</p>
        <button class="btn" data-act="to-shortlist">Bekijk je lijst</button>
        <button class="btn btn-ghost" data-act="finish">Klaar</button></div></section>
    </div>
    <div class="coach" id="coach"><span>↑ scroll door</span><span>·</span><span>veeg → om te bewaren</span></div>`;
    const feed = $('#feed');
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (en.target.dataset.end) { if (en.isIntersecting && !S.reachedEnd) { S.reachedEnd = true; log('reached_end'); } continue; }
        const id = en.target.dataset.id; if (!id) continue;
        if (en.isIntersecting && en.intersectionRatio >= .6) { visible.add(id); startDwell(id); }
        else { visible.delete(id); endDwell(id); }
      }
    }, { root: feed, threshold: [0, .6, 1] });
    io.observe($('.slide[data-end]', feed));
    $$('.slide[data-id]', feed).forEach(sl => {
      io.observe(sl);
      const card = $('.card', sl), reveal = $('.reveal', sl), stamp = $('.stamp', sl);
      makeSwipe(card, {
        rotate: .03, onRight: () => saveSlide(sl, 'swipe'),
        progress: p => { const a = Math.max(0, Math.min(1, p)); reveal.style.opacity = a; stamp.style.opacity = a; }
      });
    });
    const hideCoach = () => { const c = $('#coach'); c && c.classList.add('gone'); };
    feed.addEventListener('scroll', () => { if (feed.scrollTop > 40) hideCoach(); }, { passive: true });
    setTimeout(hideCoach, 9000);
    feed.addEventListener('click', onFeedClick);
  }

  function onFeedClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) { // tik op de kaart zelf opent de details
      const card = e.target.closest('.card'), sl = e.target.closest('.slide');
      if (card && sl && sl.dataset.id && !card.dataset.dragged) detailsSheet(sl.dataset.id, 'feed');
      return;
    }
    const act = b.dataset.act, sl = b.closest('.slide');
    if (act === 'details') detailsSheet(b.dataset.id, 'feed');
    else if (act === 'save') saveSlide(sl, 'button');
    else if (act === 'undo') unsave(b.dataset.id, 'undo');
    else if (act === 'to-shortlist') show('shortlist');
    else if (act === 'finish') confirmFinish();
  }

  function updateTab() {
    const b = $('#tabBadge'); b.hidden = !S.saved.length; b.textContent = S.saved.length;
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }
  function saveSlide(slide, via) {
    const id = slide.dataset.id; if (!id || S.saved.includes(id)) return;
    S.saved.push(id); log('save', { id, via }); updateTab(); vibrate(12);
    const next = slide.nextElementSibling;
    const done = () => { slide.classList.add('is-saved'); next && next.scrollIntoView({ behavior: 'smooth' }); };
    via === 'swipe' ? done() : flyOut($('.card', slide), 1, done);
  }
  function unsave(id, via) {
    if (!S.saved.includes(id)) return;
    S.saved = S.saved.filter(x => x !== id); if (via === 'remove') S.removedCount++;
    log(via === 'remove' ? 'remove' : 'unsave', { id }); updateTab();
    const sl = $(`.slide[data-id="${id}"]`);
    if (sl) {
      sl.classList.remove('is-saved');
      const c = $('.card', sl); c.style.cssText = ''; delete c.dataset.flying;
      $('.reveal', sl).style.opacity = 0; $('.stamp', sl).style.opacity = 0;
    }
  }
  function resave(id) {
    const sl = $(`.slide[data-id="${id}"]`); if (!sl || S.saved.includes(id)) return;
    S.saved.push(id); log('resave', { id }); updateTab(); sl.classList.add('is-saved'); if (S.view === 'shortlist') renderShortlist();
  }

  /* ---------- shortlist ---------- */
  function renderShortlist() {
    const s = screen('shortlist'); s.classList.add('scroll');
    const items = S.saved.map(id => byId[id]);
    if (S.slView === 'compare') { S.compareViews++; log('view_compare'); }
    let list = [...items];
    if (S.sort === 'salary') list.sort((a, b) => (monthly(b) || 0) - (monthly(a) || 0));
    if (S.sort === 'hours') list.sort((a, b) => maxHours(b) - maxHours(a));
    const maxSal = Math.max(1, ...items.map(v => monthly(v) || 0));
    const pct = v => Math.round(100 * (monthly(v) || 0) / maxSal);
    const diff = v => { const d = pct(v) - 100; return d === 0 ? '<small class="best">hoogste</small>' : `<small>${d}%</small>`; };
    const salBlock = v => `<div class="sal"><div class="sal-line"><span><strong>≈ ${eur(monthly(v))}</strong> p/m</span>${diff(v)}</div>
        <div class="bar"><i class="${pct(v) < 80 ? 'low' : ''}" style="width:${pct(v)}%"></i></div></div>`;
    const applyBtn = v => S.applied.has(v.id) ? `<div class="applied">${I.check.replace(/26/g, '16')} Gesolliciteerd</div>`
      : `<button class="btn btn-small" data-act="apply" data-id="${v.id}">Solliciteer</button>`;

    const head = `<div class="sl-head"><h1>Mijn lijst</h1><p>${items.length ? `${items.length} bewaard${items.length > 1 ? 'e vacatures' : 'e vacature'}. Vergelijk ze en solliciteer op wat je écht wilt.` : ''}</p></div>`;
    let body;
    if (!items.length) {
      body = `<div class="empty"><div class="emoji">🔖</div><strong>Nog niets bewaard</strong>
        <p style="font-size:.9rem">Veeg een vacature in de feed naar rechts om hem hier te verzamelen.</p>
        <button class="btn btn-small" data-act="back-feed">Terug naar de feed</button></div>`;
    } else {
      const controls = `<div class="controls"><div class="seg"><button class="${S.slView === 'list' ? 'on' : ''}" data-act="view" data-v="list">Lijst</button><button class="${S.slView === 'compare' ? 'on' : ''}" data-act="view" data-v="compare">Vergelijk</button></div>
        <div class="chips" style="margin-left:auto">Sorteer: ${[['saved', 'Bewaard'], ['salary', 'Salaris'], ['hours', 'Uren']].map(([k, l]) => `<button class="${S.sort === k ? 'on' : ''}" data-act="sort" data-k="${k}">${l}</button>`).join('')}</div></div>`;
      if (S.slView === 'list') {
        body = controls + list.map(v => `<article class="item" data-id="${v.id}">
          <div class="item-top"><div class="thumb" style="background-image:url(img/${v.img})"></div>
            <div style="min-width:0"><h3>${esc(v.title)}</h3><p class="loc" style="margin-top:4px">${I.pin}${esc(v.loc)}</p></div>
            <button class="x" data-act="remove" data-id="${v.id}" aria-label="Verwijder uit mijn lijst">${I.x}</button></div>
          ${salBlock(v)}
          <div class="item-meta"><span class="pill">${esc(v.hours)}</span><span class="pill">${esc(v.facts.Opleiding || '')}</span><span class="pill">${esc(v.facts.Ervaring || '')}</span></div>
          <div class="item-actions"><button class="btn btn-ghost btn-small" data-act="details" data-id="${v.id}">Details</button>${applyBtn(v)}</div>
        </article>`).join('') + `<p class="swipe-hint">Tip: veeg een vacature naar links om hem weg te halen</p>`;
      } else {
        const row = (label, fn, cls = '') => `<tr><td>${label}</td>${list.map(v => `<td class="${typeof cls === 'function' ? cls(v) : cls}">${fn(v)}</td>`).join('')}</tr>`;
        body = controls + `<div class="cmp-wrap"><table class="cmp"><thead><tr><th></th>${list.map(v => `<th><div class="h"><div class="thumb" style="background-image:url(img/${v.img})"></div><strong>${esc(v.title)}</strong>
            <button class="x" data-act="remove" data-id="${v.id}" aria-label="Verwijder">${I.x}</button></div></th>`).join('')}</tr></thead><tbody>
          ${row('Salaris', v => salBlock(v), v => pct(v) === 100 ? 'best-cell' : '')}
          ${row('Uren', v => esc(v.hours))}
          ${row('Locatie', v => esc(v.loc))}
          ${row('Opleiding', v => esc(v.facts.Opleiding || '–'))}
          ${row('Ervaring', v => esc(v.facts.Ervaring || '–'))}
          ${row('Branche', v => esc(short(v.cat)))}
          ${row('', v => `<button class="btn btn-ghost" data-act="details" data-id="${v.id}">Details</button>${applyBtn(v)}`)}
        </tbody></table></div>`;
      }
    }
    s.innerHTML = `<div class="sl">${head}${body}</div>`;
    s.onclick = onShortlistClick;
    $$('.item', s).forEach(it => makeSwipe(it, { onLeft: () => removeFromShortlist(it.dataset.id), threshold: 110 }));
  }
  function onShortlistClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) {
      const it = e.target.closest('.item');
      if (it && !it.dataset.dragged) detailsSheet(it.dataset.id, 'shortlist');
      return;
    }
    const a = b.dataset.act, id = b.dataset.id;
    if (a === 'view') { S.slView = b.dataset.v; renderShortlist(); }
    else if (a === 'sort') { S.sort = b.dataset.k; log('sort', { k: S.sort }); renderShortlist(); }
    else if (a === 'details') detailsSheet(id, 'shortlist');
    else if (a === 'apply') confirmApply(id);
    else if (a === 'remove') removeFromShortlist(id);
    else if (a === 'back-feed') show('feed');
  }
  function removeFromShortlist(id) {
    unsave(id, 'remove'); renderShortlist();
    toast('Van je lijst gehaald', { label: 'Ongedaan maken', fn: () => resave(id) });
  }
  function confirmApply(id) {
    const v = byId[id];
    openSheet(`<h2>Solliciteren op “${esc(v.title)}”?</h2>
      <p>In de echte app verstuurt je hiermee je profiel direct naar de werkgever. In deze test wordt er niets verstuurd.</p>
      <div class="sheet-actions"><button class="btn btn-ghost" data-close>Nog niet</button><button class="btn btn-yellow" id="applyYes">Ja, solliciteer</button></div>`, 'small');
    $('#applyYes').onclick = () => {
      closeSheet(); S.applied.add(id); log('apply', { id, via: 'shortlist', savedCount: S.saved.length });
      vibrate(20); toast('☕ Gesolliciteerd (test)'); renderShortlist();
    };
  }

  /* =====================================================
   *  VARIANT B – KLASSIEKE SWIPE (huidige app)
   * ===================================================== */
  function buildDeck() {
    const s = screen('deck');
    s.innerHTML = `<div class="deck" id="deck"></div>
      <div class="deck-actions">
        <div class="deck-btn"><button class="round round-no" data-act="no" aria-label="Niet geïnteresseerd">${I.xBig}</button>Niet geïnteresseerd</div>
        <div class="deck-btn"><button class="round round-yes" data-act="yes" aria-label="Koffie doen">☕</button>Koffie doen</div>
      </div>`;
    s.onclick = e => {
      const b = e.target.closest('[data-act]');
      const top = $('#deck .card:not(.under)');
      if (!b) {
        const c = e.target.closest('#deck .card:not(.under)');
        if (c && !c.dataset.dragged && !c.dataset.flying) detailsSheet(S.order[S.idx], 'deck');
        return;
      }
      if (b.dataset.act === 'details') detailsSheet(b.dataset.id, 'deck');
      else if (b.dataset.act === 'yes') flyOut(top, 1, () => decide('r'));
      else if (b.dataset.act === 'no') flyOut(top, -1, () => decide('l'));
      else if (b.dataset.act === 'finish') confirmFinish();
    };
    renderDeck();
  }
  function renderDeck() {
    const deck = $('#deck'); deck.innerHTML = '';
    if (S.idx >= S.order.length) {
      deck.innerHTML = `<div class="end-card"><h2>Dat waren ze!</h2><p>Je bent aan het einde van de vacatures gekomen.</p><button class="btn" data-act="finish">Klaar</button></div>`;
      $('.deck-actions').hidden = true; S.reachedEnd = true; log('reached_end'); return;
    }
    const mk = (id, under) => {
      const el = document.createElement('div'); el.className = 'card' + (under ? ' under' : '');
      el.innerHTML = cardInner(byId[id], under ? '' : '<span class="stamp stamp-no">Nee</span><span class="stamp stamp-yes">Koffie ☕</span>'); return el;
    };
    if (S.order[S.idx + 1]) deck.appendChild(mk(S.order[S.idx + 1], true));
    const top = mk(S.order[S.idx]); deck.appendChild(top);
    const sy = $('.stamp-yes', top), sn = $('.stamp-no', top);
    makeSwipe(top, {
      rotate: .05, onRight: () => decide('r'), onLeft: () => decide('l'),
      progress: p => { sy.style.opacity = Math.max(0, Math.min(1, p)); sn.style.opacity = Math.max(0, Math.min(1, -p)); }
    });
    S.shownAt = performance.now();
  }
  function decide(dir) {
    const id = S.order[S.idx]; if (!id) return;
    S.decided.push({ id, dir, ms: Math.round(performance.now() - S.shownAt) });
    log(dir === 'r' ? 'swipe_right' : 'swipe_left', { id });
    if (dir === 'r') { S.applied.add(id); vibrate(20); toast('☕ Gesolliciteerd (test)'); }
    S.idx++; updateDone(); renderDeck();
  }

  /* =====================================================
   *  AFRONDEN: vragenlijst & resultaat
   * ===================================================== */
  doneBtn.onclick = confirmFinish;
  function confirmFinish() {
    openSheet(`<h2>Klaar met bekijken?</h2><p>Je gaat door naar een paar korte vragen. Daarna kun je niet meer terug naar de vacatures.</p>
      <div class="sheet-actions"><button class="btn btn-ghost" data-close>Nog even verder</button><button class="btn btn-yellow" data-sheet="finish">Ja, klaar</button></div>`, 'small');
  }
  function goSurvey() {
    pauseDwell(); S.tEnd = Date.now(); log('finish'); toastEl.classList.remove('show');
    const ap = [...S.applied].map(id => byId[id]);
    const s = screen('summary'); s.classList.add('scroll');
    s.innerHTML = `<div class="page">
      <div><span class="kicker">Jouw resultaat</span><h1 style="margin-top:8px">${ap.length ? 'Zo ging het' : 'Je hebt niet gesolliciteerd'}</h1></div>
      <div class="result-box">
        <span class="big">${ap.length}</span>
        <p style="font-weight:700">${ap.length === 1 ? 'sollicitatie' : 'sollicitaties'}${S.variant === 'feed' ? ` · ${S.saved.length} vacature${S.saved.length === 1 ? '' : 's'} bewaard` : ''}</p>
        ${ap.length ? `<ul class="applied-list">${ap.map(v => `<li><b>${esc(v.title)}</b><span>${esc(v.loc)} · ${esc(v.salary)}</span></li>`).join('')}</ul>` : '<p class="fine">Je hebt op geen enkele vacature gesolliciteerd.</p>'}
      </div>
      <div class="spacer"></div>
      <button class="btn btn-block" id="toSurvey">Verder met de vragen ${I.arrow}</button>
    </div>`;
    show('summary'); s.scrollTop = 0;
    $('#toSurvey').onclick = renderSurvey;
  }
  function renderSurvey() {
    const s = screen('survey'); s.classList.add('scroll');
    const scale = (name, lo, hi) => `<div class="scale">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="${name}" value="${n}" required><span>${n}</span></label>`).join('')}</div>
      <div class="scale-ends"><span>${lo}</span><span>${hi}</span></div>`;
    s.innerHTML = `<form class="page" id="surveyForm" novalidate>
      <div><span class="kicker">Bijna klaar</span><h1 style="margin-top:8px">Even terugkijken</h1></div>
      <fieldset><legend>Hoeveel vacatures denk je ongeveer gezien te hebben?</legend>
        <input class="field" type="number" name="estimate" min="0" max="9999" inputmode="numeric" placeholder="Jouw schatting" required></fieldset>
      <fieldset><legend>Hoe tevreden ben je met jouw resultaat?</legend>${scale('satisfaction', 'Ontevreden', 'Tevreden')}</fieldset>
      <fieldset><legend>Hoe luchtig voelde het doorkijken van vacatures?</legend>${scale('light', 'Zwaar', 'Luchtig')}</fieldset>
      <fieldset><legend>Hoeveel druk voelde je om per vacature een keuze te maken?</legend>${scale('pressure', 'Geen druk', 'Veel druk')}</fieldset>
      <fieldset><legend>Hoe prettig vond je deze manier van vacatures bekijken?</legend>${scale('pleasant', 'Onprettig', 'Prettig')}</fieldset>
      <fieldset><legend>Wat viel je op? <span style="font-weight:500">(optioneel)</span></legend><textarea class="field" name="comment" placeholder="Wat werkte goed, wat miste je?"></textarea></fieldset>
      <p class="fine" id="formErr" hidden style="color:var(--red)!important;font-weight:700">Beantwoord alle vragen met een cijfer om door te gaan.</p>
      <button class="btn btn-block" type="submit">Verstuur ${I.arrow}</button>
    </form>`;
    show('survey'); s.scrollTop = 0;
    $('#surveyForm').onsubmit = ev => {
      ev.preventDefault(); const f = ev.target;
      if (!f.checkValidity()) { $('#formErr').hidden = false; f.reportValidity(); return; }
      submit(Object.fromEntries(new FormData(f)));
    };
  }

  function buildResult(a) {
    const seen = seenCount(), est = Number(a.estimate);
    const dwellVals = S.variant === 'feed' ? Object.values(S.dwell) : S.decided.map(d => d.ms);
    return {
      pid: S.pid, variant: S.variant, startedAt: new Date(S.t0).toISOString(),
      durationSec: Math.round(((S.tEnd || Date.now()) - S.t0) / 1000), vacanciesAvailable: ALL.length,
      seen, stoppedEarly: !S.reachedEnd, seenPctOfAvailable: Math.round(100 * seen / ALL.length), estimate: est, estimateError: est - seen, estimateErrorPct: seen ? Math.round(100 * (est - seen) / seen) : null,
      medianMsPerVacancy: Math.round(median(dwellVals)),
      detailOpens: S.detailOpens,
      saved: S.variant === 'feed' ? S.saved.length : null,
      removedFromShortlist: S.variant === 'feed' ? S.removedCount : null,
      shortlistViews: S.shortlistViews, compareViews: S.compareViews,
      swipeLeft: S.variant === 'swipe' ? S.decided.filter(d => d.dir === 'l').length : null,
      swipeRight: S.variant === 'swipe' ? S.decided.filter(d => d.dir === 'r').length : null,
      applied: S.applied.size, appliedIds: [...S.applied].join(' '),
      satisfaction: Number(a.satisfaction), light: Number(a.light), pressure: Number(a.pressure), pleasant: Number(a.pleasant), comment: (a.comment || '').trim(),
      events: S.events
    };
  }
  const CSV_COLS = ['pid', 'variant', 'startedAt', 'durationSec', 'vacanciesAvailable', 'seen', 'stoppedEarly', 'seenPctOfAvailable', 'estimate', 'estimateError', 'estimateErrorPct', 'medianMsPerVacancy', 'detailOpens', 'saved', 'removedFromShortlist', 'shortlistViews', 'compareViews', 'swipeLeft', 'swipeRight', 'applied', 'satisfaction', 'light', 'pressure', 'pleasant', 'comment'];
  const toCSV = rows => [CSV_COLS.join(',')].concat(rows.map(r => CSV_COLS.map(c => { const v = r[c] ?? ''; return /[",\n;]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v; }).join(','))).join('\n');
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  function submit(answers) {
    const result = buildResult(answers);
    const all = store.get(RESULTS_KEY) || []; all.push(result); store.set(RESULTS_KEY, all);
    if (CFG.endpoint) { try { fetch(CFG.endpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(result) }).catch(() => {}); } catch (e) {} }
    renderThanks(result, all);
  }
  function renderThanks(r, all) {
    const s = screen('thanks'); s.classList.add('scroll');
    const json = JSON.stringify(r, null, 2);
    const other = S.variant === 'feed' ? 'swipe' : 'feed';
    s.innerHTML = `<div class="page">
      <div><span class="kicker">Dankjewel!</span><h1 style="margin-top:8px">Je antwoorden zijn opgeslagen</h1></div>
      <p>Even ter vergelijking: je schatte dat je er <b>${r.estimate}</b> had gezien.</p>
      <div class="pair">
        <div class="result-box"><span class="kicker">Jouw schatting</span><span class="big">${r.estimate}</span></div>
        <div class="result-box" style="background:var(--yellow)"><span class="kicker" style="color:var(--blue)">Echt gezien</span><span class="big">${r.seen}</span></div>
      </div>
      <p class="fine">Hoe dichter die twee bij elkaar liggen, hoe beter je overzicht hield.</p>
      <details class="mod"><summary>Voor de testleider: resultaten</summary>
        <p class="fine" style="margin-top:8px"><b>${r.stoppedEarly ? `Afgehaakt na ${r.seen} van ${r.vacanciesAvailable} vacatures (${r.seenPctOfAvailable}%)` : `Alle ${r.vacanciesAvailable} vacatures bekeken`}</b><br>Variant: <b>${r.variant}</b> · ${all.length} sessie(s) opgeslagen in deze browser${CFG.endpoint ? ' · ook verstuurd naar het ingestelde endpoint' : ''}.</p>
        <textarea readonly id="jsonBox">${esc(json)}</textarea>
        <div class="row-btns">
          <button class="btn btn-small btn-ghost" id="dlJson" type="button">Download JSON</button>
          <button class="btn btn-small btn-ghost" id="dlCsv" type="button">Alle sessies (CSV)</button>
          <button class="btn btn-small btn-ghost" id="cpJson" type="button">Kopieer</button>
        </div></details>
      <div class="spacer"></div>
      <button class="btn btn-block btn-yellow" id="otherBtn">Probeer ook de ${other === 'feed' ? 'feed' : 'swipe'}-versie</button>
      <button class="btn btn-block btn-ghost" id="againBtn">Nieuwe sessie starten</button>
    </div>`;
    show('thanks'); topbar.hidden = false; s.scrollTop = 0;
    $('#dlJson').onclick = () => download(`swipe4work-${r.variant}-${r.pid}.json`, json, 'application/json');
    $('#dlCsv').onclick = () => download('swipe4work-resultaten.csv', toCSV(all), 'text/csv');
    $('#cpJson').onclick = () => { $('#jsonBox').select(); try { document.execCommand('copy'); toast('Gekopieerd'); } catch (e) {} };
    $('#otherBtn').onclick = () => { store.sset('variant', other); location.href = location.pathname + '?v=' + other + (params.has('debug') ? '&debug' : ''); };
    $('#againBtn').onclick = () => { try { sessionStorage.removeItem('variant'); } catch (e) {} if (params.get('v')) location.reload(); else location.href = location.pathname; };
  }

  /* ---------- tabs ---------- */
  tabs.addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) show(t.dataset.tab); });

  renderIntro();
})();
