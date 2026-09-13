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

  function tileHTML(item, hrefFor, thumbFor) {
    var href = hrefFor(item);
    var thumb = thumbFor(item);
    var alt = item.alt || item.title;
    var badge = item.badge ? '<span class="tile-photo-badge">' + esc(item.badge) + '</span>' : '';
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
        '<button class="tile-like-btn" data-like-id="' + esc(item.like_id) + '" aria-label="Like this piece" aria-pressed="false"><svg><use href="#i-heart"/></svg></button>' +
      '</div>'
    );
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
      if (idx === -1) { current.push(id); btn.classList.add('is-liked'); btn.setAttribute('aria-pressed', 'true'); }
      else { current.splice(idx, 1); btn.classList.remove('is-liked'); btn.setAttribute('aria-pressed', 'false'); }
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

  global.KR = { renderHub: renderHub, renderHome: renderHome };
})(window);
