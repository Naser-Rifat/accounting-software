# Chamber of Rezaul Karim — lawyer website (demo)

A bilingual (English ⇄ বাংলা) marketing website for a Bangladeshi advocate,
built as a client-facing demo. Plain static HTML, CSS and JavaScript — no build
step, no dependencies, no framework.

> **This is a demonstration.** "Advocate Rezaul Karim", the chamber, its
> clients, testimonials, case figures, phone numbers and addresses are all
> fictional. Every page carries a disclosure strip saying so. Replace the
> content before showing it as anyone's real practice.

---

## Running it

Open `index.html` directly in a browser, or serve the folder:

```bash
node qa/serve.mjs 8787      # → http://localhost:8787
```

A server is only needed for the QA browser checks; the site itself works from
the file system (language choice and form drafts use `localStorage`, which some
browsers restrict on `file://` — the code degrades quietly if so).

---

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Home — hero, practice areas, why-this-chamber, process, proof, testimonials, FAQ |
| `about.html` | Profile, education and enrolment timeline, representative matters, working rules |
| `practice-areas.html` | Eight practice areas with filters, plus indicative fees |
| `case-submission.html` | **Four-step case intake form** — the main conversion path |
| `contact.html` | Full contact details, chamber hours, two maps, short enquiry form |

### Assets

```
assets/css/styles.css     design system + every component
assets/js/i18n.bn.js      Bangla strings (449 keys)
assets/js/main.js         shared behaviour: language, nav, reveal, counters,
                          accordion, slider, filters, tabs, hours, toasts
assets/js/case-form.js    the four-step form: validation, drafts, review, submit
assets/js/contact.js      short enquiry form
qa/check.mjs              static QA suite
qa/serve.mjs              local static server for QA
```

---

## Type system — "case report"

The typography is borrowed from law reports and court records rather than from
landing-page convention. Three faces, each with one job:

| Role | Face | Used for |
| --- | --- | --- |
| Display | **Instrument Serif** 400 + italic | `h1`/`h2`, pull quotes, statistics, the brand name, fee figures |
| Body & UI | **Public Sans** 300–800 | body copy, all form and interface text, and `h3`/`h4` |
| Annotation | **IBM Plex Mono** 400–600 | eyebrows, stat labels, breadcrumbs, tags, badges, step numerals, timeline years, chamber hours, field hints, character counts, review-list keys, reference codes |

Bangla is carried by **Hind Siliguri** (body, `h3`/`h4`, and every annotation —
Plex Mono has no Bengali) and **Noto Serif Bengali** (`h1`/`h2`, pull quotes).

Three rules hold it together:

1. **The serif is rare.** Only `h1`/`h2` and genuine set pieces. `h3`/`h4` are
   functional signage and stay in the sans — which is what keeps the serif
   meaning something when it does appear.
2. **Mono does all the small print.** Every label, figure caption and piece of
   metadata. This replaces what used to be five separate wide-tracked uppercase
   sans styles.
3. **No wide-tracked uppercase sans anywhere.** It was the single strongest
   generic signal in the old design. Mono is already evenly spaced, so it needs
   no tracking to read as a label.

Instrument Serif has one weight, which is deliberate: it rules out
bold-everything headings and forces contrast to come from size and spacing.
It is also narrow and light, so the display scale runs noticeably larger than a
normal type scale — see `--fs-hero` / `--fs-h1` / `--fs-h2` in `:root`.

Two supporting details: section eyebrows are prefixed with a section mark
(`§`) instead of a decorative rule, and the chamber-hours table is set in mono
so the times align in a true column.

If you change a face, change it in `:root` (`--f-display`, `--f-body`,
`--f-mono`) **and** in the Google Fonts `<link>` on all five pages — and check
Bangla afterwards, since the `body.lang-bn` block near the top of the
stylesheet has to keep every annotation style out of a Latin-only face.

## How the two languages work

English is authored **directly in the HTML**, so the page is correct and
indexable with JavaScript disabled. `assets/js/i18n.bn.js` supplies only the
Bangla. The choice is remembered in `localStorage`.

| Attribute | Replaces |
| --- | --- |
| `data-i18n` | `textContent` |
| `data-i18n-html` | `innerHTML` — use when the string contains markup |
| `data-i18n-ph` | `placeholder` |
| `data-i18n-aria` | `aria-label` |
| `data-i18n-title` | `title` |

