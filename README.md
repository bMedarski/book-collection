# The Fantasy Shelf

A searchable, single-page catalog of a personal book collection, sourced from a Google Sheets library spreadsheet. Two tabs: **Fantasy** and **Other Books**, each with its own search (title/series/author), author/series/publisher filters, and pagination. Cards show cover, title, author, series, and publisher/year when available; opening a book shows its full detail page, including a Read/Not read toggle and a Goodreads link when present.

The Fantasy tab also has **Read** ("y"/blank) and **Goodreads** (URL) columns in the spreadsheet — the Read column seeds each book's initial read status (an in-app toggle can still override it, stored via the artifact's db capability or localStorage). The "Encyclopedias & Dictionaries" spreadsheet tab isn't loaded yet.

## Structure

- `data/fantasy.csv`, `data/others.csv` — raw exports of each spreadsheet tab.
- `scripts/build-books-json.js <csv> <out.json> [--read-goodreads]` — parses a CSV into JSON. The sheet's CSV export drops empty cells (even mid-row), so the parser reconstructs Series/Author/Publisher using pattern matching (ISBN/Year regex, a publisher whitelist) rather than fixed column positions. Pass `--read-goodreads` for a sheet tab that has the Read/Goodreads columns (currently only Fantasy).
- `scripts/build-site.js` — reads `data/books.json` (Fantasy) and `data/others.json` (Other Books), tags each book with a shelf-scoped id, and inlines both into `template.html` to produce the final `index.html`.
- `index.html` — the built, self-contained page (open directly in a browser, or serve statically).

## Updating the data

1. Refresh the relevant `data/*.csv` with the current spreadsheet export.
2. `node scripts/build-books-json.js fantasy.csv books.json --read-goodreads`
   `node scripts/build-books-json.js others.csv others.json`
3. `node scripts/build-site.js`
