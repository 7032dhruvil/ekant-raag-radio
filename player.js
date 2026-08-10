(() => {
  const playBtn = document.getElementById('playBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const titleEl = document.getElementById('trackTitle');
  const artistEl = document.getElementById('trackArtist');
  const iconPlay = playBtn.querySelector('.icon-play');
  const iconPause = playBtn.querySelector('.icon-pause');
  const progressFill = document.getElementById('progressFill');
  const listenersCount = document.getElementById('listenersCount');
  const ytMusicBtn = document.getElementById('ytMusicBtn');

  let playlist = [];
  let ytPlayer = null;
  let ytReady = false;
  let joined = false;          // personal play/pause state — does not affect other visitors
  let currentState = null;     // last {index, startedAt, serverTime} from the server
  let loadedIndex = -1;
  let progressTimer = null;

  const DRIFT_TOLERANCE_S = 2.5;

  function setPlayingUI(isPlaying) {
    iconPlay.style.display = isPlaying ? 'none' : '';
    iconPause.style.display = isPlaying ? '' : 'none';
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  }

  function updateMeta(track) {
    titleEl.textContent = track.title;
    artistEl.textContent = track.artist;
    ytMusicBtn.href = `https://music.youtube.com/watch?v=${track.youtubeId}`;
  }

  function elapsedFor(state) {
    return Math.max(0, (Date.now() - state.startedAt) / 1000);
  }

  function applyState(state) {
    currentState = state;
    const track = playlist[state.index];
    if (!track) return;
    updateMeta(track);

    if (!ytReady) return; // will apply once the player is ready

    const elapsed = elapsedFor(state);

    if (loadedIndex !== state.index) {
      loadedIndex = state.index;
      if (joined) {
        ytPlayer.loadVideoById({ videoId: track.youtubeId, startSeconds: elapsed });
      } else {
        ytPlayer.cueVideoById({ videoId: track.youtubeId, startSeconds: elapsed });
      }
    } else if (joined) {
      // same track — only correct drift beyond tolerance to avoid stutter
      const local = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
      if (Math.abs(local - elapsed) > DRIFT_TOLERANCE_S) {
        ytPlayer.seekTo(elapsed, true);
      }
    }
  }

  function startProgressLoop() {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!ytReady || !currentState || !joined) return;
      const track = playlist[currentState.index];
      const duration = track?.duration || (ytPlayer.getDuration ? ytPlayer.getDuration() : 0);
      const current = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
      progressFill.style.width = duration ? `${Math.min(100, (current / duration) * 100)}%` : '0%';
    }, 500);
  }

  function join() {
    joined = true;
    if (!ytReady || !currentState) return;
    const track = playlist[currentState.index];
    const elapsed = elapsedFor(currentState);
    if (loadedIndex !== currentState.index) {
      loadedIndex = currentState.index;
      ytPlayer.loadVideoById({ videoId: track.youtubeId, startSeconds: elapsed });
    } else {
      ytPlayer.seekTo(elapsed, true);
      ytPlayer.playVideo();
    }
  }

  function leave() {
    joined = false;
    if (ytReady) ytPlayer.pauseVideo();
    setPlayingUI(false);
  }

  playBtn.addEventListener('click', () => (joined ? leave() : join()));

  // Next/prev affect the shared stream for everyone — this is one
  // communal station, not a personal queue.
  nextBtn.addEventListener('click', () => window.socket?.emit('skip', { direction: 1 }));
  prevBtn.addEventListener('click', () => window.socket?.emit('skip', { direction: -1 }));

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    if (e.code === 'Space') { e.preventDefault(); joined ? leave() : join(); }
    if (e.code === 'ArrowRight') nextBtn.click();
    if (e.code === 'ArrowLeft') prevBtn.click();
  });

  // ---------- YouTube IFrame API ----------
  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player('ytPlayer', {
      width: '200',
      height: '200',
      playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, origin: window.location.origin },
      events: {
        onReady: () => {
          ytReady = true;
          startProgressLoop();
          if (currentState) applyState(currentState);
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) setPlayingUI(true);
          if (e.data === YT.PlayerState.PAUSED) setPlayingUI(false);
          if (e.data === YT.PlayerState.ENDED) setPlayingUI(false);
        },
      },
    });
  };

  // ---------- Load catalogue, then connect to the sync server ----------
  fetch('playlist.json')
    .then((r) => r.json())
    .then((data) => {
      playlist = data.filter((t) => t.youtubeId);
      if (playlist.length === 0) {
        titleEl.textContent = 'No tracks configured yet';
        artistEl.textContent = 'Run resolve-ids.js, then redeploy';
        return;
      }
      connectSocket();
    });

  function connectSocket() {
    if (!window.SOCKET_URL || window.SOCKET_URL.includes('YOUR-SYNC-SERVER')) {
      titleEl.textContent = 'Sync server not configured';
      artistEl.textContent = 'Set window.SOCKET_URL in index.html';
      return;
    }
    const socket = io(window.SOCKET_URL, { transports: ['websocket'] });
    window.socket = socket;

    socket.on('state', applyState);
    socket.on('listeners', (n) => { listenersCount.textContent = n; });
    socket.on('connect_error', () => {
      titleEl.textContent = 'Can\u2019t reach sync server';
      artistEl.textContent = 'Check the server is deployed & running';
    });
  }
})();