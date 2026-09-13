/* ==========================================================================
   Static QA check for the lawyer site.
   Run:  node qa/check.mjs       (from the lawyer-site directory)
   No dependencies. Exits 1 if any check fails.
   ========================================================================== */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith('.html'));

const fails = [];
const warns = [];
let checks = 0;

const fail = (page, msg) => fails.push(`${page}: ${msg}`);
const warn = (page, msg) => warns.push(`${page}: ${msg}`);
const ok = () => { checks++; };

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const matchAll = (src, re) => Array.from(src.matchAll(re));

const attrValues = (src, attr) =>
  matchAll(src, new RegExp(`${attr}="([^"]*)"`, 'g')).map((m) => m[1]);

// strip <script> and <style> bodies plus comments before structural checks
const stripCode = (src) =>
  src
    .replace(/<script[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<style[\s\S]*?<\/style>/gi, '<style></style>')
    .replace(/<!--[\s\S]*?-->/g, '');

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/* ------------------------------------------------------------------ */
/* 1. Bangla dictionary covers every key used in the markup            */
/* ------------------------------------------------------------------ */
const bnSrc = read('assets/js/i18n.bn.js');
const bnKeys = new Set(matchAll(bnSrc, /^\s*'([^']+)':/gm).map((m) => m[1]));

const usedKeys = new Map(); // key -> first page seen on
for (const page of PAGES) {
  const src = read(page);
  for (const m of matchAll(src, /data-i18n(?:-html|-ph|-aria|-title|-alt)?="([^"]+)"/g)) {
    if (!usedKeys.has(m[1])) usedKeys.set(m[1], page);
  }
}

for (const [key, page] of usedKeys) {
  if (!bnKeys.has(key)) fail(page, `no Bangla string for data-i18n key "${key}"`);
  else ok();
}
for (const key of bnKeys) {
  if (!usedKeys.has(key)) warn('i18n.bn.js', `unused Bangla key "${key}"`);
}

/* ------------------------------------------------------------------ */
/* 2. Per-page structural checks                                       */
/* ------------------------------------------------------------------ */
const pageIds = new Map(); // page -> Set of ids

