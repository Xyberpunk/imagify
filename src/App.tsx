import React, { useEffect, useMemo, useState } from "react";

// Brand
const BRAND = "Pixellant Solutions";

// Pixabay API key from env
const PIXABAY_KEY = (import.meta as any).env.VITE_PIXABAY_KEY as
  | string
  | undefined;

const PIXABAY_BASE = "https://pixabay.com/api/";

/* ===========================
    FETCH: PIXABAY (photos only, by category)
=========================== */
async function fetchPixabayCategory(query: string, category: string, perPage = 24) {
  if (!PIXABAY_KEY) {
    console.warn("VITE_PIXABAY_KEY is missing; skipping Pixabay");
    return [];
  }

  const url =
    `${PIXABAY_BASE}?key=${PIXABAY_KEY}` +
    `&q=${encodeURIComponent(query)}` +
    `&image_type=photo` +
    `&category=${encodeURIComponent(category)}` +
    `&orientation=horizontal` +
    `&per_page=${perPage}` +
    `&safesearch=true` +
    `&order=popular`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay error ${res.status}`);

  const json = await res.json();
  const now = new Date().toISOString();

  return (json.hits || [])
    .map((p: any) => ({
      id: `px_${p.id}`,
      source: "pixabay",
      title: p.tags || "Image",
      image_url: p.largeImageURL || p.webformatURL || null,
      thumbnail_url: p.webformatURL || p.previewURL || null,
      width: p.imageWidth || null,
      height: p.imageHeight || null,
      views: p.views || 0,            // <-- needed for sorting
      category,                       // <-- keep category for debugging if needed
      license: "Pixabay License",
      fetched_at: now,
    }))
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
    LIGHTBOX / ZOOM PREVIEW
=========================== */
function Lightbox({
  src,
  title,
  onClose,
}: {
  src: string;
  title?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-6xl w-full max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={title || "Preview"}
          className="w-auto h-auto max-w-full max-h-[90vh] rounded-2xl shadow-2xl"
        />
      </div>
    </div>
  );
}

/* ===========================
    IMAGE CARD (image-only)
=========================== */
function ImageCard({
  item,
  onOpen,
}: {
  item: any;
  onOpen: (it: any) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group block overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 shadow hover:shadow-md transition focus:outline-none"
      aria-label="Open image preview"
    >
      <div className="aspect-video overflow-hidden bg-slate-100 dark:bg-slate-900">
        <img
          src={item.thumbnail_url}
          alt={item.title}
          className="w-full h-full object-cover group-hover:scale-[1.06] transition"
          loading="lazy"
        />
      </div>
    </button>
  );
}

/* ===========================
      MAIN APP
=========================== */
export default function App() {
  const [city, setCity] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<any | null>(null);

  // Fetch top 24 per category => merge => sort by views => top 10 shown
  const PER_CATEGORY = 24;
  const SHOW_TOP = 10;

  const query = useDebounce(city.trim(), 500);

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
        const categories = ["places", "buildings", "travel"];

        const batches = await Promise.all(
          categories.map((cat) =>
            fetchPixabayCategory(query, cat, PER_CATEGORY).catch((err) => {
              console.error(`Pixabay error (${cat}):`, err);
              return [];
            })
          )
        );

        // merge + dedupe by id
        const mergedMap = new Map<string, any>();
        for (const batch of batches) {
          for (const item of batch) {
            if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
          }
        }

        const merged = Array.from(mergedMap.values());

        // sort by views DESC and take top 10
        const topSorted = merged
          .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
          .slice(0, SHOW_TOP);

        if (!cancelled) setResults(topSorted);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setError(e.message || "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query]);

  const grid = useMemo(
    () => (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {results.map((item) => (
          <ImageCard key={item.id} item={item} onOpen={setActive} />
        ))}
      </div>
    ),
    [results]
  );

  return (
    <div className="min-h-screen">
      {/* HEADER */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-xl font-semibold">{BRAND}</div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* CITY INPUT */}
        <section>
          <label className="block text-sm mb-1">City</label>
          <input
            className="w-full rounded-2xl border px-3 py-2 bg-white/70 dark:bg-slate-800/70 shadow focus:ring-2"
            placeholder="e.g., Paris, Mumbai, Tokyo"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </section>

        {/* RESULTS */}
        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-xl text-red-700 dark:text-red-200 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-slate-500">Searching…</div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            No results yet. Try entering a city name.
          </div>
        ) : (
          grid
        )}

        <footer className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          © {new Date().getFullYear()} Pixellant Solutions
        </footer>
      </main>

      {/* LIGHTBOX */}
      {active?.image_url && (
        <Lightbox
          src={active.image_url}
          title={active.title}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
