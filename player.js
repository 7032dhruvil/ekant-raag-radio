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
  const likeBtn = document.getElementById('likeBtn');
  const iconLikeOutline = likeBtn.querySelector('.icon-like-outline');
  const iconLikeFilled = likeBtn.querySelector('.icon-like-filled');

  // ---------- State ----------
  let playlist = [];
  let defaultPlaylist = [];  // always holds original Raag Radio tracks
  let currentIndex = 0;
  let ytPlayer = null;
  let ytReady = false;
  let isPlaying = false;
  let socket = null;
  let progressTimer = null;
  let customMode = false;

  // ---------- UI helpers ----------
  function setPlayingUI(playing) {
    isPlaying = playing;
    iconPlay.style.display = playing ? 'none' : '';
    iconPause.style.display = playing ? '' : 'none';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');

    const discEl = document.getElementById('playerDisc');
    if (discEl) {
      if (playing) {
        discEl.classList.add('is-playing');
      } else {
        discEl.classList.remove('is-playing');
      }
    }

    const playWrapper = document.getElementById('playWrapper');
    if (playWrapper) {
      if (playing) {
        playWrapper.classList.add('is-playing');
      } else {
        playWrapper.classList.remove('is-playing');
      }
    }
  }

  let consecutiveErrors = 0;

  function updateMeta(track) {
    if (!track) return;
    titleEl.textContent = track.title || 'Unknown';
    artistEl.textContent = track.artist || '';
    ytMusicBtn.href = `https://music.youtube.com/watch?v=${track.youtubeId}`;

    // Update rotating disc image with fallback to prevent 404 console errors
    const discImg = document.getElementById('discImg');
    if (discImg) {
      discImg.onerror = function () {
        this.onerror = null;
        this.src = 'bg-2.png';
      };
      discImg.src = `https://img.youtube.com/vi/${track.youtubeId}/hqdefault.jpg`;
    }

    // Update Like button UI based on local state
    const likedSongs = getLikedSongs();
    const isLiked = !!likedSongs[track.youtubeId];
    setLikeUI(isLiked);
  }

  // ---------- Aesthetic Features: Starlight, Night Mood, Vinyl Physics ----------
  function initStarlightCanvas() {
    const canvas = document.getElementById('starCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);

    for (let i = 0; i < 75; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.5 + 0.4,
        alpha: Math.random() * 0.7 + 0.3,
        dx: (Math.random() - 0.5) * 0.12,
        dy: (Math.random() - 0.5) * 0.12,
        twinkle: Math.random() * 0.02 + 0.005
      });
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);
      for (let s of stars) {
        s.x += s.dx;
        s.y += s.dy;
        if (s.x < 0) s.x = width;
        if (s.x > width) s.x = 0;
        if (s.y < 0) s.y = height;
        if (s.y > height) s.y = 0;

        s.alpha += Math.sin(Date.now() * s.twinkle) * 0.008;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.15, Math.min(0.85, s.alpha))})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(animate);
    }
    animate();
  }

  function initMoodSwitcher() {
    const moodBtn = document.getElementById('moodBtn');
    const moodLabel = document.getElementById('moodLabel');
    if (!moodBtn || !moodLabel) return;

    const moods = [
      { name: 'Raag Night', class: '' },
      { name: 'Aurora Night', class: 'mood-aurora' },
      { name: 'Cosmic Night', class: 'mood-cosmos' }
    ];
    let currentMoodIdx = 0;

    moodBtn.addEventListener('click', () => {
      if (moods[currentMoodIdx].class) {
        document.body.classList.remove(moods[currentMoodIdx].class);
      }
      currentMoodIdx = (currentMoodIdx + 1) % moods.length;
      const nextMood = moods[currentMoodIdx];
      if (nextMood.class) {
        document.body.classList.add(nextMood.class);
      }
      moodLabel.textContent = nextMood.name;
    });
  }

  function initVinylPhysics() {
    const disc = document.getElementById('playerDisc');
    if (!disc) return;
    disc.addEventListener('mousemove', (e) => {
      const rect = disc.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      disc.style.transform = `rotateX(${(-y / 8).toFixed(1)}deg) rotateY(${(x / 8).toFixed(1)}deg)`;
    }, { passive: true });
    disc.addEventListener('mouseleave', () => {
      disc.style.transform = '';
    }, { passive: true });
  }

  // ---------- Local Storage Like Helpers ----------
  function getLikedSongs() {
    try {
      return JSON.parse(localStorage.getItem('liked_songs')) || {};
    } catch (e) {
      return {};
    }
  }

  function saveLikedSongs(songs) {
    localStorage.setItem('liked_songs', JSON.stringify(songs));
  }

  function setLikeUI(isLiked) {
    if (!iconLikeOutline || !iconLikeFilled) return;
    if (isLiked) {
      iconLikeOutline.style.display = 'none';
      iconLikeFilled.style.display = '';
    } else {
      iconLikeOutline.style.display = '';
      iconLikeFilled.style.display = 'none';
    }
  }

  // ---------- Shuffle helper (Fisher-Yates) ----------
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // ---------- Load and play track ----------
  function loadTrack(index) {
    if (playlist.length === 0) return;
    
    // Boundary checks
    if (index < 0) index = playlist.length - 1;
    if (index >= playlist.length) index = 0;
    
    currentIndex = index;
    const track = playlist[currentIndex];
    updateMeta(track);

    if (ytReady && ytPlayer) {
      if (isPlaying) {
        ytPlayer.loadVideoById(track.youtubeId);
      } else {
        ytPlayer.cueVideoById(track.youtubeId);
      }
    }
  }

  function togglePlay() {
    if (!ytReady || !ytPlayer) return;
    
    const playerState = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
    if (playerState === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
      setPlayingUI(false);
    } else {
      ytPlayer.playVideo();
      setPlayingUI(true);
    }
  }

  // ---------- Progress bar loop ----------
  function startProgressLoop() {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!ytReady || !ytPlayer) return;
      const duration = (ytPlayer.getDuration && ytPlayer.getDuration() > 0)
        ? ytPlayer.getDuration()
        : 0;
      const current = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
      const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
      progressFill.style.width = `${pct}%`;
    }, 400);
  }

  // ---------- Event listeners ----------
  playBtn.addEventListener('click', togglePlay);
  
  nextBtn.addEventListener('click', () => {
    loadTrack(currentIndex + 1);
  });
  
  prevBtn.addEventListener('click', () => {
    loadTrack(currentIndex - 1);
  });

  likeBtn.addEventListener('click', () => {
    if (playlist.length === 0) return;
    const track = playlist[currentIndex];
    if (!track) return;

    const likedSongs = getLikedSongs();
    const isLiked = !likedSongs[track.youtubeId]; // Toggle state

    if (isLiked) {
      likedSongs[track.youtubeId] = true;
    } else {
      delete likedSongs[track.youtubeId];
    }

    saveLikedSongs(likedSongs);
    setLikeUI(isLiked);
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') nextBtn.click();
    if (e.code === 'ArrowLeft') prevBtn.click();
  });

  // ---------- YouTube IFrame API ----------
  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player('ytPlayer', {
      width: '200',
      height: '200',
      host: 'https://www.youtube.com',
      playerVars: {
        controls: 0,
        disablekb: 1,
        rel: 0,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        widget_referrer: window.location.origin,
        modestbranding: 1,
        iv_load_policy: 3
      },
      events: {
        onReady: () => {
          ytReady = true;
          startProgressLoop();
          // Cue first track
          if (playlist.length > 0) {
            const track = playlist[currentIndex];
            updateMeta(track);
            ytPlayer.cueVideoById(track.youtubeId);
          }
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            consecutiveErrors = 0;
            setPlayingUI(true);
          }
          if (e.data === YT.PlayerState.PAUSED) {
            setPlayingUI(false);
          }
          if (e.data === YT.PlayerState.ENDED) {
            // Auto-advance to next song locally
            loadTrack(currentIndex + 1);
          }
        },
        onError: () => {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            consecutiveErrors = 0;
            setPlayingUI(false);
            return;
          }
          if (isPlaying) {
            setTimeout(() => loadTrack(currentIndex + 1), 2000);
          }
        }
      }
    });
  };

  // ---------- Fetch Playlist and Connect Socket for listeners count ----------
  function init() {
    // 1. Fetch playlist from the served static file
    fetch('playlist.json')
      .then(response => response.json())
      .then(data => {
        defaultPlaylist = data.filter(t => t && t.youtubeId);
        playlist = defaultPlaylist.slice();
        
        // Shuffle playlist so users hear a different sequence
        shuffleArray(playlist);
        
        // If player is already ready, update details of first song
        if (ytReady && playlist.length > 0) {
          const track = playlist[currentIndex];
          updateMeta(track);
          ytPlayer.cueVideoById(track.youtubeId);
        }
      })
      .catch(() => {
        if (titleEl) titleEl.textContent = 'Playlist error';
      });

    // 2. Connect socket for the online users count (skip if on static dev server)
    const socketUrl = window.SOCKET_URL || window.location.origin;
    const isStaticServer = window.location.port === '5500' || window.location.port === '5501' || window.location.protocol === 'file:';
    if (socketUrl && !socketUrl.includes('YOUR-SYNC-SERVER') && !isStaticServer) {
      try {
        socket = io(socketUrl, {
          transports: ['websocket', 'polling'],
          reconnection: false,        // no retry — avoids console spam
          timeout: 3000
        });
        socket.on('listeners', (n) => {
          if (listenersCount) listenersCount.textContent = n;
        });
        socket.on('connect_error', () => {
          if (socket) { socket.disconnect(); socket = null; }
        });
      } catch (e) {}
    }

    // 3. Start clock and date display
    startClock();

    // 4. Initialize aesthetic features (Starlight Canvas, Night Mood Switcher, Vinyl Physics)
    initStarlightCanvas();
    initMoodSwitcher();
    initVinylPhysics();

    // 5. Initialize custom playlist UI
    initCustomPlaylistUI();
  }

  // ---------- Clock & Date Updater ----------
  function startClock() {
    const timeEl = document.getElementById('currentTime');
    const dateEl = document.getElementById('currentDate');

    function update() {
      const now = new Date();

      // Format time: HH:MM
      let hours = now.getHours();
      let minutes = now.getMinutes();
      hours = hours < 10 ? '0' + hours : hours;
      minutes = minutes < 10 ? '0' + minutes : minutes;
      if (timeEl) timeEl.textContent = `${hours}:${minutes}`;

      // Format date: DD MMM YYYY (e.g. 10 AUG 2026)
      const day = now.getDate();
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const month = months[now.getMonth()];
      const year = now.getFullYear();
      if (dateEl) dateEl.textContent = `${day} ${month} ${year}`;
    }

    update();
    setInterval(update, 1000);
  }

  // ---------- Custom Playlist Feature ----------
  function setCustomModeBadge(active, label) {
    const badge = document.getElementById('customModeBadge');
    const badgeLabel = document.getElementById('customModeLabel');
    const eyebrow = document.getElementById('playerEyebrow');
    if (!badge) return;
    if (active) {
      badge.style.display = 'inline-flex';
      if (badgeLabel && label) badgeLabel.textContent = label;
      if (eyebrow) eyebrow.textContent = 'Custom Playlist · Live';
    } else {
      badge.style.display = 'none';
      if (eyebrow) eyebrow.textContent = 'एकान्त राग · लाइव स्ट्रीम';
    }
  }

  // Parse a YouTube playlist ID from any URL format (client-side, mirrors server logic)
  function parsePlaylistId(raw) {
    const str = String(raw || '').trim().slice(0, 300);
    try {
      const parsed = new URL(str);
      const list = parsed.searchParams.get('list');
      if (list && /^[A-Za-z0-9_-]{10,50}$/.test(list)) return list;
    } catch (_) {}
    if (/^[A-Za-z0-9_-]{10,50}$/.test(str)) return str;
    return null;
  }

  async function loadCustomPlaylist(url) {
    const statusEl = document.getElementById('modalStatus');
    const loadBtn = document.getElementById('modalLoadBtn');

    function setStatus(msg, type) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className = `modal-status ${type}`;
    }

    // Quick client-side ID validation before hitting server
    const playlistId = parsePlaylistId(url);
    if (!playlistId) {
      setStatus('⚠ Please paste a valid YouTube playlist URL.', 'error');
      return;
    }

    setStatus('⏳ Loading playlist…', 'loading');
    if (loadBtn) loadBtn.disabled = true;

    try {
      const res = await fetch(`/api/playlist?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        setStatus(`⚠ ${data.error || 'Failed to load playlist.'}`, 'error');
        if (loadBtn) loadBtn.disabled = false;
        return;
      }

      if (!data.tracks || data.tracks.length === 0) {
        setStatus('⚠ No playable tracks found in this playlist.', 'error');
        if (loadBtn) loadBtn.disabled = false;
        return;
      }

      // Switch to custom mode
      customMode = true;
      playlist = data.tracks;
      currentIndex = 0;
      shuffleArray(playlist);

      setStatus(`✓ Loaded ${data.total} tracks!`, 'success');
      setCustomModeBadge(true, `${data.total} songs`);

      // Close modal after short delay
      setTimeout(() => {
        const modal = document.getElementById('customPlModal');
        if (modal) modal.style.display = 'none';
        if (loadBtn) loadBtn.disabled = false;
        setStatus('', '');
      }, 1200);

      // Load first track
      const track = playlist[0];
      updateMeta(track);
      if (ytReady && ytPlayer) {
        ytPlayer.loadVideoById(track.youtubeId);
        setPlayingUI(true);
      }
    } catch (err) {
      setStatus('⚠ Network error. Are you running via server?', 'error');
      if (loadBtn) loadBtn.disabled = false;
    }
  }

  function resetToRadio() {
    customMode = false;
    playlist = defaultPlaylist.slice();
    shuffleArray(playlist);
    currentIndex = 0;
    setCustomModeBadge(false);

    const track = playlist[0];
    if (track) {
      updateMeta(track);
      if (ytReady && ytPlayer) {
        ytPlayer.cueVideoById(track.youtubeId);
        setPlayingUI(false);
      }
    }
  }

  // ---------- Modal event wiring ----------
  function initCustomPlaylistUI() {
    const openBtn = document.getElementById('customPlBtn');
    const modal = document.getElementById('customPlModal');
    const closeBtn = document.getElementById('modalClose');
    const loadBtn = document.getElementById('modalLoadBtn');
    const input = document.getElementById('customPlInput');
    const resetBtn = document.getElementById('customModeReset');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        if (input) { input.value = ''; input.focus(); }
        const statusEl = document.getElementById('modalStatus');
        if (statusEl) { statusEl.textContent = ''; statusEl.className = 'modal-status'; }
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    }

    // Close on overlay click (outside card)
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
      }
    });

    if (loadBtn && input) {
      loadBtn.addEventListener('click', () => {
        const url = (input.value || '').trim();
        if (url) loadCustomPlaylist(url);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadBtn.click();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', resetToRadio);
    }
  }

  // ---------- Start ----------
  init();
})();