import { JOIN_PATH } from '../../shared/access.ts';

export type LoginProblem = 'invalid' | 'unavailable';

const TEXT = {
  de: {
    lang: 'de',
    title: 'Pendel-Pilot',
    lead: 'Pendel-Pilot ist im Moment nur mit Einladung nutzbar.',
    how: 'Öffne den Link oder scanne den QR-Code, den du bekommen hast.',
    devices: 'Du brauchst keinen eigenen Code pro Gerät: Derselbe Link gilt für alle deine Geräte, öffne ihn einfach auf jedem einmal. Landest du hier in der installierten App (Home-Bildschirm), füge den Link unten ins Feld ein.',
    label: 'Zugangscode oder Link',
    submit: 'Weiter',
    invalid: 'Dieser Code gilt nicht (mehr). Bitte frag nach einem neuen Link.',
    unavailable: 'Die Zugangsprüfung ist gerade nicht eingerichtet. Bitte versuch es später noch einmal.'
  },
  en: {
    lang: 'en',
    title: 'Pendel-Pilot',
    lead: 'Pendel-Pilot is invitation-only for now.',
    how: 'Open the link or scan the QR code you were given.',
    devices: 'You do not need a code per device: the same link works on all your devices, just open it once on each. If you land here in the installed app (home screen), paste the link into the field below.',
    label: 'Access code or link',
    submit: 'Continue',
    invalid: 'This code is not (or no longer) valid. Please ask for a new link.',
    unavailable: 'Access checking is not set up right now. Please try again later.'
  }
} as const;

function language(request: Request): 'de' | 'en' {
  const first = (request.headers.get('accept-language') ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('de') ? 'de' : 'en';
}

/** The page shown instead of the app without access: self-contained, so it needs no other file. */
export function loginPage(request: Request, problem: LoginProblem | null, status: number): Response {
  const text = TEXT[language(request)];
  const error = problem ? `<p class="error" role="alert">${text[problem]}</p>` : '';
  const html = `<!doctype html>
<html lang="${text.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161a22" media="(prefers-color-scheme: dark)">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>${text.title}</title>
<style>
:root{color-scheme:light dark;--bg:#f3f4f7;--card:#fff;--fg:#1c2130;--muted:#656d7d;--border:#dcdfe5;--primary:#1e4fd8;--error:#c42b2b}
@media (prefers-color-scheme:dark){:root{--bg:#161a22;--card:#1e232d;--fg:#e8eaef;--muted:#9aa1ae;--border:#2e3440;--primary:#5b85f0;--error:#f07373}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:400px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px 24px}
h1{margin:0 0 12px;font-size:1.4rem;display:flex;align-items:center;gap:10px}
h1 img{width:32px;height:32px}
p{margin:0 0 12px;color:var(--muted)}
p.lead{color:var(--fg)}
label{display:block;font-weight:600;margin:16px 0 6px}
input{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--fg)}
input:focus{outline:2px solid var(--primary);outline-offset:1px}
button{margin-top:14px;width:100%;font:inherit;font-weight:600;padding:10px 12px;border:0;border-radius:10px;background:var(--primary);color:#fff;cursor:pointer}
.error{color:var(--error);font-weight:500}
</style>
</head>
<body>
<main>
<h1><img src="/favicon.svg" alt="">${text.title}</h1>
<p class="lead">${text.lead}</p>
<p>${text.how}</p>
<p>${text.devices}</p>
${error}
<form method="post" action="${JOIN_PATH}">
<label for="code">${text.label}</label>
<input id="code" name="code" autocomplete="off" autocapitalize="off" spellcheck="false" required>
<button type="submit">${text.submit}</button>
</form>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }
  });
}
