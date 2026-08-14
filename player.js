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
  let currentIndex = 0;
  let ytPlayer = null;
  let ytReady = false;
  let isPlaying = false;
  let socket = null;
  let progressTimer = null;

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

    // Update Like button UI based on local state
    const likedSongs = getLikedSongs();
    const isLiked = !!likedSongs[track.youtubeId];
    setLikeUI(isLiked);
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
      ytPlayer.loadVideoById(track.youtubeId);
      setPlayingUI(true);
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
          // Auto-skip on error (e.g. geo-blocked video)
          setTimeout(() => loadTrack(currentIndex + 1), 1500);
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
        playlist = data.filter(t => t && t.youtubeId);
        
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

    // 2. Connect socket for the online users count
    const url = window.SOCKET_URL || window.location.origin;
    if (url && !url.includes('YOUR-SYNC-SERVER')) {
      socket = io(url, { transports: ['websocket', 'polling'] });
      socket.on('listeners', (n) => {
        listenersCount.textContent = n;
      });
    }

    // 3. Start clock and date display
    startClock();
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

  // ---------- Start ----------
  init();
})();