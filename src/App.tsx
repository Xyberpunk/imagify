import React, { useEffect, useMemo, useState } from "react";

// Brand
const BRAND = "Imagify";

// Config
const OPENVERSE_ENDPOINT = "https://api.openverse.engineering/v1/images";
const WMC_SEARCH =
  "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrwhat=text&prop=imageinfo&iiprop=url|size|mime|extmetadata&origin=*&format=json&gsrlimit=50&iiurlwidth=1200&gsrsearch=";

const PEXELS_KEY = (import.meta as any)?.env?.VITE_PEXELS_KEY || "";

// Utils
function canonical(url: string | null | undefined) {
  try {
    const u = new URL(url || "");
    u.hash = "";
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
    ].forEach((p) => u.searchParams.delete(p));
    return u.toString();
  } catch (_) {
    return url || "";
  }
}

function tokenize(str: string) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function textMatchScore(text: string, terms: string[]) {
  const toks = new Set(tokenize(text));
  if (!terms || !terms.length || toks.size === 0) return 0;
  let m = 0;
  for (const t of terms) if (t && toks.has(t)) m += 1;
  return m / terms.length;
}

function licenseSafety(lic?: string) {
  const s = (lic || "").toLowerCase();
  if (!s) return 0.3;
  if (s.includes("cc0") || s.includes("public domain") || s === "pd")
    return 1.0;
  if (s.includes("cc-by") || s === "by" || s.includes("attribution"))
    return 0.9;
  if (s.includes("by-sa") || s.includes("sharealike")) return 0.8;
  if (s.includes("nc")) return 0.5;
  return 0.6; // Pexels license etc.
}

function scoreItem(
  item: any,
  cityTerms: string[],
  keywordTerms: string[],
  exactQuery: string
) {
  const title = item.title || "";
  const text = `${title} ${item.source}`;
  const width = item.width || 0,
    height = item.height || 0;
  const mp = width && height ? (width * height) / 1_000_000 : 0;
  const resScore = Math.max(0, Math.min(1, mp / 4));
  const licScore = licenseSafety(
    (item.license && item.license.type) || item.license
  );
  const cityScore = textMatchScore(text, cityTerms);
  const kwScore = textMatchScore(text, keywordTerms);
  const exact = exactQuery && title.toLowerCase().includes(exactQuery) ? 1 : 0;
  const srcPrior =
    item.source === "wikimedia"
      ? 0.08
      : item.source === "openverse"
      ? 0.06
      : 0.04;
  const final =
    0.35 * kwScore +
    0.22 * cityScore +
    0.18 * resScore +
    0.17 * licScore +
    0.06 * srcPrior +
    0.02 * exact;
  return { ...item, score: { final } };
}

function orientation(width?: number | null, height?: number | null) {
  if (!width || !height) return "unknown";
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "square";
}

// Connectors
async function fetchOpenverse(query: string) {
  const url = `${OPENVERSE_ENDPOINT}/?q=${encodeURIComponent(
    query
  )}&page_size=40`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Openverse error ${res.status}`);
  const json = await res.json();
  const now = new Date().toISOString();
  return (json.results || [])
    .map((r: any) => ({
      id: r.id || crypto.randomUUID(),
      source: "openverse",
      title: r.title || r.alt || r.source || null,
      image_url: r.url || r.thumbnail || null,
      thumbnail_url: r.thumbnail || r.url || null,
      page_url: r.foreign_landing_url || r.url || null,
      width: r.width || null,
      height: r.height || null,
      license: { type: r.license || "CC", url: r.license_url || null },
      provenance: { fetched_at: now, api: "Openverse" },
    }))
    .filter((x: any) => x.image_url);
}

async function fetchWikimedia(query: string) {
  const url = `${WMC_SEARCH}${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikimedia error ${res.status}`);
  const json = await res.json();
  const pages = json?.query?.pages || {};
  const now = new Date().toISOString();
  return Object.values(pages)
    .map((p: any) => {
      const ii = (p.imageinfo && p.imageinfo[0]) || {};
      return {
        id: `wm_${p.pageid}`,
        source: "wikimedia",
        title: p.title || null,
        image_url: ii.url || null,
        thumbnail_url: ii.thumburl || ii.url || null,
        page_url: `https://commons.wikimedia.org/?curid=${p.pageid}`,
        width: ii.width || null,
        height: ii.height || null,
        license: {
          type:
            ii.extmetadata?.LicenseShortName?.value ||
            ii.extmetadata?.License?.value ||
            "CC",
          url: ii.extmetadata?.LicenseUrl?.value || null,
        },
        provenance: { fetched_at: now, api: "Wikimedia Commons" },
      };
    })
    .filter((x: any) => x.image_url);
}

