/*
 * K-Rambles shared renderer.
 * Fetches per-board JSON data at runtime and renders:
 *  - hub pages: the tile grid + local search + like buttons + reveal animation
 *  - the home page: each board's "newest N" shelf + a site-wide search index
 *
 * Adding a new article no longer means hand-editing hub/home HTML: add one
 * entry to the relevant data/<board>-<lang>.json file and it appears
 * everywhere it should, automatically, on next page load.
 */
(function (global) {
  'use strict';

  /**
   * Board-level base search keywords — automatically appended to every
   * article's search haystack (title+cat+kw) at render time, per board and
   * per language. This is SEPARATE from each article's own `kw` field (still
   * hand-written per piece) and from the footer "keyword-links" pill buttons
   * (still hand-picked per piece, unaffected by this). Purpose: guarantee
   * broad category words (e.g. a visitor typing "food") always surface every
   * piece on that board, without relying on every individual kw field to
   * remember to include them.
   */
  var BOARD_BASE_KW = {
    'taste': {
      en: 'food restaurant meal eat where to eat',
      ko: '음식 맛집 식당 먹거리 어디서 먹을까',
      vi: 'am thuc mon an nha hang an o dau',
      th: 'อาหาร ร้านอาหาร กินที่ไหน เมนูอาหาร'
    },
    'getting-around': {
      en: 'transport transportation getting around how to get',
      ko: '교통 이동 대중교통 가는 법',
      vi: 'giao thong di chuyen phuong tien cong cong cach di',
      th: 'การเดินทาง ขนส่ง วิธีไป รถสาธารณะ'
    },
    'trip-planner': {
      en: 'things to do attraction sightseeing itinerary',
      ko: '여행 볼거리 관광 일정',
      vi: 'du lich diem tham quan lich trinh cho di choi',
      th: 'ที่เที่ยว จุดท่องเที่ยว แผนการเดินทาง กิจกรรม'
    },
    'long-stay': {
      en: 'living in korea expat resident long stay',
      ko: '한국 거주 체류 장기체류 생활',
      vi: 'song o han quoc dinh cu cu tru dai han sinh hoat',
      th: 'การใช้ชีวิตในเกาหลี พำนักระยะยาว ผู้พำนัก'
    }
  };

  function boardBaseKw(jsonUrl) {
    var m = /([a-z-]+)-(en|ko|vi|th)\.json(?:$|\?)/.exec(jsonUrl || '');
    if (!m) { return ''; }
    var entry = BOARD_BASE_KW[m[1]];
    return entry ? (entry[m[2]] || '') : '';
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) { throw new Error('Failed to load ' + url + ' (' + res.status + ')'); }
      return res.json();
    });
  }

  function sortByDateDesc(items) {
    return items.slice().sort(function (a, b) {
      var ad = a.date || '0000-00-00';
      var bd = b.date || '0000-00-00';
      if (ad === bd) { return 0; }
      return ad < bd ? 1 : -1;
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Returns 'ko', 'vi', 'th', or 'en' (default). Most pages don't set
  // <html lang>, so this falls back to the /ko/, /vi/, or /th/ path segment
  // every localized page lives under.
  function getLang() {
    var lang = (document.documentElement.lang || '').toLowerCase();
    if (lang.indexOf('ko') === 0) { return 'ko'; }
    if (lang.indexOf('vi') === 0) { return 'vi'; }
    if (lang.indexOf('th') === 0) { return 'th'; }
    if (lang.indexOf('en') === 0) { return 'en'; }
    if (/(^|\/)ko(\/|$)/.test(location.pathname)) { return 'ko'; }
    if (/(^|\/)vi(\/|$)/.test(location.pathname)) { return 'vi'; }
    if (/(^|\/)th(\/|$)/.test(location.pathname)) { return 'th'; }
    return 'en';
  }

  /**
   * Auto-populate every <div class="lang-switch" data-key="...">.
   *
   * Adding a new language used to mean hand-editing the lang-switch block on
   * every existing page (100+ files, one at a time — easy to miss one or get
   * a relative path wrong). Now each page just carries a stable content key
   * (data-key) and this reads data/translations.json once per page load to
   * fill in whichever language links actually exist for that key. Adding a
   * new language going forward = add one column of URLs to
   * data/translations.json. No existing page ever needs to be touched again.
   */
  var LANG_ORDER = ['en', 'vi', 'th', 'ko'];
  var LANG_LABEL = { en: 'EN', ko: '한글', vi: 'VI', th: 'TH' };

  function renderLangSwitches() {
    var nodes = document.querySelectorAll('.lang-switch[data-key]');
    if (!nodes.length) { return; }
    var myLang = getLang();
    fetchJSON('/data/translations.json').then(function (manifest) {
      nodes.forEach(function (node) {
        var key = node.getAttribute('data-key');
        var entry = manifest[key];
        if (!entry) { return; }
        var html = LANG_ORDER.filter(function (l) { return entry[l]; }).map(function (l) {
          if (l === myLang) { return '<span class="current">' + LANG_LABEL[l] + '</span>'; }
          return '<a href="' + esc(entry[l] + (key === 'liked' ? location.search : '')) + '">' + LANG_LABEL[l] + '</a>';
        }).join('');
        node.innerHTML = html;
      });
    }).catch(function (err) {
      console.error('[krambles] lang-switch failed:', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderLangSwitches);
  } else {
    renderLangSwitches();
  }

  function tileHTML(item, hrefFor, thumbFor) {
    var href = hrefFor(item);
    var thumb = thumbFor(item);
    var alt = item.alt || item.title;
    var badge = item.badge ? '<span class="tile-photo-badge">' + esc(item.badge) + '</span>' : '';
    var lang = getLang();
    var likeLabel = lang === 'ko' ? '이 글 저장하기'
      : lang === 'vi' ? 'Lưu bài này'
      : lang === 'th' ? 'บันทึกบทความนี้'
      : 'Save this piece';
    var likeTitle = lang === 'ko'
      ? '이 기기에만 저장돼요 — 다른 폰·브라우저로 바꾸면 사라져요. 인기 있는 글을 파악하는 데도 도움돼요.'
      : lang === 'vi'
      ? 'Chỉ lưu trên thiết bị này — đổi điện thoại hoặc trình duyệt khác sẽ mất. Cũng giúp chúng tôi biết bài nào được quan tâm nhiều.'
      : lang === 'th'
      ? 'บันทึกไว้ในอุปกรณ์นี้เท่านั้น — หากเปลี่ยนโทรศัพท์หรือเบราว์เซอร์ ข้อมูลจะหายไป นอกจากนี้ยังช่วยให้เรารู้ว่าบทความไหนได้รับความนิยม'
      : 'Saved on this device only — switch phones or browsers and it’s gone. Also helps us see what’s popular.';
    return (
      '<div class="tile tile--photo reveal">' +
        '<a class="tile-photo-link" href="' + esc(href) + '">' +
          '<div class="tile-photo-frame">' +
            '<img src="' + esc(thumb) + '" alt="' + esc(alt) + '" loading="lazy">' +
            badge +
          '</div>' +
          '<div class="tile-photo-body">' +
            '<span class="tile-photo-label">' + esc(item.label || '') + '</span>' +
            '<h3 class="tile-photo-title">' + esc(item.title) + '</h3>' +
          '</div>' +
        '</a>' +
        '<button class="tile-like-btn" data-like-id="' + esc(item.like_id) + '" data-goatcounter-click="like:' + esc(item.like_id) + '" aria-label="' + esc(likeLabel) + '" aria-pressed="false" title="' + esc(likeTitle) + '"><svg><use href="#i-heart"/></svg></button>' +
      '</div>'
    );
  }

  // One-time (per browser) disclosure toast — fires on the first save anywhere on
  // the site, on tap or click, so it reaches mobile visitors who can't hover.
  // Stays up until the visitor closes it — no auto-dismiss timer, so there's no
  // race against someone reading it.
  var TOAST_SEEN_KEY = 'krambles-like-notice-seen';
  function ensureToastStyle() {
    if (document.getElementById('kr-like-toast-style')) { return; }
    var style = document.createElement('style');
    style.id = 'kr-like-toast-style';
    style.textContent = '.kr-like-toast{position:fixed;left:50%;bottom:22px;transform:translate(-50%,12px);' +
      'display:flex;align-items:center;gap:10px;' +
      'background:rgba(31,36,32,.94);color:#fdf8f2;font-family:"Work Sans",ui-sans-serif,system-ui,sans-serif;' +
      'font-size:.86rem;line-height:1.45;padding:12px 12px 12px 18px;border-radius:12px;max-width:min(88vw,380px);' +
      'box-shadow:0 12px 30px -10px rgba(0,0,0,.5);opacity:0;pointer-events:none;' +
      'transition:opacity .25s ease,transform .25s ease;z-index:9999}' +
      '.kr-like-toast.is-visible{opacity:1;transform:translate(-50%,0);pointer-events:auto}' +
      '.kr-like-toast-msg{flex:1 1 auto;}' +
      '.kr-like-toast-close{flex-shrink:0;appearance:none;border:none;cursor:pointer;' +
      'background:rgba(255,255,255,.14);color:inherit;width:26px;height:26px;border-radius:50%;' +
      'font-size:1.05rem;line-height:1;display:inline-flex;align-items:center;justify-content:center;}' +
      '.kr-like-toast-close:hover{background:rgba(255,255,255,.26);}';
    document.head.appendChild(style);
  }
  function showLikeToast() {
    try { if (localStorage.getItem(TOAST_SEEN_KEY)) { return; } } catch (e) {}
    ensureToastStyle();
    var lang = getLang();
    var msg = lang === 'ko'
      ? '좋아요 리스트는 이 브라우저에만 보관 돼요. 즉, 브라우저가 바뀌면 좋아요 리스트는 공유가 안돼요. 그리고 좋아요 누른 글은 상단 메뉴에서 다시 볼 수 있어요.'
      : lang === 'vi'
      ? 'Danh sách yêu thích chỉ được lưu trên trình duyệt này — đổi trình duyệt khác thì danh sách sẽ không còn. Bạn có thể xem lại các bài đã lưu từ menu ở trên cùng.'
      : lang === 'th'
      ? 'รายการที่บันทึกไว้จะถูกเก็บไว้ในเบราว์เซอร์นี้เท่านั้น — หากเปลี่ยนเบราว์เซอร์ รายการจะไม่ถูกเก็บไว้ คุณสามารถดูบทความที่บันทึกไว้ทั้งหมดได้อีกครั้งจากเมนูด้านบน'
      : 'Your likes are saved to this browser only — switch browsers and the list won’t carry over. You can find everything you’ve liked again from the menu at the top.';
    var toast = document.createElement('div');
    toast.className = 'kr-like-toast';

    var text = document.createElement('span');
    text.className = 'kr-like-toast-msg';
    text.textContent = msg;

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'kr-like-toast-close';
    closeBtn.setAttribute('aria-label', lang === 'ko' ? '닫기' : lang === 'vi' ? 'Đóng' : lang === 'th' ? 'ปิด' : 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function () {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.remove(); }, 300);
    });

    toast.appendChild(text);
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });
    try { localStorage.setItem(TOAST_SEEN_KEY, '1'); } catch (e) {}
  }

  // Event-delegated so tiles injected after fetch still get like behavior.
  function wireLikes(root) {
    var LIKE_KEY = 'krambles-likes';
    function getLikes() { try { return JSON.parse(localStorage.getItem(LIKE_KEY) || '[]'); } catch (e) { return []; } }
    function setLikes(arr) { try { localStorage.setItem(LIKE_KEY, JSON.stringify(arr)); } catch (e) {} }
    var likes = getLikes();
    root.querySelectorAll('.tile-like-btn').forEach(function (btn) {
      var id = btn.getAttribute('data-like-id');
      if (likes.indexOf(id) !== -1) { btn.classList.add('is-liked'); btn.setAttribute('aria-pressed', 'true'); }
    });
    if (root.__krLikesWired) { return; }
    root.__krLikesWired = true;
    root.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.tile-like-btn') : null;
      if (!btn || !root.contains(btn)) { return; }
      e.preventDefault();
      e.stopPropagation();
      var id = btn.getAttribute('data-like-id');
      var current = getLikes();
      var idx = current.indexOf(id);
      if (idx === -1) {
        current.push(id); btn.classList.add('is-liked'); btn.setAttribute('aria-pressed', 'true');
        showLikeToast();
      } else {
        current.splice(idx, 1); btn.classList.remove('is-liked'); btn.setAttribute('aria-pressed', 'false');
      }
      setLikes(current);
    });
  }

  function wireReveal(tiles) {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add('in-view'); io.unobserve(entry.target); }
        });
      }, { threshold: 0.15 });
      tiles.forEach(function (el) { io.observe(el); });
    } else {
      tiles.forEach(function (el) { el.classList.add('in-view'); });
    }
  }

  // "{n}" -> count. "{n:pin|pins}" -> singular/plural picked by count.
  function fillCountTemplate(template, n) {
    return template
      .replace(/\{n:([^|}]*)\|([^}]*)\}/g, function (_, one, many) { return n === 1 ? one : many; })
      .replace(/\{n\}/g, n);
  }

  function searchRow(item) {
    return '<a class="search-result" href="' + esc(item.url) + '">' +
      '<span class="search-result-title">' + esc(item.title) + '</span>' +
      '<span class="search-result-meta">' + esc(item.cat) + '</span></a>';
  }

  function matchSearch(items, q, limit) {
    var words = q.split(/\s+/).filter(Boolean);
    return items.filter(function (item) {
      var hay = (item.title + ' ' + item.cat + ' ' + (item.kw || '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    }).slice(0, limit);
  }

  // Single-panel search used on hub pages.
  function wireSearch(items, ids) {
    var input = document.getElementById(ids.input || 'site-search');
    var results = document.getElementById(ids.results || 'site-search-results');
    if (!input || !results) { return; }
    function render(matches) {
      results.innerHTML = matches.length
        ? matches.map(searchRow).join('')
        : '<p class="search-empty">No matches — try another word.</p>';
    }
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      if (!q) { results.classList.remove('is-open'); results.innerHTML = ''; return; }
      render(matchSearch(items, q, 10));
      results.classList.add('is-open');
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        var first = results.querySelector('.search-result');
        if (first) { window.location.href = first.getAttribute('href'); }
      }
    });
    document.addEventListener('click', function (e) {
      if (!input.contains(e.target) && !results.contains(e.target)) { results.classList.remove('is-open'); }
    });
  }

  // Pinnable panel-plus-list search used on the home page.
  function wireHomeSearch(items, ids) {
    var input = document.getElementById(ids.input || 'site-search');
    var panel = document.getElementById(ids.panel || 'site-search-results');
    var list = document.getElementById(ids.list || 'site-search-list');
    var closeBtn = document.getElementById(ids.close || 'site-search-close');
    if (!input || !panel || !list) { return; }
    var pinned = false;

    function render(matches) {
      list.innerHTML = matches.length
        ? matches.map(searchRow).join('')
        : '<p class="search-empty">No matches — try another word.</p>';
    }
    function closeResults() { panel.classList.remove('is-open'); panel.classList.remove('is-pinned'); pinned = false; }
    function run(qRaw) {
      var q = (qRaw || '').trim().toLowerCase();
      if (!q) { closeResults(); list.innerHTML = ''; return; }
      render(matchSearch(items, q, 8));
      panel.classList.add('is-open');
    }
    input.addEventListener('input', function () { run(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        var first = list.querySelector('.search-result');
        if (first) { window.location.href = first.getAttribute('href'); }
      }
    });
    document.addEventListener('click', function (e) {
      if (pinned) { return; }
      if (!input.contains(e.target) && !panel.contains(e.target)) { panel.classList.remove('is-open'); }
    });
    if (closeBtn) { closeBtn.addEventListener('click', closeResults); }
    try {
      var qParam = new URLSearchParams(window.location.search).get('q');
      if (qParam) {
        input.value = qParam;
        run(qParam);
        pinned = true;
        panel.classList.add('is-pinned');
        input.scrollIntoView({ block: 'center' });
      }
    } catch (e) { /* URLSearchParams unsupported — ignore */ }
  }

  /**
   * Render one hub (board) page.
   * config: {
   *   jsonUrl, assetBase, gridSelector, countSelector, countTemplate,
   *   boardLabel, searchInputId, searchResultsId
   * }
   */
  function renderHub(config) {
    var grid = document.querySelector(config.gridSelector || '.hub-grid');
    if (!grid) { return; }
    fetchJSON(config.jsonUrl).then(function (raw) {
      var items = sortByDateDesc(raw);
      var assetBase = config.assetBase || '';
      grid.innerHTML = items.map(function (item) {
        return tileHTML(item, function (it) { return it.url; }, function (it) { return assetBase + it.thumb; });
      }).join('');

      wireLikes(grid);
      wireReveal(Array.prototype.slice.call(grid.querySelectorAll('.tile.reveal')));

      if (config.countSelector && config.countTemplate) {
        var countEl = document.querySelector(config.countSelector);
        if (countEl) { countEl.textContent = fillCountTemplate(config.countTemplate, items.length); }
      }

      var baseKw = boardBaseKw(config.jsonUrl);
      var searchItems = items.map(function (it) {
        return { title: it.title, cat: config.boardLabel || it.label || '', url: it.url, kw: ((it.kw || '') + ' ' + baseKw).trim() };
      });
      wireSearch(searchItems, { input: config.searchInputId, results: config.searchResultsId });
    }).catch(function (err) { console.error('[krambles] hub render failed:', err); });
  }

  /**
   * Render a "saved / liked" page: pulls every board's JSON for the current
   * language, keeps only items whose like_id is in localStorage, and shows
   * them as tiles (newest-first). No server involved — purely a client-side
   * filter over data already being fetched elsewhere on the site.
   * config: { assetBase, boards: [{key, jsonUrl}], gridSelector,
   *           emptySelector, countSelector, countTemplate }
   */
  function renderLiked(config) {
    var grid = document.querySelector(config.gridSelector || '.liked-grid');
    if (!grid) { return; }
    var LIKE_KEY = 'krambles-likes';
    var likedIds;
    try { likedIds = JSON.parse(localStorage.getItem(LIKE_KEY) || '[]'); } catch (e) { likedIds = []; }

    function showEmpty(n) {
      grid.innerHTML = '';
      var empty = config.emptySelector && document.querySelector(config.emptySelector);
      if (empty) { empty.hidden = false; }
      if (config.countSelector && config.countTemplate) {
        var countEl = document.querySelector(config.countSelector);
        if (countEl) { countEl.textContent = fillCountTemplate(config.countTemplate, n || 0); }
      }
    }

    var sharedRoute = parseSharedRoute();
    if (!likedIds.length && !sharedRoute) { showEmpty(0); return; }

    var assetBase = config.assetBase || '';
    Promise.all(config.boards.map(function (board) {
      return fetchJSON(board.jsonUrl).then(function (raw) {
        return raw.filter(function (item) { return sharedRoute || likedIds.indexOf(item.like_id) !== -1; })
          .map(function (item) { return { item: item, board: board }; });
      }).catch(function () { return []; });
    })).then(function (groups) {
      var flat = [].concat.apply([], groups);
      var shared = null;
      if (sharedRoute) {
        // resolve the shared stops against the site's own articles, keeping the sender's order
        var byHash = {};
        flat.forEach(function (pair) { byHash[shareHash(shareArticleKey(pair.item))] = pair; });
        var stops = [], usedPairs = [];
        sharedRoute.stops.forEach(function (st, idx) {
          var pair = byHash[st.h];
          var loc = pair && (pair.item.locations || [])[st.i];
          if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') { return; }
          stops.push({ pair: pair, locIdx: st.i, leg: sharedRoute.legs[idx] || null });
          if (usedPairs.indexOf(pair) === -1) { usedPairs.push(pair); }
        });
        if (stops.length >= 2) {
          shared = { stops: stops };
          flat = usedPairs;
          var heroEl = document.querySelector('.liked-hero');
          if (heroEl) { heroEl.hidden = true; heroEl.style.display = 'none'; }
        } else {
          sharedRoute = null;
          flat = flat.filter(function (pair) { return likedIds.indexOf(pair.item.like_id) !== -1; });
        }
      }
      flat.sort(function (a, b) {
        var ad = a.item.date || '0000-00-00', bd = b.item.date || '0000-00-00';
        if (ad === bd) { return 0; }
        return ad < bd ? 1 : -1;
      });

      if (!flat.length) { showEmpty(0); return; }

      grid.innerHTML = flat.map(function (pair) {
        return tileHTML(pair.item, function (it) { return hrefForHome(pair.board, it); }, function (it) { return assetBase + it.thumb; });
      }).join('');
      wireLikes(grid);
      wireReveal(Array.prototype.slice.call(grid.querySelectorAll('.tile.reveal')));

      var empty = config.emptySelector && document.querySelector(config.emptySelector);
      if (empty) { empty.hidden = true; }
      if (config.countSelector && config.countTemplate) {
        var countEl = document.querySelector(config.countSelector);
        if (countEl) { countEl.textContent = fillCountTemplate(config.countTemplate, flat.length); }
      }

      if (config.map) { renderLikedMap(flat, config.map, shared); }
    }).catch(function (err) { console.error('[krambles] liked render failed:', err); });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var _googleMapsCallbacks = null;
  function loadGoogleMapsSdk(apiKey, callback) {
    if (window.google && window.google.maps && window.google.maps.Map) { callback(); return; }
    if (_googleMapsCallbacks) { _googleMapsCallbacks.push(callback); return; }
    _googleMapsCallbacks = [callback];
    window.__krGoogleMapsReady = function () {
      var cbs = _googleMapsCallbacks || [];
      _googleMapsCallbacks = null;
      cbs.forEach(function (cb) { cb(); });
    };
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(apiKey) + '&callback=__krGoogleMapsReady&loading=async';
    s.async = true;
    s.onerror = function () {
      console.error('[krambles] Google Maps SDK failed to load');
      _googleMapsCallbacks = null;
    };
    document.head.appendChild(s);
  }

  var ROUTE_STR = {
    en: {
      shareBtn: 'Share this route',
      linkCopied: 'Link copied',
      shareTitle: 'My Busan route — K-Rambles',
      sharedTitle: 'A route shared with you',
      sharedMeta: '{n} stops · about {t} total · view only',
      saveToLikes: '♡ Add to my likes',
      savedToLikes: '✓ Added to your likes',
      recalcBtn: 'Recalculate in my own order',
      title: 'Plan a route between your saved spots',
      calcBtn: 'Plan the order',
      calculating: 'Checking transit times…',
      fillingGaps: 'Filling in a few driving-time gaps…',
      failed: 'Distance lookup failed: ',
      done: 'Done',
      someDriving: 'Some legs have no public transit — using driving time for those.',
      toNextTransit: 'Transit to next stop: about ',
      toNextDriving: 'No public transit — driving to next stop: about ',
      googleTransit: 'Google Maps transit →',
      googleDriving: 'Google Maps driving →',
      naverTransit: 'Naver Map transit →',
      naverDriving: 'Naver Map driving →',
      affiliateTag: '(affiliate link)',
      totalPrefix: 'Total travel time: about ',
      totalAllTransit: ' · all by public transit',
      totalSomeDriving: ' (some legs by car)',
      combineNote: 'Bundling every stop into one link locks the whole trip to a single travel mode — if even one leg has no public transit, the whole thing fails. That’s why each leg below gets its own button.'
    },
    ko: {
      shareBtn: '동선 공유하기',
      linkCopied: '링크를 복사했어요',
      shareTitle: '내가 짠 부산 동선 — K-Rambles',
      sharedTitle: '친구가 공유한 동선이에요',
      sharedMeta: '장소 {n}곳 · 총 이동시간 약 {t} · 읽기 전용',
      saveToLikes: '♡ 내 좋아요에 담기',
      savedToLikes: '✓ 내 좋아요에 담았어요',
      recalcBtn: '내 순서로 다시 계산',
      title: '찜한 곳 중 갈 곳 골라서 동선 짜기',
      calcBtn: '동선 계산하기',
      calculating: '대중교통 이동시간 조회 중…',
      fillingGaps: '일부 구간 자동차 이동시간 보충 조회 중…',
      failed: '이동시간 조회 실패: ',
      done: '계산 완료',
      someDriving: '일부 구간은 대중교통이 없어 자동차 이동시간으로 대체했어요.',
      toNextTransit: '다음 장소까지 대중교통 약 ',
      toNextDriving: '대중교통 없음 · 자동차 기준 약 ',
      googleTransit: '구글맵 대중교통 →',
      googleDriving: '구글맵 자동차 →',
      naverTransit: '네이버맵 대중교통 →',
      naverDriving: '네이버맵 자동차 →',
      affiliateTag: '(제휴링크)',
      totalPrefix: '총 이동시간: 약 ',
      totalAllTransit: ' · 전 구간 대중교통',
      totalSomeDriving: ' (일부 구간 자동차 기준)',
      combineNote: '전체를 한 링크로 묶으면 이동수단이 하나로 고정돼서, 대중교통 없는 구간이 하나라도 있으면 통째로 실패해요. 그래서 구간마다 알맞은 이동수단으로 따로 버튼을 걸었어요.'
    },
    vi: {
      shareBtn: 'Chia sẻ lộ trình',
      linkCopied: 'Đã sao chép liên kết',
      shareTitle: 'Lộ trình Busan của tôi — K-Rambles',
      sharedTitle: 'Lộ trình được chia sẻ với bạn',
      sharedMeta: '{n} điểm dừng · tổng khoảng {t} · chỉ xem',
      saveToLikes: '♡ Thêm vào mục Đã lưu',
      savedToLikes: '✓ Đã thêm vào mục Đã lưu',
      recalcBtn: 'Tính lại theo thứ tự của tôi',
      title: 'Chọn nơi sẽ ghé để lên lộ trình',
      calcBtn: 'Tính lộ trình',
      calculating: 'Đang kiểm tra thời gian di chuyển bằng phương tiện công cộng…',
      fillingGaps: 'Đang bổ sung thời gian đi ô tô cho vài chặng…',
      failed: 'Không lấy được thời gian di chuyển: ',
      done: 'Đã tính xong',
      someDriving: 'Một vài chặng không có phương tiện công cộng — đã dùng thời gian đi ô tô thay thế.',
      toNextTransit: 'Đến điểm tiếp theo bằng phương tiện công cộng: khoảng ',
      toNextDriving: 'Không có phương tiện công cộng — đi ô tô khoảng ',
      googleTransit: 'Google Maps (công cộng) →',
      googleDriving: 'Google Maps (ô tô) →',
      naverTransit: 'Naver Map (công cộng) →',
      naverDriving: 'Naver Map (ô tô) →',
      affiliateTag: '(liên kết tiếp thị)',
      totalPrefix: 'Tổng thời gian di chuyển: khoảng ',
      totalAllTransit: ' · toàn bộ bằng phương tiện công cộng',
      totalSomeDriving: ' (một vài chặng đi ô tô)',
      combineNote: 'Gộp tất cả điểm dừng vào một link sẽ khoá cả chuyến đi vào một phương tiện duy nhất — chỉ cần một chặng không có phương tiện công cộng là toàn bộ sẽ lỗi. Vì vậy mỗi chặng bên dưới có nút riêng.'
    },
    th: {
      shareBtn: 'แชร์เส้นทางนี้',
      linkCopied: 'คัดลอกลิงก์แล้ว',
      shareTitle: 'เส้นทางปูซานของฉัน — K-Rambles',
      sharedTitle: 'เส้นทางที่เพื่อนแชร์ให้',
      sharedMeta: '{n} จุด · รวมประมาณ {t} · ดูอย่างเดียว',
      saveToLikes: '♡ เพิ่มในรายการที่บันทึกไว้',
      savedToLikes: '✓ เพิ่มในรายการที่บันทึกไว้แล้ว',
      recalcBtn: 'คำนวณใหม่ตามลำดับของฉัน',
      title: 'เลือกสถานที่ที่จะไปจริงเพื่อวางเส้นทาง',
      calcBtn: 'คำนวณเส้นทาง',
      calculating: 'กำลังตรวจสอบเวลาเดินทางด้วยขนส่งสาธารณะ…',
      fillingGaps: 'กำลังเติมเวลาขับรถสำหรับบางช่วง…',
      failed: 'ดึงข้อมูลเวลาเดินทางไม่สำเร็จ: ',
      done: 'คำนวณเสร็จแล้ว',
      someDriving: 'บางช่วงไม่มีขนส่งสาธารณะ — ใช้เวลาขับรถแทน',
      toNextTransit: 'ไปจุดต่อไปด้วยขนส่งสาธารณะ: ประมาณ ',
      toNextDriving: 'ไม่มีขนส่งสาธารณะ — ขับรถประมาณ ',
      googleTransit: 'Google Maps ขนส่งสาธารณะ →',
      googleDriving: 'Google Maps ขับรถ →',
      naverTransit: 'Naver Map ขนส่งสาธารณะ →',
      naverDriving: 'Naver Map ขับรถ →',
      affiliateTag: '(ลิงก์พันธมิตร)',
      totalPrefix: 'เวลาเดินทางรวม: ประมาณ ',
      totalAllTransit: ' · ขนส่งสาธารณะทั้งหมด',
      totalSomeDriving: ' (บางช่วงใช้รถยนต์)',
      combineNote: 'ถ้ารวมทุกจุดไว้ในลิงก์เดียว จะล็อกการเดินทางไว้ที่รูปแบบเดียว หากมีแม้แต่ช่วงเดียวที่ไม่มีขนส่งสาธารณะ เส้นทางทั้งหมดจะใช้งานไม่ได้ จึงแยกปุ่มให้แต่ละช่วงด้านล่างนี้'
    }
  };

  function formatRouteDuration(lang, seconds) {
    var mins = Math.round(seconds / 60);
    if (lang === 'ko') {
      if (mins < 60) { return mins + '분'; }
      var hK = Math.floor(mins / 60), mK = mins % 60;
      return hK + '시간' + (mK ? ' ' + mK + '분' : '');
    }
    if (lang === 'vi') {
      if (mins < 60) { return mins + ' phút'; }
      var hV = Math.floor(mins / 60), mV = mins % 60;
      return hV + ' giờ' + (mV ? ' ' + mV + ' phút' : '');
    }
    if (lang === 'th') {
      if (mins < 60) { return mins + ' นาที'; }
      var hT = Math.floor(mins / 60), mT = mins % 60;
      return hT + ' ชม.' + (mT ? ' ' + mT + ' นาที' : '');
    }
    if (mins < 60) { return mins + ' min'; }
    var hE = Math.floor(mins / 60), mE = mins % 60;
    return hE + 'h' + (mE ? ' ' + mE + 'm' : '');
  }

  // Exact shortest-path ordering for small N (brute force over permutations);
  // falls back to a nearest-neighbor heuristic beyond 8 stops to avoid a
  // factorial blowup (10! = 3.6M) — still runs instantly either way, no
  // server/AI involved, just arithmetic over the Distance Matrix results.
  function bestRouteOrder(n, durationMatrix) {
    var indices = [];
    for (var i = 0; i < n; i++) { indices.push(i); }
    var best = null, bestCost = Infinity;
    function permute(arr, chosen) {
      if (chosen.length === arr.length) {
        var cost = 0;
        for (var k = 0; k < chosen.length - 1; k++) { cost += durationMatrix[chosen[k]][chosen[k + 1]]; }
        if (cost < bestCost) { bestCost = cost; best = chosen.slice(); }
        return;
      }
      for (var idx = 0; idx < arr.length; idx++) {
        if (chosen.indexOf(arr[idx]) !== -1) { continue; }
        chosen.push(arr[idx]);
        permute(arr, chosen);
        chosen.pop();
      }
    }
    if (n <= 8) {
      permute(indices, []);
    } else {
      var used = [0], cur = 0;
      while (used.length < n) {
        var nextIdx = -1, nextCost = Infinity;
        for (var j = 0; j < n; j++) {
          if (used.indexOf(j) !== -1) { continue; }
          if (durationMatrix[cur][j] < nextCost) { nextCost = durationMatrix[cur][j]; nextIdx = j; }
        }
        used.push(nextIdx);
        cur = nextIdx;
      }
      best = used;
      bestCost = 0;
      for (var m2 = 0; m2 < best.length - 1; m2++) { bestCost += durationMatrix[best[m2]][best[m2 + 1]]; }
    }
    return { order: best, totalSeconds: bestCost };
  }

  function routeLegGoogleUrl(from, to, nonTransit) {
    return 'https://www.google.com/maps/dir/?api=1'
      + '&origin=' + from.lat + ',' + from.lng
      + '&destination=' + to.lat + ',' + to.lng
      + '&travelmode=' + (nonTransit ? 'driving' : 'transit');
  }

  // Modern map.naver.com web directions URL (the same pattern Naver's own
  // "길찾기 공유하기" produces) — works in any browser, no app required.
  // Naver's nmap:// app deep link is NOT used here: it only supports one
  // origin + one destination too, but only opens on mobile with the app
  // installed, so it can't cover a desktop visitor.
  function routeLegNaverUrl(from, to, nonTransit) {
    var mode = nonTransit ? 'car' : 'transit';
    return 'https://map.naver.com/p/directions/'
      + from.lng + ',' + from.lat + ',' + encodeURIComponent(from.name) + ',,/'
      + to.lng + ',' + to.lat + ',' + encodeURIComponent(to.name) + ',,/-/' + mode;
  }


  // ---- Route sharing -------------------------------------------------------
  // A shared link carries only short article ids + the visiting order + the leg
  // durations the sender already calculated, e.g. ?r=1k9x2a.0,zq1w3b.0&t=28,35c
  // (r = article-hash.pin-index in order; t = minutes per leg, "c" = by car).
  // The receiver's browser looks the ids up in the site's own data files, so no
  // server is involved, and the link works in whichever language the page is.
  function shareArticleKey(item) {
    var f = String(item.like_id || '').split('/').pop().replace(/\.html$/i, '');
    return f.replace(/-(en|ko|vi|th)$/i, '');
  }
  function shareHash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function parseSharedRoute() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return null; }
    var r = q.get('r');
    if (!r) { return null; }
    var stops = r.split(',').map(function (tok) {
      var m = /^([0-9a-z]+)\.(\d{1,2})$/.exec(tok);
      return m ? { h: m[1], i: parseInt(m[2], 10) } : null;
    }).filter(Boolean).slice(0, 40);
    if (stops.length < 2) { return null; }
    var legs = String(q.get('t') || '').split(',').map(function (tok) {
      var m = /^(\d{1,4})(c?)$/.exec(tok);
      return m ? { secs: parseInt(m[1], 10) * 60, car: m[2] === 'c' } : null;
    });
    return { stops: stops, legs: legs };
  }
  function ensureShareStyle() {
    if (document.getElementById('kr-share-style')) { return; }
    var st = document.createElement('style');
    st.id = 'kr-share-style';
    st.textContent =
      '.kr-share-btn{background:#fff;color:var(--navy,#1b2a4a);border:1.5px solid var(--navy,#1b2a4a);border-radius:8px;padding:8px 15px;font-size:.86rem;font-weight:600;cursor:pointer;font-family:inherit}' +
      '.kr-share-btn:hover{background:rgba(27,42,74,.06)}' +
      '.kr-shared-banner{max-width:1040px;margin:6px auto 22px;padding:0 28px;box-sizing:border-box}' +
      '.kr-shared-banner-in{display:flex;align-items:center;gap:36px;flex-wrap:wrap;background:#fff6f2;border:1px solid #f3cdbf;border-radius:14px;padding:16px 22px}' +
      '.kr-shared-banner b{display:block;font-family:"Bricolage Grotesque",sans-serif;font-size:1.08rem;margin-bottom:3px}' +
      '.kr-shared-banner span.kr-shared-meta{font-size:.84rem;color:var(--ink-soft,#5a625c)}' +
      '.kr-save-btn{flex:0 0 auto;background:var(--coral,#e8654a);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}' +
      '.kr-save-btn[disabled]{background:#5b8a6a;cursor:default}' +
      '@media(max-width:700px){.kr-shared-banner{padding:0 16px}.kr-shared-banner-in{gap:14px;padding:16px}}';
    document.head.appendChild(st);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) { resolve(); } else { reject(new Error('copy failed')); }
      } catch (e) { reject(e); }
    });
  }

  /**
   * Draws every pin belonging to the current liked list onto a single Google
   * map. A liked article can carry more than one location (e.g. a piece
   * covering several restaurants); every one of them gets its own marker.
   * Articles with an empty/absent `locations` array (how-to/info content)
   * simply contribute no pins. If nothing on the liked list has a location,
   * the whole map block hides itself rather than showing an empty map.
   *
   * Also wires the route-planning panel (if its markup is present on the
   * page): a checklist lets the visitor pick which saved spots they'll
   * actually visit, "Plan the order" calls the Distance Matrix API (transit,
   * falling back to driving per-leg where transit doesn't exist) to work out
   * the lowest-total-time visiting order, and each leg gets its own Google
   * Maps + Naver Map directions button (never one combined multi-stop link —
   * that locks the whole trip to one travel mode and fails outright the
   * moment a single leg has no transit route). A location entry may also
   * carry an optional `affiliateLinks: [{platform, url}]` array; when
   * present (e.g. a bookable activity), up to 2 of those show as small
   * secondary buttons next to that stop.
   *
   * mapConfig: { apiKey, containerSelector, wrapSelector, countSelector, countTemplate }
   */
  function renderLikedMap(flat, mapConfig, shared) {
    var mapEl = document.querySelector(mapConfig.containerSelector);
    if (!mapEl) { return; }
    var wrap = mapConfig.wrapSelector && document.querySelector(mapConfig.wrapSelector);

    var pins = [];
    function makePin(pair, loc, locIdx) {
      return {
        id: 'kr-pin-' + pins.length,
        name: loc.name,
        lat: loc.lat,
        lng: loc.lng,
        articleTitle: pair.item.title,
        articleUrl: hrefForHome(pair.board, pair.item),
        articleHash: shareHash(shareArticleKey(pair.item)),
        locIdx: locIdx,
        affiliateLinks: Array.isArray(loc.affiliateLinks) ? loc.affiliateLinks : []
      };
    }
    if (shared) {
      shared.stops.forEach(function (st) { pins.push(makePin(st.pair, st.pair.item.locations[st.locIdx], st.locIdx)); });
    } else {
      flat.forEach(function (pair) {
        (pair.item.locations || []).forEach(function (loc, locIdx) {
          if (typeof loc.lat === 'number' && typeof loc.lng === 'number') { pins.push(makePin(pair, loc, locIdx)); }
        });
      });
    }

    if (mapConfig.countSelector && mapConfig.countTemplate) {
      var countEl = document.querySelector(mapConfig.countSelector);
      if (countEl) { countEl.textContent = fillCountTemplate(mapConfig.countTemplate, pins.length); }
    }

    if (!pins.length) {
      if (wrap) { wrap.hidden = true; }
      return;
    }
    if (wrap) { wrap.hidden = false; }

    loadGoogleMapsSdk(mapConfig.apiKey, function () {
      var center = { lat: pins[0].lat, lng: pins[0].lng };
      var map = new google.maps.Map(mapEl, { center: center, zoom: 13 });
      var bounds = new google.maps.LatLngBounds();
      var openInfoWindow = null;
      var markerById = {};

      function isChecked(id) {
        var chk = document.getElementById('kr-chk-' + id);
        return !!(chk && chk.checked);
      }

      function refreshMarkerStyles(orderedIds) {
        pins.forEach(function (pin) {
          var marker = markerById[pin.id];
          if (!marker) { return; }
          var sel = isChecked(pin.id);
          var label = null;
          if (orderedIds) {
            var idx = orderedIds.indexOf(pin.id);
            if (idx !== -1) { label = String(idx + 1); }
          }
          marker.setOpacity(sel ? 1 : 0.45);
          marker.setLabel(label ? { text: label, color: '#fff', fontWeight: '700' } : null);
        });
      }

      function refreshMapFocus() {
        var selectedPins = pins.filter(function (pin) { return isChecked(pin.id); });
        if (selectedPins.length === 1) {
          // fitBounds on a single point zooms in way too far -- just pan
          // to it and keep whatever zoom level the visitor already had
          map.panTo({ lat: selectedPins[0].lat, lng: selectedPins[0].lng });
        } else if (selectedPins.length > 1) {
          var b = new google.maps.LatLngBounds();
          selectedPins.forEach(function (pin) { b.extend({ lat: pin.lat, lng: pin.lng }); });
          map.fitBounds(b);
        }
      }

      pins.forEach(function (pin) {
        var position = { lat: pin.lat, lng: pin.lng };
        bounds.extend(position);
        var marker = new google.maps.Marker({ position: position, map: map, title: pin.name, opacity: 0.45 });
        markerById[pin.id] = marker;
        var infoWindow = new google.maps.InfoWindow({
          content: '<div style="padding:10px 14px;max-width:220px;font-size:13px;line-height:1.5;font-family:inherit;">' +
            '<strong style="display:block;margin-bottom:2px;">' + escapeHtml(pin.name) + '</strong>' +
            '<a href="' + escapeHtml(pin.articleUrl) + '" style="color:#d9532a;text-decoration:none;">' + escapeHtml(pin.articleTitle) + ' →</a>' +
            '</div>'
        });
        marker.addListener('click', function () {
          var chk = document.getElementById('kr-chk-' + pin.id);
          if (chk && !shared) { chk.checked = !chk.checked; onChecklistChange(); }
          if (openInfoWindow) { openInfoWindow.close(); }
          infoWindow.open(map, marker);
          openInfoWindow = infoWindow;
        });
      });

      if (pins.length > 1) { map.fitBounds(bounds); }

      // --- route-planning panel (only if this page's markup has it) ---
      var panelEl = document.getElementById('liked-route-panel');
      var checklistEl = document.getElementById('liked-route-checklist');
      var calcBtn = document.getElementById('liked-route-calc-btn');
      var statusEl = document.getElementById('liked-route-status');
      var resultEl = document.getElementById('liked-route-result');
      var hintEl = document.getElementById('liked-route-hint');
      var orderEl = document.getElementById('liked-route-order');
      var totalEl = document.getElementById('liked-route-total');
      if (!panelEl || !checklistEl || !calcBtn || !statusEl || !resultEl || !hintEl || !orderEl || !totalEl) { return; }

      var lang = getLang();
      var STR = ROUTE_STR[lang] || ROUTE_STR.en;

      panelEl.hidden = false;
      document.getElementById('liked-route-title').textContent = STR.title;
      calcBtn.textContent = STR.calcBtn;
      hintEl.textContent = STR.combineNote;

      // --- share button (appears once a route has been worked out) ---
      var shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'kr-share-btn';
      shareBtn.textContent = STR.shareBtn;
      shareBtn.hidden = true;
      shareBtn.setAttribute('data-goatcounter-click', 'share-route');
      ensureShareStyle();
      calcBtn.parentNode.insertBefore(shareBtn, statusEl);
      var shareState = null;
      shareBtn.addEventListener('click', function () {
        if (!shareState) { return; }
        var stopsParam = shareState.pins.map(function (pin) { return pin.articleHash + '.' + pin.locIdx; }).join(',');
        var legsParam = [];
        for (var k = 0; k < shareState.pins.length - 1; k++) {
          var a = shareState.order[k], b = shareState.order[k + 1];
          legsParam.push(Math.max(1, Math.round(shareState.matrix[a][b] / 60)) + (shareState.isNonTransit[a][b] ? 'c' : ''));
        }
        var url = location.origin + location.pathname + '?r=' + stopsParam + '&t=' + legsParam.join(',');
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (coarse && navigator.share) {
          navigator.share({ title: STR.shareTitle, url: url }).catch(function () {});
          return;
        }
        copyText(url).then(function () {
          statusEl.textContent = STR.linkCopied;
          statusEl.className = 'liked-route-status';
        }).catch(function () { window.prompt('', url); });
      });

      checklistEl.innerHTML = pins.map(function (pin) {
        return '<li><input type="checkbox" id="kr-chk-' + pin.id + '"><label for="kr-chk-' + pin.id + '">' + escapeHtml(pin.name) + '</label></li>';
      }).join('');

      function onChecklistChange() {
        var selected = pins.filter(function (pin) { return isChecked(pin.id); });
        calcBtn.disabled = selected.length < 2;
        resultEl.hidden = true;
        shareBtn.hidden = true;
        statusEl.textContent = '';
        statusEl.className = 'liked-route-status';
        refreshMarkerStyles(null);
        refreshMapFocus();
      }
      checklistEl.addEventListener('change', onChecklistChange);

      if (shared) { setupSharedView(); }

      function renderRouteResult(orderedPins, orderIdx, matrix, isNonTransit, totalSeconds) {
        var html = '';
        var anyNonTransitLeg = false;
        orderedPins.forEach(function (pin, i) {
          html += '<li><div><div class="kr-leg-name">' + escapeHtml(pin.name) + '</div>';
          var buttonsHtml = '';
          if (i < orderedPins.length - 1) {
            var a = orderIdx[i], b = orderIdx[i + 1];
            var secs = matrix[a][b];
            var nonTransit = isNonTransit[a][b];
            if (nonTransit) { anyNonTransitLeg = true; }
            var next = orderedPins[i + 1];
            html += '<div class="kr-leg-transit' + (nonTransit ? ' kr-driving' : '') + '">'
              + (nonTransit ? STR.toNextDriving : STR.toNextTransit) + formatRouteDuration(lang, secs)
              + '</div>';
            buttonsHtml += '<a class="kr-leg-btn' + (nonTransit ? ' kr-driving-btn' : '') + '" href="' + routeLegGoogleUrl(pin, next, nonTransit) + '" target="_blank" rel="noopener">'
              + (nonTransit ? STR.googleDriving : STR.googleTransit) + '</a>';
            buttonsHtml += '<a class="kr-leg-btn kr-naver-btn" href="' + routeLegNaverUrl(pin, next, nonTransit) + '" target="_blank" rel="noopener">'
              + (nonTransit ? STR.naverDriving : STR.naverTransit) + '</a>';
          }
          (pin.affiliateLinks || []).slice(0, 2).forEach(function (link) {
            if (!link || !link.url) { return; }
            buttonsHtml += '<a class="kr-leg-btn kr-affiliate-btn" href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener">'
              + '🎫 ' + escapeHtml(link.platform || '') + ' <span style="font-weight:400;">' + STR.affiliateTag + '</span></a>';
          });
          if (buttonsHtml) { html += '<div class="kr-leg-buttons">' + buttonsHtml + '</div>'; }
          html += '</div></li>';
        });
        orderEl.innerHTML = html;
        totalEl.textContent = STR.totalPrefix + formatRouteDuration(lang, totalSeconds)
          + (anyNonTransitLeg ? STR.totalSomeDriving : STR.totalAllTransit);
        resultEl.hidden = false;
        shareState = { pins: orderedPins, order: orderIdx, matrix: matrix, isNonTransit: isNonTransit };
        shareBtn.hidden = false;
      }

      // --- read-only view of a route someone shared ---
      function setupSharedView() {
        var n = pins.length;
        pins.forEach(function (pin) { var c = document.getElementById('kr-chk-' + pin.id); if (c) { c.checked = true; } });
        checklistEl.style.display = 'none';
        calcBtn.disabled = false;
        calcBtn.textContent = STR.recalcBtn;
        document.getElementById('liked-route-title').style.display = 'none';
        hintEl.style.display = 'none';
        var headEl = wrap && wrap.querySelector('.liked-map-head');
        var noteEl = wrap && wrap.querySelector('.liked-map-note');
        if (headEl) { headEl.style.display = 'none'; }
        if (noteEl) { noteEl.style.display = 'none'; }

        // durations come from the link itself, so the receiver triggers no distance lookups
        var matrix = [], nonTransit = [], total = 0, idx = [];
        for (var i = 0; i < n; i++) {
          idx.push(i); matrix[i] = []; nonTransit[i] = [];
          for (var j = 0; j < n; j++) { matrix[i][j] = 0; nonTransit[i][j] = false; }
        }
        for (var k = 0; k < n - 1; k++) {
          var leg = shared.stops[k].leg;
          if (leg) { matrix[k][k + 1] = leg.secs; nonTransit[k][k + 1] = leg.car; total += leg.secs; }
        }
        renderRouteResult(pins, idx, matrix, nonTransit, total);
        refreshMarkerStyles(pins.map(function (p) { return p.id; }));
        refreshMapFocus();

        // banner
        ensureShareStyle();
        var banner = document.createElement('div');
        banner.className = 'kr-shared-banner';
        banner.innerHTML = '<div class="kr-shared-banner-in"><div><b>' + escapeHtml(STR.sharedTitle) + '</b>'
          + '<span class="kr-shared-meta">' + escapeHtml(STR.sharedMeta.replace('{n}', String(n)).replace('{t}', formatRouteDuration(lang, total))) + '</span></div>'
          + '<button type="button" class="kr-save-btn" data-goatcounter-click="save-shared-route">' + escapeHtml(STR.saveToLikes) + '</button></div>';
        wrap.parentNode.insertBefore(banner, wrap);
        var saveBtn = banner.querySelector('.kr-save-btn');
        saveBtn.addEventListener('click', function () {
          var current;
          try { current = JSON.parse(localStorage.getItem('krambles-likes') || '[]'); } catch (e) { current = []; }
          flat.forEach(function (pair) {
            if (current.indexOf(pair.item.like_id) === -1) { current.push(pair.item.like_id); }
            var heart = document.querySelector('.tile-like-btn[data-like-id="' + pair.item.like_id + '"]');
            if (heart) { heart.classList.add('is-liked'); heart.setAttribute('aria-pressed', 'true'); }
          });
          try { localStorage.setItem('krambles-likes', JSON.stringify(current)); } catch (e) {}
          saveBtn.textContent = STR.savedToLikes;
          saveBtn.disabled = true;
        });
      }

      calcBtn.addEventListener('click', function () {
        if (checklistEl.style.display === 'none') { checklistEl.style.display = ''; calcBtn.textContent = STR.calcBtn; }
        var selected = pins.filter(function (pin) { return isChecked(pin.id); });
        if (selected.length < 2) { return; }
        calcBtn.disabled = true;
        shareBtn.hidden = true;
        statusEl.className = 'liked-route-status';
        statusEl.textContent = STR.calculating;

        var service = new google.maps.DistanceMatrixService();
        var latlngs = selected.map(function (pin) { return { lat: pin.lat, lng: pin.lng }; });

        service.getDistanceMatrix({
          origins: latlngs,
          destinations: latlngs,
          travelMode: google.maps.TravelMode.TRANSIT,
          unitSystem: google.maps.UnitSystem.METRIC
        }, function (transitResponse, transitStatus) {
          if (transitStatus !== 'OK') {
            calcBtn.disabled = false;
            statusEl.textContent = STR.failed + transitStatus;
            statusEl.className = 'liked-route-status is-error';
            return;
          }
          var n = selected.length;
          var transitMatrix = [], isNonTransit = [], missingCount = 0;
          for (var i = 0; i < n; i++) {
            transitMatrix[i] = [];
            isNonTransit[i] = [];
            for (var j = 0; j < n; j++) {
              isNonTransit[i][j] = false;
              if (i === j) { transitMatrix[i][j] = 0; continue; }
              var el = transitResponse.rows[i].elements[j];
              if (el.status === 'OK') { transitMatrix[i][j] = el.duration.value; }
              else { transitMatrix[i][j] = null; missingCount++; }
            }
          }

          function finish(matrix) {
            calcBtn.disabled = false;
            var result = bestRouteOrder(n, matrix);
            var orderedPins = result.order.map(function (idx) { return selected[idx]; });
            renderRouteResult(orderedPins, result.order, matrix, isNonTransit, result.totalSeconds);
            refreshMarkerStyles(orderedPins.map(function (p) { return p.id; }));
            statusEl.textContent = missingCount > 0 ? STR.someDriving : STR.done;
            statusEl.className = missingCount > 0 ? 'liked-route-status is-error' : 'liked-route-status';
          }

          if (missingCount === 0) { finish(transitMatrix); return; }

          statusEl.textContent = STR.fillingGaps;
          service.getDistanceMatrix({
            origins: latlngs,
            destinations: latlngs,
            travelMode: google.maps.TravelMode.DRIVING,
            unitSystem: google.maps.UnitSystem.METRIC
          }, function (drivingResponse, drivingStatus) {
            for (var a = 0; a < n; a++) {
              for (var b = 0; b < n; b++) {
                if (transitMatrix[a][b] !== null) { continue; }
                var drivingEl = drivingStatus === 'OK' ? drivingResponse.rows[a].elements[b] : null;
                if (drivingEl && drivingEl.status === 'OK') {
                  // small penalty so the ordering still prefers an all-transit path when one exists
                  transitMatrix[a][b] = drivingEl.duration.value * 1.15;
                } else {
                  transitMatrix[a][b] = 5400; // no data at all -- rough 90min placeholder
                }
                isNonTransit[a][b] = true;
              }
            }
            finish(transitMatrix);
          });
        });
      });
    });
  }

  function hrefForHome(board, item) {
    if (item.url.indexOf('../') === 0) { return item.url.slice(3); }
    return board.key + '/' + item.url;
  }

  /**
   * Render the home page's per-board shelves + site-wide search.
   * config: {
   *   assetBase,
   *   boards: [{ key, jsonUrl, label, containerSelector, limit,
   *              countLabelSelector, countLabelTemplate,
   *              countMoreSelector, countMoreTemplate }],
   *   searchInputId, searchPanelId, searchListId, searchCloseId
   * }
   */
  function renderHome(config) {
    var assetBase = config.assetBase || '';
    var loads = config.boards.map(function (board) {
      return fetchJSON(board.jsonUrl)
        .then(function (raw) { return { board: board, items: sortByDateDesc(raw) }; })
        .catch(function (err) {
          console.error('[krambles] home board failed:', board.key, err);
          return { board: board, items: [] };
        });
    });

    Promise.all(loads).then(function (results) {
      var searchItems = [];

      results.forEach(function (r) {
        var board = r.board, items = r.items;
        var container = document.querySelector(board.containerSelector);
        var top = items.slice(0, board.limit || 3);

        if (container) {
          // The board's cover tile (icon, title, "N pins" label) is static
          // markup and lives as a sibling of the photo tiles inside the same
          // grid container — keep it, and only replace the photo tiles.
          var cover = container.querySelector('.tile--cover');
          var tilesHtml = top.map(function (item) {
            return tileHTML(
              item,
              function (it) { return hrefForHome(board, it); },
              function (it) { return assetBase + it.thumb; }
            );
          }).join('');
          container.innerHTML = '';
          if (cover) { container.appendChild(cover); }
          container.insertAdjacentHTML('beforeend', tilesHtml);
          container.setAttribute('data-count', String((cover ? 1 : 0) + top.length));
        }

        if (board.countLabelSelector && board.countLabelTemplate) {
          document.querySelectorAll(board.countLabelSelector).forEach(function (el) {
            el.textContent = fillCountTemplate(board.countLabelTemplate, items.length);
          });
        }
        if (board.countMoreSelector && board.countMoreTemplate) {
          document.querySelectorAll(board.countMoreSelector).forEach(function (el) {
            var svg = el.querySelector('svg');
            el.textContent = fillCountTemplate(board.countMoreTemplate, items.length);
            if (svg) { el.appendChild(svg); }
          });
        }

        var baseKw = boardBaseKw(board.jsonUrl);
        items.forEach(function (it) {
          searchItems.push({
            title: it.title,
            cat: board.label,
            url: hrefForHome(board, it),
            kw: ((it.kw || '') + ' ' + baseKw).trim()
          });
        });
      });

      wireLikes(document.body);
      wireReveal(Array.prototype.slice.call(document.querySelectorAll('.tile.reveal')));
      wireHomeSearch(searchItems, {
        input: config.searchInputId,
        panel: config.searchPanelId,
        list: config.searchListId,
        close: config.searchCloseId
      });
    });
  }

  global.KR = { renderHub: renderHub, renderHome: renderHome, renderLiked: renderLiked };

  // Copy-to-clipboard fallback for mailto: links. A visitor without a
  // configured mail client (no Outlook/Mail app set as default) sees the
  // mailto: click do nothing at all — this copies the address as a backup
  // so they can paste it into whatever they do use, while people who DO
  // have a mail client still get the normal "open compose window" behavior
  // (both happen on the same click, harmlessly).
  (function wireMailtoCopy() {
    function boot() {
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest && e.target.closest('a[href^="mailto:"]');
        if (!a) { return; }
        var href = a.getAttribute('href');
        var email = href.replace(/^mailto:/, '').split('?')[0];
        if (!email) { return; }
        if (!navigator.clipboard || !navigator.clipboard.writeText) { return; }
        // Mobile browsers hand off to the mail-app chooser almost instantly
        // on this same click, which can cut off the async clipboard write
        // and the toast before either finishes. So: stop the default
        // navigation, show the toast and start the copy right away, then
        // trigger the mailto: navigation ourselves a beat later — giving
        // both a real chance to complete first on every platform.
        e.preventDefault();
        showMailtoToast(email);
        navigator.clipboard.writeText(email).catch(function () {});
        setTimeout(function () {
          window.location.href = href;
        }, 250);
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  })();

  function showMailtoToast(email) {
    if (!document.getElementById('kr-mailto-toast-style')) {
      var style = document.createElement('style');
      style.id = 'kr-mailto-toast-style';
      style.textContent =
        '.kr-mailto-toast{position:fixed;left:50%;bottom:22px;transform:translate(-50%,12px);' +
        'background:#1f2420;color:#eef2ec;padding:11px 16px;border-radius:10px;font-size:0.86rem;' +
        'font-family:"Work Sans",ui-sans-serif,sans-serif;box-shadow:0 12px 28px -12px rgba(0,0,0,.5);' +
        'opacity:0;transition:opacity .2s ease, transform .2s ease;z-index:999;pointer-events:none;' +
        'max-width:88vw;text-align:center;}' +
        '.kr-mailto-toast.is-visible{opacity:1;transform:translate(-50%,0);}';
      document.head.appendChild(style);
    }
    var existing = document.querySelector('.kr-mailto-toast');
    if (existing) { existing.remove(); }
    var toast = document.createElement('div');
    toast.className = 'kr-mailto-toast';
    var lang = getLang();
    var mailtoPrefix = lang === 'ko' ? '복사됨: ' : lang === 'vi' ? 'Đã sao chép: ' : lang === 'th' ? 'คัดลอกแล้ว: ' : 'Copied: ';
    toast.textContent = mailtoPrefix + email;
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });
    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.remove(); }, 250);
    }, 2600);
  }


  // Generic "click to copy" for any element carrying data-copy="text" (e.g.
  // the Korean department-name chips on the pharmacy/hospital guide). Reuses
  // the same toast styling/element as the mailto-copy feature above.
  (function wireGenericCopy() {
    function boot() {
      document.addEventListener('click', function (e) {
        var el = e.target && e.target.closest && e.target.closest('[data-copy]');
        if (!el) { return; }
        var text = el.getAttribute('data-copy');
        if (!text) { return; }
        if (!navigator.clipboard || !navigator.clipboard.writeText) { return; }
        e.preventDefault();
        navigator.clipboard.writeText(text).then(function () {
          showCopyToast(text);
        }).catch(function () {});
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  })();

  function showCopyToast(text) {
    if (!document.getElementById('kr-mailto-toast-style')) {
      var style = document.createElement('style');
      style.id = 'kr-mailto-toast-style';
      style.textContent =
        '.kr-mailto-toast{position:fixed;left:50%;bottom:22px;transform:translate(-50%,12px);' +
        'background:#1f2420;color:#eef2ec;padding:11px 16px;border-radius:10px;font-size:0.86rem;' +
        'font-family:"Work Sans",ui-sans-serif,sans-serif;box-shadow:0 12px 28px -12px rgba(0,0,0,.5);' +
        'opacity:0;transition:opacity .2s ease, transform .2s ease;z-index:999;pointer-events:none;' +
        'max-width:88vw;text-align:center;}' +
        '.kr-mailto-toast.is-visible{opacity:1;transform:translate(-50%,0);}';
      document.head.appendChild(style);
    }
    var existing = document.querySelector('.kr-mailto-toast');
    if (existing) { existing.remove(); }
    var toast = document.createElement('div');
    toast.className = 'kr-mailto-toast';
    var copyLang = getLang();
    var prefix = copyLang === 'ko' ? '복사됨: ' : copyLang === 'vi' ? 'Đã sao chép: ' : copyLang === 'th' ? 'คัดลอกแล้ว: ' : 'Copied: ';
    toast.textContent = prefix + text;
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });
    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.remove(); }, 250);
    }, 2600);
  }

  // One-time (per browser) hint bubble pointing at the Saved/Split-Costs icons
  // in the header. Only homepage markup has .header-util, so this is a no-op
  // everywhere else. Dismiss-only (X button), same convention as the like-save
  // toast above — no auto-hide.
  (function initHeaderHint() {
    var HINT_SEEN_KEY = 'krambles-header-hint-seen';
    function boot() {
      var util = document.querySelector('.header-util');
      if (!util) { return; }
      try { if (localStorage.getItem(HINT_SEEN_KEY)) { return; } } catch (e) {}

      var hintLang = getLang();
      var msg = hintLang === 'ko'
        ? '좋아요 한 글은 여기서, 경비 정산은 여기서 할 수 있어요.'
        : hintLang === 'vi'
        ? 'Nhấn vào đây để xem các bài đã lưu, hoặc vào đây để chia tiền.'
        : hintLang === 'th'
        ? 'แตะที่นี่เพื่อดูบทความที่บันทึกไว้ หรือแตะที่นี่เพื่อหารค่าใช้จ่าย'
        : 'Tap here to see your saved articles, or here to split costs.';

      if (!document.getElementById('kr-header-hint-style')) {
        var style = document.createElement('style');
        style.id = 'kr-header-hint-style';
        style.textContent =
          '.kr-header-hint{position:absolute;top:100%;left:0;margin-top:8px;' +
          'background:var(--coral,#d9532a);color:#fff5ee;padding:9px 12px;border-radius:10px;' +
          'font-size:0.82rem;line-height:1.4;display:flex;align-items:flex-start;gap:8px;' +
          'max-width:240px;box-shadow:0 10px 24px -10px rgba(0,0,0,0.35);z-index:50;' +
          'opacity:0;transform:translateY(-4px);transition:opacity .2s ease, transform .2s ease;pointer-events:none;}' +
          '.kr-header-hint.is-visible{opacity:1;transform:translateY(0);pointer-events:auto;}' +
          '.kr-header-hint:before{content:"";position:absolute;top:-5px;left:22px;width:10px;height:10px;' +
          'background:var(--coral,#d9532a);transform:rotate(45deg);}' +
          '.kr-header-hint-close{flex-shrink:0;appearance:none;border:none;background:rgba(255,255,255,.18);' +
          'color:inherit;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:0.9rem;line-height:1;}' +
          '.kr-header-hint-close:hover{background:rgba(255,255,255,.3);}';
        document.head.appendChild(style);
      }

      util.style.position = util.style.position || 'relative';
      var bubble = document.createElement('div');
      bubble.className = 'kr-header-hint';
      var text = document.createElement('span');
      text.textContent = msg;
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'kr-header-hint-close';
      closeBtn.setAttribute('aria-label', hintLang === 'ko' ? '닫기' : hintLang === 'vi' ? 'Đóng' : hintLang === 'th' ? 'ปิด' : 'Close');
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', function () {
        bubble.classList.remove('is-visible');
        setTimeout(function () { bubble.remove(); }, 200);
        try { localStorage.setItem(HINT_SEEN_KEY, '1'); } catch (e) {}
      });
      bubble.appendChild(text);
      bubble.appendChild(closeBtn);
      util.appendChild(bubble);
      requestAnimationFrame(function () { bubble.classList.add('is-visible'); });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  })();
})(window);

