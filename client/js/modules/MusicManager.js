// MusicManager.js
const _fetch = (...args) => (window.apiFetch || window.fetch)(...args);
export class MusicManager {
    constructor(socket) {
        this.socket = socket;
        this.player = null;
        this.isApiReady = false;
        this.currentMusic = null;
        this.queue = [];
        this.localVolume = parseFloat(sessionStorage.getItem('musicVolume') || '0.5');
        this.isLocalMuted = sessionStorage.getItem('musicMuted') === 'true';
        this.timeUpdateInterval = null;
        
        this.audioPlaybackUnlocked = false;
        this.pendingAutoplay = false;
        this.autoplayBlocked = false;
        this.gestureListenersAdded = false;
        
        this.initYouTubeApi();
        this.initSocketListeners();
        this.startTimeUpdater();
        this.initGestureListeners();
        this.initVisibilityListeners();
    }

    initGestureListeners() {
        if (this.gestureListenersAdded) return;
        
        const unlockHandler = () => {
            this.unlockPlaybackFromGesture();
        };

        document.addEventListener('click', unlockHandler, { passive: true });
        document.addEventListener('touchend', unlockHandler, { passive: true });
        document.addEventListener('pointerup', unlockHandler, { passive: true });
        document.addEventListener('keydown', unlockHandler, { passive: true });
        
        this.gestureListenersAdded = true;
    }
    
