# JazzyBunny Studios

Statische Galerie-Webseite für GitHub Pages mit **Decap CMS** als Admin-Bereich.
Kein Shop, kein Server, keine eigene Benutzer-Datenbank.

* Besucher sehen eine Galerie mit Bildern, Titeln, Beschreibungen und Kategorie-Filtern.
* Du meldest dich unter `/admin/` mit deinem **GitHub-Account** an und lädst Bilder hoch.
* Alles landet als normale Dateien im Repository und ist damit versioniert.

---

## Wie der Login funktioniert (und warum es einen Worker braucht)

Decap CMS schreibt direkt über die GitHub-API in dein Repository. Für die Anmeldung
verlangt GitHub aber einen Server, der den Login-Code gegen ein Token tauscht – dabei
wird ein *Client Secret* gebraucht, das niemals im Browser stehen darf. GitHub Pages
liefert nur statische Dateien und kann das nicht.

Deshalb liegt in `oauth/` ein winziger **Cloudflare Worker**. Er macht ausschließlich
diesen einen Tausch, speichert nichts und kennt keine Passwörter.

> **Wer darf rein?** Ausschließlich GitHub-Accounts mit Schreibrechten auf dieses
> Repository. Es gibt keine eigene Nutzerverwaltung, die man knacken könnte.
> Ist dein Repo privat, sieht ohnehin niemand sonst die Inhalte – dann brauchst du
> für GitHub Pages allerdings ein bezahltes GitHub-Konto.

---

## Einrichtung

### 1. Repository anlegen und Dateien hochladen

Neues Repository auf GitHub erstellen (z. B. `galerie`), dann in diesem Ordner:

```bash
git init && git branch -M main && git add . && git commit -m "Galerie" && git remote add origin https://github.com/DEIN-NAME/galerie.git && git push -u origin main
```

### 2. GitHub Pages aktivieren

Im Repository: **Settings → Pages → Source: „Deploy from a branch"**, Branch `main`, Ordner `/ (root)`.
Nach ein bis zwei Minuten ist die Seite unter `https://DEIN-NAME.github.io/galerie/` erreichbar.

### 3. Worker ein erstes Mal veröffentlichen

