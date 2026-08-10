(() => {
  // ---------- DOM refs ----------
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

  // ---------- State ----------
  let playlist = [];
  let ytPlayer = null;
  let ytReady = false;
  let socket = null;

  let serverState = null;   // latest state from server
  let loadedVideoId = null;  // videoId currently loaded in the iframe
  let userJoined = false;    // has user clicked play at least once?
  let progressTimer = null;

  const DRIFT_TOLERANCE_S = 1.5;

  // ---------- UI helpers ----------
  function setPlayingUI(isPlaying) {
    iconPlay.style.display = isPlaying ? 'none' : '';
    iconPause.style.display = isPlaying ? '' : 'none';
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  }

  function updateMeta(track) {
    if (!track) return;
    titleEl.textContent = track.title || 'Unknown';
    artistEl.textContent = track.artist || '';
    ytMusicBtn.href = `https://music.youtube.com/watch?v=${track.youtubeId}`;

    // Update rotating disc image
    const discImg = document.getElementById('discImg');
    if (discImg) {
      discImg.src = `https://img.youtube.com/vi/${track.youtubeId}/hqdefault.jpg`;
    }
  }

  // ---------- Elapsed time from server state ----------
  function getElapsed(st) {
    if (!st) return 0;
    if (!st.playing) return st.pausedAt || 0;
    return Math.max(0, (Date.now() - st.startedAt) / 1000);
  }

  // ---------- Apply server state to YouTube player ----------
  function applyState(st) {
    serverState = st;
    const track = st.track || (playlist[st.index]);
    if (!track) return;

    updateMeta(track);

    // Toggle spinning animation state
    const discEl = document.getElementById('playerDisc');
    if (discEl) {
      if (st.playing && userJoined) {
        discEl.classList.add('is-playing');
      } else {
        discEl.classList.remove('is-playing');
      }
    }

    if (!ytReady) return; // will be applied once onReady fires

    const targetVideoId = track.youtubeId;
    const elapsed = getElapsed(st);

    if (loadedVideoId !== targetVideoId) {
      // New track — load it
      loadedVideoId = targetVideoId;
      if (userJoined && st.playing) {
        ytPlayer.loadVideoById({ videoId: targetVideoId, startSeconds: elapsed });
      } else {
        ytPlayer.cueVideoById({ videoId: targetVideoId, startSeconds: elapsed });
        setPlayingUI(false);
      }
    } else if (userJoined) {
      // Same track — correct drift if needed
      if (st.playing) {
        const localTime = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
        const drift = Math.abs(localTime - elapsed);
        if (drift > DRIFT_TOLERANCE_S) {
          ytPlayer.seekTo(elapsed, true);
        }
        // Ensure playing
        const playerState = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
        if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) {
          ytPlayer.playVideo();
        }
      } else {
        // Paused by server
        const playerState = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
        if (playerState === YT.PlayerState.PLAYING) {
          ytPlayer.pauseVideo();
        }
        setPlayingUI(false);
      }
    } else {
      // Not joined yet — just show metadata
      setPlayingUI(false);
    }
  }

  // ---------- Progress bar loop ----------
  function startProgressLoop() {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!ytReady || !serverState) return;
      const duration = (ytPlayer.getDuration && ytPlayer.getDuration() > 0)
        ? ytPlayer.getDuration()
        : 240; // fallback 4 min
      const current = userJoined
        ? (ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0)
        : getElapsed(serverState);
      const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
      progressFill.style.width = `${pct}%`;
    }, 400);
  }

  // ---------- User actions ----------
  function joinPlayback() {
    userJoined = true;
    if (!ytReady || !serverState) return;
    const track = serverState.track || playlist[serverState.index];
    if (!track) return;

    const elapsed = getElapsed(serverState);
    if (loadedVideoId !== track.youtubeId) {
      loadedVideoId = track.youtubeId;
      ytPlayer.loadVideoById({ videoId: track.youtubeId, startSeconds: elapsed });
    } else {
      ytPlayer.seekTo(elapsed, true);
      if (serverState.playing) ytPlayer.playVideo();
    }
  }

  function leavePlayback() {
    userJoined = false;
    if (ytReady) ytPlayer.pauseVideo();
    setPlayingUI(false);
  }

  // Play/Pause button — toggles your local participation
  playBtn.addEventListener('click', () => {
    if (userJoined) {
      leavePlayback();
    } else {
      joinPlayback();
    }
  });

  // Next/Prev — affects everyone (communal radio)
  nextBtn.addEventListener('click', () => socket?.emit('skip', { direction: 1 }));
  prevBtn.addEventListener('click', () => socket?.emit('skip', { direction: -1 }));

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); userJoined ? leavePlayback() : joinPlayback(); }
    if (e.code === 'ArrowRight') nextBtn.click();
    if (e.code === 'ArrowLeft') prevBtn.click();
  });

  // ---------- YouTube IFrame API ----------
  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player('ytPlayer', {
      width: '200',
      height: '200',
      playerVars: {
        controls: 0,
        disablekb: 1,
        rel: 0,
        playsinline: 1,
        origin: window.location.origin,
        enablejsapi: 1,
        modestbranding: 1,
        iv_load_policy: 3  // hide annotations
      },
      events: {
        onReady: () => {
          ytReady = true;
          startProgressLoop();
          if (serverState) applyState(serverState);
          console.log('YouTube player ready.');
        },
        onStateChange: (e) => {
          const discEl = document.getElementById('playerDisc');
          if (e.data === YT.PlayerState.PLAYING) {
            setPlayingUI(true);
            if (discEl) discEl.classList.add('is-playing');
            // Report duration back to server so it knows track length
            const dur = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
            if (dur > 0 && serverState) {
              socket?.emit('reportDuration', { index: serverState.index, duration: dur });
            }
          }
          if (e.data === YT.PlayerState.PAUSED) {
            setPlayingUI(false);
            if (discEl) discEl.classList.remove('is-playing');
          }
          if (e.data === YT.PlayerState.ENDED) {
            setPlayingUI(false);
            if (discEl) discEl.classList.remove('is-playing');
            // Tell server to advance to next track
            socket?.emit('trackEnded');
          }
        },
        onError: (e) => {
          console.warn('YouTube player error:', e.data);
          // Auto-skip on error (e.g. geo-blocked video)
          setTimeout(() => socket?.emit('trackEnded'), 1500);
        }
      }
    });
  };

  // ---------- Connect to sync server ----------
  function connectSocket() {
    const url = window.SOCKET_URL || window.location.origin;

    if (!url || url.includes('YOUR-SYNC-SERVER')) {
      titleEl.textContent = 'Sync server not configured';
      artistEl.textContent = 'Set window.SOCKET_URL in index.html';
      return;
    }

    socket = io(url, { transports: ['websocket', 'polling'] });
    window.socket = socket;

    // Initial handshake — receive playlist + current state
    socket.on('init', (data) => {
      if (data.playlist && data.playlist.length > 0) {
        playlist = data.playlist;
        console.log(`Received ${playlist.length} tracks from server.`);
      }
      if (data.state) {
        applyState(data.state);
      }
    });

    // Ongoing state sync (heartbeat every 2s + on every change)
    socket.on('state', (data) => {
      applyState(data);
    });

    // Listener count
    socket.on('listeners', (n) => {
      listenersCount.textContent = n;
    });

    socket.on('connect', () => {
      console.log('Connected to sync server.');
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      titleEl.textContent = 'Can\u2019t reach sync server';
      artistEl.textContent = 'Check the server is running';
    });

    socket.on('disconnect', () => {
      console.warn('Disconnected from sync server.');
    });
  }

  // ---------- Start ----------
  connectSocket();
})();