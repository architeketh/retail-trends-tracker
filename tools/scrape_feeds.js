// tools/scrape_feeds.js (TEMP SMOKE TEST)
import { writeFileSync } from "fs";

const payload = {
  generatedAt: Date.now(),
  items: [
    {
      id: "test-1",
      title: "✅ Smoke test article",
      link: "https://example.com",
      excerpt: "If you can read this, Actions wrote data/articles.json correctly.",
      source: "SmokeTest",
      published: Date.now()
    }
  ]
};

writeFileSync("data/articles.json", JSON.stringify(payload, null, 2));
console.log("Wrote data/articles.json with", payload.items.length, "item");
