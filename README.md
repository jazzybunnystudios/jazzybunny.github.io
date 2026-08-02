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

Unter `/admin/` gibt es zwei Bereiche:

**Galerie → Objekte** – die Liste deiner Objekte. „Add Objekt" legt einen neuen Eintrag
an mit Hauptbild, Titel, Beschreibung, Kategorie, Material und optionalen Zusatzbildern.
Die Einträge lassen sich per Drag & Drop sortieren; diese Reihenfolge erscheint 1:1 auf
der Webseite. Aus den Kategorien baut die Seite automatisch Filter-Buttons – ab zwei
verschiedenen Kategorien tauchen sie auf.

**Einstellungen → Seite & Kontakt** – Titel, Untertitel, Intro-Text, Kontaktdaten und
Impressum.

Jedes „Publish" ist ein Commit. Nach ein bis zwei Minuten hat GitHub Pages neu
ausgeliefert und die Änderung ist live.

> **Tipp zu Bildern:** vor dem Hochladen auf etwa 1600 px Breite verkleinern.
> Handy-Fotos mit 8 MB machen die Seite langsam und das Repo unnötig groß.

> **Impressum:** Sobald die Seite gewerblich ist, ist ein Impressum in Deutschland
> Pflicht. Das Feld ist im Admin-Bereich vorbereitet; solange es leer ist, wird der
> Link ausgeblendet. Was genau hineingehört, klärst du am besten mit der IHK oder
> einer Rechtsberatung – ich kann dir das nicht rechtssicher vorgeben.

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
index.html              Startseite
assets/style.css        Design (dunkel als Standard, heller Modus per Umschalter)
assets/app.js           Lädt die JSON-Dateien, Grid, Filter, Lightbox
assets/logo.webp        Volles Logo mit Schriftzug (Startseite)
assets/logo-mark.webp   Quadratischer Ausschnitt nur mit der Figur (Kopfzeile)
assets/favicon.png      Browser-Tab-Symbol
content/gallery.json    ← wird vom CMS geschrieben: deine Objekte
content/settings.json   ← wird vom CMS geschrieben: Titel, Logo, Kontakt, Impressum
images/uploads/         ← hier landen die hochgeladenen Bilder
admin/index.html        Lädt Decap CMS
admin/config.yml        CMS-Konfiguration
oauth/worker.js         Cloudflare Worker für den GitHub-Login
.nojekyll               Schaltet Jekyll auf GitHub Pages ab
```

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
<link href="config.yml?v=2" type="text/yaml" rel="cms-config-url">
```

**Nach jeder Änderung an `config.yml` die Zahl hochzählen** (`?v=3`, `?v=4`, …). Sonst
arbeitest du bis zu zehn Minuten mit der alten Fassung weiter und suchst den Fehler an
der falschen Stelle.

## Logo austauschen

Die beiden Logo-Dateien liegen als Felder im Admin-Bereich unter **Einstellungen →
Seite & Kontakt** und lassen sich dort ersetzen. `assets/favicon.png` ist nicht im CMS
hinterlegt – die Datei einfach direkt im Repository überschreiben (64 × 64 px).

Die Akzentfarbe stammt aus dem Logo und steht in `assets/style.css` unter `--accent`
(dunkel: `#c8434b`, hell: `#a52e36`).

## Eigene Domain

**Settings → Pages → Custom domain** in GitHub, beim Domain-Anbieter einen CNAME auf
`DEIN-NAME.github.io` setzen. Danach die neue Domain in `admin/config.yml` (`site_url`)
und in `ALLOWED_ORIGINS` des Workers ergänzen.
