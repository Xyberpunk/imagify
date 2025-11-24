# Imagify — City Image Search (Openverse + Wikimedia + Pexels)

A sleek, ranked, Top‑K image search UI. Built with Vite + React. Zero server code.
Deployed easily to **Vercel**.

## Local dev
```bash
npm install
cp .env.example .env.local
# Edit .env.local and set your Pexels key (optional):
# VITE_PEXELS_KEY=YOUR_KEY_HERE
npm run dev
```
Open the printed URL (usually http://localhost:5173).

## Deploy to Vercel
1. Create a new Vercel project from this folder (GitHub import or Vercel CLI).
2. Build settings auto-detected (Vite).
3. Add an environment variable in Vercel:
   - **Name:** `VITE_PEXELS_KEY`
   - **Value:** your Pexels API key
   - **Environment:** Production + Preview + Development
4. Deploy. That’s it.

> Note: If you don’t set the key, Imagify still works with Openverse + Wikimedia.
