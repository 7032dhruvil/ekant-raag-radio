const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ---------- Load playlist from file ----------
let playlist = [];
try {
  playlist = JSON.parse(fs.readFileSync(path.join(__dirname, 'playlist.json'), 'utf8'));
  playlist = playlist.filter(t => t && t.youtubeId);
} catch (e) {
  console.error('Could not read playlist.json:', e.message);
}
console.log(`Loaded ${playlist.length} tracks.`);

// ---------- Serve static frontend ----------
app.use(express.static(path.join(__dirname)));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ---------- Sync state ----------
// The server is the authoritative "host". It keeps track of which track
// is playing and at what timestamp it started. Every client's YouTube
// player syncs to this state.
let state = {
  index: 0,
  playing: true,
  startedAt: Date.now(),   // wall-clock ms when the current track began
  pausedAt: 0              // elapsed seconds into the track when paused
};

let listeners = 0;

function broadcastState() {
  io.emit('state', {
    ...state,
    serverTime: Date.now(),
    track: playlist[state.index] || null,
    playlistLength: playlist.length
  });
}

function broadcastListeners() {
  io.emit('listeners', listeners);
}

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  listeners++;
  broadcastListeners();

  // Send current state + full playlist to new joiner
  socket.emit('init', {
    playlist,
    state: {
      ...state,
      serverTime: Date.now(),
      track: playlist[state.index] || null,
      playlistLength: playlist.length
    }
  });

  // --- Host-reported duration (first client to report sets it) ---
  socket.on('reportDuration', (data) => {
    if (data && data.index >= 0 && data.index < playlist.length && data.duration > 0) {
      if (!playlist[data.index].duration || playlist[data.index].duration <= 0) {
        playlist[data.index].duration = data.duration;
        console.log(`Track ${data.index} duration set to ${data.duration}s`);
      }
    }
  });

  // --- Skip (next/prev) ---
  socket.on('skip', (data) => {
    const dir = data && data.direction ? data.direction : 1;
    state.index = (state.index + dir + playlist.length) % playlist.length;
    state.startedAt = Date.now();
    state.pausedAt = 0;
    state.playing = true;
    broadcastState();
  });

  // --- Play/Pause toggle (affects everyone — communal radio) ---
  socket.on('toggle', () => {
    if (state.playing) {
      // Pause: record how far into the track we are
      state.pausedAt = (Date.now() - state.startedAt) / 1000;
      state.playing = false;
    } else {
      // Resume: adjust startedAt so elapsed calculation stays correct
      state.startedAt = Date.now() - state.pausedAt * 1000;
      state.playing = true;
    }
    broadcastState();
  });

  // --- Track ended: auto-advance ---
  socket.on('trackEnded', () => {
    state.index = (state.index + 1) % playlist.length;
    state.startedAt = Date.now();
    state.pausedAt = 0;
    state.playing = true;
    broadcastState();
  });

  socket.on('disconnect', () => {
    listeners--;
    broadcastListeners();
  });
});

// ---------- Periodic sync heartbeat ----------
// Every 2 seconds, broadcast the current state so late-joiners
// and clients with drift stay in sync.
setInterval(() => {
  broadcastState();
}, 2000);

// ---------- Start ----------
server.listen(PORT, () => {
  console.log(`Ekant Raag Radio running → http://localhost:${PORT}`);
});
