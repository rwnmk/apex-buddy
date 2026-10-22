/* Apex Buddy site nav: one bar across every page, added by a single script tag so the pages'
   markup doesn't need it. Links are relative to the site root (this file's parent folder), so it
   works from any depth. The current tool gets aria-current="page". */

const ROOT = new URL('../', import.meta.url);
export const TOOLS = [
  ['comp/', 'comp', 'Team comp analyser'],
  ['solo/', 'solo', 'Solo queue picker'],
  ['rp-calc/', 'rp calc', 'RP calculator'],
  ['omgwhy/', 'omgwhy', 'OMGWHY']
];

function nav() {
  if (document.querySelector('.site-nav')) return;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('css/nav.css', ROOT).href;
  document.head.append(css);

  const here = location.pathname;
  const a = (href, text, label) => {
    const el = document.createElement('a');
    el.href = new URL(href, ROOT).href;
    el.textContent = text;
    if (label) el.title = label;
    const path = new URL(href, ROOT).pathname;
    if (href && (here === path || here.startsWith(path) || here === path.replace(/\/$/, '.html'))) el.setAttribute('aria-current', 'page');
    return el;
  };
  const bar = document.createElement('nav');
  bar.className = 'site-nav';
  bar.setAttribute('aria-label', 'Apex Buddy');
  const home = a('', 'apex buddy');
  home.className = 'site-nav-home';
  if (here === ROOT.pathname || here === ROOT.pathname + 'index.html') home.setAttribute('aria-current', 'page');
  const list = document.createElement('ul');
  for (const [href, text, label] of TOOLS) {
    const li = document.createElement('li');
    li.append(a(href, text, label));
    list.append(li);
  }
  bar.append(home, list);
  (document.querySelector('main.wrap') || document.body).prepend(bar);
}

nav();