async function fetchPexels(query: string) {
  if (!PEXELS_KEY) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query
  )}&per_page=40`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) throw new Error(`Pexels error ${res.status}`);
  const json = await res.json();
  const now = new Date().toISOString();
  return (json.photos || [])
    .map((p: any) => ({
      id: `px_${p.id}`,
      source: "pexels",
      title: p.alt || (p.photographer ? `Photo by ${p.photographer}` : null),
      image_url: p.src?.large || p.src?.original || null,
      thumbnail_url: p.src?.medium || p.src?.small || null,
      page_url: p.url,
      width: p.width || null,
      height: p.height || null,
      license: {
        type: "Pexels License",
        url: "https://www.pexels.com/license/",
      },
      provenance: { fetched_at: now, api: "Pexels" },
    }))
    .filter((x: any) => x.image_url);
}

// Debounce
function useDebounce<T>(value: T, delay = 500) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// UI bits
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300 border-slate-300/70 dark:border-slate-600/60">
      {children}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={
          "w-10 h-6 flex items-center rounded-full p-1 transition " +
          (checked ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-600")
        }
      >
        <span
          className={
            "bg-white w-4 h-4 rounded-full shadow transform transition " +
            (checked ? "translate-x-4" : "")
          }
        />
      </span>
      <span>{label}</span>
    </label>
  );
}

function ImageCard({ item }: { item: any }) {
  const o = orientation(item.width, item.height);
  return (
    <a
      href={item.page_url || item.image_url || "#"}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/70 dark:bg-slate-800/60 backdrop-blur shadow-sm hover:shadow-md transition"
    >
      <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-900 dark:to-slate-800 overflow-hidden">
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt={item.title || "image"}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
            No preview
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div
            className="text-sm font-medium line-clamp-1"
            title={item.title || undefined}
          >
            {item.title || "Untitled"}
          </div>
          <Badge>{item.source}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {item.license?.type && (
            <Badge title={item.license?.url || undefined}>
              {item.license?.type}
            </Badge>
          )}
          {o !== "unknown" && <Badge>{o}</Badge>}
          {item.width && item.height && (
            <Badge>
              {item.width}×{item.height}
            </Badge>
          )}
          {typeof item.score?.final === "number" && (
            <Badge>score {item.score.final.toFixed(2)}</Badge>
          )}
        </div>
      </div>
    </a>
  );
}

export default function App() {
  const [city, setCity] = useState("");
  const [keywords, setKeywords] = useState("");
  const [limit, setLimit] = useState(24);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [useOV, setUseOV] = useState(true);
  const [useWM, setUseWM] = useState(true);
  const [usePX, setUsePX] = useState(true);
  const [dark, setDark] = useState(false);

  // dark mode class toggle
  useEffect(() => {
    const el = document.documentElement;
    if (dark) el.classList.add("dark");
    else el.classList.remove("dark");
  }, [dark]);

  const query = useMemo(
    () => [city.trim(), keywords.trim()].filter(Boolean).join(" "),
    [city, keywords]
  );
  const debouncedQuery = useDebounce(query, 500);
  const cityTerms = useMemo(() => tokenize(city), [city]);
  const keywordTerms = useMemo(() => tokenize(keywords), [keywords]);
  const exactQuery = useMemo(() => query.toLowerCase(), [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const tasks: Promise<any[]>[] = [];
        if (useOV) tasks.push(fetchOpenverse(debouncedQuery));
        if (useWM) tasks.push(fetchWikimedia(debouncedQuery));
        if (usePX) tasks.push(fetchPexels(debouncedQuery));
        const settled = await Promise.allSettled(tasks);
        const all = settled.flatMap((s) =>
          s.status === "fulfilled" ? s.value : []
        );
        const seen = new Set();
        const deduped: any[] = [];
        for (const it of all) {
          const key = canonical(
            it.image_url || it.thumbnail_url || it.page_url || it.id
          );
          if (key && !seen.has(key)) {
            seen.add(key);
            deduped.push(it);
          }
        }
        const scored = deduped.map((it) =>
          scoreItem(it, cityTerms, keywordTerms, exactQuery)
        );
        scored.sort((a, b) => (b.score?.final || 0) - (a.score?.final || 0));
        const topK = scored.slice(0, limit);
        if (!cancelled) setResults(topK);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    debouncedQuery,
    limit,
    cityTerms,
    keywordTerms,
    exactQuery,
    useOV,
    useWM,
    usePX,
  ]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 group">
            <img src="/favicon.svg" className="w-6 h-6" />
            <div className="text-xl font-semibold tracking-tight">Imagify</div>
          </a>
          <div className="ml-auto flex items-center gap-4">
            <Toggle checked={dark} onChange={setDark} label="Dark" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label className="block text-sm font-medium mb-1">City</label>
            <input
              className="w-full rounded-2xl border px-3 py-2 bg-white/70 dark:bg-slate-800/70 border-slate-300/70 dark:border-slate-600/60 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="e.g., Mumbai, Paris, Tokyo"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
         
          <div className="md:col-span-3">
            <label className="block text-sm font-medium mb-1">
              Top results
            </label>
            <select
              className="w-full rounded-2xl border px-3 py-2 bg-white/70 dark:bg-slate-800/70 border-slate-300/70 dark:border-slate-600/60 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            >
              <option value={12}>Top 12</option>
              <option value={24}>Top 24</option>
              <option value={48}>Top 48</option>
            </select>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-4">
          <Toggle checked={useOV} onChange={setUseOV} label="Openverse" />
          <Toggle checked={useWM} onChange={setUseWM} label="Wikimedia" />
          <Toggle checked={usePX} onChange={setUsePX} label="Pexels" />
          <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            PEXELS_KEY {PEXELS_KEY ? "present" : "missing"} · Limit {limit}
          </div>
        </section>

        {error && (
          <div className="p-3 rounded-xl border bg-red-50/80 dark:bg-red-900/40 text-red-700 dark:text-red-200 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-slate-500">
            Searching images…
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            No results yet. Try a city + keywords.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((r) => (
              <ImageCard key={r.id} item={r} />
            ))}
          </div>
        )}

        <footer className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          © {new Date().getFullYear()} Imagify · Sources: Openverse · Wikimedia
          Commons · Pexels
        </footer>
      </main>
    </div>
  );
}