Erst der Worker, dann die OAuth App – so kennst du die Callback-URL, bevor du sie
brauchst. Kostenloses Konto auf [cloudflare.com](https://cloudflare.com) anlegen, dann
in `oauth/wrangler.toml` die `ALLOWED_ORIGINS` eintragen (nur der Origin, also
`https://DEIN-NAME.github.io` – **ohne** `/galerie`). `GITHUB_CLIENT_ID` bleibt
vorerst der Platzhalter. Danach:

```bash
cd oauth && npx wrangler login
```

```bash
cd oauth && npx wrangler deploy
```

Wrangler gibt am Ende die Worker-URL aus, z. B. `https://decap-oauth.max.workers.dev`.
Diese URL notieren.

*Ohne Kommandozeile geht es auch:* im Cloudflare-Dashboard unter **Workers & Pages →
Create → Start with Hello World**, den Inhalt von `oauth/worker.js` in den Editor
einfügen, und die drei Variablen unter **Settings → Variables** anlegen
(`GITHUB_CLIENT_SECRET` als „Secret", die anderen beiden als „Text").

### 4. GitHub OAuth App anlegen und Worker scharf schalten

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**

| Feld | Wert |
|---|---|
| Application name | JazzyBunny CMS |
| Homepage URL | `https://DEIN-NAME.github.io/galerie/` |
| Authorization callback URL | `https://decap-oauth.DEIN-SUBDOMAIN.workers.dev/callback` |

**Client ID** notieren und ein **Client Secret** erzeugen (wird nur ein einziges Mal
angezeigt). Die Client ID in `oauth/wrangler.toml` eintragen, dann:

```bash
cd oauth && npx wrangler secret put GITHUB_CLIENT_SECRET
```

```bash
cd oauth && npx wrangler deploy
```

### 5. `admin/config.yml` anpassen

Drei Zeilen, alle mit `<-- ANPASSEN` markiert:

```yaml
backend:
  repo: DEIN-NAME/galerie
  base_url: https://decap-oauth.DEIN-SUBDOMAIN.workers.dev
site_url: https://DEIN-NAME.github.io/galerie
```

Änderung committen und pushen. Fertig – `https://DEIN-NAME.github.io/galerie/admin/`
zeigt jetzt „Login with GitHub".

---

## Benutzung

Unter `/admin/` gibt es drei Bereiche.

### Galerie → Objekte

Die Liste deiner Objekte, per Drag & Drop sortierbar – die Reihenfolge hier ist auch
die Reihenfolge auf der Webseite. Pro Objekt:

| Feld | Wirkung |
|---|---|
| Hauptbild | Vorschaubild in der Galerie. Hochformat wirkt am besten |
| Titel, Kategorie | Kategorien erzeugen automatisch Filter-Knöpfe und Kachel-Vorschauen |
| Produkt-ID | Deine eigene Kennung, z. B. „JB-042". Steht in der Detailansicht, ist über die Suche findbar und landet im Betreff der Anfrage-Mail |
| NSFW | Bild unscharf, Kennzeichen neben dem Titel |
| Neu | Grünes Schild „Neu" oben links auf dem Bild |
| Highlight | Erscheint zusätzlich oben im Abschnitt „Highlights" |
| Aufkleber | Zweites Schild in der Akzentfarbe: Bestseller, Limitiert, Einzelstück, Auf Anfrage, Nicht verfügbar – kombinierbar mit „Neu" |
| Material, Maße, Farben, Druckzeit, Verfügbarkeit, Preis-Hinweis | Landen als Tabelle in der Detailansicht |
| Weitere Bilder | Werden in der Detailansicht als Miniaturen zum Durchblättern gezeigt |

Der Preis-Hinweis ist reiner Text („ab 25 €", „Preis auf Anfrage"). Es gibt keinen
Warenkorb – Bestellungen laufen über den Kontakt-Knopf, der den Objektnamen in den
E-Mail-Betreff schreibt.

### Startseite

Bühnenbild, Überschriften, Knöpfe, der Kennzahlen-Streifen und die FAQ-Liste.
Leere Listen blenden den jeweiligen Abschnitt komplett aus.

### Einstellungen → Seite & Kontakt

Sperre, Ankündigungsleiste, Logo, **Akzentfarbe**, **WhatsApp**, Kontaktdaten
(E-Mail, Instagram, TikTok, YouTube, Etsy, Telefon), das **Discord-Widget**,
Impressum und Datenschutz.

Jedes „Publish" ist ein Commit. Nach ein bis zwei Minuten hat GitHub Pages neu
ausgeliefert und die Änderung ist live.

> **Tipp zu Bildern:** vor dem Hochladen auf etwa 1600 px verkleinern.
> Handy-Fotos mit 8 MB machen die Seite langsam und das Repo unnötig groß.

> **Impressum:** Sobald die Seite gewerblich ist, ist ein Impressum in Deutschland
> Pflicht. Das Feld ist vorbereitet; solange es leer ist, wird der Link ausgeblendet.
> Was genau hineingehört, klärst du am besten mit der IHK oder einer Rechtsberatung.

---

## Was Besucher sehen

Ankündigungsleiste (wegklickbar) → klebende Kopfzeile mit Menü, Suche und
Hell/Dunkel-Umschalter → Bühne mit Logo und Knöpfen → Kennzahlen → Kategorie-Kacheln
→ Highlights → Galerie mit Filter, Suche und Sortierung → FAQ → Kontakt → Fußzeile.

Abschnitte ohne Inhalt erscheinen gar nicht erst. Mit einem einzigen Objekt ohne
Kategorie bleibt also nur Bühne, Galerie und Kontakt übrig.

Die **Suche** (Lupe in der Kopfzeile) durchsucht Titel, Beschreibung, Kategorie,
Material und Farben. Die **Detailansicht** zeigt großes Bild, Miniaturen, Aufkleber,
Angaben-Tabelle und den Anfrage-Knopf; blättern geht per Pfeiltasten, Wischen oder
den Knöpfen im Bild.

---

## Lokal testen

Ohne Login, direkt aus dem Ordner:

```bash
npx serve .
```

Mit funktionierendem Admin-Bereich (schreibt in die lokalen Dateien statt nach GitHub) –
zwei Terminals:

```bash
npx decap-server
```

```bash
npx serve . -l 8080
```

Dann `http://localhost:8080/admin/` öffnen. Möglich macht das `local_backend: true`
in der Config; auf der Live-Seite wird die Einstellung ignoriert.

---

## Dateien

```
index.html              Aufbau der Seite
assets/style.css        Design (dunkel als Standard, heller Modus per Umschalter)
assets/app.js           Lädt die JSON-Dateien und baut daraus die Seite
assets/wordmark.webp    Wortmarke (Kopfzeile, Fußzeile, Sperrseite)
assets/gotham.woff2     Zierschrift für die grossen Überschriften
assets/favicon.png      Browser-Tab-Symbol (J-Monogramm)
content/gallery.json    ← vom CMS: deine Objekte
content/home.json       ← vom CMS: Bühne, Überschriften, Kennzahlen, FAQ
content/settings.json   ← vom CMS: Titel, Logo, Farbe, Kontakt, Rechtstexte
images/uploads/         ← hier landen die hochgeladenen Bilder
admin/index.html        Lädt Decap CMS
admin/config.yml        CMS-Konfiguration
oauth/worker.js         Cloudflare Worker für den GitHub-Login
.nojekyll               Schaltet Jekyll auf GitHub Pages ab
CNAME                   Deine Domain – nicht löschen
```

Es gibt keinen Build-Schritt: GitHub Pages liefert diese Dateien unverändert aus.

## Arbeiten am Code, wenn das CMS in Benutzung ist

Decap CMS committet direkt ins Repository. Jedes „Publish" im Admin erzeugt also einen
Commit auf GitHub, den du lokal nicht hast. Ein `git push` wird dann abgelehnt:

```
! [rejected]  main -> main (fetch first)
```

Das ist kein Fehler, sondern der Schutz davor, deine über das CMS gepflegten Inhalte
zu überschreiben. Vor jedem Push deshalb:

```bash
git pull --rebase origin main
```

Solange du lokal am Code arbeitest (`assets/`, `admin/`, `index.html`) und das CMS an
den Inhalten (`content/`, `images/uploads/`), gibt es dabei nie Konflikte – ihr fasst
verschiedene Dateien an.

## NSFW-Kennzeichnung

Jedes Objekt hat im Admin einen Umschalter **NSFW**. Ist er an:

* Das Vorschaubild in der Galerie ist unscharf, mit dem Hinweis „Zum Anzeigen klicken".
* Neben dem Titel steht ein **NSFW**-Kennzeichen – auch nach dem Aufdecken.
* Der erste Klick auf die Kachel deckt nur auf, erst der zweite öffnet die Großansicht.
  So landet nichts versehentlich formatfüllend am Bildschirm.
* Blättert man in der Großansicht auf ein noch verdecktes Objekt, ist es dort ebenfalls
  unscharf und muss einzeln aufgedeckt werden.

Aufgedeckt bleibt es nur für den aktuellen Besuch – nach einem Neuladen ist wieder alles
verdeckt.

> Auch das ist eine Anzeige-Entscheidung im Browser, keine Zugangssperre: Die Bilddatei
> selbst liegt unverändert unter `images/uploads/` und ist über ihre direkte Adresse
> abrufbar. Für eine echte Altersprüfung reicht das nicht.

## Seite vorübergehend sperren

Im Admin unter **Einstellungen → Seite & Kontakt** ganz oben der Schalter
**„Seite gesperrt"**. Ist er an, sehen Besucher statt der Galerie einen Hinweis mit
Logo, Text und – falls hinterlegt – deinen Kontaktdaten. Überschrift und Zusatztext
sind in den beiden Feldern darunter frei einstellbar.

Der Admin-Bereich unter `/admin/` bleibt dabei erreichbar, du sperrst dich also nicht
aus. `content/gallery.json` wird bei gesperrter Seite gar nicht erst geladen.

> **Das ist ein Hinweisschild, keine Zugangssperre.** GitHub Pages liefert nur
> statische Dateien aus, es gibt keinen Server, der Anfragen abweisen könnte. Wer die
> direkte Adresse einer Datei unter `images/uploads/` kennt, kann sie weiterhin
> abrufen. Für „wir machen gerade Pause" reicht das; für Vertrauliches nicht.

## Wenn du `admin/config.yml` änderst

GitHub Pages liefert Dateien mit `Cache-Control: max-age=600` aus, und Decap lädt die
Config per JavaScript nach – ein normales Neuladen holt sie also nicht zwingend neu.
Deshalb steht in `admin/index.html`:

```html
<link href="config.yml?v=5" type="text/yaml" rel="cms-config-url">
```

**Nach jeder Änderung an `config.yml` die Zahl hochzählen** (`?v=6`, `?v=7`, …). Sonst
arbeitest du bis zu zehn Minuten mit der alten Fassung weiter und suchst den Fehler an
der falschen Stelle.

## Bestellung über WhatsApp

Trägst du unter **Einstellungen → WhatsApp** eine Nummer ein, ändert sich dreierlei:

* Der Knopf in der Detailansicht wird grün und heißt **„Über WhatsApp bestellen"**.
  Er führt direkt in den Chat – mit Objektname und Produkt-ID schon in der Nachricht,
  also ohne Umweg über den Kontaktbereich.
* Unten rechts erscheint ein **schwebender WhatsApp-Knopf**, der auf jeder Position der
  Seite erreichbar ist. Bei geöffneter Detailansicht blendet er sich aus, auf dem Handy
  schrumpft er auf das bloße Zeichen.
* **WhatsApp** taucht zusätzlich bei den Kontaktknöpfen auf.

Eintragen kannst du, was dir vorliegt – die Nummer wird herausgelöst:

| Eingabe | Ergebnis |
|---|---|
| `+49 170 1234567` | ✓ |
| `+49 (170) 123-4567` | ✓ |
| `https://wa.me/491701234567` | ✓ |
| `https://api.whatsapp.com/send?phone=491701234567` | ✓ |

**Die Ländervorwahl muss dabei sein** (49 für Deutschland), sonst weiß WhatsApp nicht,
wen es anrufen soll. Eine führende Null der Ortsvorwahl entfällt.

Ist das Feld leer, fällt der Bestellknopf auf die E-Mail-Adresse zurück; fehlt auch die,
führt er zum Kontaktbereich.

## Discord-Widget

Das Feld **Einstellungen → Discord-Widget** zeigt deinen Server unten im
Kontaktbereich, mit Mitgliederliste und Beitreten-Knopf.

Hineinschreiben kannst du, was dir am nächsten liegt – die Seite holt sich die
Server-ID selbst heraus:

* den kompletten Einbettungscode aus Discord
* die Widget-Adresse (`https://discord.com/widget?id=...`)
* oder einfach nur die Server-ID

Damit überhaupt etwas erscheint, muss in Discord unter **Servereinstellungen →
Widget** der Schalter *Server-Widget aktivieren* an sein. Ohne das liefert Discord
nichts aus.

Trägst du versehentlich einen Einladungslink (`discord.gg/…`) ein, findet sich darin
keine Server-ID – dann erscheint statt des Widgets ein schlichter Knopf zum Server.

Das Widget lädt automatisch mit der Seite. Weil der Kontaktbereich ganz unten liegt,
trägt der Rahmen `loading="lazy"` – der Browser holt den Inhalt erst, wenn der
Abschnitt in die Nähe des Sichtbereichs kommt. Der Seitenaufbau wird dadurch nicht
ausgebremst, und `.discord-box` reserviert vorab 460 px Höhe, damit nichts springt.

**Zum Datenschutz:** Damit geht bei praktisch jedem Besuch eine Anfrage an Discord,
inklusive der IP-Adresse des Besuchers. Discord gehört deshalb als Empfänger in deine
Datenschutzerklärung. Wenn du stattdessen lieber ein Klick-Tor davor hättest – also
erst ein Knopf, dann das Widget – sag Bescheid, das ist schnell wieder eingebaut.

## Die Zierschrift

Die grossen mittigen Überschriften – auf der Bühne und auf der Sperrseite – laufen in
`assets/gotham.woff2`. Angewendet wird sie über die Variable `--font-display` in
`assets/style.css`.

> **Diese Schrift kann nur A–Z, a–z und das Leerzeichen.**
> Ziffern, Umlaute (ä ö ü ß) und Satzzeichen fehlen komplett. Fehlende Zeichen
> ersetzt der Browser automatisch durch die Systemschrift – das sieht dann gemischt
> aus. Halte Überschriften also bei reinen Buchstaben. „JazzyBunny Studios" passt,
> „3D-Druck – individuell" nicht.

Der Untertitel unter der Überschrift und alle übrigen Texte nutzen weiterhin die
Systemschrift, die alle Zeichen beherrscht.

Die Datei stammt von Vladimir Nikolic und trägt denselben Namen wie die kommerzielle
Schrift von Hoefler & Co., ist aber nicht dieselbe. Da sie auf der Seite öffentlich
herunterladbar ist, prüf bei Gelegenheit, ob die Lizenz das erlaubt.

## Logo austauschen

Es gibt **ein** Logo: die Wortmarke. Sie steht oben links in der Kopfzeile, in der
Fußzeile und auf der Sperrseite. Austauschbar im Admin unter **Einstellungen →
Logo (Wortmarke)**.

Format: Querformat mit transparentem Hintergrund, etwa 10:1 breit zu hoch, rund
900 px breit. Weiße Schrift wird im hellen Design per CSS-Filter dunkel eingefärbt –
**das klappt nur bei einfarbigen Logos.** Bei einem mehrfarbigen Logo müsste die
Regel `.brand-logo` in `assets/style.css` angepasst werden.

`assets/favicon.png` ist nicht im CMS hinterlegt – die Datei direkt im Repository
überschreiben (64 × 64 px) und die Zahl bei `favicon.png?v=2` in `index.html`
hochzählen.

Die **Akzentfarbe** stellst du im Admin unter **Einstellungen → Akzentfarbe** ein –
sie färbt Knöpfe, Aufkleber, Kategorie-Labels und die Striche unter den Überschriften.
Der Startwert `#e03a45` steht in `assets/style.css` unter `--accent`.

## Eigene Domain

**Settings → Pages → Custom domain** in GitHub, beim Domain-Anbieter einen CNAME auf
`DEIN-NAME.github.io` setzen. Danach die neue Domain in `admin/config.yml` (`site_url`)
und in `ALLOWED_ORIGINS` des Workers ergänzen.
