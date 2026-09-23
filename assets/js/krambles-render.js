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

  function isKo() {
    var lang = (document.documentElement.lang || '').toLowerCase();
    if (lang.indexOf('ko') === 0) { return true; }
    if (lang.indexOf('en') === 0) { return false; }
    // Some pages don't set <html lang> at all — fall back to the /ko/ path
    // segment every Korean page lives under.
    return /(^|\/)ko(\/|$)/.test(location.pathname);
  }

  function tileHTML(item, hrefFor, thumbFor) {
    var href = hrefFor(item);
    var thumb = thumbFor(item);
    var alt = item.alt || item.title;
    var badge = item.badge ? '<span class="tile-photo-badge">' + esc(item.badge) + '</span>' : '';
    var ko = isKo();
    var likeLabel = ko ? '이 글 저장하기' : 'Save this piece';
    var likeTitle = ko
      ? '이 기기에만 저장돼요 — 다른 폰·브라우저로 바꾸면 사라져요. 인기 있는 글을 파악하는 데도 도움돼요.'
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
    var ko = isKo();
    var msg = ko
      ? '좋아요 리스트는 이 브라우저에만 보관 돼요. 즉, 브라우저가 바뀌면 좋아요 리스트는 공유가 안돼요. 그리고 좋아요 누른 글은 상단 메뉴에서 다시 볼 수 있어요.'
      : 'Your likes are saved to this browser only — switch browsers and the list won’t carry over. You can find everything you’ve liked again from the menu at the top.';
    var toast = document.createElement('div');
    toast.className = 'kr-like-toast';

    var text = document.createElement('span');
    text.className = 'kr-like-toast-msg';
    text.textContent = msg;

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'kr-like-toast-close';
    closeBtn.setAttribute('aria-label', ko ? '닫기' : 'Close');
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

      var searchItems = items.map(function (it) {
        return { title: it.title, cat: config.boardLabel || it.label || '', url: it.url, kw: it.kw || '' };
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

    if (!likedIds.length) { showEmpty(0); return; }

    var assetBase = config.assetBase || '';
    Promise.all(config.boards.map(function (board) {
      return fetchJSON(board.jsonUrl).then(function (raw) {
        return raw.filter(function (item) { return likedIds.indexOf(item.like_id) !== -1; })
          .map(function (item) { return { item: item, board: board }; });
      }).catch(function () { return []; });
    })).then(function (groups) {
      var flat = [].concat.apply([], groups);
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

      if (config.map) { renderLikedMap(flat, config.map); }
    }).catch(function (err) { console.error('[krambles] liked render failed:', err); });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var _naverSdkCallbacks = null;
  function loadNaverMapsSdk(clientId, callback) {
    if (window.naver && window.naver.maps && window.naver.maps.Map) { callback(); return; }
    if (_naverSdkCallbacks) { _naverSdkCallbacks.push(callback); return; }
    _naverSdkCallbacks = [callback];
    var s = document.createElement('script');
    s.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=' + encodeURIComponent(clientId);
    s.onload = function () {
      var cbs = _naverSdkCallbacks || [];
      _naverSdkCallbacks = null;
      cbs.forEach(function (cb) { cb(); });
    };
    s.onerror = function () {
      console.error('[krambles] Naver Maps SDK failed to load');
      _naverSdkCallbacks = null;
    };
    document.head.appendChild(s);
  }

  /**
   * Draws every pin belonging to the current liked list onto a single Naver
   * map. A liked article can carry more than one location (e.g. a piece
   * covering several restaurants); every one of them gets its own marker.
   * Articles with an empty/absent `locations` array (how-to/info content)
   * simply contribute no pins. If nothing on the liked list has a location,
   * the whole map block hides itself rather than showing an empty map.
   * mapConfig: { clientId, containerSelector, wrapSelector, countSelector, countTemplate }
   */
  function renderLikedMap(flat, mapConfig) {
    var mapEl = document.querySelector(mapConfig.containerSelector);
    if (!mapEl) { return; }
    var wrap = mapConfig.wrapSelector && document.querySelector(mapConfig.wrapSelector);

    var pins = [];
    flat.forEach(function (pair) {
      var locs = pair.item.locations || [];
      var articleUrl = hrefForHome(pair.board, pair.item);
      locs.forEach(function (loc) {
        if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
          pins.push({
            name: loc.name,
            lat: loc.lat,
            lng: loc.lng,
            articleTitle: pair.item.title,
            articleUrl: articleUrl
          });
        }
      });
    });

    if (mapConfig.countSelector && mapConfig.countTemplate) {
      var countEl = document.querySelector(mapConfig.countSelector);
      if (countEl) { countEl.textContent = fillCountTemplate(mapConfig.countTemplate, pins.length); }
    }

    if (!pins.length) {
      if (wrap) { wrap.hidden = true; }
      return;
    }
    if (wrap) { wrap.hidden = false; }

    loadNaverMapsSdk(mapConfig.clientId, function () {
      var center = new naver.maps.LatLng(pins[0].lat, pins[0].lng);
      var map = new naver.maps.Map(mapEl, { center: center, zoom: 13 });
      var bounds = new naver.maps.LatLngBounds(center, center);
      var openInfoWindow = null;

      pins.forEach(function (pin) {
        var position = new naver.maps.LatLng(pin.lat, pin.lng);
        bounds.extend(position);
        var marker = new naver.maps.Marker({ position: position, map: map, title: pin.name });
        var infoWindow = new naver.maps.InfoWindow({
          content: '<div style="padding:10px 14px;max-width:220px;font-size:13px;line-height:1.5;font-family:inherit;">' +
            '<strong style="display:block;margin-bottom:2px;">' + escapeHtml(pin.name) + '</strong>' +
            '<a href="' + escapeHtml(pin.articleUrl) + '" style="color:#d9532a;text-decoration:none;">' + escapeHtml(pin.articleTitle) + ' →</a>' +
            '</div>'
        });
        naver.maps.Event.addListener(marker, 'click', function () {
          if (openInfoWindow) { openInfoWindow.close(); }
          infoWindow.open(map, marker);
          openInfoWindow = infoWindow;
        });
      });

      if (pins.length > 1) { map.fitBounds(bounds); }
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

        items.forEach(function (it) {
          searchItems.push({
            title: it.title,
            cat: board.label,
            url: hrefForHome(board, it),
            kw: it.kw || ''
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
        var email = a.getAttribute('href').replace(/^mailto:/, '').split('?')[0];
        if (!email) { return; }
        if (!navigator.clipboard || !navigator.clipboard.writeText) { return; }
        navigator.clipboard.writeText(email).then(function () {
          showMailtoToast(email);
        }).catch(function () {});
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
    var isKo = document.documentElement.lang === 'ko' || location.pathname.indexOf('/ko/') !== -1;
    toast.textContent = (isKo ? '복사됨: ' : 'Copied: ') + email;
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

      var isKo = document.documentElement.lang === 'ko' ||
                 location.pathname.indexOf('/ko/') !== -1;
      var msg = isKo
        ? '좋아요 한 글은 여기서, 경비 정산은 여기서 할 수 있어요.'
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
      closeBtn.setAttribute('aria-label', isKo ? '닫기' : 'Close');
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
