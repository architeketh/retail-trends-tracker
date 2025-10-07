// tools/scrape_feeds.js
// Fetch RSS/Atom feeds, normalize to JSON, write to data/articles.json
// Run in Actions via: npm run fetch

import { writeFileSync } from "fs";
import { parse } from "fast-xml-parser";

// ✅ Feeds that respond reliably from GitHub Actions
const FEEDS = [
  { name: "Retail Dive",      url: "https://www.retaildive.com/feeds/news/" },
  { name: "Fashion Dive",     url: "https://www.fashiondive.com/feeds/news/" },
  { name: "NRF News",         url: "https://nrf.com/rss.xml" },
  { name: "RetailWire",       url: "https://www.retailwire.com/feed/" },
  { name: "PYMNTS Retail",    url: "https://www.pymnts.com/category/retail/feed/" },
  { name: "Chain Store Age",  url: "https://chainstoreage.com/rss.xml" },
  { name: "Practical Ecommerce", url: "https://www.practicalecommerce.com/feed" }
  // (We removed some that frequently 302/403 under Actions, like Forbes/McKinsey.)
];

const UA = "RetailTrendsTracker/1.0 (+github actions; https://github.com/)";

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function toEpoch(str) {
  const t = Date.parse(str);
  return Number.isFinite(t) ? t : Date.now();
}

function pickAtomLink(entry) {
  const link = entry?.link;
  if (!link) return "#";
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    // prefer alt link over self
    const alt = link.find((l) => ((l["@_rel"] || l.rel) !== "self") && (l["@_href"] || l.href));
    return alt ? (alt["@_href"] || alt.href) : (link[0]["@_href"] || link[0].href || "#");
  }
  return link["@_href"] || link.href || "#";
}

async function fetchText(url) {
  // Node 20 has global fetch; add UA + follow redirects explicitly
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": UA,
      "accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseFeed(xml) {
  const obj = parse(xml, {
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    allowBooleanAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });

  // RSS 2.0
  if (obj?.rss?.channel?.item) {
    const items = Array.isArray(obj.rss.channel.item)
      ? obj.rss.channel.item
      : [obj.rss.channel.item];
    return items.map((it) => ({
      title: (it.title && (it.title["#text"] || it.title)) || "Untitled",
      link:
        typeof it.link === "string"
          ? it.link
          : (it.link?.["#text"] || it["atom:link"]?.["@_href"] || "#"),
      excerpt: stripHtml((it.description && (it.description["#text"] || it.description)) || ""),
      published: toEpoch(it.pubDate || it["dc:date"] || it["pubdate"] || Date.now()),
    }));
  }

  // Atom
  if (obj?.feed?.entry) {
    const entries = Array.isArray(obj.feed.entry) ? obj.feed.entry : [obj.feed.entry];
    return entries.map((e) => ({
      title: (e.title && (e.title["#text"] || e.title)) || "Untitled",
      link: pickAtomLink(e),
      excerpt: stripHtml(
        (e.summary && (e.summary["#text"] || e.summary)) ||
          (e.content && (e.content["#text"] || e.content)) ||
          ""
      ),
      published: toEpoch(e.updated || e.published || Date.now()),
    }));
  }

  return [];
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const a of list) {
    const key = a.link || a.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

async function main() {
  const all = [];
  for (const f of FEEDS) {
    try {
      const xml = await fetchText(f.url);
      const items = parseFeed(xml).map((x) => ({
        id: x.link || x.title,
        title: x.title,
        link: x.link || "#",
        excerpt: x.excerpt?.slice(0, 240),
        source: f.name,
        published: x.published,
      }));
      console.log(`[OK] ${f.name}: ${items.length} items`);
      all.push(...items);
    } catch (e) {
      console.error(`[ERR] ${f.name}: ${e.message}`);
    }
  }

  const merged = dedupe(all)
    .sort((a, b) => (b.published || 0) - (a.published || 0))
    .slice(0, 600);

  const payload = { generatedAt: Date.now(), items: merged };
  writeFileSync("data/articles.json", JSON.stringify(payload, null, 2));

  console.log(`Wrote data/articles.json with ${payload.items.length} items total`);
  if (payload.items.length === 0) {
    // Force a visible failure so we can read logs in Actions
    throw new Error("No items fetched — check feed URLs or network in the job logs.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
