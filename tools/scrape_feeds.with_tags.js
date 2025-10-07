// tools/scrape_feeds.with_tags.js
// Fetch RSS/Atom, tag with keywords + brands, write to data/articles.json
import { writeFileSync } from "fs";
import { XMLParser } from "fast-xml-parser";

const FEEDS = [
  { name: "Retail Dive",            url: "https://www.retaildive.com/feeds/news/" },
  { name: "Fashion Dive",           url: "https://www.fashiondive.com/feeds/news/" },
  { name: "NRF News",               url: "https://nrf.com/rss.xml" },
  { name: "RetailWire",             url: "https://www.retailwire.com/feed/" },
  { name: "PYMNTS Retail",          url: "https://www.pymnts.com/category/retail/feed/" },
  { name: "Chain Store Age",        url: "https://chainstoreage.com/rss.xml" },
  { name: "Practical Ecommerce",    url: "https://www.practicalecommerce.com/feed" }
];

const KEYWORDS = [
  "ai","digital","ecommerce","supply chain","fulfillment","delivery","automation",
  "customer experience","omnichannel","sustainability","personalization","mobile",
  "analytics","inventory","logistics","payment","checkout","returns"
];

const BRANDS = [
  "Amazon","Walmart","Target","Home Depot","Costco","Kroger","CVS","Walgreens",
  "Best Buy","Lowe's","Nike","Apple","Etsy","Wayfair","DoorDash"
];

const UA = "RetailTrendsTracker/1.0 (+github actions; https://github.com/)";
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: false
});

function stripHtml(html){ return (html||"").replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim(); }
function toEpoch(s){ const t = Date.parse(s); return Number.isFinite(t) ? t : Date.now(); }
function pickAtomLink(entry){
  const link = entry?.link;
  if (!link) return "#";
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    const alt = link.find(l => ((l["@_rel"]||l.rel)!=="self") && (l["@_href"]||l.href));
    return alt ? (alt["@_href"]||alt.href) : (link[0]["@_href"]||link[0].href||"#");
  }
  return link["@_href"] || link.href || "#";
}

async function fetchText(url){
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": UA,
      "accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseFeed(xml){
  const obj = parser.parse(xml);

  // RSS
  if (obj?.rss?.channel?.item){
    const items = Array.isArray(obj.rss.channel.item) ? obj.rss.channel.item : [obj.rss.channel.item];
    return items.map(it => ({
      title: (it.title && (it.title["#text"] || it.title)) || "Untitled",
      link: typeof it.link==="string" ? it.link : (it.link?.["#text"] || it["atom:link"]?.["@_href"] || "#"),
      excerpt: stripHtml((it.description && (it.description["#text"] || it.description)) || ""),
      published: toEpoch(it.pubDate || it["dc:date"] || it["pubdate"] || Date.now())
    }));
  }

  // Atom
  if (obj?.feed?.entry){
    const entries = Array.isArray(obj.feed.entry) ? obj.feed.entry : [obj.feed.entry];
    return entries.map(e => ({
      title: (e.title && (e.title["#text"] || e.title)) || "Untitled",
      link: pickAtomLink(e),
      excerpt: stripHtml(
        (e.summary && (e.summary["#text"]||e.summary)) ||
        (e.content && (e.content["#text"]||e.content)) || ""
      ),
      published: toEpoch(e.updated || e.published || Date.now())
    }));
  }
  return [];
}

function dedupe(list){
  const seen = new Set(), out = [];
  for (const a of list){ const k=a.link || a.title; if (seen.has(k)) continue; seen.add(k); out.push(a); }
  return out;
}

function tagArticle(title, excerpt){
  const text = `${title} ${excerpt}`.toLowerCase();
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const kw = KEYWORDS.filter(k => new RegExp(`\\b${escape(k)}\\b`, "i").test(text));
  const br = BRANDS.filter(b => new RegExp(`\\b${escape(b)}\\b`, "i").test(text));
  return { keywords: kw, brands: br };
}

async function main(){
  const all = [];
  for (const f of FEEDS){
    try{
      const xml = await fetchText(f.url);
      const items = parseFeed(xml).map(x => {
        const tags = tagArticle(x.title, x.excerpt);
        return {
          id: x.link || x.title,
          title: x.title,
          link: x.link || "#",
          excerpt: x.excerpt?.slice(0, 240),
          source: f.name,
          published: x.published,
          keywords: tags.keywords,
          brands: tags.brands
        };
      });
      console.log(`[OK] ${f.name}: ${items.length} items`);
      all.push(...items);
    }catch(e){
      console.error(`[ERR] ${f.name}: ${e.message}`);
    }
  }

  let merged = dedupe(all)
    .sort((a,b)=> (b.published||0) - (a.published||0))
    .slice(0, 600);

  if (merged.length === 0) {
    merged = [{
      id: "smoke-"+Date.now(),
      title: "✅ Actions ran, but feeds returned 0 items",
      link: "#",
      excerpt: "This placeholder proves the workflow wrote data/articles.json.",
      source: "SmokeTest",
      published: Date.now(),
      keywords: ["digital"],
      brands: ["Retail"]
    }];
  }

  const payload = { generatedAt: Date.now(), items: merged };
  writeFileSync("data/articles.json", JSON.stringify(payload, null, 2));
  console.log(`Wrote data/articles.json with ${payload.items.length} items total`);
}

main().catch(e => { console.error(e); process.exit(1); });
