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
      ? '저장한 글은 이 브라우저에만 보관돼요. 브라우저를 바꾸면 목록이 옮겨지지 않아요. 저장한 글은 상단 "내 여행 플래너"에서 다시 볼 수 있어요.'
      : lang === 'vi'
      ? 'Các bài đã lưu chỉ được giữ trong trình duyệt này — đổi trình duyệt thì danh sách sẽ không chuyển theo. Bạn có thể xem lại ở mục “Lộ trình của tôi” phía trên.'
      : lang === 'th'
      ? 'บทความที่บันทึกไว้จะถูกเก็บในเบราว์เซอร์นี้เท่านั้น — หากเปลี่ยนเบราว์เซอร์ รายการจะไม่ถูกย้ายตามไป ดูอีกครั้งได้ที่ “แผนเที่ยวของฉัน” ด้านบน'
      : 'Saved pieces stay in this browser only — switch browsers and the list won’t carry over. You can find them again under “My Trip Planner” at the top.';
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
    var sharedPlanLink = sharedRoute ? null : parseSharedPlan();
    if (!likedIds.length && !sharedRoute && !sharedPlanLink) {
      showEmpty(0);
      if (config.map) { renderLikedMap([], config.map, null, null); }
      return;
    }

    var assetBase = config.assetBase || '';
    Promise.all(config.boards.map(function (board) {
      return fetchJSON(board.jsonUrl).then(function (raw) {
        return raw.filter(function (item) { return sharedRoute || sharedPlanLink || likedIds.indexOf(item.like_id) !== -1; })
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
      var sharedPlan = null;
      if (sharedPlanLink) {
        var byHash2 = {};
        flat.forEach(function (pair) { byHash2[shareHash(shareArticleKey(pair.item))] = pair; });
        var planStops = [], planPairs = [];
        sharedPlanLink.stops.forEach(function (st) {
          if (st.kind === 'a') {
            var pr = byHash2[st.h];
            var lc = pr && (pr.item.locations || [])[st.i];
            if (!lc || typeof lc.lat !== 'number' || typeof lc.lng !== 'number') { return; }
            planStops.push({ name: lc.name, lat: lc.lat, lng: lc.lng, url: hrefForHome(pr.board, pr.item), articleTitle: pr.item.title, date: st.date, m: st.m, car: st.car });
            if (planPairs.indexOf(pr) === -1) { planPairs.push(pr); }
          } else {
            planStops.push({ name: st.name, lat: st.lat, lng: st.lng, url: '', articleTitle: '', date: st.date, m: st.m, car: st.car });
          }
        });
        if (planStops.length) {
          sharedPlan = { stops: planStops };
          flat = planPairs;
          var heroEl2 = document.querySelector('.liked-hero');
          if (heroEl2) { heroEl2.hidden = true; heroEl2.style.display = 'none'; }
        } else {
          flat = flat.filter(function (pair) { return likedIds.indexOf(pair.item.like_id) !== -1; });
        }
      }
      flat.sort(function (a, b) {
        var ad = a.item.date || '0000-00-00', bd = b.item.date || '0000-00-00';
        if (ad === bd) { return 0; }
        return ad < bd ? 1 : -1;
      });

      if (!flat.length) {
        showEmpty(0);
        if (config.map) { renderLikedMap([], config.map, null, sharedPlan); }
        return;
      }

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

      if (config.map) { renderLikedMap(flat, config.map, shared, sharedPlan); }
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
      saveToLikes: '♡ Add to my planner',
      savedToLikes: '✓ Added to your planner',
      recalcBtn: 'Recalculate in my own order',
      title: 'Pick your stops and plan the route by date',
      calcBtn: 'Plan the order',
      calculating: 'Checking transit times…',
      fillingGaps: 'Filling in a few driving-time gaps…',
      failed: 'Distance lookup failed: ',
      done: 'Route ready',
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
      saveToLikes: '♡ 내 플래너에 담기',
      savedToLikes: '✓ 내 플래너에 담았어요',
      recalcBtn: '내 순서로 다시 계산',
      title: '갈 곳을 골라 날짜별 동선 짜기',
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
      saveToLikes: '♡ Thêm vào lộ trình của tôi',
      savedToLikes: '✓ Đã thêm vào lộ trình của tôi',
      recalcBtn: 'Tính lại theo thứ tự của tôi',
      title: 'Chọn nơi sẽ ghé và lên lộ trình theo ngày',
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
      saveToLikes: '♡ เพิ่มในแผนเที่ยวของฉัน',
      savedToLikes: '✓ เพิ่มในแผนเที่ยวของฉันแล้ว',
      recalcBtn: 'คำนวณใหม่ตามลำดับของฉัน',
      title: 'เลือกสถานที่และวางเส้นทางตามวันที่',
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
      '.kr-shared-note{display:block;margin-top:8px}' +
      '.kr-plan-tools .kr-share-btn[hidden]{display:none!important}' +
      '.kr-plan-tools .kr-tool-btn,.kr-plan-tools .kr-share-btn{font-size:.84rem}' +
      '.kr-plan-note{margin:2px 0 0;font-size:.8rem;color:var(--ink-soft,#5a625c)}' +
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

  // ---- Trip planner (own places, dates, save/load, share) -------------------
  var PLAN_STR = {
    en: {
      addTitle: 'Add your own places',
      addHint: '',
      searchPh: 'Search a place in Korea (name or address)',
      searching: 'Searching…',
      noResults: 'No places found',
      searchFailed: 'Place search is unavailable right now.',
      added: 'Added: ',
      already: 'Already on your list: ',
      tooManyPlaces: 'You can add up to 40 places of your own.',
      myPlace: 'My place',
      remove: 'Remove',
      dateLabel: 'Date',
      undated: 'No date yet',
      saveFile: 'Save plan to a file',
      loadFile: 'Open a saved plan',
      fileSaved: 'Plan file ready',
      fileInvalid: 'That file is not a K-Rambles plan.',
      fileLoaded: 'Plan loaded: {n} places',
      linkTooLong: 'Link copied. It is long, so for big plans a saved file is more reliable.',
      importShared: 'Add to my plan',
      sharedPlanNote: 'Like it? Tap the button below to save it to your planner.<br>It isn’t saved on this device until you do.',
      toolsNote: 'Save plan files to move or back up between your own devices. To send a plan to a friend, use “Share this route” and send the link.',
      importedShared: '✓ Added to your plan',
      sharedPlanTitle: 'A plan shared with you',
      tooManyDay: 'Please keep each day to 10 places or fewer.',
      pickOne: 'Tick at least one place.',
      tipActive: 'Tap a pin or a name: the matching place is highlighted on the map and in the list.<br>Pick a travel date to plan your route day by day.',
      sharedLabel: 'Shared'
    },
    ko: {
      addTitle: '직접 장소 추가하기',
      addHint: '',
      searchPh: '한국 내 장소 검색 (이름이나 주소)',
      searching: '검색 중…',
      noResults: '검색 결과가 없어요',
      searchFailed: '지금은 장소 검색을 쓸 수 없어요.',
      added: '추가했어요: ',
      already: '이미 목록에 있어요: ',
      tooManyPlaces: '직접 추가는 최대 40곳까지 가능해요.',
      myPlace: '내 장소',
      remove: '삭제',
      dateLabel: '날짜',
      undated: '날짜 미정',
      saveFile: '일정 파일로 저장',
      loadFile: '저장한 일정 불러오기',
      fileSaved: '일정 파일을 만들었어요',
      fileInvalid: 'K-Rambles 일정 파일이 아니에요.',
      fileLoaded: '일정을 불러왔어요: {n}곳',
      linkTooLong: '링크를 복사했어요. 길이가 길어서 큰 일정은 파일로 저장하는 게 더 확실해요.',
      importShared: '내 일정에 담기',
      sharedPlanNote: '마음에 들면 아래 버튼을 눌러 내 플래너에 저장하세요.<br>누르기 전에는 이 기기에 저장되지 않아요.',
      toolsNote: '일정 파일은 내 폰·PC끼리 옮기거나 백업할 때 쓰세요. 친구에게 보낼 때는 "동선 공유하기"를 눌러 링크로 보내세요.',
      importedShared: '✓ 내 일정에 담았어요',
      sharedPlanTitle: '친구가 공유한 일정이에요',
      tooManyDay: '하루에는 10곳까지만 계산할 수 있어요.',
      pickOne: '장소를 하나 이상 체크해 주세요.',
      tipActive: '지도의 핀이나 목록의 이름을 누르면 같은 장소가 지도와 목록에서 함께 강조돼요.<br>여행 날짜를 선택하면 날짜별로 동선을 짤 수 있어요.',
      sharedLabel: '공유'
    },
    vi: {
      addTitle: 'Tự thêm địa điểm',
      addHint: '',
      searchPh: 'Tìm địa điểm ở Hàn Quốc (tên hoặc địa chỉ)',
      searching: 'Đang tìm…',
      noResults: 'Không tìm thấy địa điểm',
      searchFailed: 'Hiện chưa thể tìm địa điểm.',
      added: 'Đã thêm: ',
      already: 'Đã có trong danh sách: ',
      tooManyPlaces: 'Bạn có thể tự thêm tối đa 40 địa điểm.',
      myPlace: 'Địa điểm của tôi',
      remove: 'Xóa',
      dateLabel: 'Ngày',
      undated: 'Chưa chọn ngày',
      saveFile: 'Lưu lịch trình thành tệp',
      loadFile: 'Mở lịch trình đã lưu',
      fileSaved: 'Đã tạo tệp lịch trình',
      fileInvalid: 'Đây không phải tệp lịch trình của K-Rambles.',
      fileLoaded: 'Đã mở lịch trình: {n} địa điểm',
      linkTooLong: 'Đã sao chép liên kết. Liên kết khá dài, nên với lịch trình lớn hãy lưu thành tệp cho chắc.',
      importShared: 'Thêm vào lịch trình của tôi',
      sharedPlanNote: 'Nếu thích, hãy nhấn nút bên dưới để lưu vào lộ trình của bạn.<br>Cho đến khi nhấn, nội dung chưa được lưu trên thiết bị này.',
      toolsNote: 'Tệp lịch trình dùng để chuyển hoặc sao lưu giữa các thiết bị của bạn. Muốn gửi cho bạn bè, hãy nhấn “Chia sẻ lộ trình” và gửi liên kết.',
      importedShared: '✓ Đã thêm vào lịch trình của bạn',
      sharedPlanTitle: 'Lịch trình được chia sẻ với bạn',
      tooManyDay: 'Mỗi ngày chỉ tính được tối đa 10 địa điểm.',
      pickOne: 'Hãy tích chọn ít nhất một địa điểm.',
      tipActive: 'Chạm vào ghim hoặc tên địa điểm: nơi tương ứng sẽ được làm nổi bật trên bản đồ và trong danh sách.<br>Chọn ngày đi để lên lộ trình theo từng ngày.',
      sharedLabel: 'Chia sẻ'
    },
    th: {
      addTitle: 'เพิ่มสถานที่ของคุณเอง',
      addHint: '',
      searchPh: 'ค้นหาสถานที่ในเกาหลี (ชื่อหรือที่อยู่)',
      searching: 'กำลังค้นหา…',
      noResults: 'ไม่พบสถานที่',
      searchFailed: 'ตอนนี้ยังค้นหาสถานที่ไม่ได้',
      added: 'เพิ่มแล้ว: ',
      already: 'มีในรายการอยู่แล้ว: ',
      tooManyPlaces: 'เพิ่มสถานที่เองได้สูงสุด 40 แห่ง',
      myPlace: 'สถานที่ของฉัน',
      remove: 'ลบ',
      dateLabel: 'วันที่',
      undated: 'ยังไม่ระบุวันที่',
      saveFile: 'บันทึกแผนเป็นไฟล์',
      loadFile: 'เปิดแผนที่บันทึกไว้',
      fileSaved: 'สร้างไฟล์แผนแล้ว',
      fileInvalid: 'ไฟล์นี้ไม่ใช่ไฟล์แผนของ K-Rambles',
      fileLoaded: 'เปิดแผนแล้ว: {n} แห่ง',
      linkTooLong: 'คัดลอกลิงก์แล้ว ลิงก์ค่อนข้างยาว สำหรับแผนใหญ่ควรบันทึกเป็นไฟล์จะแน่นอนกว่า',
      importShared: 'เพิ่มในแผนของฉัน',
      sharedPlanNote: 'ถ้าถูกใจ แตะปุ่มด้านล่างเพื่อบันทึกลงแผนเที่ยวของคุณ<br>ก่อนแตะ จะยังไม่ถูกบันทึกไว้ในอุปกรณ์นี้',
      toolsNote: 'ไฟล์แผนใช้ย้ายหรือสำรองข้อมูลระหว่างอุปกรณ์ของคุณเอง ถ้าจะส่งให้เพื่อน ให้กด “แชร์เส้นทางนี้” แล้วส่งลิงก์',
      importedShared: '✓ เพิ่มในแผนของคุณแล้ว',
      sharedPlanTitle: 'แผนที่เพื่อนแชร์ให้',
      tooManyDay: 'คำนวณได้ไม่เกิน 10 แห่งต่อวัน',
      pickOne: 'โปรดติ๊กเลือกอย่างน้อยหนึ่งแห่ง',
      tipActive: 'แตะหมุดหรือชื่อสถานที่ แล้วสถานที่เดียวกันจะถูกไฮไลต์ทั้งบนแผนที่และในรายการ<br>เลือกวันที่เดินทางเพื่อวางเส้นทางทีละวัน',
      sharedLabel: 'แชร์'
    }
  };

  var CUSTOM_KEY = 'krambles-custom-places';
  var PLAN_KEY = 'krambles-plan-state';
  var MAX_CUSTOM = 40;
  var MAX_PER_DAY = 10;

  function readJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function writeJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  function b64urlEncode(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) { s += '='; }
    return decodeURIComponent(escape(atob(s)));
  }
  function isoToCompact(d) { return String(d || '').replace(/-/g, ''); }
  function compactToIso(d) {
    d = String(d || '');
    return /^\d{8}$/.test(d) ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) : '';
  }
  function validIsoDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')); }

  // ?p= carries a whole plan: [kind, ...] per stop, in the sender's order.
  //  a = a site article pin  ["a", articleHash, pinIndex, yyyymmdd, minToNext, byCar]
  //  c = any other place     ["c", name, lat, lng, yyyymmdd, minToNext, byCar]
  function parseSharedPlan() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return null; }
    var p = q.get('p');
    if (!p) { return null; }
    var arr;
    try { arr = JSON.parse(b64urlDecode(p)); } catch (e) { return null; }
    if (!Array.isArray(arr)) { return null; }
    var stops = [];
    arr.slice(0, 60).forEach(function (t) {
      if (!Array.isArray(t)) { return; }
      if (t[0] === 'a' && /^[0-9a-z]+$/.test(String(t[1])) && isFinite(t[2])) {
        stops.push({ kind: 'a', h: String(t[1]), i: parseInt(t[2], 10), date: compactToIso(t[3]), m: +t[4] || 0, car: !!t[5] });
      } else if (t[0] === 'c' && isFinite(t[2]) && isFinite(t[3])) {
        stops.push({ kind: 'c', name: String(t[1]).slice(0, 80), lat: +t[2], lng: +t[3], date: compactToIso(t[4]), m: +t[5] || 0, car: !!t[6] });
      }
    });
    return stops.length ? { stops: stops } : null;
  }

  function ensurePlanStyle() {
    if (document.getElementById('kr-plan-style')) { return; }
    var st = document.createElement('style');
    st.id = 'kr-plan-style';
    st.textContent =
      '.kr-add-box{margin:0 0 18px;padding:14px 16px;background:#fff;border:1px solid var(--line,#e3e0d8);border-radius:14px;position:relative}' +
      '.kr-add-box h3{font-family:"Bricolage Grotesque",sans-serif;font-size:1rem;margin:0 0 4px}' +
      '.kr-add-hint{font-size:.8rem;color:var(--ink-soft,#5a625c);margin:0 0 10px}' +
      '.kr-add-input{width:100%;box-sizing:border-box;font:inherit;font-size:.92rem;padding:10px 12px;border:1.5px solid var(--line-strong,#cfcabd);border-radius:10px;background:#fff}' +
      '.kr-add-input:focus{outline:2px solid var(--coral,#e8654a);outline-offset:1px}' +
      '.kr-add-results{list-style:none;margin:6px 0 0;padding:0;border:1px solid var(--line,#e3e0d8);border-radius:10px;overflow:hidden;background:#fff}' +
      '.kr-add-results li{padding:10px 12px;font-size:.88rem;cursor:pointer;border-bottom:1px solid var(--line,#e3e0d8)}' +
      '.kr-add-results li:last-child{border-bottom:none}' +
      '.kr-add-results li:hover,.kr-add-results li:focus{background:rgba(232,101,74,.08);outline:none}' +
      '.kr-add-results li small{display:block;color:var(--ink-soft,#5a625c);font-size:.76rem;margin-top:1px}' +
      '.kr-add-results li.kr-msg{cursor:default;color:var(--ink-soft,#5a625c)}' +
      '.kr-add-results li.kr-msg:hover{background:none}' +
      '.liked-route-list{grid-template-columns:1fr!important}' +
      '.liked-route-list li{display:grid;grid-template-columns:auto minmax(0,1fr) auto 9.5rem 30px;align-items:center;column-gap:8px;row-gap:6px;transition:background .15s}' +
      '.liked-route-list li>input[type=checkbox]{grid-column:1}' +
      '.liked-route-list li>label{grid-column:2;min-width:0;overflow-wrap:anywhere}' +
      '.liked-route-list li>.kr-chip{grid-column:3}' +
      '.liked-route-list li>.kr-date{grid-column:4;width:100%;box-sizing:border-box;height:36px}' +
      '.liked-route-list li>.kr-del{grid-column:5}' +
      '@media(max-width:560px){.liked-route-list li{grid-template-columns:auto minmax(0,1fr) auto 30px}.liked-route-list li>.kr-chip{grid-column:3;grid-row:1}.liked-route-list li>.kr-del{grid-column:4;grid-row:1}.liked-route-list li>.kr-date{grid-column:2 / 5;grid-row:2;max-width:11rem}}' +
      '.liked-route-list li.is-active,.liked-route-order li.is-active{background:rgba(232,101,74,.14);box-shadow:inset 3px 0 0 var(--coral,#e8654a)}' +
      '.liked-route-list li.is-active label,.liked-route-order li.is-active .kr-leg-name{font-weight:800;color:var(--coral-ink,#b8431f)}' +
      '.kr-leg-name{cursor:pointer}' +
      '.kr-chip{font-size:.68rem;font-weight:700;color:var(--coral-ink,#b8431f);background:rgba(232,101,74,.12);border-radius:999px;padding:1px 8px;white-space:nowrap}' +
      '.kr-date{font:inherit;font-size:.82rem;padding:5px 8px;border:1px solid var(--line-strong,#cfcabd);border-radius:8px;background:#fff;color:inherit;max-width:100%}' +
      '.kr-del{background:none;border:none;font-size:1.1rem;line-height:1;color:var(--ink-soft,#5a625c);cursor:pointer;padding:4px 7px;border-radius:6px}' +
      '.kr-del:hover{background:rgba(0,0,0,.06)}' +
      '.liked-route-actions{display:grid!important;grid-template-columns:1fr;gap:10px}' +
      '.liked-route-actions .liked-route-calc-btn{width:100%;min-height:46px;font-size:.92rem}' +
      '.liked-route-status:empty{display:none}' +
      '.kr-plan-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px;padding-bottom:22px;margin-bottom:6px;border-bottom:1px solid var(--line,#e5e0d8)}' +
      '.kr-plan-tools .kr-tool-btn,.kr-plan-tools .kr-share-btn{width:100%;min-height:46px;padding:8px 10px;line-height:1.25;text-align:center;display:flex;align-items:center;justify-content:center}' +
      '.kr-plan-note{grid-column:1/-1}' +
      '@media(max-width:560px){.kr-plan-tools{grid-template-columns:1fr}}' +
      '.kr-tool-btn{background:#fff;color:var(--navy,#1b2a4a);border:1.5px solid var(--navy,#1b2a4a);border-radius:8px;padding:8px 14px;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit}' +
      '.kr-tool-btn:hover{background:rgba(27,42,74,.06)}' +
      '.liked-route-order li.kr-day-head{counter-increment:none;counter-reset:kr-step;display:block;border-bottom:none;padding:16px 0 4px;font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:1rem;color:var(--navy,#1b2a4a)}' +
      '.liked-route-order li.kr-day-head::before{display:none}' +
      '.kr-tip{font-size:.78rem;color:var(--ink-soft,#5a625c);margin:10px 0 0}' +
      '@media(max-width:700px){.kr-add-box{padding:12px}}';
    document.head.appendChild(st);
  }

  function formatPlanDate(lang, iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) { return ''; }
    var loc = lang === 'ko' ? 'ko-KR' : lang === 'vi' ? 'vi-VN' : lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-US';
    try {
      return new Intl.DateTimeFormat(loc, { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(+m[1], +m[2] - 1, +m[3]));
    } catch (e) { return iso; }
  }

  /**
   * The planner. Pins come from three places: the visitor's liked articles,
   * places they searched for and added themselves (kept in localStorage), and,
   * when a ?p= link is opened, the sender's stops (kept in memory only until
   * the receiver chooses to add them). Every pin has a checkbox, an optional
   * date and a marker; picking a pin on the map or its name in the list
   * highlights the matching one on the other side. "Plan the order" works out
   * the fastest visiting order separately for each date.
   *
   * mapConfig: { apiKey, containerSelector, wrapSelector, countSelector, countTemplate }
   */
  function renderLikedMap(flat, mapConfig, shared, sharedPlan) {
    var mapEl = document.querySelector(mapConfig.containerSelector);
    if (!mapEl) { return; }
    var wrap = mapConfig.wrapSelector && document.querySelector(mapConfig.wrapSelector);
    var lang = getLang();
    var STR = ROUTE_STR[lang] || ROUTE_STR.en;
    var PS = PLAN_STR[lang] || PLAN_STR.en;
    var persist = !sharedPlan && !shared;

    var pins = [];
    var customSeq = 0;
    var state = persist ? readJSON(PLAN_KEY, { dates: {}, checked: {} }) : { dates: {}, checked: {} };
    if (!state.dates) { state.dates = {}; }
    if (!state.checked) { state.checked = {}; }

    function pinKey(pin) { return pin.kind === 'article' ? 'a:' + pin.articleHash + '.' + pin.locIdx : 'c:' + pin.cid; }
    function saveState() { if (persist) { writeJSON(PLAN_KEY, state); } }
    function saveCustom() {
      if (!persist) { return; }
      writeJSON(CUSTOM_KEY, pins.filter(function (p) { return p.kind === 'custom'; }).map(function (p) {
        return { id: p.cid, name: p.name, address: p.address || '', lat: p.lat, lng: p.lng };
      }));
    }

    function makeArticlePin(pair, loc, locIdx) {
      return {
        id: 'kr-pin-a' + pins.length, kind: 'article',
        name: loc.name, lat: loc.lat, lng: loc.lng,
        articleTitle: pair.item.title,
        articleUrl: hrefForHome(pair.board, pair.item),
        articleHash: shareHash(shareArticleKey(pair.item)),
        locIdx: locIdx,
        affiliateLinks: Array.isArray(loc.affiliateLinks) ? loc.affiliateLinks : []
      };
    }
    function makeCustomPin(name, address, lat, lng, cid) {
      customSeq++;
      var id = cid || ('u' + Date.now().toString(36) + customSeq);
      return { id: 'kr-pin-c' + id, kind: 'custom', cid: id, name: name, address: address || '', lat: lat, lng: lng, affiliateLinks: [] };
    }

    if (shared) {
      shared.stops.forEach(function (st) { pins.push(makeArticlePin(st.pair, st.pair.item.locations[st.locIdx], st.locIdx)); });
    } else if (sharedPlan) {
      sharedPlan.stops.forEach(function (st) {
        var pin = makeCustomPin(st.name, '', st.lat, st.lng);
        pin.articleUrl = st.url || '';
        pin.articleTitle = st.articleTitle || '';
        pin.kind = 'shared';
        pins.push(pin);
      });
    } else {
      flat.forEach(function (pair) {
        (pair.item.locations || []).forEach(function (loc, locIdx) {
          if (typeof loc.lat === 'number' && typeof loc.lng === 'number') { pins.push(makeArticlePin(pair, loc, locIdx)); }
        });
      });
      readJSON(CUSTOM_KEY, []).forEach(function (c) {
        if (c && isFinite(c.lat) && isFinite(c.lng) && c.name) { pins.push(makeCustomPin(String(c.name), c.address, +c.lat, +c.lng, String(c.id))); }
      });
    }

    if (wrap) { wrap.hidden = false; }
    function updateCount() {
      if (mapConfig.countSelector && mapConfig.countTemplate) {
        var countEl = document.querySelector(mapConfig.countSelector);
        if (countEl) { countEl.textContent = fillCountTemplate(mapConfig.countTemplate, pins.length); }
      }
    }
    updateCount();

    loadGoogleMapsSdk(mapConfig.apiKey, function () {
      var BUSAN = { lat: 35.1796, lng: 129.0756 };
      var map = new google.maps.Map(mapEl, { center: pins.length ? { lat: pins[0].lat, lng: pins[0].lng } : BUSAN, zoom: pins.length ? 13 : 11 });
      var openInfoWindow = null;
      var markerById = {};
      var infoById = {};
      var activeId = null;
      var lastOrder = null; // pin id -> label text after a calculation

      function pinById(id) { for (var i = 0; i < pins.length; i++) { if (pins[i].id === id) { return pins[i]; } } return null; }
      function isChecked(id) { var chk = document.getElementById('kr-chk-' + id); return !!(chk && chk.checked); }
      function dateOf(pin) { return state.dates[pinKey(pin)] || ''; }

      function refreshMarkerStyles() {
        pins.forEach(function (pin) {
          var marker = markerById[pin.id];
          if (!marker) { return; }
          var label = lastOrder && lastOrder[pin.id] ? String(lastOrder[pin.id]) : null;
          marker.setOpacity(isChecked(pin.id) || activeId === pin.id ? 1 : 0.45);
          marker.setLabel(label ? { text: label, color: '#fff', fontWeight: '700' } : null);
          marker.setZIndex(activeId === pin.id ? 999 : 1);
        });
      }

      function refreshMapFocus() {
        var selectedPins = pins.filter(function (pin) { return isChecked(pin.id); });
        if (selectedPins.length === 1) {
          map.panTo({ lat: selectedPins[0].lat, lng: selectedPins[0].lng });
        } else if (selectedPins.length > 1) {
          var b = new google.maps.LatLngBounds();
          selectedPins.forEach(function (pin) { b.extend({ lat: pin.lat, lng: pin.lng }); });
          map.fitBounds(b);
        }
      }

      function setActive(id, opts) {
        opts = opts || {};
        activeId = id;
        var all = document.querySelectorAll('#liked-route-checklist li, #liked-route-order li');
        for (var i = 0; i < all.length; i++) {
          var on = all[i].getAttribute('data-pin') === id;
          all[i].classList.toggle('is-active', on);
          if (on && opts.scroll) { all[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        }
        refreshMarkerStyles();
        var marker = markerById[id], info = infoById[id];
        if (openInfoWindow) { openInfoWindow.close(); openInfoWindow = null; }
        if (marker && opts.open !== false) {
          if (info) { info.open(map, marker); openInfoWindow = info; }
          if (opts.pan) { map.panTo(marker.getPosition()); }
        }
      }

      function addMarker(pin) {
        var position = { lat: pin.lat, lng: pin.lng };
        var marker = new google.maps.Marker({ position: position, map: map, title: pin.name, opacity: 0.45 });
        markerById[pin.id] = marker;
        var sub = pin.articleUrl
          ? '<a href="' + escapeHtml(pin.articleUrl) + '" style="color:#d9532a;text-decoration:none;">' + escapeHtml(pin.articleTitle || pin.name) + ' →</a>'
          : '<span style="color:#5a625c;">' + escapeHtml(pin.address || '') + '</span>';
        infoById[pin.id] = new google.maps.InfoWindow({
          content: '<div style="padding:10px 14px;max-width:220px;font-size:13px;line-height:1.5;font-family:inherit;">' +
            '<strong style="display:block;margin-bottom:2px;">' + escapeHtml(pin.name) + '</strong>' + sub + '</div>'
        });
        marker.addListener('click', function () {
          setActive(pin.id, { scroll: true });
        });
      }
      pins.forEach(addMarker);
      if (pins.length > 1) {
        var bounds = new google.maps.LatLngBounds();
        pins.forEach(function (p) { bounds.extend({ lat: p.lat, lng: p.lng }); });
        map.fitBounds(bounds);
      }

      // --- panel markup (the page supplies it) ---
      var panelEl = document.getElementById('liked-route-panel');
      var checklistEl = document.getElementById('liked-route-checklist');
      var calcBtn = document.getElementById('liked-route-calc-btn');
      var statusEl = document.getElementById('liked-route-status');
      var resultEl = document.getElementById('liked-route-result');
      var hintEl = document.getElementById('liked-route-hint');
      var orderEl = document.getElementById('liked-route-order');
      var totalEl = document.getElementById('liked-route-total');
      if (!panelEl || !checklistEl || !calcBtn || !statusEl || !resultEl || !hintEl || !orderEl || !totalEl) { return; }

      ensurePlanStyle();
      ensureShareStyle();
      panelEl.hidden = false;
      document.getElementById('liked-route-title').textContent = STR.title;
      calcBtn.textContent = STR.calcBtn;
      hintEl.textContent = STR.combineNote;

      function say(text, isError) {
        statusEl.textContent = text;
        statusEl.className = 'liked-route-status' + (isError ? ' is-error' : '');
      }

      // --- results: one block per date ---
      var shareState = null; // [{date, pins:[...ordered], legs:[{secs, car}]}]
      var shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'kr-share-btn';
      shareBtn.textContent = STR.shareBtn;
      shareBtn.hidden = true;
      shareBtn.setAttribute('data-goatcounter-click', 'share-route');
      calcBtn.parentNode.insertBefore(shareBtn, statusEl);

      function planUrl(groups) {
        var arr = [];
        groups.forEach(function (g) {
          g.pins.forEach(function (pin, i) {
            var leg = g.legs[i];
            var m = leg ? Math.max(1, Math.round(leg.secs / 60)) : 0;
            var c = leg && leg.car ? 1 : 0;
            var d = isoToCompact(g.date);
            if (pin.kind === 'article') { arr.push(['a', pin.articleHash, pin.locIdx, d, m, c]); }
            else { arr.push(['c', pin.name, +pin.lat.toFixed(5), +pin.lng.toFixed(5), d, m, c]); }
          });
        });
        return location.origin + location.pathname + '?p=' + b64urlEncode(JSON.stringify(arr));
      }
      shareBtn.addEventListener('click', function () {
        if (!shareState) { return; }
        var url = planUrl(shareState);
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (coarse && navigator.share) {
          navigator.share({ title: STR.shareTitle, url: url }).catch(function () {});
          return;
        }
        copyText(url).then(function () {
          say(url.length > 1800 ? PS.linkTooLong : STR.linkCopied, url.length > 1800);
        }).catch(function () { window.prompt('', url); });
      });

      function renderRouteResult(groups, totalSeconds, anyCar) {
        var html = '';
        var showHeads = groups.length > 1 || (groups[0] && groups[0].date);
        var labels = {};
        groups.forEach(function (g) {
          if (showHeads) { html += '<li class="kr-day-head">' + escapeHtml(g.date ? formatPlanDate(lang, g.date) : PS.undated) + '</li>'; }
          g.pins.forEach(function (pin, i) {
            labels[pin.id] = i + 1;
            html += '<li data-pin="' + pin.id + '"><div><div class="kr-leg-name" data-pin="' + pin.id + '">' + escapeHtml(pin.name) + '</div>';
            var buttonsHtml = '';
            if (i < g.pins.length - 1) {
              var leg = g.legs[i] || { secs: 0, car: false };
              var next = g.pins[i + 1];
              if (leg.secs) {
                html += '<div class="kr-leg-transit' + (leg.car ? ' kr-driving' : '') + '">'
                  + (leg.car ? STR.toNextDriving : STR.toNextTransit) + formatRouteDuration(lang, leg.secs) + '</div>';
              }
              buttonsHtml += '<a class="kr-leg-btn' + (leg.car ? ' kr-driving-btn' : '') + '" href="' + routeLegGoogleUrl(pin, next, leg.car) + '" target="_blank" rel="noopener">'
                + (leg.car ? STR.googleDriving : STR.googleTransit) + '</a>';
              buttonsHtml += '<a class="kr-leg-btn kr-naver-btn" href="' + routeLegNaverUrl(pin, next, leg.car) + '" target="_blank" rel="noopener">'
                + (leg.car ? STR.naverDriving : STR.naverTransit) + '</a>';
            }
            (pin.affiliateLinks || []).slice(0, 2).forEach(function (link) {
              if (!link || !link.url) { return; }
              buttonsHtml += '<a class="kr-leg-btn kr-affiliate-btn" href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener">'
                + '🎫 ' + escapeHtml(link.platform || '') + ' <span style="font-weight:400;">' + STR.affiliateTag + '</span></a>';
            });
            if (buttonsHtml) { html += '<div class="kr-leg-buttons">' + buttonsHtml + '</div>'; }
            html += '</div></li>';
          });
        });
        orderEl.innerHTML = html;
        totalEl.textContent = totalSeconds
          ? STR.totalPrefix + formatRouteDuration(lang, totalSeconds) + (anyCar ? STR.totalSomeDriving : STR.totalAllTransit)
          : '';
        resultEl.hidden = false;
        shareState = groups;
        shareBtn.hidden = false;
        lastOrder = labels;
        refreshMarkerStyles();
        if (activeId) { setActive(activeId, { open: false }); }
      }

      orderEl.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('.kr-leg-name') : null;
        if (t) { setActive(t.getAttribute('data-pin'), { pan: true }); }
      });

      // --- checklist with dates ---
      function renderChecklist() {
        checklistEl.innerHTML = pins.map(function (pin) {
          var key = pinKey(pin);
          var isMine = pin.kind === 'custom';
          return '<li data-pin="' + pin.id + '"><input type="checkbox" id="kr-chk-' + pin.id + '"' + (state.checked[key] ? ' checked' : '') + '>'
            + '<label for="kr-chk-' + pin.id + '" data-name="' + pin.id + '">' + escapeHtml(pin.name) + '</label>'
            + (isMine ? '<span class="kr-chip">' + escapeHtml(PS.myPlace) + '</span>' : '')
            + '<input type="date" class="kr-date" data-pin="' + pin.id + '" value="' + escapeHtml(state.dates[key] || '') + '" aria-label="' + escapeHtml(PS.dateLabel) + '">'
            + (isMine ? '<button type="button" class="kr-del" data-del="' + pin.id + '" aria-label="' + escapeHtml(PS.remove) + '" title="' + escapeHtml(PS.remove) + '">×</button>' : '')
            + '</li>';
        }).join('');
        if (activeId) { setActive(activeId, { open: false }); }
      }

      function onPlanChange() {
        var selected = pins.filter(function (pin) { return isChecked(pin.id); });
        calcBtn.disabled = selected.length < 1;
        resultEl.hidden = true;
        shareBtn.hidden = true;
        shareState = null;
        lastOrder = null;
        say('');
        refreshMarkerStyles();
      }

      checklistEl.addEventListener('change', function (e) {
        var t = e.target;
        if (t.type === 'checkbox') {
          var pin = pinById(t.id.replace('kr-chk-', ''));
          if (pin) { state.checked[pinKey(pin)] = t.checked; saveState(); }
          onPlanChange();
          refreshMapFocus();
        } else if (t.classList.contains('kr-date')) {
          var p2 = pinById(t.getAttribute('data-pin'));
          if (p2) {
            if (validIsoDate(t.value)) { state.dates[pinKey(p2)] = t.value; } else { delete state.dates[pinKey(p2)]; }
            saveState();
          }
          onPlanChange();
        }
      });
      checklistEl.addEventListener('click', function (e) {
        var del = e.target.closest ? e.target.closest('.kr-del') : null;
        if (del) {
          var id = del.getAttribute('data-del');
          var pin = pinById(id);
          if (!pin) { return; }
          if (markerById[id]) { markerById[id].setMap(null); delete markerById[id]; delete infoById[id]; }
          pins.splice(pins.indexOf(pin), 1);
          delete state.checked[pinKey(pin)]; delete state.dates[pinKey(pin)];
          saveCustom(); saveState(); updateCount(); renderChecklist(); onPlanChange();
          return;
        }
        var lab = e.target.closest ? e.target.closest('label[data-name]') : null;
        if (lab) { setActive(lab.getAttribute('data-name'), { pan: true }); }
      });

      renderChecklist();
      onPlanChange();
      refreshMarkerStyles();

      // --- add your own places (Places API, Korea only) ---
      var addBox = document.createElement('div');
      addBox.className = 'kr-add-box';
      addBox.innerHTML = '<h3>' + escapeHtml(PS.addTitle) + '</h3>' + (PS.addHint ? '<p class="kr-add-hint">' + escapeHtml(PS.addHint) + '</p>' : '')
        + '<input type="text" class="kr-add-input" autocomplete="off" placeholder="' + escapeHtml(PS.searchPh) + '" aria-label="' + escapeHtml(PS.searchPh) + '">'
        + '<ul class="kr-add-results" hidden></ul>';
      panelEl.insertBefore(addBox, panelEl.firstChild);
      var inputEl = addBox.querySelector('.kr-add-input');
      var resultsEl = addBox.querySelector('.kr-add-results');
      var tipEl = document.createElement('p');
      tipEl.className = 'kr-tip';
      tipEl.innerHTML = escapeHtml(PS.tipActive).replace(/&lt;br&gt;/g, '<br>');
      checklistEl.parentNode.insertBefore(tipEl, checklistEl);

      var placesLib = null, sessionToken = null, searchTimer = null, searchSeq = 0, lastSuggestions = [];
      function getPlaces() {
        if (placesLib) { return Promise.resolve(placesLib); }
        return google.maps.importLibrary('places').then(function (lib) { placesLib = lib; return lib; });
      }
      function showMsg(text) { resultsEl.innerHTML = '<li class="kr-msg">' + escapeHtml(text) + '</li>'; resultsEl.hidden = false; }
      function hideResults() { resultsEl.hidden = true; resultsEl.innerHTML = ''; }

      function runSearch(text) {
        var seq = ++searchSeq;
        showMsg(PS.searching);
        getPlaces().then(function (lib) {
          if (!sessionToken) { sessionToken = new lib.AutocompleteSessionToken(); }
          return lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: text,
            sessionToken: sessionToken,
            includedRegionCodes: ['kr'],
            language: lang,
            locationBias: { center: BUSAN, radius: 50000 }
          });
        }).then(function (resp) {
          if (seq !== searchSeq) { return; }
          lastSuggestions = (resp.suggestions || []).filter(function (s) { return s.placePrediction; });
          if (!lastSuggestions.length) { showMsg(PS.noResults); return; }
          resultsEl.innerHTML = lastSuggestions.map(function (s, i) {
            var pp = s.placePrediction;
            var main = pp.mainText ? pp.mainText.text : pp.text.text;
            var secondary = pp.secondaryText ? pp.secondaryText.text : '';
            return '<li tabindex="0" data-i="' + i + '">' + escapeHtml(main) + (secondary ? '<small>' + escapeHtml(secondary) + '</small>' : '') + '</li>';
          }).join('');
          resultsEl.hidden = false;
        }).catch(function (err) {
          console.error('[krambles] place search failed:', err);
          if (seq === searchSeq) { showMsg(PS.searchFailed); }
        });
      }
      inputEl.addEventListener('input', function () {
        clearTimeout(searchTimer);
        var v = inputEl.value.trim();
        if (v.length < 2) { searchSeq++; hideResults(); return; }
        searchTimer = setTimeout(function () { runSearch(v); }, 280);
      });

      function nearSame(a, b) { return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001; }
      function addPlaceFromSuggestion(sug) {
        var pp = sug.placePrediction;
        var name = pp.mainText ? pp.mainText.text : pp.text.text;
        var secondary = pp.secondaryText ? pp.secondaryText.text : '';
        var place = pp.toPlace();
        place.fetchFields({ fields: ['location', 'formattedAddress'] }).then(function () {
          sessionToken = null;
          var loc = place.location;
          var latlng = { lat: loc.lat(), lng: loc.lng() };
          for (var i = 0; i < pins.length; i++) {
            if (nearSame(pins[i], latlng)) {
              say(PS.already + pins[i].name, false);
              setActive(pins[i].id, { pan: true, scroll: true });
              return;
            }
          }
          if (pins.filter(function (p) { return p.kind === 'custom'; }).length >= MAX_CUSTOM) { say(PS.tooManyPlaces, true); return; }
          var pin = makeCustomPin(name, place.formattedAddress || secondary, latlng.lat, latlng.lng);
          pins.push(pin);
          state.checked[pinKey(pin)] = true;
          saveCustom(); saveState(); updateCount();
          addMarker(pin);
          renderChecklist();
          onPlanChange();
          map.panTo(latlng);
          if (map.getZoom() < 14) { map.setZoom(15); }
          setActive(pin.id, { scroll: true });
          say(PS.added + name, false);
          inputEl.value = '';
          hideResults();
        }).catch(function (err) {
          console.error('[krambles] place details failed:', err);
          say(PS.searchFailed, true);
        });
      }
      function pickResult(li) {
        if (!li || li.getAttribute('data-i') == null) { return; }
        var sug = lastSuggestions[+li.getAttribute('data-i')];
        if (sug) { addPlaceFromSuggestion(sug); }
      }
      resultsEl.addEventListener('click', function (e) { pickResult(e.target.closest ? e.target.closest('li') : null); });
      resultsEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { pickResult(e.target.closest ? e.target.closest('li') : null); }
      });
      document.addEventListener('click', function (e) { if (!addBox.contains(e.target)) { hideResults(); } });

      // --- save / open a plan file ---
      var tools = document.createElement('div');
      tools.className = 'kr-plan-tools';
      tools.innerHTML = '<button type="button" class="kr-tool-btn" data-act="save" data-goatcounter-click="plan-save-file">' + escapeHtml(PS.saveFile) + '</button>'
        + '<button type="button" class="kr-tool-btn" data-act="load" data-goatcounter-click="plan-load-file">' + escapeHtml(PS.loadFile) + '</button>'
        + '<input type="file" accept=".json,application/json" hidden>';
      tools.insertBefore(shareBtn, tools.firstChild);
      shareBtn.className = 'kr-share-btn';
      var toolsNote = document.createElement('p'); toolsNote.className = 'kr-plan-note'; toolsNote.textContent = PS.toolsNote; tools.appendChild(toolsNote);
      calcBtn.parentNode.parentNode.insertBefore(tools, calcBtn.parentNode.nextSibling);
      var fileInput = tools.querySelector('input[type=file]');

      function planForFile() {
        var list;
        if (shareState) {
          list = [];
          shareState.forEach(function (g) { g.pins.forEach(function (pin) { list.push({ pin: pin, date: g.date }); }); });
        } else {
          list = pins.filter(function (pin) { return isChecked(pin.id); }).map(function (pin) { return { pin: pin, date: dateOf(pin) }; });
          list.sort(function (a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : 0; });
        }
        return list.map(function (x) {
          var o = { name: x.pin.name, lat: +x.pin.lat.toFixed(6), lng: +x.pin.lng.toFixed(6), date: x.date || '' };
          if (x.pin.address) { o.address = x.pin.address; }
          if (x.pin.kind === 'article') { o.article = x.pin.articleHash; o.pinIndex = x.pin.locIdx; }
          return o;
        });
      }
      tools.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!btn) { return; }
        if (btn.getAttribute('data-act') === 'load') { fileInput.click(); return; }
        var stops = planForFile();
        if (!stops.length) { say(PS.pickOne, true); return; }
        var payload = JSON.stringify({ app: 'k-rambles', version: 1, saved: new Date().toISOString(), stops: stops }, null, 2);
        var d = new Date();
        var fname = 'k-rambles-plan-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        var file = null;
        try { file = new File([payload], fname, { type: 'application/json' }); } catch (err) { file = null; }
        if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: STR.shareTitle }).then(function () { say(PS.fileSaved, false); }).catch(function () {});
          return;
        }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
        a.download = fname;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        say(PS.fileSaved, false);
      });

      function importStops(stops) {
        var added = 0;
        stops.forEach(function (st) {
          if (!st || !isFinite(st.lat) || !isFinite(st.lng) || !st.name) { return; }
          var latlng = { lat: +st.lat, lng: +st.lng };
          var date = validIsoDate(st.date) ? st.date : '';
          var existing = null;
          for (var i = 0; i < pins.length; i++) {
            if (pins[i].kind !== 'shared' && nearSame(pins[i], latlng)) { existing = pins[i]; break; }
          }
          if (!existing) {
            if (pins.filter(function (p) { return p.kind === 'custom'; }).length >= MAX_CUSTOM) { return; }
            existing = makeCustomPin(String(st.name).slice(0, 80), st.address ? String(st.address).slice(0, 160) : '', latlng.lat, latlng.lng);
            pins.push(existing);
            addMarker(existing);
          }
          state.checked[pinKey(existing)] = true;
          if (date) { state.dates[pinKey(existing)] = date; }
          added++;
        });
        saveCustom(); saveState(); updateCount(); renderChecklist(); onPlanChange(); refreshMapFocus();
        return added;
      }
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!f) { return; }
        var reader = new FileReader();
        reader.onload = function () {
          var data = null;
          try { data = JSON.parse(String(reader.result)); } catch (err) { data = null; }
          if (!data || data.app !== 'k-rambles' || !Array.isArray(data.stops)) { say(PS.fileInvalid, true); return; }
          var n = importStops(data.stops.slice(0, 60));
          say(PS.fileLoaded.replace('{n}', String(n)), false);
        };
        reader.onerror = function () { say(PS.fileInvalid, true); };
        reader.readAsText(f);
      });

      // --- plan the order, separately for each date ---
      function dmCall(service, latlngs, mode) {
        return new Promise(function (resolve) {
          service.getDistanceMatrix({
            origins: latlngs, destinations: latlngs, travelMode: mode, unitSystem: google.maps.UnitSystem.METRIC
          }, function (resp, status) { resolve({ resp: resp, status: status }); });
        });
      }
      function calcGroup(service, gpins) {
        var n = gpins.length;
        if (n === 1) { return Promise.resolve({ pins: gpins, legs: [], total: 0, anyCar: false, missing: 0 }); }
        var latlngs = gpins.map(function (pin) { return { lat: pin.lat, lng: pin.lng }; });
        return dmCall(service, latlngs, google.maps.TravelMode.TRANSIT).then(function (t) {
          if (t.status !== 'OK') { throw new Error(t.status); }
          var m = [], car = [], missing = 0, i, j;
          for (i = 0; i < n; i++) {
            m[i] = []; car[i] = [];
            for (j = 0; j < n; j++) {
              car[i][j] = false;
              if (i === j) { m[i][j] = 0; continue; }
              var el = t.resp.rows[i].elements[j];
              if (el.status === 'OK') { m[i][j] = el.duration.value; } else { m[i][j] = null; missing++; }
            }
          }
          if (!missing) { return { m: m, car: car, missing: 0 }; }
          return dmCall(service, latlngs, google.maps.TravelMode.DRIVING).then(function (d) {
            for (var a = 0; a < n; a++) {
              for (var b = 0; b < n; b++) {
                if (m[a][b] !== null) { continue; }
                var de = d.status === 'OK' ? d.resp.rows[a].elements[b] : null;
                m[a][b] = de && de.status === 'OK' ? de.duration.value * 1.15 : 5400;
                car[a][b] = true;
              }
            }
            return { m: m, car: car, missing: missing };
          });
        }).then(function (x) {
          var r = bestRouteOrder(n, x.m);
          var ordered = r.order.map(function (k) { return gpins[k]; });
          var legs = [], anyCar = false;
          for (var k = 0; k < r.order.length - 1; k++) {
            var a = r.order[k], b = r.order[k + 1];
            legs.push({ secs: x.m[a][b], car: x.car[a][b] });
            if (x.car[a][b]) { anyCar = true; }
          }
          return { pins: ordered, legs: legs, total: r.totalSeconds, anyCar: anyCar, missing: x.missing };
        });
      }

      calcBtn.addEventListener('click', function () {
        var selected = pins.filter(function (pin) { return isChecked(pin.id); });
        if (selected.length < 1) { return; }
        var byDate = {};
        selected.forEach(function (pin) { var d = dateOf(pin); (byDate[d] = byDate[d] || []).push(pin); });
        var dates = Object.keys(byDate).sort(function (a, b) { if (a === b) { return 0; } if (!a) { return 1; } if (!b) { return -1; } return a < b ? -1 : 1; });
        for (var q = 0; q < dates.length; q++) {
          if (byDate[dates[q]].length > MAX_PER_DAY) { say(PS.tooManyDay, true); return; }
        }
        calcBtn.disabled = true;
        shareBtn.hidden = true;
        say(STR.calculating, false);
        var service = new google.maps.DistanceMatrixService();
        var out = [];
        dates.reduce(function (chain, d) {
          return chain.then(function () {
            return calcGroup(service, byDate[d]).then(function (g) { g.date = d; out.push(g); });
          });
        }, Promise.resolve()).then(function () {
          var total = 0, anyCar = false;
          out.forEach(function (g) { total += g.total; if (g.anyCar) { anyCar = true; } });
          renderRouteResult(out, total, anyCar);
          say(anyCar ? STR.someDriving : STR.done, anyCar);
          calcBtn.disabled = false;
        }).catch(function (err) {
          calcBtn.disabled = false;
          say(STR.failed + (err && err.message ? err.message : ''), true);
        });
      });

      // --- a plan someone shared: show their order, offer to keep it ---
      function setupSharedPlan() {
        var groupsMap = {}, order = [];
        sharedPlan.stops.forEach(function (st, i) {
          var pin = pins[i];
          if (!pin) { return; }
          var key = st.date || '';
          if (!groupsMap[key]) { groupsMap[key] = { date: key, pins: [], legs: [] }; order.push(key); }
          var g = groupsMap[key];
          g.pins.push(pin);
          g.legs.push(st.m ? { secs: st.m * 60, car: st.car } : null);
          state.checked[pinKey(pin)] = true;
          if (st.date) { state.dates[pinKey(pin)] = st.date; }
        });
        order.sort(function (a, b) { if (a === b) { return 0; } if (!a) { return 1; } if (!b) { return -1; } return a < b ? -1 : 1; });
        var groups = order.map(function (k) {
          var g = groupsMap[k]; g.legs = g.legs.slice(0, g.pins.length - 1).map(function (l) { return l || { secs: 0, car: false }; }); return g;
        });
        renderChecklist();
        var total = 0, anyCar = false;
        groups.forEach(function (g) { g.legs.forEach(function (l) { total += l.secs; if (l.car) { anyCar = true; } }); });
        renderRouteResult(groups, total, anyCar);
        calcBtn.disabled = false;
        calcBtn.textContent = STR.recalcBtn;
        refreshMapFocus();

        var banner = document.createElement('div');
        banner.className = 'kr-shared-banner';
        banner.innerHTML = '<div class="kr-shared-banner-in"><div><b>' + escapeHtml(PS.sharedPlanTitle) + '</b>'
          + '<span class="kr-shared-meta">' + escapeHtml(STR.sharedMeta.replace('{n}', String(pins.length)).replace('{t}', total ? formatRouteDuration(lang, total) : '–').replace(/\s*·\s*[^·]*$/, '')) + '</span>'
          + '<span class="kr-shared-meta kr-shared-note">' + escapeHtml(PS.sharedPlanNote).replace(/&lt;br&gt;/g, '<br>') + '</span></div>'
          + '<button type="button" class="kr-save-btn" data-goatcounter-click="save-shared-plan">' + escapeHtml(PS.importShared) + '</button></div>';
        wrap.parentNode.insertBefore(banner, wrap);
        var saveBtn = banner.querySelector('.kr-save-btn');
        saveBtn.addEventListener('click', function () {
          var customs = readJSON(CUSTOM_KEY, []);
          var st2 = readJSON(PLAN_KEY, { dates: {}, checked: {} });
          if (!st2.dates) { st2.dates = {}; } if (!st2.checked) { st2.checked = {}; }
          groups.forEach(function (g) {
            g.pins.forEach(function (pin) {
              var dup = null;
              customs.forEach(function (c) { if (nearSame({ lat: +c.lat, lng: +c.lng }, pin)) { dup = c; } });
              if (!dup) {
                if (customs.length >= MAX_CUSTOM) { return; }
                dup = { id: 'u' + Date.now().toString(36) + customs.length, name: pin.name, address: '', lat: pin.lat, lng: pin.lng };
                customs.push(dup);
              }
              st2.checked['c:' + dup.id] = true;
              if (g.date) { st2.dates['c:' + dup.id] = g.date; }
            });
          });
          writeJSON(CUSTOM_KEY, customs); writeJSON(PLAN_KEY, st2);
          saveBtn.textContent = PS.importedShared;
          saveBtn.disabled = true;
          setTimeout(function () { location.href = location.pathname; }, 700);
        });
      }

      // --- the older read-only link (?r=) ---
      function setupSharedView() {
        var n = pins.length;
        pins.forEach(function (pin) { var c = document.getElementById('kr-chk-' + pin.id); if (c) { c.checked = true; } });
        checklistEl.style.display = 'none';
        tipEl.style.display = 'none';
        addBox.style.display = 'none';
        tools.style.display = 'none';
        calcBtn.disabled = false;
        calcBtn.textContent = STR.recalcBtn;
        document.getElementById('liked-route-title').style.display = 'none';
        hintEl.style.display = 'none';
        var headEl = wrap && wrap.querySelector('.liked-map-head');
        var noteEl = wrap && wrap.querySelector('.liked-map-note');
        if (headEl) { headEl.style.display = 'none'; }
        if (noteEl) { noteEl.style.display = 'none'; }

        var legs = [], total = 0;
        for (var k = 0; k < n - 1; k++) {
          var leg = shared.stops[k].leg;
          if (leg) { legs.push({ secs: leg.secs, car: leg.car }); total += leg.secs; } else { legs.push({ secs: 0, car: false }); }
        }
        renderRouteResult([{ date: '', pins: pins, legs: legs }], total, false);
        refreshMapFocus();

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

      if (shared) { setupSharedView(); }
      else if (sharedPlan) { setupSharedPlan(); }
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
        ? '하트 누른 글과 여행 동선은 여기서 확인할 수 있어요.'
        : hintLang === 'vi'
        ? 'Các bài bạn đã thả tim và lộ trình nằm ở đây.'
        : hintLang === 'th'
        ? 'บทความที่กดหัวใจและเส้นทางของคุณอยู่ที่นี่'
        : 'Your hearted pieces and trip routes are here.';

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