for (const page of PAGES) {
  const raw = read(page);
  const src = stripCode(raw);

  // --- head essentials ---
  if (!/<html lang="[a-z]{2}"/.test(raw)) fail(page, 'missing <html lang>'); else ok();
  if (!/<meta charset="utf-8">/i.test(raw)) fail(page, 'missing charset'); else ok();
  if (!/name="viewport"/.test(raw)) fail(page, 'missing viewport meta'); else ok();
  const title = raw.match(/<title>([^<]*)<\/title>/);
  if (!title || title[1].trim().length < 10) fail(page, 'missing or too-short <title>'); else ok();
  const desc = raw.match(/name="description" content="([^"]*)"/);
  if (!desc || desc[1].length < 50) fail(page, 'missing or too-short meta description'); else ok();

  // --- exactly one h1, one main ---
  const h1s = matchAll(src, /<h1[\s>]/g).length;
  if (h1s !== 1) fail(page, `expected exactly one <h1>, found ${h1s}`); else ok();
  const mains = matchAll(src, /<main[\s>]/g).length;
  if (mains !== 1) fail(page, `expected exactly one <main>, found ${mains}`); else ok();

  // --- duplicate ids ---
  const ids = attrValues(src, 'id');
  const seen = new Set(), dupes = new Set();
  for (const id of ids) (seen.has(id) ? dupes : seen).add(id);
  if (dupes.size) fail(page, `duplicate id(s): ${[...dupes].join(', ')}`); else ok();
  pageIds.set(page, seen);

  // --- tag balance ---
  const stack = [];
  for (const m of matchAll(src, /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const [, closing, tag, selfClose] = m;
    const name = tag.toLowerCase();
    if (VOID_TAGS.has(name) || selfClose === '/') continue;
    if (closing) {
      if (!stack.length) { fail(page, `stray closing </${name}>`); break; }
      const open = stack.pop();
      if (open !== name) { fail(page, `tag mismatch: <${open}> closed by </${name}>`); break; }
    } else {
      stack.push(name);
    }
  }
  if (stack.length) fail(page, `unclosed tag(s): ${stack.slice(-4).join(', ')}`); else ok();

  // --- label/for and aria-controls point at something real ---
  for (const f of attrValues(src, 'for')) {
    if (!seen.has(f)) fail(page, `label for="${f}" has no matching element`);
  }
  for (const c of attrValues(src, 'aria-controls')) {
    if (!seen.has(c)) fail(page, `aria-controls="${c}" has no matching element`);
  }
  ok();

  // --- every img/iframe/svg-as-image is described ---
  for (const m of matchAll(src, /<img\b[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) fail(page, 'an <img> has no alt attribute');
  }
  for (const m of matchAll(src, /<iframe\b[^>]*>/g)) {
    if (!/\stitle="/.test(m[0])) fail(page, 'an <iframe> has no title attribute');
  }
  ok();

  // --- interactive elements are labelled ---
  for (const m of matchAll(src, /<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = m[1];
    const text = m[2].replace(/<[^>]*>/g, '').trim();
    if (!text && !/aria-label="/.test(attrs)) {
      fail(page, 'a <button> has neither text nor aria-label');
    }
  }
  for (const m of matchAll(src, /<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = m[1];
    const text = m[2].replace(/<[^>]*>/g, '').trim();
    if (!text && !/aria-label="/.test(attrs)) {
      fail(page, `an <a href="${(attrs.match(/href="([^"]*)"/) || [, '?'])[1]}"> has neither text nor aria-label`);
    }
  }
  // every button inside a form declares its type
  for (const m of matchAll(src, /<button\b([^>]*)>/g)) {
    if (!/\stype="/.test(m[1])) fail(page, 'a <button> is missing an explicit type');
  }
  ok();

  // --- data-i18n replaces textContent, so it must not wrap inline markup ---
  // (an element holding real markup has to use data-i18n-html instead)
  {
    const re = /<([a-z]+)([^>]*\sdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = re.exec(src))) {
      if (/<[a-z]/i.test(m[4])) {
        fail(page, `data-i18n="${m[3]}" wraps inline markup that would be destroyed on language switch - use data-i18n-html`);
      }
    }
  }
  ok();

  // --- external links that open a new tab are safe ---
  for (const m of matchAll(src, /<a\b[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0])) fail(page, 'target="_blank" link without rel="noopener"');
  }
  ok();

  // --- no leftover authoring junk ---
  for (const bad of ['lorem ipsum', 'TODO:', 'FIXME', 'placeholder text', 'undefined']) {
    if (src.toLowerCase().includes(bad.toLowerCase())) fail(page, `page contains "${bad}"`);
  }
  // rendered JS mishaps - case-sensitive, whole word ("maintenance" is not NaN)
  if (/\bNaN\b/.test(src)) fail(page, 'page contains a literal "NaN"');
  ok();

  // --- unresolved HTML entity typos (& not starting a real entity) ---
  const strippedTags = src.replace(/<[^>]*>/g, ' ');
  for (const m of matchAll(strippedTags, /&(?!#\d+;|#x[0-9a-f]+;|[a-z]+;)/gi)) {
    fail(page, 'a bare "&" in text that is not an HTML entity');
    break;
  }
  ok();
}

/* ------------------------------------------------------------------ */
/* 3. Every local reference resolves                                   */
/* ------------------------------------------------------------------ */
for (const page of PAGES) {
  const raw = read(page);
  const refs = [
    ...attrValues(raw, 'href'),
    ...attrValues(raw, 'src')
  ];

  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(ref) || ref === '') continue;

    const [path, hash] = ref.split('#');
    if (path && !existsSync(join(ROOT, path))) {
      // assets/img holds optional photography slots that degrade to the
      // built-in monogram plate, so a missing file there is a warning, not a break
      if (path.startsWith('assets/img/')) {
        warn(page, `no photograph supplied at ${ref} - the monogram plate will show`);
      } else {
        fail(page, `link target does not exist: ${ref}`);
      }
      continue;
    }
    if (hash) {
      const targetPage = path || page;
      if (PAGES.includes(targetPage)) {
        const ids = pageIds.get(targetPage);
        if (ids && !ids.has(hash)) fail(page, `link "${ref}" points at an id that does not exist`);
        else ok();
      }
    } else ok();
  }

  // same-page anchors
  for (const ref of refs) {
    if (!ref.startsWith('#') || ref === '#') continue;
    const ids = pageIds.get(page);
    if (ids && !ids.has(ref.slice(1))) fail(page, `anchor "${ref}" has no matching id`);
    else ok();
  }
}

/* ------------------------------------------------------------------ */
/* 4. Scripts and styles referenced by every page exist and parse      */
/* ------------------------------------------------------------------ */
const JS_FILES = readdirSync(join(ROOT, 'assets/js')).filter((f) => f.endsWith('.js'));
for (const f of JS_FILES) {
  const src = read(join('assets/js', f));
  // crude brace/paren balance - catches a truncated or mis-edited file
  const count = (ch) => (src.match(new RegExp('\\' + ch, 'g')) || []).length;
  if (count('{') !== count('}')) fail(f, 'unbalanced { } braces');
  else if (count('(') !== count(')')) fail(f, 'unbalanced ( ) parentheses');
  else ok();
}

const css = read('assets/css/styles.css');
if ((css.match(/{/g) || []).length !== (css.match(/}/g) || []).length) {
  fail('styles.css', 'unbalanced { } braces');
} else ok();

// every class used in the HTML that looks like a component exists in the CSS
const cssClasses = new Set(matchAll(css, /\.([a-zA-Z][\w-]*)/g).map((m) => m[1]));
const IGNORE_CLASS = /^(lang-bn|nav-open|is-|has-)/;
for (const page of PAGES) {
  const src = stripCode(read(page));
  for (const list of attrValues(src, 'class')) {
    for (const cls of list.split(/\s+/).filter(Boolean)) {
      if (IGNORE_CLASS.test(cls)) continue;
      if (!cssClasses.has(cls)) warn(page, `class "${cls}" has no rule in styles.css`);
    }
  }
}
ok();

/* ------------------------------------------------------------------ */
/* 5. Site-wide consistency                                            */
/* ------------------------------------------------------------------ */
const REQUIRED_ON_EVERY_PAGE = [
  ['skip link', /class="skip-link"/],
  ['language toggle', /class="lang-toggle"/],
  ['main navigation', /class="nav-links"/],
  ['footer', /class="site-footer"/],
  ['demo disclosure', /class="demo-note"/],
  ['legal disclaimer', /data-i18n="footer\.disclaimer"/],
  ['i18n script', /assets\/js\/i18n\.bn\.js/],
  ['main script', /assets\/js\/main\.js/]
];

for (const page of PAGES) {
  const src = read(page);
  for (const [name, re] of REQUIRED_ON_EVERY_PAGE) {
    if (!re.test(src)) fail(page, `missing ${name}`); else ok();
  }
  // exactly one nav item marked as the current page
  const current = matchAll(src, /aria-current="page"/g).length;
  if (current !== 1) fail(page, `expected 1 aria-current="page", found ${current}`); else ok();
}

// the phone number and email must be identical everywhere
const PHONE = '+8801711234567';
const EMAIL = 'chamber@rezaulkarimlaw.example';
for (const page of PAGES) {
  const src = read(page);
  if (!src.includes(`tel:${PHONE}`)) fail(page, 'chamber phone number missing or inconsistent');
  else ok();
  if (!src.includes(`mailto:${EMAIL}`)) fail(page, 'chamber email missing or inconsistent');
  else ok();
}

/* ------------------------------------------------------------------ */
/* report                                                              */
/* ------------------------------------------------------------------ */
const pad = (s) => `  ${s}`;
console.log(`\nQA check - ${PAGES.length} pages, ${usedKeys.size} translation keys\n`);

const uniqueWarns = [...new Set(warns)];
if (uniqueWarns.length) {
  console.log(`Warnings (${uniqueWarns.length}):`);
  uniqueWarns.forEach((w) => console.log(pad(w)));
  console.log('');
}

if (fails.length) {
  console.log(`FAILED (${fails.length}):`);
  fails.forEach((f) => console.log(pad(f)));
  console.log('');
  process.exit(1);
}

console.log(`All ${checks} checks passed.\n`);
