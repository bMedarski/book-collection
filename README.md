# The Fantasy Shelf

A searchable, single-page catalog of a personal book collection, sourced from a Google Sheets library spreadsheet. Three tabs: **Fantasy**, **Other Books**, and **Discover**, each with its own search (title/series/author), filters, and pagination. Cards show cover, title, author, series, and publisher/year when available; opening a book shows its full detail page, including a Read/Not read toggle and a Goodreads link when present.

The Fantasy tab also has **Read** ("y"/blank) and **Goodreads** (URL) columns in the spreadsheet — the Read column seeds each book's initial read status (an in-app toggle can still override it, stored via the artifact's db capability or localStorage). The "Encyclopedias & Dictionaries" spreadsheet tab isn't loaded yet.

**Discover** suggests other English-language books by authors already on the Fantasy shelf, pulled from the Google Books API, excluding titles already owned (best-effort, matched by normalized title). Since the Fantasy shelf's author names are Cyrillic transliterations, `data/author-map.json` maps each to its real English name (built by hand — see below); native Bulgarian authors with no English editions are simply omitted from the map, so they don't get queried.

## Structure

- `data/fantasy.csv`, `data/others.csv` — raw exports of each spreadsheet tab.
- `scripts/build-books-json.js <csv> <out.json> [--read-goodreads]` — parses a CSV into JSON. The sheet's CSV export drops empty cells (even mid-row), so the parser reconstructs Series/Author/Publisher using pattern matching (ISBN/Year regex, a publisher whitelist) rather than fixed column positions. Pass `--read-goodreads` for a sheet tab that has the Read/Goodreads columns (currently only Fantasy).
- `data/author-map.json` — Bulgarian author name (as it appears in `books.json`) → real English name, for Discover's Google Books queries. Add entries by hand as new authors show up on the Fantasy shelf; omit an author entirely to skip suggestions for them.
- `scripts/build-discover.js` — reads `author-map.json`, queries the Google Books API (`inauthor:` search, English-language only) for each distinct mapped author, excludes titles already in `books.json`, dedupes across co-authors, keeps the top 8 per author by rating count, and writes `data/discover.json`. Needs `GOOGLE_BOOKS_API_KEY` in a local `.env` file (never committed — see `.gitignore`).
- `scripts/build-site.js` — reads `data/books.json` (Fantasy), `data/others.json` (Other Books), and `data/discover.json` (Discover), tags each book with a shelf-scoped id, and inlines all three into `template.html` to produce the final `index.html`.
- `index.html` — the built, self-contained page (open directly in a browser, or serve statically).

## Updating the data

1. Refresh the relevant `data/*.csv` with the current spreadsheet export.
2. `node scripts/build-books-json.js fantasy.csv books.json --read-goodreads`
   `node scripts/build-books-json.js others.csv others.json`
3. Add any new Fantasy authors to `data/author-map.json`, then `node scripts/build-discover.js` (only needed occasionally — it re-queries every mapped author, so there's no need to run it on every refresh).
4. `node scripts/build-site.js`
