const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const compression = require('compression');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ---------- Enable compression & static caching ----------
app.use(compression());
app.use(express.static(path.join(__dirname), {
  maxAge: '1d',
  etag: true
}));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let listeners = 0;

function broadcastListeners() {
  io.emit('listeners', listeners);
}

// ---------- Socket.IO (Purely for Online Listeners Count) ----------
io.on('connection', (socket) => {
  listeners++;
  broadcastListeners();

  socket.on('disconnect', () => {
    listeners--;
    broadcastListeners();
  });
});

// ---------- Start ----------
server.listen(PORT, () => {
  console.log(`Ekant Raag Radio running → http://localhost:${PORT}`);
});
