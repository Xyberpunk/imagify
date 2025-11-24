export default async function handler(req, res) {
  const query = req.query.q || "";

  if (!query) {
    res.status(400).json({ error: "Missing ?q=" });
    return;
  }

  try {
    const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(
      query
    )}&page_size=80`;

    const r = await fetch(url, {
      headers: {
        "User-Agent": "Imagify (Vercel Proxy)",
        Accept: "application/json",
      },
    });

    const json = await r.json();
    res.status(200).json(json);
  } catch (err) {
    res.status(500).json({ error: "Proxy failed", details: String(err) });
  }
}
