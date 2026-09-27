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

    // Muss vor den Kontaktlinks laufen – die greifen auf die Nummer zu.
    buildWhatsApp(s);

    buildContactLinks($('#contact-links'), s, true, 'button');
    buildContactLinks($('#footer-contact'), s, false, 'plain');

    buildAnnounce(s);
    buildDiscord(s);
    buildLegal('imprint', s.imprint, 'Impressum');
    buildLegal('privacy', s.privacy, 'Datenschutz');
  }

  /* ---------- WhatsApp ---------- */
  var waNumber = null;

  /**
   * Holt die reine Rufnummer heraus – egal ob Nummer mit Vorwahl, wa.me-Link
   * oder api.whatsapp.com-Adresse eingetragen wurde.
   */
  function whatsappNumber(value) {
    var v = String(value || '').trim();
    if (!v) return null;

    var m = v.match(/(?:wa\.me\/|phone=)(\d{6,20})/i);
    if (m) return m[1];

    var digits = v.replace(/[^\d]/g, '');           // "+49 170 …" -> "49170…"
    return digits.length >= 6 ? digits : null;
  }

  /** Baut eine wa.me-Adresse mit vorformulierter Nachricht. */
  function whatsappLink(text) {
    return 'https://wa.me/' + waNumber + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  var WA_TEXT_STD = 'Hallo! Ich habe eine Frage.';
  var WA_ORDER_STD = 'Hallo! Ich möchte gerne bestellen: {titel} ({id})';

  function buildWhatsApp(s) {
    waNumber = whatsappNumber(s.whatsapp);
    if (!waNumber) return;

    var float = $('#wa-float');
    float.href = whatsappLink(s.whatsapp_text || WA_TEXT_STD);
    show(float, true);
  }

  /**
   * Setzt {titel}, {id}, {preis} und {kategorie} ein. Platzhalter ohne Wert
   * hinterlassen sonst leere Klammern – die werden hier mit weggeräumt.
   */
  function fillTemplate(tpl, item) {
    return String(tpl)
      .replace(/\{titel\}/gi, item.title || 'Objekt')
      .replace(/\{id\}/gi, item.product_id || '')
      .replace(/\{preis\}/gi, reducedPrice(item) || priceLabel(item.price_note))
      .replace(/\{kategorie\}/gi, item.category || '')
      .replace(/\(\s*\)|\[\s*\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
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
    // Den Kasten gibt es nur auf der Startseite.
    if (!raw || !$('#discord-box')) return;

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
    loadDiscord();
  }

  function loadDiscord() {
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
    if (waNumber) {
      entries.push({ href: whatsappLink(s.whatsapp_text || WA_TEXT_STD), label: 'WhatsApp', ext: true });
    }
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
    // Die Bühne gibt es nur auf der Startseite – auf der Produktseite
    // fehlen diese Elemente, deshalb überall vorher prüfen.
    var bg = $('#hero-bg');
    if (h.hero_image && bg) {
      bg.style.backgroundImage = 'url("' + mediaUrl(h.hero_image) + '")';
      show(bg, true);
      document.body.classList.add('has-hero-bg');
    }
    // Überschrift in der Zierschrift, Untertitel als kleine Zeile darüber.
    if (h.hero_title) txt($('#hero-title'), h.hero_title);
    txt($('#hero-kicker'), s.tagline || '');
    txt($('#hero-sub'), h.hero_subtitle || s.about || '');

    var cta = $('#hero-cta');
    if (cta) {
      if (h.hero_cta_text) txt(cta, h.hero_cta_text);
      // Anker nur übernehmen, wenn es das Ziel auf dieser Seite auch gibt –
      // sonst bliebe ein alter Wert wie "#katalog" als toter Link stehen.
      if (h.hero_cta_link && zielVorhanden(h.hero_cta_link)) cta.href = h.hero_cta_link;
    }

    // Abschnittstitel – jedes Feld wirkt nur, wenn die Seite ihn hat
    [['#cat-title', h.cat_title],
     ['#neu-title', h.new_title],
     ['#featured-title', h.featured_title],
     ['#bestseller-title', h.bestseller_title],
     ['#limited-title', h.limited_title],
     ['#alles-title', h.shop_title],
     ['#shop-title', h.shop_title],
     ['#alles-text', h.shop_text],
     ['#faq-title', h.faq_title],
     ['#contact-title', h.contact_title],
     ['#contact-lead', h.contact_text]
    ].forEach(function (paar) {
      if (paar[1]) txt($(paar[0]), paar[1]);
    });

    renderStats(h.stats);
    renderFaq(h.faq);
  }

  function zielVorhanden(link) {
    if (link.charAt(0) !== '#') return true;         // externe Adresse oder andere Seite
    return !!document.querySelector(link);
  }

  function renderStats(stats) {
    if (!Array.isArray(stats) || !stats.length) return;
    var box = $('#strip-inner');
    if (!box) return;
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
    if (!list) return;
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

  /* ================= Produkte ================= */

  // Eine Datei bedient beide Seiten. Welche gerade laeuft, verraet das Markup:
  // die Produktseite hat die Filterspalte, die Startseite die Reihen.
  var istShop = !!$('.shop-side');

  var allItems = [];
  var visibleItems = [];
  var activeCategory = 'Alle';
  var searchTerm = '';
  var sortMode = 'default';
  var nsfwAus = false;
  var preisVon = null;
  var preisBis = null;
  var schnellFilter = '';          // neu | highlight | bestseller | limited

  var REIHEN_MAX = 4;              // Objekte pro Reihe auf der Startseite

  var REIHEN = [
    { id: 'neu',        sektion: '#row-neu',        gitter: '#neu-grid',        test: function (i) { return !!i.is_new; } },
    { id: 'highlight',  sektion: '#row-highlights', gitter: '#featured-grid',   test: function (i) { return !!i.featured; } },
    { id: 'bestseller', sektion: '#row-bestseller', gitter: '#bestseller-grid', test: function (i) { return /bestseller/i.test(i.badge || ''); } },
    { id: 'limited',    sektion: '#row-limited',    gitter: '#limited-grid',    test: function (i) { return !!i.is_limited; } }
  ];

  function reihenTest(id) {
    for (var i = 0; i < REIHEN.length; i++) if (REIHEN[i].id === id) return REIHEN[i].test;
    return null;
  }

  function loadGallery() {
    loadJSON('content/gallery.json').then(function (data) {
      show($('#state-loading'), false);
      allItems = (data && Array.isArray(data.items) ? data.items : []).filter(function (it) {
        return it && it.image;
      });

      if (!allItems.length) { show($('#state-empty'), true); return; }

      renderCategories();
      if (istShop) initShop(); else renderReihen();
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

  /* ---------- Startseite: kuratierte Reihen ---------- */
  function renderReihen() {
    REIHEN.forEach(function (r) {
      var treffer = allItems.filter(r.test);
      if (!treffer.length) return;
      fillGrid($(r.gitter), treffer.slice(0, REIHEN_MAX));
      show($(r.sektion), true);
    });
  }

  /* ---------- Kategorie-Kacheln ---------- */
  function renderCategories() {
    var box = $('#cat-grid');
    if (!box) return;

    var cats = categoriesOf();
    if (cats.length < 2) return;

    cats.forEach(function (cat) {
      var members = allItems.filter(function (it) { return (it.category || '').trim() === cat; });
      var tile = el('a', 'cat-tile');
      tile.href = 'produkte.html?kategorie=' + encodeURIComponent(cat);

      var img = el('img');
      img.src = mediaUrl(members[0].image);
      img.alt = '';
      img.loading = 'lazy';
      tile.appendChild(img);

      // Sind alle Objekte der Kategorie verdeckt, bleibt auch die Kachel unscharf.
      if (members.every(function (m) { return m.nsfw; })) tile.classList.add('is-blurred');

      var label = el('span', 'cat-label');
      label.appendChild(document.createTextNode(cat));
      var count = el('span', 'cat-count');
      count.textContent = members.length + (members.length === 1 ? ' Objekt' : ' Objekte');
      label.appendChild(count);
      tile.appendChild(label);

      box.appendChild(tile);
    });

    show($('#kategorien'), true);
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav="kategorien"]'), function (n) { n.hidden = false; });
  }

  /* ---------- Produktseite ---------- */
  function initShop() {
    leseAdresse();
    buildFilters();
    verdrahteFilter();
    applyView();
  }

  /** Vorauswahl aus der Adresszeile: ?kategorie= , ?filter= , ?q= */
  function leseAdresse() {
    var p = new URLSearchParams(location.search);

    var kat = p.get('kategorie');
    if (kat) activeCategory = kat;

    var f = p.get('filter');
    if (f && reihenTest(f)) schnellFilter = f;

    var q = p.get('q');
    if (q) {
      searchTerm = q;
      if ($('#search-input')) $('#search-input').value = q;
    }
  }

  function buildFilters() {
    var bar = $('#filters');
    if (!bar) return;

    var cats = categoriesOf();
    if (cats.length < 2) return;

    ['Alle'].concat(cats).forEach(function (label) {
      var b = el('button', 'side-cat');
      b.type = 'button';
      b.textContent = label;
      b.dataset.cat = label;
      b.setAttribute('aria-pressed', label === activeCategory ? 'true' : 'false');
      b.addEventListener('click', function () { setCategory(label); });
      bar.appendChild(b);
    });
    show($('#side-cats'), true);
  }

  function setCategory(label) {
    activeCategory = label;
    var bar = $('#filters');
    if (bar) {
      Array.prototype.forEach.call(bar.children, function (c) {
        c.setAttribute('aria-pressed', c.dataset.cat === label ? 'true' : 'false');
      });
    }
    applyView();
  }

  function verdrahteFilter() {
    var suche = $('#search-input');
    if (suche) {
      suche.addEventListener('input', function () {
        searchTerm = suche.value.trim();
        applyView();
      });
    }

    var nsfw = $('#nsfw-toggle');
    if (nsfw) {
      nsfw.addEventListener('change', function () {
        nsfwAus = nsfw.checked;
        applyView();
      });
    }

    [['#price-min', 'von'], ['#price-max', 'bis']].forEach(function (paar) {
      var feld = $(paar[0]);
      if (!feld) return;
      feld.addEventListener('input', function () {
        var v = parseFloat(feld.value);
        var gueltig = isFinite(v) && v >= 0 ? v : null;
        if (paar[1] === 'von') preisVon = gueltig; else preisBis = gueltig;
        applyView();
      });
    });

    var sortieren = $('#sort-select');
    if (sortieren) {
      sortieren.addEventListener('change', function (e) {
        sortMode = e.target.value;
        applyView();
      });
    }

    [$('#reset-filters'), $('#reset-search')].forEach(function (knopf) {
      if (knopf) knopf.addEventListener('click', alleFilterZuruecksetzen);
    });
  }

  function alleFilterZuruecksetzen() {
    searchTerm = '';
    schnellFilter = '';
    nsfwAus = false;
    preisVon = preisBis = null;
    sortMode = 'default';

    if ($('#search-input')) $('#search-input').value = '';
    if ($('#nsfw-toggle')) $('#nsfw-toggle').checked = false;
    if ($('#price-min')) $('#price-min').value = '';
    if ($('#price-max')) $('#price-max').value = '';
    if ($('#sort-select')) $('#sort-select').value = 'default';

    setCategory('Alle');
  }

  /** Zahlenwert eines Objekts fuer Preisfilter und -sortierung, sonst null. */
  function preisWert(item) {
    var text = reducedPrice(item) || priceLabel(item.price_note);
    var m = String(text).match(/\d[\d.,]*/);
    if (!m) return null;
    var v = parseNumber(m[0]);
    return isFinite(v) ? v : null;
  }

  /* ---------- Suche, Filter, Sortierung ---------- */
  function applyView() {
    var list = allItems.slice();

    if (schnellFilter) {
      var test = reihenTest(schnellFilter);
      if (test) list = list.filter(test);
    }

    if (activeCategory !== 'Alle') {
      list = list.filter(function (it) { return (it.category || '').trim() === activeCategory; });
    }

    if (nsfwAus) list = list.filter(function (it) { return !it.nsfw; });

    if (preisVon !== null || preisBis !== null) {
      list = list.filter(function (it) {
        var v = preisWert(it);
        if (v === null) return false;                    // ohne Preis kein Treffer
        if (preisVon !== null && v < preisVon) return false;
        if (preisBis !== null && v > preisBis) return false;
        return true;
      });
    }

    if (searchTerm) {
      var q = searchTerm.toLowerCase();
      list = list.filter(function (it) {
        return [it.title, it.description, it.category, it.material, it.colors, it.product_id]
          .filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1;
      });
    }

    sortiere(list);

    visibleItems = list;
    fillGrid($('#grid'), list);

    var n = list.length;
    txt($('#result-count'), n + (n === 1 ? ' Produkt' : ' Produkte'));
    show($('#state-nohits'), n === 0);
    zeigeSchnellFilter();
  }

  function sortiere(list) {
    if (sortMode === 'az' || sortMode === 'za') {
      list.sort(function (a, b) {
        var r = String(a.title || '').localeCompare(String(b.title || ''), 'de');
        return sortMode === 'az' ? r : -r;
      });
    } else if (sortMode === 'preis-auf' || sortMode === 'preis-ab') {
      list.sort(function (a, b) {
        var va = preisWert(a), vb = preisWert(b);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;                       // ohne Preis ans Ende
        if (vb === null) return -1;
        return sortMode === 'preis-auf' ? va - vb : vb - va;
      });
    }
  }

  /** Zeigt eine Schaltflaeche, wenn ueber die Adresszeile vorgefiltert wurde. */
  function zeigeSchnellFilter() {
    var box = $('#active-filter');
    if (!box) return;

    box.textContent = '';
    if (!schnellFilter) { show(box, false); return; }

    var namen = { neu: 'Neu eingetroffen', highlight: 'Highlights',
                  bestseller: 'Bestseller', limited: 'Limited Edition' };

    var chip = el('button', 'filter-chip');
    chip.type = 'button';
    chip.appendChild(document.createTextNode(namen[schnellFilter] || schnellFilter));
    var x = el('span', 'filter-x');
    x.textContent = '\u00d7';
    chip.appendChild(x);
    chip.addEventListener('click', function () {
      schnellFilter = '';
      applyView();
    });

    box.appendChild(chip);
    show(box, true);
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
    badgesFor(item).forEach(function (b) { badges.appendChild(b); });
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
    var price = priceNode(item, 'card-price');
    if (price) foot.appendChild(price);
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

  /* ---------- Rabatt ---------- */

  /** Gültiger Prozentsatz, sonst 0. */
  function salePercent(item) {
    if (!item.sale) return 0;
    var p = parseFloat(String(item.sale_percent).replace(',', '.'));
    return (isFinite(p) && p > 0 && p < 100) ? p : 0;
  }

  /**
   * Zahlen in deutscher wie englischer Schreibweise.
   * "1.200,50" -> 1200.5 · "1.200" -> 1200 · "9.99" -> 9.99 · "39,90" -> 39.9
   * Der Punkt ist nur dann ein Tausendertrenner, wenn ihm genau drei Ziffern
   * folgen – sonst wäre "9.99" fälschlich 999.
   */
  function parseNumber(str) {
    var s = String(str).trim();
    if (s.indexOf(',') !== -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    return parseFloat(s);
  }

  /**
   * Was im Preisfeld steht, für die Anzeige aufbereitet. Eine reine Zahl
   * bekommt das Euro-Zeichen dazu ("24" wird zu "24 €"). Steht dort Text
   * wie "ab 24 EUR" oder "Preis auf Anfrage", bleibt er unangetastet.
   */
  function priceLabel(raw) {
    var v = String(raw == null ? '' : raw).trim();
    if (!v) return '';
    if (/^[\d.,]+$/.test(v)) {
      var n = parseNumber(v);
      if (isFinite(n)) return formatPrice(n) + ' €';
    }
    return v;
  }

  /**
   * Rechnet die erste Zahl im Preis herunter und setzt sie an derselben
   * Stelle wieder ein. So bleiben "ab", Währung und Schreibweise erhalten:
   * "ab 24 EUR" wird zu "ab 19,20 EUR".
   * Ohne Zahl im Text (z. B. "Preis auf Anfrage") gibt es null zurück.
   */
  function reducedPrice(item) {
    var pct = salePercent(item);
    var text = priceLabel(item.price_note);
    if (!pct || !text) return null;

    var m = text.match(/\d[\d.,]*/);
    if (!m) return null;

    var value = parseNumber(m[0]);
    if (!isFinite(value) || value <= 0) return null;

    return text.slice(0, m.index) + formatPrice(value * (1 - pct / 100)) +
           text.slice(m.index + m[0].length);
  }

  function formatPrice(n) {
    var r = Math.round(n * 100) / 100;
    var ganz = Math.abs(r - Math.round(r)) < 0.005;
    return r.toLocaleString('de-DE', {
      minimumFractionDigits: ganz ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  /** Preis als Anzeige: bei Rabatt alt durchgestrichen, neu daneben. */
  function priceNode(item, cls) {
    var label = priceLabel(item.price_note);
    if (!label) return null;

    var box = el('span', cls);
    var neu = reducedPrice(item);

    if (neu) {
      var alt = el('s', 'price-old');
      alt.textContent = label;
      var jetzt = el('b', 'price-new');
      jetzt.textContent = neu;
      box.appendChild(alt);
      box.appendChild(jetzt);
    } else {
      box.textContent = label;
    }
    return box;
  }

  /* ---------- Schilder ---------- */

  /** Grünes "Neu" – eigener Schalter, unabhängig vom Aufkleber-Feld. */
  function makeNewBadge() {
    var b = el('span', 'badge badge-new');
    b.textContent = 'Neu';
    return b;
  }

  function makeSaleBadge(item) {
    var b = el('span', 'badge badge-sale');
    var pct = salePercent(item);
    b.textContent = pct ? '-' + formatPrice(pct) + ' %' : 'Sale';
    return b;
  }

  function makeLimitedBadge() {
    var b = el('span', 'badge badge-limited');
    b.textContent = 'Limited Edition';
    return b;
  }

  /** Alle Schilder eines Objekts in fester Reihenfolge. */
  function badgesFor(item) {
    var list = [];
    if (item.sale) list.push(makeSaleBadge(item));
    if (item.is_new) list.push(makeNewBadge());
    if (item.is_limited) list.push(makeLimitedBadge());
    if (item.badge) list.push(makeBadge(item.badge));
    return list;
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

  /** Nach dem Aufdecken die jeweilige Ansicht neu zeichnen. */
  function reveal(item) {
    revealed.add(item);
    if (istShop) applyView(); else renderReihenNeu();
  }

  function renderReihenNeu() {
    REIHEN.forEach(function (r) {
      var gitter = $(r.gitter);
      if (!gitter || $(r.sektion).hidden) return;
      fillGrid(gitter, allItems.filter(r.test).slice(0, REIHEN_MAX));
    });
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
    document.body.classList.add('lightbox-open');
    updateLightbox();
    lb.querySelector('.lb-close').focus();
  }

  function closeLightbox() {
    show(lb, false);
    document.body.style.overflow = '';
    document.body.classList.remove('lightbox-open');
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
    badgesFor(item).forEach(function (b) { badges.appendChild(b); });

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
      ['Preis', priceNode(item, 'spec-price')],
      ['Produkt-ID', item.product_id]
    ].forEach(function (row) {
      if (!row[1]) return;
      var dt = el('dt'); dt.textContent = row[0];
      var dd = el('dd');
      if (row[1].nodeType) dd.appendChild(row[1]); else dd.textContent = row[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
  }

  function buildCta(item) {
    var cta = $('#lb-cta');
    var name = item.title || 'Objekt';
    var kennung = item.product_id ? ' (' + item.product_id + ')' : '';

    cta.onclick = null;
    cta.removeAttribute('target');
    cta.removeAttribute('rel');
    cta.className = 'btn btn-primary lb-cta';

    if (waNumber) {
      // Direkt zur Bestellung, Nachricht kommt aus den Einstellungen.
      cta.className = 'btn btn-wa lb-cta';
      cta.href = whatsappLink(fillTemplate(settings.whatsapp_order_text || WA_ORDER_STD, item));
      cta.target = '_blank';
      cta.rel = 'noopener';
      setCtaLabel(cta, 'Über WhatsApp bestellen', true);

    } else if (settings.email) {
      cta.href = 'mailto:' + settings.email +
        '?subject=' + encodeURIComponent('Anfrage: ' + name + kennung);
      setCtaLabel(cta, 'Nach diesem Objekt fragen', false);

    } else {
      cta.href = '#kontakt';
      cta.onclick = closeLightbox;
      setCtaLabel(cta, 'Zum Kontakt', false);
    }
  }

  function setCtaLabel(cta, label, withIcon) {
    cta.textContent = '';
    if (withIcon) cta.appendChild(whatsappIcon());
    var span = el('span');
    span.textContent = label;
    cta.appendChild(span);
  }

  /** Kopie des Zeichens aus dem schwebenden Knopf. */
  function whatsappIcon() {
    var src = $('#wa-float svg');
    return src ? src.cloneNode(true) : document.createTextNode('');
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

  // Die Lupe fuehrt zur Produktseite; dort sitzt die Suche in der Spalte.
  var searchToggle = $('#search-toggle');
  if (searchToggle) {
    searchToggle.addEventListener('click', function () {
      var feld = $('#search-input');
      if (feld) {
        feld.scrollIntoView({ block: 'center' });
        feld.focus();
      } else {
        location.href = 'produkte.html';
      }
    });
  }

})();