Two rules the QA suite enforces:

1. Every key used in the markup must exist in `i18n.bn.js`.
2. An element using plain `data-i18n` must not wrap inline markup — the swap
   sets `textContent` and would destroy it. Use `data-i18n-html` instead.

To add a string: write the English in the HTML with a `data-i18n="section.key"`
attribute, add the Bangla to `i18n.bn.js`, run the QA suite.

---

## The case submission form

Four steps — about you, your matter, what happened, review and send — with:

- per-step validation that blocks advancing and focuses the first bad field
- a live character counter with an 80-character minimum on the summary
- a past-date check on the hearing/deadline field
- **draft autosave** to `localStorage`, offered back on return. The untouched
  form is compared against a pristine snapshot, so default `<select>` values
  never trigger a phantom "unfinished draft"
- a review screen whose labels are read from the live DOM, so it re-renders
  correctly when the language is switched
- a reference number, a printable copy of the submission, and clearing of the
  saved draft on submit

**There is no backend.** Both forms simulate the network call with a short
delay and say so on screen. To make them real, replace the `setTimeout` in
`case-form.js` (search for `Demo:`) and `contact.js` with a `fetch()` to your
endpoint, and keep the validation as it is.

---

## QA

```bash
node qa/check.mjs
```

724 checks across 5 pages. It fails the build on:

- a translation key used in markup with no Bangla string
- `data-i18n` wrapping inline markup
- duplicate `id`s, mismatched or unclosed tags
- `label[for]` / `aria-controls` pointing at nothing
- a local link, script or stylesheet that does not resolve, or a `#anchor`
  with no matching element on the target page
- an `<img>` without `alt`, an `<iframe>` without `title`, a `<button>` or
  `<a>` with neither text nor `aria-label`, a `<button>` with no `type`
- `target="_blank"` without `rel="noopener"`
- a missing skip link, language toggle, footer, legal disclaimer or demo
  disclosure; more or fewer than one `aria-current="page"`, `<h1>` or `<main>`
- the chamber phone number or email differing between pages
- leftover authoring junk, unbalanced braces in CSS/JS

It warns (without failing) about unused Bangla keys and classes with no CSS
rule.

### Checked in the browser

Verified with Chrome DevTools at 1440×900 and 390×844, in both languages:
no console errors, no horizontal scroll on any page, the full form flow
end-to-end, draft save/restore, both languages round-tripping, the practice-area
filters, contact tabs, accordions, maps, chamber-hours badge and the mobile
drawer.

Bugs this pass caught and fixed, worth knowing about if you extend the site:

- `.reveal` sections were invisible without JavaScript — the animation is now
  gated behind a `.js` class set in `<head>`.
- `backdrop-filter` on the sticky header made it the containing block for the
  `position: fixed` mobile drawer, which rendered as a small box instead of a
  full-height panel. The blur is dropped while the drawer is open.
- The drawer parked off-screen with `transform` created real horizontal scroll
  that `overflow-x: hidden` on `body` cannot clip (it does not clip fixed
  elements, and moving the clip to `html` breaks `position: sticky`). The panel
  is now `display: none` once its closing transition ends.
- The scrim sat above the drawer and swallowed clicks on the close button —
  the drawer is inside the header's stacking context, so the scrim has to sit
  below it.
- `.stepper .bar` is a `<span>`; without `display: block` its height and
  `overflow` were ignored and the progress bar rendered as a tall block.

---

## Making it a real client's site

1. Replace the name, credentials, biography, timeline and matters. The demo
   name appears in the page copy, `i18n.bn.js`, the `<title>`/meta of each
   page and the JSON-LD block in `index.html`.
2. Replace `+8801711234567` and `chamber@rezaulkarimlaw.example` everywhere —
   the QA suite checks these are consistent across pages, so it will tell you
   if you miss one.
3. Save the advocate's portrait as `assets/img/advocate.jpg` (4:5 crop) - it
   is already wired into `index.html` and `about.html`, and falls back to the
   built-in monogram plate until the file exists. See `assets/img/README.md` for
   the framing spec and the rules on whose face may be used.
4. Update the two map coordinates in `contact.html` and the address strings.
5. Point the footer social links at real profiles.
6. Wire both forms to a real endpoint and remove the two demo notices plus the
   `.demo-note` strip in each page footer.
7. Replace the testimonials — and only publish client comments you hold
   written permission for.
