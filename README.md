# Retail Trends Tracker (GitHub Pages + Actions)

**Zero server setup.** GitHub Actions fetch RSS/Atom feeds hourly and write `data/articles.json`.
The web page reads that file and highlights *NEW* articles for ~2 hours since your last view.

## Deploy (3 steps)

1. **Create repo** on GitHub (e.g., `retail-trends-tracker`) and upload this folder.
2. **Enable Pages**: Settings → Pages → Source `Deploy from a branch`, Branch `main` / root.
3. **Enable Actions** (if prompted). The workflow runs on push and hourly.

Done. Visit: `https://<your-username>.github.io/retail-trends-tracker/`

### Customize feeds
Edit the list in `tools/scrape_feeds.js` (constant `FEEDS`). Commit to main.

### Manual refresh
Press **🔄 Manual refresh** (just re-requests `/data/articles.json`). The data itself updates hourly via Actions.

---

> Privacy: All processing happens in GitHub Actions; the published site serves a static JSON file.
