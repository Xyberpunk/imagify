import React, { useEffect, useMemo, useState } from "react";

// Brand
const BRAND = "Imagify";

// API endpoints
const OPENVERSE_ENDPOINT = "https://api.openverse.engineering/v1/images";
const WMC_SEARCH =
  "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrwhat=text&prop=imageinfo&iiprop=url|size|mime|extmetadata&origin=*&format=json&gsrlimit=50&iiurlwidth=1200&gsrsearch=";

// Utility – simple tokenization (may be useful later)
function tokenize(str: string) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Orientation tag helper
function orientation(width?: number | null, height?: number | null) {
  if (!width || !height) return "unknown";
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "square";
}

/* ===========================
   LANDMARK BOOST (Option 1 – strong)
   Works for ALL cities by boosting:
   - tower, bridge, palace, fort, castle, temple, mosque, church,
     cathedral, monument, statue, skyline, gate, plaza, square, harbour, harbor
   - plus strong boost if title contains the city name itself
=========================== */
function landmarkBoost(title: string, city: string): number {
  const t = title.toLowerCase();
  const c = city.toLowerCase().trim();
  let score = 0;

  if (c && t.includes(c)) score += 8; // strong city-name boost

  const keywords = [
    "tower",
    "bridge",
    "palace",
    "fort",
    "castle",
    "temple",
    "mosque",
    "church",
    "cathedral",
    "monument",
    "statue",
    "skyline",
    "gate",
    "plaza",
    "square",
    "harbour",
    "harbor",
    "bay",
    "opera house",
    "museum",
  ];

  for (const k of keywords) {
    if (t.includes(k)) score += 3; // strong boost for each landmark noun
  }

  return score;
}

/* ===========================
    FETCH: OPENVERSE
=========================== */
async function fetchOpenverse(query: string) {
  const url = `${OPENVERSE_ENDPOINT}/?q=${encodeURIComponent(
    query
  )}&page_size=80`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Openverse error ${res.status}`);

  const json = await res.json();
  const now = new Date().toISOString();

  return (json.results || [])
    .map((r: any) => ({
      id: r.id || crypto.randomUUID(),
      source: "openverse",
      title: r.title || r.alt || r.source || "Image",
      image_url: r.url || r.thumbnail || null,
      thumbnail_url: r.thumbnail || r.url || null,
      page_url: r.foreign_landing_url || r.url || null,
      width: r.width || null,
      height: r.height || null,
      license: r.license || "CC",
      fetched_at: now,
    }))
    .filter((x: any) => x.image_url);
}

/* ===========================
    FETCH: WIKIMEDIA
=========================== */
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
        title: p.title || "Image",
        image_url: ii.url || null,
        thumbnail_url: ii.thumburl || ii.url || null,
        page_url: `https://commons.wikimedia.org/?curid=${p.pageid}`,
        width: ii.width || null,
        height: ii.height || null,
        license:
          ii.extmetadata?.LicenseShortName?.value ||
          ii.extmetadata?.License?.value ||
          "CC",
        fetched_at: now,
      };
    })
    .filter((x: any) => x.image_url);
}

// Debounce helper
function useDebounce<T>(value: T, delay = 500) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ===========================
    BADGE
=========================== */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300 border-slate-300/70 dark:border-slate-600/60">
      {children}
    </span>
  );
}

/* ===========================
    IMAGE CARD
=========================== */
function ImageCard({ item }: { item: any }) {
  const o = orientation(item.width, item.height);

  return (
    <a
      href={item.page_url || item.image_url}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 shadow hover:shadow-md transition"
    >
      <div className="aspect-video overflow-hidden bg-slate-100 dark:bg-slate-900">
        <img
          src={item.thumbnail_url}
          alt={item.title}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition"
          loading="lazy"
        />
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium line-clamp-1">{item.title}</div>
          <Badge>{item.source}</Badge>
        </div>

        <div className="flex gap-2 flex-wrap text-xs">
          {o !== "unknown" && <Badge>{o}</Badge>}
          {item.width && item.height && (
            <Badge>
              {item.width}×{item.height}
            </Badge>
          )}
          {item.license && <Badge>{item.license}</Badge>}
        </div>
      </div>
    </a>
  );
}

/* ===========================
      MAIN APP
=========================== */
export default function App() {
  const [city, setCity] = useState("");
  const [limit, setLimit] = useState(24);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  const query = useDebounce(city.trim(), 500);

  // dark mode
  useEffect(() => {
    const el = document.documentElement;
    dark ? el.classList.add("dark") : el.classList.remove("dark");
  }, [dark]);

  // main fetch effect
  useEffect(() => {
    if (!query) {
      setResults([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Call both; if one fails, continue with the other.
        const [ovRes, wmRes] = await Promise.allSettled([
          fetchOpenverse(query),
          fetchWikimedia(query),
        ]);

        const ov = ovRes.status === "fulfilled" ? ovRes.value : [];
        const wm = wmRes.status === "fulfilled" ? wmRes.value : [];

        // Merge (Openverse then Wikimedia)
        const mergedRaw = [...ov, ...wm];

        // Add landmark score & original index to keep stable order otherwise
        const withScores = mergedRaw.map((item, idx) => ({
          ...item,
          _idx: idx,
          _landmark: landmarkBoost(item.title || "", city),
        }));

        // Strong landmark-first sort (option 1)
        withScores.sort((a, b) => {
          const lb = b._landmark - a._landmark;
          if (lb !== 0) return lb;
          return a._idx - b._idx; // keep original order when tie
        });

        const final = withScores.slice(0, limit).map(({ _idx, _landmark, ...rest }) => rest);

        if (!cancelled) setResults(final);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setError(e?.message || "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, limit, city]);

  return (
    <div className="min-h-screen">
      {/* HEADER */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-xl font-semibold">{BRAND}</div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <span>Dark</span>
            <input
              type="checkbox"
              checked={dark}
              onChange={(e) => setDark(e.target.checked)}
            />
          </label>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* SEARCH BAR */}
        <section className="grid grid-cols-1 md:grid-cols-9 gap-4 items-end">
          <div className="md:col-span-6">
            <label className="block text-sm mb-1">City</label>
            <input
              className="w-full rounded-2xl border px-3 py-2 bg-white/70 dark:bg-slate-800/70 shadow focus:ring-2 focus:ring-indigo-400 outline-none"
              placeholder="e.g., Paris, Mumbai, Tokyo"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm mb-1">Top results</label>
            <select
              className="w-full rounded-2xl border px-3 py-2 bg-white/70 dark:bg-slate-800/70 shadow focus:ring-2 focus:ring-indigo-400 outline-none"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            >
              <option value={12}>Top 12</option>
              <option value={24}>Top 24</option>
              <option value={48}>Top 48</option>
            </select>
          </div>
        </section>

        {/* STATUS / ERRORS */}
        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-xl text-red-700 dark:text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* RESULTS */}
        {loading ? (
          <div className="py-16 text-center text-slate-500">Searching…</div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            No results yet. Try entering a city name.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((item) => (
              <ImageCard key={item.id} item={item} />
            ))}
          </div>
        )}

        <footer className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          © {new Date().getFullYear()} Imagify · Sources: Openverse · Wikimedia
          Commons
        </footer>
      </main>
    </div>
  );
}
