/* JazzyBunny Studios – liest die vom CMS gepflegten JSON-Dateien und baut daraus
   die Seite. Kein Build-Schritt, keine Abhängigkeiten, alles im Browser. */
(function () {
  'use strict';

  /* ================= Hilfsmittel ================= */

  // Basis-Pfad der Seite: "/" bei eigener Domain, "/repo/" bei Projekt-Repos.
  var BASE = new URL('.', document.baseURI).pathname;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function show(node, visible) { if (node) node.hidden = !visible; }
  function txt(node, value) { if (node) node.textContent = value == null ? '' : String(value); }

  /** Bildpfade aus dem CMS auf den Seiten-Basispfad umbiegen. */
  function mediaUrl(p) {
    if (!p) return '';
    if (/^(https?:)?\/\//.test(p) || p.indexOf('data:') === 0) return p;
    return BASE + String(p).replace(/^\/+/, '');
  }

  function loadJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' -> HTTP ' + r.status);
      return r.json();
    });
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { /* privater Modus – kein Problem */ }
    return null;
  }

  /** Kleiner Markdown-Ersatz für Impressum und Datenschutz. */
  function miniMarkdown(src) {
    var escaped = String(src).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.split(/\n{2,}/).map(function (block) {
      return '<p>' + block
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
        .replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  /* ================= Design-Umschalter ================= */

  var savedTheme = store('theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  $('#theme-toggle').addEventListener('click', function () {
    var next = activeTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store('theme', next);

    // Discord rendert sein Widget serverseitig – neu laden, sonst bleibt es
    // im alten Design stehen.
    var frame = $('#discord-frame');
    if (frame) frame.src = discordSrc();
  });

  txt($('#year'), new Date().getFullYear());

  /* ================= Start ================= */

  var settings = {};
  var home = {};

  Promise.all([
    loadJSON('content/settings.json').catch(function (e) { console.warn('Einstellungen:', e); return {}; }),
    loadJSON('content/home.json').catch(function () { return {}; })
  ]).then(function (res) {
    settings = res[0] || {};
    home = res[1] || {};

    applySettings(settings);
    document.body.classList.remove('booting');

    if (settings.maintenance) { showMaintenance(settings); return; }

    applyHome(home, settings);
    loadGallery();
  });

  /* ================= Einstellungen ================= */

  function applySettings(s) {
    if (s.accent) document.documentElement.style.setProperty('--accent', s.accent);

    if (s.title) {
      document.title = s.title;
      Array.prototype.forEach.call(document.querySelectorAll('[data-site="title"]'), function (n) {
        n.textContent = s.title;
      });
    }
    // Eine einzige Wortmarke für Kopfzeile, Fußzeile und Wartungsansicht.
    setImage($('#brand-logo'), s.logo, s.title || 'Logo');
    setImage($('#footer-logo'), s.logo, '');
    setImage($('#maintenance-logo'), s.logo, s.title || 'Logo');

    if (s.logo === '') {
      // Ohne Logo tritt der Seitenname als Text an seine Stelle.
      [$('#brand-logo'), $('#footer-logo'), $('#maintenance-logo')].forEach(function (n) {
        show(n, false);
      });
      var name = el('strong', 'brand-fallback');
      name.textContent = s.title || 'Startseite';
      $('.brand').appendChild(name);
    }

    txt($('#footer-about'), s.about || '');
    txt($('#footer-note'), s.footer_note || '');

    buildContactLinks($('#contact-links'), s, true, 'button');
    buildContactLinks($('#footer-contact'), s, false, 'plain');

    buildAnnounce(s);
    buildDiscord(s);
    buildLegal('imprint', s.imprint, 'Impressum');
    buildLegal('privacy', s.privacy, 'Datenschutz');
  }

  /* ---------- Discord-Widget ---------- */
  var discordId = null;

  /** Holt die Server-ID aus Einbettungscode, Widget-Adresse oder purer Zahl. */
  function discordServerId(value) {
    var m = String(value || '').match(/(?:\bid=)?(\d{15,25})/);
    return m ? m[1] : null;
  }

  function buildDiscord(s) {
    var raw = String(s.discord || '').trim();
    if (!raw) return;

    discordId = discordServerId(raw);

    // Einladungslinks enthalten keine Server-ID. Statt nichts anzuzeigen,
    // gibt es dann wenigstens einen Knopf zum Server.
    if (!discordId) {
      var url = (raw.match(/https?:\/\/\S+/) || [])[0];
      if (!url) {
        console.warn('Discord: weder Server-ID noch Adresse erkannt.');
        return;
      }
      var box = $('#discord-box');
      box.textContent = '';
      var a = el('a', 'btn btn-ghost');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Discord beitreten';
      box.appendChild(a);
      show(box, true);
      return;
    }

    show($('#discord-box'), true);
    $('#discord-load').addEventListener('click', loadDiscord);

    // Wer schon zugestimmt hat, bekommt es beim Blättern direkt zu sehen.
    if (store('discord') === 'ja') loadDiscord();
  }

  function loadDiscord() {
    store('discord', 'ja');
    var frame = el('iframe', 'discord-frame');
    frame.id = 'discord-frame';
    frame.title = 'Discord-Server';
    frame.src = discordSrc();
    frame.setAttribute('allowtransparency', 'true');
    frame.setAttribute('frameborder', '0');
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute('sandbox',
      'allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts');

    var box = $('#discord-box');
    box.textContent = '';
    box.appendChild(frame);
  }

  function discordSrc() {
    return 'https://discord.com/widget?id=' + discordId + '&theme=' + activeTheme();
  }

  function activeTheme() {
    var set = document.documentElement.getAttribute('data-theme');
    if (set) return set;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setImage(node, path, alt) {
    if (!node || !path) return;
    node.src = mediaUrl(path);
    if (alt != null) node.alt = alt;
  }

  /* ---------- Ankündigungsleiste ---------- */
  function buildAnnounce(s) {
    if (!s.announce_on || !String(s.announce_text || '').trim()) return;

    // Einmal weggeklickt bleibt sie weg, bis der Text sich ändert.
    var key = 'announce:' + s.announce_text;
    if (store(key) === 'zu') return;

    var link = $('#announce-link');
    txt(link, s.announce_text);
    if (s.announce_link) {
      link.href = s.announce_link;
      if (/^https?:/.test(s.announce_link)) { link.target = '_blank'; link.rel = 'noopener'; }
    } else {
      link.removeAttribute('href');
    }

    show($('#announce'), true);
    $('#announce-close').addEventListener('click', function () {
      show($('#announce'), false);
      store(key, 'zu');
    });
  }

  /* ---------- Kontaktlinks ---------- */
  function buildContactLinks(container, s, withHint, style) {
    if (!container) return;
    container.textContent = '';

    var entries = [];
    if (s.email) entries.push({ href: 'mailto:' + s.email, label: style === 'plain' ? 'E-Mail' : s.email });
    if (s.instagram) entries.push({ href: social('instagram.com', s.instagram), label: 'Instagram', ext: true });
    if (s.tiktok) entries.push({ href: social('tiktok.com/@', s.tiktok, true), label: 'TikTok', ext: true });
    if (s.youtube) entries.push({ href: social('youtube.com/@', s.youtube, true), label: 'YouTube', ext: true });
    if (s.etsy) entries.push({ href: social('etsy.com/shop/', s.etsy, true), label: 'Etsy', ext: true });
    if (s.phone) entries.push({ href: 'tel:' + String(s.phone).replace(/[^\d+]/g, ''), label: s.phone });

    entries.forEach(function (e) {
      var a = el('a');
      a.href = e.href;
      a.textContent = e.label;
      if (e.ext) { a.target = '_blank'; a.rel = 'noopener'; }
      container.appendChild(a);
    });

    if (!container.children.length && withHint) {
      var hint = el('p');
      hint.textContent = 'Kontaktdaten können im Admin-Bereich hinterlegt werden.';
      container.appendChild(hint);
    }
  }

  /** Nimmt Benutzername oder volle URL entgegen und macht daraus eine Adresse. */
  function social(domain, value, atPrefixed) {
    var v = String(value).trim();
    if (/^https?:\/\//.test(v)) return v;
    v = v.replace(/^@/, '').replace(/\/$/, '');
    return 'https://' + (atPrefixed ? domain + v : domain + '/' + v);
  }

  /* ---------- Impressum und Datenschutz ---------- */
  var legalTexts = {};

  function buildLegal(kind, text, title) {
    if (!text || !String(text).trim()) return;
    legalTexts[kind] = { title: title, html: miniMarkdown(text) };
    var btn = $('#' + kind + '-open');
    show(btn, true);
    btn.addEventListener('click', function () { openLegal(kind); });
  }

  function openLegal(kind) {
    var entry = legalTexts[kind];
    if (!entry) return;
    txt($('#legal-title'), entry.title);
    $('#legal-content').innerHTML = entry.html;
    show($('#legal'), true);
    document.body.style.overflow = 'hidden';
  }

  function closeLegal() { show($('#legal'), false); document.body.style.overflow = ''; }

  $('#legal').querySelector('.lb-close').addEventListener('click', closeLegal);
  $('#legal').addEventListener('click', function (e) { if (e.target === $('#legal')) closeLegal(); });

  /* ================= Wartungsansicht ================= */

  function showMaintenance(s) {
    document.body.classList.add('maintenance-on');
    var heading = s.maintenance_title || 'Wir sind derzeit nicht erreichbar';
    document.title = (s.title ? s.title + ' – ' : '') + heading;
    txt($('#maintenance-title'), heading);
    txt($('#maintenance-text'), s.maintenance_text || '');
    if (s.logo === '') show($('#maintenance-logo'), false);
    buildContactLinks($('#maintenance-contact'), s, false, 'button');
    show($('#maintenance'), true);
  }

  /* ================= Startseite ================= */

  function applyHome(h, s) {
    // Bühne
    if (h.hero_image) {
      var bg = $('#hero-bg');
      bg.style.backgroundImage = 'url("' + mediaUrl(h.hero_image) + '")';
      show(bg, true);
      document.body.classList.add('has-hero-bg');
    }
    // Überschrift in der Zierschrift, Untertitel als kleine Zeile darüber.
    if (h.hero_title) txt($('#hero-title'), h.hero_title);
    txt($('#hero-kicker'), s.tagline || '');
    txt($('#hero-sub'), h.hero_subtitle || s.about || '');

    var cta = $('#hero-cta');
    if (h.hero_cta_text) txt(cta, h.hero_cta_text);
    if (h.hero_cta_link) cta.href = h.hero_cta_link;

    // Abschnittstitel
    if (h.cat_title) txt($('#cat-title'), h.cat_title);
    if (h.featured_title) txt($('#featured-title'), h.featured_title);
    if (h.catalog_title) txt($('#catalog-title'), h.catalog_title);
    if (h.faq_title) txt($('#faq-title'), h.faq_title);
    if (h.contact_title) txt($('#contact-title'), h.contact_title);
    if (h.contact_text) txt($('#contact-lead'), h.contact_text);

    renderStats(h.stats);
    renderFaq(h.faq);
  }

  function renderStats(stats) {
    if (!Array.isArray(stats) || !stats.length) return;
    var box = $('#strip-inner');
    stats.forEach(function (s) {
      if (!s || (!s.value && !s.label)) return;
      var item = el('div', 'strip-item');
      var b = el('b'); b.textContent = s.value || '';
      var sp = el('span'); sp.textContent = s.label || '';
      item.appendChild(b); item.appendChild(sp);
      box.appendChild(item);
    });
    if (box.children.length) show($('#strip'), true);
  }

  function renderFaq(faq) {
    if (!Array.isArray(faq) || !faq.length) return;
    var list = $('#faq-list');
    faq.forEach(function (f) {
      if (!f || !f.question) return;
      var d = el('details', 'faq-item');
      var sum = el('summary');
      sum.textContent = f.question;
      var ans = el('div', 'faq-answer');
      ans.textContent = f.answer || '';
      d.appendChild(sum); d.appendChild(ans);
      list.appendChild(d);
    });
    if (list.children.length) {
      show($('#faq'), true);
      Array.prototype.forEach.call(document.querySelectorAll('[data-nav="faq"]'), function (n) { n.hidden = false; });
    }
  }

  /* ================= Galerie ================= */

  var allItems = [];
  var visibleItems = [];
  var activeCategory = 'Alle';
  var searchTerm = '';
  var sortMode = 'default';

  function loadGallery() {
    loadJSON('content/gallery.json').then(function (data) {
      show($('#state-loading'), false);
      allItems = (data && Array.isArray(data.items) ? data.items : []).filter(function (it) {
        return it && it.image;
      });
      if (!allItems.length) { show($('#state-empty'), true); return; }

      buildFilters();
      renderCategories();
      renderFeatured();
      applyView();
    }).catch(function (err) {
      console.error(err);
      show($('#state-loading'), false);
      show($('#state-error'), true);
    });
  }

  function categoriesOf() {
    var seen = [];
    allItems.forEach(function (it) {
      var c = (it.category || '').trim();
      if (c && seen.indexOf(c) === -1) seen.push(c);
    });
    return seen.sort(function (a, b) { return a.localeCompare(b, 'de'); });
  }

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

  /* ---------- Filterleiste ---------- */
  function buildFilters() {
    var cats = categoriesOf();
    if (cats.length < 2) return;

    var bar = $('#filters');
    ['Alle'].concat(cats).forEach(function (label) {
      var b = el('button', 'chip');
      b.type = 'button';
      b.textContent = label;
      b.dataset.cat = label;
      b.setAttribute('aria-pressed', label === 'Alle' ? 'true' : 'false');
      b.addEventListener('click', function () { setCategory(label); });
      bar.appendChild(b);
    });
    show(bar, true);
  }

  function setCategory(label) {
    activeCategory = label;
    Array.prototype.forEach.call($('#filters').children, function (c) {
      c.setAttribute('aria-pressed', c.dataset.cat === label ? 'true' : 'false');
    });
    applyView();
  }

  /* ---------- Kategorie-Kacheln ---------- */
  function renderCategories() {
    var cats = categoriesOf();
    if (cats.length < 2) return;

    var box = $('#cat-grid');
    cats.forEach(function (cat) {
      var members = allItems.filter(function (it) { return (it.category || '').trim() === cat; });
      var cover = members[0];

      var tile = el('button', 'cat-tile');
      tile.type = 'button';

      var img = el('img');
      img.src = mediaUrl(cover.image);
      img.alt = '';
      img.loading = 'lazy';
      tile.appendChild(img);

      // Verdeckte Objekte sollen auch als Kachelbild nicht offen liegen.
      if (members.every(function (m) { return m.nsfw; })) tile.classList.add('is-blurred');

      var label = el('span', 'cat-label');
      label.appendChild(document.createTextNode(cat));
      var count = el('span', 'cat-count');
      count.textContent = members.length + (members.length === 1 ? ' Objekt' : ' Objekte');
      label.appendChild(count);
      tile.appendChild(label);

      tile.addEventListener('click', function () {
        setCategory(cat);
        var target = document.getElementById('katalog');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });

      box.appendChild(tile);
    });

    show($('#kategorien'), true);
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav="kategorien"]'), function (n) { n.hidden = false; });
  }

  /* ---------- Highlights ---------- */
  function renderFeatured() {
    var picks = allItems.filter(function (it) { return it.featured; });
    if (!picks.length) return;
    fillGrid($('#featured-grid'), picks);
    show($('#highlights'), true);
  }

  /* ---------- Suche, Filter, Sortierung ---------- */
  function applyView() {
    var list = allItems.slice();

    if (activeCategory !== 'Alle') {
      list = list.filter(function (it) { return (it.category || '').trim() === activeCategory; });
    }

    if (searchTerm) {
      var q = searchTerm.toLowerCase();
      list = list.filter(function (it) {
        return [it.title, it.description, it.category, it.material, it.colors]
          .filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1;
      });
    }

    if (sortMode === 'az' || sortMode === 'za') {
      list.sort(function (a, b) {
        var r = String(a.title || '').localeCompare(String(b.title || ''), 'de');
        return sortMode === 'az' ? r : -r;
      });
    }

    visibleItems = list;
    fillGrid($('#grid'), list);

    var n = list.length;
    txt($('#result-count'), n + (n === 1 ? ' Objekt' : ' Objekte'));
    show($('#state-nohits'), n === 0);
  }

  /* ---------- Kachelbau ---------- */
  function fillGrid(grid, items) {
    grid.textContent = '';
    items.forEach(function (item) {
      grid.appendChild(buildCard(item, items));
    });
  }

  function buildCard(item, list) {
    var card = el('button', 'card');
    card.type = 'button';

    var media = el('div', 'card-media');
    var img = el('img');
    img.src = mediaUrl(item.image);
    img.alt = item.title || 'Objekt';
    img.loading = 'lazy';
    img.decoding = 'async';
    media.appendChild(img);

    var badges = el('div', 'badges');
    if (item.is_new) badges.appendChild(makeNewBadge());
    if (item.badge) badges.appendChild(makeBadge(item.badge));
    if (badges.children.length) media.appendChild(badges);

    if (isHidden(item)) {
      media.classList.add('is-nsfw');
      media.appendChild(makeVeil());
    }

    var count = imagesOf(item).length;
    if (count > 1) {
      var c = el('span', 'card-count');
      c.textContent = count + ' Bilder';
      media.appendChild(c);
    }
    card.appendChild(media);

    var body = el('div', 'card-body');

    var cat = el('span', 'card-cat');
    cat.textContent = item.category || '';
    body.appendChild(cat);

    var h3 = el('h3');
    h3.textContent = item.title || 'Ohne Titel';
    if (item.nsfw) h3.appendChild(nsfwTag());
    body.appendChild(h3);

    if (item.description) {
      var p = el('p', 'card-desc');
      p.textContent = item.description;
      body.appendChild(p);
    }

    var foot = el('div', 'card-foot');
    if (item.price_note) {
      var price = el('span', 'card-price');
      price.textContent = item.price_note;
      foot.appendChild(price);
    }
    if (item.material) {
      var meta = el('span', 'card-meta');
      meta.textContent = item.material;
      foot.appendChild(meta);
    }
    if (foot.children.length) body.appendChild(foot);

    card.appendChild(body);

    card.addEventListener('click', function () {
      if (isHidden(item)) { reveal(item); return; }
      openLightbox(list, list.indexOf(item), 0);
    });

    return card;
  }

  /** Grünes "Neu" – eigener Schalter, unabhängig vom Aufkleber-Feld. */
  function makeNewBadge() {
    var b = el('span', 'badge badge-new');
    b.textContent = 'Neu';
    return b;
  }

  function makeBadge(text) {
    var b = el('span', 'badge');
    if (/nicht verf|ausverkauft|vergeben/i.test(text)) b.className = 'badge badge-muted';
    else if (/anfrage/i.test(text)) b.className = 'badge badge-outline';
    b.textContent = text;
    return b;
  }

  function makeVeil() {
    var veil = el('span', 'nsfw-overlay');
    veil.appendChild(document.createTextNode('NSFW'));
    var sub = el('small');
    sub.textContent = 'Zum Anzeigen klicken';
    veil.appendChild(sub);
    return veil;
  }

  /* ================= NSFW ================= */

  var revealed = new Set();

  function isHidden(item) { return !!item.nsfw && !revealed.has(item); }

  function reveal(item) {
    revealed.add(item);
    applyView();
    renderFeaturedAgain();
  }

  function renderFeaturedAgain() {
    var picks = allItems.filter(function (it) { return it.featured; });
    if (picks.length) fillGrid($('#featured-grid'), picks);
  }

  function nsfwTag() {
    var t = el('span', 'tag-nsfw');
    t.textContent = 'NSFW';
    return t;
  }

  /* ================= Detailansicht ================= */

  var lb = $('#lightbox');
  var lbList = [];
  var lbIndex = 0;
  var imgIndex = 0;
  var lastFocused = null;

  function openLightbox(list, itemIdx, imageIdx) {
    if (itemIdx < 0) return;
    lastFocused = document.activeElement;
    lbList = list;
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
    var item = lbList[lbIndex];
    if (!item) return;
    var imgs = imagesOf(item);
    if (imgIndex >= imgs.length) imgIndex = 0;
    if (imgIndex < 0) imgIndex = imgs.length - 1;

    var img = $('#lb-img');
    img.src = mediaUrl(imgs[imgIndex]);
    img.alt = item.title || 'Objekt';

    lb.classList.toggle('nsfw-hidden', isHidden(item));

    txt($('#lb-cat'), item.category || '');
    txt($('#lb-title'), item.title || 'Ohne Titel');
    if (item.nsfw) $('#lb-title').appendChild(nsfwTag());

    var badges = $('#lb-badges');
    badges.textContent = '';
    if (item.is_new) badges.appendChild(makeNewBadge());
    if (item.badge) badges.appendChild(makeBadge(item.badge));

    txt($('#lb-desc'), item.description || '');
    buildSpec(item);
    buildCta(item);
    buildThumbs(imgs);

    var multi = lbList.length > 1 || imgs.length > 1;
    show(lb.querySelector('.lb-prev'), multi);
    show(lb.querySelector('.lb-next'), multi);
  }

  function buildSpec(item) {
    var dl = $('#lb-spec');
    dl.textContent = '';
    [
      ['Material', item.material],
      ['Maße', item.size],
      ['Farben', item.colors],
      ['Druckzeit', item.print_time],
      ['Verfügbarkeit', item.status],
      ['Preis', item.price_note]
    ].forEach(function (row) {
      if (!row[1]) return;
      var dt = el('dt'); dt.textContent = row[0];
      var dd = el('dd'); dd.textContent = row[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
  }

  function buildCta(item) {
    var cta = $('#lb-cta');
    if (settings.email) {
      cta.href = 'mailto:' + settings.email +
        '?subject=' + encodeURIComponent('Anfrage: ' + (item.title || 'Objekt'));
      txt(cta, 'Nach diesem Objekt fragen');
    } else {
      cta.href = '#kontakt';
      txt(cta, 'Zum Kontakt');
      cta.addEventListener('click', closeLightbox, { once: true });
    }
  }

  function buildThumbs(imgs) {
    var thumbs = $('#lb-thumbs');
    thumbs.textContent = '';
    if (imgs.length < 2) return;
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

  /** Blättert durch die Bilder eines Objekts und danach zum nächsten Objekt. */
  function step(dir) {
    var imgs = imagesOf(lbList[lbIndex]);
    var next = imgIndex + dir;
    if (next >= 0 && next < imgs.length) {
      imgIndex = next;
    } else {
      lbIndex = (lbIndex + dir + lbList.length) % lbList.length;
      imgIndex = dir > 0 ? 0 : imagesOf(lbList[lbIndex]).length - 1;
    }
    updateLightbox();
  }

  lb.querySelector('.lb-reveal').addEventListener('click', function () {
    var item = lbList[lbIndex];
    if (item) reveal(item);
    lb.classList.remove('nsfw-hidden');
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
    if (!$('#legal').hidden && e.key === 'Escape') closeLegal();
  });

  var touchX = null;
  lb.addEventListener('touchstart', function (e) { touchX = e.changedTouches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });

  /* ================= Kopfzeile: Menü, Suche, Sortierung ================= */

  var navToggle = $('#nav-toggle');
  navToggle.addEventListener('click', function () {
    var open = document.body.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  $('#main-nav').addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      document.body.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  var searchToggle = $('#search-toggle');
  var searchDrawer = $('#search-drawer');
  var searchInput = $('#search-input');

  searchToggle.addEventListener('click', function () {
    var open = searchDrawer.hidden;
    show(searchDrawer, open);
    searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) searchInput.focus();
  });

  searchInput.addEventListener('input', function () {
    searchTerm = searchInput.value.trim();
    show($('#search-clear'), !!searchTerm);
    applyView();
  });

  $('#search-clear').addEventListener('click', function () {
    searchInput.value = '';
    searchTerm = '';
    show($('#search-clear'), false);
    applyView();
    searchInput.focus();
  });

  $('#reset-search').addEventListener('click', function () {
    searchInput.value = '';
    searchTerm = '';
    show($('#search-clear'), false);
    setCategory('Alle');
  });

  $('#sort-select').addEventListener('change', function (e) {
    sortMode = e.target.value;
    applyView();
  });
})();
