# एकान्त राग — Ekant Raag Radio 📻

> A shared ambient music radio experience built for late-night, immersive listening.

Ekant Raag Radio is a collaborative web radio player that streams a curated playlist of Indian classical-influenced, lo-fi, and ambient songs to all connected listeners simultaneously. It features real-time listener count, night mood themes, a rotating vinyl disc, starfield canvas, and a custom YouTube playlist loader.

---

## ✨ Features

- 🎵 **68-track curated playlist** — Hindi love songs, Bollywood acoustic, and ambient instrumentals
- 📡 **Live listener count** via Socket.IO WebSocket
- 🌙 **Three Night Mood Themes** — Raag Night, Aurora Night, Cosmic Night
- 🪩 **Rotating vinyl disc** with interactive 3D tilt physics and glass glare
- ✨ **Animated starfield** canvas overlay
- 💛 **Like/heart songs** locally (saved to localStorage)
- ⌨️ **Keyboard controls** — Space (play/pause), Arrow keys (prev/next)
- 📋 **Custom Playlist Mode** — paste any public YouTube playlist URL to play only those songs
- 🔒 **Security-hardened** — Helmet HTTP headers, CSP, rate limiting, input sanitization
- ⚡ **Gzip compression** and static asset caching for fast loads

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, Vanilla CSS, Vanilla JS |
| Audio | YouTube IFrame API |
| Real-time | Socket.IO v4 |
| Server | Node.js + Express |
| Security | Helmet, express-rate-limit |
| Fonts | Plus Jakarta Sans, Inter, Noto Sans Devanagari |

---

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup

`ash
# 1. Clone the repo
git clone https://github.com/your-username/ekant-raag-radio.git
cd ekant-raag-radio

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env and add your YOUTUBE_API_KEY (see below)

# 4. Start the server
npm start
# → http://localhost:3000
`

> **Important:** Use 
pm start (Node server), not VS Code Live Server. The custom playlist feature and real-time listener count require the Node.js server.

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| YOUTUBE_API_KEY | For custom playlist | YouTube Data API v3 key |
| ALLOWED_ORIGIN | Recommended in prod | Restrict Socket.IO CORS (e.g. https://your-app.onrender.com) |
| PORT | Optional | Server port (default: 3000) |
| NODE_ENV | Optional | Set to production to enable HSTS |

### Getting a YouTube Data API v3 Key (Free)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services → Library**
4. Search for **YouTube Data API v3** and click **Enable**
5. Go to **APIs & Services → Credentials → Create Credentials → API Key**
6. Copy the key and paste it as YOUTUBE_API_KEY in your .env file

The free quota is **10,000 units/day** — more than enough for normal usage.

---

## 📋 Custom Playlist Feature

Users can load any **public** YouTube playlist into the player:

1. Click the **My Playlist** button in the top-right corner
2. Paste any YouTube playlist URL:
   - https://www.youtube.com/playlist?list=PL...
   - https://www.youtube.com/watch?v=...&list=PL...
   - A bare playlist ID like PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-
3. Click **Load** — the player switches to your playlist instantly
4. Click **✕** next to the badge to return to Raag Radio

> Requires a YOUTUBE_API_KEY set in .env and the app running via 
pm start.

---

## 🚢 Deployment

This app is ready to deploy to any Node.js host (Render, Railway, Fly.io, Heroku, VPS).

### Render (Recommended — Free Tier)

1. Push your code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Build Command:** 
pm install
   - **Start Command:** 
pm start
   - **Environment:** Node
5. Add environment variables in the Render dashboard:
   - YOUTUBE_API_KEY = your key
   - ALLOWED_ORIGIN = https://your-app.onrender.com
   - NODE_ENV = production
6. Deploy 🚀

---

## 🔒 Security

| Measure | Implementation |
|---|---|
| HTTP Security Headers | Helmet middleware (CSP, X-Frame-Options, HSTS in prod) |
| CORS | Restricted to ALLOWED_ORIGIN env var in production |
| Rate Limiting | 10 API requests/minute per IP via express-rate-limit |
| Input Sanitization | Playlist ID validated with strict regex before API call |
| API Key Protection | YouTube API key stored server-side in .env, never exposed to client |
| XSS Prevention | All user-facing text set via .textContent, never .innerHTML |
| .env | Listed in .gitignore — never committed to repository |

---

## 📁 Project Structure

`
ekant-raag-radio/
├── index.html          # Main UI + HTML structure
├── player.js           # All frontend player logic (YouTube API, custom playlist, aesthetics)
├── style.css           # Full CSS design system + components
├── server.js           # Express server (Socket.IO, YouTube proxy API, security)
├── playlist.json       # 68-track curated playlist (title, artist, youtubeId)
├── .env.example        # Environment variable template
├── .gitignore          # Excludes node_modules, .env
├── package.json        # Node.js dependencies
├── bg.png              # Background artwork
├── bg-2.png            # Disc fallback / secondary artwork
└── bg-text.png         # Ekant Raag text overlay
`

---

## 📜 License

MIT — free to use, modify, and deploy.

---

*Built with ❤️ for late-night listeners.*
