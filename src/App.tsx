import React, { useEffect, useMemo, useState } from "react";

// Brand
const BRAND = "Pixellant Solutions";

// Pixabay API key from env
const PIXABAY_KEY = (import.meta as any).env.VITE_PIXABAY_KEY as
  | string
  | undefined;

/* ===========================
    FETCH: PIXABAY (places + photos only)
=========================== */
async function fetchPixabay(query: string) {
  if (!PIXABAY_KEY) {
    console.warn("VITE_PIXABAY_KEY is missing; skipping Pixabay");
    return [];
  }

  const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(
    query
  )}&image_type=photo&category=places&orientation=horizontal&per_page=40&safesearch=true&order=popular`;

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
  const [dark, setDark] = useState(false);
  const [active, setActive] = useState<any | null>(null);

  // hard limit to top 8
  const limit = 8;
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
        const px = await fetchPixabay(query).catch((err) => {
          console.error("Pixabay error:", err);
          return [];
        });

        const merged = px.slice(0, limit);

        if (!cancelled) setResults(merged);
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

  /* Dark mode toggle */
  useEffect(() => {
    const el = document.documentElement;
    dark ? el.classList.add("dark") : el.classList.remove("dark");
  }, [dark]);

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
