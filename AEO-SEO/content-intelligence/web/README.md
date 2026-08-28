# web/

Source of truth for the public **Growth Memo Glossary** page hosted at
<https://library.growth-memo.com/> (the site homepage).

## Files

- **`glossary.html`** — the full page (HTML/CSS/JS). Deployed by pasting it into
  the custom-code block of the beehiiv Home page (beehiiv → Website → Home).
  beehiiv does not expose that block through its API, so this one paste is
  manual and only needs to happen **once**. After that the page updates itself.
- **`glossary.json`** — the term list the page renders. **Generated, do not edit
  by hand.** Rebuilt from the published beehiiv posts by the GitHub Action.
- **`build_glossary.py`** — generator that lists published beehiiv posts and
  writes `glossary.json`, mapping each post's content tag to a category chip.

## How updates flow (automated)

```
publish post in beehiiv
        │
        ▼
scheduled GitHub Action  (.github/workflows/update-glossary.yml, hourly)
   runs build_glossary.py → rewrites glossary.json → commits if changed
        │
        ▼
jsDelivr CDN cache purged  →  glossary.html fetches glossary.json on load
        │
        ▼
new term appears on the homepage (no manual edits)
```

`glossary.html` fetches `glossary.json` from jsDelivr at page load, so once the
block is pasted into beehiiv it never needs to change again. The embedded
`FALLBACK_TERMS` array in the page is only used if that fetch fails.

## One-time setup

1. **Add the beehiiv API key** as a repo secret named `BEEHIIV_API_KEY`
   (GitHub → repo → Settings → Secrets and variables → Actions → New repository
   secret). A read-scoped beehiiv **v2 API key** is enough.
2. **Merge this to `master`.** Scheduled workflows only run from the default
   branch, so the hourly job goes live after merge. You can also trigger it any
   time from the Actions tab via **Run workflow**.
3. **Paste `glossary.html`** into the beehiiv Home page custom-code block once.

## Category mapping

Each term's `cat` comes from the post's beehiiv **content tag**:

| beehiiv content tag | glossary category (`cat`) | chip label   |
| ------------------- | ------------------------- | ------------ |
| AI Research         | `ai`                      | AI Search    |
| SEO                 | `seo`                     | SEO          |
| Behavior            | `behavior`                | Behavior     |
| Foundations         | `foundations`             | Foundations  |

A published post with **no** recognized content tag still appears in the
glossary, just without a category badge (and the generator logs a warning). Tag
your posts on publish to keep categories correct. To add a new category, update
both `TAG_TO_CAT` in `build_glossary.py` and the `CATEGORIES` array in
`glossary.html`.

## Running the generator locally

```bash
BEEHIIV_API_KEY=your_key python web/build_glossary.py --out web/glossary.json
```
