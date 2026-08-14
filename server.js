const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ---------- Allowed origins ----------
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ['GET']
  }
});

const PORT = process.env.PORT || 3000;
const YT_API_KEY = process.env.YOUTUBE_API_KEY || '';

// ---------- Security: Helmet HTTP headers ----------
const isProd = process.env.NODE_ENV === 'production';

app.use(
  helmet({
    // CSP: only enforce in production — in dev it causes noisy console violations
    // from source maps, browser extensions, and YouTube iframe ad requests
    contentSecurityPolicy: isProd ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://www.youtube.com',
          'https://cdn.socket.io',
          'https://s.ytimg.com'
        ],
        frameSrc: ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
        imgSrc: ["'self'", 'https://img.youtube.com', 'https://*.ytimg.com', 'data:'],
        connectSrc: [
          "'self'",
          'https://www.googleapis.com',
          'https://cdn.socket.io',
          'https://*.google.com',
          'https://*.doubleclick.net',
          'https://*.googlevideo.com',
          'wss:',
          'ws:'
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        workerSrc: ["'self'", 'blob:'],
        upgradeInsecureRequests: []
      }
    } : false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false // Required for YouTube iframe
  })
);

// ---------- Body parsing ----------
app.use(express.json({ limit: '10kb' }));

// ---------- Compression & static caching ----------
app.use(compression());
app.use(express.static(path.join(__dirname), {
  maxAge: '1d',
  etag: true
}));

// ---------- Rate limiter: /api/* ----------
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait before trying again.' }
});

// ---------- Playlist ID validator ----------
function isValidPlaylistId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{10,50}$/.test(id);
}

// ---------- Extract playlist ID from any YouTube URL format ----------
function extractPlaylistId(raw) {
  const url = String(raw).trim().slice(0, 300);
  try {
    const parsed = new URL(url);
    const listParam = parsed.searchParams.get('list');
    if (listParam && isValidPlaylistId(listParam)) return listParam;
  } catch (_) {}
  if (isValidPlaylistId(url)) return url;
  return null;
}

// ---------- YouTube Playlist API Proxy ----------
// GET /api/playlist?url=<youtube_playlist_url_or_id>
app.get('/api/playlist', apiLimiter, async (req, res) => {
  if (!YT_API_KEY) {
    return res.status(503).json({
      error: 'YouTube API key not configured. Set YOUTUBE_API_KEY in your .env file.'
    });
  }

  const playlistId = extractPlaylistId(req.query.url || req.query.id || '');
  if (!playlistId) {
    return res.status(400).json({ error: 'Invalid or missing YouTube playlist URL.' });
  }

  try {
    const tracks = [];
    let nextPageToken = null;

    do {
      const pageParam = nextPageToken ? `&pageToken=${encodeURIComponent(nextPageToken)}` : '';
      const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(YT_API_KEY)}${pageParam}`;

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.error) {
        const status = data.error.code === 404 ? 404 : 400;
        return res.status(status).json({ error: data.error.message || 'Playlist not found or private.' });
      }

      if (!data.items || data.items.length === 0) break;

      for (const item of data.items) {
        const snippet = item.snippet;
        const videoId = snippet && snippet.resourceId && snippet.resourceId.videoId;
        if (!videoId) continue;
        if (snippet.title === 'Private video' || snippet.title === 'Deleted video') continue;

        tracks.push({
          title: String(snippet.title || 'Unknown').slice(0, 150),
          artist: String(snippet.videoOwnerChannelTitle || '').replace(/ - Topic$/, '').slice(0, 100),
          youtubeId: String(videoId).slice(0, 20)
        });

        if (tracks.length >= 200) break;
      }

      nextPageToken = data.nextPageToken || null;
    } while (nextPageToken && tracks.length < 200);

    if (tracks.length === 0) {
      return res.status(404).json({ error: 'No playable videos found in this playlist.' });
    }

    res.json({ tracks, total: tracks.length });
  } catch (err) {
    console.error('[playlist API error]', err.message);
    res.status(500).json({ error: 'Failed to fetch playlist. Please try again.' });
  }
});

// ---------- Main route ----------
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ---------- 404 handler ----------
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- Socket.IO: Online Listeners Count ----------
let listeners = 0;

function broadcastListeners() {
  io.emit('listeners', listeners);
}

io.on('connection', (socket) => {
  listeners++;
  broadcastListeners();

  socket.on('disconnect', () => {
    listeners = Math.max(0, listeners - 1);
    broadcastListeners();
  });
});

// ---------- Start ----------
server.listen(PORT, () => {
  console.log(`Ekant Raag Radio → http://localhost:${PORT}`);
  if (!YT_API_KEY) {
    console.warn('[WARN] YOUTUBE_API_KEY not set — custom playlist feature will return 503.');
  }
});