(function () {
  var SHOW_AFTER = 480;
  function boot() {
    if (document.querySelector('.kr-back-to-top')) { return; }

    var style = document.createElement('style');
    style.id = 'kr-back-to-top-style';
    style.textContent =
      '.kr-back-to-top{position:fixed;right:20px;bottom:20px;width:46px;height:46px;' +
      'border-radius:50%;border:1.5px solid var(--coral,#d9532a);background:#fff;' +
      'color:var(--coral,#d9532a);font-size:1.25rem;line-height:1;cursor:pointer;' +
      'box-shadow:0 10px 24px -8px rgba(0,0,0,0.28);display:flex;align-items:center;' +
      'justify-content:center;z-index:900;opacity:0;transform:translateY(8px);' +
      'pointer-events:none;transition:opacity .2s ease, transform .2s ease;}' +
      '.kr-back-to-top.is-visible{opacity:1;transform:translateY(0);pointer-events:auto;}' +
      '@media (max-width:480px){.kr-back-to-top{right:14px;bottom:14px;width:42px;height:42px;font-size:1.1rem;}}';
    document.head.appendChild(style);

    var htmlLang = (document.documentElement.lang || '').toLowerCase();
    var lang = htmlLang.indexOf('ko') === 0 ? 'ko'
      : htmlLang.indexOf('vi') === 0 ? 'vi'
      : htmlLang.indexOf('th') === 0 ? 'th'
      : /(^|\/)ko(\/|$)/.test(location.pathname) ? 'ko'
      : /(^|\/)vi(\/|$)/.test(location.pathname) ? 'vi'
      : /(^|\/)th(\/|$)/.test(location.pathname) ? 'th'
      : 'en';
    var label = lang === 'ko' ? '맨 위로 이동'
      : lang === 'vi' ? 'Lên đầu trang'
      : lang === 'th' ? 'กลับไปด้านบน'
      : 'Back to top';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kr-back-to-top';
    btn.setAttribute('aria-label', label);
    btn.innerHTML = '&#8593;';
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(btn);

    function onScroll() {
      if (window.scrollY > SHOW_AFTER) {
        btn.classList.add('is-visible');
      } else {
        btn.classList.remove('is-visible');
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
