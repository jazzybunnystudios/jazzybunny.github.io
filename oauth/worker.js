/**
 * GitHub-OAuth-Vermittler für Decap CMS (Cloudflare Worker).
 *
 * Warum es das braucht: GitHub tauscht den Login-Code nur gegen ein Token ein,
 * wenn das Client Secret mitgeschickt wird. Das darf nicht in den Browser –
 * also übernimmt dieser Worker den Tausch. Er speichert nichts und hat keine
 * eigene Nutzerverwaltung: wer ins CMS darf, entscheidet allein GitHub über
 * die Schreibrechte am Repository.
 *
 * Benötigte Variablen (siehe README):
 *   GITHUB_CLIENT_ID      – Client ID der GitHub OAuth App
 *   GITHUB_CLIENT_SECRET  – Client Secret (als Secret hinterlegen!)
 *   ALLOWED_ORIGINS       – kommaseparierte Liste erlaubter Seiten-Origins
 */

const PROVIDER = 'github';
const STATE_COOKIE = 'decap_oauth_state';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    switch (url.pathname.replace(/\/+$/, '') || '/') {
      case '/auth':
        return handleAuth(url, env);
      case '/callback':
        return handleCallback(request, url, env);
      case '/':
        return new Response(
          'Decap CMS OAuth-Vermittler laeuft.\nEndpunkte: /auth und /callback',
          { headers: { 'content-type': 'text/plain; charset=utf-8' } }
        );
      default:
        return new Response('Not found', { status: 404 });
    }
  },
};

/* ------------------------------------------------------------------ */
/* Schritt 1: Weiterleitung zu GitHub                                  */
/* ------------------------------------------------------------------ */
function handleAuth(url, env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return new Response('GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET fehlen.', { status: 500 });
  }

  const state = crypto.randomUUID();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/callback`);
  authorize.searchParams.set('scope', url.searchParams.get('scope') || 'repo,user');
  authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      // Lax reicht: GitHub schickt den Nutzer per normaler Navigation zurück.
      'Set-Cookie': `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Schritt 2: Code gegen Token tauschen, Ergebnis ans CMS zurückgeben  */
/* ------------------------------------------------------------------ */
async function handleCallback(request, url, env) {
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const expectedState = readCookie(request.headers.get('Cookie'), STATE_COOKIE);

  if (url.searchParams.get('error')) {
    return handshake(env, 'error', { message: url.searchParams.get('error_description') || url.searchParams.get('error') });
  }
  if (!code) {
    return handshake(env, 'error', { message: 'Kein Autorisierungs-Code von GitHub erhalten.' });
  }
  if (!expectedState || returnedState !== expectedState) {
    return handshake(env, 'error', { message: 'State stimmt nicht überein – Login bitte erneut starten.' });
  }

  let data;
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'decap-cms-oauth-worker',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/callback`,
      }),
    });
    data = await res.json();
  } catch (err) {
    return handshake(env, 'error', { message: 'GitHub war nicht erreichbar: ' + err.message });
  }

  if (data.error || !data.access_token) {
    return handshake(env, 'error', { message: data.error_description || data.error || 'Kein Token erhalten.' });
  }

  return handshake(env, 'success', { token: data.access_token, provider: PROVIDER });
}

/* ------------------------------------------------------------------ */
/* Antwortseite: postMessage-Handshake mit dem CMS-Fenster             */
/* ------------------------------------------------------------------ */
function handshake(env, message, content) {
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  // Nutzlast als fertiges JS-String-Literal einbetten – so gibt es keine
  // Escaping-Probleme mit Anführungszeichen im Token oder in Fehlertexten.
  const payloadLiteral = JSON.stringify(
    `authorization:${PROVIDER}:${message}:${JSON.stringify(content)}`
  );

  const body = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Anmeldung</title>
<style>body{font:15px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#333}</style>
</head><body>
<p>Anmeldung wird abgeschlossen &hellip;</p>
<script>
(function () {
  var allowed = ${JSON.stringify(allowed)};
  var payload = ${payloadLiteral};

  function receive(e) {
    if (allowed.length && allowed.indexOf(e.origin.replace(/\\/+$/, '')) === -1) {
      console.warn('Origin nicht erlaubt:', e.origin);
      return;
    }
    window.opener.postMessage(payload, e.origin);
    window.removeEventListener('message', receive, false);
  }

  if (!window.opener) {
    document.body.textContent = 'Dieses Fenster wurde nicht vom CMS geoeffnet.';
    return;
  }
  window.addEventListener('message', receive, false);
  // Handshake starten – das CMS antwortet und bekommt daraufhin das Token.
  window.opener.postMessage('authorizing:${PROVIDER}', '*');
})();
</script>
</body></html>`;

  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // State-Cookie wird nicht mehr gebraucht.
      'Set-Cookie': `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

function readCookie(header, name) {
  if (!header) return null;
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? match[1] : null;
}