    initVisibilityListeners() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (window.voiceManager && typeof window.voiceManager.unlockAudioSession === 'function') {
                    window.voiceManager.unlockAudioSession();
                }
                if (this.autoplayBlocked || this.pendingAutoplay) {
                    this.pendingAutoplay = true;
                } else {
                    if (this.currentMusic && this.currentMusic.isPlaying) {
                        this.syncPlayer();
                    }
                }
            }
        });
        
        window.addEventListener('pageshow', () => {
             if (this.currentMusic && this.currentMusic.isPlaying) {
                 this.syncPlayer();
             }
        });
    }

    unlockPlaybackFromGesture() {
        if (!this.audioPlaybackUnlocked) {
            if (window.voiceManager && typeof window.voiceManager.unlockAudioSession === 'function') {
                window.voiceManager.unlockAudioSession();
            }
            this.audioPlaybackUnlocked = true;
        }

        if (this.pendingAutoplay && this.player && typeof this.player.playVideo === 'function') {
            if (this.currentMusic && this.currentMusic.isPlaying) {
                 this.applyLocalSettings();
                 try {
                     this.player.playVideo();
                 } catch (e) {
                     console.error('Error playing video during gesture unlock:', e);
                 }
            }
        }
    }

    showAutoplayAlert() {
        if (this.isLocalMuted) return; // Don't bother user if they muted music anyway
        
        let alertEl = document.getElementById('music-autoplay-alert');
        if (!alertEl) {
            alertEl = document.createElement('div');
            alertEl.id = 'music-autoplay-alert';
            alertEl.style.cssText = 'position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: var(--classic-primary, #007bff); color: white; padding: 10px 20px; border-radius: 20px; z-index: 9999; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 14px; display: flex; align-items: center; gap: 8px; animation: slideUp 0.3s ease-out;';
            alertEl.innerHTML = '<i class="fas fa-play-circle"></i> <span>اضغط لتفعيل صوت الموسيقى</span>';
            
            alertEl.onclick = () => {
                this.unlockPlaybackFromGesture();
                this.applyLocalSettings();
                if (this.player && typeof this.player.playVideo === 'function') {
                    this.player.playVideo();
                }
            };
            document.body.appendChild(alertEl);
        }
        alertEl.style.display = 'flex';
    }

    hideAutoplayAlert() {
        const alertEl = document.getElementById('music-autoplay-alert');
        if (alertEl) {
            alertEl.style.display = 'none';
        }
    }

    startTimeUpdater() {
        if (this.timeUpdateInterval) clearInterval(this.timeUpdateInterval);
        this.timeUpdateInterval = setInterval(() => {
            this.updateTimeUI();
        }, 1000);
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    getLatestUserInfo(playedBy) {
        if (!playedBy) return null;
        if (window.state && window.state.users) {
            const liveUser = window.state.users.find(u => u.id === playedBy.userId);
            if (liveUser) {
                return {
                    ...playedBy,
                    pic: liveUser.pic,
                    username: liveUser.username,
                    topic: liveUser.topic,
                    superIcon: liveUser.superIcon
                };
            }
        }
        return playedBy;
    }

    getValidPicUrl(pic) {
        if (!pic) return '/uploads/site/default.png';
        if (pic.startsWith('http')) return pic;
        if (pic.startsWith('/')) return pic;
        return '/' + pic;
    }

    updateTimeUI() {
        const timeDisplay = document.getElementById('music-time-display');
        if (!timeDisplay || !this.currentMusic) {
            if (timeDisplay) timeDisplay.classList.add('d-none');
            return;
        }

        timeDisplay.classList.remove('d-none');
        
        let playerTime = 0;
        let playerDuration = 0;

        const isPlayerReady = this.player && typeof this.player.getCurrentTime === 'function' && typeof this.player.getDuration === 'function';
        
        let playerVideoId = null;
        try {
            if (isPlayerReady && this.player.getVideoData) {
                playerVideoId = this.player.getVideoData().video_id;
            }
        } catch (e) {}

        if (isPlayerReady && playerVideoId === this.currentMusic.videoId) {
            playerTime = this.player.getCurrentTime() || 0;
            playerDuration = this.player.getDuration() || 0;
        }

        // Manual calculation fallback
        let calcTime = this.currentMusic.seekTo || 0;
        if (this.currentMusic.isPlaying && this.currentMusic.startedAt) {
            const elapsed = (Date.now() - this.currentMusic.startedAt) / 1000;
            calcTime += elapsed;
        }

        // Use the most "advanced" time to keep things moving
        const currentTime = Math.max(playerTime, calcTime);
        const duration = playerDuration;

        const currentEl = document.getElementById('music-current-time');
        const durationEl = document.getElementById('music-duration');
        const progressEl = document.getElementById('music-progress-bar');

        if (currentEl) currentEl.textContent = this.formatTime(currentTime);
        
        // Only update duration if we have a valid one (> 0)
        if (duration > 0) {
            if (durationEl) durationEl.textContent = this.formatTime(duration);
            if (progressEl) {
                const percent = Math.min((currentTime / duration) * 100, 100);
                progressEl.style.width = `${percent}%`;
            }
        } else if (durationEl && durationEl.textContent === '00:00') {
             durationEl.textContent = '--:--';
        }
    }

    initYouTubeApi() {
        if (window.YT && window.YT.Player) {
            this.isApiReady = true;
            return;
        }
        
        // Check if script already exists
        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        const checkYT = setInterval(() => {
            if (window.YT && window.YT.Player) {
                this.isApiReady = true;
                clearInterval(checkYT);
                console.log('YouTube API Ready via interval');
                if (this.currentMusic) {
                    this.syncPlayer();
                }
            }
        }, 100);

        window.onYouTubeIframeAPIReady = () => {
            this.isApiReady = true;
            console.log('YouTube API Ready via callback');
            if (this.currentMusic) {
                this.syncPlayer();
            }
        };
    }

    async search(query) {
        try {
            const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('token')}`
                }
            });
            if (!res.ok) throw new Error('Search failed');
            return await res.json();
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }

    initSocketListeners() {
        this.socket.on('room-music:state', (state) => {
            // Guard: Only process if authenticated and in a room
            if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
                if (this.currentMusic) this.reset();
                return;
            }
            console.log('Music state received:', state);
            this.currentMusic = state;
            this.syncPlayer();
            this.updateUI();
            this.updateTimeUI();
        });

        this.socket.on('room-music:queue-update', (queue) => {
            // Guard: Only process if authenticated and in a room
            if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
                return;
            }
            console.log('Queue update received:', queue);
            this.queue = queue;
            this.updateQueueUI();
        });

        this.socket.on('room-music:error', (data) => {
            if (window.showToast) window.showToast((data && data.message) || 'خطأ في الموسيقى', 'error');
        });

        this.socket.on('connect', () => {
            if (window.state && window.state.currentRoomId && window.state.currentRoomId !== 0 && window.state.currentUser) {
                this.socket.emit('room-music:get-state', { roomId: window.state.currentRoomId });
            }
        });
    }

    createPlayer() {
        if (!this.isApiReady) return;
        
        // Guard: Prevent player creation if not logged in or not in a proper room
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
            console.warn('[MusicManager] Attempted to create player while unauthenticated or not in a room.');
            return;
        }

        // Create hidden container if not exists
        let container = document.getElementById('youtube-player-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'youtube-player-container';
            container.style.position = 'absolute';
            container.style.top = '-9999px';
            container.style.left = '-9999px';
            container.style.width = '1px';
            container.style.height = '1px';
            container.style.overflow = 'hidden';
            container.style.pointerEvents = 'none';
            document.body.appendChild(container);
        }

        // Ensure player div exists (it might have been removed by destroy())
        let playerDiv = document.getElementById('yt-player');
        if (!playerDiv) {
            playerDiv = document.createElement('div');
            playerDiv.id = 'yt-player';
            container.appendChild(playerDiv);
        }

        this.player = new YT.Player('yt-player', {
            height: '1',
            width: '1',
            videoId: this.currentMusic ? this.currentMusic.videoId : '',
            playerVars: {
                'autoplay': 1,
                'controls': 0,
                'disablekb': 1,
                'fs': 0,
                'rel': 0,
                'modestbranding': 1,
                'playsinline': 1,
                'enablejsapi': 1,
                'origin': window.location.origin
            },
            events: {
                'onReady': (event) => {
                    console.log('Player Ready');
                    this.applyLocalSettings();
                    this.syncPlayer();
                    
                    // Add allow autoplay if not present
                    const iframe = document.getElementById('yt-player');
                    if (iframe && iframe.tagName.toLowerCase() === 'iframe') {
                        let allowAttr = iframe.getAttribute('allow') || '';
                        if (!allowAttr.includes('autoplay')) {
                            iframe.setAttribute('allow', allowAttr ? allowAttr + '; autoplay' : 'autoplay');
                        }
                    }
                },
                'onStateChange': (event) => {
                    if (event.data === YT.PlayerState.PLAYING) {
                        this.pendingAutoplay = false;
                        this.autoplayBlocked = false;
                        this.hideAutoplayAlert();
                    }
                    // Handle autoplay blocks
                    if (event.data === YT.PlayerState.UNSTARTED || event.data === YT.PlayerState.CUED) {
                        if (this.currentMusic && this.currentMusic.isPlaying) {
                            // Check if it's blocked from playing
                            if (!this.audioPlaybackUnlocked) {
                                this.pendingAutoplay = true;
                                this.autoplayBlocked = true;
                                this.showAutoplayAlert();
                            } else {
                                event.target.playVideo();
                            }
                        }
                    }
                    // If video ended
                    if (event.data === YT.PlayerState.ENDED) {
                        const user = window.state.currentUser;
                        const isAdmin = false;
                        const hasMusicPerm = user && user.group && user.group.canUseRoomMusic;
                        
                        // Only the person who played it (or admin) should emit stop to keep it clean
                        if (isAdmin || hasMusicPerm) {
                            let endedVideoId = null;
                            try {
                                endedVideoId = event.target.getVideoData().video_id;
                            } catch (e) {
                                endedVideoId = this.currentMusic ? this.currentMusic.videoId : null;
                            }
                            this.stop(endedVideoId);
                        }
                    }
                },
                'onAutoplayBlocked': (event) => {
                    console.log('Autoplay blocked by browser');
                    this.pendingAutoplay = true;
                    this.autoplayBlocked = true;
                    this.showAutoplayAlert();
                },
                'onError': (e) => {
                    console.error('YouTube Player Error:', e.data);
                }
            }
        });
    }

    syncPlayer() {
        if (!this.currentMusic || !window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
            this.reset();
            return;
        }

        // Ensure timer is running
        if (!this.timeUpdateInterval) {
            this.startTimeUpdater();
        }

        if (!this.player || !this.player.loadVideoById) {
            this.createPlayer();
            return;
        }

        const videoId = this.currentMusic.videoId;
        const isPlaying = this.currentMusic.isPlaying;
        
        // Calculate current time
        let currentTime = this.currentMusic.seekTo;
        if (isPlaying) {
            const elapsed = (Date.now() - this.currentMusic.startedAt) / 1000;
            currentTime += elapsed;
        }

        let currentVideoId = null;
        try {
            if (this.player.getVideoData) {
                currentVideoId = this.player.getVideoData().video_id;
            }
        } catch (e) {}

        if (currentVideoId !== videoId) {
            this.player.loadVideoById({
                videoId: videoId,
                startSeconds: currentTime
            });
        }

        if (isPlaying) {
            const playerTime = this.player.getCurrentTime ? this.player.getCurrentTime() : 0;
            if (Math.abs(playerTime - currentTime) > 3) {
                this.player.seekTo(currentTime, true);
            }
            if (this.player.playVideo) {
                try {
                    this.player.playVideo();
                    if (typeof window.pendingAutoPlayMusic !== 'undefined') window.pendingAutoPlayMusic = false;
                } catch (e) {
                    console.error('Error playing video:', e);
                }
            }
        } else {
            // Force pause multiple times if needed to ensure it stops
            const forcePause = () => {
                if (this.player && this.player.pauseVideo) {
                    this.player.pauseVideo();
                    if (this.player.seekTo) this.player.seekTo(currentTime, true);
                }
            };
            forcePause();
            setTimeout(forcePause, 500);
            setTimeout(forcePause, 1000);
        }
        
        this.applyLocalSettings();
    }

    applyLocalSettings() {
        if (!this.player || !this.player.setVolume) return;
        
        // Use global volume if available, otherwise use local volume
        const globalVol = (this.currentMusic && typeof this.currentMusic.volume === 'number') ? this.currentMusic.volume : 100;
        const finalVolume = (globalVol / 100) * (this.localVolume * 100);

        if (this.isLocalMuted) {
            this.player.mute();
        } else {
            this.player.unMute();
            this.player.setVolume(finalVolume);
        }
    }

    setLocalVolume(vol) {
        this.localVolume = vol;
        sessionStorage.setItem('musicVolume', vol);
        this.applyLocalSettings();
    }

    setLocalMute(isMuted) {
        this.isLocalMuted = isMuted;
        sessionStorage.setItem('musicMuted', isMuted);
        this.applyLocalSettings();
    }

    updateUI() {
        const musicBtn = document.getElementById('btn-room-music');
        if (!musicBtn) return;

        const room = window.roomsData ? window.roomsData[window.state.currentRoomId] : null;
        if (room && room.allowRoomMusic === false) {
            musicBtn.classList.add('d-none');
            return;
        } else {
            musicBtn.classList.remove('d-none');
        }

        this.updateQueueUI();

        const titleEl = document.getElementById('current-music-title');

        if (this.currentMusic && this.currentMusic.playedBy) {
            musicBtn.classList.add('active');
            const p = this.getLatestUserInfo(this.currentMusic.playedBy);
            const avatarUrl = window.getAvatarUrl(p);
            
            // Priority for display name: Super Icon or Topic or Username
            let displayName = p.username;
            if (p.superIcon) displayName = "سوبر";
            else if (p.topic) displayName = p.topic;
            
            musicBtn.setAttribute('title', `تم طلبها بواسطة: ${displayName}`);
            
            // Update Title
            if (titleEl) {
                titleEl.textContent = this.currentMusic.title || 'أغنية غير معروفة';
                titleEl.classList.remove('d-none');
            }

            // Visualizer HTML
            const visualizerHtml = `
                <div class="music-visualizer-container ${this.currentMusic.isPlaying ? '' : 'd-none'}">
                    <div class="music-bar"></div>
                    <div class="music-bar"></div>
                    <div class="music-bar"></div>
                    <div class="music-bar"></div>
                </div>
            `;

            musicBtn.innerHTML = `
                <img src="${avatarUrl}" class="music-user-avatar" onerror="this.src='/uploads/site/default.png'">
                ${visualizerHtml}
            `;
            
            if (this.currentMusic.isPlaying) {
                musicBtn.classList.add('playing');
            } else {
                musicBtn.classList.remove('playing');
            }

            const infoSection = document.getElementById('current-music-info');
            const playedByContainer = document.getElementById('music-played-by-container');
            const playbackControls = document.getElementById('music-playback-controls');
            const globalVolumeContainer = document.getElementById('music-global-volume-container');
            const globalVolumeSlider = document.getElementById('music-global-volume-slider');
            const globalVolumeValue = document.getElementById('music-global-volume-value');
            
            if (infoSection) infoSection.classList.remove('d-none');
            
            // Update Global Volume UI
            if (globalVolumeContainer) {
                globalVolumeContainer.classList.remove('d-none');
                const vol = typeof this.currentMusic.volume === 'number' ? this.currentMusic.volume : 100;
                if (globalVolumeSlider) {
                    globalVolumeSlider.value = vol;
                    globalVolumeSlider.disabled = true; // Default to disabled, enable if authorized below
                }
                if (globalVolumeValue) globalVolumeValue.textContent = `${vol}%`;
            }

            if (playedByContainer) {
                let identifierHtml = '';
                if (p.superIcon) {
                    identifierHtml = `<img src="${p.superIcon}" class="super-icon-small" style="max-height: 18px; width: auto; vertical-align: middle;">`;
                } else if (p.topic) {
                    identifierHtml = `<span class="user-topic-badge ms-1" style="font-size: 0.9em; padding: 4px 8px;">${window.escapeHTML(p.topic)}</span>`;
                } else {
                    identifierHtml = `<span class="small fw-bold text-dark" style="font-size: 0.9em;">${window.escapeHTML(p.username)}</span>`;
                }

                playedByContainer.innerHTML = '';
                const wrapper = window.secureCreateElement('div', { class: 'd-flex align-items-center justify-content-center gap-3' });
                wrapper.appendChild(window.secureCreateElement('img', { 
                    src: window.getAvatarUrl(p), 
                    class: 'rounded-circle border', 
                    style: 'width: 42px; height: 42px; object-fit: cover;',
                    onerror: "this.src='/uploads/site/default.png'",
                    referrerPolicy: 'no-referrer'
                }));
                const identifierWrapper = window.secureCreateElement('div', { class: 'd-flex align-items-center' });
                identifierWrapper.innerHTML = identifierHtml; // identifierHtml is already safe/constructed
                wrapper.appendChild(identifierWrapper);
                playedByContainer.appendChild(wrapper);
            }
            
            const user = window.state.currentUser;
            const isAdmin = user && user.group && user.group.id === 1;
            const hasMusicPerm = user && user.group && user.group.canUseRoomMusic;
            const isOwner = user && this.currentMusic.playedBy && this.currentMusic.playedBy.userId === user.id;
            
            if (playbackControls && (isAdmin || hasMusicPerm || isOwner)) {
                playbackControls.classList.remove('d-none');
                
                // Enable volume slider for authorized users
                if (globalVolumeSlider) globalVolumeSlider.disabled = false;

                // Update play/pause button visibility
                const playBtn = document.getElementById('btn-music-play');
                const pauseBtn = document.getElementById('btn-music-pause');
                if (this.currentMusic.isPlaying) {
                    playBtn?.classList.add('d-none');
                    pauseBtn?.classList.remove('d-none');
                } else {
                    playBtn?.classList.remove('d-none');
                    pauseBtn?.classList.add('d-none');
                }
            }
        } else {
            musicBtn.classList.remove('active');
            musicBtn.classList.remove('playing');
            musicBtn.innerHTML = `<i class="fas fa-music"></i>`;
            musicBtn.removeAttribute('title');

            if (titleEl) {
                titleEl.classList.add('d-none');
                titleEl.textContent = '';
            }

            const globalVolumeContainer = document.getElementById('music-global-volume-container');
            if (globalVolumeContainer) globalVolumeContainer.classList.add('d-none');

            const infoSection = document.getElementById('current-music-info');
            const playbackControls = document.getElementById('music-playback-controls');
            if (infoSection) infoSection.classList.add('d-none');
            if (playbackControls) playbackControls.classList.add('d-none');
        }
    }

    updateQueueUI() {
        const queueList = document.getElementById('music-queue-list');
        const queueActions = document.getElementById('music-queue-actions');
        if (!queueList || !queueActions) return;

        if (this.queue.length === 0) {
            queueList.innerHTML = '<div class="text-center text-muted py-4 small">القائمة فارغة</div>';
        } else {
            queueList.innerHTML = this.queue.map((item, index) => {
                const p = this.getLatestUserInfo(item.playedBy);
                const picUrl = this.getValidPicUrl(p.pic);
                return `
                <div class="d-flex align-items-center gap-2 p-2 border-bottom bg-white mb-1">
                    <div class="fw-bold text-primary small">#${index + 1}</div>
                    <img src="${picUrl}" class="rounded-circle border" style="width: 24px; height: 24px; object-fit: cover;" onerror="this.src='/uploads/site/default.png'">
                    <div class="flex-grow-1 overflow-hidden">
                        <div class="small fw-bold text-truncate">${p.topic || p.username}</div>
                    </div>
                    ${this.canManageQueue() ? `
                        <button class="btn btn-link btn-sm text-danger p-0" onclick="window.musicManager.removeFromQueue('${item.id}')">
                            <i class="fas fa-times-circle"></i>
                        </button>
                    ` : ''}
                </div>
            `}).join('');
        }

        const user = window.state.currentUser;
        const isInQueue = this.queue.some(item => item.playedBy.userId === user?.id);
        const hasMusicPerm = window.state.hasPermission(user, 'canUseRoomMusic');
        const hasRequestPerm = user && user.group && user.group.canRequestMusic;

        if (hasMusicPerm || hasRequestPerm) {
            if (isInQueue) {
                queueActions.innerHTML = `
                    <button class="btn btn-danger btn-sm w-100 rounded-0" onclick="window.musicManager.leaveQueue()">
                        <i class="fas fa-sign-out-alt"></i> مغادرة قائمة الانتظار
                    </button>
                `;
            } else {
                queueActions.innerHTML = `
                    <button class="btn btn-primary btn-sm w-100 rounded-0" onclick="window.musicManager.showQueueJoinModal()">
                        <i class="fas fa-plus-circle"></i> طلب دور (إضافة أغنية)
                    </button>
                `;
            }
        } else {
            queueActions.innerHTML = '<div class="alert alert-info p-2 small mb-0">لا تملك صلاحية طلب دور</div>';
        }
    }

    canManageQueue() {
        const user = window.state.currentUser;
        if (!user) return false;
        if (false) return true;
        
        return user.group && user.group.canUseRoomMusic;
    }

    showQueueJoinModal() {
        const room = window.roomsData ? window.roomsData[window.state.currentRoomId] : null;
        const user = window.state.currentUser;
        const isAdmin = user && user.group && user.group.id === 1;
        const isModerator = room && (room.ownerId === user.id || (room.moderators || []).some(m => (typeof m === 'number' ? m === user.id : m.userId === user.id)));
        
        // Check if members can request music
        if (room && room.membersCanRequestMusic === false && !isAdmin && !(room.moderatorsCanManageMusic && isModerator)) {
            Swal.fire('خطأ', 'طلب الأغاني معطل في هذه الغرفة', 'error');
            return;
        }

        Swal.fire({
            title: 'طلب دور',
            text: 'أدخل رابط يوتيوب أو اسم الأغنية التي تود إضافتها للقائمة',
            input: 'text',
            inputPlaceholder: 'رابط يوتيوب أو اسم الأغنية...',
            showCancelButton: true,
            confirmButtonText: 'إضافة',
            cancelButtonText: 'إلغاء',
            inputValidator: (value) => {
                if (!value) return 'يرجى إدخال شيء ما';
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const query = result.value.trim();
                
                // Check if it's a direct link
                const getYouTubeId = (url) => {
                    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                    const match = url.match(regExp);
                    return (match && match[2].length === 11) ? match[2] : null;
                };
                const videoId = getYouTubeId(query);
                const isId = query.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(query);

                if (videoId || isId) {
                    const id = videoId || query;
                    try {
                        const res = await fetch(`/api/youtube/info?videoId=${id}`, {
                            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
                        });
                        const data = await res.json();
                        this.addToQueue(id, data.title || 'أغنية يوتيوب');
                    } catch (e) {
                        this.addToQueue(id, 'أغنية يوتيوب');
                    }
                    return;
                }

                const results = await this.search(query);
                if (results.length > 0) {
                    // Show selection modal
                    const options = results.map(r => `
                        <div class="d-flex align-items-center gap-2 p-2 border-bottom cursor-pointer hover-bg-light" onclick="Swal.clickConfirm(); window.musicManager.addToQueue('${r.id}', '${r.title.replace(/'/g, "\\'")}')">
                            <img src="${r.thumbnail}" style="width: 60px; height: 45px; object-fit: cover;">
                            <div class="small fw-bold text-truncate">${r.title}</div>
                        </div>
                    `).join('');

                    Swal.fire({
                        title: 'اختر الأغنية',
                        html: `<div class="text-start">${options}</div>`,
                        showCancelButton: true,
                        showConfirmButton: false,
                        cancelButtonText: 'إلغاء'
                    });
                } else {
                    Swal.fire('خطأ', 'لم يتم العثور على نتائج', 'error');
                }
            }
        });
    }

    addToQueue(videoId, title) {
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
            showToast('يجب تسجيل الدخول والدخول إلى غرفة أولاً', 'error');
            return;
        }
        this.socket.emit('room-music:add-to-queue', {
            videoId,
            title
        });
        Swal.close();
    }

    leaveQueue() {
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
        this.socket.emit('room-music:leave-queue');
    }

    removeFromQueue(queueId) {
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
        this.socket.emit('room-music:remove-from-queue', {
            queueId
        });
    }

    play(videoId, title) {
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
            showToast('يجب تسجيل الدخول والدخول إلى غرفة أولاً', 'error');
            return;
        }
        this.socket.emit('room-music:play', {
            videoId,
            title
        });
    }

    pause(currentTime) {
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
        this.socket.emit('room-music:pause', {
            currentTime
        });
    }

    resume() {
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
        this.socket.emit('room-music:resume');
    }

    stop(videoId = null) {
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
        this.socket.emit('room-music:stop', {
            videoId: videoId
        });
    }

    setGlobalVolume(volume) {
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
        this.socket.emit('room-music:set-volume', {
            volume: parseInt(volume)
        });
    }

    seek(currentTime) {
        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
        this.socket.emit('room-music:seek', {
            currentTime
        });
    }

    resetState() {
        console.log('[MusicManager] Resetting music state...');
        this.currentMusic = null;
        this.queue = [];
        
        // Clear time updater
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }

        if (this.player && typeof this.player.pauseVideo === 'function') {
            try {
                this.player.pauseVideo();
            } catch (e) {
                console.error('[MusicManager] Error during player pause:', e);
            }
        }

        this.updateUI();
        this.updateQueueUI();
        this.updateTimeUI();
    }

    destroyPlayer() {
        if (this.player) {
            try {
                if (typeof this.player.destroy === 'function') {
                    this.player.destroy();
                    console.log('[MusicManager] Player destroyed');
                }
            } catch (e) {
                console.error('[MusicManager] Error during player destruction:', e);
            }
            this.player = null;
        }

        // Remove player container from DOM
        const container = document.getElementById('youtube-player-container');
        if (container) {
            container.remove();
            console.log('[MusicManager] Player container removed from DOM');
        }
    }

    reset(options = { destroyPlayer: false }) {
        this.resetState();
        if (options && options.destroyPlayer) {
            this.destroyPlayer();
        }
        console.log('[MusicManager] Reset complete');
    }

    refreshState() {
        if (window.state && window.state.currentRoomId && window.state.currentRoomId !== 0 && window.state.currentUser) {
            this.socket.emit('room-music:get-state');
        }
    }
}
