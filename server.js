const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Fallback to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Load playlist
let playlist = [];
try {
  const playlistPath = path.join(__dirname, 'playlist.json');
  if (fs.existsSync(playlistPath)) {
    playlist = JSON.parse(fs.readFileSync(playlistPath, 'utf8'));
  }
} catch (e) {
  console.error("Error reading playlist.json:", e);
}

// Fallback playlist if empty or invalid
if (!Array.isArray(playlist) || playlist.length === 0) {
  playlist = [
    { title: "lofi hip hop radio", artist: "Lofi Girl", youtubeId: "jfKfPfyJRdk", duration: 180 },
    { title: "chillhop radio", artist: "Chillhop Music", youtubeId: "5yx6BWlEVcU", duration: 180 }
  ];
}

// Normalize playlist: filter out invalid entries and ensure duration is positive
playlist = playlist
  .filter(track => track && track.youtubeId)
  .map(track => ({
    title: track.title || "Unknown Title",
    artist: track.artist || "Unknown Artist",
    youtubeId: track.youtubeId,
    duration: track.duration && track.duration > 0 ? track.duration : 180 // default to 3 minutes
  }));

let streamStartTime = Date.now();
let transitionTimeout = null;

function getCurrentState() {
  const totalDuration = playlist.reduce((sum, track) => sum + track.duration, 0);
  const now = Date.now();
  let elapsed = (now - streamStartTime) / 1000;
  
  let playlistTime = elapsed % totalDuration;
  if (playlistTime < 0) playlistTime += totalDuration;
  
  let accumulated = 0;
  for (let i = 0; i < playlist.length; i++) {
    const track = playlist[i];
    if (playlistTime >= accumulated && playlistTime < accumulated + track.duration) {
      return {
        index: i,
        startedAt: now - (playlistTime - accumulated) * 1000,
        serverTime: now
      };
    }
    accumulated += track.duration;
  }
  
  return {
    index: 0,
    startedAt: now,
    serverTime: now
  };
}

function skipTrack(direction) {
  const currentState = getCurrentState();
  const currentIndex = currentState.index;
  let nextIndex = (currentIndex + direction) % playlist.length;
  if (nextIndex < 0) nextIndex = playlist.length - 1;
  
  let targetAccumulated = 0;
  for (let i = 0; i < nextIndex; i++) {
    targetAccumulated += playlist[i].duration;
  }
  
  streamStartTime = Date.now() - (targetAccumulated * 1000);
}

function scheduleNextTransition() {
  if (transitionTimeout) clearTimeout(transitionTimeout);
  
  const state = getCurrentState();
  const currentTrack = playlist[state.index];
  const elapsed = (Date.now() - state.startedAt) / 1000;
  const remaining = Math.max(0, currentTrack.duration - elapsed);
  
  transitionTimeout = setTimeout(() => {
    io.emit('state', {
      ...getCurrentState(),
      serverTime: Date.now()
    });
    scheduleNextTransition();
  }, remaining * 1000);
}

// Start scheduling
scheduleNextTransition();

let listeners = 0;

io.on('connection', (socket) => {
  listeners++;
  io.emit('listeners', listeners);
  
  // Send current state to new listener
  socket.emit('state', {
    ...getCurrentState(),
    serverTime: Date.now()
  });

  // Handle skips
  socket.on('skip', (data) => {
    skipTrack(data.direction);
    io.emit('state', {
      ...getCurrentState(),
      serverTime: Date.now()
    });
    scheduleNextTransition();
  });

  socket.on('disconnect', () => {
    listeners--;
    io.emit('listeners', listeners);
  });
});

server.listen(PORT, () => {
  console.log(`Sync server and static site running on http://localhost:${PORT}`);
});
