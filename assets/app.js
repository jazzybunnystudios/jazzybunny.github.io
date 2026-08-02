/* Galerie – lädt die von Decap CMS gepflegten JSON-Dateien und rendert die Seite.
   Kein Build-Schritt, keine Abhängigkeiten. */
(function () {
  'use strict';

  // Basis-Pfad der Seite: "/" bei user.github.io, "/repo-name/" bei Projekt-Repos.
  var BASE = new URL('.', document.baseURI).pathname;

  /** Bildpfade aus dem CMS ("/images/uploads/x.jpg") auf den Seiten-Basispfad umbiegen. */
  function mediaUrl(p) {
    if (!p) return '';
    if (/^(https?:)?\/\//.test(p) || p.indexOf('data:') === 0) return p;
    return BASE + String(p).replace(/^\/+/, '');
  }

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function show(node, visible) { if (node) node.hidden = !visible; }

  /* ---------- Theme ---------- */
  var savedTheme = null;
  try { savedTheme = localStorage.getItem('theme'); } catch (e) { /* private mode */ }
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  $('#theme-toggle').addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme');
    if (!current) {
      current = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* ignorieren */ }
  });

  $('#year').textContent = String(new Date().getFullYear());

  /* ---------- Daten laden ---------- */
  function loadJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' -> HTTP ' + r.status);
      return r.json();
    });
  }

  // Erst die Einstellungen – daraus ergibt sich, ob die Galerie überhaupt
  // geladen wird oder die Wartungsansicht kommt.
  loadJSON('content/settings.json')
    .catch(function (err) {
      console.warn('Einstellungen nicht geladen:', err);
      return {};
    })
    .then(function (s) {
      s = s || {};
      applySettings(s);
      document.body.classList.remove('booting');

      if (s.maintenance) {
        showMaintenance(s);
        return;
      }
      loadGallery();
    });

  function loadGallery() {
    loadJSON('content/gallery.json').then(function (data) {
      show($('#state-loading'), false);
      var items = (data && Array.isArray(data.items) ? data.items : []).filter(function (it) {
        return it && it.image;
      });
      if (!items.length) { show($('#state-empty'), true); return; }
      initGallery(items);
    }).catch(function (err) {
      console.error(err);
      show($('#state-loading'), false);
      show($('#state-error'), true);
    });
  }

  /* ---------- Wartungsansicht ---------- */
  function showMaintenance(s) {
    document.body.classList.add('maintenance-on');

    var heading = s.maintenance_title || 'Wir sind derzeit nicht erreichbar';
    document.title = (s.title ? s.title + ' – ' : '') + heading;
    $('#maintenance-title').textContent = heading;
    $('#maintenance-text').textContent = s.maintenance_text || '';

    var logo = $('#maintenance-logo');
    if (s.logo) {
      logo.src = mediaUrl(s.logo);
      logo.alt = s.title || 'Logo';
    }
    if (s.logo === '') show(logo, false);

    // Erreichbar bleiben, auch wenn die Galerie zu ist.
    buildContactLinks($('#maintenance-contact'), s, false);

    show($('#maintenance'), true);
  }

  /* ---------- Einstellungen anwenden ---------- */
  function applySettings(s) {
    s = s || {};

    if (s.title) {
      document.title = s.title;
      Array.prototype.forEach.call(document.querySelectorAll('[data-site="title"]'), function (n) {
        n.textContent = s.title;
      });
    }
    if (s.tagline) $('[data-site="tagline"]').textContent = s.tagline;
    if (s.about) $('[data-site="about"]').textContent = s.about;

    // Logo: im CMS austauschbar. Ohne Logo rückt die Überschrift wieder ins Bild.
    var heroLogo = $('#hero-logo');
    if (s.logo) {
      heroLogo.src = mediaUrl(s.logo);
      heroLogo.alt = s.title || 'Logo';
    }
    if (s.logo === '') {
      show(heroLogo, false);
      $('#hero-title').classList.remove('visually-hidden');
    }

    var mark = $('#brand-mark');
    if (s.logo_mark) mark.src = mediaUrl(s.logo_mark);
    if (s.logo_mark === '') show(mark, false);

    buildContactLinks($('#contact-links'), s, true);

    if (s.imprint && String(s.imprint).trim()) {
      $('#imprint-content').innerHTML = miniMarkdown(String(s.imprint));
      show($('#imprint-open'), true);
    }
  }

  /** Baut die Kontakt-Buttons. withHint blendet bei leeren Daten einen Hinweis ein. */
  function buildContactLinks(container, s, withHint) {
    container.textContent = '';

    if (s.email) {
      var a = el('a');
      a.href = 'mailto:' + s.email;
      a.textContent = s.email;
      container.appendChild(a);
    }
    if (s.instagram) {
      var handle = String(s.instagram).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
      var ig = el('a');
      ig.href = 'https://instagram.com/' + handle;
      ig.rel = 'noopener';
      ig.target = '_blank';
      ig.textContent = '@' + handle;
      container.appendChild(ig);
    }
    if (s.phone) {
      var tel = el('a');
      tel.href = 'tel:' + String(s.phone).replace(/[^\d+]/g, '');
      tel.textContent = s.phone;
      container.appendChild(tel);
    }
    if (!container.children.length && withHint) {
      var hint = el('p');
      hint.textContent = 'Kontaktdaten können im Admin-Bereich hinterlegt werden.';
      container.appendChild(hint);
    }
  }

  /** Sehr kleiner Markdown-Renderer für das Impressum (Absätze, Zeilenumbrüche, Fett, Links). */
  function miniMarkdown(src) {
    var escaped = src
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.split(/\n{2,}/).map(function (block) {
      var html = block
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
        .replace(/\n/g, '<br>');
      return '<p>' + html + '</p>';
    }).join('');
  }

  /* ---------- Galerie ---------- */
  var allItems = [];
  var visibleItems = [];

  function imagesOf(item) {
    var list = [item.image];
    if (Array.isArray(item.gallery)) {
      item.gallery.forEach(function (g) {
        var src = typeof g === 'string' ? g : (g && g.image);
        if (src) list.push(src);
      });
    }
    return list;
  }

  function initGallery(items) {
    allItems = items;
    buildFilters();
    render(allItems);
  }

  function buildFilters() {
    var cats = [];
    allItems.forEach(function (it) {
      var c = (it.category || '').trim();
      if (c && cats.indexOf(c) === -1) cats.push(c);
    });
    if (cats.length < 2) return;

    var bar = $('#filters');
    cats.sort(function (a, b) { return a.localeCompare(b, 'de'); });
    ['Alle'].concat(cats).forEach(function (label, i) {
      var b = el('button', 'chip');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(bar.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        render(i === 0 ? allItems : allItems.filter(function (it) {
          return (it.category || '').trim() === label;
        }));
      });
      bar.appendChild(b);
    });
    show(bar, true);
  }

  function render(items) {
    visibleItems = items;
    var grid = $('#grid');
    grid.textContent = '';

    items.forEach(function (item, index) {
      var card = el('button', 'card');
      card.type = 'button';

      var media = el('div', 'card-media');
      var img = el('img');
      img.src = mediaUrl(item.image);
      img.alt = item.title || 'Objekt';
      img.loading = 'lazy';
      img.decoding = 'async';
      media.appendChild(img);

      if (isHidden(item)) {
        media.classList.add('is-nsfw');
        var veil = el('span', 'nsfw-overlay');
        veil.appendChild(document.createTextNode('NSFW'));
        var sub = el('small');
        sub.textContent = 'Zum Anzeigen klicken';
        veil.appendChild(sub);
        media.appendChild(veil);
      }

      var count = imagesOf(item).length;
      if (count > 1) {
        var badge = el('span', 'card-count');
        badge.textContent = count + ' Bilder';
        media.appendChild(badge);
      }
      card.appendChild(media);

      var body = el('div', 'card-body');
      var h3 = el('h3');
      h3.textContent = item.title || 'Ohne Titel';
      if (item.nsfw) h3.appendChild(nsfwTag());
      body.appendChild(h3);

      if (item.description) {
        var p = el('p');
        p.textContent = item.description;
        body.appendChild(p);
      }

      var tags = el('div', 'card-tags');
      [item.category, item.material].forEach(function (t) {
        if (!t) return;
        var s = el('span', 'tag');
        s.textContent = t;
        tags.appendChild(s);
      });
      if (tags.children.length) body.appendChild(tags);

      card.appendChild(body);

      // Bei NSFW macht der erste Klick nur scharf – erst der zweite öffnet die
      // Großansicht. So landet nichts versehentlich formatfüllend am Schirm.
      card.addEventListener('click', function () {
        if (isHidden(item)) {
          revealed.add(item);
          media.classList.remove('is-nsfw');
          var v = media.querySelector('.nsfw-overlay');
          if (v) v.remove();
          return;
        }
        openLightbox(index, 0);
      });

      grid.appendChild(card);
    });
  }

  /* ---------- NSFW ---------- */
  var revealed = new Set();

  /** true, solange ein als NSFW markiertes Objekt noch verdeckt ist. */
  function isHidden(item) {
    return !!item.nsfw && !revealed.has(item);
  }

  function nsfwTag() {
    var t = el('span', 'tag-nsfw');
    t.textContent = 'NSFW';
    return t;
  }

  /* ---------- Lightbox ---------- */
  var lb = $('#lightbox');
  var lbIndex = 0;
  var imgIndex = 0;
  var lastFocused = null;

  function openLightbox(itemIdx, imageIdx) {
    lastFocused = document.activeElement;
    lbIndex = itemIdx;
    imgIndex = imageIdx || 0;
    show(lb, true);
    document.body.style.overflow = 'hidden';
    updateLightbox();
    lb.querySelector('.lb-close').focus();
  }

  function closeLightbox() {
    show(lb, false);
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function updateLightbox() {
    var item = visibleItems[lbIndex];
    if (!item) return;
    var imgs = imagesOf(item);
    if (imgIndex >= imgs.length) imgIndex = 0;
    if (imgIndex < 0) imgIndex = imgs.length - 1;

    var img = $('#lb-img');
    img.src = mediaUrl(imgs[imgIndex]);
    img.alt = item.title || 'Objekt';

    // Beim Blättern kann man auf einem noch verdeckten Objekt landen.
    lb.classList.toggle('nsfw-hidden', isHidden(item));

    $('#lb-title').textContent = item.title || 'Ohne Titel';
    if (item.nsfw) $('#lb-title').appendChild(nsfwTag());
    $('#lb-meta').textContent = [item.category, item.material].filter(Boolean).join(' · ');
    $('#lb-desc').textContent = item.description || '';

    var thumbs = $('#lb-thumbs');
    thumbs.textContent = '';
    if (imgs.length > 1) {
      imgs.forEach(function (src, i) {
        var b = el('button');
        b.type = 'button';
        b.setAttribute('aria-current', i === imgIndex ? 'true' : 'false');
        b.setAttribute('aria-label', 'Bild ' + (i + 1));
        var t = el('img');
        t.src = mediaUrl(src);
        t.alt = '';
        t.loading = 'lazy';
        b.appendChild(t);
        b.addEventListener('click', function () { imgIndex = i; updateLightbox(); });
        thumbs.appendChild(b);
      });
    }

    // Pfeile nur zeigen, wenn es überhaupt etwas zu blättern gibt.
    var multi = visibleItems.length > 1 || imgs.length > 1;
    show(lb.querySelector('.lb-prev'), multi);
    show(lb.querySelector('.lb-next'), multi);
  }

  /** Blättert innerhalb der Bilder eines Objekts und danach zum nächsten Objekt. */
  function step(dir) {
    var imgs = imagesOf(visibleItems[lbIndex]);
    var next = imgIndex + dir;
    if (next >= 0 && next < imgs.length) {
      imgIndex = next;
    } else {
      lbIndex = (lbIndex + dir + visibleItems.length) % visibleItems.length;
      imgIndex = dir > 0 ? 0 : imagesOf(visibleItems[lbIndex]).length - 1;
    }
    updateLightbox();
  }

  lb.querySelector('.lb-reveal').addEventListener('click', function () {
    var item = visibleItems[lbIndex];
    if (item) revealed.add(item);
    lb.classList.remove('nsfw-hidden');
    render(visibleItems); // Kachel im Hintergrund gleich mit aufdecken
  });

  lb.querySelector('.lb-close').addEventListener('click', closeLightbox);
  lb.querySelector('.lb-prev').addEventListener('click', function () { step(-1); });
  lb.querySelector('.lb-next').addEventListener('click', function () { step(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });

  document.addEventListener('keydown', function (e) {
    if (!lb.hidden) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      return;
    }
    if (!imprint.hidden && e.key === 'Escape') closeImprint();
  });

  // Wischen auf Touch-Geräten
  var touchX = null;
  lb.addEventListener('touchstart', function (e) { touchX = e.changedTouches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });

  /* ---------- Impressum ---------- */
  var imprint = $('#imprint');
  function closeImprint() { show(imprint, false); document.body.style.overflow = ''; }

  $('#imprint-open').addEventListener('click', function () {
    show(imprint, true);
    document.body.style.overflow = 'hidden';
  });
  imprint.querySelector('.lb-close').addEventListener('click', closeImprint);
  imprint.addEventListener('click', function (e) { if (e.target === imprint) closeImprint(); });
})();
