import { ui, showToast, shakeElement } from './modules/ui.js?v=3';
import * as state from './modules/state.js?v=3';
import { PrivateChatManager } from './modules/PrivateChatManager.js?v=20260730-presence-fix-v1';
import { PrivateCallManager } from './modules/PrivateCallManager.js';
import { VoiceManager } from './modules/voice/VoiceManager.js?v=20260730-dup-session-fix-v2';
import { MusicManager } from './modules/MusicManager.js?v=20260718-ios-music-1';

window.togglePasswordVisibility = function(button) {
  if (!button || !button.parentElement) return;
  const input = button.parentElement.querySelector('input[type="password"], input[type="text"]');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    button.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    button.innerHTML = '<i class="fas fa-eye"></i>';
  }
};

window.toggleHiddenMode = function(button) {
  if (!button) return;
  button.classList.add('pulse');
  setTimeout(() => button.classList.remove('pulse'), 400);

  const hiddenInput = document.getElementById('login-hidden-input');
  if (hiddenInput) {
    const isHidden = hiddenInput.value === 'true';
    const nextHidden = !isHidden;
    hiddenInput.value = nextHidden ? 'true' : 'false';
    if (nextHidden) {
      button.classList.add('hidden-active');
    } else {
      button.classList.remove('hidden-active');
    }
  }
};



var updateUsersListRAF = null;
var pendingUsersPayload = null;
var lastUsersPayloadString = null;
var isLoggingOut = false;
window.isLoggingOut = false;

var profileUser = null;
window.profileUser = null;
var presenceUsersMap = new Map();
var presenceUsersVersion = 0;
var lastActivityEmit = 0;
var lastRealActivityAt = Date.now();
var presenceIdleSent = false;
var publicMessageQueue = [];
var publicMessageRAF = null;
var currentAddonMode = 'gift';

function isSafeAdminAdUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function getVisibleViewportHeight() {
  const isAndroid = /android/i.test(navigator.userAgent);
  if (isAndroid && window.visualViewport && window.visualViewport.height) {
    return window.visualViewport.height;
  }
  return window.innerHeight;
}

let lastMeasuredViewportHeight = -1;
let syncAnimationFrameId = null;

function triggerViewportSync() {
  if (syncAnimationFrameId) {
    cancelAnimationFrame(syncAnimationFrameId);
  }
  syncAnimationFrameId = requestAnimationFrame(() => {
    syncAnimationFrameId = null;
    const currentHeight = getVisibleViewportHeight();
    if (Math.abs(currentHeight - lastMeasuredViewportHeight) > 0.5) {
      syncChatViewportHeight();
    }
  });
}

function scheduleDelayedViewportSync() {
  triggerViewportSync();
  [100, 300, 700].forEach((delay) => {
    setTimeout(triggerViewportSync, delay);
  });
}

window.scheduleDelayedViewportSync = scheduleDelayedViewportSync;

function syncChatViewportHeight() {
  const visibleHeight = getVisibleViewportHeight();
  lastMeasuredViewportHeight = visibleHeight;
  document.documentElement.style.setProperty(
    '--chat-viewport-height',
    `${Math.round(visibleHeight)}px`
  );
  
  if (typeof applyUserFontSize === 'function') {
    requestAnimationFrame(() => applyUserFontSize());
  }
}

const isAndroid = /android/i.test(navigator.userAgent);

if (!window.__viewportHeightSyncInstalled) {
  window.__viewportHeightSyncInstalled = true;
  syncChatViewportHeight();
  window.addEventListener('resize', triggerViewportSync, { passive: true });
  window.addEventListener('orientationchange', triggerViewportSync, { passive: true });

  if (isAndroid) {
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', triggerViewportSync, { passive: true });
    }
    window.addEventListener('focusin', scheduleDelayedViewportSync, { passive: true });
    window.addEventListener('focusout', scheduleDelayedViewportSync, { passive: true });
  }
}

// Sidebar Logic
var loadedTabs = window.loadedTabs || {
  users: false,
  private: false,
  rooms: false,
  wall: false,
  settings: false,
  games: false
};
window.loadedTabs = loadedTabs;

window.showToast = showToast;

window.toggleSettingsGroup = (header) => {
  const accordion = header.closest('.settings-group-accordion');
  if (!accordion) return;
  const isExpanded = accordion.classList.toggle('expanded');
  header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
};

window.isNotificationSoundsMuted = () => {
  if (localStorage.getItem('muteNotificationSounds') === 'true') return true;
  if (typeof state !== 'undefined' && state?.currentUser && state.currentUser.muteNotificationSounds === true) return true;
  return false;
};

window.isChatAudioAllowed = () => {
  if (typeof state === 'undefined' || !state.currentUser) return false;
  if (typeof ui !== 'undefined' && ui.loginOverlay && !ui.loginOverlay.classList.contains('d-none')) return false;
  if (window.isNotificationSoundsMuted && window.isNotificationSoundsMuted()) return false;
  return true;
};

window.profileSoundManager = {
  initialized: false,
  unlocked: false,
  likeAudio: null,
  alertAudio: null,
  effectAudios: {},
  unlockListenersAttached: false,
  
  init() {
    // Strictly prevent initializing sounds if user is not logged in or still on login interface
    if (typeof state === 'undefined' || !state || !state.currentUser) return;
    if (typeof ui !== 'undefined' && ui.loginOverlay && !ui.loginOverlay.classList.contains('d-none')) return;
    if (this.initialized) return;

    this.likeAudio = new Audio('/sounds/like.mp3');
    this.alertAudio = new Audio('/sounds/alert.mp3');
    this.effectAudios = {
      '/sounds/kiss.mp3': new Audio('/sounds/kiss.mp3'),
      '/sounds/hug.mp3': new Audio('/sounds/hug.mp3'),
      '/sounds/slap.mp3': new Audio('/sounds/slap.mp3'),
      '/sounds/clap.mp3': new Audio('/sounds/clap.mp3')
    };
    // Preload audio safely without playing
    this.likeAudio.preload = 'auto';
    this.likeAudio.load();
    this.alertAudio.preload = 'auto';
    this.alertAudio.load();
    Object.values(this.effectAudios).forEach(a => {
      a.preload = 'auto';
      a.load();
    });
    this.initialized = true;

    // Attach unlock events once
    if (!this.unlockListenersAttached) {
      this.unlockListenersAttached = true;
      const unlockFn = () => this.unlock();
      ['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
        document.addEventListener(evt, unlockFn, { once: true, passive: true });
      });
    }
  },

  unlock() {
    if (this.unlocked) return;
    try {
      // Resume Web Audio AudioContext safely without triggering real audio files
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!window.__soundUnlockAudioContext) {
          window.__soundUnlockAudioContext = new AudioCtx();
        }
        if (window.__soundUnlockAudioContext.state === 'suspended') {
          window.__soundUnlockAudioContext.resume().catch(() => {});
        }
      }
      this.unlocked = true;
    } catch (e) {
      // Ignore
    }
  },

  playLike() {
    if (!window.isChatAudioAllowed()) return;
    if (!this.initialized) this.init();
    try {
      if (this.likeAudio) {
        this.likeAudio.currentTime = 0;
        this.likeAudio.loop = false;
        this.likeAudio.play().catch(e => {
          // Silent swallow for browser autoplay policies
        });
      }
    } catch (e) {
      // Ignore
    }
  },

  playAlert() {
    if (!window.isChatAudioAllowed()) return;
    if (!this.initialized) this.init();
    try {
      if (this.alertAudio) {
        this.alertAudio.currentTime = 0;
        this.alertAudio.loop = false;
        this.alertAudio.play().catch(e => {
          // Silent swallow for browser autoplay policies
        });
      }
    } catch (e) {
      // Ignore
    }
  }
};

const initDomContentLoadedTasks = () => {
  // Sound initialization deferred until user logs in

  // Handle session expired parameter (error=401)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('error') === '401') {
    setTimeout(() => {
      Swal.fire({
        title: 'انتهت الجلسة',
        text: 'انتهت صلاحية جلستك أو لم تقم بتسجيل الدخول بعد. يرجى تسجيل الدخول من جديد.',
        icon: 'warning',
        confirmButtonText: 'حسناً',
        customClass: {
          confirmButton: 'btn btn-primary px-4'
        },
        buttonsStyling: false
      });
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }, 500);
  }

  // Cache badges on page load to eliminate loading delay in user profile
  fetch('/api/settings/badges')
    .then(res => res.json())
    .then(badgeSettings => {
      window.badgeSettings = badgeSettings;
    })
    .catch(err => console.error('Failed to pre-fetch badge settings:', err));
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDomContentLoadedTasks, { once: true });
} else {
  initDomContentLoadedTasks();
}

console.debug('main.js loaded');

// Admin panel drawer toggler
window.toggleAdminPanel = (show) => {
  const panel = document.getElementById('profile-admin-sliding-panel');
  if (!panel) return;
  let isShowing = false;
  if (show === undefined) {
    panel.classList.toggle('show');
    isShowing = panel.classList.contains('show');
  } else if (show) {
    panel.classList.add('show');
    isShowing = true;
  } else {
    panel.classList.remove('show');
    isShowing = false;
  }
  
  if (isShowing) {
    setTimeout(() => {
      const modal = document.getElementById('userProfileModal');
      if (modal) {
        modal.scrollTo({
          top: modal.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 150);
  }
};

// Outside click to close sliding admin panel
document.addEventListener('click', (e) => {
  const panel = document.getElementById('profile-admin-sliding-panel');
  const adminBtn = document.getElementById('btn-profile-admin');
  if (panel && panel.classList.contains('show')) {
    if (!panel.contains(e.target) && adminBtn && !adminBtn.contains(e.target) && !e.target.closest('#btn-profile-admin')) {
      window.toggleAdminPanel(false);
    }
  }
});
// Removed DOM element logging to prevent circular structure issues in some environments

// Auto Resize Textarea Utility - DISABLED as per user request
window.autoResizeTextarea = function(el, maxHeight = 150) {
  // Do nothing
  return;
};

// Update message times every minute
setInterval(() => {
  document.querySelectorAll('.message-time').forEach(el => {
    const createdAt = el.getAttribute('data-created-at');
    if (createdAt) el.innerHTML = formatTimeAgo(createdAt);
  });
}, 60000);

window.getClientSessionId = function() {
  let id = sessionStorage.getItem('chat_client_session_id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('chat_client_session_id', id);
  }
  return id;
}

window.createNewClientSessionId = function() {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomUUID)
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem('chat_client_session_id', id);
  return id;
}

const socket = io({ 
  autoConnect: false,
  auth: async (cb) => {
    console.debug('Socket auth callback called');
    const fingerprint = await getFingerprint();
    cb({ token: getToken(), clientSessionId: window.getClientSessionId(), fp: fingerprint });
  }
});
window.socket = socket;
socket.on('kiss-received', (data) => {
    renderAnimation(data.sender || { username: data.from }, '/uploads/system/kiss.webp', true, 'بوسة', '/sounds/kiss.mp3');
});

socket.on('slap-received', (data) => {
    renderAnimation(data.sender || { username: data.from }, '/uploads/system/slap.webp', false, 'كف', '/sounds/slap.mp3');
});

socket.on('hug-received', (data) => {
    renderAnimation(data.sender || { username: data.from }, '/uploads/system/hug.webp', false, 'حضن', '/sounds/hug.mp3');
});

socket.on('clap-received', (data) => {
    renderAnimation(data.sender || { username: data.from }, '/uploads/system/clap.webp', false, 'تصفيق', '/sounds/clap.mp3');
});

let currentEffectAudio = null;

function stopCurrentEffectAudio() {
    if (currentEffectAudio) {
        try {
            currentEffectAudio.pause();
            currentEffectAudio.currentTime = 0;
        } catch (e) {
            console.warn('[ProfileEffect] Error stopping previous effect audio:', e);
        }
        currentEffectAudio = null;
    }
}

function playEffectSound(soundUrl) {
    if (!window.isChatAudioAllowed()) return null;
    if (!soundUrl) return null;

    stopCurrentEffectAudio();

    try {
        if (window.profileSoundManager && !window.profileSoundManager.initialized) {
            window.profileSoundManager.init();
        }

        let audio = null;
        if (window.profileSoundManager && window.profileSoundManager.effectAudios && window.profileSoundManager.effectAudios[soundUrl]) {
            audio = window.profileSoundManager.effectAudios[soundUrl];
            audio.currentTime = 0;
            audio.loop = false;
        } else {
            audio = new Audio(soundUrl);
            audio.loop = false;
        }

        currentEffectAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                // Silently swallow browser autoplay prevention
            });
        }
        return audio;
    } catch (e) {
        return null;
    }
}

function renderAnimation(fromUser, imgSrc, showConfetti, actionName, soundUrl) {
    if (showConfetti) {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            shapes: ['circle'],
            colors: ['#e11d48', '#f43f5e', '#be123c']
        });
    }

    const audioInstance = playEffectSound(soundUrl);

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.zIndex = '9999';
    container.style.textAlign = 'center';
    container.style.pointerEvents = 'none';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';

    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.width = '200px';

    const name = document.createElement('div');
    const fromUsername = fromUser.username || fromUser;
    const identityHtml = window.renderUserIdentity ? window.renderUserIdentity(fromUser, { tag: 'span' }) : `<span>${fromUsername}</span>`;
    name.innerHTML = `${identityHtml} قام بإرسال ${actionName} لك`;
    name.style.color = '#1e293b';
    name.style.fontWeight = '600';
    name.style.fontSize = '14px';
    name.style.marginTop = '16px';
    name.style.background = 'rgba(255, 255, 255, 0.75)';
    name.style.backdropFilter = 'blur(12px)';
    name.style.webkitBackdropFilter = 'blur(12px)';
    name.style.border = '1px solid rgba(255, 255, 255, 0.5)';
    name.style.boxShadow = '0 8px 32px 0 rgba(31, 38, 135, 0.08)';
    name.style.borderRadius = '50px';
    name.style.padding = '10px 24px';
    name.style.display = 'inline-block';
    name.style.direction = 'rtl';
    name.style.maxWidth = '90vw';
    name.style.wordBreak = 'break-word';

    container.appendChild(img);
    container.appendChild(name);
    document.body.appendChild(container);

    setTimeout(() => {
        container.remove();
        if (currentEffectAudio && currentEffectAudio === audioInstance) {
            stopCurrentEffectAudio();
        }
    }, 7000);
}

  socket.on('game:spectate:list:update', (games) => {
  window.activeSpectateGames = games || [];
  const badge = document.getElementById('active-games-count-badge');
  const btn = document.getElementById('active-games-floating-btn');
  const count = window.activeSpectateGames.length;
  if (badge) {
    badge.innerText = count;
    if (count > 0) {
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }
  if (btn) {
    if (count > 0) {
      btn.classList.remove('d-none');
    } else {
      btn.classList.add('d-none');
    }
  }
  if (window.GamesManager) {
    window.GamesManager.activeSpectateGames = window.activeSpectateGames;
    window.GamesManager.renderSpectateGamesList();
  }
});
window.state = state;
window.terminalExitStarted = false;

window.PrivateCallManager.init(socket);
window.voiceManager = new VoiceManager(socket);
console.debug('[VoiceAudio] VoiceManager initialized:', {
  constructor: window.voiceManager?.constructor?.name,
  hasUnlockAudioSession:
    typeof window.voiceManager?.unlockAudioSession === 'function',
  hasStartSilentAudioSession:
    typeof window.voiceManager?.startSilentAudioSession === 'function',
  hasRetryPendingRemoteAudio:
    typeof window.voiceManager?.retryPendingRemoteAudio === 'function'
});
window.musicManager = new MusicManager(socket);

// --- Dynamic Lazy Loading Functions ---
const loadedScripts = {};

window.loadScriptOnce = (src, key) => {
  if (loadedScripts[key]) {
    return loadedScripts[key];
  }

  loadedScripts[key] = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lazy-key="${key}"]`);

    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute('data-lazy-key', key);

    script.onload = () => resolve();
    script.onerror = (err) => {
      delete loadedScripts[key];
      reject(err);
    };

    document.body.appendChild(script);
  });

  return loadedScripts[key];
};

window.ensureStoriesLoaded = async () => {
  await window.loadScriptOnce('/js/stories.js?v=11', 'stories');

  if (typeof window.fetchStories === 'function') {
    window.fetchStories();
  }
};

window.ensureBattleLoaded = async () => {
  await window.loadScriptOnce('/js/battle.js?v=20260730-tap-v2', 'battle');
};

window.ensureCameraLoaded = async () => {
  await window.loadScriptOnce('/js/cameraManager.js?v=3', 'camera');

  if (!window.cameraManager && window.CameraManager) {
    window.cameraManager = new window.CameraManager(socket, state);
  }

  return window.cameraManager;
};

window.ensureLiveBroadcastLoaded = async () => {
  await window.loadScriptOnce('/js/liveBroadcastManager.js?v=5', 'liveBroadcast');
  return window.liveBroadcastManager;
};

// On-demand loading of cameraManager when a camera request is received
socket.on('camera:request', async (data) => {
  const cameraManager = await window.ensureCameraLoaded();

  if (cameraManager && typeof cameraManager.handleIncomingRequest === 'function') {
    cameraManager.handleIncomingRequest(data);
  }
});

// On-demand loading of liveBroadcastManager when a notify event is received
socket.on('liveBroadcast:notify', async (data) => {
  const manager = await window.ensureLiveBroadcastLoaded();

  if (manager && typeof manager.showBroadcastNotification === 'function') {
    manager.showBroadcastNotification(data);
  }
});

// On-demand loading of battle when a battle invitation is received
socket.on('battle:created', async (data) => {
  await window.ensureBattleLoaded();
  // Wait a tick for battle.js listeners to attach, but battle.js itself attaches listeners globally
  // Wait, battle.js attaches to socket on load. But if battle:created triggered this load, the event might be missed by battle.js.
  // We should pass it to window.currentBattle?
  // battle.js has: socket.on('battle:created', ...). If we load it here, we might miss the event.
  // Instead, we can emit a custom event or call a function if it exists.
  setTimeout(() => {
    if (typeof window.handleBattleCreated === 'function') {
      window.handleBattleCreated(data);
    }
  }, 100);
});

socket.on('battle:sync', async (data) => {
  if (data && data.hasActiveBattle) {
    await window.ensureBattleLoaded();
    setTimeout(() => {
      if (typeof window.handleBattleSync === 'function') {
        window.handleBattleSync(data);
      }
    }, 100);
  } else if (data && !data.hasActiveBattle) {
     if (typeof window.handleBattleSync === 'function') {
        window.handleBattleSync(data);
     }
  }
});

socket.on('battle:invited', async (data) => {
  await window.ensureBattleLoaded();

  if (typeof window.handleBattleInvitation === 'function') {
    window.handleBattleInvitation(data);
  } else if (typeof window.showBattleInvitation === 'function') {
    window.showBattleInvitation(data);
  } else if (typeof window.onBattleInvited === 'function') {
    window.onBattleInvited(data);
  }
});

// --- YouTube Room Music AutoPlay Handle on Mobile ---
window.pendingAutoPlayMusic = false;
let autoPlayUnboxDone = false;

window.tryAutoPlayRoomMusicAfterFirstGesture = () => {
    if (autoPlayUnboxDone) return;

    if (!window.musicManager) return;

    // Check if user manually paused or muted
    if (window.musicManager.isLocalMuted) {
        autoPlayUnboxDone = true;
        return;
    }

    if (window.musicManager.player && typeof window.musicManager.player.playVideo === 'function' && window.musicManager.isApiReady) {
        const music = window.musicManager.currentMusic;
        if (music && music.isPlaying) {
            try {
                window.musicManager.player.playVideo();
                window.pendingAutoPlayMusic = false;
                autoPlayUnboxDone = true;
            } catch(e) {
                console.warn('Failed auto-play gesture for YouTube room music:', e);
            }
        } else {
            // Music is not playing right now, maybe later
            window.pendingAutoPlayMusic = true;
        }
    } else {
        window.pendingAutoPlayMusic = true;
    }
};

const handleInitialGesture = () => {
    window.tryAutoPlayRoomMusicAfterFirstGesture();
};

['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
    document.addEventListener(evt, handleInitialGesture, { once: true, passive: true });
});
// ----------------------------------------------------

function getToken() {
  const token = sessionStorage.getItem('token');
  console.debug('getToken called, returning:', token ? 'Token exists' : 'No token');
  return token;
}

// Global Fetch Interceptor to handle 401 Unauthorized (Expired Tokens)
// Helper to sanitise and convert generic HTML/Status into user-friendly messages
const getMeaningfulError = (error, status, serverMessage) => {
  if (!serverMessage && error) serverMessage = error.message || error;
  
  const isLikesError = serverMessage && (typeof serverMessage === 'string') && (serverMessage.includes('لايك') || serverMessage.includes('requiredLikes'));
  if (isLikesError) {
    return serverMessage;
  }

  // Check if it's a generic status message like "Forbidden", "Forbidden 403", "Not Found", etc.
  const genericPatterns = [
    /forbidden/i, /unauthorized/i, /not found/i, 
    /internal server error/i, /bad request/i, /403/, 
    /permission denied/i, /method not allowed/i
  ];
  
  // If we have a real message that is NOT generic, use it!
  const hasRealMessage = serverMessage && (typeof serverMessage === 'string') && serverMessage.length > 0 && !genericPatterns.some(regex => regex.test(serverMessage));
  
  if (hasRealMessage) {
    return serverMessage;
  }

  // Fallbacks for generic errors
  if (status === 403) return 'عذراً، تم رفض الطلب. قد لا تملك الصلاحية اللازمة أو لم تستوفِ الشروط المطلوبة.';
  if (status === 401) return 'انتهت الجلسة، يرجى تسجيل الدخول من جديد.';
  if (status === 404) return 'لم يتم العثور على المورد المطلوب.';
  if (status === 413) return 'حجم الملف كبير جداً.';
  if (status >= 500) return 'حدث خطأ في السيرفر، يرجى المحاولة لاحقاً.';
  
  return serverMessage || `فشل الطلب (كود: ${status})`;
};

window.showLikesLimitAlert = (message) => {
  Swal.fire({
    title: 'عذرًا',
    text: message,
    icon: 'error',
    confirmButtonText: 'موافق',
    customClass: {
      confirmButton: 'btn btn-primary px-5'
    },
    buttonsStyling: false
  });
};

// Store original fetch
const originalFetch = window.fetch;

const apiFetch = async (...args) => {
  const url = args[0];
  // Bypass internal socket.io polling/handshake from interceptor
  if (typeof url === 'string' && (url.includes('/socket.io/') || url.includes('sid='))) {
    return originalFetch(...args);
  }

  // Intercept POST/PUT/DELETE requests for wall interactions and private messages to report activity
  const options = args[1] || {};
  const method = (options.method || 'GET').toUpperCase();
  if (typeof url === 'string' && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    if (url.includes('/api/posts') || url.includes('/api/private')) {
      if (typeof handleRealActivity === 'function') {
        handleRealActivity();
      }
    }
  }

  try {
    const response = await originalFetch(...args);
    
    // Check if the response might be JSON
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const clone = response.clone();
      let data;
      try {
        data = await clone.json();
      } catch (e) {
        // Not actually JSON
      }
      
      if (data && data.message === 'Session expired, please login again') {
          if (window.showClassicAlert) {
            window.showClassicAlert('انتهت الجلسة يرجى تسجيل الدخول من جديد', 'warning');
          } else {
            alert('انتهت الجلسة يرجى تسجيل الدخول من جديد');
          }
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
          return response; // Or throw, but this should be enough to stop execution
      }
    }

    // Handle Unauthorized
    if (response.status === 401) {
      const clone = response.clone();
      let errorData;
      try { errorData = await clone.json(); } catch (e) { errorData = {}; }
      
      const message = errorData.message || getMeaningfulError(null, 401, errorData.message);
      if (state.currentUser) showToast(message, 'warning');
      logout();
      return response;
    }

    if (!response.ok) {
      let errorBody = {};
      let rawText = '';
      try {
        rawText = await response.text();
      } catch (e) {
        console.error('Failed to read response text', e);
      }
      
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json') && rawText) {
        try { 
          errorBody = JSON.parse(rawText); 
        } catch (e) { 
          console.warn('JSON parse failed for error body', e);
        }
      }

      // If we don't have a message from JSON, try to extract from HTML/Text
      if (!errorBody.message && rawText) {
        // Remove HTML tags
        const doc = new DOMParser().parseFromString(rawText, 'text/html');
        // Prefer content of <body> if it exists
        const textContent = doc.body?.textContent?.trim() || doc.head?.textContent?.trim() || rawText;
        // Clean up excess whitespace and limit length
        const cleanText = textContent.replace(/\s+/g, ' ').trim();
        
        if (cleanText && cleanText.length < 300) {
           errorBody.message = cleanText;
        }
      }
      
      const finalMessage = getMeaningfulError(null, response.status, errorBody.message);
      
      console.error('API Error:', { status: response.status, message: finalMessage, body: errorBody });

      // Auto-call likes limit alert if detected
      if (finalMessage && (finalMessage.includes('لايك') || finalMessage.includes('requiredLikes'))) {
        window.showLikesLimitAlert(finalMessage);
      }

      const error = new Error(finalMessage);
      error.status = response.status;
      error.body = errorBody;
      throw error;
    }

    return response;
  } catch (error) {
    if (error instanceof TypeError) {
      const networkError = new Error('خطأ في الاتصال بالسيرفر. يرجى التحقق من الشبكة.');
      networkError.isNetworkError = true;
      throw networkError;
    }
    throw error;
  }
};

// Shadow the global fetch for this module
const _fetch = apiFetch;
window.apiFetch = apiFetch;

let pendingMediaData = null;
let isSoundMuted = false;
let updateUsersListTimeout = null;
let preserveMessagesAfterLeave = false;
let pendingInitialRoomSelection = false;
let currentSettingsView = null;

function renderRoomCardHTML(room) {
    const stats = window.roomsStats && window.roomsStats[room.id] ? window.roomsStats[room.id] : { currentUsersCount: room.usersCount || 0 };
    const userCount = stats.currentUsersCount;
    const thumbUrl = typeof window.getRoomThumbnailUrl === 'function' ? window.getRoomThumbnailUrl(room) : '/uploads/site/room-default.png';
    const lockIcon = room.isLocked ? '<i class="fas fa-lock text-warning ms-1"></i>' : '';

    return `
      <div class="room-card" onclick="window.joinRoom(${room.id})">
        <img src="${thumbUrl}" class="room-card-img" alt="${room.name}" referrerPolicy="origin-when-cross-origin">
        <div class="p-2 text-center">
          <h6 class="fw-bold mb-1">${room.name} ${lockIcon}</h6>
          <span class="badge bg-secondary"><i class="fas fa-users"></i> ${userCount}</span>
        </div>
      </div>
    `;
}

function renderInlineRoomSelection() {
    const rooms = window.roomsData ? Object.values(window.roomsData).filter(r => r.isActive) : [];
    rooms.sort((a, b) => {
        const levelA = Number(a.roomLevel) || 0;
        const levelB = Number(b.roomLevel) || 0;
        const normA = levelA === 0 ? Number.MAX_SAFE_INTEGER : levelA;
        const normB = levelB === 0 ? Number.MAX_SAFE_INTEGER : levelB;
        if (normA !== normB) return normA - normB;
        return Number(a.id) - Number(b.id);
    });
    return `
      <div class="no-room-container no-room-with-list">
        <div class="no-room-title">أهلاً بك، اختر غرفتك لبدء الدردشة</div>
        <div class="no-room-rooms-list" id="rooms-grid">
          ${rooms.map(room => renderRoomCardHTML(room)).join('')}
        </div>
      </div>
    `;
}

// Room Music UI Handlers
document.addEventListener('click', (e) => {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const musicBtn = e.target.closest('#btn-room-music');
  if (musicBtn) {
    const modalElement = document.getElementById('roomMusicModal');
    if (!modalElement) return;
    
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    
    // Check permissions
    const user = state.currentUser;
    const room = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const isAdmin = false;
    const hasMusicPerm = state.hasPermission(user, 'canUseRoomMusic');
    const hasRequestPerm = state.hasPermission(user, 'canRequestMusic');
    
    // Check if user is moderator
    const isModerator = room && (room.ownerId === user.id || (room.moderators || []).some(m => (typeof m === 'number' ? m === user.id : Number(m.userId) === Number(user.id))));

    // Check if room allows music
    if (room && room.allowRoomMusic === false && !isAdmin) {
        showToast('الموسيقى معطلة في هذه الغرفة');
        return;
    }

    // Allow everyone to open the modal to see what's playing, but restrict actions inside
    
    const adminControls = document.getElementById('music-admin-controls');
    if (adminControls) {
      if (isAdmin || hasMusicPerm || (room && room.moderatorsCanManageMusic && isModerator)) {
        adminControls.classList.remove('d-none');
      } else {
        adminControls.classList.add('d-none');
      }
    }
    
    // Update current info
    const music = window.musicManager ? window.musicManager.currentMusic : null;
    const infoSection = document.getElementById('current-music-info');
    const playedBy = document.getElementById('music-played-by');
    const playbackControls = document.getElementById('music-playback-controls');

    if (music && infoSection) {
      infoSection.classList.remove('d-none');
      if (playedBy) playedBy.textContent = music.playedBy.username;
      if (playbackControls && (isAdmin || hasMusicPerm)) {
        playbackControls.classList.remove('d-none');
      }
    } else if (infoSection) {
      infoSection.classList.add('d-none');
      if (playbackControls) playbackControls.classList.add('d-none');
    }

    // Local volume/mute state
    if (window.musicManager) {
      const volInput = document.getElementById('music-local-volume');
      if (volInput) volInput.value = window.musicManager.localVolume;
      
      const muteBtn = document.getElementById('btn-music-local-mute');
      if (muteBtn) {
        if (window.musicManager.isLocalMuted) {
          muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
          muteBtn.classList.add('btn-danger');
        } else {
          muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
          muteBtn.classList.remove('btn-danger');
        }
      }
    }

    modal.show();
  }
});

// Music Search
const handleMusicSearch = async () => {
  const query = document.getElementById('music-search-input').value.trim();
  if (!query) return;

  // Improved YouTube ID detection
  const getYouTubeId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const videoId = getYouTubeId(query);
  if (videoId) {
    try {
      const res = await _fetch(`/api/youtube/info?videoId=${videoId}`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      const data = await res.json();
      window.musicManager.play(videoId, data.title || 'أغنية يوتيوب');
    } catch (e) {
      window.musicManager.play(videoId, 'أغنية يوتيوب');
    }
    document.getElementById('music-search-input').value = '';
    return;
  }

  // If it's just an 11-char ID
  if (query.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(query)) {
    try {
      const res = await _fetch(`/api/youtube/info?videoId=${query}`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      const data = await res.json();
      window.musicManager.play(query, data.title || 'أغنية يوتيوب');
    } catch (e) {
      window.musicManager.play(query, 'أغنية يوتيوب');
    }
    document.getElementById('music-search-input').value = '';
    return;
  }

  // Perform search
  const resultsContainer = document.getElementById('music-search-results');
  resultsContainer.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> جاري البحث...</div>';
  
  const results = await window.musicManager.search(query);
  resultsContainer.innerHTML = '';
  
  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="text-center p-2 small text-muted">لا توجد نتائج</div>';
    return;
  }

  results.forEach(video => {
    const item = document.createElement('div');
    item.className = 'yt-result-item';
    item.innerHTML = `
      <img src="${video.thumbnail}" class="yt-result-thumb">
      <div class="yt-result-info">
        <div class="yt-result-title">${video.title}</div>
        <div class="yt-result-channel">${video.channelTitle}</div>
      </div>
    `;
    item.onclick = () => {
      window.musicManager.play(video.id, video.title);
      resultsContainer.innerHTML = '';
      document.getElementById('music-search-input').value = '';
    };
    resultsContainer.appendChild(item);
  });
};

document.getElementById('btn-music-search')?.addEventListener('click', handleMusicSearch);
document.getElementById('music-search-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleMusicSearch();
});

// Playback Controls
document.getElementById('btn-music-play')?.addEventListener('click', () => {
  window.musicManager.resume();
});
document.getElementById('btn-music-pause')?.addEventListener('click', () => {
  if (window.musicManager.player) {
    window.musicManager.pause(window.musicManager.player.getCurrentTime());
  }
});
document.getElementById('music-global-volume-slider')?.addEventListener('input', (e) => {
  window.musicManager.setGlobalVolume(e.target.value);
});
document.getElementById('btn-music-stop')?.addEventListener('click', () => {
  window.musicManager.stop();
});

// Local Controls
document.getElementById('music-local-volume')?.addEventListener('input', (e) => {
  window.musicManager.setLocalVolume(parseFloat(e.target.value));
});
document.getElementById('btn-music-local-mute')?.addEventListener('click', (e) => {
  const isMuted = !window.musicManager.isLocalMuted;
  window.musicManager.setLocalMute(isMuted);
  const btn = e.currentTarget;
  if (isMuted) {
    btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    btn.classList.add('btn-danger');
  } else {
    btn.innerHTML = '<i class="fas fa-volume-up"></i>';
    btn.classList.remove('btn-danger');
  }
});

document.getElementById('btn-music-fix-sound')?.addEventListener('click', () => {
  if (window.musicManager.player && window.musicManager.player.playVideo) {
    window.musicManager.player.playVideo();
    showToast('تمت محاولة إصلاح الصوت', 'success');
  } else {
    showToast('المشغل غير جاهز بعد', 'warning');
  }
});

// Initialize state-based UI
// handled inside MusicManager.updateUI()

// Expose to window for modular game access
window.state = state;
window.socket = socket;

let gamesManagerPromise = null;

window.ensureGamesManagerLoaded = async function () {
  if (window.GamesManager) return window.GamesManager;

  if (!gamesManagerPromise) {
    gamesManagerPromise = import('./modules/GamesManager.js?v=39').then((module) => {
      module.GamesManager.init();
      window.GamesManager = module.GamesManager;
      return module.GamesManager;
    });
  }

  return gamesManagerPromise;
};

PrivateChatManager.init();


window.getThumbUrl = function(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (trimmed.includes('/uploads/site/default.png') || trimmed.includes('default-avatar')) return trimmed;
  if (trimmed.includes('_thumb.')) return trimmed;
  if (!trimmed.includes('/uploads/')) return trimmed;
  
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx > -1) {
    return trimmed.substring(0, dotIdx) + '_thumb.webp';
  }
  return trimmed;
};

window.getAvatarUrl = function(user, useThumb = false) {
  let pic = user;
  if (user && typeof user === 'object') {
    pic = user.pic !== undefined ? user.pic : (user.avatar !== undefined ? user.avatar : user.senderAvatar);
  }

  if (pic !== null && pic !== undefined) {
    if (typeof pic === 'string') {
      const trimmed = pic.trim();
      const lower = trimmed.toLowerCase();
      const isInvalid = !trimmed ||
        lower === 'null' ||
        lower === 'undefined' ||
        lower === 'none' ||
        lower.includes('placehold.co') ||
        lower.includes('flaticon.com') ||
        lower === '/default-avatar.png' ||
        lower === '/img/default-avatar.png' ||
        lower === '/images/default-avatar.png' ||
        lower === '/uploads/site/default.png';

      if (!isInvalid) {
        if (useThumb && typeof window.getThumbUrl === 'function') {
          return window.getThumbUrl(trimmed);
        }
        return trimmed;
      }
    }
  }

  var showDefault = window.showDefaultAvatar;
  if (showDefault === undefined && window.domainConfig) {
    showDefault = window.domainConfig.showDefaultAvatar;
  }

  if (showDefault !== false && showDefault !== 'false') {
    var customDefault = window.defaultAvatarUrl;
    if (!customDefault && window.domainConfig && window.domainConfig.defaultAvatarUrl) {
      customDefault = window.domainConfig.defaultAvatarUrl;
    }
    if (customDefault && typeof customDefault === 'string' && customDefault.trim() !== '') {
      var trimmedDefault = customDefault.trim();
      var lowerDefault = trimmedDefault.toLowerCase();
      if (lowerDefault !== 'null' && lowerDefault !== 'undefined' && lowerDefault !== 'none') {
        return trimmedDefault;
      }
    }
  }

  return '/uploads/site/default.png';
};

window.handleAvatarError = function(imgEl) {
  if (!imgEl) return;

  if (imgEl.src && imgEl.src.includes('_thumb.')) {
    var origSrc = imgEl.dataset.originalSrc || imgEl.src.replace('_thumb.webp', '.webp').replace('_thumb.', '.');
    delete imgEl.dataset.originalSrc;
    if (origSrc && origSrc !== imgEl.src) {
      imgEl.src = origSrc;
      return;
    }
  }

  var currentStage = imgEl.dataset.avatarFallbackStage || 'none';
  var localFallback = '/uploads/site/default.png';

  if (currentStage === 'none') {
    imgEl.dataset.avatarFallbackStage = 'customDefault';

    var showDefault = window.showDefaultAvatar;
    if (showDefault === undefined && window.domainConfig) {
      showDefault = window.domainConfig.showDefaultAvatar;
    }

    var customDefault = window.defaultAvatarUrl;
    if (!customDefault && window.domainConfig && window.domainConfig.defaultAvatarUrl) {
      customDefault = window.domainConfig.defaultAvatarUrl;
    }

    if (showDefault !== false && showDefault !== 'false' && customDefault && typeof customDefault === 'string' && customDefault.trim() !== '') {
      var targetUrl = customDefault.trim();
      if (!imgEl.src.endsWith(targetUrl) && imgEl.src !== targetUrl) {
        imgEl.src = targetUrl;
        return;
      }
    }
  }

  if (currentStage !== 'localFallback') {
    imgEl.dataset.avatarFallbackStage = 'localFallback';
    if (!imgEl.src.endsWith(localFallback) && imgEl.src !== localFallback) {
      imgEl.src = localFallback;
      return;
    }
  }

  imgEl.onerror = null;
};

window.getSystemMessageImageUrl = function(customImage) {
  if (customImage && typeof customImage === 'string' && customImage.trim() !== '') {
    const trimmed = customImage.trim();
    const lower = trimmed.toLowerCase();
    if (lower !== 'null' && lower !== 'undefined' && !lower.includes('flaticon.com') && !lower.includes('placehold.co')) {
      return trimmed;
    }
  }
  if (window.defaultSystemMessageImageUrl && typeof window.defaultSystemMessageImageUrl === 'string' && window.defaultSystemMessageImageUrl.trim() !== '') {
    return window.defaultSystemMessageImageUrl.trim();
  }
  return '/uploads/site/default.png';
};

window.getRoomThumbnailUrl = function(room) {
  if (room && room.useThumbnail && room.roomThumbnail) return room.roomThumbnail;
  if (window.defaultRoomUrl) return window.defaultRoomUrl;
  return '';
};


async function fetchAndApplySiteAppearance() {
  try {
    const res = await window.fetchWithRetry('/api/settings/appearance');
    console.log('Appearance response:', res);
    if (res.ok) {
      const appearance = await res.json();
      applySiteAppearance(appearance);
    } else {
      console.error('Appearance response not ok:', res.status, res.statusText);
    }
  } catch (err) {
    console.error('Failed to fetch site appearance', err);
  }
}

async function loadFeaturesSettings() {
  try {
    const res = await _fetch('/api/settings/features', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
    });
    if (res.ok) {
      window.featuresSettings = await res.json();
      if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
        window.updateLiveBroadcastButtonVisibility();
      }
      if (typeof renderZajelTicker === 'function') {
        renderZajelTicker();
      }
    }
  } catch (err) {
    console.error('Failed to load features settings:', err);
  }
}

async function fetchAdminAdsTicker() {
  try {
    const res = await _fetch('/api/settings/admin-ads-ticker', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
    });
    if (res.ok) {
      const data = await res.json();
      renderAdminAdsTicker(data);
    }
  } catch (err) {
    console.error('Failed to fetch admin ads ticker:', err);
  }
}

let adminAdsTickerPayload = null;
let adminAdsResizeObserver = null;

function updateAdminAdsMarqueeMotion() {
  const container = document.getElementById('admin-ads-container');
  const textFlow = document.getElementById('admin-ads-text-flow');

  if (!container || !textFlow || !adminAdsTickerPayload?.settings?.enabled) {
    return;
  }

  requestAnimationFrame(() => {
    const containerWidth = container.clientWidth || 300;
    const flowWidth = textFlow.scrollWidth || 300;

    const configuredDuration = Number(adminAdsTickerPayload?.settings?.speed) || 30;

    /*
      البداية تكون خارج يسار مساحة النص بالكامل.
      النهاية تكون خارج يمين مساحة النص بالكامل.
      بهذه الطريقة النص يعبر كامل المساحة المتاحة
      ولا يختفي قبل الوصول لنهاية الشريط.
    */
    textFlow.style.setProperty('--admin-ads-start-x', `-${flowWidth}px`);
    textFlow.style.setProperty('--admin-ads-end-x', `${containerWidth}px`);

    textFlow.style.animation = 'none';
    void textFlow.offsetWidth;

    textFlow.style.animation =
      `marquee-admin-ads ${configuredDuration}s linear infinite`;
  });
}

function setupAdminAdsResizeObserver() {
  const container = document.getElementById('admin-ads-container');

  if (!container || container.dataset.adminAdsResizeObserverAttached === '1') {
    return;
  }

  container.dataset.adminAdsResizeObserverAttached = '1';

  adminAdsResizeObserver = new ResizeObserver(() => {
    updateAdminAdsMarqueeMotion();
  });

  adminAdsResizeObserver.observe(container);
}

if (!window.__adminAdsTickerEventsRegistered) {
  window.__adminAdsTickerEventsRegistered = true;

  window.addEventListener('resize', updateAdminAdsMarqueeMotion);
  window.addEventListener('orientationchange', updateAdminAdsMarqueeMotion);
}

function renderAdminAdsTicker(payload) {
  const bar = document.getElementById('admin-ads-ticker-bar');
  const flow = document.getElementById('admin-ads-text-flow');

  if (!bar || !flow) return;

  adminAdsTickerPayload = payload || null;

  const settings = payload?.settings;
  const ads = Array.isArray(payload?.ads) ? payload.ads : [];

  if (!settings?.enabled || ads.length === 0) {
    bar.classList.add('d-none');
    flow.replaceChildren();
    return;
  }

  bar.classList.remove('d-none');

  bar.style.setProperty(
    '--admin-ads-bg-color',
    settings.bgColor || '#fff8e1'
  );

  bar.style.setProperty(
    '--admin-ads-text-color',
    settings.textColor || '#4b3600'
  );

  flow.replaceChildren();

  ads.forEach((ad, index) => {
    const item = document.createElement('span');

    item.className = 'admin-ads-item';
    item.dir = 'rtl';

    const content = String(ad?.content || '');

    if (ad?.linkUrl && isSafeAdminAdUrl(ad.linkUrl)) {
      const link = document.createElement('a');

      link.href = ad.linkUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = content;

      item.appendChild(link);
    } else {
      item.textContent = content;
    }

    flow.appendChild(item);

    if (index < ads.length - 1) {
      const separator = document.createElement('span');

      separator.className = 'admin-ads-separator';
      separator.textContent = '•';

      flow.appendChild(separator);
    }
  });

  setupAdminAdsResizeObserver();
  updateAdminAdsMarqueeMotion();
}

window.featuresSettings = { 
  publicMessageDeletionEnabled: false,
  publicMessageReplyEnabled: false,
  disableCopy: false,
  disableRightClick: false,
  profileLightboxEnabled: true,
  cameraEnabled: true,
  storiesEnabled: true,
  sidebarAddonsEnabled: true,
  sidebarMemberSearchEnabled: true,
  wallYoutubeBarEnabled: true,
  wallPostLikesEnabled: true,
  wallPostCommentsEnabled: true,
  mentionsEnabled: true,
  battleChallengesEnabled: true,
  zajelEnabled: false
};

async function loadLoginBehavior() {
  try {
    const res = await window.fetchWithRetry('/api/settings/login-behavior');
    if (res.ok) {
      const data = await res.json();
      state.setLoginBehavior(data);
      if (data.behavior === 'default_room') {
        state.setCurrentRoomId(1);
      } else {
        state.setCurrentRoomId(0);
      }
      updateChatUI();
    } else {
      console.error('Login behavior response not ok:', res.status, res.statusText);
    }
  } catch (err) {
    console.error('Failed to load login behavior:', err);
  }
}

function applySiteAppearance(appearance) {
  if (!appearance) return;
  window.siteAppearance = appearance;
  state.setSettings(appearance);
  
  const root = document.documentElement;
  
  // Consolidated Main UI Color
  if (appearance.mainUiColor) {
    root.style.setProperty('--main-ui-color', appearance.mainUiColor);
  } else if (appearance.roomBoxBg) {
    // Fallback for old settings
    root.style.setProperty('--main-ui-color', appearance.roomBoxBg);
  }

  if (appearance.landingBgColor) root.style.setProperty('--landing-bg-color', appearance.landingBgColor);
  if (appearance.chatInputBg) root.style.setProperty('--chat-input-bg', appearance.chatInputBg);
  if (appearance.unifiedBtnBg) root.style.setProperty('--unified-btn-bg', appearance.unifiedBtnBg);
  if (appearance.unifiedBtnHoverBg) root.style.setProperty('--unified-btn-hover-bg', appearance.unifiedBtnHoverBg);
  if (appearance.micIconColor) root.style.setProperty('--mic-icon-color', appearance.micIconColor);
  if (appearance.micBtnBgColor) root.style.setProperty('--mic-btn-bg-color', appearance.micBtnBgColor);
  if (appearance.lineIconColor) root.style.setProperty('--line-icon-color', appearance.lineIconColor);

  // Overlay Image
  if (appearance.showOverlayImage === 'true' || appearance.showOverlayImage === true) {
    if (appearance.overlayImageUrl) {
      const currentOverlay = root.style.getPropertyValue('--overlay-image');
      const newOverlay = `url(${appearance.overlayImageUrl})`;
      if (currentOverlay !== newOverlay && currentOverlay !== `url("${appearance.overlayImageUrl}")`) {
        root.style.setProperty('--overlay-image', newOverlay);
      }
    } else {
      if (root.style.getPropertyValue('--overlay-image') !== 'none') root.style.setProperty('--overlay-image', 'none');
    }
  } else {
    if (root.style.getPropertyValue('--overlay-image') !== 'none') root.style.setProperty('--overlay-image', 'none');
  }

  // Font Settings
  if (appearance.fontFamily) {
    root.style.setProperty('--font-family', appearance.fontFamily);
    // Dynamically load Google Font if it's one of our presets
    const fontName = appearance.fontFamily.split(',')[0].replace(/'/g, '').trim();
    if (fontName && fontName !== 'Arial') {
      const linkId = 'dynamic-google-font';
      let link = document.getElementById(linkId);
      if (!link) {
        link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      const fontUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;
      if (link.href !== fontUrl) link.href = fontUrl;
    }
  }
  if (appearance.fontSize) root.style.setProperty('--font-size', appearance.fontSize + 'px');
  if (appearance.fontWeight) root.style.setProperty('--font-weight', appearance.fontWeight);

  // Apply user font size preference on top of site base
  applyUserFontSize();

  // Banner
  const banner = document.querySelector('.site-banner');
  if (banner) {
    if (appearance.showBanner === 'false' || appearance.showBanner === false) {
      if (banner.style.display !== 'none') banner.style.display = 'none';
    } else {
      if (banner.style.display !== 'block') banner.style.display = 'block';
      if (appearance.bannerUrl) {
        const currentSrc = typeof window.normalizeAssetUrl === 'function' ? window.normalizeAssetUrl(banner.getAttribute('src')) : banner.src;
        const newSrc = typeof window.normalizeAssetUrl === 'function' ? window.normalizeAssetUrl(appearance.bannerUrl) : appearance.bannerUrl;
        if (currentSrc !== newSrc) banner.src = appearance.bannerUrl;
      }
      if (appearance.bannerWidth) {
        const width = appearance.bannerWidth + 'px';
        if (banner.style.width !== width) banner.style.width = width;
      }
      if (appearance.bannerHeight) {
        const height = appearance.bannerHeight + 'px';
        if (banner.style.height !== height) banner.style.height = height;
      }
    }
  }

  // Favicon / Logo
  const logo = document.getElementById('site-logo');
  if (logo) {
    if (appearance.showFavicon === 'false' || appearance.showFavicon === false) {
      if (logo.style.display !== 'none') logo.style.display = 'none';
    } else {
      if (logo.style.display !== 'block') logo.style.display = 'block';
      if (appearance.faviconUrl) {
        if (logo.tagName === 'IMG') {
          const currentSrc = typeof window.normalizeAssetUrl === 'function' ? window.normalizeAssetUrl(logo.getAttribute('src')) : logo.src;
          const newSrc = typeof window.normalizeAssetUrl === 'function' ? window.normalizeAssetUrl(appearance.faviconUrl) : appearance.faviconUrl;
          if (currentSrc !== newSrc) logo.src = appearance.faviconUrl;
        } else {
          const img = document.createElement('img');
          img.id = 'site-logo';
          img.src = appearance.faviconUrl;
          img.className = logo.className;
          img.style.cssText = logo.style.cssText;
          img.setAttribute('referrerPolicy', 'origin-when-cross-origin');
          img.setAttribute('loading', 'lazy');
          logo.replaceWith(img);
        }
      }
    }
  }

  // Private Tab Background
  const privateTabContainer = document.getElementById('sidebar-private-container');
  if (privateTabContainer) {
    if (appearance.showPrivateTabBg === 'false' || appearance.showPrivateTabBg === false) {
      privateTabContainer.style.backgroundImage = 'none';
    } else {
      if (appearance.privateTabBgUrl) {
        privateTabContainer.style.backgroundImage = `url('${appearance.privateTabBgUrl}')`;
        privateTabContainer.style.backgroundSize = 'cover';
        privateTabContainer.style.backgroundPosition = 'center';
      }
    }
  }

  if (appearance.faviconUrl) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = appearance.faviconUrl;
  }

  // Default Avatar
  if (appearance.showDefaultAvatar === 'false' || appearance.showDefaultAvatar === false) {
    window.showDefaultAvatar = false;
    window.defaultAvatarUrl = null;
  } else {
    window.showDefaultAvatar = true;
    if (appearance.defaultAvatarUrl) {
      window.defaultAvatarUrl = appearance.defaultAvatarUrl;
    } else {
      window.defaultAvatarUrl = '/uploads/site/default.png';
    }
  }

  // Default System Message Image
  window.defaultSystemMessageImageUrl = appearance.defaultSystemMessageImageUrl || null;

  // Default Room
  if (appearance.showDefaultRoom === 'false' || appearance.showDefaultRoom === false) {
    window.defaultRoomUrl = null;
  } else if (appearance.defaultRoomUrl) {
    window.defaultRoomUrl = appearance.defaultRoomUrl;
  }

  // Default Cover
  if (appearance.enableCustomCover === 'false' || appearance.enableCustomCover === false) {
    window.enableCustomCover = false;
  } else {
    window.enableCustomCover = true;
  }
  
  if (appearance.defaultCoverUrl) {
    window.defaultCoverUrl = appearance.defaultCoverUrl;
  } else {
    window.defaultCoverUrl = null;
  }

  
  // Refresh UI to apply new default avatar and system message images
  if (state && state.currentUser && Array.isArray(state.currentUsers)) {
    updateUsersList(state.currentUsers);
  }
  if (window.fetchStories) {
    window.fetchStories();
  }
  if (window.PrivateChatManager && typeof window.PrivateChatManager.renderConversationsList === 'function') {
    window.PrivateChatManager.renderConversationsList();
    if (window.PrivateChatManager.activeConversationUsername) {
      window.PrivateChatManager.renderMessages();
    }
  }
}

socket.on('site_appearance_updated', applySiteAppearance);

socket.on('admin_ads:updated', (data) => {
  renderAdminAdsTicker(data);
});

socket.on('server_restarting', (data) => {
  Swal.fire({
    title: 'تنبيه من النظام',
    text: data.message || 'يتم الآن إعادة تشغيل السيرفر لتحديث الإعدادات، يرجى الانتظار...',
    icon: 'info',
    timer: (data.countdown || 5) * 1000,
    timerProgressBar: true,
    showConfirmButton: false,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  }).then(() => {
    window.location.reload();
  });
});

// Fix for Bootstrap 5 focus trap with SweetAlert2
document.addEventListener('focusin', (e) => {
  if (e.target && typeof e.target.closest === 'function' && e.target.closest('.swal2-container')) {
    e.stopImmediatePropagation();
  }
}, { capture: true });

async function initApp() {
  console.log('Initializing app...');

  // Page reload session termination is handled in landing.js

  // Fill saved username if exists
  const savedUsername = localStorage.getItem('chat_member_username');
  const rememberName = localStorage.getItem('chat_remember_member_name');
  if (savedUsername && rememberName === 'true') {
     const memberUsernameInput = document.getElementById('member-username');
     if (memberUsernameInput) memberUsernameInput.value = savedUsername;
  }
  
  // Apply initial appearance immediately from server-injected config to prevent FOUC
  if (window.domainConfig && Object.keys(window.domainConfig).length > 0) {
    applySiteAppearance(window.domainConfig);
  }
  
  // Start fetches in parallel
  // We still fetch appearance to sync any live changes, but it's no longer the primary source for initial render
  const appearancePromise = fetchAndApplySiteAppearance();
  const featuresSettingsPromise = loadFeaturesSettings();
  const adminAdsTickerPromise = fetchAdminAdsTicker();
  const loginBehaviorPromise = loadLoginBehavior();
  const shortcutsPromise = loadShortcuts();
  const smileysPromise = loadSmileys();
  applyUserFontSize();
  
  // Check if user is already logged in
  const token = getToken();
  let sessionPromise = Promise.resolve();
  
  // Automatic login disabled as requested
  const enableAutoLogin = false;
  
  // منع الدخول التلقائي للغرف إذا كان المستخدم مفعل خيار "خارج الغرفة"
  const loginBehavior = localStorage.getItem('loginBehavior'); // سنفترض وجود خيار مخزن، أو نتحقق من حالته هنا
  
  if (token && enableAutoLogin) {
    sessionPromise = (async () => {
      try {
        const res = await _fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.user) {
            console.log('User session restored:', result.user.username);
            state.setCurrentUser(result.user);
            
            // التحقق من "خارج الغرفة" هنا
            if (result.user.mustChooseRoom) {
               window.renderRoomsGrid();
            } else {
               if (ui.loginOverlay) ui.loginOverlay.classList.add('d-none');
               if (ui.chatShell) {
                 ui.chatShell.classList.remove('d-none');
                 scheduleDelayedViewportSync();
               }
            }
            
            updateUIForUser();
            loadShortcuts();
            updateChatUI();
          } else {
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
          }
        } else {
          // Token invalid or server error
          sessionStorage.removeItem('token');
          sessionStorage.removeItem('user');
        }
      } catch (err) {
        console.error('Failed to verify session:', err);
      }
    })();
  }

  // Wait for essential data before connecting socket
  await Promise.all([appearancePromise, featuresSettingsPromise, adminAdsTickerPromise, loginBehaviorPromise, shortcutsPromise, smileysPromise, sessionPromise]);

  // Setup mentions after features settings are loaded
  setupMentions();

  getFingerprint().then(fp => {
    socket.io.opts.query = { fp };
    
    // Only connect socket if user is already authenticated
    if (state.currentUser && getToken()) {
      if (!socket.connected) {
        socket.connect();
      }
      if (window.profileSoundManager) {
        window.profileSoundManager.init();
      }
    }
  });
  
  // Pre-load rooms for everyone
  loadRooms();

  // Lazy-load stories after a delay of 2.5 seconds
  setTimeout(() => {
    if (window.featuresSettings?.storiesEnabled !== false) {
      window.ensureStoriesLoaded();
    }
  }, 2500);
}

window.__chatAppInitPromise = initApp().catch(err => {
  console.error('[Main] initApp failed:', err);
  throw err;
});

let hasEverConnected = false;
let hasJoinedChatOnce = false;
let isLoginSocketSwitch = false;
let isReconnectingFlag = false;

/**
 * Hide the reconnection status bar
 */
function hideReconnectBar() {
  const bar = document.getElementById('reconnect-status-bar');
  if (!bar) return;
  bar.classList.add('d-none');
  bar.classList.remove('reconnecting', 'logging-in', 'connected');
}

/**
 * Check if the reconnection bar can be shown based on logic
 */
function canShowReconnectBar() {
  return Boolean(
    state.currentUser &&
    hasJoinedChatOnce &&
    !isLoginSocketSwitch
  );
}

/**
 * Handle close button on reconnection bar
 */
window.handleReconnectClose = function() {
  const bar = document.getElementById('reconnect-status-bar');
  if (!bar) return;

  // If user closes while trying to reconnect or log in, log them out
  if (bar.classList.contains('reconnecting') || bar.classList.contains('logging-in')) {
    logout();
  }
  
  bar.classList.add('d-none');
  bar.classList.remove('reconnecting', 'logging-in', 'connected');
};

/**
 * Update the reconnection status bar
 * @param {string} status - 'reconnecting', 'logging-in', 'connected'
 * @param {string} message - Text to display
 */
window.updateReconnectBar = function(status, message) {
  const bar = document.getElementById('reconnect-status-bar');
  const text = document.getElementById('reconnect-text');
  if (!bar || !text) return;

  // IMPORTANT: Don't show anything besides 'connected' if logic says no
  if (!canShowReconnectBar() && status !== 'connected') {
    hideReconnectBar();
    return;
  }

  bar.classList.remove('d-none', 'reconnecting', 'logging-in', 'connected');
  bar.classList.add(status);
  text.innerText = message;

  if (status === 'connected') {
    isReconnectingFlag = false;
    // Keep visible for a few seconds before fading
    setTimeout(() => {
      bar.classList.add('d-none');
    }, 2500);
  } else {
    isReconnectingFlag = true;
  }
};

// Activity Tracking
const emitActivity = debounce(() => {
  if (socket && socket.connected) {
    socket.emit('activity');
  }
}, 2000);

// Add to main chat input fields
document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'chat-input' || e.target.id === 'private-chat-input')) {
        emitActivity();
    }
});

socket.on('connect', () => {
  socket.emit('zajel:get-approved');
  if (typeof hasPermission === 'function' && hasPermission('manageZajelMessages')) {
    socket.emit('zajel:moderation:get-pending');
  }
  socket.emit('game:spectate:list');
  const statusBar = document.getElementById('connection-status-bar');
  const statusBoxes = statusBar ? statusBar.querySelectorAll('.bg-danger, .bg-success') : [];
  const text = document.getElementById('connection-text');
  
  if (statusBar) statusBar.style.backgroundColor = '#586572'; // Default center color
  statusBoxes.forEach(box => {
    box.classList.remove('bg-danger');
    box.classList.add('bg-success');
  });
  if (text) text.innerText = 'متصل';

  if (state.currentUser) {
    const isRealReconnect = hasJoinedChatOnce && !isLoginSocketSwitch;
    
    // Silent reconnect - no updateReconnectBar
    
    console.log('Socket reconnected, re-joining (real reconnect:', isRealReconnect, ')');
    socket.emit('join', { 
      roomId: state.currentRoomId, 
      isRejoin: isRealReconnect 
    });

    // On a real reconnect (network loss / reconnect), the server starts a brand-new
    // session for this client: room chat and private messages must start fresh on-screen too.
    if (isRealReconnect) {
      if (ui.messagesContainer) ui.messagesContainer.innerHTML = '';
      publicMessageQueue = [];
      if (window.PrivateChatManager) {
        window.PrivateChatManager.resetForFreshSession && window.PrivateChatManager.resetForFreshSession();
      }
    }
  }
  
  // Set this AFTER the first connection is established
  hasEverConnected = true;
});

window.cleanupUIForLogin = function() {
  // 1. Close all bootstrap modals
  if (typeof bootstrap !== 'undefined') {
    document.querySelectorAll('.modal.show').forEach(modalEl => {
      try {
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) {
          modalInstance.hide();
        }
      } catch (e) {}
    });
  }
  
  // 2. Remove any modal backdrops or standalone menus that might be stuck
  document.querySelectorAll('.modal-backdrop, .offcanvas-backdrop, .sidebar-backdrop, .profile-backdrop, .mic-menu, .custom-context-menu').forEach(el => el.remove());

  // 3. Close custom popup profiles/lightboxes if they exist
  if (typeof closeProfileImageLightbox === 'function') {
    try { closeProfileImageLightbox(); } catch (e) {}
  }
  document.querySelectorAll('.profile-image-lightbox.active').forEach(el => el.classList.remove('active'));

  // 4. Close sidebars
  if (typeof closeSidebar === 'function') {
    try { closeSidebar(); } catch (e) {}
  }
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active', 'd-block');
  const rightSidebar = document.getElementById('right-sidebar');
  if (rightSidebar) rightSidebar.classList.remove('active', 'show');

  // 5. Hide chat UI & show login overlay
  if (ui.loginOverlay) ui.loginOverlay.classList.remove('d-none');
  if (ui.chatShell) ui.chatShell.classList.add('d-none');
  
  if (ui.messagesContainer) {
    ui.messagesContainer.innerHTML = '';
  }
  const quickChatContainer = document.getElementById('quick-chat-messages');
  if (quickChatContainer) {
    quickChatContainer.innerHTML = '';
  }

  const landingList = document.getElementById('landing-users-list');
  if (landingList) landingList.innerHTML = '';

  // 6. Clean body classes and styles applied by bootstrap or modals
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  
  // 7. Hide admin sidebars/overlays if present
  document.querySelectorAll('.app-sidebar-overlay, .app-sidebar').forEach(el => el.classList.remove('show', 'active'));

  // 8. Clean private chats container UI & close active chats if using PrivateChatManager
  if (window.PrivateChatManager && typeof window.PrivateChatManager.closeChat === 'function') {
    try {
      window.PrivateChatManager.closeChat();
    } catch(e) {}
  }
  
  if (window.PrivateCallManager && typeof window.PrivateCallManager.cleanup === 'function') {
    try {
      window.PrivateCallManager.cleanup();
    } catch(e) {}
  }

  // 9. Clean room voice manager & silent audio session locally
  if (window.voiceManager) {
    try {
      if (typeof window.voiceManager.stopSilentAudioSession === 'function') {
        window.voiceManager.stopSilentAudioSession();
      }
      if (typeof window.voiceManager.cleanup === 'function') {
        window.voiceManager.cleanup();
      }
    } catch(e) {}
  }

  // 10. Restore connection status indicator to normal (green / متصل) for login interface
  const statusBar = document.getElementById('connection-status-bar');
  const statusBoxes = statusBar ? statusBar.querySelectorAll('.bg-danger, .bg-success') : [];
  const text = document.getElementById('connection-text');
  
  if (statusBar) statusBar.style.backgroundColor = '#586572';
  statusBoxes.forEach(box => {
    box.classList.remove('bg-danger');
    box.classList.add('bg-success');
  });
  if (text) text.innerText = 'متصل';
};

// Admin notifications
socket.on('admin:new-report', ({ reporter, reported, reason, proofImage }) => {
    const canSee = hasPermission('canViewReports');
  if (state.currentUser && (canSee)) {
    const html = `
      <div class="admin-report-alert" dir="rtl">
        <p class="mb-1 text-center" style="color: #666; font-size: 13px;">وصل تبليغ جديد</p>
        
        <div class="report-alert-summary">
          <div><strong>من:</strong> <span class="text-primary">${escapeHTML(reporter)}</span></div>
          <div><strong>ضد:</strong> <span class="text-danger">${escapeHTML(reported)}</span></div>
        </div>

        <div class="report-alert-section">
          <strong>سبب التبليغ:</strong>
          <div class="report-alert-reason">${escapeHTML(reason)}</div>
        </div>

        ${proofImage ? `
          <div class="report-alert-section text-center">
            <strong>صورة الإثبات:</strong>
            <div class="mt-1" style="cursor: pointer;" onclick="window.openLightbox('${proofImage}')">
              <img src="${proofImage}" class="report-alert-image">
            </div>
            <div class="small text-muted mt-1" style="font-size: 11px;">(اضغط لتكبير الصورة)</div>
          </div>
        ` : ''}
      </div>
    `;

    Swal.fire({
      title: 'تبليغ جديد',
      html: html,
      icon: 'warning',
      confirmButtonText: 'موافق'
    });

    if (typeof playAdminSound === 'function') playAdminSound();
  }
});

socket.on('duplicate-session', (data) => {
  console.warn('Duplicate session detected:', data.message);
  
  // 1. Immediately perform safe, local-only audio & voice cleanup BEFORE clearing state or disconnecting
  try {
    if (window.voiceManager) {
      if (typeof window.voiceManager.stopSilentAudioSession === 'function') {
        window.voiceManager.stopSilentAudioSession();
      }
      if (typeof window.voiceManager.cleanup === 'function') {
        window.voiceManager.cleanup();
      }
    }
  } catch (err) {
    console.error('[DuplicateSession] Local voice cleanup error:', err);
  }

  try {
    if (window.gamesManager && window.gamesManager.voiceManager) {
      if (typeof window.gamesManager.voiceManager.destroy === 'function') {
        window.gamesManager.voiceManager.destroy({ localOnly: true });
      }
    }
  } catch (err) {
    console.error('[DuplicateSession] Local game voice cleanup error:', err);
  }

  try {
    if (window.PrivateCallManager && typeof window.PrivateCallManager.cleanup === 'function') {
      window.PrivateCallManager.cleanup();
    }
  } catch (err) {}

  // 2. Custom styled Swal using classic-alert
  Swal.fire({
    title: 'تنبيه',
    icon: 'error',
    html: `
      <div style="font-size: 15px; font-weight: bold; margin-top: 10px; margin-bottom: 20px; color: #333; text-align: center;">
        ${data.message || 'لقد تم تسجيل الدخول من جهاز آخر، سيتم إغلاق هذه الجلسة.'}
      </div>
    `,
    showConfirmButton: true,
    confirmButtonText: 'موافق',
    background: '#ffffff',
    allowOutsideClick: false
  });
  
  // 3. Disable reconnection
  if (socket.io) {
    socket.io.opts.reconnection = false;
  }

  // 4. Clear socket auth
  socket.auth = {
    token: null,
    clientSessionId: null
  };

  // 5. Clear session & state
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem('chat_client_session_id');
  
  if (typeof state.setCurrentUser === 'function') state.setCurrentUser(null);
  if (typeof state.setCurrentRoomId === 'function') state.setCurrentRoomId(0);
  
  // 6. UI cleanup
  window.cleanupUIForLogin();
  
  // 7. Disconnect socket
  socket.disconnect();
});

socket.on('connect_error', (err) => {
  console.error('Socket connect_error:', err.message);
  
  if (isLoggingOut || window.isLoggingOut) {
    return;
  }
  
  const authErrorKeywords = ['token', 'user not found', 'session expired', 'authentication failed', 'token version mismatch', 'unauthorized', 'banned', 'invalid token'];
  const isAuthError = authErrorKeywords.some(keyword => err.message.toLowerCase().includes(keyword));
  
  if (isAuthError) {
    console.warn('Authentication failed on socket connect, clearing token...');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('chat_client_session_id');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    state.setCurrentUser(null);
    socket.auth = { token: null, clientSessionId: window.getClientSessionId() }; // Clear socket auth
    
    if (typeof window.cleanupUIForLogin === 'function') {
      window.cleanupUIForLogin();
    }
    if (typeof window.showAuthMessage === 'function') {
      window.showAuthMessage('انتهت الجلسة أو خطأ في المصادقة، يرجى إعادة تسجيل الدخول');
    }
    return;
  }

  const statusBar = document.getElementById('connection-status-bar');
  const statusBoxes = statusBar ? statusBar.querySelectorAll('.bg-success') : [];
  const text = document.getElementById('connection-text');
  
  statusBoxes.forEach(box => {
    box.classList.remove('bg-success');
    box.classList.add('bg-danger');
  });
  if (text) text.innerText = 'جاري الاتصال';
});

socket.on('disconnect', (reason) => {
  if (reason === 'io client disconnect' || isLoggingOut || window.isLoggingOut) {
    return;
  }
  
  const statusBar = document.getElementById('connection-status-bar');
  const statusBoxes = statusBar ? statusBar.querySelectorAll('.bg-success') : [];
  const text = document.getElementById('connection-text');
  
  statusBoxes.forEach(box => {
    box.classList.remove('bg-success');
    box.classList.add('bg-danger');
  });
  if (text) text.innerText = 'جاري الاتصال';
  
  // Silent reconnect - no updateReconnectBar
});

// Reconnection succeeded from user perspective (re-join confirmed)
socket.on('rejoin-success', () => {
  // Silent reconnect - no updateReconnectBar
});

// The same account was used to log in from another session: this session must close.
socket.on('session-expired', (data) => {
  console.warn('Session expired - logged in elsewhere:', data);
  isLoggingOut = true;
  window.isLoggingOut = true;
  if (socket && socket.io) {
    socket.io.opts.reconnection = false;
  }
  try {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('chat_client_session_id');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch (e) {}
  window.cleanupUIForLogin && window.cleanupUIForLogin();
  const msg = (data && data.message) || 'تم تسجيل دخولك من مكان آخر، هذه الجلسة مغلقة';
  if (window.Swal) {
    Swal.fire({
      icon: 'info',
      title: 'جلسة منتهية',
      text: msg,
      confirmButtonText: 'حسناً',
      allowOutsideClick: false
    }).then(() => window.location.reload());
  } else {
    window.location.reload();
  }
});

socket.on('global-limits', (limits) => {
  state.setLimits(limits);
  if (ui.chatInput) {
    ui.chatInput.setAttribute('maxlength', limits.public);
  }
  // Also update private if open
  const privInput = document.getElementById('private-chat-input');
  if (privInput) {
    privInput.setAttribute('maxlength', limits.private);
  }
});

socket.on('features-updated', async () => {
    console.log('[Socket] Features settings updated, reloading...');
    await loadFeaturesSettings();
    if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
        window.updateLiveBroadcastButtonVisibility();
    }
    if (window.renderStoriesBar) window.renderStoriesBar('wall-stories-container');
    if (typeof renderZajelTicker === 'function') renderZajelTicker();
    if (state.activeSidebarTab) {
        if (state.activeSidebarTab === 'settings' && typeof renderSettings === 'function') {
            renderSettings(true); // Re-render settings UI if open
        }
        // Force refresh tab to update search visibility
        switchSidebarTab(state.activeSidebarTab, () => {}, ui.sidebarTitle ? ui.sidebarTitle.innerText : '');
    }
});

socket.on('reveal-nickname-result', (data) => {
  const tableBody = document.getElementById('reveal-nickname-table-body');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  
  const allResults = [...data.associatedUsers, ...data.historicalLogins];
  if (allResults.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">لا توجد حسابات أو جلسات أخرى مرتبطة بهذه البيانات حالياً.</td></tr>';
  } else {
      allResults.forEach(item => {
        const row = document.createElement('tr');
        
        const isGuest = item.type === 'guest';
        const isLog = item.isHistorical === undefined && item.createdAt; // Check if it's a log

        // Status badge
        let statusBadge = '';
        if (isLog) statusBadge = '<span class="badge bg-secondary">سجل دخول سابق</span>';
        else if (item.isOnline) statusBadge = '<span class="badge bg-success">متصل الآن</span>';
        else statusBadge = '<span class="badge bg-warning">غير متصل</span>';

        // Identity
        const name = item.username || item.nickname || 'غير معروف';
        const safeName = window.escapeHTML ? window.escapeHTML(name) : name;
        
        // Source (المصدر)
        let sourceHtml = '';
        if (item.referrerSource && item.referrerSource.url) {
            const safeUrl = window.escapeHTML ? window.escapeHTML(item.referrerSource.url) : item.referrerSource.url;
            const safeLabel = window.escapeHTML ? window.escapeHTML(item.referrerSource.label) : item.referrerSource.label;
            sourceHtml = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none fw-bold text-primary" title="${safeUrl}">${safeLabel}</a>`;
        } else if (item.referrerSource && item.referrerSource.label) {
            const safeLabel = window.escapeHTML ? window.escapeHTML(item.referrerSource.label) : item.referrerSource.label;
            sourceHtml = `<span class="text-muted">${safeLabel}</span>`;
        } else {
            sourceHtml = '<span class="text-muted">دخول مباشر</span>';
        }

        // Match Reasons
        let reasonsHtml = '';
        if (item.matchReasons) {
            reasonsHtml = item.matchReasons.map(r => `<span class="badge bg-light text-dark border me-1">${r === 'fingerprint' ? 'بصمة جهاز' : 'IP'}</span>`).join('');
        }

        const safeGroup = item.group && item.group.name ? (window.escapeHTML ? window.escapeHTML(item.group.name) : item.group.name) : '-';
        const safeIp = window.escapeHTML ? window.escapeHTML(item.ip || '-') : (item.ip || '-');
        const safeFp = window.escapeHTML ? window.escapeHTML(item.fp || '-') : (item.fp || '-');
        const safeUserAgent = window.escapeHTML ? window.escapeHTML(item.userAgent || '-') : (item.userAgent || '-');

        row.innerHTML = `
          <td class="align-middle fw-bold">${safeName}</td>
          <td class="align-middle">${isGuest ? 'زائر' : 'عضو'}</td>
          <td class="align-middle">${statusBadge}</td>
          <td class="align-middle">${safeGroup}</td>
          <td class="align-middle">${reasonsHtml}</td>
          <td class="align-middle">${sourceHtml}</td>
          <td class="align-middle" dir="ltr" style="font-family: monospace;">${safeIp}</td>
          <td class="align-middle" style="font-size: 11px;">${safeFp}</td>
          <td class="align-middle" style="font-size: 11px;">${safeUserAgent}</td>
        `;
        tableBody.appendChild(row);
      });
  }
  
  const revealModal = new bootstrap.Modal(document.getElementById('revealNicknameModal'));
  revealModal.show();
});

socket.on('user_updated', (updatedUser) => {
  setTimeout(updateFilterMonitorVisibility, 500);
  if (state.currentUser && state.currentUser.id === updatedUser.id) {
    // Merge updated user data with current user state
    const newUser = { ...state.currentUser, ...updatedUser };
    
    // Ensure roleRank is directly on the user object for easier access
    if (newUser.group && newUser.group.roleRank !== undefined) {
      newUser.roleRank = newUser.group.roleRank;
    }
    
    // Ensure userId is present for compatibility
    if (newUser.id && !newUser.userId) {
      newUser.userId = newUser.id;
    }
    
    state.setCurrentUser(newUser);
    updateExtraActionsVisibility();
    
    // Update local storage if it's stored there
    const storedUser = sessionStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        // Keep the token if it exists in local storage
        const token = parsed.token;
        const newStoredUser = { ...newUser, token };
        sessionStorage.setItem('user', JSON.stringify(newStoredUser));
      } catch (e) {}
    }
    
    // Re-render UI elements that depend on user permissions
    updateUIForUser();

    if (typeof renderZajelTicker === 'function') {
      renderZajelTicker();
    }
    
    // Show a notification to the user about their update
    // showToast('تم تحديث بياناتك وصلاحياتك من قبل الإدارة', 'info');
  }
  window.voiceManager && window.voiceManager.updateUser(updatedUser);
});



socket.on('force-ban-cookie', () => {
  getFingerprint().then(fp => {
    fetch('/api/ban-cookie/set', {
      method: 'POST',
      body: JSON.stringify({ fp }),
      headers: { 'Content-Type': 'application/json' }
    }).catch(e => console.warn(e));
  });
});

socket.on('banned', ({ reason, expiresAt }) => {
  let errorHtml = reason || 'تم حظرك من الموقع';
  
  const now = Date.now();
  const expiryTime = expiresAt ? new Date(expiresAt).getTime() : null;

  if (expiryTime && expiryTime > now) {
    const expiryDate = new Date(expiresAt);
    errorHtml += `<br><br><b>ينتهي الحظر في:</b> ${expiryDate.toLocaleString('ar-EG')}`;
  } else {
    errorHtml += `<br><br><b>نوع الحظر:</b> دائم`;
  }

  Swal.fire({
    title: 'تم حظرك',
    html: errorHtml,
    icon: 'error',
    confirmButtonText: 'إغلاق',
    allowOutsideClick: false,
    allowEscapeKey: false
  }).then(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    window.location.href = '/';
  });
});

socket.on('kicked', ({ reason }) => {
  window.showChatAlert({ message: reason, icon: 'warning' }).then(() => {
    window.location.reload();
  });
});

socket.on('needpass', (data) => {
  const roomName = data && data.roomName ? data.roomName : 'الغرفة';
  window.showChatAlert({ message: 'هذه الغرفة محمية بكلمة مرور (' + roomName + ')', icon: 'warning' });
});

socket.on('room-join-error', ({ msg }) => {
  if (msg) window.showChatAlert({ message: msg, icon: 'error' });
});

socket.on('room-ban-error', ({ msg }) => {
  if (msg) window.showChatAlert({ message: msg, icon: 'error' });
});

socket.on('muted', ({ reason, expiresAt, seconds }) => {
  let text = reason || 'تم كتم صوتك';
  if (expiresAt) {
    try { text += ' حتى ' + new Date(expiresAt).toLocaleString('ar'); } catch (e) {}
  } else if (seconds && seconds > 0) {
    text += ' لمدة ' + seconds + ' ثانية';
  }
  window.showChatAlert({ message: text, icon: 'warning' });
});

socket.on('unmuted', () => {
  window.showChatAlert({ message: 'تم فك الكتم عنك', icon: 'success' });
});

socket.on('room-bans-list', (bans) => {
  const list = document.getElementById('room-bans-list');
  if (!list) return;

  if (!bans || bans.length === 0) {
    list.innerHTML = '<div class="p-2 text-center text-muted small">لا يوجد محظورون حالياً</div>';
    return;
  }

  list.innerHTML = bans.map(ban => `
    <div class="list-group-item d-flex justify-content-between align-items-center p-2 rounded-0">
      <div class="d-flex flex-column">
        <span class="fw-bold small">${ban.username}</span>
        <span class="text-muted" style="font-size: 10px;">بواسطة: ${ban.bannedBy}</span>
      </div>
      <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="window.unbanFromRoom(${ban.id}, ${ban.roomId})">
        <i class="fas fa-trash-alt"></i> فك الحظر
      </button>
    </div>
  `).join('');
});

window.unbanFromRoom = (banId, roomId) => {
  Swal.fire({
    title: 'فك الحظر',
    text: 'هل أنت متأكد من فك الحظر عن هذا العضو؟',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم',
    cancelButtonText: 'إلغاء'
  }).then((result) => {
    if (result.isConfirmed) {
      socket.emit('room-unban-user', { banId, roomId });
    }
  });
};

socket.on('force-change-room', ({ roomId }) => {
  if (window.musicManager) window.musicManager.reset();
  state.setCurrentRoomId(roomId);
  state.setIsRoomFrozen(false);
  ui.chatInput.disabled = false;
  ui.chatInput.placeholder = "اكتب رسالتك هنا...";

  if (window.musicManager) window.musicManager.refreshState();
  socket.emit('change-room', { roomId });
  updateChatUI();
});

// --- Filter Monitor Frontend Implementation ---
let localMonitoredMessages = [];
let monitorUnreadCount = 0;
let isMonitorPanelOpen = false;

function updateFilterMonitorVisibility() {
  const container = document.getElementById('filter-monitor-wrapper');
  const menuBtn = document.getElementById('filter-monitor-menu-btn');
  if (!container) return;

  const isSuperAdmin = false;
  const possessesPermission = hasPermission('canViewFilterMonitorMessages') || isSuperAdmin;

  if (possessesPermission) {
    if (menuBtn) menuBtn.classList.remove('d-none');
  } else {
    if (menuBtn) menuBtn.classList.add('d-none');
    if (isMonitorPanelOpen) {
      window.toggleFilterMonitorPanel();
    }
  }
}

function renderMonitoredMessages() {
  const messagesDiv = document.getElementById('filter-monitor-messages');
  if (!messagesDiv) return;

  if (localMonitoredMessages.length === 0) {
    messagesDiv.innerHTML = `<p class="text-muted text-center py-4 my-2" style="font-size: 0.9rem;">لا يوجد رسائل مراقبة حالياً</p>`;
    return;
  }

  const escapeHTML = window.escapeHTML || ((str) => {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  });

  messagesDiv.innerHTML = localMonitoredMessages.map(msg => {
    const displayTime = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    
    let typeClass = 'monitor-badge-public';
    let typeLabel = 'عامة';
    if (msg.messageType === 'private') {
      typeClass = 'monitor-badge-private';
      typeLabel = 'خاصة';
    } else if (msg.messageType === 'notification') {
      typeClass = 'monitor-badge-notification';
      typeLabel = 'تنبيه';
    } else if (msg.messageType === 'edit') {
      typeClass = 'monitor-badge-edit';
      typeLabel = 'تعديل';
    }

    let targetInfo = '';
    if (msg.messageType === 'private' || msg.messageType === 'edit' || msg.messageType === 'notification') {
      if (msg.receiverUsername) {
        const rxUserObj = state.currentUsers.find(u => u.username === msg.receiverUsername) || { username: msg.receiverUsername };
        const rxIdentity = window.renderUserIdentity ? window.renderUserIdentity(rxUserObj, { tag: 'span' }) : `<span class="text-info">${escapeHTML(msg.receiverUsername)}</span>`;
        targetInfo = ` <i class="fas fa-arrow-left text-muted mx-1" style="font-size:0.75rem;"></i> ${rxIdentity}`;
      }
    } else {
      if (msg.roomName) {
        targetInfo = ` <span class="text-muted text-xs ms-1">(${escapeHTML(msg.roomName)})</span>`;
      }
    }

    const wordsBadges = (msg.matchedWords || []).map(w => `<span class="monitor-word-pill">${escapeHTML(w)}</span>`).join(' ');

    const txUserObj = state.currentUsers.find(u => u.username === msg.senderUsername) || { username: msg.senderUsername };
    const txIdentity = window.renderUserIdentity ? window.renderUserIdentity(txUserObj, { tag: 'span' }) : `<span class="text-warning fw-bold">${escapeHTML(msg.senderUsername)}</span>`;

    return `
      <div class="monitor-item-card" dir="rtl">
        <div class="monitor-item-meta">
          <div class="d-flex align-items-center flex-wrap gap-1">
            <span class="monitor-item-badge ${typeClass}">${typeLabel}</span>
            <span style="font-size: 0.85rem; margin-right: 4px;">${txIdentity}</span>
            ${targetInfo}
          </div>
          <span class="text-muted text-xs" style="font-size: 0.72rem;">${displayTime}</span>
        </div>
        <div class="mb-2 d-flex flex-wrap gap-1 align-items-center">
          <span class="text-muted text-xs me-1" style="font-size:0.72rem; margin-left: 4px;">الكلمات المطابقة:</span>
          ${wordsBadges}
        </div>
        <div class="monitor-item-text">
          ${escapeHTML(msg.originalText)}
        </div>
      </div>
    `;
  }).join('');
}

socket.on('filter:monitor:new', (payload) => {
  localMonitoredMessages.unshift(payload);
  
  if (localMonitoredMessages.length > 100) {
    localMonitoredMessages = localMonitoredMessages.slice(0, 100);
  }

  if (!isMonitorPanelOpen) {
    monitorUnreadCount++;
    updateFilterMonitorBadges();
    showFilterNotification(payload);
  }

  const isSuperAdmin = false;
  const possessesPermission = hasPermission('canViewFilterMonitorMessages') || isSuperAdmin;
  if (possessesPermission) {
    renderMonitoredMessages();
  }
});

function showFilterNotification(payload) {
    if (!hasPermission('canViewFilterMonitorMessages')) return;

    const layer = document.getElementById('filter-notification-layer');
    if (!layer) return;

    const toast = document.createElement('div');
    toast.className = 'filter-notification-toast';
    
    // Construct user object based on the new 'sender' object in payload
    const sender = payload.sender;
    
    // Fallback if sender data is missing
    const userDisplay = sender ? renderUserIdentity(sender) : 'زائر';
    const avatarUrl = sender ? window.getAvatarUrl(sender) : '/images/default-avatar.png';
    
    toast.innerHTML = `
        <img src="${avatarUrl}" class="filter-toast-avatar" alt="avatar" onerror="this.src='/images/default-avatar.png'">
        <div class="filter-toast-content">
            <div class="filter-toast-username">${userDisplay}</div>
            <div class="filter-toast-message">${escapeHTML(payload.originalText || 'رسالة مخالفة')}</div>
        </div>
    `;
    
    // Add to layer
    layer.appendChild(toast);
    
    // Animation trigger
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500); // Wait for transition
    }, 5000);
}

window.updateFilterNotificationBadge = function(count) {
    const badge = document.getElementById('filter-notification-badge');
    const menuDot = document.getElementById('filter-monitor-menu-dot');
    
    const safeCount = Math.max(0, Number(count) || 0);
    if (safeCount <= 0) {
        if (badge) {
            badge.textContent = '';
            badge.hidden = true;
            badge.classList.remove('is-visible', 'd-block');
            badge.classList.add('d-none');
            badge.setAttribute('aria-hidden', 'true');
            badge.style.display = 'none';
        }
        if (menuDot) {
            menuDot.classList.add('d-none');
            menuDot.textContent = '';
            menuDot.style.display = 'none';
        }
        return;
    }
    
    if (badge) {
        badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
        badge.hidden = false;
        badge.classList.add('is-visible', 'd-block');
        badge.classList.remove('d-none');
        badge.setAttribute('aria-hidden', 'false');
        badge.style.display = 'block';
    }
    if (menuDot) {
        menuDot.classList.remove('d-none');
        menuDot.style.display = 'block';
    }
};

window.updateFilterNotificationBadge(0);

window.updateFilterMonitorBadges = function() {
    window.updateFilterNotificationBadge(typeof monitorUnreadCount !== 'undefined' ? monitorUnreadCount : 0);
};
window.toggleFilterMonitorPanel = function() {
  const panel = document.getElementById('filter-monitor-panel');
  const backdrop = document.getElementById('filter-monitor-backdrop');
  if (!panel) return;

  isMonitorPanelOpen = !isMonitorPanelOpen;
  if (isMonitorPanelOpen) {
    panel.classList.add('open');
    if (backdrop) backdrop.classList.remove('d-none');
    
    monitorUnreadCount = 0;
    updateFilterMonitorBadges();
    renderMonitoredMessages();
  } else {
    panel.classList.remove('open');
    if (backdrop) backdrop.classList.add('d-none');
  }
};

window.clearFilterMonitorLocal = function() {
  localMonitoredMessages = [];
  renderMonitoredMessages();
};





setInterval(updateFilterMonitorVisibility, 3000);
// ----------------------------------------------------

socket.on('notification', (data) => {
  if (data.type === 'stats_updated') {
    let displayValue = data.value;
    if (data.statType === 'likes' || data.statType === 'rep') {
      displayValue = formatCompactNumber(data.value);
    }
    
    const statNames = {
      'likes': 'إعجاباتك',
      'rep': 'نقاطك',
      'topic': 'زخرفة اسمك',
      'rank': 'رتبتك'
    };
    
    const statName = statNames[data.statType] || 'بياناتك';
    const adminName = data.adminName || 'الإدارة';
    const adminPic = data.adminPic || '/img/default-avatar.png';
    const adminTopic = data.adminTopic || adminName;
    
    console.log('Notification received:', data);
    console.log('Admin Info to display:', { adminName, adminPic, adminTopic });
    
    let message = data.message;
    if (!message) {
      if (data.statType === 'topic') {
        message = `تم تغيير الزخرفة الخاصة بك إلى: ${displayValue}`;
      } else if (data.statType === 'rank') {
        message = `تم تغيير رتبتك إلى: ${displayValue}`;
      } else {
        message = `تم تغيير ${statName} إلى ${displayValue}`;
      }
    } else {
      // Keep HTML if present in message, do not strip it
    }

    window.showChatAlert({
      message: message,
      senderName: adminTopic || adminName,
      senderAvatar: adminPic,
      showSender: true,
      isHtml: true
    });

    // Update local user stats if it's the current user
    if (state.currentUser && state.currentUser.id === data.userId) {
      if (data.statType === 'likes') state.currentUser.likes = data.value;
      if (data.statType === 'rep') state.currentUser.rep = data.value;
      if (data.statType === 'topic') state.currentUser.topic = data.value;
      updateUIForUser();
    }
  }
});

function saveIgnoredUsers() {
  try {
    sessionStorage.setItem('ignoredUsers', JSON.stringify([...state.ignoredUsers]));
  } catch (e) {
    console.warn('Could not save ignored users to sessionStorage:', e);
  }
}

state.loadIgnoredUsers();

function hasPermission(permission) {
  return state.hasPermission(state.currentUser, permission);
}

function formatCompactNumber(number) {
  if (number === null || number === undefined) return '0';
  const num = Number(number);
  if (isNaN(num)) return '0';
  if (num <= 1000) return num.toString();
  
  const units = [
    { value: 1e24, symbol: "Y" }, // Yotta
    { value: 1e21, symbol: "Z" }, // Zetta
    { value: 1e18, symbol: "E" }, // Exa
    { value: 1e15, symbol: "P" }, // Peta
    { value: 1e12, symbol: "T" }, // Tera
    { value: 1e9, symbol: "b" },
    { value: 1e6, symbol: "m" },
    { value: 1e3, symbol: "k" }
  ];
  
  for (let i = 0; i < units.length; i++) {
    if (num >= units[i].value) {
      const formatted = (num / units[i].value).toFixed(1).replace(/\.0$/, '');
      return formatted + units[i].symbol;
    }
  }
  return num.toString();
}

async function getFingerprint() {
  let fpValue = localStorage.getItem('chat_fingerprint');
  if (fpValue) return fpValue;

  try {
    // Attempt to use FingerprintJS
    const fpPromise = import('https://openfpcdn.io/fingerprintjs/v4').then(FingerprintJS => FingerprintJS.load());
    const fp = await fpPromise;
    const result = await fp.get();
    fpValue = result.visitorId;
    localStorage.setItem('chat_fingerprint', fpValue);
    return fpValue;
  } catch (err) {
    console.error('Error loading FingerprintJS, using fallback.');
    // Fallback manual fingerprint
    let hasSessionStorage = false;
    let hasLocalStorage = false;
    let hasIndexedDB = false;
    
    try { hasSessionStorage = !!window.sessionStorage; } catch (e) {}
    try { hasLocalStorage = !!window.localStorage; } catch (e) {}
    try { hasIndexedDB = !!window.indexedDB; } catch (e) {}

    const components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      hasSessionStorage,
      hasLocalStorage,
      hasIndexedDB,
    ];
    const str = components.join('###');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const fallbackFp = 'fb_' + Math.abs(hash).toString(16);
    try {
      localStorage.setItem('chat_fingerprint', fallbackFp);
    } catch(e) {}
    return fallbackFp;
  }
}

function applyUserFontSize() {
  const rawValue = Number(sessionStorage.getItem('userFontSize') || '100');
  const percent = Number.isFinite(rawValue)
    ? Math.min(150, Math.max(50, rawValue))
    : 100;

  const scale = percent / 100;
  const shell = ui.chatShell;
  if (!shell) return;

  const viewportHeight = Math.round(getVisibleViewportHeight());

  const layoutHeight = Math.ceil(viewportHeight / scale);

  shell.style.height = `${layoutHeight}px`;
  shell.style.flex = `0 0 ${layoutHeight}px`;

  if (CSS.supports && CSS.supports('zoom', '1')) {
    shell.style.zoom = String(scale);
    shell.style.transform = '';
    shell.style.transformOrigin = '';
    shell.style.width = '100%';
  } else {
    shell.style.zoom = '';
    shell.style.transform = `scale(${scale})`;
    shell.style.transformOrigin = 'top center';
    shell.style.width = `${100 / scale}%`;
  }
}

// Sidebar Logic
function handleBrowseRoomsClick(e) {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const btn = e.target.closest('#browse-rooms-btn');
  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    toggleSidebar('rooms', getRoomsSidebarTitle(), loadRooms);
  }
}

window.toggleSidebar = toggleSidebar;
window.openSidebarTab = openSidebarTab;
window.joinRoom = (roomId) => {
    pendingInitialRoomSelection = false;
    window.changeRoom(roomId);
};

window.renderRoomsGrid = () => {
    const gridContainer = document.getElementById('rooms-grid-container');
    if (!gridContainer) return;
    
    // Get all rooms (already in window.roomsData or state.rooms)
    const rooms = window.roomsData ? Object.values(window.roomsData).filter(r => r.isActive) : [];
    
    gridContainer.innerHTML = rooms.map(room => `
      <div class="col">
        ${renderRoomCardHTML(room)}
      </div>
    `).join('');
    
    document.getElementById('room-grid-overlay').classList.remove('d-none');
};

function getVisibleRoomsForSidebar(rooms = state.rooms || []) {
  const canSeeWaitingRoomInList =
    state.isInWaitingRoom ||
    hasPermission('canManageRooms') ||
    hasPermission('canManageUsers');

  return rooms.filter(r => {
    if (!r.isActive) return false;

    if (state.waitingRoomId && Number(r.id) === Number(state.waitingRoomId)) {
      return canSeeWaitingRoomInList;
    }

    return true;
  });
}

function getRoomsSidebarTitle(rooms = state.rooms || []) {
  const count = getVisibleRoomsForSidebar(rooms).length;
  return count > 0 ? `الغرف (${count})` : 'الغرف';
}

function openSidebarTab(tab, title, contentLoader, options = {}) {
  console.log('openSidebarTab called for:', tab);

  if (typeof resetSidebarMemberSearch === 'function') {
    resetSidebarMemberSearch();
  }
  
  // Close spectator game if switching away from games tab
  if (tab !== 'games' && window.GamesManager && window.GamesManager.activeGame && window.GamesManager.activeGame.state && window.GamesManager.activeGame.state.isSpectator) {
    window.GamesManager.closeActiveGame();
  }

  // Re-query if null
  if (!ui.sidebar) ui.sidebar = document.getElementById('right-sidebar');
  if (!ui.sidebarOverlay) ui.sidebarOverlay = document.getElementById('sidebar-overlay');
  if (!ui.sidebarTitle) ui.sidebarTitle = document.getElementById('sidebar-title');
  
  if (!ui.sidebar) return;

  const updateContent = () => {
    if (ui.sidebarTitle) {
      ui.sidebarTitle.innerText = tab === 'rooms' ? getRoomsSidebarTitle() : title;
    }
    
    const sidebarHeader = document.querySelector('.sidebar-header');
    if (sidebarHeader) {
      sidebarHeader.style.display = 'flex';
    }
    
    ui.sidebar.classList.add('open');
    if (ui.sidebarOverlay) ui.sidebarOverlay.classList.add('show');
    
    state.setActiveSidebarTab(tab);
    
    if (tab !== 'settings') {
      currentSettingsView = null;
    } else if (!loadedTabs['settings'] || options.forceRefresh) {
      currentSettingsView = 'settings';
    }
    
    // Re-query containers
    if (!ui.sidebarUsersWrapper) ui.sidebarUsersWrapper = document.getElementById('sidebar-users-wrapper');
    if (!ui.sidebarUsersContainer) ui.sidebarUsersContainer = document.getElementById('sidebar-users-container');
    if (!ui.sidebarRoomsContainer) ui.sidebarRoomsContainer = document.getElementById('sidebar-rooms-container');
    if (!ui.sidebarGamesContainer) ui.sidebarGamesContainer = document.getElementById('sidebar-games-container');
    if (!ui.sidebarSpectateContainer) ui.sidebarSpectateContainer = document.getElementById('sidebar-spectate-container');
    if (!ui.sidebarWallContainer) ui.sidebarWallContainer = document.getElementById('sidebar-wall-container');
    if (!ui.sidebarSettingsContainer) ui.sidebarSettingsContainer = document.getElementById('sidebar-settings-container');
    if (!ui.sidebarPrivateContainer) ui.sidebarPrivateContainer = document.getElementById('sidebar-private-container');

    const containers = [
      ui.sidebarUsersWrapper, ui.sidebarRoomsContainer, ui.sidebarGamesContainer,
      ui.sidebarSpectateContainer,
      ui.sidebarWallContainer, ui.sidebarSettingsContainer, ui.sidebarPrivateContainer
    ];
    
    const activeContainerMap = {
      'users': ui.sidebarUsersWrapper,
      'rooms': ui.sidebarRoomsContainer,
      'games': ui.sidebarGamesContainer,
      'spectate': ui.sidebarSpectateContainer,
      'wall': ui.sidebarWallContainer,
      'settings': ui.sidebarSettingsContainer,
      'private': ui.sidebarPrivateContainer
    };
    
    containers.forEach(c => { if (c) c.classList.add('d-none'); });
    const activeContainer = activeContainerMap[tab];
    if (activeContainer) activeContainer.classList.remove('d-none');
    
    // Manage sidebar search container visibility
    if (ui.sidebarSearchContainer) {
      const isSearchEnabled = window.featuresSettings?.sidebarMemberSearchEnabled !== false;
      if (tab === 'users' && isSearchEnabled) {
        ui.sidebarSearchContainer.classList.remove('sidebar-search-hidden');
        ui.sidebarSearchContainer.classList.add('sidebar-search-visible');
        ui.sidebarSearchContainer.style.display = 'block';
      } else {
        ui.sidebarSearchContainer.classList.remove('sidebar-search-visible');
        ui.sidebarSearchContainer.classList.add('sidebar-search-hidden');
        ui.sidebarSearchContainer.style.display = 'none';
      }
    }

    const forceRefresh = options.forceRefresh === true;
    if (!loadedTabs[tab] || forceRefresh) {
      if (contentLoader) contentLoader();
      loadedTabs[tab] = true;
    }
    
    // Update active state on buttons
    [ui.usersTabBtn, ui.privateTabBtn, ui.roomsTabBtn, ui.wallTabBtn, ui.settingsBtn].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`${tab}-tab-btn`) || (tab === 'settings' ? ui.settingsBtn : null);
    if (activeBtn) activeBtn.classList.add('active');
  };

  updateContent();
}

let wallNotificationCount = 0;

function updateWallBadge() {
  const badge = document.getElementById('wall-notification-badge');
  if (!badge) return;
  if (wallNotificationCount > 0) {
    badge.innerText = wallNotificationCount;
    badge.classList.remove('d-none');
  } else {
    badge.classList.add('d-none');
  }
}

function closePrivateChatBeforeSidebarChange() {
  const manager = window.PrivateChatManager;
  if (manager && typeof manager.closeChat === 'function' && manager.isWindowOpen) {
    manager.closeChat();
  }
}

function toggleSidebar(tab, title, contentLoader, options = {}) {
  closePrivateChatBeforeSidebarChange();
  
  if (tab === 'wall') {
    wallNotificationCount = 0;
    updateWallBadge();
  }

  if (!ui.sidebar) ui.sidebar = document.getElementById('right-sidebar');
  const isAlreadyOpen = ui.sidebar && ui.sidebar.classList.contains('open');
  
  if (isAlreadyOpen && state.activeSidebarTab === tab && !options.forceRefresh) {
    closeSidebar();
  } else {
    openSidebarTab(tab, title, contentLoader, options);
  }
}

function closeSidebar() {
  // Close spectator game if sidebar is closed
  if (window.GamesManager && window.GamesManager.activeGame && window.GamesManager.activeGame.state && window.GamesManager.activeGame.state.isSpectator) {
    window.GamesManager.closeActiveGame();
  }

  if (typeof resetSidebarMemberSearch === 'function') {
    resetSidebarMemberSearch();
  }

  if (state.activeSidebarTab === 'settings') {
    currentSettingsView = null;
    loadedTabs['settings'] = false;
  }

  ui.sidebar.classList.remove('open');
  ui.sidebarOverlay.classList.remove('show');
  ui.sidebarSearchContainer.classList.remove('sidebar-search-visible');
  ui.sidebarSearchContainer.classList.add('sidebar-search-hidden');
  state.setActiveSidebarTab(null);
  [ui.usersTabBtn, ui.privateTabBtn, ui.roomsTabBtn, ui.wallTabBtn, ui.settingsBtn].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
}

if (!ui.closeSidebar) ui.closeSidebar = document.getElementById('close-sidebar');
if (ui.closeSidebar) ui.closeSidebar.onclick = closeSidebar;

if (!ui.sidebarOverlay) ui.sidebarOverlay = document.getElementById('sidebar-overlay');
if (ui.sidebarOverlay) ui.sidebarOverlay.onclick = closeSidebar;

if (!ui.usersTabBtn) ui.usersTabBtn = document.getElementById('users-tab-btn');
if (ui.usersTabBtn) ui.usersTabBtn.addEventListener('click', () => toggleSidebar('users', 'المتواجدون', () => renderUsersInSidebar(state.currentUsers)));

if (!ui.roomsTabBtn) ui.roomsTabBtn = document.getElementById('rooms-tab-btn');
if (ui.roomsTabBtn) ui.roomsTabBtn.addEventListener('click', () => toggleSidebar('rooms', getRoomsSidebarTitle(), loadRooms));


if (!ui.wallTabBtn) ui.wallTabBtn = document.getElementById('wall-tab-btn');
if (ui.wallTabBtn) ui.wallTabBtn.addEventListener('click', () => toggleSidebar('wall', 'الحائط', loadWallSidebar));

if (!ui.privateTabBtn) ui.privateTabBtn = document.getElementById('private-tab-btn');
if (ui.privateTabBtn) ui.privateTabBtn.addEventListener('click', () => toggleSidebar('private', 'المحادثات الخاصة', () => {
  if (window.PrivateChatManager) {
    window.PrivateChatManager.renderSidebar();
  }
}));

if (!ui.settingsBtn) ui.settingsBtn = document.getElementById('settings-btn');
if (ui.settingsBtn) ui.settingsBtn.onclick = () => toggleSidebar('settings', 'الضبط والإعدادات', renderSettings);

// Sidebar Search Logic
let currentSidebarSearchQuery = '';
let sidebarSearchTimeout;

function resetSidebarMemberSearch() {
  currentSidebarSearchQuery = '';
  if (ui.sidebarSearchInput) {
    ui.sidebarSearchInput.value = '';
  }
}
window.resetSidebarMemberSearch = resetSidebarMemberSearch;

if (ui.sidebarSearchInput) {
  ui.sidebarSearchInput.addEventListener('input', (e) => {
    currentSidebarSearchQuery = e.target.value.trim().toLowerCase();
    clearTimeout(sidebarSearchTimeout);
    sidebarSearchTimeout = setTimeout(() => {
      if (state.activeSidebarTab === 'users') {
        renderUsersInSidebar(state.currentUsers);
      }
    }, 100); // More instant
  });
}

window.openCreateRoomModal = () => {
  const modalEl = document.getElementById('createRoomModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  const form = document.getElementById('create-room-form');
  const modalTitle = document.querySelector('#createRoomModal .modal-title');
  const submitBtn = form.querySelector('button[type="submit"]');

  modalTitle.innerHTML = '<i class="fas fa-comments"></i><span>إنشاء غرفة جديدة</span>';
  submitBtn.innerHTML = '<i class="fas fa-plus"></i> إنشاء الغرفة';
  
  form.reset();
  form.dataset.mode = 'create';
  
  // Hide moderator section on create
  const modSection = document.getElementById('moderator-section');
  if (modSection) modSection.classList.add('d-none');
  
  // Hide mic management section on create
  const micSection = document.getElementById('mic-management-section');
  if (micSection) micSection.classList.add('d-none');
  
  // Reset previews
  document.getElementById('thumbnail-preview').src = 'https://picsum.photos/seed/room/100/100';
  document.getElementById('banner-preview').src = 'https://picsum.photos/seed/banner/100/100';
  
  // Hide remove password container on create
  const removePasswordContainer = document.getElementById('remove-password-container');
  if (removePasswordContainer) removePasswordContainer.classList.add('d-none');
  const removePasswordCheckbox = form.querySelector('[name="removePassword"]');
  if (removePasswordCheckbox) removePasswordCheckbox.checked = false;

  // Set default colors: White bg, Black text
  if (form.querySelector('[name="roomNameColorHex"]')) {
    form.querySelector('[name="roomNameColorHex"]').value = '#000000';
  }
  if (form.querySelector('[name="roomMessageColorHex"]')) {
    form.querySelector('[name="roomMessageColorHex"]').value = '#000000';
  }
  if (form.querySelector('[name="roomBackgroundColorHex"]')) {
    form.querySelector('[name="roomBackgroundColorHex"]').value = '#ffffff';
  }

  modal.show();
};

window.populateModeratorSection = (room) => {
  const modSection = document.getElementById('moderator-section');
  if (!modSection) return;
  
  const isRoomOwner = room.ownerId === state.currentUser.id;
  const isGlobalAdmin = hasPermission('canManageRooms');
  
  if (isRoomOwner || isGlobalAdmin) {
    modSection.classList.remove('d-none');
    
    const modSelect = document.getElementById('moderator-select');
    modSelect.innerHTML = '<option value="">اختر عضواً لإضافته كمراقب</option>';
    
    const modList = document.getElementById('moderators-list');
    modList.innerHTML = '';
    
    // Populate moderators
    if (room.moderators && Array.isArray(room.moderators)) {
      room.moderators.forEach(mod => {
        const modId = typeof mod === 'number' ? mod : mod.userId;
        const modUser = state.currentUsers.find(u => u.userId === modId);
        const modName = modUser ? modUser.username : (mod.username || `عضو (${modId})`);
        
        const badge = document.createElement('span');
        badge.className = 'badge bg-warning text-dark d-flex align-items-center gap-2 p-2 px-3 rounded-pill';
        badge.style.fontSize = 'var(--font-size)';
        badge.style.fontWeight = 'var(--font-weight)';
        badge.innerHTML = `
          ${modName} 
          <i class="fas fa-cog cursor-pointer ms-1" title="تعديل الصلاحيات" onclick="window.openModeratorPermissionsModal(${modId}, '${modName}', ${room.id})"></i>
          <i class="fas fa-times cursor-pointer" title="حذف المراقب" onclick="removeModerator(${modId}, ${room.id})"></i>
        `;
        modList.appendChild(badge);
      });
    }
    
    // Optimized moderator IDs set lookup
    const modIdsSet = new Set((room.moderators || []).map(m => typeof m === 'number' ? m : Number(m.userId)));
    
    // Populate select with non-moderator registered users in the room
    state.currentUsers.forEach(u => {
      const isMod = modIdsSet.has(Number(u.userId));
      if (u.roomId === room.id && u.type === 'member' && !isMod) {
        const option = document.createElement('option');
        option.value = u.userId;
        option.textContent = u.username;
        modSelect.appendChild(option);
      }
    });

    const addModBtn = document.getElementById('add-moderator-btn');
    addModBtn.onclick = () => {
      const userId = modSelect.value;
      if (!userId) return;
      socket.emit('toggle-room-moderator', { targetUserId: userId, roomId: room.id });
      // UI will update via room-updated event
    };
  } else {
    modSection.classList.add('d-none');
  }
};

window.populateMicManagementSection = (room) => {
  const micSection = document.getElementById('mic-management-section');
  const micList = document.getElementById('mic-management-list');
  if (!micSection || !micList) return;

  const isRoomOwner = room.ownerId === state.currentUser.id;
  const isGlobalAdmin = hasPermission('canManageRooms');
  const modObj = (room.moderators || []).find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
  const permissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
  const canManageMics = isRoomOwner || isGlobalAdmin || permissions.includes('canToggleMicLock');

  if (canManageMics) {
    micSection.classList.remove('d-none');
    micList.innerHTML = '';

    const maxMics = room.roomMaxMicSlots || 4;
    const lockedMics = room.lockedMics || [];

    for (let i = 0; i < maxMics; i++) {
      const isLocked = lockedMics.includes(i);
      const micBtn = document.createElement('div');
      micBtn.className = `mic-manage-btn p-2 border rounded cursor-pointer d-flex flex-column align-items-center justify-content-center ${isLocked ? 'bg-danger text-white' : 'bg-success text-white'}`;
      micBtn.style.width = '40px';
      micBtn.style.height = '40px';
      micBtn.innerHTML = `
        <i class="fas ${isLocked ? 'fa-lock' : 'fa-microphone'}"></i>
        <span style="font-size: 9px;">${i + 1}</span>
      `;
      micBtn.onclick = () => {
        socket.emit('toggle-mic-lock', { roomId: room.id, micIndex: i });
      };
      micList.appendChild(micBtn);
    }
  } else {
    micSection.classList.add('d-none');
  }
};

window.openModeratorPermissionsModal = async (userId, username, roomId) => {
  const modalEl = document.getElementById('modPermissionsModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  
  document.getElementById('mod-perm-username').textContent = username;
  const form = document.getElementById('mod-permissions-form');
  form.targetUserId.value = userId;
  
  // Reset checkboxes
  form.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  
  // Fetch current permissions
  try {
    const response = await fetch(`/api/rooms/${roomId}?t=${Date.now()}`);
    const room = await response.json();
    const mod = (room.moderators || []).find(m => (typeof m === 'number' ? m === Number(userId) : Number(m.userId) === Number(userId)));
    
    if (mod && typeof mod === 'object' && mod.permissions) {
      mod.permissions.forEach(p => {
        const cb = form.querySelector(`input[value="${p}"]`);
        if (cb) cb.checked = true;
      });
    }
  } catch (error) {
    console.error('Failed to fetch room data for permissions:', error);
  }
  
  form.onsubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const permissions = formData.getAll('permissions');
    socket.emit('update-room-moderator-permissions', { targetUserId: userId, targetUsername: username, roomId, permissions });
    modal.hide();
  };
  
  modal.show();
};

window.openEditRoomModal = async () => {
  const roomId = state.currentRoomId;
  if (!roomId) {
    showToast('لا توجد غرفة حالية');
    return;
  }
  
  // Fetch room data
  try {
    const res = await fetch(`/api/rooms/${roomId}?t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to fetch room data');
    const room = await res.json();
    
    // Ensure moderators and lockedMics are Arrays (safe parsing if received as string)
    if (room) {
      if (typeof room.moderators === 'string') {
        try {
          room.moderators = JSON.parse(room.moderators);
        } catch (e) {
          console.error('Failed to parse moderators string:', e);
          room.moderators = [];
        }
      }
      if (!room.moderators || !Array.isArray(room.moderators)) {
        room.moderators = [];
      }

      if (typeof room.lockedMics === 'string') {
        try {
          room.lockedMics = JSON.parse(room.lockedMics);
        } catch (e) {
          console.error('Failed to parse lockedMics string:', e);
          room.lockedMics = [];
        }
      }
      if (!room.lockedMics || !Array.isArray(room.lockedMics)) {
        room.lockedMics = [];
      }
    }
    
    // Populate modal
    const modalEl = document.getElementById('createRoomModal');
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    const form = document.getElementById('create-room-form');
    const modalTitle = document.querySelector('#createRoomModal .modal-title');
    const submitBtn = form.querySelector('button[type="submit"]');

    modalTitle.innerHTML = '<i class="fas fa-edit"></i><span>تعديل الغرفة</span>';
    submitBtn.innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات';
    
    // Fill form fields
    form.querySelector('[name="name"]').value = room.name || '';
    form.querySelector('[name="roomDescription"]').value = room.roomDescription || '';
    form.querySelector('[name="roomWelcomeMessage"]').value = room.roomWelcomeMessage || '';
    form.querySelector('[name="requiredLikes"]').value = room.requiredLikes || '';
    form.querySelector('[name="roomPassword"]').value = ''; // Don't show real password
    form.querySelector('[name="capacity"]').value = room.capacity || 4;
    if (form.querySelector('[name="roomMaxMicSlots"]')) form.querySelector('[name="roomMaxMicSlots"]').value = room.roomMaxMicSlots || 4;
    
    // Populate colors
    if (form.querySelector('[name="roomNameColor"]')) form.querySelector('[name="roomNameColor"]').value = room.roomNameColor || '';
    if (form.querySelector('[name="roomNameColorHex"]')) form.querySelector('[name="roomNameColorHex"]').value = room.roomNameColor || '#000000';
    if (form.querySelector('[name="roomMessageColor"]')) form.querySelector('[name="roomMessageColor"]').value = room.roomMessageColor || '';
    if (form.querySelector('[name="roomMessageColorHex"]')) form.querySelector('[name="roomMessageColorHex"]').value = room.roomMessageColor || '#000000';
    if (form.querySelector('[name="roomBackgroundColor"]')) form.querySelector('[name="roomBackgroundColor"]').value = room.roomBackgroundColor || '';
    if (form.querySelector('[name="roomBackgroundColorHex"]')) form.querySelector('[name="roomBackgroundColorHex"]').value = room.roomBackgroundColor || '#ffffff';
    
    // Add hidden field for roomId
    let roomIdInput = form.querySelector('[name="roomId"]');
    if (!roomIdInput) {
      roomIdInput = document.createElement('input');
      roomIdInput.type = 'hidden';
      roomIdInput.name = 'roomId';
      form.appendChild(roomIdInput);
    }
    roomIdInput.value = roomId;
    
    // Update form action/method for edit
    form.dataset.mode = 'edit';
    
    // Populate checkboxes
    form.querySelector('[name="allowCamera"]').checked = !!room.allowCamera;
    if (form.querySelector('[name="allowVoiceMics"]')) form.querySelector('[name="allowVoiceMics"]').checked = !!room.allowVoiceMics;
    form.querySelector('[name="allowBroadcast"]').checked = !!room.allowBroadcast;
    form.querySelector('[name="preventHiddenUsers"]').checked = !!room.preventHiddenUsers;
    form.querySelector('[name="useBanner"]').checked = !!room.useBanner;
    form.querySelector('[name="useThumbnail"]').checked = !!room.useThumbnail;
    if (form.querySelector('[name="allowRoomMusic"]')) form.querySelector('[name="allowRoomMusic"]').checked = room.allowRoomMusic !== false;
    if (form.querySelector('[name="moderatorsCanManageMusic"]')) form.querySelector('[name="moderatorsCanManageMusic"]').checked = room.moderatorsCanManageMusic !== false;
    if (form.querySelector('[name="membersCanRequestMusic"]')) form.querySelector('[name="membersCanRequestMusic"]').checked = room.membersCanRequestMusic !== false;
    if (form.querySelector('[name="disableChat"]')) form.querySelector('[name="disableChat"]').checked = !!room.disableChat;
    if (form.querySelector('[name="allowModsWriteInClosedChat"]')) form.querySelector('[name="allowModsWriteInClosedChat"]').checked = room.allowModsWriteInClosedChat !== false;
    
    if (form.querySelector('[name="roomMaxMicSlots"]')) {
      form.querySelector('[name="roomMaxMicSlots"]').value = room.roomMaxMicSlots || 4;
    }
    
    // Update image previews
    document.getElementById('thumbnail-preview').src = room.roomThumbnail || 'https://picsum.photos/seed/room/100/100';
    document.getElementById('banner-preview').src = room.roomBackgroundImage || 'https://picsum.photos/seed/banner/100/100';
    
    // Show/Hide remove password container
    const removePasswordContainer = document.getElementById('remove-password-container');
    if (removePasswordContainer) {
      removePasswordContainer.classList.toggle('d-none', !room.isLocked);
    }
    const removePasswordCheckbox = form.querySelector('[name="removePassword"]');
    if (removePasswordCheckbox) removePasswordCheckbox.checked = false;

    // Moderator Section
    window.populateModeratorSection(room);

    // Mic Management Section
    window.populateMicManagementSection(room);

    // Room Bans Section
    const roomBansSection = document.getElementById('room-bans-section');
    if (roomBansSection) {
      const isRoomOwner = room.ownerId === state.currentUser.id;
      const isGlobalAdmin = hasPermission('canManageRooms') || (state.currentUser && state.currentUserfalse);
      const modObj = (room.moderators || []).find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
      const permissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
      const canBan = isRoomOwner || isGlobalAdmin || permissions.includes('canBanUsers');
      
      roomBansSection.classList.toggle('d-none', !canBan);
      if (canBan) {
        socket.emit('get-room-bans', { roomId: roomId });
      }
    }

    // Enforce permissions for moderators
    const isRoomOwner = room.ownerId === state.currentUser.id;
    const isGlobalAdmin = hasPermission('canManageRooms') || (state.currentUser && state.currentUserfalse);
    const modObj = (room.moderators || []).find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const permissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    
    const canEdit = (perm) => isRoomOwner || isGlobalAdmin || permissions.includes(perm);

    const toggleField = (selector, perm) => {
      const el = form.querySelector(selector);
      if (!el) return;
      const allowed = canEdit(perm);
      const parent = el.closest('.mb-2') || el.closest('.col-4') || el.closest('.form-check') || el.parentElement;
      if (!allowed) {
        if (parent) parent.classList.add('d-none');
        el.disabled = true;
      } else {
        if (parent) parent.classList.remove('d-none');
        el.disabled = false;
      }
    };

    toggleField('[name="name"]', 'canEditName');
    toggleField('[name="roomDescription"]', 'canEditDescription');
    toggleField('[name="roomWelcomeMessage"]', 'canEditWelcomeMessage');
    toggleField('[name="roomMaxUsers"]', 'canEditCapacity');
    toggleField('[name="capacity"]', 'canEditCapacity');
    toggleField('[name="roomMaxMicSlots"]', 'canEditMaxMics');
    toggleField('[name="roomPassword"]', 'canEditPassword');
    
    toggleField('[name="roomNameColor"]', 'canEditColors');
    toggleField('[name="roomNameColorHex"]', 'canEditColors');
    toggleField('[name="roomMessageColor"]', 'canEditColors');
    toggleField('[name="roomMessageColorHex"]', 'canEditColors');
    toggleField('[name="roomBackgroundColor"]', 'canEditColors');
    toggleField('[name="roomBackgroundColorHex"]', 'canEditColors');
    
    toggleField('[name="allowCamera"]', 'canToggleMic');
    toggleField('[name="allowBroadcast"]', 'canToggleBroadcast');
    toggleField('[name="preventHiddenUsers"]', 'canToggleHidden');
    toggleField('[name="useBanner"]', 'canEditImages');
    toggleField('[name="useThumbnail"]', 'canEditImages');
    
    // Images
    const thumbContainer = document.getElementById('thumbnail-preview').parentElement;
    const bannerContainer = document.getElementById('banner-preview').parentElement;
    if (thumbContainer) thumbContainer.classList.toggle('d-none', !canEdit('canEditImages'));
    if (bannerContainer) bannerContainer.classList.toggle('d-none', !canEdit('canEditImages'));

    modal.show();
  } catch (err) {
    console.error('Error in openEditRoomModal:', err);
    showToast('فشل تحميل بيانات الغرفة');
  }
};

window.removeModerator = (userId, roomId) => {
  socket.emit('toggle-room-moderator', { targetUserId: userId, roomId: roomId });
  // UI will update via room-updated event
};
if (ui.toggleSoundBtn) {
  ui.toggleSoundBtn.onclick = () => {
    isSoundMuted = !isSoundMuted;
    
    if (window.voiceManager) {
      window.voiceManager.setIncomingMuted(isSoundMuted);
    }
    
    if (state.currentUser) {
      state.currentUser.isSpeakerMuted = isSoundMuted;
    }
    
    socket.emit('voice:speaker-muted', { isMuted: isSoundMuted });
    
    const currentUserId = state.currentUser ? (state.currentUser.id || state.currentUser.userId) : '';
    const currentUsername = state.currentUser ? state.currentUser.username : '';
    if (currentUserId || currentUsername) {
      if (typeof window.updateSpeakerMutedIcon === 'function') {
        window.updateSpeakerMutedIcon(currentUserId, currentUsername, isSoundMuted);
      }
    }
    
    const icon = ui.toggleSoundBtn.querySelector('i');
    if (isSoundMuted) {
      icon.className = 'fas fa-volume-mute';
      ui.toggleSoundBtn.classList.add('btn-danger');
      ui.toggleSoundBtn.classList.remove('btn-success');
    } else {
      icon.className = 'fas fa-volume-up';
      ui.toggleSoundBtn.classList.remove('btn-danger');
      ui.toggleSoundBtn.classList.add('btn-success');
    }
  };
}

function renderRoomsInSidebar(rooms) {
  let sidebarHTML = '';
  
  // Add Waiting Room to rendering list if admin permissions (always for admins)
  const canSeeWaitingRoomInList = state.isInWaitingRoom || hasPermission('canManageRooms') || hasPermission('canManageUsers');
  
  let roomsToRender = rooms.filter(r => {
    if (state.waitingRoomId && r.id === state.waitingRoomId) {
      return canSeeWaitingRoomInList;
    }
    return true;
  });
  
  // Add Create Room button if permitted
  if (hasPermission('canCreateRooms')) {
    sidebarHTML += `
      <button class="btn btn-success w-100 rounded-0 p-2" onclick="window.openCreateRoomModal()">
        <i class="fas fa-plus"></i> إنشاء غرفة جديدة
      </button>
    `;
  }

  roomsToRender.sort((a, b) => {
    const levelA = Number(a.roomLevel) || 0;
    const levelB = Number(b.roomLevel) || 0;
    const normA = levelA === 0 ? Number.MAX_SAFE_INTEGER : levelA;
    const normB = levelB === 0 ? Number.MAX_SAFE_INTEGER : levelB;
    if (normA !== normB) return normA - normB;
    return Number(a.id) - Number(b.id);
  });

  sidebarHTML += roomsToRender.filter(r => r.isActive).map(r => {
    const isBg = r.useBanner && r.roomBackgroundImage && r.roomBackgroundImage.length > 0;
    const isActive = r.id === state.currentRoomId;
    const lockIcon = r.isLocked ? '<i class="fas fa-lock text-warning ms-1"></i>' : '';
    const icons = lockIcon;

    const nameColor = r.roomNameColor || '';
    const descColor = r.roomMessageColor || '';
    const bgColor = r.roomBackgroundColor || '';
    const bgStyle = bgColor ? `background-color: ${bgColor};` : '';

    const stats = window.roomsStats && window.roomsStats[r.id] ? window.roomsStats[r.id] : { currentUsersCount: 0, micsEnabled: false };
    const userCount = stats.currentUsersCount;
    const micsEnabled = stats.micsEnabled;
    
    const countIcon = micsEnabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-user"></i>';
    const countClass = micsEnabled ? 'room-user-count active-mics' : 'room-user-count';

    if (isBg) {
      return `
        <div class="room-card room-card-bg ${isActive ? 'active' : ''}" style="background-image: url('${r.roomBackgroundImage}'); ${bgStyle}" onclick="window.changeRoom('${r.id}', '${r.name}')">
          <div class="d-flex justify-content-between align-items-center">
            <div class="fw-bold" style="color: ${nameColor}">${r.name} ${icons}</div>
            <div class="${countClass}">${countIcon} ${userCount}/${r.capacity}</div>
          </div>
          <div class="small room-description-text-big mt-1" style="font-size: 0.8rem; color: ${descColor}">${r.roomDescription || ''}</div>
        </div>
      `;
    } else {
      return `
        <div class="room-card ${isActive ? 'active' : ''} d-flex align-items-center gap-2" onclick="window.changeRoom('${r.id}', '${r.name}')" style="padding: 0 !important; ${bgStyle}">
          <img src="${window.getRoomThumbnailUrl(r)}" class="room-card-thumbnail" referrerPolicy="origin-when-cross-origin">
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between align-items-center">
              <div class="fw-bold small" style="color: ${nameColor}">${r.name} ${icons}</div>
              <div class="${countClass} px-2">${countIcon} ${userCount}/${r.capacity}</div>
            </div>
            <div class="text-muted small room-description-text-small" style="font-size: 0.7rem; color: ${descColor} !important;">${r.roomDescription || ''}</div>
          </div>
        </div>
      `;
    }
  }).join('');

  ui.sidebarRoomsContainer.innerHTML = sidebarHTML;
  
  if (state.activeSidebarTab === 'rooms') {
    if (ui.sidebarTitle) ui.sidebarTitle.innerText = getRoomsSidebarTitle(rooms);
  }
}

function findRoomData(roomOrRoomId) {
  if (roomOrRoomId && typeof roomOrRoomId === 'object' && roomOrRoomId.id !== undefined) {
    return roomOrRoomId;
  }
  
  const targetId = (roomOrRoomId !== undefined && roomOrRoomId !== null && roomOrRoomId !== '')
    ? roomOrRoomId 
    : (state.currentRoomId || (state.currentUser && state.currentUser.roomId));

  if (targetId === undefined || targetId === null || String(targetId) === '0') {
    return null;
  }

  const normId = String(targetId);

  if (window.roomsData) {
    if (Array.isArray(window.roomsData)) {
      const found = window.roomsData.find(r => r && String(r.id) === normId);
      if (found) return found;
    } else if (typeof window.roomsData === 'object') {
      if (window.roomsData[targetId]) return window.roomsData[targetId];
      if (window.roomsData[normId]) return window.roomsData[normId];
      for (const key in window.roomsData) {
        const r = window.roomsData[key];
        if (r && String(r.id) === normId) return r;
      }
    }
  }

  if (state.rooms && Array.isArray(state.rooms)) {
    const found = state.rooms.find(r => r && String(r.id) === normId);
    if (found) return found;
  }

  return null;
}

window.updateVoiceBarVisibility = function(roomOrRoomId) {
  const voiceTopBar = document.querySelector('.voice-top-bar');
  if (!voiceTopBar) return;

  const room = findRoomData(roomOrRoomId);
  const targetId = room ? room.id : (roomOrRoomId !== undefined && roomOrRoomId !== null && typeof roomOrRoomId !== 'object' ? roomOrRoomId : state.currentRoomId);

  const isInRoom = targetId !== undefined && targetId !== null && String(targetId) !== '0';
  
  let allowVoice = false;
  if (isInRoom && room) {
    const val = room.allowVoiceMics;
    allowVoice = (val === true || val === 1 || val === '1' || val === 'true');
  }

  if (allowVoice) {
    voiceTopBar.classList.remove('d-none');
    voiceTopBar.classList.add('d-flex');
  } else {
    voiceTopBar.classList.add('d-none');
    voiceTopBar.classList.remove('d-flex');
  }
};

window.syncVoiceMicSlots = function(roomOrRoomId) {
  const room = findRoomData(roomOrRoomId);
  const voiceTopBar = document.querySelector('.voice-top-bar');
  if (!voiceTopBar) return;

  const maxMics = room ? (room.roomMaxMicSlots || 4) : 4;
  const lockedMics = (room && room.lockedMics) ? room.lockedMics : [];

  for (let i = 1; i <= 7; i++) {
    const btn = document.getElementById(`mic-${i}`);
    if (!btn) continue;

    if (room && i <= maxMics) {
      btn.classList.remove('d-none');
      const isLocked = lockedMics.includes(i - 1);
      btn.classList.toggle('locked', isLocked);
      btn.disabled = isLocked;
      btn.title = isLocked ? 'المايك مقفل' : `مايك ${i}`;

      const content = btn.querySelector('.mic-content');
      if (content) {
        let icon = content.querySelector('i');
        if (isLocked) {
          if (!icon) {
            const newIcon = document.createElement('i');
            newIcon.className = 'fas fa-lock';
            content.appendChild(newIcon);
          } else {
            icon.className = 'fas fa-lock';
          }
        } else {
          if (icon && icon.classList.contains('fa-lock')) {
            icon.className = 'fas fa-microphone';
          }
        }
      }
    } else {
      btn.classList.add('d-none');
    }
  }

  if (window.voiceManager && typeof window.voiceManager.updateUI === 'function') {
    window.voiceManager.updateUI();
  }
};

let activeLoadRoomsPromise = null;

async function loadRooms() {
  if (activeLoadRoomsPromise) {
    return activeLoadRoomsPromise;
  }

  activeLoadRoomsPromise = (async () => {
    try {
      const res = await fetch('/api/rooms', {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      const rooms = await res.json();
      window.roomsData = window.roomsData || {};
      state.setRooms(rooms);

      if (Array.isArray(rooms)) {
        rooms.forEach(r => {
          if (r && r.id) {
            window.roomsData[r.id] = r;
          }
        });
      }

      renderRoomsInSidebar(rooms);

      if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
        window.updateLiveBroadcastButtonVisibility();
      }

      if (typeof window.updateVoiceBarVisibility === 'function') {
        window.updateVoiceBarVisibility(state.currentRoomId);
      }
      if (typeof window.syncVoiceMicSlots === 'function') {
        window.syncVoiceMicSlots(state.currentRoomId);
      }

      if (pendingInitialRoomSelection && state.currentRoomId === 0) {
        updateChatUI();
      }
      return rooms;
    } catch (err) {
      if (ui.sidebarRoomsContainer) {
        ui.sidebarRoomsContainer.innerHTML = '<div class="p-3 text-danger">فشل تحميل الغرف</div>';
      }
    } finally {
      activeLoadRoomsPromise = null;
    }
  })();

  return activeLoadRoomsPromise;
}

// Register Room creation/edit form handlers exactly once (to prevent duplicate event listeners and memory leaks)
function initializeRoomFormEvents() {
  const form = document.getElementById('create-room-form');
  if (!form) return;

  // Handle Create/Edit Room Form Submission
  form.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const isEdit = e.target.dataset.mode === 'edit';
    const roomId = formData.get('roomId');

    // Ensure checkboxes are included even if unchecked
    ['allowCamera', 'allowVoiceMics', 'allowBroadcast', 'preventHiddenUsers', 'useBanner', 'useThumbnail', 'allowRoomMusic', 'moderatorsCanManageMusic', 'membersCanRequestMusic', 'disableChat', 'allowModsWriteInClosedChat', 'removePassword'].forEach(name => {
      const el = e.target.querySelector(`[name="${name}"]`);
      if (el) formData.set(name, el.checked ? 'true' : 'false');
    });
    
    try {
      const url = isEdit ? `/api/rooms/${roomId}` : '/api/rooms';
      const method = isEdit ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method: method,
        headers: {
          'Authorization': `Bearer ${getToken()}`
        },
        body: formData // FormData handles file uploads
      });
      if (res.ok) {
        const modalEl = document.getElementById('createRoomModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        loadRooms();
        e.target.reset();
        e.target.dataset.mode = 'create';
        const roomIdInput = e.target.querySelector('[name="roomId"]');
        if (roomIdInput) roomIdInput.remove();
        document.getElementById('thumbnail-preview').src = 'https://picsum.photos/seed/room/100/100';
      } else {
        const errorData = await res.json();
        showToast(errorData.message || (isEdit ? 'فشل تعديل الغرفة' : 'فشل إنشاء الغرفة'));
      }
    } catch (err) {
      showToast('حدث خطأ أثناء الاتصال بالخادم');
    }
  };

  // Thumbnail Preview
  const thumbnailInput = document.getElementById('thumbnail-input');
  if (thumbnailInput) {
    thumbnailInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          document.getElementById('thumbnail-preview').src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    };
  }
  
  // Banner Preview
  const bannerInput = document.getElementById('banner-input');
  if (bannerInput) {
    bannerInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          document.getElementById('banner-preview').src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    };
  }

  // Sync Color Inputs
  const syncColors = (textName, hexName) => {
    const textInput = document.querySelector(`[name="${textName}"]`);
    const hexInput = document.querySelector(`[name="${hexName}"]`);
    if (textInput && hexInput) {
      textInput.addEventListener('input', (e) => {
        if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
          hexInput.value = e.target.value;
        }
      });
      hexInput.addEventListener('input', (e) => {
        textInput.value = e.target.value;
      });
    }
  };
  syncColors('roomNameColor', 'roomNameColorHex');
  syncColors('roomMessageColor', 'roomMessageColorHex');
  syncColors('roomBackgroundColor', 'roomBackgroundColorHex');
  
  // Reset form on modal hide
  const roomModalEl = document.getElementById('createRoomModal');
  if (roomModalEl) {
    roomModalEl.addEventListener('hidden.bs.modal', () => {
      const form = document.getElementById('create-room-form');
      const modalTitle = document.querySelector('#createRoomModal .modal-title');
      const submitBtn = form.querySelector('button[type="submit"]');

      modalTitle.innerHTML = '<i class="fas fa-comments"></i><span>إنشاء غرفة جديدة</span>';
      submitBtn.innerHTML = '<i class="fas fa-plus"></i> إنشاء الغرفة';
      
      form.reset();
      form.dataset.mode = 'create';
      
      // Remove roomId input if it exists
      const roomIdInput = form.querySelector('[name="roomId"]');
      if (roomIdInput) roomIdInput.remove();
      
      // Reset file input and preview
      const thumbnailInput = document.getElementById('thumbnail-input');
      if (thumbnailInput) thumbnailInput.value = '';
      document.getElementById('thumbnail-preview').src = 'https://picsum.photos/seed/room/100/100';
    });
  }
}

// Initialize once
initializeRoomFormEvents();

socket.on('room-changed', ({ roomId, room }) => {
  try {
    if (typeof roomId !== 'undefined') {
      state.setCurrentRoomId(roomId);
      if (state.currentUser) {
        state.currentUser.roomId = roomId;
      }
    }
    if (roomId && roomId !== 0 && String(roomId) !== '0') {
      socket.emit('battle:syncState', { roomId });
    }
    hasJoinedChatOnce = true;
    window.hasJoinedChatOnce = true;
    isLoginSocketSwitch = false;
    hideReconnectBar();

    window.roomsData = window.roomsData || {};

    if (room && room.id) {
      window.roomsData[room.id] = room;
    }

    if (presenceUsersMap && presenceUsersMap.size > 0) {
      updateUsersList(Array.from(presenceUsersMap.values()), { force: true });
    }

    const roomData = findRoomData(room || roomId);
    const roomName = roomData?.name || (room ? room.name : `غرفة ${roomId}`);
    if (typeof window.performTransition === 'function') {
      window.performTransition(roomId, roomName);
    }
    if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
      window.updateLiveBroadcastButtonVisibility();
    }
    if (typeof window.updateVoiceBarVisibility === 'function') {
      window.updateVoiceBarVisibility(room || roomId);
    }
  } catch (err) {
    console.error('[Main] Error handling room-changed event:', err);
  }
});

socket.on('room-updated', (updatedRoom) => {
  if (window.roomsData) {
    window.roomsData[updatedRoom.id] = updatedRoom;
  }
  if (state.rooms) {
    const index = state.rooms.findIndex(r => r.id === updatedRoom.id);
    if (index !== -1) {
      state.rooms[index] = updatedRoom;
    }
  }
  
  if (state.activeSidebarTab === 'rooms') {
    renderRoomsInSidebar(state.rooms);
  } else {
    loadedTabs['rooms'] = false;
  }
  
  if (String(state.currentRoomId) === String(updatedRoom.id)) {
    updateChatUI();
    if (typeof window.updateVoiceBarVisibility === 'function') {
      window.updateVoiceBarVisibility(updatedRoom);
    }
    if (window.voiceManager) window.voiceManager.updateUI();
    if (window.musicManager) window.musicManager.updateUI();
    
    if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
      window.updateLiveBroadcastButtonVisibility();
    }

    // Refresh moderator section if modal is open
    const modalEl = document.getElementById('createRoomModal');
    if (modalEl && modalEl.classList.contains('show')) {
      window.populateModeratorSection(updatedRoom);
      window.populateMicManagementSection(updatedRoom);
    }
  }
});

window.performTransition = (id, name) => {
  preserveMessagesAfterLeave = false;
  if (window.musicManager) window.musicManager.reset();
  state.setCurrentRoomId(id);
  if (window.musicManager) window.musicManager.refreshState();
  updateChatUI();
  cancelReply();
  
  if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
    window.updateLiveBroadcastButtonVisibility();
  }

  if (state.activeSidebarTab === 'rooms' && state.rooms) {
    renderRoomsInSidebar(state.rooms);
  }
};

window.changeRoom = (id, name) => {
    // Handle numeric IDs passed as strings
    if (typeof id === 'string' && !isNaN(id) && id.trim() !== '') {
      id = Number(id);
    }
    
    pendingInitialRoomSelection = false;
  if (state.currentRoomId === id) {
    return; // Already in this room
  }

  state.setIsRoomFrozen(false);
  ui.chatInput.disabled = false;
  ui.chatInput.placeholder = "اكتب رسالتك هنا...";

  if (window.musicManager) window.musicManager.reset();

  if (window.voiceManager) {
    window.voiceManager.cleanup();
  }

  const room = window.roomsData[id];
  
  const canBypassRestrictions = state.hasPermission(state.currentUser, 'canAccessLockedAndFullRooms');

  if (room && room.isLocked && !canBypassRestrictions) {
    const pModalEl = document.getElementById('passwordModal');
    const modal = bootstrap.Modal.getInstance(pModalEl) || new bootstrap.Modal(pModalEl);
    modal.show();
    const submitPasswordBtn = document.getElementById('submit-password-btn');
    if (submitPasswordBtn) {
      submitPasswordBtn.onclick = () => {
        const password = document.getElementById('room-password-input').value;
        socket.emit('change-room', { roomId: id, password: password });
        modal.hide();
        document.getElementById('room-password-input').value = '';
      };
    }
  } else {
    socket.emit('change-room', { roomId: id });
  }
  if (window.musicManager) window.musicManager.refreshState();
};

function getYoutubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

window.revealMedia = function(container, type, url, event) {
  if (event) event.stopPropagation();
  let html = '';
  if (type === 'youtube') {
    html = `
      <iframe 
        width="100%" 
        height="180" 
        src="https://www.youtube.com/embed/${url}?rel=0&modestbranding=1&autoplay=1" 
        title="YouTube video player" 
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        allowfullscreen
        style="border-radius: 8px; border: 1px solid #ddd;"
        referrerpolicy="origin-when-cross-origin"
      ></iframe>
    `;
  } else if (type === 'image') {
    html = `<img src="${url}" class="img-fluid rounded message-image-preview" onclick="openLightbox('${url}')" referrerpolicy="origin-when-cross-origin">`;
  } else if (type === 'video') {
    html = `
      <div class="position-relative" style="cursor: pointer;" onclick="window.openVideoLightbox('${url}')">
        <video src="${url}" class="img-fluid rounded" style="max-height: 180px;"></video>
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <i class="fas fa-play"></i>
        </div>
      </div>
    `;
  } else if (type === 'audio') {
    html = `<audio src="${url}" controls autoplay style="width: 100%;"></audio>`;
  }
  container.innerHTML = html;
  container.classList.add('media-revealed');
};

function decodeWallEntities(text) {
  if (!text) return '';
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent;
}

function renderPost(post) {
  const currentUserId = state.currentUser?.id;
  const isLiked = typeof post.isLiked === 'boolean' ? post.isLiked : !!(post.wallLikes?.some(like => like.userId === currentUserId));
  const heartIcon = isLiked ? 'fas fa-heart' : 'far fa-heart';
  const likeCount = typeof post.likeCount === 'number' ? post.likeCount : (post.wallLikes?.length || 0);
  const commentCount = typeof post.commentCount === 'number' ? post.commentCount : (post.comments?.length || 0);
  
  const user = post.user || post.guestInfo || {};
  const canDelete = (state.currentUser && (state.currentUser.id === post.userId || hasPermission('canDeleteWallPosts')));

  const userPadding = '0 4px';
  const userBorderRadius = '2px';
  
  const userIdentityHtml = window.renderUserIdentity(user, {
     nameClasses: 'wall-post-username',
     nameStyle: `color: ${user.ucol || '#e67e22'};`,
     tag: 'a',
     onClick: 'event.preventDefault();'
  });

  const avatarUrl = window.getAvatarUrl(user);

  const pendingClass = post.isPending ? 'wall-pending' : '';

  let wallText = post.msg ? replacePlaceholders(replaceShortcuts(escapeHTML(decodeWallEntities(post.msg)))) : '';
  if (wallText && window.safeLinkify) {
    wallText = window.safeLinkify(wallText);
  }

  let mediaHtml = '';
  if (post.mediaUrl) {
    if (post.mediaType === 'youtube') {
      mediaHtml = `
        <div class="wall-post-media mt-2">
          <div class="youtube-horizontal-placeholder" onclick="revealMedia(this, 'youtube', '${post.mediaUrl}', event)">
            <div class="yt-left-side">
              <i class="fab fa-youtube"></i>
            </div>
            <div class="yt-right-side">
              <img src="https://img.youtube.com/vi/${post.mediaUrl}/hqdefault.jpg" class="placeholder-thumb" onerror="this.src='https://img.youtube.com/vi/${post.mediaUrl}/mqdefault.jpg'">
              <div class="yt-play-label">تشغيل</div>
            </div>
          </div>
        </div>
      `;
    } else if (post.mediaType === 'image') {
      mediaHtml = `
        <div class="wall-post-media mt-2">
          <div class="media-placeholder image-placeholder" onclick="revealMedia(this, 'image', '${post.mediaUrl}', event)">
            <span>عرض الصورة</span>
            <div class="placeholder-icon"><i class="fas fa-image"></i></div>
          </div>
        </div>
      `;
    } else if (post.mediaType === 'video') {
      mediaHtml = `
        <div class="wall-post-media mt-2">
          <div class="media-placeholder video-placeholder" onclick="revealMedia(this, 'video', '${post.mediaUrl}', event)">
            <span>تشغيل الفيديو</span>
            <div class="placeholder-icon"><i class="fas fa-play-circle"></i></div>
          </div>
        </div>
      `;
    }
  }

return `
  <div class="wall-post-card ${pendingClass}" id="post-${post.id}">
    <img src="${avatarUrl}" class="wall-post-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${escapeHTML(user.username || '')}" style="cursor: pointer;">
    
    <div class="wall-post-main">
      <div class="wall-post-header">
        <div class="d-flex align-items-center">
          ${userIdentityHtml}
        </div>
        <div class="wall-post-time">${formatTimeAgo(post.createdAt)}</div>
      </div>


       

        <div class="wall-post-content ${mediaHtml ? 'has-media' : ''}">
          <div class="wall-post-body">
            ${wallText ? `
              <div class="wall-post-text" style="color: ${post.user?.fontColor || '#000000'}">
                ${wallText}
              </div>
            ` : ''}
            ${mediaHtml ? `<div class="wall-post-media-clear">${mediaHtml}</div>` : ''}
          </div>
          <div class="wall-post-actions-row">
            ${window.featuresSettings?.wallPostLikesEnabled !== false ? `
              <button class="wall-action-btn wall-btn-like" ${post.isPending ? 'disabled' : `onclick="likePost('${post.id}', this)"`}>
                <i class="${heartIcon}"></i>
                <span>${likeCount}</span>
              </button>
            ` : ''}

            ${window.featuresSettings?.wallPostCommentsEnabled !== false ? `
              <button class="wall-action-btn wall-btn-comment" ${post.isPending ? 'disabled' : `onclick="toggleComments('${post.id}')"`}>
                <i class="fas fa-comments"></i>
                <span>${commentCount}</span>
              </button>
            ` : ''}

            ${canDelete ? `
              <button class="wall-action-btn wall-btn-delete" ${post.isPending ? 'disabled' : `onclick="deletePost('${post.id}')"`}>
                <i class="fas fa-times"></i>
              </button>
            ` : ''}
          </div>
        </div>
    </div>
  </div>
`;
}

function updateWallPostParts(element, post) {
  const currentUserId = state.currentUser?.id;
  const isLiked = typeof post.isLiked === 'boolean' ? post.isLiked : !!(post.wallLikes?.some(like => like.userId === currentUserId));
  const heartIcon = isLiked ? 'fas fa-heart' : 'far fa-heart';
  const likeCount = typeof post.likeCount === 'number' ? post.likeCount : (post.wallLikes?.length || 0);
  const commentCount = typeof post.commentCount === 'number' ? post.commentCount : (post.comments?.length || 0);

  const likeBtn = element.querySelector('.wall-btn-like');
  if (likeBtn) {
    const icon = likeBtn.querySelector('i');
    const span = likeBtn.querySelector('span');
    if (icon) icon.className = heartIcon;
    if (span) span.innerText = likeCount;
  }

  const commentBtn = element.querySelector('.wall-btn-comment span');
  if (commentBtn) {
    commentBtn.innerText = commentCount;
  }
}

window.refreshWallLayout = function(options = {}) {
  const container = document.getElementById('wall-posts-container');
  const input = document.getElementById('wall-post-input');

  if (input) {
    input.style.height = '32px';
  }

  if (container && options.scrollTop) {
    requestAnimationFrame(() => {
      container.scrollTop = 0;
    });
  }
};

let isWallSubmitting = false;

function getWallTargetContainer() {
  const customInner = document.getElementById('wall-posts-inner-container');
  return customInner || ui.sidebarWallContainer;
}

async function loadWall() {
  const existingPostsContainer = document.getElementById('wall-posts-container');
  if (!existingPostsContainer) {
    let storiesHtml = '';
    
    getWallTargetContainer().innerHTML = storiesHtml + `
      <div id="wall-loading" class="d-flex flex-column align-items-center justify-content-center p-5 text-muted">
        <i class="fas fa-circle-notch fa-spin text-primary fa-2x mb-2" style="font-size: 2rem;"></i>
        <div style="font-size: 14px;">جاري تحميل حائط المنشورات...</div>
      </div>
    `;
    if (typeof renderStoriesBar === 'function') renderStoriesBar('wall-stories-container');
  }
  try {
    const res = await fetch('/api/posts', {
      headers: { 
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    });
    const posts = await res.json();
    
    const currentUserId = state.currentUser?.id;
    
    let postsHtml = '';
    if (posts.length === 0) {
      postsHtml = '<div id="no-posts-msg" class="p-4 text-center text-muted">لا توجد منشورات حالياً.</div>';
    } else {
      posts.forEach(post => {
        postsHtml += renderPost(post);
      });
    }

    const existingPostsContainer = document.getElementById('wall-posts-container');
    if (existingPostsContainer) {
      const newIds = new Set(posts.map(p => p.id));
      
      Array.from(existingPostsContainer.children).forEach(child => {
        if (!child.id.startsWith('post-')) return;
        const id = child.id.replace('post-', '');
        if (!newIds.has(id)) {
          child.remove();
        }
      });
      
      let previousElement = null;
      posts.forEach(post => {
         const existing = document.getElementById(`post-${post.id}`);
         if (!existing) {
             const temp = document.createElement('div');
             temp.innerHTML = renderPost(post);
             const postEl = temp.firstElementChild;
             if (previousElement) {
                previousElement.insertAdjacentElement('afterend', postEl);
             } else {
                existingPostsContainer.insertAdjacentElement('afterbegin', postEl);
             }
             previousElement = postEl;
         } else {
             updateWallPostParts(existing, post);
             
             // Ensure correct order in DOM
             if (previousElement && previousElement.nextElementSibling !== existing) {
                 previousElement.insertAdjacentElement('afterend', existing);
             } else if (!previousElement && existingPostsContainer.firstElementChild !== existing) {
                 // if it should be the very first element
                 existingPostsContainer.insertAdjacentElement('afterbegin', existing);
             }
             
             previousElement = existing;
         }
      });
      
      const noPostsMsg = document.getElementById('no-posts-msg');
      if (posts.length === 0 && !noPostsMsg) {
         existingPostsContainer.insertAdjacentHTML('afterbegin', '<div id="no-posts-msg" class="p-4 text-center text-muted">لا توجد منشورات حالياً.</div>');
      } else if (posts.length > 0 && noPostsMsg) {
         noPostsMsg.remove();
      }

      applyUserFontSize();
      return;
    }
    
    let html = '';
    html += '<div class="wall-container">';
    html += '<button id="new-posts-alert" class="new-posts-alert">منشورات جديدة</button>';
    
    // Youtube Search Container
    if (window.featuresSettings?.wallYoutubeBarEnabled !== false) {
      html += `
        <div class="yt-search-container p-2 border-bottom">
          <div class="yt-search-input-wrap">
            <i class="fab fa-youtube yt-search-youtube-icon"></i>
  
            <input type="text" class="form-control form-control-sm" id="yt-search-input" placeholder="ابحث  في يوتيوب...">
  
            <button type="button" id="yt-search-btn" class="yt-search-btn-inline" aria-label="بحث">
              <i class="fas fa-search"></i>
            </button>
          </div>
  
          <div id="yt-results-container" class="yt-results-list"></div>
        </div>
      `;
    }

    html += '<div class="wall-posts-list" id="wall-posts-container">' + postsHtml + '</div>';
    
    html += `
      <div class="wall-post-form-container">
        <div class="wall-upload-progress-container" id="wall-upload-progress-container">
          <div class="wall-upload-progress-bar" id="wall-upload-progress-bar"></div>
          <div class="wall-upload-progress-text" id="wall-upload-progress-text">0%</div>
          <button id="cancel-wall-upload" class="btn btn-sm btn-danger wall-upload-cancel-btn"><i class="fas fa-times"></i> إلغاء</button>
        </div>
        
        <form id="wall-post-form">
          <div class="wall-post-input-group">
            <div class="wall-post-btn-icon" title="إيموجي" id="wall-btn-emoji" style="padding: 5px; width: 34px; background: transparent; border: none;">
              <img src="/emoii.gif" style="width: 34px; padding: 5px;" alt="emoji">
            </div>
            <div class="wall-post-btn-icon" title="رفع وسائط" id="wall-btn-upload">
              <i class="fas fa-upload"></i>
            </div>
            
            <textarea name="msg" class="wall-post-input" id="wall-post-input" placeholder="اكتب رسالتك هنا"></textarea>
            <button type="submit" class="wall-post-btn-send">
              إرسال <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </form>
      </div>
    `;
    html += '</div>';
    getWallTargetContainer().innerHTML = html;
    if (typeof renderStoriesBar === 'function') renderStoriesBar('wall-stories-container');
    applyUserFontSize();

    const postsContainer = document.getElementById('wall-posts-container');
    const alertBtn = document.getElementById('new-posts-alert');

    if (postsContainer && alertBtn) {
      postsContainer.onscroll = () => {
        if (postsContainer.scrollTop < 50) {
          alertBtn.style.display = 'none';
        }
      };

      alertBtn.onclick = () => {
        postsContainer.scrollTo({ top: 0, behavior: 'auto' });
        alertBtn.style.display = 'none';
      };
    }

    // Elements
    const form = document.getElementById('wall-post-form');
    const wallInput = document.getElementById('wall-post-input');
    const btnEmoji = document.getElementById('wall-btn-emoji');
    const btnUpload = document.getElementById('wall-btn-upload');
    const ytSearchInput = document.getElementById('yt-search-input');
    const ytResultsContainer = document.getElementById('yt-results-container');
    const ytSearchBtn = document.getElementById('yt-search-btn');
    
    let ytSearchTimeout = null;
    if (ytSearchInput && ytResultsContainer) {
      // Hide results when clicking outside
      const hideResults = (e) => {
        if (!ytResultsContainer.contains(e.target) && e.target !== ytSearchInput && e.target !== ytSearchBtn) {
          ytResultsContainer.innerHTML = '';
        }
      };
      document.addEventListener('click', hideResults);

      ytSearchInput.oninput = (e) => {
        clearTimeout(ytSearchTimeout);
        const query = e.target.value.trim();
        if (!query) { ytResultsContainer.innerHTML = ''; return; }
        
        ytSearchTimeout = setTimeout(async () => {
          ytResultsContainer.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin text-primary"></i></div>';
          try {
            const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`, {
              headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const results = await res.json();
            if (results.length === 0) {
              ytResultsContainer.innerHTML = '<div class="p-3 small text-center text-muted">لا توجد نتائج</div>';
              return;
            }
            ytResultsContainer.innerHTML = results.map(video => `
              <div class="yt-result-item" onclick="window.selectYoutubeVideo('${video.id}', '${escapeHTML(video.title)}')">
                <div class="yt-result-thumb-wrap">
                  <img src="${video.thumbnail}" alt="" class="yt-result-thumb">
                  <i class="fab fa-youtube yt-play-icon-overlay"></i>
                </div>
                <div class="video-info">
                  <div class="video-title" title="${escapeHTML(video.title)}">${escapeHTML(video.title)}</div>
                </div>
              </div>
            `).join('');
          } catch (err) {
            console.error(err);
            ytResultsContainer.innerHTML = '<div class="p-3 small text-center text-danger">تعذر الاتصال بـ YouTube</div>';
          }
        }, 500);
      };
    }

    if (!window.selectYoutubeVideo) {
      window.selectYoutubeVideo = async (videoId, title) => {
        const ytSearchInput = document.getElementById('yt-search-input');
        const ytResultsContainer = document.getElementById('yt-results-container');
        
        // Optimistic UI for YouTube
        const tempId = 'pending-yt-' + Date.now();
        const container = document.getElementById('wall-posts-container');
        if (container) {
          const noPostsMsg = document.getElementById('no-posts-msg');
          if (noPostsMsg) noPostsMsg.remove();

          const tempPost = {
            id: tempId,
            userId: state.currentUser ? state.currentUser.id : null,
            msg: ' ',
            mediaUrl: videoId,
            mediaType: 'youtube',
            createdAt: new Date().toISOString(),
            user: state.currentUser,
            isPending: true,
            wallLikes: [],
            comments: []
          };
          container.insertAdjacentHTML('afterbegin', renderPost(tempPost));
          refreshWallLayout({ scrollTop: true });
          container.scrollTop = 0;
        }

        // Clear search immediately
        if (ytSearchInput) ytSearchInput.value = '';
        if (ytResultsContainer) ytResultsContainer.innerHTML = '';

        const payload = { 
          msg: ' ',
          mediaUrl: videoId, 
          mediaType: 'youtube' 
        };

        try {
          const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getToken()}`,
              'X-Chat-Token': getToken()
            },
            body: JSON.stringify(payload)
          });
          
          if (response.ok) {
            const newPost = await response.json();
            const pendingDiv = document.getElementById(`post-${tempId}`);
            if (pendingDiv) {
              pendingDiv.outerHTML = renderPost(newPost);
            } else if (!document.getElementById(`post-${newPost.id}`)) {
              if (container) {
                container.insertAdjacentHTML('afterbegin', renderPost(newPost));
                container.scrollTop = 0;
              }
            }
            refreshWallLayout({ scrollTop: true });
          } else {
            const pendingDiv = document.getElementById(`post-${tempId}`);
            if (pendingDiv) pendingDiv.remove();
            let errMsg = 'فشل في إرسال الفيديو';
            try {
              const resText = await response.text();
              try {
                const resJson = JSON.parse(resText);
                errMsg = resJson.message || errMsg;
              } catch (_) {
                if (response.status === 403) {
                  errMsg = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
                } else {
                  errMsg = resText || errMsg;
                }
              }
            } catch (_) {}
            if (response.status === 403 || errMsg.includes('إسكات') || response.status === 429 || errMsg.includes('الانتظار') || errMsg.includes('انتظار')) {
              showChatAlert({ message: errMsg, icon: 'error' });
            } else {
              showToast(errMsg);
            }
          }
        } catch (err) {
          console.error(err);
          const pendingDiv = document.getElementById(`post-${tempId}`);
          if (pendingDiv) pendingDiv.remove();
          if (err.message && !err.message.includes('لايك') && !err.message.includes('requiredLikes')) {
            showToast(err.message || 'حدث خطأ غير متوقع');
          }
        }
      };
    }
    
    const progressContainer = document.getElementById('wall-upload-progress-container');
    const progressBar = document.getElementById('wall-upload-progress-bar');
    const progressText = document.getElementById('wall-upload-progress-text');
    const cancelUploadBtn = document.getElementById('cancel-wall-upload');
    
    let currentWallUploadXhr = null;
    
    if (cancelUploadBtn) {
      cancelUploadBtn.onclick = () => {
        if (currentWallUploadXhr) {
          currentWallUploadXhr.abort();
          isWallSubmitting = false;
          if (progressContainer) progressContainer.style.display = 'none';
          if (window.showToast) {
            window.showToast('تم إلغاء الرفع', 'info');
          } else {
            console.log('تم إلغاء الرفع');
          }
        }
      };
    }

    const previewContainer = document.getElementById('wall-media-preview-container');
    const previewContent = document.getElementById('wall-media-preview-content');
    const previewConfirm = document.getElementById('wall-preview-confirm');
    const previewCancel = document.getElementById('wall-preview-cancel');

    if (btnEmoji && wallInput) {
      btnEmoji.onclick = () => toggleEmojiPicker(wallInput);
    }

    // Helper: Show Preview (Remove preview UI as requested)
    const showMediaPreview = (mediaHtml) => {
        // No-op to comply with requirements
    };

    const hideMediaPreview = () => {
       // No-op
    };


    // Unified Upload Handler
    btnUpload.onclick = () => {
      if (isWallSubmitting) return;
      
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*,.mov,.MOV';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          isWallSubmitting = true;
          
          // Capture current text
          const currentText = (wallInput ? wallInput.value : '').trim();

          // Proceed to upload with real progress
          if (progressContainer) progressContainer.style.display = 'block';
          if (progressBar) progressBar.style.width = '0%';
          if (progressText) progressText.innerText = '0%';

          const formData = new FormData();
          formData.append('file', file);
          
          const xhr = new XMLHttpRequest();
          currentWallUploadXhr = xhr;
          xhr.open('POST', '/api/upload/wallfiles', true);
          xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
          xhr.setRequestHeader('X-Chat-Token', getToken());

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && progressBar && progressText) {
              const percent = Math.round((event.loaded / event.total) * 100);
              progressBar.style.width = percent + '%';
              progressText.innerText = percent + '%';
            }
          };

          xhr.onload = async () => {
            currentWallUploadXhr = null;
            if (progressContainer) progressContainer.style.display = 'none';
            isWallSubmitting = false;

            if (xhr.status === 200) {
              const result = JSON.parse(xhr.responseText);
              const isVideo = file.type.startsWith('video/') || file.type === 'video/quicktime' || file.name.toLowerCase().endsWith('.mov') || (result.mimetype && (result.mimetype.startsWith('video/') || result.mimetype === 'video/quicktime'));
              const type = isVideo ? 'video' : 'image';
              
              const tempId = 'pending-upload-' + Date.now();
              const container = document.getElementById('wall-posts-container');
              if (container) {
                const noPostsMsg = document.getElementById('no-posts-msg');
                if (noPostsMsg) noPostsMsg.remove();

                const tempPost = {
                  id: tempId,
                  userId: state.currentUser ? state.currentUser.id : null,
                  msg: currentText || '',
                  mediaUrl: result.url,
                  mediaType: type,
                  createdAt: new Date().toISOString(),
                  user: state.currentUser,
                  isPending: true,
                  wallLikes: [],
                  comments: []
                };
                container.insertAdjacentHTML('afterbegin', renderPost(tempPost));
                refreshWallLayout({ scrollTop: true });
                container.scrollTop = 0;
              }
              
              if (wallInput) wallInput.value = '';

              // Directly post media + current text
              const payload = { msg: currentText || '', mediaUrl: result.url, mediaType: type };
              try {
                const response = await fetch('/api/posts', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`,
                    'X-Chat-Token': getToken()
                  },
                  body: JSON.stringify(payload)
                });
                
                if (response.ok) {
                    const newPost = await response.json();
                    const pendingDiv = document.getElementById(`post-${tempId}`);
                    if (pendingDiv) {
                      pendingDiv.outerHTML = renderPost(newPost);
                    } else if (!document.getElementById(`post-${newPost.id}`)) {
                      if (container) {
                        container.insertAdjacentHTML('afterbegin', renderPost(newPost));
                        container.scrollTop = 0;
                      }
                    }
                    refreshWallLayout({ scrollTop: true });
                } else {
                  const pendingDiv = document.getElementById(`post-${tempId}`);
                  if (pendingDiv) pendingDiv.remove();
                  let errMsg = 'فشل في إرسال المنشور';
                  try {
                    const resText = await response.text();
                    try {
                      const resJson = JSON.parse(resText);
                      errMsg = resJson.message || errMsg;
                    } catch (_) {
                      if (response.status === 403) {
                        errMsg = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
                      } else {
                        errMsg = resText || errMsg;
                      }
                    }
                  } catch (_) {}
                  showChatAlert({ message: errMsg, icon: 'error' });
                }
              } catch (err) {
                console.error(err);
                const pendingDiv = document.getElementById(`post-${tempId}`);
                if (pendingDiv) pendingDiv.remove();
              }
            } else if (xhr.status !== 0) { // status 0 is aborted
              let errorMsg = 'تعذر رفع الملف، حاول مرة أخرى';
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.message) errorMsg = res.message;
              } catch (e) {}
              showChatAlert({ message: errorMsg, icon: 'error' });
            }
          };

          xhr.onerror = () => {
             currentWallUploadXhr = null;
             if (progressContainer) progressContainer.style.display = 'none';
             isWallSubmitting = false;
             showChatAlert({ message: 'حدث خطأ أثناء الاتصال بالسيرفر', icon: 'error' });
          };

          xhr.onabort = () => {
            currentWallUploadXhr = null;
            if (progressContainer) progressContainer.style.display = 'none';
            isWallSubmitting = false;
          };

          xhr.send(formData);
        }
      };
      input.click();
    };

    // Form Submit
    if (form) {
      let wallSubmitByEnter = false;

      if (wallInput) {
        wallInput.onkeydown = (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            wallSubmitByEnter = true;

            if (typeof form.requestSubmit === 'function') {
              form.requestSubmit();
            } else {
              form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
          }
        };
      }

      form.onsubmit = async (e) => {
        if (e) e.preventDefault();
        
        const msg = (wallInput ? wallInput.value : '').trim();
        if (!msg) return;
        
        // Short throttle to prevent accidental double clicks (300ms)
        if (form.getAttribute('data-submitting')) return;
        form.setAttribute('data-submitting', 'true');
        setTimeout(() => form.removeAttribute('data-submitting'), 300);

        // Auto-detect YouTube link BEFORE creating optimistic UI
        let mediaUrl = null;
        let mediaType = null;
        let finalMsg = msg;
        const ytId = getYoutubeId(msg);
        if (ytId) {
          mediaUrl = ytId;
          mediaType = 'youtube';
          finalMsg = msg;
        }

        const tempId = 'pending-' + Date.now();
        const container = document.getElementById('wall-posts-container');
        
        // Optimistic UI
        if (container) {
          const noPostsMsg = document.getElementById('no-posts-msg');
          if (noPostsMsg) noPostsMsg.remove();

          const tempPost = {
            id: tempId,
            userId: state.currentUser ? state.currentUser.id : null,
            msg: finalMsg,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            createdAt: new Date().toISOString(),
            user: state.currentUser,
            isPending: true,
            wallLikes: [],
            comments: []
          };
          container.insertAdjacentHTML('afterbegin', renderPost(tempPost));
          refreshWallLayout({ scrollTop: true });
          container.scrollTop = 0;
        }

        // Reset form immediately
        form.reset();

        if (wallInput) {
          wallInput.value = '';
          wallInput.style.height = '32px';

          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

          if (isIOS && wallSubmitByEnter) {
            wallInput.blur();
          }

          wallSubmitByEnter = false;
        }
        
        try {
          const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getToken()}`,
              'X-Chat-Token': getToken()
            },
            body: JSON.stringify({ msg: finalMsg, mediaUrl, mediaType })
          });
          
          if (response.ok) {
            const newPost = await response.json();
            const pendingDiv = document.getElementById(`post-${tempId}`);
            if (pendingDiv) {
              pendingDiv.outerHTML = renderPost(newPost);
            } else if (!document.getElementById(`post-${newPost.id}`)) {
              if (container) {
                container.insertAdjacentHTML('afterbegin', renderPost(newPost));
                container.scrollTop = 0;
              }
            }
            refreshWallLayout({ scrollTop: true });
          } else {
            const pendingDiv = document.getElementById(`post-${tempId}`);
            if (pendingDiv) pendingDiv.remove();
            let errMsg = 'فشل في إرسال المنشور';
            try {
              const resText = await response.text();
              try {
                const resJson = JSON.parse(resText);
                errMsg = resJson.message || errMsg;
              } catch (_) {
                if (response.status === 403) {
                  errMsg = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
                } else {
                  errMsg = resText || errMsg;
                }
              }
            } catch (_) {}
            if (response.status === 403 || errMsg.includes('إسكات') || response.status === 429 || errMsg.includes('الانتظار') || errMsg.includes('انتظار')) {
              showChatAlert({ message: errMsg, icon: 'error' });
            } else {
              showToast(errMsg);
            }
          }
        } catch (err) {
          console.error('Wall post error:', err);
          const pendingDiv = document.getElementById(`post-${tempId}`);
          if (pendingDiv) pendingDiv.remove();
          if (err.message && (err.message.includes('لايك') || err.message.includes('requiredLikes'))) {
          } else {
            showToast(err.message || 'حدث خطأ أثناء الاتصال بالسيرفر');
          }
        }
      };
    }

  } catch (err) {
    console.error('Error loading wall:', err);
    if (!document.getElementById('wall-posts-container')) {
      getWallTargetContainer().innerHTML = `
        <div class="p-3 text-danger">فشل تحميل الحائط</div>
      `;
    }
  }
}



function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / 60000);
  
  if (diffInMinutes < 1) return 'الآن';
  if (diffInMinutes < 60) return `<span>${diffInMinutes}</span><span>د</span>`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `<span>${diffInHours}</span><span>س</span>`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `<span>${diffInDays}</span><span>ي</span>`;
}

window.toggleYoutube = (postId, videoId) => {
  const container = document.getElementById(`youtube-container-${postId}`);
  if (container.classList.contains('d-none')) {
    container.innerHTML = `
      <div class="ratio ratio-16x9">
        <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>
      </div>
    `;
    container.classList.remove('d-none');
  } else {
    container.innerHTML = '';
    container.classList.add('d-none');
  }
};


function renderComment(c) {
  const user = c.user || c.guestInfo || {};
  const userId = c.userId || (c.guestInfo ? c.guestInfo.id : null);
  
  const userIdentityHtml = window.renderUserIdentity(user, {
      nameClasses: 'wall-post-username',
      nameStyle: `color: ${user.ucol || '#e67e22'};`,
      tag: 'a',
      onClick: 'event.preventDefault();'
  });
  
  const avatarUrl = window.getAvatarUrl(user);
  let commentText = c.msg ? replacePlaceholders(replaceShortcuts(escapeHTML(decodeWallEntities(c.msg)))) : '';
  if (commentText && window.safeLinkify) {
    commentText = window.safeLinkify(commentText);
  }

  return `
  <div class="wall-post-card" style="padding: 6px; border-bottom: 1px solid #f0f0f0;" data-user-id="${userId || ''}">
    <img src="${avatarUrl}" class="wall-post-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${escapeHTML(user.username || '')}" data-user-id="${userId || ''}" style="cursor: pointer;">
    
    <div class="wall-post-main">
      <div class="wall-post-header">
        <div class="d-flex align-items-center">
          ${userIdentityHtml}
        </div>
        <div class="wall-post-time">${formatTimeAgo(c.createdAt)}</div>
      </div>
      <div class="wall-post-content">
        <div class="wall-post-text" style="color: ${c.user?.fontColor || '#000000'}">${commentText}</div>
      </div>
    </div>
  </div>
  `;
}

window.toggleComments = async (postId) => {
  console.log('Fetching post:', postId);
  window.activeCommentPostId = postId;
  let overlay = document.getElementById('comment-modal-overlay');
  const isNewModal = !overlay;

  try {
    const res = await fetch(`/api/posts/${postId}`, {
      headers: { 
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('Fetch failed:', res.status, text);
      return;
    }
    
    const post = await res.json();
    if (!post) return;

    // Render Original Post at the top
    const userIdentityHtml = window.renderUserIdentity(post.user || post.guestInfo || {}, {
        nameClasses: 'wall-post-username',
        nameStyle: `color: ${post.user?.ucol || '#e67e22'};`,
        tag: 'span'
    });
    
    let mediaHtml = '';
    if (post.mediaUrl) {
      if (post.mediaType === 'youtube') {
        mediaHtml = `
          <div class="wall-post-media mt-2 text-center">
            <div class="youtube-horizontal-placeholder" onclick="revealMedia(this, 'youtube', '${post.mediaUrl}', event)">
              <div class="yt-left-side">
                <i class="fab fa-youtube"></i>
              </div>
              <div class="yt-right-side">
                <img src="https://img.youtube.com/vi/${post.mediaUrl}/hqdefault.jpg" class="placeholder-thumb" onerror="this.src='https://img.youtube.com/vi/${post.mediaUrl}/mqdefault.jpg'">
                <div class="yt-play-label">تشغيل</div>
              </div>
            </div>
          </div>
        `;
      } else if (post.mediaType === 'image') {
        mediaHtml = `
          <div class="wall-post-media mt-2">
            <img src="${post.mediaUrl}" class="img-fluid rounded" style="max-height: 200px; cursor: pointer;" onclick="openLightbox('${post.mediaUrl}')">
          </div>
        `;
      } else if (post.mediaType === 'video') {
        mediaHtml = `
          <div class="wall-post-media mt-2">
            <div class="position-relative" style="cursor: pointer;" onclick="window.openVideoLightbox('${post.mediaUrl}')">
              <video src="${post.mediaUrl}" class="w-100 rounded" style="max-height: 200px;"></video>
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-play"></i>
              </div>
            </div>
          </div>
        `;
      }
    }

    let modalPostText = post.msg ? replacePlaceholders(replaceShortcuts(escapeHTML(decodeWallEntities(post.msg)))) : '';
    if (modalPostText && window.safeLinkify) {
      modalPostText = window.safeLinkify(modalPostText);
    }

    const originalPostHtml = `
      <div class="comment-original-post">
        <div class="d-flex">
          <img src="${post.user?.pic || '/default-avatar.png'}" class="wall-post-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${escapeHTML(post.user?.username || '')}" style="cursor: pointer;">
          <div class="wall-post-main flex-grow-1">
            <div class="wall-post-header d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center">
                ${userIdentityHtml}
              </div>
              <div class="wall-post-time">${formatTimeAgo(post.createdAt)}</div>
            </div>
            <div class="wall-post-body mt-1" style="color: ${post.user?.fontColor || '#000'}">
              ${modalPostText}
            </div>
            ${mediaHtml}
          </div>
        </div>
      </div>
    `;

    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
      commentsHtml = post.comments.map(c => renderComment(c)).join('');
    } else {
      commentsHtml = '<div class="p-4 text-center text-muted" id="no-comments-msg">لا توجد تعليقات بعد.</div>';
    }

    const fullBodyHtml = originalPostHtml + '<div class="comments-list" id="comments-list-container">' + commentsHtml + '</div>';

    if (isNewModal) {
      overlay = document.createElement('div');
      overlay.id = 'comment-modal-overlay';
      overlay.className = 'comment-modal-overlay';
      overlay.innerHTML = `
        <div class="comment-modal">
          <div class="comment-modal-header">
            <div class="title">
              <i class="fas fa-comments"></i>
              التعليقات
            </div>
            <div class="close-btn" onclick="document.getElementById('comment-modal-overlay').remove()">
              <i class="fas fa-times-circle"></i>
            </div>
          </div>
          <div class="comment-modal-body" id="comment-modal-body">
            ${fullBodyHtml}
          </div>
          <div class="comment-modal-footer" style="padding: 4px; border-top: 1px solid #ccc; background: #f0f2f5;">
            <div class="wall-post-input-group">
              <div class="wall-post-btn-icon" id="comment-btn-emoji" title="إيموجي" style="padding: 5px; width: 34px; background: transparent; border: none; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-smile text-secondary fs-5"></i>
              </div>
              <textarea id="comment-modal-input" class="wall-post-input" placeholder="اكتب تعليقك هنا..." style="min-height: 32px; height: 32px;"></textarea>
              <button class="wall-post-btn-send" id="comment-send-btn">
                إرسال <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      refreshWallLayout();
    } else {
      // Update existing modal body
      const body = document.getElementById('comment-modal-body');
      body.innerHTML = fullBodyHtml;
    }

    // Update send button and input handlers
    const sendBtn = document.getElementById('comment-send-btn');
    const input = document.getElementById('comment-modal-input');
    const btnEmoji = document.getElementById('comment-btn-emoji');
    
    if (btnEmoji && input) {
      btnEmoji.onclick = () => toggleEmojiPicker(input);
    }
    
    sendBtn.onclick = (e) => submitComment(e, postId);
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitComment(e, postId);
      }
    };

    // Scroll to bottom
    const body = document.getElementById('comment-modal-body');
    body.scrollTop = body.scrollHeight;

  } catch (err) {
    console.error('Error loading comments:', err);
  }
};

window.submitComment = async (e, postId) => {
  if (e) e.preventDefault();
  const input = document.getElementById('comment-modal-input');
  const msg = input.value.trim();
  if (!msg) return;

  try {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      },
      body: JSON.stringify({ msg })
    });
    if (res.ok) {
       input.value = '';
       // The socket event 'wall-update' will handle appending the new comment to the UI
     } else {
       let errorMessage = 'خطأ غير معروف';
       try {
         const responseText = await res.text();
         try {
           const errorData = JSON.parse(responseText);
           errorMessage = errorData.message || errorMessage;
         } catch (e) {
           if (res.status === 403) {
             errorMessage = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
           } else {
             errorMessage = responseText || res.statusText || errorMessage;
           }
         }
       } catch (e) {
         if (res.status === 403) {
           errorMessage = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
         } else {
           errorMessage = res.statusText || errorMessage;
         }
       }
       if (res.status === 403 || errorMessage.includes('إسكات')) {
         showChatAlert({ message: errorMessage, icon: 'error' });
       } else {
         showToast(errorMessage);
       }
     }
  } catch (err) {
    console.error('Error commenting:', err);
    showToast('حدث خطأ أثناء الاتصال بالسيرفر');
  }
};

window.openYoutubeSearch = () => {
  // Simple prompt for now, can be replaced with a modal
  const videoId = prompt('أدخل معرف فيديو يوتيوب (مثلاً: dQw4w9WgXcQ):');
  if (videoId) {
    const payload = { msg: 'شاهد هذا الفيديو!', mediaUrl: videoId, mediaType: 'youtube' };
    fetch('/api/posts', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      },
      body: JSON.stringify(payload)
    }).then(async (res) => {
      if (res.ok) {
        const newPost = await res.json();
        const container = document.getElementById('wall-posts-container');
        if (container && !document.getElementById(`post-${newPost.id}`)) {
          const noPostsMsg = document.getElementById('no-posts-msg');
          if (noPostsMsg) noPostsMsg.remove();
          container.insertAdjacentHTML('afterbegin', renderPost(newPost));
          refreshWallLayout({ scrollTop: true });
          container.scrollTop = 0;
        }
      } else {
        let errMsg = 'فشل في إرسال الفيديو';
        try {
          const resText = await res.text();
          try {
            const resJson = JSON.parse(resText);
            errMsg = resJson.message || errMsg;
          } catch (_) {
            if (res.status === 403) {
              errMsg = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
            } else {
              errMsg = resText || errMsg;
            }
          }
        } catch (_) {}
        if (res.status === 403 || errMsg.includes('إسكات')) {
          showChatAlert({ message: errMsg, icon: 'error' });
        } else {
          showToast(errMsg);
        }
      }
    });
  }
};

window.likePost = async (postId, btnElement) => {
  const icon = btnElement.querySelector('i');
  if (icon.classList.contains('fas')) return; // Already liked

  try {
    const res = await fetch(`/api/posts/${postId}/like`, { 
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    });
    if (res.ok) {
      // Just change icon for immediate feedback, let the socket event 'wall-update' update the count
      icon.classList.remove('far');
      icon.classList.add('fas', 'animate-like');
      
      // Remove animation class after it finishes
      setTimeout(() => {
        icon.classList.remove('animate-like');
      }, 400);
    }
  } catch (err) {
    console.error('Error liking post:', err);
  }
};

window.handleSettingsUpload = async () => {
  state.setIsSettingsUpload(true);
  document.getElementById('file-input').click();
};

window.deletePost = async (postId) => {
  try {
    const res = await fetch(`/api/posts/${postId}`, { 
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    });
    if (res.ok) {
      const postElement = document.getElementById(`post-${postId}`);
      if (postElement) {
        postElement.remove();
      } else {
        loadWall(); // Fallback if element not found
      }
    } else {
      let errorMessage = 'خطأ غير معروف';
      try {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await res.json();
          errorMessage = errorData.message || errorMessage;
        } else {
          errorMessage = `خطأ من الخادم (${res.status})`;
        }
      } catch (e) {
        errorMessage = `خطأ في معالجة الرد (${res.status})`;
      }
      showToast('فشل الحذف: ' + errorMessage);
    }
  } catch (err) {
    console.error('Error deleting post:', err);
    showToast('حدث خطأ أثناء الحذف');
  }
};

// Handle story clicks from sidebar
document.addEventListener('click', function(e) {
  const storyAvatar = e.target.closest('.js-sidebar-story-avatar.has-unviewed');
  if (!storyAvatar) return;

  e.preventDefault();
  e.stopPropagation();

  const userId = storyAvatar.dataset.userId;

  if (typeof window.openUserStoriesFromSidebar === 'function') {
    window.openUserStoriesFromSidebar(e, userId);
  }
});

window.renderUserObj = renderUserObj;
function renderUserObj(u) {
  const selectedCountry = (u.profileCountry || u.country || '')
    .toString()
    .trim()
    .toLowerCase();

  const countryCode = selectedCountry && selectedCountry !== 'unknown'
    ? selectedCountry
    : null;
  let statusColor = '#6c757d'; // Offline (gray)
  if (u.isOnline) {
    if (u.isVirtualUser && u.onlineStatusStr) {
      if (u.onlineStatusStr === 'أخضر') statusColor = '#28a745';
      else if (u.onlineStatusStr === 'أحمر') statusColor = '#dc3545';
      else if (u.onlineStatusStr === 'أصفر') statusColor = '#ffc107';
      else if (u.onlineStatusStr === 'أزرق') statusColor = '#007bff';
      else statusColor = '#6c757d';
    } else if (u.isGhost) {
      statusColor = '#6c757d'; // Ghost (gray)
    } else if (u.isHidden) {
      statusColor = '#007bff'; // Hidden (blue)
    } else if (u.isReconnecting) {
      statusColor = '#ffc107'; // Reconnecting (yellow)
    } else {
      statusColor = (u.isIdle || u.presenceState === 'idle') ? '#ffc107' : '#28a745'; // Idle (yellow) or Active (green)
    }
  }
  const ghostStyle = '';
  const cameraMutedImg = (window.domainConfig && window.domainConfig.cameraMutedImageUrl) ? 
    `<img src="${window.domainConfig.cameraMutedImageUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 0;">` : 
    `<i class="fas fa-camera" style="font-size: 16px;"></i>`;

  const currentRoom = window.currentRoom || window.currentRoomData || (window.roomsData && state.currentRoomId ? window.roomsData[state.currentRoomId] : null);
  const roomAllowsCamera = currentRoom?.allowCamera === true;

  const cameraHtml = (roomAllowsCamera && u.allowCamera && (u.userId || u.id) !== (state.currentUser?.userId || state.currentUser?.id)) ? `
    <div class="camera-sidebar-icon js-camera-request-btn ${u.isBroadcasting ? 'active' : ''}" data-user-id="${u.userId || u.id}" title="طلب مشاهدة الكاميرا" style="margin: 0 !important; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;">
      ${cameraMutedImg}
    </div>
  ` : '';

  let liveBroadcastHtml = '';
  if (u.isLiveBroadcasting === true && (u.userId || u.id) !== (state.currentUser?.userId || state.currentUser?.id)) {
    let shouldShowIcon = true;
    if (u.liveBroadcastScope === 'room') {
      const uRoomId = String(u.liveBroadcastRoomId || u.roomId);
      const myRoomId = String(state.currentRoomId || (state.currentUser && state.currentUser.roomId));
      if (uRoomId !== myRoomId) {
        shouldShowIcon = false;
      }
    }

    if (shouldShowIcon) {
      const isScreen = u.liveBroadcastSource === 'screen';
      const iconClass = isScreen ? 'fas fa-desktop' : 'fas fa-video';
      const isRoom = u.liveBroadcastScope === 'room';
      const titleText = isRoom ? 'بث مباشر للغرفة' : 'بث مباشر للجميع';
      const uId = u.userId || u.id;
      liveBroadcastHtml = `
        <div class="live-broadcast-sidebar-icon js-live-broadcast-btn active" data-user-id="${uId}" title="${titleText}" style="margin: 0 !important; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #6f42c1; color: #fff; cursor: pointer; font-size: 11px; animation: livePulse 1.4s infinite;">
          <i class="${iconClass}"></i>
        </div>
      `;
    }
  }
  
  const storyInfo = (typeof window.getSidebarStoryInfo === 'function') ? window.getSidebarStoryInfo(u.userId ?? u.id) : { hasUnviewed: false, count: 0 };
  
  const hasDesign = !!(u.membershipFrame || u.membershipBg);
  
  const showAvatar = u.showMembershipAvatar !== false;
  const showName = u.showMembershipName !== false;
  const showStatus = u.showMembershipStatus !== false;
  
  const storyColor = /^#[0-9A-Fa-f]{6}$/.test(u.ucol || '')
    ? u.ucol
    : '#ff2f7d';
  
  let html = '';
  
  if (hasDesign) {
    const normalAvatarHtml = window.renderAvatar(
      u,
      '',
      'width: 72px; height: 72px;',
      ''
    );
    const avatarHtml = storyInfo.hasUnviewed ? `
      <div class="sidebar-story-membership-wrap has-unviewed js-sidebar-story-avatar"
           data-user-id="${u.userId ?? u.id}"
           title="عرض الستوري"
           style="--story-ring-color: ${storyColor};">
        <div class="sidebar-story-membership-inner">
          ${normalAvatarHtml}
        </div>
        <span class="sidebar-story-count-badge">${storyInfo.count}</span>
      </div>
    ` : normalAvatarHtml;

    const bgStyle = u.membershipBg ? `background: url('${u.membershipBg}'); background-size: cover; background-position: center;` : 'background: #fff;';
    const textColor = u.membershipBg ? '#fff' : (u.ucol || '#000');
    const textShadow = '';
    const isActuallyOnline = u.isOnline && !u.isGhost;
    const isYellow = statusColor === '#ffc107';
    const borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;
    const ghostStyle = u.isGhost ? 'border-left: 4px solid #808080 !important;' : '';
    
    const isClickable = !!state.currentUser;
    const userKey = u.key || getPresenceKey(u);
    const domId = getPresenceDomId(userKey);
    html = `
    <div id="${domId}" class="list-group-item d-flex align-items-center border-0 border-bottom p-0 user-pro-item ${isClickable ? 'js-user-profile-btn' : ''} ${u.isGhost ? 'ghost-user' : ''}" ${isClickable ? `data-username="${escapeHTML(u.username)}"` : ''} data-user-id="${u.userId ?? u.id}" style="border-left: 5px solid ${borderColor} !important; min-height: 80px; ${bgStyle} ${textShadow} ${ghostStyle} overflow: hidden; position: relative;">
      ${showAvatar ? `
      <div style="margin: 5px 10px; flex-shrink: 0; z-index: 1;">
        ${avatarHtml}
      </div>
      ` : ''}
      <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">
        ${showName ? `
        <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">
          ${window.renderUserIdentity(u, {
              containerClasses: 'user-addon-container font-weight-bold',
              nameStyle: `color: ${u.ucol || textColor};`
          })}
          ${(cameraHtml || liveBroadcastHtml) ? `
          <div class="sidebar-name-actions d-inline-flex align-items-center gap-1" style="margin-right: 5px; margin-left: 5px; vertical-align: middle;">
            ${cameraHtml}
            ${liveBroadcastHtml}
          </div>
          ` : ''}
          ${(window.roomsData && window.roomsData[state.currentRoomId] && window.roomsData[state.currentRoomId].moderators && window.roomsData[state.currentRoomId].moderators.some(m => (typeof m === 'number' ? m === u.userId : Number(m.userId) === Number(u.userId)))) ? '<i class="fas fa-user-shield text-warning" title="مراقب الغرفة" style="margin-left: 4px;"></i>' : ''}
        </div>
        ` : ''}
        ${showStatus ? `
        <div class="user-sidebar-status fw-bold" style="color: ${(window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888'}; width: 100%; display: block;">
          ${u.msg || (u.type === 'guest' ? 'زائر' : 'عضو')}
        </div>
        ` : ''}
      </div>
      <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">
        ${(u.showMembershipFlag !== false && countryCode) ? `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); object-fit: cover;">` : ''}
        ${(u.userId && u.showMembershipId !== false) ? `<span style="font-size: 11px; font-weight: 900; color: ${u.membershipBg ? '#fff' : '#6c757d'}; letter-spacing: 0.5px;">#${Math.abs(Number(u.userId))}</span>` : ''}
      </div>
    </div>
  `;
  } else {
    // Default design for users without design
    const userId = u.userId ?? u.id;
    const normalAvatarHtml = `<img src="${window.getAvatarUrl(u)}" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" referrerPolicy="origin-when-cross-origin" class="user-avatar js-user-profile-btn" data-user-id="${userId}" data-username="${escapeHTML(u.username || '')}">`;
    const avatarHtml = storyInfo.hasUnviewed ? `
      <div class="sidebar-story-avatar-wrap has-unviewed js-sidebar-story-avatar"
           data-user-id="${userId}"
           title="عرض الستوري"
           style="--story-ring-color: ${storyColor};">
        <img src="${window.getAvatarUrl(u)}"
             class="sidebar-story-avatar-img"
             referrerPolicy="origin-when-cross-origin">
        <span class="sidebar-story-count-badge">${storyInfo.count}</span>
      </div>
    ` : normalAvatarHtml;

    const isActuallyOnline = u.isOnline && !u.isGhost;
    const isYellow = statusColor === '#ffc107';
    const borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;
    const ghostStyle = u.isGhost ? 'border-left: 4px solid #808080 !important;' : '';
    const isClickable = !!state.currentUser;
    const userKey = u.key || getPresenceKey(u);
    const domId = getPresenceDomId(userKey);
    html = `
    <div id="${domId}" class="list-group-item d-flex align-items-start border-0 border-bottom p-0 ${isClickable ? 'js-user-profile-btn' : ''}" ${isClickable ? `data-username="${escapeHTML(u.username)}"` : ''} data-user-id="${u.userId ?? u.id}" style="border-left: 4px solid ${borderColor} !important; min-height: 52px; background-color: #fff; ${ghostStyle}; cursor: default; position: relative;">
      <div style="position: relative; width: 50px; height: 50px; margin: 1px; flex-shrink: 0;">
        ${avatarHtml}
      </div>
      <div class="flex-grow-1 ps-1 d-flex flex-column" style="min-width: 0; padding-right: 4px !important; flex: 1;">
        <div class="user-sidebar-name fw-bold d-flex align-items-center flex-wrap" style="padding-right: 35px; width: 100%;">
          ${window.renderUserIdentity(u, {
              containerClasses: 'user-addon-container font-weight-bold',
              nameStyle: `color: ${u.ucol || '#000000'};`
          })}
          ${(cameraHtml || liveBroadcastHtml) ? `
          <div class="sidebar-name-actions d-inline-flex align-items-center gap-1" style="margin-right: 5px; margin-left: 5px; vertical-align: middle;">
            ${cameraHtml}
            ${liveBroadcastHtml}
          </div>
          ` : ''}
        </div>
        <div class="user-sidebar-status fw-bold" style="color: ${(window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888'}; width: 100%; display: block; margin: 0; padding: 0; line-height: 1.3;">
          ${u.msg || (u.type === 'guest' ? 'زائر' : 'عضو')}
        </div>
      </div>
      <div class="d-flex flex-column align-items-center pt-1 pe-1 flex-shrink-0" style="position: absolute; top: 2px; right: 4px; z-index: 2;">
        ${(u.showMembershipFlag !== false && countryCode) ? `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; margin-bottom: 2px; object-fit: cover; border-radius: 1px;">` : ''}
        ${(u.userId && u.showMembershipId !== false) ? `<span class="text-muted" style="font-size: 10px; font-weight: bold;">#${Math.abs(Number(u.userId))}</span>` : ''}
      </div>
    </div>
  `;
  }
  
  const finalUserKey = u.key || getPresenceKey(u);
  const finalDomId = getPresenceDomId(finalUserKey);
  return { id: finalDomId, html: html };
}

window.renderUsersInSidebar = renderUsersInSidebar;
function renderUsersInSidebar(users) {
  // If the search input has a value but currentSidebarSearchQuery is empty,
  // it means the browser autofilled it without user input. Clear it.
  if (ui.sidebarSearchInput && ui.sidebarSearchInput.value !== '' && !currentSidebarSearchQuery) {
    ui.sidebarSearchInput.value = '';
  }

  let filtered = users;
  if (currentSidebarSearchQuery) {
    filtered = users.filter(u => 
      (u.username && u.username.toLowerCase().includes(currentSidebarSearchQuery)) || 
      (u.topic && u.topic.toLowerCase().includes(currentSidebarSearchQuery)) ||
      (u.userId && u.userId.toString().includes(currentSidebarSearchQuery)) ||
      (u.id && u.id.toString().includes(currentSidebarSearchQuery))
    );
  }

  const onlineUsers = filtered.filter(u => u.isOnline || u.isGhost);
  const currentRoomUsers = onlineUsers.filter(u => Number(u.roomId) === Number(state.currentRoomId));
  const otherRoomUsers = onlineUsers.filter(u => Number(u.roomId) !== Number(state.currentRoomId));
  
  const sidebarItems = [];

  if (currentRoomUsers.length > 0) {
    sidebarItems.push(...currentRoomUsers.map(renderUserObj));
  }
  
  if (otherRoomUsers.length > 0) {
    sidebarItems.push({
      id: 'other-rooms-header',
      html: `
      <div id="other-rooms-header" class="other-rooms-header">
        المتواجدين في الدردشة
      </div>
      `
    });
    sidebarItems.push(...otherRoomUsers.map(renderUserObj));
  }

  if (ui.sidebarUsersContainer) {
    syncDOMList(ui.sidebarUsersContainer, sidebarItems);
  }
}

window.openGamesView = function() {
  toggleSidebar('games', 'الألعاب', async () => {
    const GamesManager = await window.ensureGamesManagerLoaded();
    GamesManager.loadGamesLobby();
  });
};

window.openActiveGamesView = function() {
  toggleSidebar('spectate', 'الألعاب الجارية', async () => {
    const GamesManager = await window.ensureGamesManagerLoaded();
    GamesManager.activeSpectateGames = GamesManager.activeSpectateGames || [];
    GamesManager.renderSpectateGamesList();
    if (window.socket) {
      window.socket.emit('game:spectate:list');
    }
  });
};

window.renderAddons = async function() {
  const canSeeAddons = window.featuresSettings?.sidebarAddonsEnabled === true || 
                       hasPermission('canUseAddons') || 
                       hasPermission('canManageAddons') ||
                       hasPermission('canviewsvisitprofile');
                       
  if (!canSeeAddons) {
    showToast('غير مسموح لك بالوصول إلى الإضافات');
    return;
  }

  currentAddonMode = 'self';
  currentSettingsView = 'addons';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'الإضافات';
  ui.sidebarSettingsContainer.innerHTML = `
    <div class="classic-settings-container">
      <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderSettings()">
        <i class="fas fa-chevron-right btn-icon-left"></i>
        <span>العودة للضبط</span>
      </button>
      <button class="classic-btn classic-btn-white sidebar-action position-relative" onclick="window.renderNotifications()">
        <i class="fas fa-bell btn-icon-left"></i>
        <span>الإشعارات</span>
        ${(window.pendingZajelModeration && window.pendingZajelModeration.size > 0) ? `
          <span class="badge bg-danger rounded-pill position-absolute" style="left: 10px; top: 50%; transform: translateY(-50%); font-size: 11px;">
            ${window.pendingZajelModeration.size}
          </span>
        ` : ''}
      </button>
      ${hasPermission('canDesignMembership') ? `
      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.renderMembershipDesign()">
        <i class="fas fa-id-badge btn-icon-left"></i>
        <span>تصميم العضوية</span>
      </button>
      ` : ''}
      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.openGamesView()">
        <i class="fas fa-gamepad btn-icon-left"></i>
        <span>الألعاب</span>
      </button>
      
      ${hasPermission('canviewsvisitprofile') ? `
      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.renderProfileVisitors()">
        <i class="fas fa-eye btn-icon-left"></i>
        <span>زائرين البروفايل</span>
      </button>
      ` : ''}

      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.renderIgnoredUsers()">
        <i class="fas fa-user-slash btn-icon-left"></i>
        <span>المستخدمون المتجاهلون (${state.ignoredUsers.size})</span>
      </button>

      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.renderWallCreators()">
        <i class="fas fa-award btn-icon-left"></i>
        <span>لوحة الشرف</span>
      </button>

      <button id="toggle-dark-mode-btn" class="settings-action-btn classic-btn classic-btn-white sidebar-action mb-2">
        <i class="fas fa-moon btn-icon-left"></i>
        <span>الوضع الليلي</span>
      </button>

    </div>
  `;
};

window.renderIgnoredUsers = function() {
  currentSettingsView = 'ignoredUsers';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'المستخدمون المتجاهلون';

  let html = `
    <div class="classic-settings-container p-3">
      <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
        <i class="fas fa-chevron-right btn-icon-left"></i>
        <span>العودة للإضافات</span>
      </button>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="m-0 text-dark font-weight-bold" style="font-size: 16px;"><i class="fas fa-user-slash text-danger me-2"></i>المستخدمون المتجاهلون</div>
        ${state.ignoredUsers.size > 0 ? `
          <button class="btn btn-sm btn-outline-danger" onclick="window.unignoreAllUsers()">
            <i class="fas fa-trash-alt"></i> إزالة كل التجاهل
          </button>
        ` : ''}
      </div>
  `;

  if (state.ignoredUsers.size === 0) {
    html += `
      <div class="text-center py-5 text-muted bg-light rounded border">
        <i class="fas fa-user-slash fa-3x mb-3" style="color: #ccc;"></i>
        <div class="font-weight-bold" style="font-size: 15px;">لا يوجد مستخدمون متجاهلون حالياً</div>
      </div>
    `;
  } else {
    html += '<div class="ignored-users-list px-2">';
    state.ignoredUsers.forEach(username => {
      // Try to find user info to get pic and full identity
      let user = null;
      if (state.currentUsers) {
         user = state.currentUsers.find(u => u.username === username);
      }
      if (!user && window.allUsers) {
         user = Object.values(window.allUsers).find(u => u.username === username);
      }
      
      const safeUsername = window.escapeHTML ? window.escapeHTML(username) : username;
      const avatarUrl = user ? window.getAvatarUrl(user) : '/default-avatar.png';
      
      let identityHtml = '';
      if (user && window.renderUserIdentity) {
        identityHtml = window.renderUserIdentity(user, { containerClasses: 'font-weight-bold flex-nowrap user-addon-container', nameStyle: `color: ${user.fontColor || '#000'}; font-size: 14px;` });
      } else {
        identityHtml = `<span class="font-weight-bold">${safeUsername}</span>`;
      }

      html += `
        <div class="creator-list-item d-flex align-items-center justify-content-between mb-2 px-3 py-2 bg-light shadow-sm" style="border-radius: 30px; border: 1px solid #dee2e6;">
          <div class="d-flex align-items-center overflow-hidden flex-grow-1 pe-2">
            <div class="creator-avatar me-3 flex-shrink-0">
              <img src="${avatarUrl}" style="border: 2px solid ${user ? (user.ucol || '#ccc') : '#ccc'}; width: 45px; height: 45px; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="creator-name flex-grow-1 text-truncate pe-2">
              ${identityHtml}
            </div>
          </div>
          <button class="btn btn-sm btn-danger flex-shrink-0" style="border-radius: 20px;" onclick="window.unignoreUserFromList('${encodeURIComponent(username)}')">
            إزالة التجاهل
          </button>
        </div>
      `;
    });
    html += '</div>';
  }

  html += `</div>`;
  ui.sidebarSettingsContainer.innerHTML = html;
};

window.unignoreUserFromList = function(encodedUsername) {
  const username = decodeURIComponent(encodedUsername);
  if (state.ignoredUsers.has(username)) {
    state.ignoredUsers.delete(username);
    if (typeof saveIgnoredUsers === 'function') {
      saveIgnoredUsers();
    }
    window.renderIgnoredUsers();
    if (typeof showToast === 'function') {
      showToast('تم إلغاء تجاهل العضو', 'success');
    }
  }
};

window.unignoreAllUsers = function() {
  if (state.ignoredUsers.size > 0) {
    state.ignoredUsers.clear();
    if (typeof saveIgnoredUsers === 'function') {
      saveIgnoredUsers();
    }
    window.renderIgnoredUsers();
    if (typeof showToast === 'function') {
      showToast('تم إزالة جميع المستخدمين من قائمة التجاهل', 'success');
    }
  }
};

window.renderProfileVisitors = async function() {
  currentSettingsView = 'profileVisitors';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'زائرين البروفايل';

  ui.sidebarSettingsContainer.innerHTML = `
    <div class="classic-settings-container p-3">
      <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
        <i class="fas fa-chevron-right btn-icon-left"></i>
        <span>العودة للإضافات</span>
      </button>
      <div class="text-center py-4">
        <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
        <div class="mt-2 text-muted">جاري تحميل الزوار...</div>
      </div>
    </div>
  `;

  try {
    const token = getToken();
    const [res, topRes] = await Promise.all([
      fetch('/api/profile-visits/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Chat-Token': token
        }
      }),
      fetch('/api/profile-visits/top', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Chat-Token': token
        }
      })
    ]);

    let data = { success: false, visitors: [] };
    let topData = { success: false, topVisitors: [] };

    try {
      if (res.ok) {
        data = await res.json();
      } else {
        console.error('Failed to load profile visits:', res.status, res.statusText);
      }
    } catch (e) {
      console.error('Error parsing profile visits json:', e);
    }

    try {
      if (topRes.ok) {
        topData = await topRes.json();
      } else {
        console.error('Failed to load top profile visits:', topRes.status, topRes.statusText);
      }
    } catch (e) {
      console.error('Error parsing top profile visits json:', e);
    }
    
    let html = `
      <div class="classic-settings-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
    `;

    // Global Top 3 visitors section
    if (topData.success && topData.topVisitors && topData.topVisitors.length > 0) {
      const topVisitors = topData.topVisitors;
      
      const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return num;
      };

      html += '<div class="top-visitors-container mb-3 p-3 rounded" style="background-color: #efefef; position: relative;">';
      html += '<div class="text-center mb-4 font-weight-bold" style="font-size: 16px; color: #333;"><span style="font-family: Arial, sans-serif;">أعلى البروفايلات زيارة</span><i class="fas fa-award text-warning ms-1"></i></div>';
      html += '<div class="d-flex justify-content-center align-items-end gap-2" style="min-height: 180px;">';
      
      // Reorder for podium (2, 1, 3) - in RTL this places Rank 2 on the right, Rank 1 in the center, Rank 3 on the left.
      const podiumOrder = [
        topVisitors[1] ? { ...topVisitors[1], place: 2 } : null,
        topVisitors[0] ? { ...topVisitors[0], place: 1 } : null,
        topVisitors[2] ? { ...topVisitors[2], place: 3 } : null
      ].filter(Boolean);

      podiumOrder.forEach(item => {
        const liveUsers = (window.state && window.state.currentUsers) || window.onlineUsers || [];
        const activeUser = liveUsers.find(u => (u.id || u.userId) && (String(u.id || u.userId) === String(item.id || item.profileOwnerId)) || u.username === item.username);
        const renderUserData = activeUser ? { ...item, ...activeUser } : item;

        const safeUsernameAttr = window.escapeHTML ? window.escapeHTML(renderUserData.username) : renderUserData.username;
        let identityHtml = '';
        if (window.renderUserIdentity) {
            identityHtml = window.renderUserIdentity(renderUserData, { containerClasses: 'font-weight-bold flex-nowrap user-addon-container', nameStyle: `color: ${renderUserData.ucol || renderUserData.fontColor || '#000'}; font-size: 12px;` });
        } else {
            const safeUsernameDisp = window.escapeHTML ? window.escapeHTML(renderUserData.topic || renderUserData.username) : (renderUserData.topic || renderUserData.username);
            identityHtml = `<span style="color: ${renderUserData.ucol || renderUserData.fontColor || '#000'}; font-size: 12px; font-weight: bold;">${safeUsernameDisp}</span>`;
        }

        const avatarUrl = window.getAvatarUrl(renderUserData);
        const formattedVisits = formatNumber(renderUserData.visitCount || item.visitCount);
        
        let colorTheme = '';
        let height = '';
        let avatarSize = '';
        let crownHtml = '';
        let glowHtml = '';
        
        if (item.place === 1) {
            colorTheme = '#ffc107'; // Yellow/Gold
            height = '120px';
            avatarSize = '70px';
            crownHtml = '<i class="fas fa-crown" style="color: #ffc107; font-size: 26px; position: absolute; top: -25px; left: 50%; transform: translateX(-50%); text-shadow: 0 0 10px rgba(255, 193, 7, 0.8);"></i>';
            glowHtml = 'box-shadow: 0 0 15px rgba(255, 193, 7, 0.5);';
        } else if (item.place === 2) {
            colorTheme = '#9e9e9e'; // Silver
            height = '100px';
            avatarSize = '60px';
        } else {
            colorTheme = '#d3832c'; // Bronze
            height = '85px';
            avatarSize = '60px';
        }

        html += `
          <div class="text-center d-flex flex-column align-items-center" style="cursor: pointer; width: 32%; position: relative;" onclick="window.showUserProfile('${safeUsernameAttr}')">
            <div style="position: relative; margin-bottom: -${parseInt(avatarSize)/2}px; z-index: 2;">
              ${crownHtml}
              <img src="${avatarUrl}" style="border: 3px solid ${colorTheme}; width: ${avatarSize}; height: ${avatarSize}; border-radius: 50%; object-fit: cover; background: white; ${glowHtml}" onerror="window.handleAvatarError(this)">
            </div>
            <div class="w-100 rounded bg-white shadow-sm d-flex flex-column align-items-center pb-2" style="height: ${height}; position: relative; border-radius: 12px !important; border-top: 4px solid ${colorTheme}; padding-top: ${parseInt(avatarSize)/2 + 10}px;">
              <div class="mt-auto w-100 px-1 d-flex flex-column align-items-center">
                <div style="width: 100%; margin-bottom: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  ${identityHtml}
                </div>
                <div style="background-color: #f2f7fb; color: #003b73; font-weight: bold; font-size: 13px; padding: 2px 10px; border-radius: 8px; display: inline-block;">
                  ${formattedVisits}
                </div>
              </div>
            </div>
          </div>
        `;
      });
      
      html += '</div></div>';
    }

    html += `
        <div class="d-flex justify-content-between align-items-center mb-3 mt-4">
          <div class="m-0 text-dark font-weight-bold" style="font-size: 16px;"><i class="fas fa-eye text-primary me-2"></i>زوار بروفايلي</div>
        </div>
    `;

    if (!data.success || !data.visitors || data.visitors.length === 0) {
      html += `
        <div class="text-center py-5 text-muted bg-light rounded border">
          <i class="fas fa-eye-slash fa-3x mb-3" style="color: #ccc;"></i>
          <div class="font-weight-bold" style="font-size: 15px;">لا يوجد زائرين لبروفايلك حتى الآن</div>
        </div>
      `;
    } else {
      const visitors = (data.visitors || []).slice(0, 10);
      html += '<div class="profile-visitors-list px-2">';
      visitors.forEach(user => {
        const liveUsers = (window.state && window.state.currentUsers) || window.onlineUsers || [];
        const activeUser = liveUsers.find(u => (u.id || u.userId) && (String(u.id || u.userId) === String(user.id)) || u.username === user.username);
        const renderUserData = activeUser ? { ...user, ...activeUser } : user;
        
        let identityHtml = '';
        if (window.renderUserIdentity) {
          identityHtml = window.renderUserIdentity(renderUserData, { containerClasses: 'font-weight-bold flex-nowrap user-addon-container', nameStyle: `color: ${renderUserData.ucol || renderUserData.fontColor || '#000'}; font-size: 14px;` });
        } else {
          const safeUsername = window.escapeHTML ? window.escapeHTML(renderUserData.topic || renderUserData.username) : (renderUserData.topic || renderUserData.username);
          identityHtml = `<span class="font-weight-bold" style="color: ${renderUserData.ucol || renderUserData.fontColor || '#000'}">${safeUsername}</span>`;
        }

        const safeUsernameAttr = window.escapeHTML ? window.escapeHTML(renderUserData.username) : renderUserData.username;
        const lastVisitDate = new Date(user.lastVisitedAt);
        const now = new Date();
        const isToday = lastVisitDate.getDate() === now.getDate() && lastVisitDate.getMonth() === now.getMonth() && lastVisitDate.getFullYear() === now.getFullYear();
        let lastVisitText = isToday ? 'اليوم ' + lastVisitDate.toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'}) : lastVisitDate.toLocaleDateString('ar-EG');
        const avatarUrl = window.getAvatarUrl(renderUserData);

        html += `
          <div class="creator-list-item d-flex align-items-center mb-2 p-2 bg-light shadow-sm" style="border-radius: 12px; border: 1px solid #dee2e6; cursor: pointer;" onclick="window.showUserProfile('${safeUsernameAttr}')">
            <div class="creator-avatar ms-3 flex-shrink-0" style="position: relative;">
              <img src="${avatarUrl}" style="border: 2px solid ${renderUserData.ucol || '#ccc'}; width: 40px; height: 40px; border-radius: 50%; object-fit: cover;" onerror="window.handleAvatarError(this)">
            </div>
            <div class="creator-name" style="flex: 1; min-width: 0; overflow: hidden;">
              <div style="font-size: 13px; margin-bottom: 3px; display: flex; align-items: center; max-width: 100%; overflow: hidden;">${identityHtml}</div>
              <div class="text-muted d-flex align-items-center gap-2" style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <span><i class="fas fa-clock ms-1"></i>${lastVisitText}</span>
                <span><i class="fas fa-redo ms-1"></i>زارك ${user.visitCount} مرات</span>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    html += `</div>`;
    ui.sidebarSettingsContainer.innerHTML = html;

  } catch (err) {
    console.error('General error in renderProfileVisitors:', err);
    ui.sidebarSettingsContainer.innerHTML = `
      <div class="classic-settings-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
        <div class="text-center py-5 text-danger bg-light rounded border">
          <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
          <div class="font-weight-bold" style="font-size: 15px;">حدث خطأ أثناء جلب زائرين البروفايل</div>
        </div>
      </div>
    `;
  }
};

function formatWallHonorPoints(value) {
  const number = Number(value) || 0;

  if (number < 10000) {
    return String(number);
  }

  const format = (amount, suffix) => {
    return Number(amount.toFixed(1)).toString() + suffix;
  };

  if (number >= 1000000000) {
    return format(number / 1000000000, 'B');
  }

  if (number >= 1000000) {
    return format(number / 1000000, 'M');
  }

  return format(number / 1000, 'K');
}

window.renderWallCreators = async function() {
  currentSettingsView = 'wallCreators';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'لوحة الشرف';

  ui.sidebarSettingsContainer.innerHTML = `
    <div class="classic-settings-container p-3">
      <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
        <i class="fas fa-chevron-right btn-icon-left"></i>
        <span>العودة للإضافات</span>
      </button>
      <div class="text-center py-4">
        <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
        <div class="mt-2 text-muted">جاري تحميل لوحة الشرف...</div>
      </div>
    </div>
  `;

  try {
    const token = getToken();
    const res = await apiFetch('/api/wall/creators', {
      headers: {
        ...(token ? { 
          'Authorization': `Bearer ${token}`,
          'X-Chat-Token': token 
        } : {})
      }
    });
    const data = await res.json();
    
    let html = '';
    if (data.success && data.creators && data.creators.length > 0) {
      const top3 = data.creators.slice(0, 3);
      const others = data.creators.slice(3);

      let podiumOrder = [];
      if (top3[1]) podiumOrder.push({ user: top3[1], rank: 2, iconClass: 'medal text-secondary', iconStyle: 'color: #c0c0c0;' });
      if (top3[0]) podiumOrder.push({ user: top3[0], rank: 1, iconClass: 'crown text-warning', iconStyle: '' });
      if (top3[2]) podiumOrder.push({ user: top3[2], rank: 3, iconClass: 'medal', iconStyle: 'color: #cd7f32;' });

      if (podiumOrder.length > 0) {
        html += '<div class="wall-creators-podium pb-3 mb-3 border-bottom">';
        podiumOrder.forEach(item => {
          const { user, rank, iconClass, iconStyle } = item;
          html += `
            <div class="podium-item rank-${rank}" onclick="window.showUserProfile(${user.id})">
              <div class="podium-avatar-wrapper">
                ${rank === 1 ? '<i class="fas fa-crown podium-crown text-warning"></i>' : ''}
                <div class="podium-avatar">
                  <img src="${window.getAvatarUrl(user)}" style="border-color: ${user.ucol || '#ccc'};">
                </div>
                <div class="podium-rank-badge rank-badge-${rank}">${rank}</div>
              </div>
              <div class="podium-details">
                <div class="podium-name text-truncate w-100 px-1">
                  ${window.renderUserIdentity(user, { containerClasses: 'wall-honor-identity user-addon-container font-weight-bold flex-nowrap justify-content-center', nameStyle: `color: ${user.fontColor || user.ucol || '#000'}; font-size: 13px;` })}
                </div>
                <div class="podium-points small font-weight-bold text-muted">${formatWallHonorPoints(user.wallPoints)}</div>
              </div>
            </div>
          `;
        });
        html += '</div>';
      }

      if (others.length > 0) {
        html += '<div class="wall-creators-list px-2">';
        others.forEach((user, index) => {
          const rank = index + 4;
          html += `
            <div class="creator-list-item d-flex align-items-center mb-2 px-3 py-2 bg-light shadow-sm" style="cursor:pointer;" onclick="window.showUserProfile(${user.id})">
              <div class="creator-rank font-weight-bold me-3 fs-5 text-secondary" style="width: 25px; text-align: center;">${rank}</div>
              <div class="creator-avatar me-3">
                <img src="${window.getAvatarUrl(user)}" style="border: 2px solid ${user.ucol || '#ccc'};">
              </div>
              <div class="creator-name flex-grow-1 text-truncate pe-2">
                ${window.renderUserIdentity(user, { containerClasses: 'wall-honor-identity user-addon-container font-weight-bold flex-nowrap', nameStyle: `color: ${user.fontColor || user.ucol || '#000'}; font-size: 14px;` })}
              </div>
              <div class="creator-points font-weight-bold text-muted ms-2 px-2 py-1 bg-white rounded">${formatWallHonorPoints(user.wallPoints)}</div>
            </div>
          `;
        });
        html += '</div>';
      }
    } else {
      html = `
        <div class="text-center py-5 text-muted bg-light rounded border">
          <i class="fas fa-box-open fa-3x mb-3 text-secondary"></i>
          <div class="font-weight-bold" style="font-size: 15px;">لا يوجد أعضاء في لوحة الشرف حتى الآن</div>
          <small>كن أول من يشارك منشورات يومية رائعة وتصدر القائمة!</small>
        </div>
      `;
    }

    ui.sidebarSettingsContainer.innerHTML = `
      <div class="classic-settings-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="m-0 text-dark font-weight-bold" style="font-size: 16px;"><i class="fas fa-award text-warning me-2"></i>لوحة الشرف</div>
        </div>
        <div id="wall-creators-list">
          ${html}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load wall creators:', err);
    ui.sidebarSettingsContainer.innerHTML = `
      <div class="classic-settings-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
        <div class="text-center text-danger py-4">
          <i class="fas fa-exclamation-circle mb-2"></i><br>حدث خطأ أثناء جلب البيانات.
        </div>
      </div>
    `;
  }
};

let membershipAssetsCache = null;

window.renderMembershipDesign = async function(skipLoading = false) {
  currentSettingsView = 'membership';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'تصميم العضوية';
  
  const renderUI = (assets) => {
    const backgrounds = assets ? assets.filter(a => a.type === 'background') : [];
    const frames = assets ? assets.filter(a => a.type === 'frame') : [];

    let html = `
      <div class="membership-pro-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
        <!-- Background Section -->
        <div class="design-section mb-4">
          <div class="section-header d-flex justify-content-between align-items-center mb-3">
            <div class="d-flex align-items-center">
              <div class="icon-box me-2"><i class="fas fa-image"></i></div>
              <h6 class="mb-0 fw-bold">خلفية العضوية</h6>
            </div>
            <button class="upload-btn-pro" onclick="document.getElementById('membership-bg-upload').click()">
              <i class="fas fa-cloud-upload-alt"></i> رفع خاص
            </button>
          </div>
          <div class="assets-grid">
            <div class="asset-card ${!state.currentUser.membershipBg ? 'active' : ''}" onclick="updateMembershipDesign('membershipBg', null)">
              <div class="none-box"><i class="fas fa-ban"></i><span>بدون</span></div>
            </div>
            ${backgrounds.map(bg => `
              <div class="asset-card ${state.currentUser.membershipBg === bg.url ? 'active' : ''}" onclick="updateMembershipDesign('membershipBg', '${bg.url}')">
                <div class="img-box" style="background-image: url('${bg.url}')"></div>
              </div>
            `).join('')}
            ${state.currentUser.membershipBg && !backgrounds.find(b => b.url === state.currentUser.membershipBg) ? `
              <div class="asset-card active">
                <div class="img-box" style="background-image: url('${state.currentUser.membershipBg}')"></div>
                <div class="custom-badge">خاص</div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Frame Section -->
        <div class="design-section mb-4">
          <div class="section-header d-flex justify-content-between align-items-center mb-3">
            <div class="d-flex align-items-center">
              <div class="icon-box me-2"><i class="fas fa-border-style"></i></div>
              <h6 class="mb-0 fw-bold">برواز الصورة</h6>
            </div>
            <button class="upload-btn-pro" onclick="document.getElementById('membership-frame-upload').click()">
              <i class="fas fa-cloud-upload-alt"></i> رفع خاص
            </button>
          </div>
          <div class="assets-grid frames-grid">
            <div class="asset-card frame-card ${!state.currentUser.membershipFrame ? 'active' : ''}" onclick="updateMembershipDesign('membershipFrame', null)">
              <div class="none-box circular"><i class="fas fa-ban"></i></div>
            </div>
            ${frames.map(frame => `
              <div class="asset-card frame-card ${state.currentUser.membershipFrame === frame.url ? 'active' : ''}" onclick="updateMembershipDesign('membershipFrame', '${frame.url}')">
                <div class="frame-preview-box">
                  <img src="${window.getAvatarUrl(state.currentUser)}" class="preview-avatar">
                  <img src="${frame.url}" class="preview-frame">
                </div>
              </div>
            `).join('')}
            ${state.currentUser.membershipFrame && !frames.find(f => f.url === state.currentUser.membershipFrame) ? `
              <div class="asset-card frame-card active">
                <div class="frame-preview-box">
                  <img src="${window.getAvatarUrl(state.currentUser)}" class="preview-avatar">
                  <img src="${state.currentUser.membershipFrame}" class="preview-frame">
                </div>
                <div class="custom-badge">خاص</div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Display Options Section -->
        <div class="design-section mb-4">
          <div class="section-header d-flex align-items-center mb-3">
            <div class="icon-box me-2"><i class="fas fa-cog"></i></div>
            <h6 class="mb-0 fw-bold">خيارات العرض</h6>
          </div>
          <div class="display-options">
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار علم الدولة</div>
                <div class="text-muted" style="font-size: 10px;">عرض علم دولتك بجانب اسمك</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-flag" ${state.currentUser.showMembershipFlag !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipFlag', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار رقم العضوية</div>
                <div class="text-muted" style="font-size: 10px;">عرض الرقم التعريفي الخاص بك</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-id" ${state.currentUser.showMembershipId !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipId', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار الصورة الشخصية</div>
                <div class="text-muted" style="font-size: 10px;">عرض صورتك الشخصية والبرواز</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-avatar" ${state.currentUser.showMembershipAvatar !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipAvatar', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار الاسم</div>
                <div class="text-muted" style="font-size: 10px;">عرض اسمك المستعار</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-name" ${state.currentUser.showMembershipName !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipName', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار الحالة</div>
                <div class="text-muted" style="font-size: 10px;">عرض حالتك أسفل الاسم</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-status" ${state.currentUser.showMembershipStatus !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipStatus', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center">
              <div class="option-info">
                <div class="fw-bold small">لون تصميم البروفايل</div>
                <div class="text-muted" style="font-size: 10px;">اختر لون خلفية إضافي للبروفايل</div>
              </div>
              <div class="d-flex flex-column align-items-center">
                <input type="color" id="membership-status-bg"
                  value="${(state.currentUser.statusBgColor && state.currentUser.statusBgColor !== 'transparent') ? state.currentUser.statusBgColor : '#ffffff'}"
                  onchange="updateMembershipDesign('statusBgColor', this.value)"
                  class="form-control form-control-color border-0 p-0 shadow-none bg-transparent"
                  style="width: 30px; height: 30px; cursor: pointer;" title="اختر اللون">
                ${state.currentUser.statusBgColor && state.currentUser.statusBgColor !== 'transparent' ? `
                <button class="btn btn-sm text-danger mt-1 p-0 fw-bold" style="font-size: 10px; background: none; border: none; outline: none; box-shadow: none;" onclick="updateMembershipDesign('statusBgColor', 'transparent')">بدون لون</button>
                ` : `<span style="font-size:10px;text-align:center" class="text-muted mt-1">بدون لون</span>`}
              </div>
            </div>
          </div>
        </div>

      </div>

      <style>
        .membership-pro-container { direction: rtl; font-family: var(--font-family); }
        .design-section { background: #fff; border-radius: 12px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .icon-box { width: 30px; height: 30px; background: #f0f2f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #0d6efd; }
        .upload-btn-pro { background: #e7f3ff; color: #0d6efd; border: none; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; transition: 0.3s; }
        .upload-btn-pro:hover { background: #0d6efd; color: #fff; }
        .assets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 10px; }
        .asset-card { position: relative; border-radius: 10px; border: 2px solid #f0f2f5; cursor: pointer; transition: 0.3s; overflow: hidden; aspect-ratio: 3/2; }
        .asset-card:hover { border-color: #0d6efd; transform: translateY(-2px); }
        .asset-card.active { border-color: #0d6efd; background: #f0f7ff; }
        .asset-card.active::after { content: '\\f058'; font-family: 'Font Awesome 5 Free'; font-weight: 900; position: absolute; top: 2px; right: 2px; color: #0d6efd; font-size: 14px; background: #fff; border-radius: 50%; }
        .none-box { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #adb5bd; font-size: 12px; }
        .none-box i { font-size: 18px; margin-bottom: 2px; }
        .img-box { height: 100%; background-size: cover; background-position: center; }
        .frame-card { aspect-ratio: 1/1; }
        .frame-preview-box { position: relative; width: 100%; height: 100%; padding: 5px; }
        .preview-avatar { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
        .preview-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        .custom-badge { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(13, 110, 253, 0.8); color: #fff; font-size: 9px; text-align: center; padding: 2px 0; }
        .display-options { padding: 5px 0; }
        .option-item { border-bottom: 1px solid #f0f2f5; padding-bottom: 10px; }
        .option-item:last-child { border-bottom: none; padding-bottom: 0; }
        .form-check-input { cursor: pointer; width: 35px; height: 18px; }
        .form-check-input:checked { background-color: #0d6efd; border-color: #0d6efd; }
        .back-btn-pro { background: #343a40; color: #fff; border: none; padding: 10px; border-radius: 10px; font-weight: bold; transition: 0.3s; display: flex; align-items: center; justify-content: center; }
        .back-btn-pro:hover { background: #000; }
      </style>
    `;
    
    if (ui.sidebarSettingsContainer) ui.sidebarSettingsContainer.innerHTML = html;
  };

  // Render immediately with cached or empty values
  renderUI(membershipAssetsCache || []);

  try {
    const res = await fetch('/api/membership-assets', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const assets = await res.json();
    
    // Update cache and re-render if different
    if (JSON.stringify(membershipAssetsCache) !== JSON.stringify(assets) && currentSettingsView === 'membership') {
      membershipAssetsCache = assets;
      renderUI(membershipAssetsCache);
    }
  } catch (err) {
    console.error(err);
    if (!membershipAssetsCache) {
      ui.sidebarSettingsContainer.innerHTML = '<div class="p-4 text-danger text-center"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><div>فشل تحميل الاستوديو</div></div>';
    }
  }
};

window.uploadMembershipAsset = async function(type, file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const endpoint = type === 'background' ? '/api/upload/membership-bg' : '/api/upload/membership-frame';
  const field = type === 'background' ? 'membershipBg' : 'membershipFrame';
  const typeName = type === 'background' ? 'خلفية' : 'برواز';
  
  try {
    Swal.fire({
      title: `جاري رفع ال${typeName}...`,
      html: 'يرجى الانتظار قليلاً، يتم معالجة الصورة بأعلى جودة',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });
    
    if (res.ok) {
      const result = await res.json();
      await updateMembershipDesign(field, result.url);
      
      Swal.fire({
        icon: 'success',
        title: 'تم الرفع بنجاح',
        text: `تم تطبيق ال${typeName} الجديدة على ملفك الشخصي`,
        timer: 2000,
        showConfirmButton: false
      });
    } else {
      const err = await res.json();
      Swal.fire({
        icon: 'error',
        title: 'فشل الرفع',
        text: err.message || 'حدث خطأ غير متوقع أثناء الرفع'
      });
    }
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'خطأ في الاتصال',
      text: 'تعذر الوصول إلى السيرفر، يرجى التحقق من اتصالك'
    });
  }
};

window.updateMembershipDesign = async function(field, value) {
  const data = {};
  data[field] = value;
  // Use silent update to avoid Swal and full renderSettings()
  await updateUserSettings(data, true);
  // Re-render design tab without flickering
  renderMembershipDesign(true);
};

let notificationsCache = null;
window.sessionNotifications = window.sessionNotifications || [];

window.renderNotifications = async function(skipLoading = false) {
  currentSettingsView = 'notifications';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'الإشعارات';
  
  const renderUI = (notifications) => {
    let html = `
      <div class="classic-settings-container">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
    `;
    
    if (window.pendingZajelModeration && window.pendingZajelModeration.size > 0) {
      html += `
        <div class="zajel-moderation-section mb-3">
          <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom border-secondary">
            <div class="fw-bold text-dark" style="font-size: 13px;">
              <i class="fas fa-feather-alt me-1 text-primary"></i> طلبات مراجعة زاجل
            </div>
            <span class="badge bg-danger rounded-pill">${window.pendingZajelModeration.size}</span>
          </div>
          <div class="zajel-moderation-list">
      `;
      window.pendingZajelModeration.forEach((req) => {
        const date = new Date(req.createdAt || Date.now());
        const timeStr = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
        html += `
          <div class="card mb-2 p-2 shadow-sm border" id="zajel-req-card-${req.id}" style="background: #fff8e1; border-color: #ffe082 !important;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-bold text-dark" style="font-size: 13px;">${escapeHTML(req.username)}</span>
              <small class="text-muted" style="font-size: 11px;">${timeStr}</small>
            </div>
            <div class="text-dark mb-2" style="font-size: 12px; word-break: break-word; text-align: right; direction: rtl;">${escapeHTML(req.message)}</div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-success flex-grow-1 py-1" style="font-size: 12px;" onclick="window.moderateZajelRequest(${req.id}, 'approve')">
                <i class="fas fa-check me-1"></i> قبول
              </button>
              <button class="btn btn-sm btn-danger flex-grow-1 py-1" style="font-size: 12px;" onclick="window.moderateZajelRequest(${req.id}, 'reject')">
                <i class="fas fa-times me-1"></i> رفض
              </button>
            </div>
          </div>
        `;
      });
      html += `
          </div>
        </div>
      `;
    }
    
    if ((!notifications || notifications.length === 0) && (!window.pendingZajelModeration || window.pendingZajelModeration.size === 0)) {
      html += '<div class="p-3 text-center text-muted">لا توجد إشعارات حالية في هذه الجلسة</div>';
    } else if (notifications && notifications.length > 0) {
      notifications.forEach(n => {
        const date = new Date(n.createdAt);
        const timeStr = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
        const sender = n.sender || {};
        const senderAvatar = escapeHTML(sender.pic || '/uploads/site/default.png');
        const hasBanner = !!sender.membershipBg && n.type !== 'manual_alert';
        const itemBg = hasBanner ? `url('${escapeHTML(sender.membershipBg)}')` : '#fff';
        const decorationBg = escapeHTML(sender.bg || 'transparent');
        const ucol = escapeHTML(sender.ucol || (hasBanner ? '#fff' : '#333'));
        const safeUsername = escapeHTML(sender.username || 'نظام');
        
        const rawMessage = n.message || n.text || '';
        const processedMessage = window.replacePlaceholders ? window.replacePlaceholders(window.replaceShortcuts ? window.replaceShortcuts(escapeHTML(rawMessage)) : escapeHTML(rawMessage)) : escapeHTML(rawMessage);
        
        const hasUsername = sender && sender.username && sender.username !== 'نظام';
        const senderIdentityHtml = window.renderUserIdentity ? window.renderUserIdentity(sender, {
          nameStyle: `color: ${ucol}; font-size: 13px; cursor: ${hasUsername ? 'pointer' : 'default'};`,
          nameClasses: hasUsername ? 'js-user-profile-btn' : '',
          onClick: hasUsername ? `window.showUserProfile('${sender.username}')` : ''
        }) : `<span style="color: ${ucol};">${safeUsername}</span>`;

        let textContentHtml = '';
        if (n.type === 'manual_alert') {
          textContentHtml = `
            <div class="text-muted mb-1" style="font-size: 11px;">أرسل لك تنبيهًا</div>
            <div class="sidebar-notification-text" style="color: #333; word-break: break-word;">${processedMessage}</div>
          `;
        } else {
          textContentHtml = `
            <div class="sidebar-notification-text" style="color: ${hasBanner ? '#fff' : '#333'};">
              ${processedMessage}
            </div>
          `;
        }

        html += `
          <div class="classic-notification-item sidebar-notification-item" style="background-image: ${itemBg};">
            ${hasBanner ? '<div class="sidebar-notification-overlay"></div>' : ''}
            <div class="sidebar-notification-content">
              <img src="${senderAvatar}" class="sidebar-notification-avatar" onerror="this.onerror=null;this.src='/uploads/site/default.png';">
              <div class="flex-grow-1" style="min-width: 0;">
                <div class="sidebar-notification-sender" style="background: ${decorationBg};">
                  ${senderIdentityHtml}
                </div>
                ${textContentHtml}
              </div>
              <span class="sidebar-notification-time" style="color: ${hasBanner ? '#eee' : '#6c757d'};">${timeStr}</span>
            </div>
          </div>
        `;
      });
    }
    
    html += `</div>`;
    
    if (ui.sidebarSettingsContainer) ui.sidebarSettingsContainer.innerHTML = html;
  };

  // Render purely from the session-based RAM list
  renderUI(window.sessionNotifications || []);
};




window.updateLiveBroadcastButtonVisibility = function() {
  const btn = document.getElementById('top-live-broadcast-btn');
  if (!btn) return;

  const liveEnabled = window.featuresSettings?.liveBroadcastEnabled === true;
  const hasLivePermission = typeof hasPermission === 'function' && hasPermission('canStartLiveBroadcast') === true;

  const currentRoom =
    window.currentRoom ||
    window.currentRoomData ||
    (window.roomsData && state.currentRoomId ? window.roomsData[state.currentRoomId] : null);

  const roomAllowsLive = currentRoom ? currentRoom.allowBroadcast === true : false;
  const currentRoomId = state.currentRoomId;

  const shouldShow =
    liveEnabled &&
    hasLivePermission &&
    currentRoomId &&
    Number(currentRoomId) > 0 &&
    roomAllowsLive;

  btn.classList.toggle('d-none', !shouldShow);
};

function updateUIForUser() {
  if (typeof window.applyRoomMessagesNightMode === 'function') {
    window.applyRoomMessagesNightMode();
  }
  // Update admin panel button visibility
  const topAdminBtn = document.getElementById('top-admin-btn');
  if (topAdminBtn) {
    if (hasPermission('canAccessAdminPanel')) {
      topAdminBtn.classList.remove('d-none');
    } else {
      topAdminBtn.classList.add('d-none');
    }
  }

  // Update live broadcast button visibility
  if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
    window.updateLiveBroadcastButtonVisibility();
  }



  updateExtraActionsVisibility();


  // If the user profile modal is currently open for the current user, update it
  const profileModal = document.getElementById('user-profile-modal');
  if (profileModal && profileModal.style.display === 'flex') {
    const usernameElem = profileModal.querySelector('.profile-username');
    if (usernameElem && usernameElem.textContent === state.currentUser.username) {
      // Re-render the profile modal to reflect new permissions/roles
      showUserProfile(state.currentUser.username);
    }
  }

  // If the addons modal is currently open for the current user, update it
  const addonsModal = document.getElementById('manageAddonsModal');
  if (addonsModal && addonsModal.classList.contains('show')) {
    if (profileUser && profileUser.username === state.currentUser.username) {
      // The user will need to close and reopen the modal to see new tabs
      // We could re-render it here, but it's complex because it's an inline function
    }
  }

  // If the wall is open, re-render it to show/hide delete buttons
  if (state.activeSidebarTab === 'wall') {
    loadWall();
  }

  // Re-render the users list to update the current user's name color/icon if changed
  if (state.activeSidebarTab === 'users') {
    renderUsersInSidebar(state.currentUsers);
  }

  // Re-render the rooms list if open to show/hide "Create Room" button
  if (state.activeSidebarTab === 'rooms') {
    renderRoomsInSidebar(state.rooms);
  }

  // Re-render the settings sidebar if open
  if (state.activeSidebarTab === 'settings') {
    const currentTitle = ui.sidebarTitle ? ui.sidebarTitle.innerText : '';
    if (currentTitle === 'تصميم العضوية المميزة') {
      renderMembershipDesign(true);
    } else if (currentTitle === 'الإشعارات') {
      renderNotifications(true);
    } else {
      renderSettings();
    }
  }

  // Update Chat UI (Bot buttons, mic slots, etc.)
  updateChatUI();
}

window.completeChatLogin = async (user, token, clientSessionId) => {
  return loginSuccess(user, token, clientSessionId);
};

function loginSuccess(user, token, clientSessionId) {
  isLoggingOut = false;
  window.isLoggingOut = false;
  lastRealActivityAt = Date.now();
  lastActivityEmit = 0;
  presenceIdleSent = false;

  hasJoinedChatOnce = false;
  window.hasJoinedChatOnce = false;

  // Flag that we are switching sockets for login
  isLoginSocketSwitch = true;
  hideReconnectBar();

  // Save member username if applicable
  if (user && user.type === 'member' && user.username) {
    localStorage.setItem('chat_member_username', user.username);
    localStorage.setItem('chat_remember_member_name', 'true');
  }

  // Ensure roleRank is directly on the user object for easier access
  if (user.group && user.group.roleRank !== undefined) {
    user.roleRank = user.group.roleRank;
  }
  // Ensure userId is present for compatibility
  if (user.id && !user.userId) {
    user.userId = user.id;
  }
  state.setCurrentUser(user);

  if (state.loginBehavior && state.loginBehavior.behavior === 'no_room') {
    pendingInitialRoomSelection = true;
    state.setCurrentRoomId(0);
  } else {
    pendingInitialRoomSelection = false;
    state.setCurrentRoomId(1);
  }

  if (token) {
    try {
      sessionStorage.setItem('token', token);
      sessionStorage.removeItem('user'); // We don't need to store user object anymore, we fetch it on load
    } catch (e) {
      console.warn('Could not save token:', e);
    }
  }

  // Initialize notification and effect sound manager after successful login
  if (window.profileSoundManager) {
    window.profileSoundManager.init();
  }
  
  // Use passed clientSessionId or generate a new one
  const sessionToUse = clientSessionId || window.createNewClientSessionId();

  // Ensure reconnection is allowed for this fresh socket connection
  if (socket.io) {
    socket.io.opts.reconnection = true;
  }

  // Update socket auth token and reconnect to apply new authentication
  socket.auth = { token, clientSessionId: sessionToUse };
  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
  
  // Update all UI elements based on permissions
  updateUIForUser();
  updateChatUI();

  if (typeof renderZajelTicker === 'function') {
    renderZajelTicker();
  }
  
  if (typeof window.fetchStories === 'function') {
    window.fetchStories();
  }
  
  loadShortcuts();
  updateChatUI();
  
  // Pre-load sidebar content for instant switching
  loadRooms();
  renderSettings();

  // Open users tab if setting is enabled
  if (state.loginBehavior && state.loginBehavior.openUsersTabOnLogin) {
    // Small delay to ensure everything is rendered
    setTimeout(() => {
      if (typeof toggleSidebar === 'function') {
        toggleSidebar('users', 'المتواجدين', () => renderUsersInSidebar(state.currentUsers));
      }
    }, 500);
  }
}

async function loadShortcuts() {
  try {
    const res = await window.fetchWithRetry('/api/shortcuts');
    if (res.ok) {
      state.setShortcuts(await res.json());
    } else {
      console.error('Shortcuts response not ok:', res.status, res.statusText);
    }
  } catch (err) {
    console.error('Failed to load shortcuts:', err);
  }
}

async function loadSmileys() {
  try {
    const res = await window.fetchWithRetry('/api/smileys');
    if (res.ok) {
      state.setSmileys(await res.json());
      // Refresh emoji picker if it's open
      if (ui.emojiPicker && !ui.emojiPicker.classList.contains('d-none')) {
        loadEmojiPickerContent();
      }
    } else {
      console.error('Smileys response not ok:', res.status, res.statusText);
    }
  } catch (err) {
    console.error('Failed to load smileys:', err);
  }
}

let cachedShortcutsRegex = null;
let cachedSortedSmileys = [];
let cachedSmileysMap = new Map();
let lastSmileysCount = 0;

window.normalizeNumerals = function(str) {
  if (!str) return '';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const farsiDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';
  return str.toString()
    .replace(/[٠-٩]/g, d => englishDigits[arabicDigits.indexOf(d)])
    .replace(/[۰-۹]/g, d => englishDigits[farsiDigits.indexOf(d)]);
}

window.normalizeNumeralsPattern = function(str) {
  if (!str) return '';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const farsiDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';
  let result = '';
  str = str.toString();
  for (const char of str) {
    const arabicIdx = arabicDigits.indexOf(char);
    const farsiIdx = farsiDigits.indexOf(char);
    const engIdx = englishDigits.indexOf(char);
    
    if (arabicIdx !== -1 || farsiIdx !== -1 || engIdx !== -1) {
      const idx = arabicIdx !== -1 ? arabicIdx : (farsiIdx !== -1 ? farsiIdx : engIdx);
      result += `[${arabicDigits[idx]}${farsiDigits[idx]}${englishDigits[idx]}]`;
    } else {
      result += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return result;
}

function replaceShortcuts(text) {
  if (!state.smileys || !Array.isArray(state.smileys) || state.smileys.length === 0) return text;

  // Check if we need to rebuild the cache
  if (!cachedShortcutsRegex || state.smileys.length !== lastSmileysCount) {
    lastSmileysCount = state.smileys.length;
    cachedSortedSmileys = [...state.smileys].sort((a, b) => b.shortcut.length - a.shortcut.length);
    
    // Re-populate Map for O(1) lookups
    cachedSmileysMap.clear();
    cachedSortedSmileys.forEach(s => cachedSmileysMap.set(window.normalizeNumerals(s.shortcut), s));
    
    const pattern = cachedSortedSmileys
      .map(s => window.normalizeNumeralsPattern(s.shortcut || ''))
      .filter(p => p.length > 0)
      .join('|');
    
    if (pattern) {
      // Use a more lenient pattern that doesn't strictly require spaces if the shortcut is distinct
      // This helps with shortcuts like ه1 that users might type quickly or together
      cachedShortcutsRegex = new RegExp(`(${pattern})`, 'g');
    } else {
      cachedShortcutsRegex = null;
    }
  }
  
  if (!cachedShortcutsRegex) return text;

  // Protect __SMILEY|...__ placeholders
  const placeholders = [];
  let protectedText = text.toString().replace(/__SMILEY\|[\s\S]*?__/g, (match) => {
    placeholders.push(match);
    return `___PLACEHOLDER_${placeholders.length - 1}___`;
  });

  // Protect any __SHT|...__ placeholders
  const shtPlaceholders = [];
  protectedText = protectedText.replace(/__SHT\|[\s\S]*?__SHT/g, (match) => {
    shtPlaceholders.push(match);
    return `___SHTPLACEHOLDER_${shtPlaceholders.length - 1}___`;
  });

  // Protect HTML tags (especially any existing <img> tags if any)
  const htmlTags = [];
  protectedText = protectedText.replace(/<[^>]+>/g, (match) => {
    htmlTags.push(match);
    return `___HTMLTAG_${htmlTags.length - 1}___`;
  });

  // Now replace shortcuts safely on the protected text
  protectedText = protectedText.replace(cachedShortcutsRegex, (match, p1) => {
    const shortcutText = p1 || match;
    const s = cachedSmileysMap.get(window.normalizeNumerals(shortcutText));
    if (!s) return match;

    const isSticker = s.type === 'sticker';
    const className = isSticker ? 'sticker-img' : 'smiley-img';
    
    const imgHtml = `<img src="${s.url}" class="${className}" alt="${s.shortcut}" title="${s.order}">`;
    return imgHtml;
  });

  // Restore HTML tags
  protectedText = protectedText.replace(/___HTMLTAG_(\d+)___/g, (match, index) => {
    return htmlTags[parseInt(index, 10)];
  });

  // Restore __SHT placeholders
  protectedText = protectedText.replace(/___SHTPLACEHOLDER_(\d+)___/g, (match, index) => {
    return shtPlaceholders[parseInt(index, 10)];
  });

  // Restore __SMILEY placeholders
  protectedText = protectedText.replace(/___PLACEHOLDER_(\d+)___/g, (match, index) => {
    return placeholders[parseInt(index, 10)];
  });

  return protectedText;
}

function replacePlaceholders(text) {
  if (!text) return '';
  
  // 1. Process Shortcuts first (they might contain stickers/smileys __SMILEY tags)
  let res = text.replace(/__SHT\|([^|]*)\|([\s\S]*?)__SHT/g, (match, key, val) => {
    return `<span class="shortcut-text" title="${key}">${val}</span>`;
  });
  
  // 2. Process Smileys/Stickers
  res = res.replace(/__SMILEY\|(.*?)\|(.*?)\|(.*?)\|(.*?)\|(.*?)__/g, (match, url, width, height, name, type) => {
    const className = type === 'sticker' ? 'sticker-img' : 'smiley-img';
    const style = width && height ? `style="width: ${width}; height: ${height};"` : '';
    return `<img src="${url}" class="${className}" ${style} alt="" loading="lazy">`;
  });
  
  return res;
}

window.replacePlaceholders = replacePlaceholders;
window.replaceShortcuts = replaceShortcuts;

/* Mentions Implementation */
function setupMentions() {
  if (!ui.chatInput || !window.featuresSettings?.mentionsEnabled) return;
  
  const picker = document.getElementById('mentions-picker');
  if (!picker) return;

  let activeIndex = -1;
  let filteredUsers = [];

  ui.chatInput.addEventListener('keydown', (e) => {
    if (picker.classList.contains('d-none')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % filteredUsers.length;
      updateActiveMention();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + filteredUsers.length) % filteredUsers.length;
      updateActiveMention();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filteredUsers.length > 0 && activeIndex >= 0) {
        e.preventDefault();
        selectMention(filteredUsers[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      hideMentions();
    }
  });

  ui.chatInput.addEventListener('input', () => {
    const text = ui.chatInput.value;
    const caretPos = ui.chatInput.selectionStart;
    const textBeforeCaret = text.substring(0, caretPos);
    const words = textBeforeCaret.split(/\s/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('@')) {
      const query = lastWord.substring(1).toLowerCase();
      showMentions(query);
    } else {
      hideMentions();
    }
  });

  function showMentions(query) {
    // currentUsers comes from state module
    filteredUsers = state.currentUsers.filter(u => 
      Number(u.roomId) === Number(state.currentRoomId) && (
        (u.username && u.username.toLowerCase().includes(query)) || 
        (u.topic && u.topic.toLowerCase().includes(query)) ||
        (u.nickname && u.nickname.toLowerCase().includes(query))
      )
    ).slice(0, 10);

    if (filteredUsers.length === 0) {
      hideMentions();
      return;
    }

    picker.innerHTML = filteredUsers.map((u, i) => {
      return `
        <div class="mention-item ${i === activeIndex ? 'active' : ''}" data-index="${i}">
          <img src="${window.getAvatarUrl(u)}" class="mention-avatar" onerror="window.handleAvatarError(this)" alt="">
          <div class="mention-info d-flex align-items-center">
            ${window.renderUserIdentity(u, {
                containerClasses: 'user-addon-container',
                nameClasses: 'nickname',
                nameStyle: 'color: inherit;'
            })}
          </div>
        </div>
      `;
    }).join('');

    picker.classList.remove('d-none');
    activeIndex = 0;
    updateActiveMention();

    // Position picker above input
    const rect = ui.chatInput.getBoundingClientRect();
    picker.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
    picker.style.left = rect.left + 'px';
  }

  function hideMentions() {
    picker.classList.add('d-none');
    activeIndex = -1;
  }

  function updateActiveMention() {
    const items = picker.querySelectorAll('.mention-item');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === activeIndex);
    });
  }

  function selectMention(user) {
    const text = ui.chatInput.value;
    const caretPos = ui.chatInput.selectionStart;
    const textBeforeCaret = text.substring(0, caretPos);
    const textAfterCaret = text.substring(caretPos);
    
    const words = textBeforeCaret.split(/\s/);
    const displayName = user.topic || user.nickname || user.username;
    // استبدال النص بالزخرفة أو الاسم المستعار
    words[words.length - 1] = `@${displayName} `;
    
    ui.chatInput.value = words.join(' ') + textAfterCaret;
    hideMentions();
    ui.chatInput.focus();
  }

  picker.addEventListener('click', (e) => {
    const item = e.target.closest('.mention-item');
    if (item) {
      const index = parseInt(item.dataset.index);
      selectMention(filteredUsers[index]);
    }
  });

  // Hide on blur or click away
  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target) && e.target !== ui.chatInput) {
      hideMentions();
    }
  });
}

function replaceMentions(text, playSound = false) {
  if (!window.featuresSettings?.mentionsEnabled) return text;
  
  if (!state.currentUsers || state.currentUsers.length === 0) return text;
  
  let result = text;
  
  // Create an array of possible mention names for each user, sorted by longest name first to avoid partial matches
  let mentionOptions = [];
  state.currentUsers.forEach(u => {
    if (u.topic && u.topic.trim() !== '') mentionOptions.push({ name: u.topic, user: u });
    if (u.nickname && u.nickname.trim() !== '') mentionOptions.push({ name: u.nickname, user: u });
    if (u.username && u.username.trim() !== '') mentionOptions.push({ name: u.username, user: u });
  });
  
  mentionOptions.sort((a, b) => b.name.length - a.name.length);
  
  let mentionedCurrentUser = false;

  mentionOptions.forEach(opt => {
     // Escape special regex chars in name
     const escapedName = opt.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
     // Match @Name, but ensure it's not part of another word
     const regex = new RegExp(`@${escapedName}(?=\\s|$|<)`, 'g');
     result = result.replace(regex, (match) => {
        if (state.currentUser && (opt.user.username === state.currentUser.username || opt.user.id === state.currentUser.id)) {
            mentionedCurrentUser = true;
        }
        return window.renderUserIdentity(opt.user, {
           containerClasses: 'mention-highlight',
           onClick: `window.showUserProfile('${opt.user.username}')`
        });
     });
  });

  // Play alert if the current user was mentioned, and the flag is true
  if (playSound && mentionedCurrentUser && window.profileSoundManager) {
      window.profileSoundManager.playAlert();
  }
  
  return result;
}

socket.on('shortcuts:updated', loadShortcuts);
socket.on('smileys:updated', loadSmileys);

// Chat Handlers
lastActivityEmit = 0;
lastRealActivityAt = Date.now();
presenceIdleSent = false;

function handleRealActivity() {
  lastRealActivityAt = Date.now();
  const wasIdle = presenceIdleSent;
  presenceIdleSent = false;
  if (wasIdle || (lastRealActivityAt - lastActivityEmit > 5000)) {
    if (socket && socket.connected) {
      socket.emit('activity');
    }
    lastActivityEmit = lastRealActivityAt;
  }
}

if (ui.chatInput) {
  ui.chatInput.addEventListener('input', () => {
    if (ui.chatInput.value.trim().length > 0) {
      handleRealActivity();
    }
  });
}

document.addEventListener('input', (e) => {
  const target = e.target;
  if (!target) return;

  if (target === ui.chatInput || target.id === 'chat-input') {
    handleRealActivity();
    return;
  }

  if (target.id === 'private-chat-input' || (target.classList && target.classList.contains('private-chat-input'))) {
    handleRealActivity();
    return;
  }

  if (target.closest && target.closest('#sidebar-wall-container')) {
    handleRealActivity();
    return;
  }
});

document.addEventListener('keydown', (e) => {
  const target = e.target;
  if (!target) return;
  if (target.id === 'chat-input' || target.id === 'private-chat-input' || (target.classList && target.classList.contains('private-chat-input'))) {
    handleRealActivity();
  }
});

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!target) return;
  if (target.closest && (
    target.closest('#chat-form') ||
    target.closest('.private-chat-window') ||
    target.closest('.private-chat-box') ||
    target.closest('#emoji-picker') ||
    target.closest('.smiley-item') ||
    target.closest('#send-btn')
  )) {
    handleRealActivity();
  }
});

setInterval(() => {
  if (!state.currentUser || !socket.connected) return;
  const now = Date.now();
  // If inactive for 3 minutes (we check every 30 seconds)
  if (now - lastRealActivityAt >= 3 * 60 * 1000) {
    if (!presenceIdleSent) {
      socket.emit('presence:idle', { reason: 'real_inactivity' });
      presenceIdleSent = true;
    }
  }
}, 30000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (socket && socket.connected) {
      if (!presenceIdleSent) {
        socket.emit('presence:idle', { reason: 'page_hidden' });
        presenceIdleSent = true;
      }
    }
  } else if (document.visibilityState === 'visible') {
    if (socket && !socket.connected && window.state && window.state.currentUser) {
      console.log('Page visible, requesting socket connection...');
      socket.connect();
    }
    // Staying yellow (idle) on tab reveal as requested, green only on chat interaction
  }
});

window.addEventListener('beforeunload', (e) => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  if (token && !isLoggingOut && !window.isLoggingOut) {
    const confirmationMessage = 'هل أنت متأكد من رغبتك في الخروج؟';
    e.preventDefault();
    e.returnValue = confirmationMessage;
    return confirmationMessage;
  }
});

window.addEventListener('pagehide', () => {
  // Mobile browsers fire pagehide when switching apps or locking the screen.
  // Emitting terminal-exit here causes the user to be kicked out on temporary backgrounding.
  // Instead, we let the socket disconnect handle it as a temporary disconnect.
  console.log('pagehide triggered - treating as temporary backgrounding');
});

if (ui.chatForm) {
  ui.chatForm.addEventListener('submit', () => handleRealActivity());
}

if (ui.extraActionsToggle) {
  ui.extraActionsToggle.onclick = (e) => {
    e.stopPropagation();
    ui.extraActionsMenu.classList.toggle('d-none');
    ui.extraActionsToggle.classList.toggle('active');
  };
}

// Filter monitor menu button click handler
const filterMenuBtn = document.getElementById('filter-monitor-menu-btn');
if (filterMenuBtn) {
    filterMenuBtn.onclick = (e) => {
        e.stopPropagation();
        if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
        if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');
        window.toggleFilterMonitorPanel();
    };
}

// Close extra actions menu when clicking outside
document.addEventListener('click', (e) => {
  if (ui.extraActionsMenu && !ui.extraActionsMenu.classList.contains('d-none')) {
    if (!ui.extraActionsMenu.contains(e.target) && e.target !== ui.extraActionsToggle && !ui.extraActionsToggle.contains(e.target)) {
      ui.extraActionsMenu.classList.add('d-none');
      ui.extraActionsToggle.classList.remove('active');
    }
  }
});

if (ui.chatForm) {
  ui.chatForm.setAttribute('autocomplete', 'off');
  
  if (ui.chatInput) {
    ui.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
        ui.chatForm.dispatchEvent(submitEvent);
      }
    });
  }

  ui.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ui.chatInput) return;
    let text = ui.chatInput.value.trim();
    if (text && state.currentUser) {
      const messageData = { 
        user: state.currentUser,
        text, 
        roomId: state.currentRoomId,
        mediaUrl: pendingMediaData ? pendingMediaData.url : null,
        mediaType: pendingMediaData ? pendingMediaData.type : null,
        createdAt: new Date().toISOString()
      };

      if (state.replyingTo) {
        const replyUser = state.replyingTo.user || {};
        const replyUserId = replyUser.userId || replyUser.id;
        messageData.replyTo = {
          id: replyUserId,
          userId: replyUserId,
          username: replyUser.username,
          topic: replyUser.topic,
          text: state.replyingTo.text,
          pic: window.getAvatarUrl(replyUser),
          mediaUrl: state.replyingTo.mediaUrl,
          mediaType: state.replyingTo.mediaType,
          superIcon: replyUser.superIcon || '',
          gifts: replyUser.gifts || [],
          ucol: replyUser.ucol,
          bg: replyUser.bg,
          fontColor: replyUser.fontColor,
          type: replyUser.type,
          roleRank: replyUser.roleRank
        };
        cancelReply();
      }

      // Check if bot form is active via Toggle Mode
      if (ui.botModeBar && !ui.botModeBar.classList.contains('d-none') && ui.botModeToggle && !ui.botModeToggle.classList.contains('d-none')) {
        if (ui.toggleBot && ui.toggleBot.checked && ui.toggleBot.dataset.botId) {
          const selectedBotId = ui.toggleBot.dataset.botId;
          socket.emit('message-as-bot', {
            botId: selectedBotId,
            text: text,
            roomId: state.currentRoomId
          });
          ui.chatInput.value = '';
          return;
        }
      }

      socket.emit('message', messageData);
      ui.chatInput.value = '';
    }
  });
}

function cancelReply() {
  state.setReplyingTo(null);
  if (ui.replyPreview) ui.replyPreview.classList.add('d-none');
  if (ui.replyToMedia) ui.replyToMedia.innerHTML = '';
}

if (ui.cancelReply) ui.cancelReply.onclick = cancelReply;

function checkUserCanWriteInRoomChat(user, room) {
  try {
    if (!room) return true;
    
    // Ensure boolean
    const isChatDisabled = room.disableChat === true || room.disableChat === 'true';
    if (!isChatDisabled) return true;

    if (hasPermission('canManageRooms') || hasPermission('canManageAllRoomsInChat') || (user && (user.isAdmin || user.role === 'admin' || user.level >= 90))) {
      return true;
    }

    if (user && room.ownerId && (Number(room.ownerId) === Number(user.id) || Number(room.ownerId) === Number(user.userId))) {
      return true;
    }

    if (user && room.roomOwner && room.roomOwner === user.username) {
      return true;
    }

    const userId = user?.id || user?.userId;
    const username = user?.username;
    
    let moderators = room.moderators;
    if (typeof moderators === 'string') {
      try {
        moderators = JSON.parse(moderators);
      } catch (e) {
        moderators = [];
      }
    }
    if (!Array.isArray(moderators)) moderators = [];
    
    const validModerators = moderators.filter(m => m !== null && typeof m !== 'undefined');
    
    const modObj = validModerators.find(m => {
      if (typeof m === 'number' || typeof m === 'string') return Number(m) === Number(userId);
      return m && (Number(m.userId) === Number(userId) || m.username === username);
    });

    if (modObj) {
      const isModsAllowed = room.allowModsWriteInClosedChat !== false && room.allowModsWriteInClosedChat !== 'false';
      if (isModsAllowed) return true;
      const perms = (typeof modObj === 'object' && modObj && Array.isArray(modObj.permissions)) ? modObj.permissions : [];
      if (perms.includes('canWriteInClosedChat')) return true;
    }

    return false;
  } catch (error) {
    console.error('Error in checkUserCanWriteInRoomChat:', error);
    return true; // Default to true so we don't break login
  }
}

function updateChatUI() {
  try {
    const isInRoom = state.currentRoomId !== 0;
    const chatForm = ui.chatForm;
    
    const room = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    if (ui.messagesContainer) {
    }
  
    if (ui.leaveRoomBtn) {
      ui.leaveRoomBtn.classList.toggle('d-none', state.isInWaitingRoom && !hasPermission('canManageRooms') && !hasPermission('canManageUsers'));
    }
  
    if (typeof window.updateVoiceBarVisibility === 'function') {
      window.updateVoiceBarVisibility(state.currentRoomId);
    }
  
    if (typeof window.syncVoiceMicSlots === 'function') {
      window.syncVoiceMicSlots(state.currentRoomId);
    }
    
    if (!isInRoom) {
      if (ui.messagesContainer && !preserveMessagesAfterLeave) {
        if (pendingInitialRoomSelection) {
          ui.messagesContainer.innerHTML = renderInlineRoomSelection();
        } else {
          ui.messagesContainer.innerHTML = `
            <div class="no-room-container">
              <div class="no-room-icon">
                <i class="fas fa-door-open"></i>
              </div>
              <div class="no-room-title">أنت الآن خارج الغرف</div>
              <div class="no-room-text">
                للمشاركة في الدردشة والتفاعل مع الأعضاء، يرجى اختيار غرفة من قائمة الغرف المتاحة.
              </div>
              <button class="no-room-btn" id="browse-rooms-btn" onclick="toggleSidebar('rooms', getRoomsSidebarTitle(), loadRooms)">
                <i class="fas fa-th-large"></i>
                <span>تصفح قائمة الغرف</span>
              </button>
            </div>
          `;
        }
        
        // Add event listener to the container instead of the button directly
        ui.messagesContainer.removeEventListener('click', handleBrowseRoomsClick);
        ui.messagesContainer.addEventListener('click', handleBrowseRoomsClick);
      }
      
      // Change chat input area
      if (ui.chatInput) {
        const inputWrapper = ui.chatInput.parentElement;
        if (inputWrapper) {
          ui.chatInput.style.display = 'none';
          let noRoomMsg = document.getElementById('no-room-input-msg');
          if (!noRoomMsg) {
            noRoomMsg = document.createElement('div');
            noRoomMsg.id = 'no-room-input-msg';
            noRoomMsg.className = 'flex-grow-1 text-center py-1 text-muted small italic';
            noRoomMsg.style.border = '1px dashed #ccc';
            noRoomMsg.style.borderRadius = '4px';
            noRoomMsg.style.backgroundColor = '#f1f3f5';
            noRoomMsg.innerHTML = '<i class="fas fa-info-circle me-1"></i> يجب الانضمام لغرفة لإرسال الرسائل';
            inputWrapper.insertBefore(noRoomMsg, ui.chatInput);
          }
        }
      }
      
      // Disable buttons
      if (ui.chatForm) {
        const sendBtn = ui.chatForm.querySelector('button[type="submit"]');
        if (sendBtn) sendBtn.disabled = true;
      }
      
      if (ui.uploadBtn) ui.uploadBtn.disabled = true;
      if (ui.emojiBtn) ui.emojiBtn.disabled = true;
      if (ui.leaveRoomBtn) ui.leaveRoomBtn.disabled = true;
      if (ui.clearChatBtn) ui.clearChatBtn.disabled = true;
    } else {
      const canWriteInClosedChat = checkUserCanWriteInRoomChat(state.currentUser, room);
      const noRoomMsg = document.getElementById('no-room-input-msg');
      if (noRoomMsg) noRoomMsg.remove();
      
      // If we were in "No Room" state, clear the container for new messages
      if (ui.messagesContainer && ui.messagesContainer.querySelector('.no-room-container')) {
        ui.messagesContainer.innerHTML = '';
      }
  
      if (room && room.disableChat && !canWriteInClosedChat) {
        if (ui.chatInput) {
          ui.chatInput.style.display = 'block';
          ui.chatInput.disabled = true;
          ui.chatInput.placeholder = "الكتابة موقوفة حالياً في هذه الغرفة من قبل الإدارة...";
          ui.chatInput.classList.add('chat-input-disabled');
        }
        if (ui.chatForm) {
          const sendBtn = ui.chatForm.querySelector('button[type="submit"]');
          if (sendBtn) sendBtn.disabled = true;
        }
        if (ui.uploadBtn) ui.uploadBtn.disabled = true;
        if (ui.emojiBtn) ui.emojiBtn.disabled = true;
        if (ui.leaveRoomBtn) ui.leaveRoomBtn.disabled = false;
        if (ui.clearChatBtn) ui.clearChatBtn.disabled = false;
      } else {
        // Restore normal chat input
        if (ui.chatInput) {
          ui.chatInput.style.display = 'block';
          ui.chatInput.disabled = false;
          ui.chatInput.placeholder = "اكتب رسالتك هنا...";
          ui.chatInput.classList.remove('chat-input-disabled');
          
          ui.chatInput.setAttribute('autocomplete', 'new-password');
          ui.chatInput.setAttribute('autocorrect', 'off');
          ui.chatInput.setAttribute('autocapitalize', 'off');
          ui.chatInput.setAttribute('spellcheck', 'false');
          ui.chatInput.setAttribute('name', `chat_message_${Date.now()}`);
        }
        
        if (ui.chatForm) {
          const sendBtn = ui.chatForm.querySelector('button[type="submit"]');
          if (sendBtn) sendBtn.disabled = false;
        }
        
        if (ui.uploadBtn) ui.uploadBtn.disabled = false;
        if (ui.botMsgBtn) ui.botMsgBtn.disabled = false;
        if (ui.emojiBtn) ui.emojiBtn.disabled = false;
        if (ui.leaveRoomBtn) ui.leaveRoomBtn.disabled = false;
        if (ui.clearChatBtn) ui.clearChatBtn.disabled = false;
      }
    }
  
  
    updateExtraActionsVisibility();
  
  
    // Refresh settings sidebar if it's currently open to update moderator buttons
    if (state.activeSidebarTab === 'settings' && currentSettingsView === 'settings') {
      renderSettings(true);
    } else if (state.activeSidebarTab !== 'settings') {
      // Force reset currentSettingsView if we are not in settings tab
      currentSettingsView = null;
    }
  
    if (window.voiceManager) {
      window.voiceManager.updateUI();
    }
  } catch (error) {
    console.error('Error in updateChatUI:', error);
  }
}

function initBotMessaging() {
  if (!ui.botMsgBtn || !ui.botModeBar) return;

  ui.botMsgBtn.addEventListener('click', () => {
    // Hide extra actions menu
    if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
    if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');

    // Show bot mode bar
    ui.botModeBar.classList.remove('d-none');
    ui.botModeBar.classList.add('d-flex');
    
    // Default: Reset to selection view
    if(ui.botModeSelection) {
      ui.botModeSelection.classList.remove('d-none');
      ui.botModeSelection.classList.add('d-flex');
    }
    if(ui.botModeToggle) {
      ui.botModeToggle.classList.add('d-none');
      ui.botModeToggle.classList.remove('d-flex');
    }
    
    renderOnlineBotsForSelection();
  });

  const hideBotMode = () => {
    ui.botModeBar.classList.add('d-none');
    ui.botModeBar.classList.remove('d-flex');
    if (ui.botModeSelect) ui.botModeSelect.value = "";
    if (ui.chatInput) ui.chatInput.placeholder = "اكتب رسالتك هنا...";
    if (ui.toggleSelf) ui.toggleSelf.checked = true; // reset toggle to self
  };

  if (ui.exitBotModeBtn) ui.exitBotModeBtn.addEventListener('click', hideBotMode);
  if (ui.exitBotModeBtn2) ui.exitBotModeBtn2.addEventListener('click', hideBotMode);

  if (ui.botModeSelect) {
    ui.botModeSelect.addEventListener('change', (e) => {
      const selectedBotId = e.target.value;
      if (!selectedBotId) return;

      const selectedBotName = e.target.options[e.target.selectedIndex].text;
      
      // Switch from Selection to Toggle UI
      if (ui.botModeSelection && ui.botModeToggle) {
        ui.botModeSelection.classList.add('d-none');
        ui.botModeSelection.classList.remove('d-flex');

        ui.botModeToggle.classList.remove('d-none');
        ui.botModeToggle.classList.add('d-flex');
        
        ui.labelToggleSelf.textContent = `👤 أنا`;
        ui.labelToggleBot.textContent = `${selectedBotName}`;
        
        // Save the bot ID to the toggle button
        ui.toggleBot.dataset.botId = selectedBotId;
        
        // Auto-activate the bot toggle
        ui.toggleBot.checked = true;
        ui.chatInput.placeholder = `التحدث كـ ${selectedBotName.replace('🤖 ', '')}...`;
      }
    });
  }

  if(ui.changeBotBtn) {
    ui.changeBotBtn.addEventListener('click', () => {
      ui.botModeToggle.classList.add('d-none');
      ui.botModeToggle.classList.remove('d-flex');
      
      ui.botModeSelection.classList.remove('d-none');
      ui.botModeSelection.classList.add('d-flex');
      
      ui.botModeSelect.value = '';
      ui.chatInput.placeholder = "اكتب رسالتك هنا...";
    });
  }

  if(ui.toggleSelf && ui.toggleBot) {
    ui.toggleSelf.addEventListener('change', () => {
      if(ui.toggleSelf.checked && ui.chatInput) {
        ui.chatInput.placeholder = "اكتب رسالتك هنا...";
      }
    });
    ui.toggleBot.addEventListener('change', () => {
      if(ui.toggleBot.checked && ui.chatInput) {
        const botName = ui.labelToggleBot.textContent.replace('🤖 ', '');
        ui.chatInput.placeholder = `التحدث كـ ${botName}...`;
      }
    });
  }
}

function renderOnlineBotsForSelection() {
  if (!ui.botModeSelect) return;

  const onlineBots = state.currentUsers.filter(u => u.isVirtualUser && Number(u.roomId) === Number(state.currentRoomId));
  
  // Clear existing options
  ui.botModeSelect.innerHTML = '<option value="" disabled selected>اختر البوت المتصل...</option>';

  if (onlineBots.length === 0) {
    const opt = document.createElement('option');
    opt.value = "";
    opt.disabled = true;
    opt.style.color = "#000";
    opt.textContent = 'لا يوجد بوتات متصلة حالياً...';
    ui.botModeSelect.appendChild(opt);
  } else {
    onlineBots.forEach(bot => {
      const opt = document.createElement('option');
      opt.value = bot.socketId; // Use socketId or some unique key
      opt.style.color = "#000";
      opt.textContent = `🤖 ${bot.topic || bot.username}`;
      ui.botModeSelect.appendChild(opt);
    });
  }
}

ui.leaveRoomBtn.addEventListener('click', () => {
  if (!state.currentRoomId || state.isRoomFrozen) return;
  
  if (window.voiceManager) {
    window.voiceManager.cleanup();
  }

  if (window.musicManager) {
    console.log('[LeaveRoom] Resetting music manager');
    window.musicManager.reset();
  }
  
  socket.emit('leave-room');
  pendingInitialRoomSelection = false;
  state.setIsRoomFrozen(true);
  state.setCurrentRoomId(0);
  preserveMessagesAfterLeave = true;

  updateChatUI();

  if (ui.chatInput) {
    ui.chatInput.disabled = true;
    ui.chatInput.placeholder = "أنت خارج الغرفة";
  }

  requestAnimationFrame(() => {
    openSidebarTab('rooms', getRoomsSidebarTitle(), loadRooms, { forceRefresh: true });
  });
});

async function logout() {
  console.log('Logout initiated');
  isLoggingOut = true;
  window.isLoggingOut = true;
  hasJoinedChatOnce = false;
  window.hasJoinedChatOnce = false;
  isLoginSocketSwitch = false;
  hideReconnectBar();
  
  if (
    window.voiceManager &&
    typeof window.voiceManager.stopSilentAudioSession === 'function'
  ) {
    window.voiceManager.stopSilentAudioSession();
  }
  if (window.voiceManager) {
    window.voiceManager.cleanup();
  }

  if (window.musicManager) {
    console.log('[Logout] Resetting music manager');
    window.musicManager.reset({ destroyPlayer: true });
  }
  
  try {
    // Wait for the server to process the logout and mark user as Ghost, so they don't remain stuck
    await new Promise(resolve => {
      if (!socket || !socket.connected) {
        resolve();
        return;
      }

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };

      socket.emit('logout', () => finish());
      setTimeout(finish, 500); // 500ms fallback
    });

    let token = null;
    try { token = getToken(); } catch (e) {}
    if (token) {
      // Use window.fetch directly to avoid infinite loop if logout itself returns 401
      await window.fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).catch(e => console.warn('Logout API call failed:', e));
    }
  } catch (e) {
    console.warn('Logout process error:', e);
  } finally {
    try {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('chat_client_session_id');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('chat_client_session_id');
      state.setCurrentUser(null);
      state.setCurrentRoomId(0);
      pendingInitialRoomSelection = false;
      
      // Disable reconnection on old session
      if (socket && socket.io) {
        socket.io.opts.reconnection = false;
      }

      // Reset socket auth
      socket.auth = { token: null, clientSessionId: null };
    } catch (e) {
      console.warn('Could not clear session data:', e);
    }
    
    // UI Updates
    window.cleanupUIForLogin();
    
    if (typeof window.startPublicOnlineUsersPolling === 'function') {
      window.startPublicOnlineUsersPolling();
    }
    
    // Disconnect socket (do not reconnect as guest to prevent unwanted module loading)
    if (socket) {
      socket.disconnect();
    }
    
    console.log('Logout complete - reloading page');
    window.location.reload();
  }
}

// Terminal exit handling is now managed safely server-side via socket disconnect grace period (120s) and explicit page reload detection in initApp.


ui.clearChatBtn.addEventListener('click', () => {
  // Hide extra actions menu
  if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
  if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');

  if (!hasPermission('canDeletePublicMessages')) {
    Swal.fire({
      text: 'لا تملك صلاحية حذف الرسائل العامة.',
      icon: 'error',
      confirmButtonText: 'حسناً'
    });
    return;
  }

  socket.emit('clear-room-chat', { roomId: state.currentRoomId });
});

// Emoji Picker Logic
let currentPickerTab = 'smiley';

let activeEmojiInput = null;

function toggleEmojiPicker(targetInput) {
  activeEmojiInput = targetInput || ui.chatInput;
  ui.emojiPicker.classList.toggle('d-none');
  if (!ui.emojiPicker.classList.contains('d-none')) {
    loadEmojiPickerContent();
    
    // Position it above the input
    const rect = activeEmojiInput.getBoundingClientRect();
    ui.emojiPicker.style.position = 'fixed';
    ui.emojiPicker.style.bottom = (window.innerHeight - rect.top) + 'px';
    ui.emojiPicker.style.left = '0';
    ui.emojiPicker.style.right = '0';
    ui.emojiPicker.style.top = 'auto';
    ui.emojiPicker.style.zIndex = '2000'; // Default high z-index
    
    // Adjust width and position if opened from Wall or Comments
    if (activeEmojiInput.id === 'wall-post-input') {
      ui.emojiPicker.style.width = '330px';
      ui.emojiPicker.style.left = 'auto';
      ui.emojiPicker.style.right = '5px';
      ui.emojiPicker.style.bottom = '80px';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.inset = 'auto 5px 80px auto';
      ui.emojiPicker.style.zIndex = '2000';
    } else if (activeEmojiInput.id === 'quick-chat-input') {
      ui.emojiPicker.style.width = '330px';
      ui.emojiPicker.style.left = 'auto';
      ui.emojiPicker.style.right = '5px';
      ui.emojiPicker.style.bottom = '50px';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.inset = 'auto 5px 50px auto';
      ui.emojiPicker.style.zIndex = '2000';
    } else if (activeEmojiInput.id === 'comment-modal-input') {
      ui.emojiPicker.style.width = '330px';
      ui.emojiPicker.style.left = '50%';
      ui.emojiPicker.style.right = 'auto';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'translateX(-50%)';
      ui.emojiPicker.style.zIndex = '2000';
    } else if (activeEmojiInput.id === 'private-chat-input') {
      const chatWindow = document.getElementById('private-chat-window');
      const chatRect = chatWindow.getBoundingClientRect();
      const inputRect = activeEmojiInput.getBoundingClientRect();
      
      ui.emojiPicker.style.width = '300px';
      ui.emojiPicker.style.maxWidth = (chatRect.width - 2) + 'px';
      ui.emojiPicker.style.height = '200px';
      ui.emojiPicker.style.right = 'auto';
      ui.emojiPicker.style.left = (chatRect.left + 1) + 'px';
      ui.emojiPicker.style.bottom = (window.innerHeight - inputRect.top + 5) + 'px';
      ui.emojiPicker.style.top = 'auto';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.zIndex = '2500'; // Higher than private-chat-window (1150)
    } else if (activeEmojiInput.id === 'private-alert-textarea-input') {
      const inputRect = activeEmojiInput.getBoundingClientRect();
      const swalPopup = Swal.getPopup();
      const swalRect = swalPopup ? swalPopup.getBoundingClientRect() : null;
      
      const pickerWidth = 320;
      const pickerHeight = 240;
      
      let left = 0;
      if (swalRect) {
        left = swalRect.left + (swalRect.width - pickerWidth) / 2;
      } else {
        left = (window.innerWidth - pickerWidth) / 2;
      }
      
      if (left < 8) left = 8;
      if (left + pickerWidth > window.innerWidth - 8) {
        left = window.innerWidth - pickerWidth - 8;
      }
      
      let top = inputRect.top - pickerHeight - 8;
      if (top < 8) {
        top = 8;
      }
      
      ui.emojiPicker.style.position = 'fixed';
      ui.emojiPicker.style.width = pickerWidth + 'px';
      ui.emojiPicker.style.height = pickerHeight + 'px';
      ui.emojiPicker.style.left = left + 'px';
      ui.emojiPicker.style.right = 'auto';
      ui.emojiPicker.style.bottom = 'auto';
      ui.emojiPicker.style.top = top + 'px';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.zIndex = '10001';
    } else {
      ui.emojiPicker.style.width = '340px';
      // Use responsive height: 300px on mobile, 600px on desktop
      ui.emojiPicker.style.height = window.innerWidth < 768 ? '300px' : '600px';
      ui.emojiPicker.style.left = '0';
      ui.emojiPicker.style.right = 'auto';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.zIndex = '2000';
    }
  }
}
window.toggleEmojiPicker = toggleEmojiPicker;

function loadEmojiPickerContent() {
  ui.emojiPickerContent.innerHTML = '';
  ui.emojiPickerContent.className = `emoji-picker-content ${currentPickerTab}-tab`;
  const items = state.smileys.filter(s => s.type === currentPickerTab);
  
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = `picker-item ${item.type}`;
    div.innerHTML = `<img src="${item.url}" title="${item.shortcut}">`;
    div.onclick = () => {
      if (item.type === 'sticker' && activeEmojiInput && activeEmojiInput.id !== 'private-alert-textarea-input') {
        sendDirectSticker(item);
      } else {
        insertEmojiShortcut(item.shortcut);
      }
    };
    ui.emojiPickerContent.appendChild(div);
  });
}

async function sendDirectSticker(sticker) {
  if (!state.currentUser) return;
  
  // Close picker
  ui.emojiPicker.classList.add('d-none');

  // If in wall input or comment modal input or private-alert-textarea-input or quick-chat-input, just append it
  if (
    activeEmojiInput &&
    (
      activeEmojiInput.id === 'wall-post-input' ||
      activeEmojiInput.id === 'quick-chat-input' ||
      activeEmojiInput.id === 'comment-modal-input' ||
      activeEmojiInput.id === 'private-alert-textarea-input' ||
      activeEmojiInput.classList.contains('wall-post-textarea') ||
      activeEmojiInput.classList.contains('quick-chat-textarea')
    )
  ) {
    if (activeEmojiInput.value) {
      activeEmojiInput.value += ' ' + sticker.shortcut + ' ';
    } else {
      activeEmojiInput.value = sticker.shortcut + ' ';
    }

    activeEmojiInput.focus();

    activeEmojiInput.dispatchEvent(
      new Event('input', { bubbles: true })
    );

    return;
  }

  const messageData = { 
    user: state.currentUser,
    text: sticker.shortcut, // Still send shortcut for conversion/rendering
    roomId: state.currentRoomId,
    createdAt: new Date().toISOString(),
    isSoloSticker: true // Flag to indicate it's a standalone sticker
  };

  // Check if we are in private chat by checking activeEmojiInput
  if (activeEmojiInput && activeEmojiInput.id === 'private-chat-input') {
    // Send via private message logic
    if (window.PrivateChatManager && window.PrivateChatManager.activeChatUser) {
      window.PrivateChatManager.sendPrivateSticker(window.PrivateChatManager.activeChatUser.id, sticker.shortcut);
    }
  } else {
    // Send to public room
    socket.emit('message', messageData);
  }
}

function insertEmojiShortcut(shortcut) {
  const target = activeEmojiInput || ui.chatInput;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  const currentText = target.value;
  
  let text = shortcut;
  // Add space before if not at start and preceding char is not a space
  if (start > 0 && currentText.charAt(start - 1) !== ' ') {
    text = ' ' + text;
  }
  // Always add space after
  text = text + ' ';
  
  if (typeof target.setRangeText === 'function') {
    target.setRangeText(text, start, end, 'end');
  } else {
    target.value = currentText.substring(0, start) + text + currentText.substring(end);
    target.setSelectionRange(start + text.length, start + text.length);
  }
  
  target.focus();
  target.dispatchEvent(new Event('input', { bubbles: true }));
  
  ui.emojiPicker.classList.add('d-none');
}

ui.emojiBtn.addEventListener('click', () => toggleEmojiPicker(ui.chatInput));
ui.closeEmojiPicker.onclick = () => ui.emojiPicker.classList.add('d-none');

ui.pickerTabs.forEach(tab => {
  tab.onclick = () => {
    ui.pickerTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentPickerTab = tab.dataset.tab;
    loadEmojiPickerContent();
  };
});

// Close picker when clicking outside
document.addEventListener('mousedown', (e) => {
  if (ui.emojiPicker && !ui.emojiPicker.classList.contains('d-none')) {
    // Check if click is inside the picker
    if (ui.emojiPicker.contains(e.target)) return;
    
    // Check if click is on any emoji toggle button
    const isEmojiBtn = (e.target && typeof e.target.closest === 'function') && (
                       e.target.closest('#emoji-btn') || 
                       e.target.closest('#wall-btn-emoji') || 
                       e.target.closest('#quick-chat-btn-emoji') || 
                       e.target.closest('#comment-btn-emoji') ||
                       e.target.closest('#private-alert-btn-emoji') ||
                       e.target.closest('.emoji-toggle-btn') ||
                       e.target.closest('[onclick*="toggleEmojiPicker"]')
    );
                       
    if (!isEmojiBtn) {
      ui.emojiPicker.classList.add('d-none');
    }
  }
});

ui.uploadBtn.addEventListener('click', () => {
  // Hide extra actions menu
  if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
  if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');

  if (!hasPermission('canSendFiles')) {
    Swal.fire({
      text: 'لا تملك صلاحية إرسال الصور والفيديوهات في الغرف.',
      icon: 'error',
      confirmButtonText: 'حسناً'
    });
    return;
  }
  state.setIsSettingsUpload(false);
  ui.fileInput.click();
});

async function handleFileUpload(file, isSettings = false) {
  if (!file) return;
  
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', file);
  
  let token = null;
  try { token = getToken(); } catch (e) {}
  
  let loadingDiv = null;

  if (!isSettings) {
    loadingDiv = document.createElement('div');
    loadingDiv.className = 'p-2 text-center small text-muted border-bottom';
    loadingDiv.innerHTML = `
      <div class="d-flex align-items-center justify-content-center gap-2">
        <span><i class="fas fa-spinner fa-spin"></i> جاري رفع الملف: <span class="upload-progress">0%</span></span>
        <button class="btn btn-sm btn-outline-danger cancel-chat-upload-btn" style="height: 20px; padding: 0 5px; font-size: 10px; line-height: 18px;">إلغاء</button>
      </div>
    `;
    ui.messagesContainer.appendChild(loadingDiv);
    ui.messagesContainer.scrollTo({ top: ui.messagesContainer.scrollHeight, behavior: 'auto' });

    const cancelBtn = loadingDiv.querySelector('.cancel-chat-upload-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        xhr.abort();
        if (loadingDiv && loadingDiv.parentNode) {
          loadingDiv.parentNode.removeChild(loadingDiv);
        }
        if (window.showToast) window.showToast('تم إلغاء الرفع', 'info');
      };
    }
  } else if (ui.settingsUploadBtn) {
    ui.settingsUploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع...';
  }

  let uploadUrl = '/api/upload/publicfiles';
  if (isSettings) {
    uploadUrl = '/api/upload/avatar';
  } else if (state.activeSidebarTab === 'rooms') {
    uploadUrl = '/api/upload/mics';
  }
  
  xhr.open('POST', uploadUrl, true);
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percentComplete = Math.round((event.loaded / event.total) * 100);
      if (loadingDiv) {
        const progressSpan = loadingDiv.querySelector('.upload-progress');
        if (progressSpan) progressSpan.textContent = `${percentComplete}%`;
      }
    }
  };

  xhr.onload = async () => {
    if (loadingDiv && loadingDiv.parentNode) {
      loadingDiv.parentNode.removeChild(loadingDiv);
    }
    if (isSettings && ui.settingsUploadBtn) {
      ui.settingsUploadBtn.innerHTML = `
        <img src="${window.getAvatarUrl(state.currentUser)}" class="classic-avatar-small btn-avatar-right">
        <span>تغيير الصورة</span>
        <i class="fas fa-image btn-icon-left"></i>
      `;
    }
    
    if (xhr.status === 200) {
      const result = JSON.parse(xhr.responseText);
      
      if (isSettings) {
        await updateUserSettings({ pic: result.url }, true);
        return;
      }
      
      let mediaType = null;
      let mediaUrl = result.url;

      const isVideo = result.mimetype.startsWith('video/') || result.mimetype === 'video/quicktime' || (result.url && result.url.toLowerCase().endsWith('.mov')) || (typeof file !== 'undefined' && file && file.name && file.name.toLowerCase().endsWith('.mov'));
      if (result.mimetype.startsWith('image/')) {
        mediaType = 'image';
      } else if (isVideo) {
        mediaType = 'video';
      } else if (result.mimetype.startsWith('audio/')) {
        mediaType = 'audio';
      } else {
        mediaType = 'file';
      }

      let textContent = '';
      if (!isSettings && ui.chatInput && ui.chatInput.value) {
        textContent = ui.chatInput.value.trim();
        ui.chatInput.value = '';
      }

      const messageData = { 
        user: state.currentUser,
        text: textContent, 
        roomId: state.currentRoomId,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
        createdAt: new Date().toISOString()
      };

      if (state.replyingTo) {
        const replyUser = state.replyingTo.user || {};
        const replyUserId = replyUser.userId || replyUser.id;
        messageData.replyTo = {
          id: replyUserId,
          userId: replyUserId,
          username: replyUser.username,
          topic: replyUser.topic,
          text: state.replyingTo.text,
          pic: window.getAvatarUrl(replyUser),
          mediaUrl: state.replyingTo.mediaUrl,
          mediaType: state.replyingTo.mediaType,
          superIcon: replyUser.superIcon || '',
          gifts: replyUser.gifts || [],
          ucol: replyUser.ucol,
          bg: replyUser.bg,
          fontColor: replyUser.fontColor,
          type: replyUser.type,
          roleRank: replyUser.roleRank
        };
        cancelReply();
      }

      socket.emit('message', messageData);
    } else {
      let msg = 'فشل رفع الملف';
      try {
        const res = JSON.parse(xhr.responseText);
        if (res.message) msg = res.message;
      } catch (e) {}
      Swal.fire('عذراً', msg, 'error');
    }
    ui.fileInput.value = '';
  };

  xhr.onerror = () => {
    if (loadingDiv && loadingDiv.parentNode) {
      loadingDiv.parentNode.removeChild(loadingDiv);
    }
    if (isSettings && ui.settingsUploadBtn) {
      ui.settingsUploadBtn.innerHTML = `
        <img src="${window.getAvatarUrl(state.currentUser)}" class="classic-avatar-small btn-avatar-right">
        <span>تغيير الصورة</span>
        <i class="fas fa-image btn-icon-left"></i>
      `;
    }
    Swal.fire('عذراً', 'حدث خطأ أثناء رفع الملف', 'error');
    ui.fileInput.value = '';
  };

  xhr.send(formData);
}

ui.fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const isSettings = !!state.isSettingsUpload;
  state.setIsSettingsUpload(false); // Reset flag
  
  handleFileUpload(file, isSettings);
});

// Drag & Drop for Public Chat
const chatUI = document.getElementById('chat-ui');
if (chatUI) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    chatUI.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  chatUI.addEventListener('dragenter', () => chatUI.classList.add('drag-over'), false);
  chatUI.addEventListener('dragover', () => chatUI.classList.add('drag-over'), false);
  chatUI.addEventListener('dragleave', () => chatUI.classList.remove('drag-over'), false);
  chatUI.addEventListener('drop', (e) => {
    chatUI.classList.remove('drag-over');
    if (!hasPermission('canSendFiles')) {
      Swal.fire({ text: 'لا تملك صلاحية إرسال الملفات.', icon: 'error', confirmButtonText: 'حسناً' });
      return;
    }
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, false);
}

// Paste from Clipboard
if (ui.chatInput) {
  ui.chatInput.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        if (!hasPermission('canSendFiles')) return;
        const file = items[i].getAsFile();
        handleFileUpload(file);
        // e.preventDefault(); // Don't prevent default to allow text paste if any
      }
    }
  });
}

socket.on('error-msg', ({ message }) => {
  if (message && (message.includes('لايك') || message.includes('requiredLikes'))) {
    showLikesLimitAlert(message);
  } else {
    Swal.fire('تنبيه', message, 'error');
  }
});

socket.on('like-success', ({ targetUsername, likes }) => {
  const btn = document.getElementById('btn-profile-likes');
  if (btn) {
    createHeartBubble(btn);
  }
  
  if (profileUser && profileUser.username === targetUsername) {
    profileUser.likes = likes;
    const profileLikesCount = document.getElementById('profile-likes-count');
    if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(likes);
    const likesBtnCount = document.getElementById('profile-likes-count-btn');
    if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(likes);
  }
});

socket.on('rep-success', ({ targetUsername, rep }) => {
  const btn = document.getElementById('btn-profile-rep');
  if (btn) {
    createStarBubble(btn);
  }
  
  if (profileUser && profileUser.username === targetUsername) {
    profileUser.rep = rep;
    const profileRepCount = document.getElementById('profile-rep-count');
    if (profileRepCount) profileRepCount.innerText = formatCompactNumber(rep);
    const repBtnCount = document.getElementById('profile-rep-count-btn');
    if (repBtnCount) repBtnCount.innerText = formatCompactNumber(rep);
  }
});

function createStarBubble(element) {
  const star = document.createElement('i');
  star.className = 'fas fa-star star-bubble';
  
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top;
  
  star.style.left = `${x}px`;
  star.style.top = `${y}px`;
  star.style.color = '#ffc107';
  
  document.body.appendChild(star);
  
  setTimeout(() => {
    star.remove();
  }, 1000);
}

function createHeartBubble(element) {
  const heart = document.createElement('i');
  heart.className = 'fas fa-heart heart-bubble';
  
  // Position the heart relative to the button
  const rect = element.getBoundingClientRect();
  heart.style.left = `${rect.left + rect.width / 2}px`;
  heart.style.top = `${rect.top}px`;
  
  document.body.appendChild(heart);
  
  // Remove heart after animation
  setTimeout(() => {
    heart.remove();
  }, 1000);
}

socket.on('message', (data) => {
  appendMessage(data);
});

socket.on('presence:room-history', (data) => {
  if (!data || data.recovered !== true) return;
  if (!Array.isArray(data.messages)) return;
  
  if (Number(data.roomId) !== Number(state.currentRoomId)) return;

  // 1. استخدم آخر 50 رسالة فقط عبر slice(-50)
  const messagesToMerge = data.messages.slice(-50);

  // 2. رتب النسخة زمنيًا حسب createdAt أو timestamp
  // لا تعدّل المصفوفة الأصلية القادمة من السيرفر
  const sortedMessages = [...messagesToMerge].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.timestamp || 0);
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.timestamp || 0);
    return timeA - timeB;
  });

  // 3. حافظ على موضع التمرير قدر الإمكان
  const chatScroller = ui.messagesContainer || document.getElementById('messages-container');
  const previousScrollHeight = chatScroller ? chatScroller.scrollHeight : 0;
  const previousScrollTop = chatScroller ? chatScroller.scrollTop : 0;
  const isAtBottom = chatScroller ? (chatScroller.scrollHeight - chatScroller.scrollTop - chatScroller.clientHeight < 300) : false;

  let anyAdded = false;

  sortedMessages.forEach(msg => {
    if (!msg || !msg.id) return;

    // طبّع جميع المعرّفات باستخدام String(msg.id)
    const msgIdStr = String(msg.id);

    // استخدم String() عند فحص DOM وعند فحص publicMessageQueue
    // امنع تكرار الرسالة سواء كانت في DOM أو صف الانتظار
    const existsInDom = document.querySelector(`.message-row[data-id="${msgIdStr}"]`);
    if (existsInDom) return;

    const existsInQueue = publicMessageQueue.some(item => item.data && String(item.data.id) === msgIdStr);
    if (existsInQueue) return;

    // لا تضف رسالة قديمة بعد رسالة أحدث
    const msgTime = msg.createdAt ? new Date(msg.createdAt).getTime() : Number(msg.timestamp || 0);
    let isOlderThanNewest = false;
    
    // Check DOM for newer
    const domRows = document.querySelectorAll('.message-row[data-id]');
    for (const row of domRows) {
      const rowTimeAttr = row.querySelector('.message-time')?.getAttribute('data-created-at');
      if (rowTimeAttr) {
        const rowTime = new Date(rowTimeAttr).getTime();
        if (rowTime > msgTime) {
          isOlderThanNewest = true;
          break;
        }
      }
    }
    
    // Check publicMessageQueue for newer
    if (!isOlderThanNewest) {
      for (const item of publicMessageQueue) {
        if (item.data) {
          const itemTime = item.data.createdAt ? new Date(item.data.createdAt).getTime() : Number(item.data.timestamp || 0);
          if (itemTime > msgTime) {
            isOlderThanNewest = true;
            break;
          }
        }
      }
    }

    if (isOlderThanNewest) {
      return;
    }

    // أضف الرسائل المفقودة بالترتيب الزمني
    appendMessage(msg);
    anyAdded = true;
  });

  if (anyAdded && chatScroller) {
    requestAnimationFrame(() => {
      if (isAtBottom) {
        chatScroller.scrollTop = chatScroller.scrollHeight;
      } else {
        const heightDifference = chatScroller.scrollHeight - previousScrollHeight;
        chatScroller.scrollTop = previousScrollTop + heightDifference;
      }
    });
  }
});

socket.on('system-message', (data) => {
  appendSystemMessage(data);
});

// Use a flag to avoid handling multiple welcome events for the same user rapidly
const handledWelcomes = new Set();

socket.on('user-auto-welcome', (data) => {
  if (!data || !data.user) return;
  
  // Prevent duplicate welcome messages for the same user within a short timeframe
  const welcomeKey = data.user.id + '-' + data.user.username;
  if (handledWelcomes.has(welcomeKey)) return;
  
  handledWelcomes.add(welcomeKey);
  setTimeout(() => handledWelcomes.delete(welcomeKey), 10000); // 10 seconds cooldown

  // Add a small delay to ensure it appears after the system join message
  setTimeout(() => {
    createAutomaticWelcomeElement(data);
  }, 250);
});

function createAutomaticWelcomeElement(data) {
  const container = ui.messagesContainer || document.getElementById('messages-container');
  if (!container || !data?.user) return;

  const targetIdStr = String(data.user.id || data.user.userId || '');
  const liveUser = (typeof state !== 'undefined' && Array.isArray(state.currentUsers)) ?
      state.currentUsers.find(u => String(u.userId ?? u.id ?? '') === targetIdStr || u.username === data.user.username) : null;

  const userData = liveUser ? { ...data.user, ...liveUser } : {
      ...data.user,
      topic: data.user.topic || data.user.displayName || data.user.username,
      pic: data.user.pic || data.user.profileImage
  };

  const identityHtml = typeof window.renderUserIdentity === 'function' ? 
      window.renderUserIdentity(userData, {
          tag: 'span',
          nameClasses: 'message-username'
      }) : 
      `<span style="color: ${data.textColor || '#1b5e20'}; font-weight: bold;">${escapeHTML(userData.topic || userData.username || 'مستخدم')}</span>`;

  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'message-row system-message-row';
  welcomeDiv.style.minHeight = '50px';
  welcomeDiv.style.backgroundColor = data.bgColor || '#ffffff';
  welcomeDiv.style.direction = 'ltr';
  welcomeDiv.style.paddingLeft = '0';
  
  const systemAvatar = window.getSystemMessageImageUrl(data.image);
  const titleColor = data.titleColor || '#2e7d32';
  const textColor = data.textColor || '#1b5e20';
  const title = data.title || 'الترحيب الآلي';
  const prefixText = data.prefixText || 'أهلاً وسهلاً، نورت يا';

  welcomeDiv.innerHTML = `
    <img src="${systemAvatar}" class="message-avatar" referrerPolicy="origin-when-cross-origin" style="width: 50px; height: 50px; object-fit: cover; border-radius: 0; flex-shrink: 0; margin-right: 1px; align-self: flex-start !important;">
    <div class="message-body" style="padding: 4px 6px; border: none; flex-grow: 1; background-color: transparent;">
      <div class="message-header" style="margin-bottom: 2px; display: flex; align-items: center;">
         <span class="message-username" style="color: ${titleColor} !important; font-weight: bold;">${escapeHTML(title)}</span>
      </div>
      <div class="message-text" style="color: ${textColor}; display: flex; align-items: center; gap: 4px; flex-direction: row-reverse; justify-content: flex-end; flex-wrap: wrap;">
        <span>${escapeHTML(prefixText)}</span>
        ${identityHtml}
      </div>
    </div>
  `;

  const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;

  container.appendChild(welcomeDiv);

  if (isScrolledToBottom) {
      container.scrollTop = container.scrollHeight;
  }
}

socket.on('new-story', () => {
  if (typeof window.fetchStories === 'function') {
    window.fetchStories();
  }
});

socket.on('error', (msg) => {
  if (msg && (msg.includes('لايك') || msg.includes('requiredLikes'))) {
    showLikesLimitAlert(msg);
  } else {
    Swal.fire('تنبيه', msg, 'error');
  }
});

socket.on('alert', ({ title, text, html, icon, timer }) => {
  const message = text || html || '';
  if (message && (message.includes('لايك') || message.includes('requiredLikes'))) {
    showLikesLimitAlert(message);
    return;
  }
  if (timer && timer > 0) {
    let timerInterval;
    
    const formatTime = (ms) => {
      if (ms === undefined || isNaN(ms)) return '...';
      const totalSeconds = Math.ceil(ms / 1000);
      if (totalSeconds >= 60) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes} دقيقة و ${seconds} ثانية`;
      }
      return `${totalSeconds} ثانية`;
    };

    Swal.fire({
      title: title,
      html: `${html || text}<br><br><div style="display: flex; flex-direction: column; align-items: center; gap: 5px;"><span id="timer-display" style="color: red; font-size: 2em; font-weight: bold;">${Math.ceil(timer / 1000)}</span><span style="font-size: 1em;">يرجى الانتظار</span></div>`,
      icon: icon || 'info',
      timer: timer,
      timerProgressBar: true,
      showConfirmButton: false,
      allowOutsideClick: false,
      didOpen: () => {
        const startTime = Date.now();
        const b = document.getElementById('timer-display');
        if (b) {
          timerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const timeLeft = Math.max(0, timer - elapsed);
            b.textContent = Math.ceil(timeLeft / 1000);
            if (timeLeft === 0) {
              clearInterval(timerInterval);
            }
          }, 100);
        }
      },
      willClose: () => {
        clearInterval(timerInterval);
      }
    });
  } else {
    Swal.fire({
      title: title,
      html: html || text,
      icon: icon || 'info'
    });
  }
});

socket.on('alert:show', ({ text, msg }) => {
  Swal.fire({
    title: 'إعلان',
    text: text || msg || '',
    icon: 'info'
  });
});



// Handle signaling
socket.on('room-chat-cleared', ({ username, pic, topic, msg, superIcon, global, message }) => {
  if (ui.messagesContainer) {
    let displayContent = '';
    
    if (global) {
       displayContent = window.renderUserIdentity({ username, topic }, { containerClasses: 'chat-cleared-user' });
       ui.messagesContainer.innerHTML = `
        <div class="chat-cleared-container animated fadeIn">
          <div class="chat-cleared-avatar-wrapper">
            <img src="/img/icon.png" class="chat-cleared-avatar" onerror="this.src='/img/default-avatar.png'">
            <div class="chat-cleared-badge">
              <i class="fas fa-broom"></i>
            </div>
          </div>
          ${displayContent}
          <div class="chat-cleared-title">${message || 'تم مسح جميع الرسائل والمرفقات في كافة الغرف من قبل الإدارة'}</div>
        </div>
      `;
    } else {
      if (superIcon) {
        displayContent = `<img src="${superIcon}" class="chat-cleared-banner" alt="Banner">`;
      } else {
        const bannerText = (msg && msg !== 'Hello there!') ? msg : null;
        displayContent = window.renderUserIdentity({ username, topic }, { containerClasses: 'chat-cleared-user' });
      }
      
      ui.messagesContainer.innerHTML = `
        <div class="chat-cleared-container animated fadeIn">
          <div class="chat-cleared-avatar-wrapper">
            <img src="${pic || '/img/default-avatar.png'}" class="chat-cleared-avatar" alt="${username}" onerror="this.src='/img/default-avatar.png'">
            <div class="chat-cleared-badge">
              <i class="fas fa-broom"></i>
            </div>
          </div>
          ${displayContent}
          <div class="chat-cleared-title">قام بمسح جميع رسائل الدردشة في الغرفة</div>
        </div>
      `;
    }
    
    // Auto-scroll to show the design
    ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight;
  }
});

socket.on('wall_cleared', () => {
    const container = document.getElementById('wall-posts-container');
    if (container) {
        container.innerHTML = '<div id="no-posts-msg" class="text-center p-4 text-muted">تم تفريغ الحائط وتنظيف الملفات من قبل الإدارة</div>';
    }
    // Force reload wall if function exists
    if (typeof loadWall === 'function') loadWall();
});

socket.on('stories_cleared', () => {
    // Both containers might be used depending on the view
    ['stories-list', 'wall-stories-container', 'users-stories-container'].forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = '';
        }
    });

    // Close viewer if open
    if (typeof closeStoryViewer === 'function') closeStoryViewer();

    // Directly clear state if stories manager is active
    if (typeof stories !== 'undefined') {
        stories = [];
        if (typeof renderStoriesBar === 'function') renderStoriesBar('wall-stories-container');
    }
    
    // Refresh to be safe
    if (typeof fetchStories === 'function') fetchStories();
});

socket.on('global_private_chat_cleared', () => {
    const messagesList = document.getElementById('private_chat_messages_list');
    if (messagesList) {
        messagesList.innerHTML = '<div class="text-center p-5 text-muted"><i class="fas fa-broom fa-3x mb-3"></i><br>تم مسح كافة المحادثات الخاصة من قبل الإدارة</div>';
    }
    // If a private chat is open, we might want to clear state
    if (state.activePrivateChat) {
        state.setActivePrivateChat(null);
        updatePrivateChatUI();
    }
});

socket.on('delete-message', ({ id }) => {
  const msgDiv = document.querySelector(`.message-row[data-id="${String(id)}"]`);
  if (msgDiv) {
    msgDiv.remove();
  }
});


let lastSnapshotReqTime = 0;
function safeRequestUsersSnapshot() {
  const now = Date.now();
  if (now - lastSnapshotReqTime < 2000) return;
  lastSnapshotReqTime = now;
  if (typeof socket !== 'undefined' && socket && socket.emit) {
    socket.emit('request-users-snapshot');
  }
}

socket.on('users-snapshot', (payload) => {
  const version = payload && payload.version ? payload.version : null;
  const users = payload && payload.users ? payload.users : (Array.isArray(payload) ? payload : []);
  updateUsersSnapshot(version, users);
  if (window.PrivateChatManager && typeof window.PrivateChatManager.applyPresenceSnapshot === 'function') {
    window.PrivateChatManager.applyPresenceSnapshot(users);
  }
});

socket.on('users-patch', ({ version, upserts, removes }) => {
  updateUsersPatch(version, upserts, removes);
  if (window.PrivateChatManager && typeof window.PrivateChatManager.applyPresencePatch === 'function') {
    window.PrivateChatManager.applyPresencePatch(upserts, removes);
  }
});

socket.on('connect', () => {
  safeRequestUsersSnapshot();
});

if (socket && socket.connected) {
  safeRequestUsersSnapshot();
}

socket.on('init-config', (data) => {
  setTimeout(updateFilterMonitorVisibility, 500);
  setTimeout(renderZajelTicker, 1000);
  state.setWaitingRoomId(data.waitingRoomId);
  state.setGeneralRoomId(data.GENERAL_ROOM_ID || 1);
  // Re-verify isInWaitingRoom since waitingRoomId just became available
  state.setCurrentRoomId(state.currentRoomId);
  console.log('Received init-config:', data);
});

socket.on('rooms-stats', (stats) => {
  window.roomsStats = stats;
  if (state.activeSidebarTab === 'rooms' && state.rooms) {
    renderRoomsInSidebar(state.rooms);
  }
});

socket.on('room-deleted', ({ id }) => {
  const normId = String(id);
  if (window.roomsData && window.roomsData[normId]) {
    delete window.roomsData[normId];
    if (typeof state.setRooms === 'function') {
      const remaining = Object.values(window.roomsData);
      state.setRooms(remaining);
      renderRoomsInSidebar(remaining);
    }
  }
});

  socket.on('likes-updated', (event) => {
    const { likes, sender, userId, id: eventUserId, username: targetUsername } = event || {};
    if (!state.currentUser) return;
    // This event targets a specific user. Only treat it as "mine" when the
    // event's userId matches the current user — otherwise other members' like
    // counts would corrupt our own counters and trigger popups for everyone.
    const myId = state.currentUser && (state.currentUser.id ?? state.currentUser.userId ?? state.currentUser.guestId);
    const isMine = (userId != null && myId != null && (String(userId) === String(myId) || String(eventUserId) === String(myId))) ||
      (targetUsername && state.currentUser.username === targetUsername);
    if (isMine) {
      state.currentUser.likes = likes;

      // Only update profile modal if it's showing the current user's profile
      if (profileUser && (profileUser.id === state.currentUser.id || profileUser.userId === state.currentUser.id || profileUser.username === state.currentUser.username)) {
        const profileLikesCount = document.getElementById('profile-likes-count');
        if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(likes);

        const likesBtnCount = document.getElementById('profile-likes-count-btn');
        if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(likes);
      }

      // Refresh settings if open
      if (document.querySelector('.classic-settings-container')) {
        renderSettings();
      }

      if (sender) {
        Swal.fire({
          title: 'إعجاب',
          html: `لقد تلقيت إعجاب من ${window.renderUserIdentity(sender, { tag: 'span' })}`,
          confirmButtonText: 'موافق'
        });

        if (typeof triggerHeartsAnimation === 'function') {
          triggerHeartsAnimation();
        }
      }
    } else if (sender && window.profileSoundManager && typeof window.profileSoundManager.playLike === 'function') {
      // A peer got liked — subtle sound cue only, never touch our counters.
      if (targetUsername && state.currentUser.username !== targetUsername) {
        window.profileSoundManager.playLike();
      }
    }
  });

  socket.on('receive-kiss', ({ sender, senderNickname }) => {
    playKissAnimation(senderNickname);
  });

  socket.on('kiss-sent', ({ targetUsername }) => {
    showToast(`تم إرسال بوسة إلى ${targetUsername}`);
  });

  socket.on('rep-updated', ({ rep, sender, targetUsername, userId, id: eventUserId }) => {
  if (!state.currentUser) return;
  const myId = state.currentUser && (state.currentUser.id ?? state.currentUser.userId ?? state.currentUser.guestId);
  const isMine = (userId != null && myId != null && (String(userId) === String(myId) || String(eventUserId) === String(myId))) ||
    (targetUsername && state.currentUser.username === targetUsername);

  if (isMine) {
    state.currentUser.rep = rep;

    // Only update profile modal if it's showing the current user's profile
    if (profileUser && (profileUser.id === state.currentUser.id || profileUser.userId === state.currentUser.id || profileUser.username === state.currentUser.username)) {
      const profileRepCount = document.getElementById('profile-rep-count');
      if (profileRepCount) profileRepCount.innerText = formatCompactNumber(rep);

      const repBtnCount = document.getElementById('profile-rep-count-btn');
      if (repBtnCount) repBtnCount.innerText = formatCompactNumber(rep);
    }

    // Refresh settings if open
    if (document.querySelector('.classic-settings-container')) {
      renderSettings();
    }

    if (sender) {
      Swal.fire({
        title: 'رصيد الكوينز',
        html: `لقد تلقيت كوينز من ${window.renderUserIdentity(sender, { tag: 'span' })}<br><br>مجموع رصيدك: <strong>${formatCompactNumber(rep)}</strong>`,
        confirmButtonText: 'موافق'
      });
    }
  }
});

socket.on('wall-update', (data) => {
  if (data && (data.type === 'new-post' || data.type === 'comment')) {
    if (state.activeSidebarTab !== 'wall' && data.post && data.post.userId !== state.currentUser?.id) {
        wallNotificationCount++;
        updateWallBadge();
    }
  }

  if (data && data.type === 'new-post') {
    // If the post was created by the current user, ignore it as it's already added locally
    const currentUserId = state.currentUser?.id;
    const postUserId = data.post?.userId;
    
    // Check for both member ID and guest session ID to prevent duplicates for both types of users
    if (state.currentUser && data.post) {
      const isSameUser = (postUserId != null && currentUserId != null && String(postUserId) === String(currentUserId));
      const isSameGuest = (data.post.guestInfo?.guestSessionId && state.currentUser.guestSessionId === data.post.guestInfo.guestSessionId);
      
      if (isSameUser || isSameGuest) {
        return;
      }
    }

    const container = document.getElementById('wall-posts-container');
    if (container) {
      if (!document.getElementById(`post-${data.post.id}`)) {
        const noPostsMsg = document.getElementById('no-posts-msg');
        if (noPostsMsg) noPostsMsg.remove();
        
        const isScrolledDown = container.scrollTop > 100;
        container.insertAdjacentHTML('afterbegin', renderPost(data.post));
        refreshWallLayout({ scrollTop: true });
        
        if (isScrolledDown) {
          const alertBtn = document.getElementById('new-posts-alert');
          if (alertBtn) alertBtn.style.display = 'block';
        }
      }
    } else {
      // If container is not present (e.g. wall tab not open), we might still want to refresh if we ever switch to it
      // But we don't call loadWall here because it might be heavy and unnecessary if the sidebar isn't focused on wall
      // We will rely on loadWall being called when the user actually clicks the wall tab
    }
  } else if (data && data.type === 'like') {
    const postElement = document.getElementById(`post-${data.postId}`);
    if (postElement) {
      const likeBtnSpan = postElement.querySelector('.wall-btn-like span');
      if (likeBtnSpan) {
        likeBtnSpan.innerText = data.likeCount;
      }
    }
  } else if (data && data.type === 'comment') {
    const postElement = document.getElementById(`post-${data.postId}`);
    if (postElement) {
      const commentBtnSpan = postElement.querySelector('.wall-btn-comment span');
      if (commentBtnSpan) {
        commentBtnSpan.innerText = data.commentCount;
      }
    }
    
    // If comment modal is open for this post, append the new comment
    const overlay = document.getElementById('comment-modal-overlay');
    if (overlay && String(window.activeCommentPostId) === String(data.postId) && data.comment) {
      const commentsList = document.getElementById('comments-list-container');
      if (commentsList) {
        const noCommentsMsg = document.getElementById('no-comments-msg');
        if (noCommentsMsg) noCommentsMsg.remove();
        
        commentsList.insertAdjacentHTML('beforeend', renderComment(data.comment));
        refreshWallLayout();
        
        // Scroll to bottom
        const body = document.getElementById('comment-modal-body');
        if (body) body.scrollTop = body.scrollHeight;
      }
    }
  } else if (data && data.type === 'delete') {
    const postElement = document.getElementById(`post-${data.postId}`);
    if (postElement) {
      const container = postElement.parentElement;
      postElement.remove();
      
      // If no posts left, show the message
      if (container && container.id === 'wall-posts-container' && container.children.length === 0) {
        container.innerHTML = '<div id="no-posts-msg" class="p-4 text-center text-muted">لا توجد منشورات حالياً.</div>';
      }
    }
  } else {
    loadWall();
  }
});

function createSystemMessageElement({ id, title, content, image, titleColor, bgColor, textColor, createdAt, user, isAnnouncement }) {
  if (!state.currentRoomId || (state.isRoomFrozen && !(user && user.isSystemLeaveMessage))) return null;
  
  if (isAnnouncement && user) {
    appendMessage({
      id,
      user: { ...user, isAnnouncement: true },
      text: content,
      createdAt
    });
    return null;
  }

  // Clear chat-cleared-container if it exists
  const clearedContainer = ui.messagesContainer.querySelector('.chat-cleared-container');
  if (clearedContainer) {
    ui.messagesContainer.innerHTML = '';
  }

  const div = document.createElement('div');
  div.className = 'message-row system-message-row';
  div.style.minHeight = '50px';
  div.style.backgroundColor = bgColor;
  div.style.direction = 'ltr';
  div.style.paddingLeft = '0';
  if (id) div.dataset.id = id;

  const systemAvatar = window.getSystemMessageImageUrl(image); 
  const titleToUse = user ? (user.topic || user.username) : title;
  const usernameData = user ? user.username : title;
  
  let renderUserData = user;
  if (user) {
    const incomingUserId = user.userId || user.id;
    const latestUser =
      state.currentUsers.find(u => Number(u.userId || u.id) === Number(incomingUserId)) ||
      state.currentUsers.find(u => u.username === user.username);
    
    renderUserData = {
      ...user,
      ...(latestUser || {}),
      id: latestUser?.userId || latestUser?.id || incomingUserId || user.id,
      userId: latestUser?.userId || latestUser?.id || incomingUserId || user.userId,
      username: user.username || latestUser?.username,
      superIcon: latestUser?.superIcon !== undefined ? latestUser.superIcon : user.superIcon,
      gifts: latestUser?.gifts !== undefined ? latestUser.gifts : user.gifts
    };
  }
  
  let headerHtml = '';
  if (user) {
    headerHtml = window.renderUserIdentity(renderUserData, {
      nameClasses: 'message-username',
      nameStyle: `color: ${titleColor} !important;`,
      tag: 'span'
    });
  } else {
    headerHtml = `<span class="message-username" data-username="${usernameData}" style="color: ${titleColor} !important;">${titleToUse}</span>`;
  }

  div.innerHTML = `
    <img src="${systemAvatar}" class="message-avatar" referrerPolicy="origin-when-cross-origin" style="width: 50px; height: 50px; object-fit: cover; border-radius: 0; flex-shrink: 0; margin-right: 1px; align-self: flex-start !important;">
    <div class="message-body" style="padding: 4px 6px; border: none; flex-grow: 1; background-color: transparent;">
      <div class="message-header" style="margin-bottom: 2px; display: flex; align-items: center;">
        ${headerHtml}
      </div>
      <div class="message-text" style="--system-message-original-color: ${textColor || '#333'}; color: var(--system-message-text-color, var(--system-message-original-color));">${replacePlaceholders(replaceShortcuts(content))}</div>
    </div>
  `;

  return div;
}

function createMessageElement({ id, user, userId, text, createdAt, replyTo, mediaUrl, mediaType }) {
  const isLeaveSystemMessage = user && user.isSystemLeaveMessage === true;

  if (!isLeaveSystemMessage && (!state.currentRoomId || state.isRoomFrozen)) return null;
  if (!user) return null;
  
  const incomingUserId = userId || user.userId || user.id;

  const latestUser =
    state.currentUsers.find(u => Number(u.userId || u.id) === Number(incomingUserId)) ||
    state.currentUsers.find(u => u.username === user.username);

  const renderUserData = {
    ...user,
    ...(latestUser || {}),
    id: latestUser?.userId || latestUser?.id || incomingUserId || user.id,
    userId: latestUser?.userId || latestUser?.id || incomingUserId || user.userId,
    username: user.username || latestUser?.username,
    superIcon: latestUser?.superIcon !== undefined ? latestUser.superIcon : user.superIcon,
    gifts: latestUser?.gifts !== undefined ? latestUser.gifts : user.gifts
  };
  
  // Clear chat-cleared-container if it exists
  const clearedContainer = ui.messagesContainer.querySelector('.chat-cleared-container');
  if (clearedContainer) {
    ui.messagesContainer.innerHTML = '';
  }
  
  // Check if user is ignored
  if (state.ignoredUsers.has(renderUserData.username)) return null;

  const div = document.createElement('div');
  const isSystemMsg = renderUserData.type === 'system' && !renderUserData.username;
  
  const isVirtualNormalUser =
    renderUserData.isVirtualUser === true &&
    renderUserData.isGameBot !== true;

  div.className = isSystemMsg
    ? 'p-2 text-center small border-bottom system-inline-message'
    : (
        renderUserData.isSystem ||
        renderUserData.isGameBot ||
        (renderUserData.isBot && !isVirtualNormalUser)
      )
        ? 'message-row system-user-message'
        : 'message-row';
  if (id) div.dataset.id = id;
  
  if (isSystemMsg) {
    div.innerHTML = text;
  } else {
    // Check if it's a Game Bot message and handle placeholder rendering
    if (renderUserData.isGameBot) {
        const matches = text.match(/\[(.*?)\]/g);
        if (matches) {
            matches.forEach(match => {
                const username = match.replace(/\[|\]/g, '');
                const foundUser = state.currentUsers.find(u => u.username === username);
                if (foundUser) {
                    const identityHtml = window.renderUserIdentity(foundUser, {
                        nameClasses: 'message-username',
                        nameStyle: 'color: inherit;'
                    });
                    text = text.replace(match, identityHtml);
                }
            });
        }
    }
    
    // Fetch latest addons from state.currentUsers if available
    const latestUserLookup = state.currentUsers.find(u => u.username === renderUserData.username);
    const superIcon = latestUserLookup ? latestUserLookup.superIcon : renderUserData.superIcon;
    const gifts = latestUserLookup ? latestUserLookup.gifts : renderUserData.gifts;
    
    // Fallback chain for ucol, bg, and fontColor matching user profile or active/current state
    const ucol = 
      (latestUserLookup ? latestUserLookup.ucol : null) || 
      renderUserData.ucol || 
      (state.currentUser && state.currentUser.username === renderUserData.username ? state.currentUser.ucol : null) || 
      '';

    const bg = 
      (latestUserLookup ? latestUserLookup.bg : null) || 
      renderUserData.bg || 
      (state.currentUser && state.currentUser.username === renderUserData.username ? state.currentUser.bg : null) || 
      'transparent';

    const fontColor = 
      (latestUserLookup ? latestUserLookup.fontColor : null) || 
      renderUserData.fontColor || 
      (state.currentUser && state.currentUser.username === renderUserData.username ? state.currentUser.fontColor : null) || 
      '';

    const topic = (latestUserLookup ? latestUserLookup.topic : renderUserData.topic) || renderUserData.username;

    const isNightMode = false; // Deprecated/Removed old toggle in favor of global dark mode

    let usernameStyle = '';
    let messageTextStyle = '';

    const isBgImage = (bg && bg !== 'transparent' && (bg.startsWith('http') || bg.startsWith('/'))) ? true : false;
    let bgStyle = '';
    if (isBgImage) {
      bgStyle = `background-image: url('${bg}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
    } else if (bg && bg !== 'transparent') {
      bgStyle = `background: ${bg};`;
    }
    usernameStyle = `${ucol ? `color: ${ucol};` : ''} ${bgStyle}`;
    messageTextStyle = fontColor ? `color: ${fontColor};` : '';

    if (!isNightMode && fontColor && fontColor !== '#000000' && fontColor !== 'transparent' && fontColor.startsWith('#')) {
      try {
        let hex = fontColor.replace('#', '');
        if (hex.length === 3) {
          hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            div.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.03)`;
          }
        }
      } catch (e) {}
    }

    let replyHtml = '';
    if (replyTo) {
      // Rehydrate replyTo
      const replyUserId = replyTo.userId || replyTo.id;

      const latestReplyUser =
        state.currentUsers.find(u => String(u.userId || u.id) === String(replyUserId)) ||
        state.currentUsers.find(u => u.username === replyTo.username);

      const renderReplyUserData = {
        ...replyTo,
        ...(latestReplyUser || {}),
        id: latestReplyUser?.userId || latestReplyUser?.id || replyUserId || replyTo.id,
        userId: latestReplyUser?.userId || latestReplyUser?.id || replyUserId || replyTo.userId,
        username: replyTo.username || latestReplyUser?.username,
        superIcon: latestReplyUser?.superIcon !== undefined ? latestReplyUser.superIcon : replyTo.superIcon,
        gifts: latestReplyUser?.gifts !== undefined ? latestReplyUser.gifts : replyTo.gifts
      };

      if (isNightMode) {
        renderReplyUserData.ucol = '#cbd5e1';
        renderReplyUserData.bg = 'transparent';
      }

      let quotedMediaHtml = '';
      if (replyTo.mediaUrl) {
        if (replyTo.mediaType === 'image') {
          quotedMediaHtml = `<div class="quoted-media mt-1"><img src="${replyTo.mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;"></div>`;
        } else if (replyTo.mediaType === 'video') {
          quotedMediaHtml = `<div class="quoted-media mt-1"><video src="${replyTo.mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;" controls></video></div>`;
        } else if (replyTo.mediaType === 'youtube') {
          quotedMediaHtml = `<div class="quoted-media mt-1"><i class="fab fa-youtube"></i> يوتيوب</div>`;
        } else if (replyTo.mediaType === 'file') {
          quotedMediaHtml = `<div class="quoted-media mt-1"><i class="fas fa-file"></i> ملف</div>`;
        }
      }

      replyHtml = `
        <div class="quoted-message">
          <img src="${window.getAvatarUrl(renderReplyUserData)}" class="quoted-avatar" data-username="${escapeHTML(renderReplyUserData.username)}" data-is-hidden="${renderReplyUserData.isHidden ? 'true' : 'false'}" data-role-rank="${renderReplyUserData.roleRank || 0}" referrerPolicy="origin-when-cross-origin">
          <div class="quoted-content">
            ${window.renderUserIdentity(renderReplyUserData, {
              containerClasses: 'user-identity-inline',
              nameClasses: 'quoted-username',
              tag: 'span',
              onClick: `event.preventDefault();`
            })}
            <div class="quoted-text">${replaceMentions(replacePlaceholders(replaceShortcuts(escapeHTML(replyTo.text))))}</div>
            ${quotedMediaHtml}
          </div>
        </div>
      `;
    }

    let mediaHtml = '';
    if (mediaUrl && mediaType === 'youtube') {
      mediaHtml = `
        <div class="message-media mt-2">
          <div class="youtube-horizontal-placeholder" onclick="revealMedia(this, 'youtube', '${mediaUrl}', event)">
            <div class="yt-left-side">
              <i class="fab fa-youtube"></i>
            </div>
            <div class="yt-right-side">
              <img src="https://img.youtube.com/vi/${mediaUrl}/hqdefault.jpg" class="placeholder-thumb" onerror="this.src='https://img.youtube.com/vi/${mediaUrl}/mqdefault.jpg'">
              <div class="yt-play-label">تشغيل</div>
            </div>
          </div>
        </div>
      `;
    } else if (mediaUrl && mediaType === 'image') {
      mediaHtml = `
        <div class="message-media mt-2">
          <div class="media-placeholder image-placeholder" onclick="revealMedia(this, 'image', '${mediaUrl}', event)">
            <span>عرض الصورة</span>
            <div class="placeholder-icon"><i class="fas fa-image"></i></div>
          </div>
        </div>
      `;
    } else if (mediaUrl && mediaType === 'video') {
      mediaHtml = `
        <div class="message-media mt-2">
          <div class="media-placeholder video-placeholder" onclick="revealMedia(this, 'video', '${mediaUrl}', event)">
            <span>تشغيل الفيديو</span>
            <div class="placeholder-icon"><i class="fas fa-play-circle"></i></div>
          </div>
        </div>
      `;
    } else if (mediaUrl && mediaType === 'audio') {
      mediaHtml = `
        <div class="message-media mt-2">
          <audio src="${mediaUrl}" controls style="width: 100%;"></audio>
        </div>
      `;
    } else if (mediaUrl && mediaType === 'file') {
      mediaHtml = `
        <div class="message-media mt-2">
          <a href="${mediaUrl}" target="_blank" class="btn btn-sm btn-outline-primary mt-1"><i class="fas fa-file"></i> تحميل الملف</a>
        </div>
      `;
    }

    // Use innerHTML for text if it's a system message (contains HTML highlights)
    let textContent = user.isSystem ? text : escapeHTML(text);
    // Only play sound here for actual message receipt
    textContent = replaceMentions(replacePlaceholders(textContent), true);
    
    // Phase 6: Safe Linkification
    if (window.safeLinkify) {
      textContent = window.safeLinkify(textContent);
    }

    if (user.isAnnouncement) {
      textContent = `<div class="chat-ad-message"><span class="announcement-badge ad-icon"><i class="fas fa-bullhorn"></i> إعلان</span> <span class="ad-text">${textContent}</span></div>`;
    }

    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
    const targetRank = user.roleRank || 0;
        
    let canDelete = false;
    if (state.currentUser) {
      if (user.isAnnouncement) {
        const hasAnnouncePermission = hasPermission('canSendBroadcastMessages');
        const isHigherRank = myRank > targetRank || (state.currentUser.username === user.username);
        if (hasAnnouncePermission && (isHigherRank)) {
          canDelete = true;
        }
      } else {
        const isDeletionEnabled = window.featuresSettings && window.featuresSettings.publicMessageDeletionEnabled;
        canDelete = (state.currentUser.username === user.username && isDeletionEnabled || hasPermission('canDeletePublicMessages'));
      }
    }

    const isReplyEnabled = window.featuresSettings && window.featuresSettings.publicMessageReplyEnabled;
    let canReply = isReplyEnabled || hasPermission('canReplyToPublicMessages');
    if (user.isAnnouncement) {
      canReply = false;
    }

    // Allow user identity standard rendering
    let renderUserDataForIdentity = { ...renderUserData };
    if (isNightMode) {
      renderUserDataForIdentity.ucol = '#cbd5e1';
      renderUserDataForIdentity.bg = 'transparent';
    }
    const userIdentityHtml = window.renderUserIdentity(renderUserDataForIdentity, {
      nameClasses: 'message-username',
      nameStyle: usernameStyle
    });

    const avatarHtml = `<img src="${window.getAvatarUrl(renderUserData)}" class="message-avatar" data-username="${renderUserData.username}" data-is-hidden="${renderUserData.isHidden ? 'true' : 'false'}" data-role-rank="${renderUserData.roleRank || 0}" referrerPolicy="origin-when-cross-origin">`;

    div.innerHTML = `
      ${avatarHtml}
      <div class="message-body">
        <div class="message-header">
          ${userIdentityHtml}
        </div>
        ${replyHtml}
        ${mediaHtml}
        ${textContent ? `<div class="message-text" data-username="${user.username}" style="${messageTextStyle}">${textContent}</div>` : ''}
      </div>
      <div class="message-actions d-flex flex-row align-items-center gap-2">
        <div class="message-time" data-created-at="${createdAt}" style="font-size: 10px; color: #555;">${formatTimeAgo(createdAt)}</div>
        ${(user.isSystem || user.isBot || user.isGameBot) ? '' : `
        <div class="d-flex gap-1 justify-content-center">
          ${canReply ? '<button class="btn-msg-action reply-btn" title="رد"><i class="fas fa-reply"></i></button>' : ''}
          ${canDelete ? '<button class="btn-msg-action delete-btn" title="حذف"><i class="fas fa-times"></i></button>' : ''}
        </div>
        `}
      </div>
    `;

    const deleteBtn = div.querySelector('.delete-btn');
    const replyBtn = div.querySelector('.reply-btn');
    const indicator = div.querySelector('.swipe-indicator');

    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (id) {
          socket.emit('delete-message', { id, roomId: state.currentRoomId });
        } else {
          div.style.opacity = '0';
          div.style.transform = 'translateX(20px)';
          setTimeout(() => {
            if (div.parentNode) {
              div.parentNode.removeChild(div);
            }
          }, 200);
        }
      });
    }

    if (replyBtn) {
      replyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        state.setReplyingTo({
          user: renderUserData,
          text,
          mediaUrl,
          mediaType
        });
        if (ui.replyToAvatar) ui.replyToAvatar.src = window.getAvatarUrl(renderUserData);
        ui.replyToUser.innerHTML = window.renderUserIdentity(renderUserData, {
          containerClasses: 'user-identity-inline',
          nameClasses: 'quoted-username',
          tag: 'span'
        });
        ui.replyToText.innerHTML = replaceMentions(replacePlaceholders(replaceShortcuts(escapeHTML(text))));
        
        if (ui.replyToMedia) {
          if (mediaUrl) {
            if (mediaType === 'image') {
              ui.replyToMedia.innerHTML = `<img src="${mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;">`;
            } else if (mediaType === 'video') {
              ui.replyToMedia.innerHTML = `<video src="${mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;" controls></video>`;
            } else if (mediaType === 'youtube') {
              ui.replyToMedia.innerHTML = `<i class="fab fa-youtube"></i> يوتيوب`;
            }
          } else {
            ui.replyToMedia.innerHTML = '';
          }
        }
        
        ui.replyPreview.classList.remove('d-none');
        ui.chatInput.focus();
      });
    }

    // Swipe to reply logic (Touch & Mouse)
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    const handleStart = (clientX) => {
      if (user.isSystem || user.isBot || user.isGameBot) return;
      startX = clientX;
      currentX = clientX;
      isSwiping = true;
      div.style.transition = 'none';
    };

    const handleMove = (clientX) => {
      if (!isSwiping) return;
      currentX = clientX;
      const diff = currentX - startX;
      
      // Only allow swiping to the right (positive diff)
      if (diff > 0 && diff < 180) {
        // Apply resistance as we pull further
        const resistanceDiff = diff < 70 ? diff : 70 + (diff - 70) * 0.25;
        div.style.transform = `translateX(${resistanceDiff}px)`;
        
        // Show indicator based on distance
        if (indicator) {
          const threshold = 60;
          indicator.style.opacity = Math.min(diff / threshold, 1);
          indicator.style.left = `${-45 + Math.min(diff / 1.2, 75)}px`;
          
          if (diff > threshold) {
            if (!indicator.classList.contains('active')) {
              indicator.classList.add('active');
              // Haptic feedback when threshold is reached
              if (window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate(15);
              }
            }
          } else {
            indicator.classList.remove('active');
          }
        }
      }
    };

    const handleEnd = () => {
      if (!isSwiping) return;
      const diff = currentX - startX;
      
      div.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      if (indicator) {
        indicator.style.opacity = '0';
        indicator.classList.remove('active');
      }

      if (diff > 60) {
        // Trigger reply
        state.setReplyingTo({
          user: renderUserData,
          text,
          mediaUrl,
          mediaType
        });
        if (ui.replyToAvatar) ui.replyToAvatar.src = window.getAvatarUrl(renderUserData);
        ui.replyToUser.innerHTML = window.renderUserIdentity(renderUserData, {
          containerClasses: 'user-identity-inline',
          nameClasses: 'quoted-username',
          tag: 'span'
        });
        ui.replyToText.innerHTML = replaceMentions(replacePlaceholders(replaceShortcuts(escapeHTML(text))));
        
        if (ui.replyToMedia) {
          if (mediaUrl) {
            if (mediaType === 'image') {
              ui.replyToMedia.innerHTML = `<img src="${mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;">`;
            } else if (mediaType === 'video') {
              ui.replyToMedia.innerHTML = `<video src="${mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;" controls></video>`;
            } else if (mediaType === 'youtube') {
              ui.replyToMedia.innerHTML = `<i class="fab fa-youtube"></i> يوتيوب`;
            }
          } else {
            ui.replyToMedia.innerHTML = '';
          }
        }
        
        ui.replyPreview.classList.remove('d-none');
        ui.chatInput.focus();
        
        // Visual feedback
        div.style.backgroundColor = '#f0f7ff';
        setTimeout(() => div.style.backgroundColor = '#fff', 500);
        
        // Haptic feedback if available
        if (window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(10);
        }
      }
      
      div.style.transform = 'translateX(0)';
      isSwiping = false;
    };

    // Swipe logic removed

  }
  return div;
}


// High-performance queueing system for public/system messages
publicMessageQueue = publicMessageQueue || [];
publicMessageRAF = null;

function appendMessage(data) {
  publicMessageQueue.push({ type: 'public', data });
  schedulePublicMessageRender();
}

function appendSystemMessage(data) {
  if (data && data.isAnnouncement && data.user) {
    appendMessage({
      id: data.id,
      user: { ...data.user, isAnnouncement: true },
      text: data.content,
      createdAt: data.createdAt
    });
    return;
  }
  publicMessageQueue.push({ type: 'system', data });
  schedulePublicMessageRender();
}

function schedulePublicMessageRender() {
  if (publicMessageRAF) return;
  publicMessageRAF = requestAnimationFrame(() => {
    publicMessageRAF = null;
    if (publicMessageQueue.length === 0) return;

    const messagesToProcess = [...publicMessageQueue];
    publicMessageQueue = [];

    const chatScroller = ui.messagesContainer;
    if (!chatScroller) return;

    // Clear chat-cleared-container once if it exists
    const clearedContainer = chatScroller.querySelector('.chat-cleared-container');
    if (clearedContainer) {
      chatScroller.innerHTML = '';
    }

    // Scroll check BEFORE appending to avoid layout calculations in the middle
    const isAtBottom = chatScroller.scrollHeight - chatScroller.scrollTop - chatScroller.clientHeight < 300;

    const fragment = document.createDocumentFragment();
    const imagesToTrack = [];

    messagesToProcess.forEach(item => {
      let div = null;
      try {
        if (item.type === 'public') {
          div = createMessageElement(item.data);
        } else if (item.type === 'system') {
          div = createSystemMessageElement(item.data);
        }
      } catch (err) {
        console.error('Error rendering message in batch:', err);
      }

      if (div) {
        fragment.appendChild(div);

        // Manual trigger for cached images
        div.querySelectorAll('.user-identity-super').forEach(img => {
          if (img.complete) {
            window.handleUserIdentitySuperLoad(img, img.getAttribute('src'));
          }
        });

        if (isAtBottom) {
          div.querySelectorAll('img').forEach(img => {
            imagesToTrack.push(img);
          });
        }
      }
    });

    if (fragment.children.length > 0) {
      chatScroller.appendChild(fragment);

      // Limit messages to 50 for better performance balance (done ONCE per batch!)
      while (chatScroller.children.length > 50) {
        chatScroller.removeChild(chatScroller.firstChild);
      }

      if (isAtBottom) {
        // Immediate scroll for faster feeling
        chatScroller.scrollTop = chatScroller.scrollHeight;

        // Follow up scroll on image loads
        if (imagesToTrack.length > 0) {
          imagesToTrack.forEach(img => {
            img.onload = () => {
              chatScroller.scrollTop = chatScroller.scrollHeight;
            };
          });
          // Fallback timeout in case image loading is slow/fails
          setTimeout(() => {
            chatScroller.scrollTop = chatScroller.scrollHeight;
          }, 100);
        }
      }
    }
  });
}

function syncDOMList(container, items) {
  if (!container) return;
  
  // Create a map of existing nodes by ID
  const existingNodes = Array.from(container.children);
  const existingMap = new Map();
  existingNodes.forEach(node => {
    if (node.id) existingMap.set(node.id, node);
  });

  let prevNode = null;
  const tempContainer = document.createElement('div');

  items.forEach(item => {
    let node = existingMap.get(item.id);
    let html = item.html.trim();

    if (!node) {
      // Create new node
      tempContainer.innerHTML = html;
      node = tempContainer.firstElementChild;
      if (node) {
        node.id = item.id;
        // Optimization: Save signature to avoid checking outerHTML strings if possible, 
        // but outerHTML comparison is fast enough for small lists
        node.dataset.signature = html; 
      }
    } else {
      // Node exists, check if html changed
      if (node.dataset.signature !== html) {
        tempContainer.innerHTML = html;
        const newNode = tempContainer.firstElementChild;
        if (newNode) {
          if (typeof window.syncNodes === 'function') {
            window.syncNodes(node, newNode);
          } else {
            node.innerHTML = newNode.innerHTML;
            node.className = newNode.className;
            node.style.cssText = newNode.style.cssText;
          }
          node.dataset.signature = html;
        }
      }
      existingMap.delete(item.id);
    }

    if (node) {
      if (!prevNode) {
        if (container.firstChild !== node) {
          container.prepend(node);
        }
      } else {
        if (node.previousSibling !== prevNode) {
          prevNode.after(node);
        }
      }
      prevNode = node;
    }
  });

  // Remove nodes that are no longer in the list
  existingMap.forEach(node => node.remove());
}


function updateOnlineCounters(users) {
  const onlineCount = users.filter(u => u.isOnline || u.isGhost).length;
  console.debug('Updating online counters, count:', onlineCount);
  if (ui.onlineCount) {
    ui.onlineCount.innerText = onlineCount;
    console.debug('Updated onlineCount innerText');
  }
  if (ui.landingUsersCount) {
    ui.landingUsersCount.innerHTML = `<i class="fas fa-user-friends"></i> ${onlineCount}`;
    console.debug('Updated landingUsersCount innerHTML');
  }
}

let forceUpdateUsersListFlag = false;
function updateUsersList(users, options = {}) {
  pendingUsersPayload = users;
  if (options && options.force) {
    forceUpdateUsersListFlag = true;
  }
  
  if (!updateUsersListRAF) {
    updateUsersListRAF = requestAnimationFrame(() => {
      updateUsersListRAF = null;
      if (!pendingUsersPayload) return;
      
      const payloadToProcess = pendingUsersPayload;
      pendingUsersPayload = null;
      
      const force = forceUpdateUsersListFlag;
      forceUpdateUsersListFlag = false;

      // Deep stringify to avoid superficial check
      const payloadString = JSON.stringify(payloadToProcess);
      if (payloadString === lastUsersPayloadString && !force) {
          // Exactly the same payload, no need to re-render or re-sort
          return;
      }
      lastUsersPayloadString = payloadString;

      // Sort users by isGhost ascending (non-ghost first), then roleRank descending, then joinTime ascending, then username
      const sortedUsers = [...payloadToProcess].sort((a, b) => {
        const ghostA = !!a.isGhost;
        const ghostB = !!b.isGhost;
        if (ghostA !== ghostB) return ghostA ? 1 : -1;

        const rankA = a.roleRank || (a.group && a.group.roleRank) || 0;
        const rankB = b.roleRank || (b.group && b.group.roleRank) || 0;
        if (rankA !== rankB) return rankB - rankA;
        
        const joinA = a.joinTime || 0;
        const joinB = b.joinTime || 0;
        if (joinA !== joinB) return joinA - joinB;
        
        return (a.username || '').localeCompare(b.username || '');
      });

      state.setCurrentUsers(sortedUsers);
      
      sortedUsers.forEach(u => {
        if (typeof window.updateSpeakerMutedIcon === 'function') {
          window.updateSpeakerMutedIcon(
            u.userId || u.id,
            u.username,
            u.isSpeakerMuted === true || u.isSpeakerMuted === 'true'
          );
        }
      });
      
      if (typeof profileUser !== 'undefined' && profileUser) {
        const found = sortedUsers.find(u => u.username === profileUser.username || (profileUser.id && (u.id === profileUser.id || u.userId === profileUser.id)));
        if (found) {
          profileUser = { ...profileUser, ...found };
          window.profileUser = profileUser;
          if (typeof updateProfileButtons === 'function') {
            updateProfileButtons(profileUser, 5000);
          }
        }
      }

      updateOnlineCounters(sortedUsers);
      console.debug('Users list updated with', sortedUsers.length, 'users');
      console.debug('landingUsersCount exists:', !!ui.landingUsersCount);
      
      if (updateUsersListTimeout) clearTimeout(updateUsersListTimeout);
      updateUsersListTimeout = setTimeout(() => {
        updateUserVisuals(sortedUsers);
      }, 100);

      // Only render sidebar if tab is active and sidebar is actually open
      if (state.activeSidebarTab === 'users' && ui.sidebar && ui.sidebar.classList.contains('open')) {
         if (!ui.sidebarUsersContainer) ui.sidebarUsersContainer = document.getElementById('sidebar-users-container');
         if (ui.sidebarUsersContainer) {
           if (ui.sidebarSearchInput && ui.sidebarSearchInput.value.trim()) {
             const query = ui.sidebarSearchInput.value.trim().toLowerCase();
             const filteredUsers = sortedUsers.filter(u => 
                (u.username && u.username.toLowerCase().includes(query)) || 
                (u.topic && u.topic.toLowerCase().includes(query))
             );
             renderUsersInSidebar(filteredUsers);
           } else {
             renderUsersInSidebar(sortedUsers);
           }
         }
      } else {
        loadedTabs['users'] = false; // Mark as stale so it re-renders next time tab is opened
      }
    });
  }
}

presenceUsersMap = presenceUsersMap || new Map();
presenceUsersVersion = presenceUsersVersion || 0;

window.getPresenceDomId = getPresenceDomId;
function getPresenceDomId(key) {
  if (!key) return 'sidebar-user-unknown';
  const safeKey = String(key).replace(/[^a-zA-Z0-9_-]/g, (char) => {
    return `_${char.charCodeAt(0).toString(16)}_`;
  });
  return `sidebar-user-${safeKey}`;
}

window.getPresenceKey = getPresenceKey;
function getPresenceKey(u) {
  if (u && u.key) return u.key;
  if (!u) return 'unknown:0';
  const isGuest = u.type === 'guest' || u.isGuest || u.guestId || (typeof u.id === 'number' && u.id < 0) || (u.id && String(u.id).startsWith('g_'));
  if (isGuest) {
    const guestId = u.guestId ?? u.userId ?? u.id ?? 'unknown';
    return `guest:${guestId}`;
  }
  const memberId = u.userId ?? u.id ?? 'unknown';
  return `member:${memberId}`;
}

window.getUserPresenceColor = function(u) {
  if (!u) return '#6c757d'; // Default safe gray (offline/unknown)
  let statusColor = '#6c757d'; // Offline (gray)
  if (u.isOnline) {
    if ((u.isVirtualUser || u.isBotOrVirtual || u.type === 'bot') && u.onlineStatusStr) {
      if (u.onlineStatusStr === 'أخضر') statusColor = '#28a745';
      else if (u.onlineStatusStr === 'أحمر') statusColor = '#dc3545';
      else if (u.onlineStatusStr === 'أصفر') statusColor = '#ffc107';
      else if (u.onlineStatusStr === 'أزرق') statusColor = '#007bff';
      else statusColor = '#6c757d';
    } else if (u.isBotOrVirtual || u.type === 'bot') {
      statusColor = '#28a745';
    } else if (u.isGhost) {
      statusColor = '#6c757d'; // Ghost (gray)
    } else if (u.isHidden) {
      statusColor = '#007bff'; // Hidden (blue)
    } else if (u.isReconnecting) {
      statusColor = '#ffc107'; // Reconnecting (yellow)
    } else {
      statusColor = (u.isIdle || u.presenceState === 'idle') ? '#ffc107' : '#28a745'; // Idle (yellow) or Active (green)
    }
  }

  const isActuallyOnline = u.isOnline && !u.isGhost;
  const isYellow = statusColor === '#ffc107';
  const borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;
  return u.isGhost ? '#808080' : borderColor;
};

window.getPresenceUserColor = function(user) {
  if (!user) return '#6c757d';
  const key = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(user) : null;
  let presUser = null;
  if (key && typeof presenceUsersMap !== 'undefined' && presenceUsersMap && presenceUsersMap.has(key)) {
    presUser = presenceUsersMap.get(key);
  }
  
  if (!presUser) {
    const curUser = (typeof state !== 'undefined' && state) ? state.currentUser : null;
    if (curUser) {
      const curKey = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(curUser) : null;
      if (curKey && curKey === key) {
        presUser = { ...user, isOnline: true };
      }
    }
  }

  if (presUser) {
    return window.getUserPresenceColor(presUser);
  }
  return '#6c757d'; // Default safe gray if status unavailable or offline
};

window.updateProfileHeaderPresenceStatus = function(targetUser) {
  const user = targetUser || window.profileUser;
  if (!user) return;
  const headerAvatar = document.getElementById('profile-avatar-header');
  if (!headerAvatar) return;

  const color = window.getPresenceUserColor(user);
  headerAvatar.style.borderLeft = `4px solid ${color}`;
};

function updateUsersSnapshot(version, users) {
  if (version && presenceUsersVersion && version < presenceUsersVersion) {
    return;
  }
  window.__snapshotRequestPending = false;
  
  const newMap = new Map();
  if (Array.isArray(users)) {
    users.forEach(u => {
      const key = getPresenceKey(u);
      u.key = key;
      const oldU = presenceUsersMap.get(key);
      if (oldU && u.cover === undefined && oldU.cover) {
        u.cover = oldU.cover;
      }
      newMap.set(key, u);
    });
  }
  
  for (const [key, oldU] of presenceUsersMap.entries()) {
    if (!newMap.has(key)) {
      if (state && state.previousUserSignatures) {
        delete state.previousUserSignatures[key];
      }
      const domId = getPresenceDomId(key);
      const el = document.getElementById(domId);
      if (el) el.remove();
    }
  }
  
  presenceUsersMap = newMap;
  presenceUsersVersion = version || 0;

  const allUsers = Array.from(presenceUsersMap.values());
  state.setCurrentUsers(allUsers);
  updateOnlineCounters(allUsers);
  updateUsersList(allUsers, { force: true });
  if (typeof window.updateProfileHeaderPresenceStatus === 'function') {
    window.updateProfileHeaderPresenceStatus();
  }
  if (typeof profileUser !== 'undefined' && profileUser) {
    const updatedU = allUsers.find(u => u.username === profileUser.username || u.id === profileUser.id || u.userId === profileUser.userId);
    if (updatedU) {
      profileUser = { ...profileUser, ...updatedU };
      window.profileUser = profileUser;
      if (typeof updateProfileButtons === 'function') {
        updateProfileButtons(profileUser, 5000);
      }
    }
  }
}

function repositionSingleUserElement(u, el) {
  if (!ui.sidebarUsersContainer || !el) return;
  
  const comparator = (a, b) => {
    const ghostA = !!a.isGhost;
    const ghostB = !!b.isGhost;
    if (ghostA !== ghostB) return ghostA ? 1 : -1;

    const rankA = a.roleRank || (a.group && a.group.roleRank) || 0;
    const rankB = b.roleRank || (b.group && b.group.roleRank) || 0;
    if (rankA !== rankB) return rankB - rankA;
    const joinA = a.joinTime || 0;
    const joinB = b.joinTime || 0;
    if (joinA !== joinB) return joinA - joinB;
    return (a.username || '').localeCompare(b.username || '');
  };

  const isCurrentRoom = Number(u.roomId) === Number(state.currentRoomId);
  let header = document.getElementById('other-rooms-header');

  if (isCurrentRoom) {
    let insertBeforeEl = null;
    const children = Array.from(ui.sidebarUsersContainer.children);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.id === 'other-rooms-header') break;
      if (child === el) continue;
      const childKey = child.id.replace('sidebar-user-', '');
      let childU = presenceUsersMap.get(childKey);
      if (!childU) {
        for (const [k, val] of presenceUsersMap.entries()) {
          if (getPresenceDomId(k) === child.id) {
            childU = val;
            break;
          }
        }
      }
      if (childU && comparator(u, childU) < 0) {
        insertBeforeEl = child;
        break;
      }
    }

    if (insertBeforeEl) {
      insertBeforeEl.before(el);
    } else if (header) {
      header.before(el);
    } else {
      ui.sidebarUsersContainer.appendChild(el);
    }
  } else {
    if (!header) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = `<div id="other-rooms-header" class="other-rooms-header">المتواجدين في الدردشة</div>`;
      header = tempDiv.firstElementChild;
      ui.sidebarUsersContainer.appendChild(header);
    }

    let insertBeforeEl = null;
    let inSection2 = false;
    const children = Array.from(ui.sidebarUsersContainer.children);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.id === 'other-rooms-header') {
        inSection2 = true;
        continue;
      }
      if (!inSection2 || child === el) continue;

      let childU = null;
      for (const [k, val] of presenceUsersMap.entries()) {
        if (getPresenceDomId(k) === child.id) {
          childU = val;
          break;
        }
      }
      if (childU && comparator(u, childU) < 0) {
        insertBeforeEl = child;
        break;
      }
    }

    if (insertBeforeEl) {
      insertBeforeEl.before(el);
    } else {
      ui.sidebarUsersContainer.appendChild(el);
    }
  }

  header = document.getElementById('other-rooms-header');
  if (header && !header.nextElementSibling) {
    header.remove();
  }
}

function updateUsersPatch(version, upserts, removes) {
  if (version && presenceUsersVersion) {
    if (version <= presenceUsersVersion) {
      return;
    }
    if (version > presenceUsersVersion + 1) {
      if (!window.__snapshotRequestPending) {
        window.__snapshotRequestPending = true;
        setTimeout(() => { window.__snapshotRequestPending = false; }, 3000);
        if (typeof safeRequestUsersSnapshot === 'function') {
          safeRequestUsersSnapshot();
        } else if (typeof socket !== 'undefined' && socket && socket.emit) {
          socket.emit('request-users-snapshot');
        }
      }
      return;
    }
  }
  if (version) {
    presenceUsersVersion = version;
  }

  if (Array.isArray(removes) && removes.length > 0) {
    removes.forEach(key => {
      if (presenceUsersMap.has(key)) {
        presenceUsersMap.delete(key);
      }
      if (state && state.previousUserSignatures) {
        delete state.previousUserSignatures[key];
      }
      if (state && Array.isArray(state.currentUsers)) {
        const idx = state.currentUsers.findIndex(u => u.key === key);
        if (idx !== -1) {
          state.currentUsers.splice(idx, 1);
        }
      }
      const domId = getPresenceDomId(key);
      const el = document.getElementById(domId);
      if (el) {
        el.remove();
      }
    });
    if (ui.sidebarUsersContainer) {
      const header = document.getElementById('other-rooms-header');
      if (header && !header.nextElementSibling) {
        header.remove();
      }
    }
  }

  const modifiedUsersForVisuals = [];

  if (Array.isArray(upserts) && upserts.length > 0) {
    upserts.forEach(u => {
      const key = getPresenceKey(u);
      u.key = key;
      const oldU = presenceUsersMap.get(key);
      
      const isNew = !oldU;
      const oldGhost = oldU ? !!oldU.isGhost : false;
      const newGhost = !!u.isGhost;
      const ghostChanged = oldGhost !== newGhost;
      const oldRank = oldU ? (oldU.roleRank || (oldU.group && oldU.group.roleRank) || 0) : 0;
      const newRank = u.roleRank || (u.group && u.group.roleRank) || 0;
      const rankChanged = oldRank !== newRank;
      const roomChanged = oldU ? (Number(oldU.roomId) !== Number(u.roomId)) : false;
      const joinTimeChanged = oldU ? ((oldU.joinTime || 0) !== (u.joinTime || 0)) : false;
      const typeChanged = oldU ? ((oldU.type || '') !== (u.type || '')) : false;
      const usernameChanged = oldU ? ((oldU.username || '') !== (u.username || '')) : false;

      const needsReposition = isNew || ghostChanged || rankChanged || roomChanged || joinTimeChanged || typeChanged || usernameChanged || !document.getElementById(getPresenceDomId(key));

      const mergedU = oldU ? { ...oldU, ...u } : { ...u };
      if (oldU && u.cover === undefined && oldU.cover) {
        mergedU.cover = oldU.cover;
      }

      presenceUsersMap.set(key, mergedU);
      modifiedUsersForVisuals.push(mergedU);
      
      if (state && Array.isArray(state.currentUsers)) {
        const idx = state.currentUsers.findIndex(item => item.key === key);
        if (idx !== -1) {
          state.currentUsers[idx] = mergedU;
        } else {
          state.currentUsers.push(mergedU);
        }
        state.currentUsers.sort((a, b) => {
          const ghostA = !!a.isGhost;
          const ghostB = !!b.isGhost;
          if (ghostA !== ghostB) return ghostA ? 1 : -1;

          const rankA = a.roleRank || (a.group && a.group.roleRank) || 0;
          const rankB = b.roleRank || (b.group && b.group.roleRank) || 0;
          if (rankA !== rankB) return rankB - rankA;
          const joinA = a.joinTime || 0;
          const joinB = b.joinTime || 0;
          if (joinA !== joinB) return joinA - joinB;
          return (a.username || '').localeCompare(b.username || '');
        });
      }

      if (state && state.currentUser && (state.currentUser.id === mergedU.id || state.currentUser.userId === mergedU.userId)) {
        if (mergedU.cover !== undefined && mergedU.cover !== null) {
          state.currentUser.cover = mergedU.cover;
        }
      }

      if (typeof profileUser !== 'undefined' && profileUser && (profileUser.key === key || profileUser.username === mergedU.username || profileUser.id === mergedU.id || profileUser.userId === mergedU.userId)) {
        profileUser = { ...profileUser, ...mergedU };
        window.profileUser = profileUser;
        if (typeof window.renderProfileCover === 'function') {
          window.renderProfileCover(mergedU.cover, mergedU);
        }
        if (typeof updateProfileButtons === 'function') {
          updateProfileButtons(profileUser, 5000);
        }
      }

      if (typeof window.updateSpeakerMutedIcon === 'function') {
        window.updateSpeakerMutedIcon(
          u.userId || u.id,
          u.username,
          u.isSpeakerMuted === true || u.isSpeakerMuted === 'true'
        );
      }

      if (state.activeSidebarTab === 'users' && ui.sidebar && ui.sidebar.classList.contains('open')) {
        if (ui.sidebarSearchInput && ui.sidebarSearchInput.value.trim()) {
          const query = ui.sidebarSearchInput.value.trim().toLowerCase();
          const allArr = Array.from(presenceUsersMap.values());
          const filtered = allArr.filter(item => 
            (item.username && item.username.toLowerCase().includes(query)) || 
            (item.topic && item.topic.toLowerCase().includes(query))
          );
          if (typeof renderUsersInSidebar === 'function') renderUsersInSidebar(filtered);
        } else {
          const domId = getPresenceDomId(key);
          let el = document.getElementById(domId);

          if (needsReposition) {
            if (!el && typeof window.renderUserObj === 'function') {
              const itemObj = window.renderUserObj(u);
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = itemObj.html.trim();
              el = tempDiv.firstElementChild;
              if (el) {
                el.id = domId;
                el.dataset.signature = itemObj.html;
              }
            } else if (el && typeof window.renderUserObj === 'function') {
              const newObj = window.renderUserObj(u);
              if (el.dataset.signature !== newObj.html) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = newObj.html.trim();
                const newEl = tempDiv.firstElementChild;
                if (newEl) {
                  if (typeof window.syncNodes === 'function') {
                    window.syncNodes(el, newEl);
                  } else {
                    el.innerHTML = newEl.innerHTML;
                    el.className = newEl.className;
                    el.style.cssText = newEl.style.cssText;
                  }
                  el.dataset.signature = newObj.html;
                }
              }
            }
            if (el) {
              repositionSingleUserElement(u, el);
            }
          } else if (el && typeof window.renderUserObj === 'function') {
            const newObj = window.renderUserObj(u);
            if (el.dataset.signature !== newObj.html) {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = newObj.html.trim();
              const newEl = tempDiv.firstElementChild;
              if (newEl) {
                if (typeof window.syncNodes === 'function') {
                  window.syncNodes(el, newEl);
                } else {
                  el.innerHTML = newEl.innerHTML;
                  el.className = newEl.className;
                  el.style.cssText = newEl.style.cssText;
                }
                el.dataset.signature = newObj.html;
              }
            }
          }
        }
      } else {
        loadedTabs['users'] = false;
      }
    });
  }

  let onlineCount = 0;
  for (const u of presenceUsersMap.values()) {
    if (u.isOnline || u.isGhost) onlineCount++;
  }
  if (ui.onlineCount) {
    ui.onlineCount.innerText = onlineCount;
  }
  if (ui.landingUsersCount) {
    ui.landingUsersCount.innerHTML = `<i class="fas fa-user-friends"></i> ${onlineCount}`;
  }

  if (modifiedUsersForVisuals.length > 0) {
    if (updateUsersListTimeout) clearTimeout(updateUsersListTimeout);
    updateUsersListTimeout = setTimeout(() => {
      updateUserVisuals(modifiedUsersForVisuals);
    }, 50);
  }

  if (typeof window.updateProfileHeaderPresenceStatus === 'function') {
    window.updateProfileHeaderPresenceStatus();
  }
}

function updateUserVisuals(users) {
  renderOnlineBotsForSelection();

  const getElementsFallback = (classes, id, username) => {
    let els = [];
    if (id) {
      const idSelector = classes.map(cls => `${cls}[data-user-id="${id}"]`).join(', ');
      els = Array.from(document.querySelectorAll(idSelector));
    }
    if (els.length === 0 && username) {
      const safeUsername = username.replace(/"/g, '\\"');
      const nameSelector = classes.map(cls => `${cls}[data-username="${safeUsername}"]`).join(', ');
      els = Array.from(document.querySelectorAll(nameSelector));
    }
    return els;
  };

  users.forEach(u => {
    // Generate signature of all visual properties including cover
    const signature = `${u.pic}|${u.cover || ''}|${u.ucol}|${u.bg}|${u.fontColor}|${u.topic}|${u.superIcon}|${u.likes}|${u.rep}|${u.wallPoints}|${u.isVerified}|${u.isSpeakerMuted}`;
    const userKey = u.key || getPresenceKey(u);
    if (state.previousUserSignatures[userKey] !== signature) {
      state.previousUserSignatures[userKey] = signature;
      
      const avatarUrl = window.getAvatarUrl(u);
      const absoluteAvatarUrl = avatarUrl.startsWith('http') || avatarUrl.startsWith('data:') ? avatarUrl : new URL(avatarUrl, window.location.href).href;
      
      const resolvedId = u.userId ?? u.id;

      // Update profile modal if it is open for this user
      if (typeof profileUser !== 'undefined' && profileUser && (profileUser.username === u.username || profileUser.id === resolvedId)) {
        profileUser.wallPoints = u.wallPoints || 0;
        
        const profileWallPoints = document.getElementById('profile-wall-points');
        if (profileWallPoints) {
           profileWallPoints.innerText = window.formatCompactNumber ? window.formatCompactNumber(profileUser.wallPoints) : profileUser.wallPoints;
        }
        
        if (typeof window.renderProfileBadges === 'function' && window.badgeSettings) {
           window.renderProfileBadges(profileUser, window.badgeSettings);
        }
      }

      // Update avatars
      const avatarEls = getElementsFallback(['.message-avatar', '.wall-post-avatar'], resolvedId, u.username);
      avatarEls.forEach(img => {
        if (img.src !== absoluteAvatarUrl) {
          img.src = avatarUrl;
        }
      });
      
      const quotedEls = getElementsFallback(['.quoted-avatar'], resolvedId, u.username);
      quotedEls.forEach(img => {
        if (img.src !== absoluteAvatarUrl) {
          img.src = avatarUrl;
        }
      });

      const storyEls = getElementsFallback(['.story-avatar'], resolvedId, u.username);
      storyEls.forEach(img => {
        if (img.src !== absoluteAvatarUrl) {
          img.src = avatarUrl;
        }
      });

      // Update gifts in wall
      const giftsEls = getElementsFallback(['.user-gifts-container'], resolvedId, u.username);
      giftsEls.forEach(el => {
        const giftHtml = (u.gifts && u.gifts.length > 0) ? `<img src="${u.gifts[0]}" style="height: 16px; width: auto;" title="هدية">` : '';
        if (el.innerHTML !== giftHtml) {
          el.innerHTML = giftHtml;
        }
      });

      // Update colors
      const ucol = u.ucol || '#000000';
      const fontColor = u.fontColor || '#000000';
      
      const isBgImage = (u.bg && u.bg !== 'transparent' && (u.bg.startsWith('http') || u.bg.startsWith('/'))) ? true : false;
      const bgValue = (u.bg && u.bg !== 'transparent') ? u.bg : 'transparent';

      const usernameEls = getElementsFallback(['.message-username', '.private-msg-username', '.wall-post-username', '.quick-chat-username'], resolvedId, u.username);
      usernameEls.forEach(el => {
        el.style.setProperty('color', ucol,);
        if (isBgImage) {
          el.style.setProperty('background', 'none', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
          el.style.setProperty('background-image', `url('${bgValue}')`, 'important');
          el.style.setProperty('background-position', 'center', 'important');
          el.style.setProperty('background-size', 'cover', 'important');
          el.style.setProperty('background-repeat', 'no-repeat', 'important');
        } else {
          el.style.setProperty('background-image', 'none', 'important');
          el.style.setProperty('background-color', bgValue, 'important');
          el.style.setProperty('background', bgValue, 'important');
        }
        el.style.setProperty('padding', '0 4px', 'important');
        el.style.setProperty('border-radius', '2px', 'important');
        el.innerHTML = u.topic || u.username;
      });
      
      const quotedUsernameEls = getElementsFallback(['.quoted-username'], resolvedId, u.username);
      quotedUsernameEls.forEach(el => {
        el.style.color = ucol;
        el.innerHTML = u.topic || u.username;
      });

      const micLabelEls = getElementsFallback(['.mic-user-label'], resolvedId, u.username);
      micLabelEls.forEach(el => {
        el.textContent = u.topic || u.username;
        const parentBtn = el.closest('.btn-mic');
        if (parentBtn) {
          parentBtn.title = u.topic || u.username;
        }
      });

      const msgTextEls = getElementsFallback(['.message-text'], resolvedId, u.username);
      msgTextEls.forEach(el => {
        el.style.color = fontColor;
      });

      // Update profile modal if open
      if (profileUser && (profileUser.username === u.username || (profileUser.id && profileUser.id === (u.userId ?? u.id)))) {
        profileUser = { ...profileUser, ...u };
        window.profileUser = profileUser;
        if (typeof window.renderProfileCover === 'function') {
          window.renderProfileCover(u.cover, profileUser);
        }
        
        const profileLikesCount = document.getElementById('profile-likes-count');
        if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(u.likes);
        const likesBtnCount = document.getElementById('profile-likes-count-btn');
        if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(u.likes);
        
        const profileRepCount = document.getElementById('profile-rep-count');
        if (profileRepCount) profileRepCount.innerText = formatCompactNumber(u.rep);
        const repBtnCount = document.getElementById('profile-rep-count-btn');
        if (repBtnCount) repBtnCount.innerText = formatCompactNumber(u.rep);

        const verifiedBadge = document.getElementById('profile-verified-badge');
        if (verifiedBadge) {
          verifiedBadge.classList.toggle('d-none', !u.isVerified);
        }
      }

      document.querySelectorAll(`.mic-user-name[data-username="${u.username}"]`).forEach(el => {
        el.style.setProperty('color', ucol, 'important');
        if (isBgImage && !u.superIcon) {
          el.style.setProperty('background', 'none', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
          el.style.setProperty('background-image', `url('${bgValue}')`, 'important');
          el.style.setProperty('background-position', 'center', 'important');
          el.style.setProperty('background-size', 'cover', 'important');
          el.style.setProperty('background-repeat', 'no-repeat', 'important');
        } else {
          el.style.setProperty('background-image', 'none', 'important');
          el.style.setProperty('background-color', bgValue, 'important');
          el.style.setProperty('background', bgValue, 'important');
        }
        el.innerText = u.topic || u.username;
      });
    }
  });

  const onlineUsers = users.filter(u => u.isOnline || u.isGhost);

  const landingItems = onlineUsers.map(u => {
    const selectedCountry = (u.profileCountry || u.country || '')
      .toString()
      .trim()
      .toLowerCase();

    const countryCode = selectedCountry && selectedCountry !== 'unknown'
      ? selectedCountry
      : null;
    let statusColor = '#6c757d'; // Offline (gray)
    if (u.isOnline) {
      if (u.isVirtualUser && u.onlineStatusStr) {
        if (u.onlineStatusStr === 'أخضر') statusColor = '#28a745';
        else if (u.onlineStatusStr === 'أحمر') statusColor = '#dc3545';
        else if (u.onlineStatusStr === 'أصفر') statusColor = '#ffc107';
        else if (u.onlineStatusStr === 'أزرق') statusColor = '#007bff';
        else statusColor = '#6c757d';
      } else if (u.isGhost) {
        statusColor = '#6c757d'; // Ghost (gray)
      } else if (u.isHidden) {
        statusColor = '#007bff'; // Hidden (blue)
      } else if (u.isReconnecting) {
        statusColor = '#ffc107'; // Reconnecting (yellow)
      } else {
        statusColor = (u.isIdle || u.presenceState === 'idle') ? '#ffc107' : '#28a745'; // Idle (yellow) or Active (green)
      }
    }
    
    const appearance = window.siteAppearance || window.domainConfig;
    const rawLandingStatusVal = appearance ? appearance.showStatusOnLanding : undefined;
    const showStatusColorOnLanding =
      rawLandingStatusVal === true ||
      rawLandingStatusVal === 'true' ||
      rawLandingStatusVal === 1 ||
      rawLandingStatusVal === '1';

    const hasDesign = !!(u.membershipFrame || u.membershipBg);
    const showAvatar = u.showMembershipAvatar !== false;
    const showName = u.showMembershipName !== false;
    const showStatusText = u.showMembershipStatus !== false;

    const isActuallyOnline = u.isOnline && !u.isGhost;
    const isYellow = statusColor === '#ffc107';
    const borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;

    const landingStatusBorderDesign = showStatusColorOnLanding
      ? `border-left: 5px solid ${borderColor} !important;`
      : '';

    const landingStatusBorderDefault = showStatusColorOnLanding
      ? `border-left: 4px solid ${borderColor} !important;`
      : '';

    const ghostStyle = (showStatusColorOnLanding && u.isGhost)
      ? 'border-left: 4px solid #808080 !important;'
      : '';

    let html = '';

    if (hasDesign) {
      const avatarHtml = window.renderAvatar(u, '', 'width: 72px; height: 72px;');
      const bgStyle = u.membershipBg ? `background: url('${u.membershipBg}'); background-size: cover; background-position: center;` : 'background: #fff;';
      const textColor = u.membershipBg ? '#fff' : (u.ucol || '#000');
      const textShadow = '';
      
      const isClickable = !!state.currentUser;
      html = `
      <div id="landing-user-${u.username}" class="list-group-item d-flex align-items-center border-0 border-bottom p-0 user-pro-item ${isClickable ? 'js-user-profile-btn' : ''} ${u.isGhost ? 'ghost-user' : ''}" ${isClickable ? `data-username="${escapeHTML(u.username)}"` : ''} data-user-id="${u.userId ?? u.id}" style="${landingStatusBorderDesign} min-height: 90px; ${bgStyle} ${textShadow} ${ghostStyle} overflow: hidden; position: relative;">
        ${showAvatar ? `
        <div style="margin: 5px 10px; flex-shrink: 0; z-index: 1;">
          ${avatarHtml}
        </div>
        ` : ''}
        <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">
          ${showName ? `
          <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">
            ${window.renderUserIdentity(u, {
                containerClasses: 'user-addon-container font-weight-bold',
                nameStyle: `color: ${u.ucol || textColor};`
            })}
          </div>
          ` : ''}
          ${showStatusText ? `
          <div class="user-sidebar-status fw-bold" style="color: ${(window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888'}; width: 100%; display: block;">
            ${u.msg || (u.type === 'guest' ? 'زائر' : 'عضو')}
          </div>
          ` : ''}
        </div>
        <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">
          ${(u.showMembershipFlag !== false && countryCode) ? `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">` : ''}
          ${(u.userId && u.showMembershipId !== false) ? `<span style="font-size: 11px; font-weight: 700; color: ${u.membershipBg ? '#fff' : '#6c757d'}; letter-spacing: 0.5px;">#${Math.abs(Number(u.userId))}</span>` : ''}
        </div>
      </div>
    `;
    } else {
      const isClickable = !!state.currentUser;
      const rawId = u.userId ?? u.id;
      const displayId = (rawId && !isNaN(Number(rawId))) ? `#${Math.abs(Number(rawId))}` : '';
      html = `
      <div id="landing-user-${u.username}" class="list-group-item d-flex align-items-start border-0 border-bottom p-0 ${isClickable ? 'js-user-profile-btn' : ''}" ${isClickable ? `data-username="${escapeHTML(u.username)}"` : ''} data-user-id="${u.userId ?? u.id}" style="${landingStatusBorderDefault} min-height: 52px; background-color: #fff; ${ghostStyle}; cursor: default; position: relative;">
        <div>
          <img src="${window.getAvatarUrl(u)}" style="width: 50px; height: 50px; object-fit: cover;" referrerPolicy="origin-when-cross-origin">
        </div>
        <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">
          <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">
            ${window.renderUserIdentity(u, {
                containerClasses: 'user-addon-container font-weight-bold',
                nameStyle: `color: ${u.ucol || '#000000'}; font-family: var(--font-family);`
            })}
          </div>
          ${showStatusText ? `
          <div class="user-sidebar-status fw-bold" style="color: ${(window.featuresSettings?.statusColorEnabled === true && u.mcol) ? u.mcol : '#888'}; width: 100%; display: block;">
            ${u.msg || (u.isOnline ? 'متصل الآن' : 'غير متصل')}
          </div>
          ` : ''}
        </div>
        <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">
          ${countryCode ? `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">` : ''}
          ${displayId ? `<span style="font-size: 9px; font-weight: 700; color: #6c757d; letter-spacing: 0.5px;">${displayId}</span>` : ''}
        </div>
      </div>
    `;
    }
    
    return { id: `landing-user-${u.username}`, html: html };
  });

  if (!state.currentUser && ui.landingUsersList) {
    syncDOMList(ui.landingUsersList, landingItems);
  }

  // Update music player UI to refresh avatars/names if person playing changed their info
  if (window.musicManager) {
    window.musicManager.updateUI();
  }
}


async function renderSettings(skipLoading = false) {
  if (!state.currentUser) return;
  
  currentSettingsView = 'settings';
  window.renderSettings = renderSettings;
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'الضبط والإعدادات';

  const renderUI = () => {
    const getColorPreviewStyle = (color) => {
      if (!color || color === 'transparent') return 'background-color: transparent;';
      return `background-color: ${color};`;
    };
    const getColorClass = (color) => (!color || color === 'transparent') ? 'transparent' : '';

    ui.sidebarSettingsContainer.innerHTML = `
      <div class="classic-settings-container">
        <div class="settings-content">
          <div class="classic-header">الزخرفه</div>
          <input type="text" id="set-topic" name="profile_decoration_text" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" class="classic-input" value="${state.currentUser.topic || ''}">
          
          <div class="classic-header">الحاله</div>
          <input type="text" id="set-msg" name="profile_status_text" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" class="classic-input" value="${state.currentUser.msg || ''}">
          
          <div class="simple-settings-list">
          <div class="simple-setting-row">
            <div class="simple-setting-label" style="cursor: pointer;" onclick="window.openColorPalette(this.nextElementSibling, 'set-ucol')">لون الإسم</div>
            <div class="simple-color-preview ${getColorClass(state.currentUser.ucol)}" style="${getColorPreviewStyle(state.currentUser.ucol)}" onclick="window.openColorPalette(this, 'set-ucol')"></div>
            <input type="hidden" id="set-ucol" value="${state.currentUser.ucol || '#000000'}">
          </div>
          <div class="simple-setting-row">
            <div class="simple-setting-label" style="cursor: pointer;" onclick="window.openColorPalette(this.nextElementSibling, 'set-fontcol')">لون خط الكتابة</div>
            <div class="simple-color-preview ${getColorClass(state.currentUser.fontColor)}" style="${getColorPreviewStyle(state.currentUser.fontColor)}" onclick="window.openColorPalette(this, 'set-fontcol')"></div>
            <input type="hidden" id="set-fontcol" value="${state.currentUser.fontColor || '#000000'}">
          </div>
          <div class="simple-setting-row">
            <div class="simple-setting-label" style="cursor: pointer;" onclick="window.openColorPalette(this.nextElementSibling, 'set-bg')">لون خلفية الأسم</div>
            <div class="simple-color-preview ${getColorClass(state.currentUser.bg)}" style="${getColorPreviewStyle(state.currentUser.bg)}" onclick="window.openColorPalette(this, 'set-bg')"></div>
            <input type="hidden" id="set-bg" value="${state.currentUser.bg || 'transparent'}">
          </div>
          ${(window.featuresSettings?.statusColorEnabled === true) ? `
          <div class="simple-setting-row">
            <div class="simple-setting-label" style="cursor: pointer;" onclick="window.openColorPalette(this.nextElementSibling, 'set-status-col')">لون الحالة</div>
            <div class="simple-color-preview ${getColorClass(state.currentUser.mcol)}" style="${getColorPreviewStyle(state.currentUser.mcol)}" onclick="window.openColorPalette(this, 'set-status-col')"></div>
            <input type="hidden" id="set-status-col" value="${state.currentUser.mcol || '#000000'}">
          </div>
          ` : ''}
          ${hasPermission('canChangeCountry') ? `
          <div class="simple-setting-row">
            <div class="simple-setting-label">الدولة</div>
            <select id="set-country" class="classic-input">
                <option value="" ${!state.currentUser.profileCountry ? 'selected' : ''}>تلقائي حسب الدولة من IP</option>
                <option value="jo" ${state.currentUser.profileCountry === 'jo' ? 'selected' : ''}>الأردن</option>
                <option value="sa" ${state.currentUser.profileCountry === 'sa' ? 'selected' : ''}>السعودية</option>
                <option value="eg" ${state.currentUser.profileCountry === 'eg' ? 'selected' : ''}>مصر</option>
                <option value="iq" ${state.currentUser.profileCountry === 'iq' ? 'selected' : ''}>العراق</option>
                <option value="ae" ${state.currentUser.profileCountry === 'ae' ? 'selected' : ''}>الإمارات</option>
                <option value="kw" ${state.currentUser.profileCountry === 'kw' ? 'selected' : ''}>الكويت</option>
                <option value="qa" ${state.currentUser.profileCountry === 'qa' ? 'selected' : ''}>قطر</option>
                <option value="bh" ${state.currentUser.profileCountry === 'bh' ? 'selected' : ''}>البحرين</option>
                <option value="om" ${state.currentUser.profileCountry === 'om' ? 'selected' : ''}>عمان</option>
                <option value="ye" ${state.currentUser.profileCountry === 'ye' ? 'selected' : ''}>اليمن</option>
                <option value="sy" ${state.currentUser.profileCountry === 'sy' ? 'selected' : ''}>سوريا</option>
                <option value="lb" ${state.currentUser.profileCountry === 'lb' ? 'selected' : ''}>لبنان</option>
                <option value="ps" ${state.currentUser.profileCountry === 'ps' ? 'selected' : ''}>فلسطين</option>
                <option value="ma" ${state.currentUser.profileCountry === 'ma' ? 'selected' : ''}>المغرب</option>
                <option value="tn" ${state.currentUser.profileCountry === 'tn' ? 'selected' : ''}>تونس</option>
                <option value="dz" ${state.currentUser.profileCountry === 'dz' ? 'selected' : ''}>الجزائر</option>
                <option value="ly" ${state.currentUser.profileCountry === 'ly' ? 'selected' : ''}>ليبيا</option>
                <option value="sd" ${state.currentUser.profileCountry === 'sd' ? 'selected' : ''}>السودان</option>
                <option value="so" ${state.currentUser.profileCountry === 'so' ? 'selected' : ''}>الصومال</option>
                <option value="mr" ${state.currentUser.profileCountry === 'mr' ? 'selected' : ''}>موريتانيا</option>
                <option value="us" ${state.currentUser.profileCountry === 'us' ? 'selected' : ''}>امريكا</option>
                <option value="fr" ${state.currentUser.profileCountry === 'fr' ? 'selected' : ''}>فرنسا</option>
                <option value="gb" ${state.currentUser.profileCountry === 'gb' ? 'selected' : ''}>بريطانيا</option>
                <option value="ar" ${state.currentUser.profileCountry === 'ar' ? 'selected' : ''}>الارجنتين</option>
                <option value="au" ${state.currentUser.profileCountry === 'au' ? 'selected' : ''}>استراليا</option>
                <option value="cn" ${state.currentUser.profileCountry === 'cn' ? 'selected' : ''}>الصين</option>
                <option value="ru" ${state.currentUser.profileCountry === 'ru' ? 'selected' : ''}>روسيا</option>
                <option value="ca" ${state.currentUser.profileCountry === 'ca' ? 'selected' : ''}>كندا</option>
                <option value="br" ${state.currentUser.profileCountry === 'br' ? 'selected' : ''}>البرازيل</option>
                <option value="in" ${state.currentUser.profileCountry === 'in' ? 'selected' : ''}>الهند</option>
                <option value="dj" ${state.currentUser.profileCountry === 'dj' ? 'selected' : ''}>جيبوتي</option>
                <option value="km" ${state.currentUser.profileCountry === 'km' ? 'selected' : ''}>جزر القمر</option>
            </select>
          </div>
          ` : ''}
        </div>

        <button class="classic-btn classic-btn-green sidebar-action" id="save-settings-btn">
          <i class="fas fa-edit btn-icon-left"></i>
          <span>حفظ التغيرات</span>
        </button>
        
        <div class="classic-btn classic-btn-dark p-0 overflow-hidden" style="height: 32px;">
          <select id="set-font-size" class="w-100 h-100 bg-transparent text-white border-0 px-2 text-center" style="appearance: none; cursor: pointer; outline: none;">
            <option value="150" class="text-dark">حجم الخطوط - 150%</option>
            <option value="140" class="text-dark">حجم الخطوط - 140%</option>
            <option value="130" class="text-dark">حجم الخطوط - 130%</option>
            <option value="120" class="text-dark">حجم الخطوط - 120%</option>
            <option value="115" class="text-dark">حجم الخطوط - 115%</option>
            <option value="110" class="text-dark">حجم الخطوط - 110%</option>
            <option value="105" class="text-dark">حجم الخطوط - 105%</option>
            <option value="100" class="text-dark" selected>حجم الخطوط - 100%</option>
            <option value="95" class="text-dark">حجم الخطوط - 95%</option>
            <option value="90" class="text-dark">حجم الخطوط - 90%</option>
            <option value="85" class="text-dark">حجم الخطوط - 85%</option>
            <option value="80" class="text-dark">حجم الخطوط - 80%</option>
            <option value="70" class="text-dark">حجم الخطوط - 70%</option>
            <option value="60" class="text-dark">حجم الخطوط - 60%</option>
            <option value="50" class="text-dark">حجم الخطوط - 50%</option>
          </select>
          <i class="fas fa-chevron-down btn-icon-left"></i>
        </div>

        <button id="settings-upload-btn" class="classic-btn classic-btn-green sidebar-action" onclick="handleSettingsUpload()">
          <img src="${window.getAvatarUrl(state.currentUser)}" class="classic-avatar-small btn-avatar-right settings-avatar-margin">
          <span>تغيير الصورة</span>
          <i class="fas fa-image btn-icon-left"></i>
        </button>

        <button class="classic-btn classic-btn-red sidebar-action" id="delete-pic-btn">
          <img src="${window.getAvatarUrl(state.currentUser)}" class="classic-avatar-small btn-avatar-right settings-avatar-margin">
          <span>حذف الصورة</span>
          <i class="fas fa-ban btn-icon-left"></i>
        </button>

        <div class="settings-group-accordion" id="privacy-group">
          <div class="settings-group-header" onclick="window.toggleSettingsGroup(this)" aria-expanded="false" role="button" tabindex="0">
            <span>🔒 الإشعارات والخصوصية</span>
            <i class="fas fa-chevron-down arrow-icon"></i>
          </div>
          <div class="settings-group-content">
            <div class="classic-settings-toggle-row">
              <div class="toggle-label">
                <i class="fas fa-comment"></i>
                <span>استقبال الرسائل الخاصة</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-private-checkbox" ${state.currentUser.allowPrivate ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>

            ${hasPermission('canUseCamera') ? `
            <div class="classic-settings-toggle-row">
              <div class="toggle-label">
                <i class="fas fa-camera"></i>
                <span>تفعيل الكاميرا</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-camera-checkbox" ${state.currentUser.allowCamera !== false ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
            ` : ''}

            <div class="classic-settings-toggle-row">
              <div class="toggle-label">
                <i class="fas fa-envelope"></i>
                <span>استقبال التنبيهات</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-notifications-checkbox" ${state.currentUser.allowAlerts ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>

            <div class="classic-settings-toggle-row">
              <div class="toggle-label">
                <i class="fas fa-volume-mute"></i>
                <span>كتم صوت الإشعارات</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-mute-notifications-checkbox" ${(localStorage.getItem('muteNotificationSounds') === 'true' || state.currentUser?.muteNotificationSounds === true) ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>

            ${!(state.currentUser.isGuest || state.currentUser.type === 'guest') ? `
            <button class="classic-btn classic-btn-orange sidebar-action" id="change-password-trigger-btn" style="margin-top: 10px; margin-bottom: 10px;">
              <span>تغيير كلمة المرور</span>
              <i class="fas fa-key btn-icon-left"></i>
            </button>
            ` : ''}
          </div>
        </div>

        ${(window.featuresSettings?.sidebarAddonsEnabled === true || hasPermission('canUseAddons') || hasPermission('canManageAddons') || hasPermission('canviewsvisitprofile')) ? `
        <button class="classic-btn classic-btn-white sidebar-action" onclick="renderAddons()">
          <i class="fas fa-plus btn-icon-left"></i>
          <span>الإضافات</span>
        </button>
        ` : ''}

        ${hasPermission('canSendBroadcastMessages') ? `
        <button class="classic-btn classic-btn-white sidebar-action" onclick="sendPublicAlert()">
          <i class="fas fa-paper-plane btn-icon-left"></i>
          <span>إرسال إعلان</span>
        </button>
        ` : ''}

        ${(hasPermission('canManageRooms') || (window.roomsData && window.roomsData[state.currentRoomId] && (window.roomsData[state.currentRoomId].ownerId === state.currentUser.id || (window.roomsData[state.currentRoomId].moderators || []).some(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)))))) ? `
        <button class="classic-btn classic-btn-blue sidebar-action" onclick="openEditRoomModal()">
          <i class="fas fa-cog btn-icon-left"></i>
          <span>إدارة الغرفة الحالية</span>
        </button>
        ` : ''}
      </div>
      <div class="settings-footer" style="padding: 10px; border-top: 1px solid #000; background: #eee;">
        ${hasPermission('canAccessAdminPanel') ? `
          <button class="classic-btn classic-btn-white sidebar-action" onclick="openAdminPanel()">
            <i class="fas fa-star btn-icon-left"></i>
            <span>لوحه التحكم</span>
          </button>
        ` : ''}
        <button class="classic-btn classic-btn-red sidebar-action" id="settings-logout-btn">
          <i class="fas fa-sign-out-alt btn-icon-left"></i>
          <span>تسجيل خروج</span>
        </button>
      </div>
    </div>
  `;

  // Event Listeners
  ui.settingsUploadBtn = document.getElementById('settings-upload-btn');
  if (document.getElementById('save-settings-btn')) document.getElementById('save-settings-btn').onclick = saveSettings;
  document.getElementById('delete-pic-btn').onclick = () => updateUserSettings({ pic: null }, true);
  const changePwdTriggerBtn = document.getElementById('change-password-trigger-btn');
  if (changePwdTriggerBtn) {
    changePwdTriggerBtn.onclick = () => renderChangePasswordView();
  }
  const fontSizeSelect = document.getElementById('set-font-size');
  if (fontSizeSelect) {
    // Set initial value based on saved preference
    const savedFontSize = sessionStorage.getItem('userFontSize') || '100';
    fontSizeSelect.value = savedFontSize;
    
    fontSizeSelect.onchange = (e) => {
      sessionStorage.setItem('userFontSize', e.target.value);
      applyUserFontSize();
    };
  }
  document.getElementById('settings-logout-btn').onclick = () => {
    Swal.fire({
      title: 'تسجيل الخروج',
      text: 'هل أنت متأكد من تسجيل الخروج؟',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'نعم',
      cancelButtonText: 'إلغاء'
    }).then((result) => {
      if (result.isConfirmed) {
        logout();
      }
    });
  };
  const togglePrivateCheckbox = document.getElementById('toggle-private-checkbox');
  if (togglePrivateCheckbox) {
    togglePrivateCheckbox.onchange = (e) => {
      updateUserSettings({ allowPrivate: e.target.checked }, true);
    };
  }

  const toggleNotificationsCheckbox = document.getElementById('toggle-notifications-checkbox');
  if (toggleNotificationsCheckbox) {
    toggleNotificationsCheckbox.onchange = (e) => {
      updateUserSettings({ allowAlerts: e.target.checked }, true);
    };
  }

  const toggleCameraCheckbox = document.getElementById('toggle-camera-checkbox');
  if (toggleCameraCheckbox) {
    toggleCameraCheckbox.onchange = (e) => {
      updateUserSettings({ allowCamera: e.target.checked }, true);
    };
  }

  const muteCheckbox = document.getElementById('toggle-mute-notifications-checkbox');
  if (muteCheckbox) {
    muteCheckbox.addEventListener('change', (e) => {
      const isMuted = e.target.checked;
      localStorage.setItem('muteNotificationSounds', isMuted ? 'true' : 'false');
      if (state.currentUser) {
        state.currentUser.muteNotificationSounds = isMuted;
        updateUserSettings({ muteNotificationSounds: isMuted }, true);
      }
    });
  }
  };

  // Render immediately
  renderUI();
}

function renderChangePasswordView() {
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'تغيير كلمة المرور';
  currentSettingsView = 'change-password';

  ui.sidebarSettingsContainer.innerHTML = `
    <div class="classic-settings-container">
      <div class="settings-content">
        <div class="classic-header">كلمة المرور الحالية</div>
        <input type="password" id="current-password-input" class="classic-input text-center" placeholder="••••••••">

        <div class="classic-header">كلمة المرور الجديدة</div>
        <input type="password" id="new-password-input" class="classic-input text-center" placeholder="••••••••">

        <div class="classic-header">تأكيد كلمة المرور </div>
        <input type="password" id="confirm-password-input" class="classic-input text-center" placeholder="••••••••">
      </div>

      <button class="classic-btn classic-btn-green sidebar-action" id="save-password-btn">
        <i class="fas fa-save btn-icon-left"></i>
        <span>تحديث كلمة المرور</span>
      </button>

      <button class="classic-btn classic-btn-white sidebar-action" id="cancel-password-btn">
        <i class="fas fa-arrow-right btn-icon-left"></i>
        <span>رجوع</span>
      </button>
    </div>
  `;

  document.getElementById('cancel-password-btn').onclick = () => {
    renderSettings();
  };

  document.getElementById('save-password-btn').onclick = async () => {
    const currentPasswordInput = document.getElementById('current-password-input');
    const newPasswordInput = document.getElementById('new-password-input');
    const confirmPasswordInput = document.getElementById('confirm-password-input');

    const currentPassword = currentPasswordInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    if (!currentPassword) {
      if (window.classicAlert) {
        window.classicAlert('يرجى إدخال كلمة المرور الحالية', 'خطأ');
      } else {
        alert('يرجى إدخال كلمة المرور الحالية');
      }
      return;
    }

    if (!newPassword) {
      if (window.classicAlert) {
        window.classicAlert('يرجى إدخال كلمة المرور الجديدة', 'خطأ');
      } else {
        alert('يرجى إدخال كلمة المرور الجديدة');
      }
      return;
    }

    if (newPassword.length < 4) {
      if (window.classicAlert) {
        window.classicAlert('يجب أن لا تقل كلمة المرور الجديدة عن 4 أحرف', 'خطأ');
      } else {
        alert('يجب أن لا تقل كلمة المرور الجديدة عن 4 أحرف');
      }
      return;
    }

    if (newPassword !== confirmPassword) {
      if (window.classicAlert) {
        window.classicAlert('كلمتا المرور غير متطابقتين', 'خطأ');
      } else {
        alert('كلمتا المرور غير متطابقتين');
      }
      return;
    }

    const saveBtn = document.getElementById('save-password-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin btn-icon-left"></i><span>جاري الحفظ...</span>';

    try {
      const token = getToken();
      const response = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 
            'Authorization': `Bearer ${token}`,
            'X-Chat-Token': token 
          } : {})
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        // Token is rotated on password change — persist the new one so the
        // current session stays valid and the leaked old token is discarded.
        if (data.token) {
          try { sessionStorage.setItem('token', data.token); } catch (e) {}
        }
        if (window.classicAlert) {
          window.classicAlert(data.message || 'تم تغيير كلمة المرور بنجاح', 'تنبيه');
        } else {
          alert('تم تغيير كلمة المرور بنجاح');
        }
        renderSettings();
      } else {
        if (window.classicAlert) {
          window.classicAlert(data.message || 'حدث خطأ أثناء تغيير كلمة المرور', 'خطأ');
        } else {
          alert(data.message || 'حدث خطأ أثناء تغيير كلمة المرور');
        }
      }
    } catch (err) {
      console.error('Request error:', err);
      if (window.classicAlert) {
        window.classicAlert('حدث خطأ في الاتصال بالسيرفر', 'خطأ');
      } else {
        alert('حدث خطأ في الاتصال بالسيرفر');
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save btn-icon-left"></i><span>تحديث كلمة المرور</span>';
    }
  };
}

async function saveSettings() {
  const settings = {
    topic: document.getElementById('set-topic').value,
    msg: document.getElementById('set-msg').value,
    ucol: document.getElementById('set-ucol').value,
    fontColor: document.getElementById('set-fontcol').value,
    bg: document.getElementById('set-bg').value,
    mcol: document.getElementById('set-status-col') ? document.getElementById('set-status-col').value : state.currentUser.mcol,
    profileCountry: document.getElementById('set-country') ? document.getElementById('set-country').value : state.currentUser.profileCountry
  };
  
  await updateUserSettings(settings);
}

window.openColorPalette = function(element, currentId) {
  const rect = element.getBoundingClientRect();
  const colors = [
    'transparent', 
    // Grays
    '#ffffff', '#f2f2f2', '#e6e6e6', '#cccccc', '#b3b3b3', '#999999', '#808080', '#666666', '#4d4d4d', '#333333', '#1a1a1a', '#000000',
    // Reds
    '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828', '#b71c1c',
    // Pinks
    '#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a', '#e91e63', '#d81b60', '#c2185b', '#ad1457', '#880e4f',
    // Purples
    '#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c',
    // Deep Purples
    '#ede7f6', '#d1c4e9', '#b39ddb', '#9575cd', '#7e57c2', '#673ab7', '#5e35b1', '#512da8', '#4527a0', '#311b92',
    // Indigo
    '#e8eaf6', '#c5cae9', '#9fa8da', '#7986cb', '#5c6bc0', '#3f51b5', '#3949ab', '#303f9f', '#283593', '#1a237e',
    // Blue
    '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1',
    // Light Blue
    '#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4', '#039be5', '#0288d1', '#0277bd', '#01579b',
    // Cyan
    '#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1', '#0097a7', '#00838f', '#006064',
    // Teal
    '#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688', '#00897b', '#00796b', '#00695c', '#004d40',
    // Green
    '#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#43a047', '#388e3c', '#2e7d32', '#1b5e20',
    // Light Green
    '#f1f8e9', '#dcedc8', '#c5e1a5', '#aed581', '#9ccc65', '#8bc34a', '#7cb342', '#689f38', '#558b2f', '#33691e',
    // Lime
    '#f9fbe7', '#f0f4c3', '#e6ee9c', '#dce775', '#d4e157', '#cddc39', '#c0ca33', '#afb42b', '#9e9d24', '#827717',
    // Yellow
    '#fffde7', '#fff9c4', '#fff59d', '#fff176', '#ffee58', '#ffeb3b', '#fdd835', '#fbc02d', '#f9a825', '#f57f17',
    // Amber
    '#fff8e1', '#ffecb3', '#ffe082', '#ffd54f', '#ffca28', '#ffc107', '#ffb300', '#ffa000', '#ff8f00', '#ff6f00',
    // Orange
    '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100',
    // Deep Orange
    '#fbe9e7', '#ffccbc', '#ffab91', '#ff8a65', '#ff7043', '#ff5722', '#f4511e', '#e64a19', '#d84315', '#bf360c',
    // Brown
    '#efebe9', '#d7ccc8', '#bcaaa4', '#a1887f', '#8d6e63', '#795548', '#6d4c41', '#5d4037', '#4e342e', '#3e2723',
    // Blue Gray
    '#eceff1', '#cfd8dc', '#b0bec5', '#90a4ae', '#78909c', '#607d8b', '#546e7a', '#455a64', '#37474f', '#263238'
  ];

  // Remove existing popovers
  const existing = document.querySelector('.color-palette-popover');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.className = 'color-palette-popover';
  
  // Calculate position
  const popoverWidth = 8 * 27 + 12; // 8 columns * (24px + 3px gap) + padding
  let left = rect.left;
  let top = rect.bottom + 5;

  // Ensure it doesn't go off the right edge
  if (left + popoverWidth > window.innerWidth) {
    left = window.innerWidth - popoverWidth - 15;
  }
  // Ensure it doesn't go off the left edge
  if (left < 10) left = 10;

  // Ensure it doesn't go off the bottom edge
  const estimatedHeight = 300; // rough estimate
  if (top + estimatedHeight > window.innerHeight) {
    top = rect.top - estimatedHeight - 5;
    if (top < 10) top = 10;
  }

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  colors.forEach(color => {
    const div = document.createElement('div');
    div.className = 'palette-color' + (color === 'transparent' ? ' transparent' : '');
    if (color !== 'transparent') div.style.backgroundColor = color;
    div.onclick = () => {
      const input = document.getElementById(currentId);
      input.value = color;
      element.style.backgroundColor = color === 'transparent' ? 'transparent' : color;
      if (color === 'transparent') element.classList.add('transparent');
      else element.classList.remove('transparent');
      popover.remove();
    };
    popover.appendChild(div);
  });

  document.body.appendChild(popover);

  const closeHandler = (e) => {
    if (!popover.contains(e.target) && e.target !== element) {
      popover.remove();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
};

window.applyRoomMessagesNightMode = function() {
  // Deprecated/Removed in favor of global dark mode
};

async function updateUserSettings(data, silent = false) {
  try {
    const token = getToken();
    const res = await apiFetch('/api/users/settings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 
            'Authorization': `Bearer ${token}`,
            'X-Chat-Token': token 
        } : {})
      },
      body: JSON.stringify(data)
    });
    
    // apiFetch handles 401 and !ok, so if it returns, it's successful or a handled 401
    if (res.ok) {
      const result = await res.json();
      const currentUser = state.currentUser || {};
      const returnedUser = result.user || {};
      const oldRoomId = currentUser.roomId ?? 0;

      // Safely merge group to ensure group permissions are not dropped
      let mergedGroup = currentUser.group;
      if (returnedUser.group) {
        mergedGroup = currentUser.group ? { ...currentUser.group, ...returnedUser.group } : returnedUser.group;
      }

      const normalizedUser = {
        ...currentUser,
        ...returnedUser,
        id: returnedUser.id ?? returnedUser.userId ?? currentUser.id ?? currentUser.userId,
        userId: returnedUser.userId ?? returnedUser.id ?? currentUser.userId ?? currentUser.id,
        roomId: returnedUser.roomId ?? oldRoomId,
        roleRank: returnedUser.roleRank ?? (returnedUser.group && returnedUser.group.roleRank !== undefined ? returnedUser.group.roleRank : (currentUser.roleRank ?? (currentUser.group && currentUser.group.roleRank))),
        roleName: returnedUser.roleName ?? currentUser.roleName ?? (currentUser.group && currentUser.group.roleName),
        roleIcon: returnedUser.roleIcon ?? currentUser.roleIcon ?? (currentUser.group && currentUser.group.roleIcon),
        superIcon: returnedUser.superIcon ?? currentUser.superIcon,
        ...(mergedGroup ? { group: mergedGroup } : {})
      };

      if (normalizedUser.group && normalizedUser.group.roleRank !== undefined && (normalizedUser.roleRank === undefined || normalizedUser.roleRank === null)) {
        normalizedUser.roleRank = normalizedUser.group.roleRank;
      }

      // Guard: Preserve top-level role permissions (e.g. canKickUsers, canBanUsers, canMuteUsers, etc.)
      for (const key of Object.keys(currentUser)) {
        if (key.startsWith('can') && normalizedUser[key] === undefined) {
          normalizedUser[key] = currentUser[key];
        }
      }
      
      state.setCurrentUser(normalizedUser);

      // Update the user inside state.currentUsers array so that future messages and online list use the exact new styling instantly
      if (state.currentUsers && Array.isArray(state.currentUsers)) {
        const index = state.currentUsers.findIndex(u => Number(u.id || u.userId) === Number(normalizedUser.id) || u.username === normalizedUser.username);
        if (index !== -1) {
          state.currentUsers[index] = {
            ...state.currentUsers[index],
            ...normalizedUser
          };
          if (typeof updateUsersList === 'function') {
            updateUsersList(state.currentUsers);
          }
        }
      }
      
      // Update visuals everywhere (Wall, Chat, Stories, etc.)
      updateUserVisuals([normalizedUser]);
      
      if (!silent) {
        Swal.fire('نجاح', 'تم حفظ الإعدادات بنجاح', 'success');
        renderSettings();
      } else {
        const avatarUrl = window.getAvatarUrl(normalizedUser);
        document.querySelectorAll('.btn-avatar-right').forEach(img => {
          img.src = avatarUrl;
        });
      }
      
      if (window.voiceManager) {
        window.voiceManager.updateUser(normalizedUser);
      }
      
      if (window.fetchStories) {
        window.fetchStories();
      }
    }
  } catch (error) {
    const errorMsg = error.message;
    
    // If it's a likes limit error, apiFetch already showed a pretty alert
    if (errorMsg && (errorMsg.includes('لايك') || errorMsg.includes('requiredLikes'))) {
        return;
    }

    if (!silent) {
      Swal.fire('عذراً', errorMsg, 'error');
    } else {
      showToast('فشل الحفظ: ' + errorMsg);
    }
  }
}

window.openAdminPanel = () => {
  const token = getToken();
  window.open(`/cp?token=${token}`, '_blank');
};

window.sendPublicAlert = () => {
  Swal.fire({
    title: 'إرسال إعلان عام',
    input: 'textarea',
    inputLabel: 'نص الإعلان',
    inputPlaceholder: 'اكتب نص الإعلان هنا...',
    showCancelButton: true,
    confirmButtonText: 'إرسال',
    cancelButtonText: 'إلغاء',
    inputValidator: (value) => {
      if (!value) {
        return 'يرجى كتابة نص الإعلان!';
      }
    }
  }).then((result) => {
    if (result.isConfirmed) {
      socket.emit('public-alert', { text: result.value });
    }
  });
};

// User Profile Modal Logic
var profileModalEl = document.getElementById('userProfileModal');
var profileModal = profileModalEl ? new bootstrap.Modal(profileModalEl) : null;
const reportUserModal = new bootstrap.Modal(document.getElementById('reportUserModal'), {
  backdrop: 'static',
  keyboard: true
});
profileUser = profileUser || null;
window.getCurrentProfileUser = function () {
  return profileUser;
};
let profileListenersAttached = false;

window.showUserProfile = showUserProfile;

function initProfileModalListeners() {
  if (profileListenersAttached) return;
  
  const btnEditCover = document.getElementById('btn-edit-cover');
  const coverUploadInput = document.getElementById('cover-upload-input');
  
  if (btnEditCover && coverUploadInput) {
    btnEditCover.addEventListener('click', () => {
      coverUploadInput.click();
    });
    
    coverUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const uploadRes = await fetch('/api/upload/cover', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: formData
        });
        
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          
          // Update user settings
          const updateRes = await fetch('/api/users/settings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ cover: url })
          });
          
          if (updateRes.ok) {
            const newCoverUrl = url;
            state.currentUser.cover = newCoverUrl;

            if (state && Array.isArray(state.currentUsers)) {
              state.currentUsers.forEach(u => {
                if (u.id === state.currentUser.id || u.userId === state.currentUser.id) {
                  u.cover = newCoverUrl;
                }
              });
            }

            if (typeof presenceUsersMap !== 'undefined' && presenceUsersMap) {
              const userKey = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(state.currentUser) : `member:${state.currentUser.id}`;
              presenceUsersMap.forEach((u, k) => {
                if (k === userKey || u.id === state.currentUser.id || u.userId === state.currentUser.id) {
                  u.cover = newCoverUrl;
                }
              });
            }

            if (window.profileUser && (window.profileUser.id === state.currentUser.id || window.profileUser.userId === state.currentUser.id)) {
              window.profileUser.cover = newCoverUrl;
              profileUser = window.profileUser;
            }

            if (typeof window.renderProfileCover === 'function') {
              window.renderProfileCover(newCoverUrl, state.currentUser, true);
            }

            Swal.fire('نجاح', 'تم تحديث صورة الغلاف بنجاح', 'success');
          } else {
            const err = await updateRes.json().catch(() => ({ message: 'فشل تحديث صورة الغلاف' }));
            Swal.fire('عذراً', err.message, 'error');
          }
        } else {
          const err = await uploadRes.json().catch(() => ({ message: 'فشل رفع الصورة' }));
          Swal.fire('عذراً', err.message, 'error');
        }
      } catch (err) {
        console.error('Error uploading cover:', err);
        Swal.fire('عذراً', 'حدث خطأ في الاتصال بالسيرفر أثناء رفع الصورة', 'error');
      }
    });
  }
  
  profileListenersAttached = true;
}

function updateProfileButtons(user, likeThreshold) {
  const btnPrivate = document.getElementById('btn-profile-private');
  const btnAlert = document.getElementById('btn-profile-alert');
  const btnLikes = document.getElementById('btn-profile-likes');
  const btnDelPic = document.getElementById('btn-profile-del-pic');
  const btnReveal = document.getElementById('btn-profile-reveal');
  const btnGift = document.getElementById('btn-profile-gift');
  const btnMuteRoom = document.getElementById('btn-profile-mute-room');
  const btnMuteGlobal = document.getElementById('btn-profile-mute-global');
  const btnBanner = document.getElementById('btn-profile-banner');
  const btnKickRoom = document.getElementById('btn-profile-kick-room');
  const btnKick = document.getElementById('btn-profile-kick');
  const btnBanRoom = document.getElementById('btn-profile-ban-room');
  const btnBan = document.getElementById('btn-profile-ban');
  const btnModRoom = document.getElementById('btn-profile-mod-room');
  const btnKickGlobal = document.getElementById('btn-profile-kick-global');
  const btnBanPermanent = document.getElementById('btn-profile-ban-permanent');
  const btnBanTemporary = document.getElementById('btn-profile-ban-temporary');
  const btnReport = document.getElementById('btn-profile-report');
  const btnIgnore = document.getElementById('btn-profile-ignore');
  const btnKiss = document.getElementById('btn-profile-kiss');

  // Default visibility
  const isSelf = state.currentUser && state.currentUser.username === user.username;
    const targetRank = user.roleRank || (user.group && user.group.roleRank) || 0;
  const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
  const canAffect = myRank > targetRank && !isSelf; // Current system logic
  const canAffectTargetByRank = myRank > targetRank; // Standard rank comparison
  
  // New strict check requested: targetRank >= myRank means no admin access at all unless Root (except if self)
  const isTargetHigherRank = !isSelf && targetRank >= myRank;

  const currentUserId = Number(state.currentUser?.id || state.currentUser?.userId);
  const targetUserId = Number(user.id || user.userId);

  const isPrimaryFounder = currentUserId === 1;
  const isFounderGroupTarget =
    targetUserId !== 1 &&
    Number(user.groupId || user.group?.id) === 1;

  const canManageMembershipTarget =
    !isSelf &&
    (
      myRank > targetRank ||
      (isPrimaryFounder && isFounderGroupTarget)
    );

  if (btnPrivate) btnPrivate.classList.toggle('d-none', false);
  if (btnAlert) {
    const effectiveLikeThreshold = (window.featuresSettings && window.featuresSettings.likes_notifications !== undefined)
      ? window.featuresSettings.likes_notifications
      : likeThreshold;
    const canSendNotif = hasPermission('canSendNotifications') && ((state.currentUser.likes || 0) >= effectiveLikeThreshold);
    btnAlert.classList.toggle('d-none', !canSendNotif || isSelf);
  }
  if (btnLikes) btnLikes.classList.toggle('d-none', false);
  
  const btnRep = document.getElementById('btn-profile-rep');
  if (btnRep) btnRep.classList.toggle('d-none', false);

  if (btnDelPic) {
    const hasAnyPicPermission = hasPermission('canDeleteUserProfilePicture') || 
                                 hasPermission('canDeleteUserCoverPicture') || 
                                 hasPermission('canDeleteUserMembershipFrame') || 
                                 hasPermission('canDeleteUserMembershipBg') ||
                                 hasPermission('canEditUsers') ||
                                 hasPermission('canDesignMembership');
    btnDelPic.classList.toggle('d-none', !hasAnyPicPermission || isTargetHigherRank || (!canAffect && !isSelf));
  }
  if (btnReveal) btnReveal.classList.toggle('d-none', !hasPermission('canViewNicknameHistory') || (!canAffect && !isSelf));
  if (btnGift) btnGift.classList.toggle('d-none', !hasPermission('canSendGifts') || user.type === 'guest' || !!user.superIcon || (!canAffect && !isSelf));
  
  if (btnMuteRoom) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canMute = hasPermission('canMuteUsers') || (isModerator && roomPermissions.includes('canMuteUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;
    btnMuteRoom.classList.toggle('d-none', true); // Force hidden for unified UI
    btnMuteRoom.innerHTML = user.isMutedRoom ? '<span>فك الإسكات (غرفة)</span> <i class="fas fa-microphone"></i>' : '<span>إسكات (غرفة)</span> <i class="fas fa-microphone-slash"></i>';
  }
  if (btnMuteGlobal) {
    btnMuteGlobal.classList.toggle('d-none', true); // Force hidden for unified UI
    btnMuteGlobal.innerHTML = (user.isMutedWall || user.isMuted) ? '<span>فك الإسكات</span> <i class="fas fa-microphone"></i>' : '<span>إسكات</span> <i class="fas fa-microphone-slash"></i>';
  }

  const btnMute = document.getElementById('btn-profile-mute');
  if (btnMute) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    
    const canMuteRoomStatus = hasPermission('canMuteUsers') || (isModerator && roomPermissions.includes('canMuteUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;
    const showMuteRoom = canMuteRoomStatus && canAffect && isSameRoom;
    
    const showMuteGlobal = hasPermission('canMuteUsers') && canAffect;

    const shouldShowMute = !isSelf && (showMuteRoom || showMuteGlobal);
    btnMute.classList.toggle('d-none', !shouldShowMute);

    if (shouldShowMute) {
      const isRoomMuted = user.isMutedRoom === true || user.isMutedRoom === 'true';
      const isWallMuted = user.isMutedWall === true || user.isMutedWall === 'true' || user.isMuted === true || user.isMuted === 'true';
      const isUserMuted = isRoomMuted || isWallMuted;

      if (isUserMuted) {
        btnMute.innerHTML = '<span>فك الإسكات</span> <i class="fas fa-microphone"></i>';
        btnMute.style.setProperty('background', '#28a745', 'important');
        btnMute.style.setProperty('color', '#fff', 'important');
      } else {
        btnMute.innerHTML = '<span>إسكات</span> <i class="fas fa-microphone-slash"></i>';
        btnMute.style.setProperty('background', '#17a2b8', 'important');
        btnMute.style.setProperty('color', '#fff', 'important');
      }
    }
  }
  if (btnBanner) btnBanner.classList.toggle('d-none', !hasPermission('canAssignSuperIcon') || user.type === 'guest' || (!canAffect && !isSelf));

  if (btnKickRoom) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canKick = hasPermission('canKickUsers') || (isModerator && roomPermissions.includes('canKickUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;
    btnKickRoom.classList.toggle('d-none', !canKick || (!canAffect && !isSelf && !isModerator) || !isSameRoom);
  }
  if (btnBanRoom) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canBan = hasPermission('canBanUsers') || (isModerator && roomPermissions.includes('canBanUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;
    btnBanRoom.classList.toggle('d-none', !canBan || (!canAffect && !isSelf && !isModerator) || !isSameRoom);
  }
  if (btnBan) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canBan = hasPermission('canBanUsers') || (isModerator && roomPermissions.includes('canBanUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;

    const showBanRoom = canBan && canAffect && isSameRoom;
    const showBanGlobal = hasPermission('canBanUsers') && canAffect;

    const shouldShowBan = !isSelf && (showBanRoom || showBanGlobal);
    btnBan.classList.toggle('d-none', !shouldShowBan);
  }
  if (btnKick) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canKick = hasPermission('canKickUsers') || (isModerator && roomPermissions.includes('canKickUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;

    const showKickRoom = canKick && canAffect && isSameRoom;
    const showKickGlobal = hasPermission('canKickUsers') && canAffect;

    const shouldShowKick = !isSelf && (showKickRoom || showKickGlobal);
    btnKick.classList.toggle('d-none', !shouldShowKick);
  }
  if (btnModRoom) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const isRoomOwner = currentRoom && currentRoom.ownerId === state.currentUser.id;
    const isGlobalAdmin = hasPermission('canManageRooms') || (state.currentUser && state.currentUser.isAdmin);
    btnModRoom.classList.toggle('d-none', !(isRoomOwner || isGlobalAdmin) || isSelf);
    
    const isMod = currentRoom && currentRoom.moderators && currentRoom.moderators.some(m => (typeof m === 'number' ? m === (user.userId || user.id) : Number(m.userId) === Number(user.userId || user.id)));
    if (isMod) {
      btnModRoom.innerHTML = '<span>إزالة المراقبة</span> <i class="fas fa-user-times"></i>';
    } else {
      btnModRoom.innerHTML = '<span>مراقب الغرفة</span> <i class="fas fa-user-shield"></i>';
    }
  }
  if (btnKickGlobal) btnKickGlobal.classList.toggle('d-none', !hasPermission('canKickUsers') || !canAffect || isSelf);
  if (btnBanPermanent) btnBanPermanent.classList.toggle('d-none', !hasPermission('canBanUsers') || !canAffect || isSelf);
  if (btnBanTemporary) btnBanTemporary.classList.toggle('d-none', !hasPermission('canBanUsers') || !canAffect || isSelf);
  if (btnReport) btnReport.classList.toggle('d-none', false);
  if (btnKiss) btnKiss.classList.toggle('d-none', isSelf);
  if (btnIgnore) {
    btnIgnore.classList.toggle('d-none', false);
    btnIgnore.innerHTML = (state.ignoredUsers && state.ignoredUsers.has(user.username)) ? '<span>إلغاء التجاهل</span> <i class="fas fa-minus-circle"></i>' : '<span>تجاهل</span> <i class="fas fa-minus-circle"></i>';
  }

  // Admin section
  const adminEditSection = document.getElementById('profile-admin-edit-section');
  const btnProfileAdmin = document.getElementById('btn-profile-admin');

  if (adminEditSection) {
    const canEditLikes = hasPermission('canEditUserLikes');
    const canEditRep = hasPermission('canEditUserRep');
    const canEditWallPointsUser = hasPermission('canEditUserWallPoints');
    const canChangeUserNicknames = hasPermission('canChangeUserNicknames');
    const canManageGroups = hasPermission('canManageMembershipUpgrades');

    const canMove = state.currentUser.group && state.currentUser.group.canMoveMembers;
    const canMoveUser = canMove && canAffectTargetByRank;

    // Strict rank enforcement for ALL admin tools in profile
    const hasAnyAdmin = ((canEditLikes || canEditRep || canEditWallPointsUser || canChangeUserNicknames || canMoveUser) && !isTargetHigherRank) || (canManageGroups && canManageMembershipTarget);

    if (btnProfileAdmin) {
      btnProfileAdmin.classList.toggle('d-none', !hasAnyAdmin);
    }

    adminEditSection.classList.toggle('d-none', !hasAnyAdmin);
    
    // Close admin panel if it shouldn't be visible
    if (!hasAnyAdmin && typeof window.toggleAdminPanel === 'function') {
      window.toggleAdminPanel(false);
    }

    const editNicknameContainer = document.getElementById('admin-edit-nickname-container');
    if (editNicknameContainer) {
      editNicknameContainer.classList.toggle('d-none', !canChangeUserNicknames || isTargetHigherRank);
      const nicknameInput = document.getElementById('profile-admin-nickname-input');
      if (canChangeUserNicknames && nicknameInput && !isTargetHigherRank) nicknameInput.value = user.topic || '';
    }
    
    const editLikesContainer = document.getElementById('admin-edit-likes-container');
    if (editLikesContainer) {
      editLikesContainer.classList.toggle('d-none', !canEditLikes || isTargetHigherRank);
      const likesInput = document.getElementById('profile-admin-likes-input');
      if (canEditLikes && likesInput && !isTargetHigherRank) likesInput.value = user.likes || 0;
    }
    
    const editRepContainer = document.getElementById('admin-edit-rep-container');
    if (editRepContainer) {
      editRepContainer.classList.toggle('d-none', !canEditRep || isTargetHigherRank);
      const repInput = document.getElementById('profile-admin-rep-input');
      if (canEditRep && repInput && !isTargetHigherRank) repInput.value = user.rep || 0;
    }

    const editWallPointsContainer = document.getElementById('admin-edit-wallpoints-container');
    if (editWallPointsContainer) {
      editWallPointsContainer.classList.toggle('d-none', !canEditWallPointsUser || isTargetHigherRank);
      const wallInput = document.getElementById('profile-admin-wallpoints-input');
      if (canEditWallPointsUser && wallInput && !isTargetHigherRank) wallInput.value = user.wallPoints || 0;
    }

    const editGroupContainer = document.getElementById('admin-edit-group-container');
    if (editGroupContainer) {
      editGroupContainer.classList.toggle('d-none', !canManageGroups || !canManageMembershipTarget || isSelf);
    }

    const moveMemberContainer = document.getElementById('move-member-container');
    if (moveMemberContainer) {
      moveMemberContainer.classList.toggle('d-none', !canMoveUser || isTargetHigherRank || isSelf);
    }
  }

  // Edit cover btn
  const btnEditCover = document.getElementById('btn-edit-cover');
  if (btnEditCover) {
    const canEditCover = isSelf && (window.enableCustomCover !== false);
    btnEditCover.classList.toggle('d-none', !canEditCover);
    if (!profileListenersAttached) {
       initProfileModalListeners();
    }
  }

  // Handle battle challenge button visibility
  const btnBattle = document.getElementById('btn-profile-battle');
  if (btnBattle) {
    const isBattleEnabled = window.featuresSettings && window.featuresSettings.battleChallengesEnabled === true;
    const isTargetGuest = user.isGuest || user.type === 'guest';
    const groupPerms = (state.currentUser && state.currentUser.group) || {};
        const hasBattlePermission = groupPerms.canStartBattleChallenge === true || groupPerms.canManagePermissions === true;
    
    const shouldHideBattle = !isBattleEnabled || isTargetGuest || isSelf || !hasBattlePermission;
    btnBattle.classList.toggle('d-none', shouldHideBattle);
  }
}

window.renderProfileCover = function(rawCoverUrl, userObj, forceCacheBust = false) {
  const profileCover = document.getElementById('profile-cover');
  const profileCoverPlaceholder = document.getElementById('profile-cover-placeholder');
  if (!profileCover) return;

  const targetUser = userObj || window.profileUser || state.currentUser;
  let finalCover = rawCoverUrl;

  if (!finalCover && targetUser) {
    const key = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(targetUser) : null;
    const presUser = (key && typeof presenceUsersMap !== 'undefined' && presenceUsersMap) ? presenceUsersMap.get(key) : null;
    finalCover = (presUser && presUser.cover) ? presUser.cover : targetUser.cover;
  }
  if (!finalCover && state.currentUser && targetUser && (targetUser.id === state.currentUser.id || targetUser.userId === state.currentUser.id)) {
    finalCover = state.currentUser.cover;
  }

  if (!finalCover && window.defaultCoverUrl) {
    finalCover = window.defaultCoverUrl;
  }

  if (!finalCover) {
    profileCover.removeAttribute('src');
    profileCover.classList.add('d-none');
    if (profileCoverPlaceholder) profileCoverPlaceholder.classList.remove('d-none');
    return;
  }

  let displayUrl = finalCover;
  if (forceCacheBust && displayUrl.startsWith('/uploads/')) {
    displayUrl += (displayUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
  }

  window.__profileCoverLoadId = (window.__profileCoverLoadId || 0) + 1;
  const currentLoadId = window.__profileCoverLoadId;
  const targetId = targetUser ? String(targetUser.userId || targetUser.id || '') : '';

  const img = new Image();
  img.onload = () => {
    if (currentLoadId !== window.__profileCoverLoadId) return;
    if (window.profileUser && targetId && String(window.profileUser.userId || window.profileUser.id || '') !== targetId) return;
    
    profileCover.src = displayUrl;
    profileCover.classList.remove('d-none');
    if (profileCoverPlaceholder) profileCoverPlaceholder.classList.add('d-none');
  };
  img.onerror = () => {
    if (currentLoadId !== window.__profileCoverLoadId) return;
    if (window.profileUser && targetId && String(window.profileUser.userId || window.profileUser.id || '') !== targetId) return;
    
    profileCover.removeAttribute('src');
    profileCover.classList.add('d-none');
    if (profileCoverPlaceholder) profileCoverPlaceholder.classList.remove('d-none');
  };
  img.src = displayUrl;
};

async function showUserProfile(username) {
  if (!state.currentUser) {
    console.warn('Cannot open profile: User not logged in.');
    return;
  }
  let user = state.currentUsers.find(u => u.username === username);
  if (!user) return;

  const presKey = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(user) : null;
  const presUser = (presKey && typeof presenceUsersMap !== 'undefined' && presenceUsersMap) ? presenceUsersMap.get(presKey) : null;
  if (presUser) {
    user = { ...user, ...presUser };
    if (!user.cover && presUser.cover) user.cover = presUser.cover;
  }
  if (state.currentUser && (user.id === state.currentUser.id || user.userId === state.currentUser.id) && state.currentUser.cover && !user.cover) {
    user.cover = state.currentUser.cover;
  }

  const isTargetHidden = user.isHidden === true || user.isHidden === 'true';
  const targetRank = (user.group && user.group.roleRank) || user.roleRank || 0;
  const myRank = (state.currentUser && (state.currentUser.group && state.currentUser.group.roleRank !== undefined ? state.currentUser.group.roleRank : state.currentUser.roleRank)) || 0;

  if (isTargetHidden && myRank < targetRank) {
    showToast('لا يمكن عرض الملف الشخصي للأعضاء المتخفين ذوي الرتب الأعلى من رتبتك', 'warning');
    return;
  }
  
  if (typeof window.toggleAdminPanel === 'function') {
    window.toggleAdminPanel(false);
  }
  
  profileUser = user;
  window.profileUser = user;
  
  if (user.id && String(user.id) !== String(state.currentUser.id) && !state.currentUser.isGuest) {
    fetch('/api/profile-visits/' + user.id, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    }).catch(() => {});
  }
  
  // Clear and hide badges container immediately to prevent flashing
  const initialBadgesContainer = document.getElementById('profile-badges-container');
  if (initialBadgesContainer) {
    initialBadgesContainer.style.display = 'none';
    initialBadgesContainer.innerHTML = '';
  }
  
  // Populate UI immediately with local data
  const headerAvatar = document.getElementById('profile-avatar-header');
  if (headerAvatar) {
    headerAvatar.src = window.getAvatarUrl(user);
  }
  if (typeof window.updateProfileHeaderPresenceStatus === 'function') {
    window.updateProfileHeaderPresenceStatus(user);
  }
  
  const headerBg = document.getElementById('profile-header-bg');
  if (headerBg) headerBg.style.backgroundImage = 'none';
  
  let headerContainer = document.getElementById('profile-header-topic-container');
  const verifiedBadge = document.getElementById('profile-verified-badge');
  const headerBanner = document.getElementById('profile-header-banner');
  if (headerBanner) headerBanner.remove(); // Remove the separate banner, we will use the unified one

  if (!headerContainer) {
     const topicEl = document.getElementById('profile-header-topic');
     if (topicEl) {
         headerContainer = document.createElement('div');
         headerContainer.id = 'profile-header-topic-container';
         headerContainer.className = 'profile-header-topic-container align-items-center d-flex ms-2';
         topicEl.parentNode.replaceChild(headerContainer, topicEl);
     }
  }

  if (headerContainer) {
    headerContainer.innerHTML = window.renderUserIdentity(user, {
      nameClasses: 'profile-header-topic',
      nameStyle: `color: ${user.ucol || '#000000'}; font-weight: bold;`,
      tag: 'span'
    });
  }

  // Set the clean mid-section username as well
  const midUsernameEl = document.getElementById('profile-mid-username');
  if (midUsernameEl) {
    midUsernameEl.innerHTML = window.renderUserIdentity(user, {
      nameClasses: 'profile-mid-username-text text-truncate d-inline-block',
      nameStyle: `color: ${user.ucol || '#000000'}; font-weight: bold; font-size: 16px;`,
      tag: 'span'
    });
  }
  if (verifiedBadge) verifiedBadge.classList.toggle('d-none', !user.isVerified);

  const mainVerifiedBadge = document.getElementById('profile-main-verified-badge');
  if (mainVerifiedBadge) mainVerifiedBadge.classList.toggle('d-none', !user.isVerified);

  const headerFlag = document.getElementById('profile-header-flag');
  const headerId = document.getElementById('profile-header-id');
  if (headerFlag) headerFlag.classList.add('d-none');
  if (headerId) headerId.classList.add('d-none');

  const profileAvatarWrapper = document.getElementById('profile-avatar-wrapper');
  const hasMembershipFrame = Boolean(user.membershipFrame);
  const hasMembershipDesign = Boolean(
    user.membershipFrame ||
    user.membershipBg
  );
  
  if (profileAvatarWrapper) {
    profileAvatarWrapper.classList.toggle('profile-avatar-frame', !hasMembershipDesign);
    profileAvatarWrapper.classList.toggle('profile-avatar-membership', hasMembershipDesign);
    profileAvatarWrapper.classList.toggle('has-membership-frame', hasMembershipFrame);
    
    // Clear/Reset inline styles that might interfere
    if (hasMembershipDesign) {
        profileAvatarWrapper.style.borderRadius = '50%';
        profileAvatarWrapper.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
    } else {
        profileAvatarWrapper.style.borderRadius = '10px';
        profileAvatarWrapper.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    }
  }

  const profileMsgEl = document.getElementById('profile-msg');
  const profileAvatarFrameEl = document.getElementById('profile-avatar-wrapper');
  const profileHeaderClassicBar = document.getElementById('profile-header-classic-bar');
  if (profileMsgEl) {
    profileMsgEl.innerText = user.msg || (user.type === 'guest' ? 'زائر' : 'عضو');
    if (user.statusBgColor && user.statusBgColor !== 'transparent') {
      const bgColor = user.statusBgColor;
      profileMsgEl.style.setProperty('--status-bg', bgColor);
      if (profileAvatarFrameEl) profileAvatarFrameEl.style.setProperty('--status-bg', bgColor);
      if (profileHeaderClassicBar) profileHeaderClassicBar.style.setProperty('--status-bg', bgColor);
    } else {
      profileMsgEl.style.removeProperty('--status-bg');
      if (profileAvatarFrameEl) profileAvatarFrameEl.style.removeProperty('--status-bg');
      if (profileHeaderClassicBar) profileHeaderClassicBar.style.removeProperty('--status-bg');
    }
  }
  const profileAvatarModal = document.getElementById('profile-avatar-modal');
  if (profileAvatarModal) {
    profileAvatarModal.src = window.getAvatarUrl(user);
    if (hasMembershipFrame) {
      profileAvatarModal.style.width = '78%';
      profileAvatarModal.style.height = '78%';
      profileAvatarModal.style.borderRadius = '50%';
      profileAvatarModal.style.border = 'none';
    } else {
      profileAvatarModal.style.width = '100%';
      profileAvatarModal.style.height = '100%';
      profileAvatarModal.style.borderRadius = '0';
      profileAvatarModal.style.border = '3.5px solid white';
    }
  }
  const headerAvatarElement = document.getElementById('profile-avatar-header');
  const mainFrame = document.getElementById('profile-main-frame');
  if (headerAvatarElement) {
    headerAvatarElement.src = window.getAvatarUrl(user);
    if (typeof window.updateProfileHeaderPresenceStatus === 'function') {
      window.updateProfileHeaderPresenceStatus(user);
    }
  }
  if (mainFrame) {
    if (hasMembershipFrame) {
      mainFrame.src = user.membershipFrame;
      mainFrame.classList.remove('d-none');
    } else {
      mainFrame.classList.add('d-none');
    }
  }
  
  if (typeof window.renderProfileCover === 'function') {
    window.renderProfileCover(user.cover, user);
  }
  
  console.log('DEBUG: User object in showUserProfile:', user);
  
  const profileRoomName = document.getElementById('profile-room-name');
  const profileRoomThumbnail = document.getElementById('profile-room-thumbnail');
  const profileRoomContainer = document.getElementById('profile-room-name-container');

  if (profileRoomName) {
    const room = findRoomData(user.roomId);
    profileRoomName.innerText = (room ? room.name : null) || 'خارج الغرف';
    
    if (profileRoomContainer) {
      if (room) {
        profileRoomContainer.style.cursor = 'pointer';
        profileRoomContainer.title = 'انقر للانتقال إلى الغرفة';
        profileRoomContainer.onclick = () => {
          if (user.roomId) {
            window.joinRoom(user.roomId);
            // Optionally close the modal
            if (window.bootstrap && window.bootstrap.Modal) {
              const modalEl = document.getElementById('userProfileModal');
              const modal = window.bootstrap.Modal.getInstance(modalEl);
              if (modal) modal.hide();
            }
          }
        };
      } else {
        profileRoomContainer.style.cursor = 'default';
        profileRoomContainer.title = '';
        profileRoomContainer.onclick = null;
      }
    }

    if (profileRoomThumbnail) {
      if (room) {
        profileRoomThumbnail.src = window.getRoomThumbnailUrl(room);
        profileRoomThumbnail.style.display = 'block';
      } else {
        profileRoomThumbnail.style.display = 'none';
      }
    }
  }
  
  const profileCountryName = document.getElementById('profile-country-name');
  if (profileCountryName) {
    const cVal = user.profileCountry || user.country;
    const countryCode = (cVal && cVal.toLowerCase() !== 'unknown') ? cVal.toLowerCase() : null;
    profileCountryName.innerText = countryCode && window.countryMap[countryCode] ? window.countryMap[countryCode] : (user.countryName || 'غير معروف');
  }
  
  const profileCountryFlag = document.getElementById('profile-country-flag');
  if (profileCountryFlag) {
    const cVal = user.profileCountry || user.country;
    const countryCode = (cVal && cVal.toLowerCase() !== 'unknown') ? cVal.toLowerCase() : null;
    if (countryCode) {
      profileCountryFlag.innerHTML = `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; object-fit: cover; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">`;
      profileCountryFlag.className = '';
    } else {
      profileCountryFlag.innerHTML = `<i class="fas fa-globe text-muted"></i>`;
      profileCountryFlag.className = '';
    }
  }

  // Profile Badges
  const wallPointsForBadges = Number(user.wallPoints || 0);
  const badges = [
    { level: 1, points: 1000, icon: 'fa-medal', title: 'وسام البداية - يحتاج 1000 نقطة' },
    { level: 2, points: 3000, icon: 'fa-award', title: 'وسام التميز - يحتاج 3000 نقطة' },
    { level: 3, points: 5000, icon: 'fa-star', title: 'وسام النشاط - يحتاج 5000 نقطة' },
    { level: 4, points: 10000, icon: 'fa-trophy', title: 'وسام القوة - يحتاج 10000 نقطة' },
    { level: 5, points: 20000, icon: 'fa-crown', title: 'وسام النخبة - يحتاج 20000 نقطة' },
    { level: 6, points: 50000, icon: 'fa-gem', title: 'وسام الأسطورة - يحتاج 50000 نقطة' }
  ];

  window.renderProfileBadges = (targetUser, badgeSettings) => {
    const badgesContainer = document.getElementById('profile-badges-container');
    if (!badgesContainer) return;

    if (!badgeSettings || !badgeSettings.enabled) {
        badgesContainer.style.display = 'none';
        return;
    }
    badgesContainer.style.display = 'flex';
    
    const currentPoints = Number(targetUser.wallPoints || 0);

    const badgesHtml = badges.map(badge => {
        const active = currentPoints >= badge.points;
        const customUrl = badgeSettings.badges ? badgeSettings.badges[badge.level] : null;
        
        if (customUrl) {
           return `
            <div class="profile-badge ${active ? 'active' : 'locked'}" title="${badge.title}">
                <img src="${customUrl}" style="width: 100%; height: 100%; object-fit: contain; ${active ? '' : 'filter: grayscale(100%) opacity(0.5);'}">
            </div>
           `;
        } else {                
            return `
              <div class="profile-badge ${active ? 'active' : 'locked'}" title="${badge.title}">
                <i class="fas ${badge.icon}"></i>
              </div>
            `;
        }
    }).join('');

    badgesContainer.innerHTML = badgesHtml;
  };

  if (window.badgeSettings) {
    window.renderProfileBadges(user, window.badgeSettings);
  } else {
    fetch('/api/settings/badges')
      .then(res => res.json())
      .then(badgeSettings => {
        window.badgeSettings = badgeSettings;
        window.renderProfileBadges(user, badgeSettings);
      })
      .catch(err => console.error('Error fetching badges in showUserProfile:', err));
  }
  
  const likesCount = user.likes || 0;
  const profileLikesCount = document.getElementById('profile-likes-count');
  if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(likesCount);
  const likesBtnCount = document.getElementById('profile-likes-count-btn');
  if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(likesCount);

  const repCount = user.rep || 0;
  const profileRepCount = document.getElementById('profile-rep-count');
  if (profileRepCount) profileRepCount.innerText = formatCompactNumber(repCount);
  const repBtnCount = document.getElementById('profile-rep-count-btn');
  if (repBtnCount) repBtnCount.innerText = formatCompactNumber(repCount);

  const profileWallPoints = document.getElementById('profile-wall-points');
  if (profileWallPoints) profileWallPoints.innerText = formatCompactNumber(user.wallPoints || 0);

  // Show Modal Immediately
  profileModal.show();
  
  // Set initial button states based on default like threshold
  const defaultLikeThreshold = 5000;
  updateProfileButtons(user, defaultLikeThreshold);

  // Logic for Move Member UI (Integrated into showUserProfile)
  const moveMemberContainer = document.getElementById('move-member-container');
  const moveMemberRoomSelect = document.getElementById('move-member-room-select');
  const btnProfileMoveMember = document.getElementById('btn-profile-move-member');

  if (moveMemberContainer && moveMemberRoomSelect && btnProfileMoveMember) {
    const myRank = (state.currentUser.group && state.currentUser.group.roleRank) || state.currentUser.roleRank || 0;
    const targetRank = (user.group && user.group.roleRank) || user.roleRank || 0;
    const canMove = state.currentUser.group && state.currentUser.group.canMoveMembers;
    
    if (canMove && (myRank > targetRank)) {
      moveMemberContainer.classList.remove('d-none');
      // Reset password field
      const movePassInput = document.getElementById('move-member-password');
      if (movePassInput) movePassInput.value = '';
      
      // Also ensure the parent admin section is visible
      const adminEditSection = document.getElementById('profile-admin-edit-section');
      if (adminEditSection) adminEditSection.classList.remove('d-none');
      
      // Populate rooms
      moveMemberRoomSelect.innerHTML = '<option value="">اختر الغرفة للنقل</option>';
      state.rooms.forEach(r => {
        if (Number(r.id) !== Number(user.roomId)) {
          const option = document.createElement('option');
          option.value = r.id;
          option.textContent = r.name;
          moveMemberRoomSelect.appendChild(option);
        }
      });

      btnProfileMoveMember.onclick = () => {
        const roomId = moveMemberRoomSelect.value;
        const password = document.getElementById('move-member-password').value;
        if (!roomId) {
          Swal.fire('تنبيه', 'يرجى اختيار غرفة', 'warning');
          return;
        }
        socket.emit('move-user-to-room', { targetUsername: user.username, roomId, password });
        profileModal.hide();
      };
    } else {
      moveMemberContainer.classList.add('d-none');
    }
  }

  // Background Data Fetching
  (async () => {
    // Populate Groups if admin section is visible
    const adminEditSection = document.getElementById('profile-admin-edit-section');
    if (adminEditSection && !adminEditSection.classList.contains('d-none')) {
      const groupSelect = document.getElementById('profile-admin-group-select');
      const editGroupContainer = document.getElementById('admin-edit-group-container');
      const canManageGroups = hasPermission('canManageMembershipUpgrades');
      if (groupSelect && canManageGroups) {
        try {
          const res = await fetch('/api/chat/allowed-promotion-groups', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
          });
          if (res.ok) {
            const allowedGroups = await res.json();
            
            if (allowedGroups && allowedGroups.length > 0) {
              groupSelect.innerHTML = '<option value="">بدون مجموعة</option>';
              allowedGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.name;
                if (user.group && user.group.id === group.id) option.selected = true;
                groupSelect.appendChild(option);
              });
              // If user has no group, select the "No group" option
              if (!user.group) groupSelect.value = '';
              
              if (editGroupContainer) {
                editGroupContainer.classList.remove('d-none');
              }
            } else {
              groupSelect.innerHTML = '<option value="">لا توجد مجموعات مسموح الترقية إليها</option>';
              if (editGroupContainer) {
                editGroupContainer.classList.add('d-none');
              }
            }
          } else {
            console.error('Failed to load allowed promotion groups: non-200 response');
            if (editGroupContainer) {
              editGroupContainer.classList.add('d-none');
            }
          }
        } catch (err) {
          console.error('Failed to fetch allowed promotion groups for profile edit:', err);
          if (editGroupContainer) {
            editGroupContainer.classList.add('d-none');
          }
        }
      }
    }
  })();
}
window.showUserProfile = showUserProfile;

window.saveProfileGroup = async () => {
  if (!profileUser) return;
  const userId = profileUser.id || profileUser.userId;
  console.log('saveProfileGroup: userId is', userId, 'profileUser is', profileUser);
  const groupSelect = document.getElementById('profile-admin-group-select');
  if (!groupSelect) return;
  
  // If value is empty or "0", send null to remove the group
  const groupId = (groupSelect.value === '' || groupSelect.value === '0') ? null : groupSelect.value;

  if (!userId) {
    Swal.fire('عذراً', 'معرف المستخدم غير صالح', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ groupId })
    });

    if (res.ok) {
      showToast('تم تحديث المجموعة بنجاح', 'success');
      // Update local profile view
      profileUser.groupId = (groupId === null || groupId === '' || groupId === '0') ? null : parseInt(groupId, 10);
      // The socket event 'user_updated' will handle updating the UI and notifying the user
    } else {
      let errorMessage = 'فشل تحديث المجموعة';
      try {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          errorMessage = data.message || errorMessage;
        } catch (e) {
          console.error('Failed to parse error response. Response text:', text);
        }
      } catch (e) {
        console.error('Failed to read error response:', e);
      }
      showToast(errorMessage, 'error');
    }
  } catch (err) {
    console.error('Error updating group:', err);
    showToast('حدث خطأ أثناء تحديث المجموعة', 'error');
  }
};

window.saveProfileNickname = async () => {
  if (!profileUser) return;
  const userId = profileUser.id || profileUser.userId;
  const nickname = document.getElementById('profile-admin-nickname-input').value;

  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ topic: nickname })
    });

    if (response.ok) {
      triggerSuccessAnim('btn-save-profile-nickname');
      // Update modal title if it's the same user
      const profileUsernameEl = document.getElementById('profile-username');
      if (profileUsernameEl) profileUsernameEl.innerText = nickname;
      const profileHeaderTopicEl = document.getElementById('profile-header-topic');
      if (profileHeaderTopicEl) profileHeaderTopicEl.innerText = nickname;
    } else {
      const error = await response.json();
      showToast(error.message || 'فشل تحديث الزخرفه', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('خطأ في الاتصال بالخادم', 'error');
  }
};

window.saveProfileLikes = async () => {
  if (!profileUser) return;

  const userId = profileUser.id || profileUser.userId;
  const newValue = parseInt(document.getElementById('profile-admin-likes-input').value);

  console.log(`[LikesUpdate] Start: User=${userId}, RequestedValue=${newValue}`);

  try {
    const res = await fetch(`/api/admin/users/${userId}/likes`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ value: newValue })
    });
    
    const text = await res.text().catch(() => '');
    console.log(`[LikesUpdate] Response Received - Status: ${res.status}`);
    console.log(`[LikesUpdate] Raw Body: ${text}`);
    
    let data = null;
    try {
      if (text) data = JSON.parse(text);
    } catch (e) {
      console.warn('[LikesUpdate] JSON Parse Failed');
    }

    if (res.ok) {
      triggerSuccessAnim('btn-save-profile-likes');
      if (typeof showToast === 'function') {
        showToast('تم تحديث اللايكات بنجاح', 'success');
      }
      profileUser.likes = newValue;
      const profileLikesCount = document.getElementById('profile-likes-count');
      if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(newValue);
      const likesBtnCount = document.getElementById('profile-likes-count-btn');
      if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(newValue);
      return;
    }

    // If limit exceeded (now using 400 or 403)
    if (data?.code === 'LIKES_LIMIT_EXCEEDED' || (res.status === 400 && data?.code === 'LIKES_LIMIT_EXCEEDED')) {
      Swal.fire({
        icon: 'warning',
        title: 'عذراً، تجاوزت السقف المسموح',
        text: data.message || `السقف المسموح لك هو ${data.maxLikesLimit || ''} لايك فقط.`,
        confirmButtonText: 'حسناً'
      });
      return;
    }

    // Specific generic messages based on status
    let title = 'فشل التعديل';
    let message = data?.message || 'حدث خطأ غير متوقع';

    if (res.status === 403) {
      title = 'صلاحيات غير كافية';
      message = data?.message || 'ليس لديك صلاحية لتعديل اللايكات أو أنك تحاول تجاوز السقف المحدد لرتبتك.';
    } else if (res.status === 404) {
      message = 'المستخدم غير موجود أو الرابط خاطئ';
    }

    Swal.fire({
      icon: 'error',
      title: title,
      text: message,
      confirmButtonText: 'حسناً'
    });
  } catch (err) {
    console.error('[LikesUpdate] Exception:', err);
    Swal.fire({
      icon: 'error',
      title: 'خطأ تقني',
      text: 'فشل الاتصال بالسيرفر: ' + err.message,
      confirmButtonText: 'حسناً'
    });
  }
};

window.saveProfileRep = async () => {
  if (!profileUser) return;
  const userId = profileUser.id || profileUser.userId;
  const newValue = document.getElementById('profile-admin-rep-input').value;
  
  console.log(`[RepUpdate] Attempting to update user ${userId} rep to ${newValue}`);

  try {
    const res = await fetch(`/api/admin/users/${userId}/rep`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ value: parseInt(newValue) })
    });
    
    const text = await res.text().catch(() => '');
    console.log(`[RepUpdate] Status: ${res.status}, Raw Response: ${text}`);

    let data = null;
    try {
      if (text) data = JSON.parse(text);
    } catch (e) {}

    if (res.ok) {
      triggerSuccessAnim('btn-save-profile-rep');
      if (typeof showToast === 'function') {
        showToast('تم تحديث السمعة بنجاح', 'success');
      }
      profileUser.rep = parseInt(newValue);
      // Update UI
      const profileRepCount = document.getElementById('profile-rep-count');
      if (profileRepCount) profileRepCount.innerText = formatCompactNumber(newValue);
      const repBtnCount = document.getElementById('profile-rep-count-btn');
      if (repBtnCount) repBtnCount.innerText = formatCompactNumber(newValue);
      return;
    }

    Swal.fire({
      icon: 'error',
      title: 'فشل التعديل',
      text: data?.message || `خطأ في تعديل الكوينز (كود: ${res.status})`,
      confirmButtonText: 'حسناً'
    });
  } catch (err) {
    console.error('Error updating rep:', err);
    Swal.fire({
      icon: 'error',
      title: 'خطأ في الاتصال',
      text: 'حدث خطأ غير متوقع عند الاتصال بالسيرفر: ' + err.message,
      confirmButtonText: 'حسناً'
    });
  }
};

window.saveProfileWallPoints = async () => {
  if (!profileUser) return;
  const userId = profileUser.id || profileUser.userId;
  const newValue = document.getElementById('profile-admin-wallpoints-input').value;
  
  try {
    const res = await fetch(`/api/admin/users/${userId}/wall-points`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ value: parseInt(newValue) })
    });
    
    const text = await res.text().catch(() => '');
    let data = null;
    try {
      if (text) data = JSON.parse(text);
    } catch (e) {}

    if (res.ok) {
      triggerSuccessAnim('btn-save-profile-wallpoints');
      if (typeof showToast === 'function') {
        showToast('تم تحديث النقاط بنجاح', 'success');
      }
      const confirmedPoints = data?.wallPoints !== undefined ? Number(data.wallPoints) : parseInt(newValue);
      profileUser.wallPoints = confirmedPoints;
      
      const profileWallPointsCount = document.getElementById('profile-wall-points');
      if (profileWallPointsCount) profileWallPointsCount.innerText = window.formatCompactNumber ? window.formatCompactNumber(confirmedPoints) : confirmedPoints;

      if (typeof window.renderProfileBadges === 'function' && window.badgeSettings) {
         window.renderProfileBadges(profileUser, window.badgeSettings);
      }

      return;
    }

    Swal.fire({
      icon: 'error',
      title: 'فشل التعديل',
      text: data?.message || `خطأ في تعديل النقاط (كود: ${res.status})`,
      confirmButtonText: 'حسناً'
    });
  } catch (err) {
    console.error('Error updating wall points:', err);
    Swal.fire({
      icon: 'error',
      title: 'خطأ في الاتصال',
      text: 'حدث خطأ غير متوقع عند الاتصال بالسيرفر: ' + err.message,
      confirmButtonText: 'حسناً'
    });
  }
};

function triggerSuccessAnim(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  
  btn.classList.add('success-anim');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = 'تم <i class="fas fa-check-circle"></i>';
  
  setTimeout(() => {
    btn.classList.remove('success-anim');
    btn.innerHTML = originalHtml;
  }, 1500);
}

// Button Handlers
const btnProfilePrivate = document.getElementById('btn-profile-private');
if (btnProfilePrivate) {
  btnProfilePrivate.onclick = () => {
    const canBypass = hasPermission('canOpenPrivateMessages');
    if (profileUser && profileUser.allowPrivate === false && !canBypass) {
      Swal.fire({
        icon: 'error',
        title: 'عذراً',
        text: 'هذا المستخدم لا يقبل الرسائل الخاصة',
        confirmButtonText: 'حسناً'
      });
      return;
    }
    if (window.PrivateChatManager && profileUser) {
      window.PrivateChatManager.openChat(profileUser);
    }
    profileModal.hide();
  };
}

window.showPrivateNotificationModal = async function(targetUser, fromReply = false) {
  const canBypass = hasPermission('canOpenPrivateMessages');
  if (targetUser && targetUser.allowAlerts === false && !canBypass) {
    Swal.fire({
      icon: 'error',
      title: 'عذراً',
      text: 'هذا المستخدم لا يستقبل التنبيهات',
      confirmButtonText: 'حسناً'
    });
    return;
  }
  if (typeof profileModal !== 'undefined' && profileModal && typeof profileModal.hide === 'function') {
    profileModal.hide();
  }
  const displayName = targetUser.topic || targetUser.username;
  const { value: message } = await Swal.fire({
    title: '',
    html: `
      <div class="private-alert-container">
        <div class="private-alert-header">
          <img src="${window.getAvatarUrl(targetUser)}" class="private-alert-avatar" onerror="this.src='/uploads/site/default.png'">
          <div class="private-alert-name">
            ${window.escapeHTML ? window.escapeHTML(displayName) : displayName}
          </div>
        </div>
        <div style="direction: rtl; text-align: right; width: 100%; box-sizing: border-box;">
          <div class="private-alert-textarea-wrapper">
            <textarea id="private-alert-textarea-input" maxlength="500" placeholder="أدخل رسالة التنبيه هنا..." class="private-alert-textarea"></textarea>
            <div id="private-alert-char-counter" class="private-alert-char-counter">0 / 500</div>
          </div>
          
          <div class="private-alert-toolbar">
            <button type="button" id="private-alert-btn-emoji" class="private-alert-btn-emoji" title="الابتسامات والملصقات">
              <img src="/emoii.gif" alt="emoji">
            </button>
          </div>
          
          <!-- Custom Emoji/Sticker Picker Box -->
          <div id="private-alert-emoji-picker" class="private-alert-picker">
            <div class="private-alert-picker-header">
              <div class="private-alert-picker-tabs">
                <button type="button" class="private-alert-tab-btn active" data-tab="smileys">الابتسامات</button>
                <button type="button" class="private-alert-tab-btn" data-tab="stickers">الملصقات</button>
              </div>
              <button type="button" id="private-alert-picker-close" class="private-alert-picker-close" title="إغلاق">&times;</button>
            </div>
            <div id="private-alert-picker-content" class="private-alert-picker-content"></div>
          </div>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'إرسال',
    cancelButtonText: 'إلغاء',
    focusConfirm: false,
    customClass: {
      popup: 'p-0 border-0 rounded-1 overflow-hidden',
      confirmButton: 'btn btn-dark btn-sm px-4 mx-1',
      cancelButton: 'btn btn-secondary btn-sm px-4 mx-1'
    },
    buttonsStyling: false,
    preConfirm: () => {
      const txt = document.getElementById('private-alert-textarea-input');
      return txt ? txt.value : '';
    },
    didOpen: () => {
      // Hide the default classic-alert title box if it exists to avoid overlap
      const titleBox = document.getElementById('classic-alert-title');
      if (titleBox) titleBox.style.display = 'none';
      
      const input = document.getElementById('private-alert-textarea-input');
      if (input) {
        input.focus();
        
        // Counter logic
        const counter = document.getElementById('private-alert-char-counter');
        input.addEventListener('input', () => {
          if (counter) {
            counter.textContent = `${input.value.length} / 500`;
          }
        });
      }

      // Initialize Custom Picker
      const pickerEl = document.getElementById('private-alert-emoji-picker');
      const btnEmoji = document.getElementById('private-alert-btn-emoji');
      const btnClosePicker = document.getElementById('private-alert-picker-close');
      const pickerContent = document.getElementById('private-alert-picker-content');
      
      let currentTab = 'smileys'; // Default tab

      function renderPickerItems() {
        if (!pickerContent) return;
        pickerContent.innerHTML = '';

        const smileysList = (state.smileys || []).filter(item => {
          if (currentTab === 'smileys') return item.type === 'smiley';
          if (currentTab === 'stickers') return item.type === 'sticker';
          return false;
        });

        if (smileysList.length === 0) {
          pickerContent.innerHTML = `<div style="text-align: center; color: #888; font-size: 13px; padding: 20px;">لا توجد عناصر لعرضها</div>`;
          return;
        }

        const gridClass = currentTab === 'smileys' ? 'private-alert-smileys-grid' : 'private-alert-stickers-grid';
        const grid = document.createElement('div');
        grid.className = gridClass;

        smileysList.forEach(item => {
          const itemEl = document.createElement('div');
          itemEl.className = `private-alert-picker-item ${currentTab === 'smileys' ? 'smiley' : 'sticker'}`;
          itemEl.setAttribute('title', item.shortcut);

          const img = document.createElement('img');
          img.src = item.url;
          img.alt = item.shortcut;
          img.loading = 'lazy';
          itemEl.appendChild(img);

          itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (input) {
              insertPrivateAlertShortcutAtCaret(input, item.shortcut);
            }
          });

          grid.appendChild(itemEl);
        });

        pickerContent.appendChild(grid);
      }

      function insertPrivateAlertShortcutAtCaret(textarea, shortcut) {
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const text = textarea.value;
        const before = text.substring(0, startPos);
        const after = text.substring(endPos, text.length);
        
        textarea.value = before + shortcut + after;
        
        // Move selection caret to after inserted shortcut
        const newPos = startPos + shortcut.length;
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
        
        textarea.focus();
        
        // Dispatch 'input' event to update counter
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (btnEmoji && pickerEl) {
        btnEmoji.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = pickerEl.classList.contains('is-open');
          if (isOpen) {
            pickerEl.classList.remove('is-open');
          } else {
            pickerEl.classList.add('is-open');
            renderPickerItems();
          }
        });
      }

      if (btnClosePicker && pickerEl) {
        btnClosePicker.addEventListener('click', (e) => {
          e.stopPropagation();
          pickerEl.classList.remove('is-open');
        });
      }

      // Handle Tab Switching
      const tabBtns = document.querySelectorAll('.private-alert-tab-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          tabBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentTab = btn.getAttribute('data-tab');
          renderPickerItems();
        });
      });

      // Prevent closing picker or window on scroll and clicking inside picker
      if (pickerEl) {
        const preventEvt = (e) => {
          e.stopPropagation();
        };
        pickerEl.addEventListener('pointerdown', preventEvt);
        pickerEl.addEventListener('mousedown', preventEvt);
        pickerEl.addEventListener('touchstart', preventEvt);
        pickerEl.addEventListener('click', preventEvt);
        pickerEl.addEventListener('wheel', preventEvt);
      }
    },
    willClose: () => {
      // Restore title box for other alerts
      const titleBox = document.getElementById('classic-alert-title');
      if (titleBox) titleBox.style.display = 'block';
    }
  });


  if (message) {
    socket.emit('send-private-notification', { targetUsername: targetUser.username, text: message }, (response) => {
      if (response && response.ok) {
        if (response.mode === 'offline') {
          Swal.fire({
            title: 'تنبيه',
            text: 'المستخدم غير متصل حاليًا، سيشاهد التنبيه فور دخوله',
            icon: 'info',
            confirmButtonText: 'حسناً'
          });
        } else {
          if (typeof showToast === 'function') {
            showToast('تم إرسال التنبيه بنجاح', 'success');
          }
        }
      } else {
        Swal.fire({
          title: 'فشل الإرسال',
          text: response?.message || 'حدث خطأ أثناء إرسال التنبيه',
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
      }
    });
    if (ui && ui.chatInput) {
      ui.chatInput.focus();
    }
  } else {
    if (!fromReply) {
      showUserProfile(targetUser.username);
    }
  }
};

const btnProfileAlert = document.getElementById('btn-profile-alert');
if (btnProfileAlert) {
  btnProfileAlert.onclick = () => {
    if (profileUser) {
      window.showPrivateNotificationModal(profileUser, false);
    }
  };
}

const btnProfileLikes = document.getElementById('btn-profile-likes');
if (btnProfileLikes) {
  btnProfileLikes.onclick = () => {
    console.log('Liking user:', profileUser.username);
    socket.emit('like-user', { targetUsername: profileUser.username });
  };
}

const btnProfileRep = document.getElementById('btn-profile-rep');
if (btnProfileRep) {
  btnProfileRep.onclick = () => {
    console.log('Repping user:', profileUser.username);
    socket.emit('rep-user', { targetUsername: profileUser.username });
  };
}

const btnProfileDelPic = document.getElementById('btn-profile-del-pic');
if (btnProfileDelPic) {
  btnProfileDelPic.onclick = () => {
    const isSelf = state.currentUser && state.currentUser.username === profileUser.username;
        const targetRank = profileUser.roleRank || (profileUser.group && profileUser.group.roleRank) || 0;
    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
    const isTargetHigherRank = !isSelf && targetRank >= myRank;

    const canDelPic = (hasPermission('canDeleteUserProfilePicture')) && !isTargetHigherRank;
    const canDelCover = (hasPermission('canDeleteUserCoverPicture')) && !isTargetHigherRank;
    const canDelFrame = (hasPermission('canDeleteUserMembershipFrame')) && !isTargetHigherRank;
    const canDelBg = (hasPermission('canDeleteUserMembershipBg')) && !isTargetHigherRank;
    
    const canUpPic = (hasPermission('canEditUsers')) && !isTargetHigherRank;
    const canUpCover = (hasPermission('canEditUsers')) && !isTargetHigherRank;
    const canUpFrame = (hasPermission('canDesignMembership') || hasPermission('canEditUsers')) && !isTargetHigherRank;
    const canUpBg = (hasPermission('canDesignMembership') || hasPermission('canEditUsers')) && !isTargetHigherRank;

    const identityHtml = window.renderUserIdentity ? window.renderUserIdentity(profileUser, { tag: 'span' }) : `<span>${profileUser.username}</span>`;

    const html = `
      <div class="p-1 text-right" style="direction: rtl; font-family: 'Helvetica Neue', Arial, sans-serif; text-align: right;">
        
        <div class="mb-3 text-center" style="border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
          <span class="text-secondary d-block mb-1" style="font-size: 0.8rem; font-weight: 500;">الملف الشخصي المستهدف</span>
          <div style="display: inline-block; padding: 4px 12px; background-color: #f8fafc; border-radius: 20px; border: 1px solid #edf2f7; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); vertical-align: middle;">
            ${identityHtml}
          </div>
        </div>
        
        <div class="mb-3">
          <label class="font-weight-bold mb-2 d-block text-secondary" style="font-size: 0.8rem; font-weight: 600; letter-spacing: 0.5px;">
            <i class="fas fa-trash-alt ml-1 text-danger"></i> أزرار الحذف السريع لخيارات الملف:
          </label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button class="btn btn-sm btn-outline-danger" id="admin-del-pic-btn" ${canDelPic ? '' : 'disabled'} style="font-size: 0.72rem; border-radius: 4px; padding: 4px 6px; line-height: 1.1; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 28px;">
              <i class="fas fa-user-circle"></i> حذف الصورة
            </button>
            <button class="btn btn-sm btn-outline-danger" id="admin-del-cover-btn" ${canDelCover ? '' : 'disabled'} style="font-size: 0.72rem; border-radius: 4px; padding: 4px 6px; line-height: 1.1; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 28px;">
              <i class="fas fa-image"></i> حذف الغلاف
            </button>
            <button class="btn btn-sm btn-outline-danger" id="admin-del-frame-btn" ${canDelFrame ? '' : 'disabled'} style="font-size: 0.72rem; border-radius: 4px; padding: 4px 6px; line-height: 1.1; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 28px;">
              <i class="fas fa-border-style"></i> حذف البرواز
            </button>
            <button class="btn btn-sm btn-outline-danger" id="admin-del-bg-btn" ${canDelBg ? '' : 'disabled'} style="font-size: 0.72rem; border-radius: 4px; padding: 4px 6px; line-height: 1.1; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 28px;">
              <i class="fas fa-palette"></i> حذف الخلفية
            </button>
          </div>
        </div>

        <div class="mb-1" style="border-top: 1px solid #edf2f7; padding-top: 12px;">
          <label class="font-weight-bold mb-2 d-block text-secondary" style="font-size: 0.8rem; font-weight: 600; letter-spacing: 0.5px;">
            <i class="fas fa-arrow-alt-circle-up ml-1 text-primary"></i> تحديث ورفع وسائط جديدة:
          </label>
          
          <div style="border-radius: 6px; border: 1px solid #e2e8f0; padding: 10px; background-color: #f8fafc; box-shadow: 0 1px 2px rgba(0,0,0,0.01);">
            <div class="form-group mb-0">
              <label class="mb-1 d-block text-dark font-weight-bold" style="font-size: 0.74rem; text-align: right; opacity: 0.85;">العنصر المراد تعديله:</label>
              <select id="admin-cosmetic-type-select" class="form-control form-control-sm" style="border-radius: 5px; font-size: 0.78rem; height: 30px; padding: 4px 6px; width: 100%; border: 1px solid #cbd5e1; margin-bottom: 8px;">
                <option value="pic" ${canUpPic ? '' : 'disabled'}>الصورة الشخصية (الأفاتار)</option>
                <option value="cover" ${canUpCover ? '' : 'disabled'}>صورة الغلاف (الكفر)</option>
                <option value="membershipFrame" ${canUpFrame ? '' : 'disabled'}>برواز تصميم العضوية</option>
                <option value="membershipBg" ${canUpBg ? '' : 'disabled'}>الخلفية الخاصة بتصميم العضوية</option>
              </select>
              
              <label class="mb-1 d-block text-dark font-weight-bold" style="font-size: 0.74rem; text-align: right; margin-top: 6px; opacity: 0.85;">الملف الجديد:</label>
              <div style="position: relative; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; background: white; border: 1px solid #cbd5e1; padding: 3px 6px; border-radius: 5px;">
                <i class="fas fa-file-image text-muted" style="font-size: 0.85rem;"></i>
                <input type="file" id="admin-cosmetic-file-input" accept="image/*" style="font-size: 0.74rem; border: none; outline: none; width: 100%; cursor: pointer;">
              </div>
              
              <button class="btn btn-sm btn-primary" id="admin-upload-cosmetic-btn" style="font-size: 0.78rem; border-radius: 5px; width: 100%; padding: 6px; background-color: #007bff; color: white; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 1px 2px rgba(0,123,255,0.1); transition: background-color 0.2s;">
                <i class="fas fa-cloud-upload-alt"></i> رفع وحفظ المستند الجديد
              </button>
            </div>
          </div>
          
        </div>
      </div>
    `;

    Swal.fire({
      title: 'إدارة صور الملف الشخصي',
      html: html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'إغلاق النافذة',
      customClass: {
        popup: 'custom-swal-cosmetics'
      },
      didOpen: () => {
        const handleDelelte = async (type, name) => {
          Swal.fire({
            title: 'تأكيد الحذف',
            text: `هل أنت متأكد من حذف ${name}؟`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'نعم، احذف',
            cancelButtonText: 'إلغاء'
          }).then(async (result) => {
            if (result.isConfirmed) {
              Swal.showLoading();
              try {
                const res = await fetch('/api/admin/users/delete-cosmetic', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                  },
                  body: JSON.stringify({
                    targetUserId: profileUser.id,
                    cosmeticType: type
                  })
                });
                const data = await res.json();
                if (data.success) {
                  Swal.fire('تم الحذف', `تم حذف ${name} بنجاح.`, 'success');
                  if (type === 'pic') {
                    profileUser.pic = null;
                  } else if (type === 'cover') {
                    profileUser.cover = null;
                  } else if (type === 'membershipFrame') {
                    profileUser.membershipFrame = null;
                  } else if (type === 'membershipBg') {
                    profileUser.membershipBg = null;
                  }
                  
                  // Reload profile modal elements with latest details
                  showUserProfile(profileUser.username);
                } else {
                  Swal.fire('خطأ', data.message || 'فشل حذف الملف', 'error');
                }
              } catch (err) {
                console.error(err);
                Swal.fire('خطأ', 'حدث خطأ في الاتصال بالسيرفر', 'error');
              }
            }
          });
        };

        const btnPic = document.getElementById('admin-del-pic-btn');
        if (btnPic) btnPic.onclick = () => handleDelelte('pic', 'الصورة الشخصية');

        const btnCover = document.getElementById('admin-del-cover-btn');
        if (btnCover) btnCover.onclick = () => handleDelelte('cover', 'صورة الغلاف');

        const btnFrame = document.getElementById('admin-del-frame-btn');
        if (btnFrame) btnFrame.onclick = () => handleDelelte('membershipFrame', 'برواز العضوية');

        const btnBg = document.getElementById('admin-del-bg-btn');
        if (btnBg) btnBg.onclick = () => handleDelelte('membershipBg', 'خلفية العضوية');

        const btnUpload = document.getElementById('admin-upload-cosmetic-btn');
        if (btnUpload) {
          btnUpload.onclick = async () => {
            const select = document.getElementById('admin-cosmetic-type-select');
            const fileInput = document.getElementById('admin-cosmetic-file-input');
            
            const selectedType = select ? select.value : 'pic';
            const file = fileInput && fileInput.files ? fileInput.files[0] : null;

            if (!file) {
              Swal.fire('تنبيه', 'الرجاء تحديد ملف لرفعه أولاً', 'warning');
              return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('cosmeticType', selectedType);

            Swal.showLoading();
            try {
              const res = await fetch(`/api/admin/users/${profileUser.id}/upload-cosmetic`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${getToken()}`
                },
                body: formData
              });
              const data = await res.json();
              if (data.success) {
                Swal.fire('تم التحديث', 'تم رفع وصياغة التصميم بنجاح', 'success');
                if (selectedType === 'pic') {
                  profileUser.pic = data.url;
                } else if (selectedType === 'cover') {
                  profileUser.cover = data.url;
                } else if (selectedType === 'membershipFrame') {
                  profileUser.membershipFrame = data.url;
                } else if (selectedType === 'membershipBg') {
                  profileUser.membershipBg = data.url;
                }
                
                showUserProfile(profileUser.username);
              } else {
                Swal.fire('خطأ', data.message || 'فشل تحديث الملف', 'error');
              }
            } catch (err) {
              console.error(err);
              Swal.fire('خطأ', 'حدث خطأ أثناء الرفع بالشبكة', 'error');
            }
          };
        }
      }
    });
  };
}

const btnProfileReveal = document.getElementById('btn-profile-reveal');
if (btnProfileReveal) {
  btnProfileReveal.onclick = () => {
    socket.emit('reveal-nickname', {
      targetUsername: profileUser.username,
      targetUserId: profileUser.id || profileUser.userId,
      targetType: (profileUser.type === 'guest' || profileUser.isGuest) ? 'guest' : 'member'
    });
  };
}

currentAddonMode = currentAddonMode || 'gift'; // 'gift' or 'super_icon'

function canCurrentUserSendEffects() {
  const effectiveLikeThreshold = (window.featuresSettings && window.featuresSettings.likes_effects !== undefined)
    ? Number(window.featuresSettings.likes_effects)
    : 0;
  const currentLikes = (state.currentUser && state.currentUser.likes) ? Number(state.currentUser.likes) : 0;
  if (effectiveLikeThreshold > 0 && currentLikes < effectiveLikeThreshold) {
    if (window.showLikesLimitAlert) {
      window.showLikesLimitAlert(`عذراً، تحتاج إلى ${effectiveLikeThreshold} لايك لإرسال التأثيرات. (لديك ${currentLikes})`);
    } else {
      showToast(`عذراً، تحتاج إلى ${effectiveLikeThreshold} لايك لإرسال التأثيرات. (لديك ${currentLikes})`, 'warning');
    }
    return false;
  }
  return true;
}

const btnProfileKiss = document.getElementById('btn-profile-kiss');
if (btnProfileKiss) {
  btnProfileKiss.onclick = () => {
    if (!canCurrentUserSendEffects()) return;
    if (profileUser && state.currentUser && profileUser.username !== state.currentUser.username) {
        socket.emit('kiss', { targetUsername: profileUser.username });
        showToast('تم إرسال البوسة!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('effectsModal'));
        if (modal) modal.hide();
    } else if (profileUser && state.currentUser && profileUser.username === state.currentUser.username) {
        showToast('لا يمكنك إرسال البوسة لنفسك!', 'warning');
    }
  };
}

const btnProfileSlap = document.getElementById('btn-profile-slap');
if (btnProfileSlap) {
  btnProfileSlap.onclick = () => {
    if (!canCurrentUserSendEffects()) return;
    if (profileUser && state.currentUser && profileUser.username !== state.currentUser.username) {
        socket.emit('slap', { targetUsername: profileUser.username });
        showToast('تم إرسال الكف!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('effectsModal'));
        if (modal) modal.hide();
    } else if (profileUser && state.currentUser && profileUser.username === state.currentUser.username) {
        showToast('لا يمكنك إرسال الكف لنفسك!', 'warning');
    }
  };
}

const btnProfileHug = document.getElementById('btn-profile-hug');
if (btnProfileHug) {
  btnProfileHug.onclick = () => {
    if (!canCurrentUserSendEffects()) return;
    if (profileUser && state.currentUser && profileUser.username !== state.currentUser.username) {
        socket.emit('hug', { targetUsername: profileUser.username });
        showToast('تم إرسال الحضن!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('effectsModal'));
        if (modal) modal.hide();
    } else if (profileUser && state.currentUser && profileUser.username === state.currentUser.username) {
        showToast('لا يمكنك إرسال الحضن لنفسك!', 'warning');
    }
  };
}

const btnProfileClap = document.getElementById('btn-profile-clap');
if (btnProfileClap) {
  btnProfileClap.onclick = () => {
    if (!canCurrentUserSendEffects()) return;
    if (profileUser && state.currentUser && profileUser.username !== state.currentUser.username) {
        socket.emit('clap', { targetUsername: profileUser.username });
        showToast('تم إرسال التصفيق!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('effectsModal'));
        if (modal) modal.hide();
    } else if (profileUser && state.currentUser && profileUser.username === state.currentUser.username) {
        showToast('لا يمكنك إرسال التصفيق لنفسك!', 'warning');
    }
  };
}

const btnProfileGift = document.getElementById('btn-profile-gift');
if (btnProfileGift) {
  btnProfileGift.onclick = () => {
    currentAddonMode = 'gift';
    
    // Update Addon Header
    const addonHeaderAvatar = document.getElementById('addon-header-avatar');
    if (addonHeaderAvatar) addonHeaderAvatar.src = window.getAvatarUrl(profileUser);
    
    const addonHeaderTopic = document.getElementById('addon-header-topic');
    if (addonHeaderTopic) {
      addonHeaderTopic.innerHTML = profileUser.topic || profileUser.username;
      addonHeaderTopic.style.color = profileUser.ucol || '#ffffff';
    }
    
    const addonHeaderBanner = document.getElementById('addon-header-banner');
    if (addonHeaderBanner) {
      if (profileUser.superIcon) {
        addonHeaderBanner.src = profileUser.superIcon;
        addonHeaderBanner.classList.remove('d-none');
      } else {
        addonHeaderBanner.classList.add('d-none');
      }
    }
    
    const btnRemoveAddon = document.getElementById('btn-remove-addon');
    const removeAddonText = document.getElementById('remove-addon-text');
    if (removeAddonText) removeAddonText.innerText = 'حذف الهدايا';
    if (btnRemoveAddon) btnRemoveAddon.classList.remove('d-none');

    loadAddons();
    manageAddonsModal.show();
  };
}

const btnProfileMuteRoom = document.getElementById('btn-profile-mute-room');
if (btnProfileMuteRoom) {
  btnProfileMuteRoom.onclick = () => {
    if (profileUser.isMutedRoom) {
      socket.emit('room-unmute-user', { targetUsername: profileUser.username, roomId: state.currentRoomId });
      profileUser.isMutedRoom = false;
    } else {
      socket.emit('room-mute-user', { targetUsername: profileUser.username, roomId: state.currentRoomId });
      profileUser.isMutedRoom = true;
    }
    updateProfileButtons(profileUser, 5000);
  };
}

const btnProfileMuteGlobal = document.getElementById('btn-profile-mute-global');
if (btnProfileMuteGlobal) {
  btnProfileMuteGlobal.onclick = () => {
    if (profileUser.isMutedWall || profileUser.isMuted) {
      socket.emit('unmute-user', { targetUsername: profileUser.username });
      profileUser.isMuted = false;
      profileUser.isMutedWall = false;
    } else {
      socket.emit('mute-user', { targetUsername: profileUser.username });
      profileUser.isMuted = true;
      profileUser.isMutedWall = true;
    }
    updateProfileButtons(profileUser, 5000);
  };
}

const btnProfileMute = document.getElementById('btn-profile-mute');
if (btnProfileMute) {
  btnProfileMute.onclick = () => {
    const targetRank = profileUser.roleRank || (profileUser.group && profileUser.group.roleRank) || 0;
    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
    const canAffect = myRank > targetRank;
    
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    
    const canMuteRoomStatus = hasPermission('canMuteUsers') || (isModerator && roomPermissions.includes('canMuteUsers'));
    const isSameRoom = profileUser.roomId === state.currentRoomId;
    
    const showMuteRoom = canMuteRoomStatus && canAffect && isSameRoom;
    const showMuteGlobal = hasPermission('canMuteUsers') && canAffect;

    if (!showMuteRoom && !showMuteGlobal) return;

    if (showMuteRoom && !showMuteGlobal) {
      const roomBtn = document.getElementById('btn-profile-mute-room');
      if (roomBtn) roomBtn.click();
      return;
    }

    if (showMuteGlobal && !showMuteRoom) {
      const globalBtn = document.getElementById('btn-profile-mute-global');
      if (globalBtn) globalBtn.click();
      return;
    }

    let html = '<div class="list-group text-right" style="direction: rtl; gap: 8px; display: flex; flex-direction: column;">';
    
    if (showMuteRoom) {
      const isRoomMuted = profileUser.isMutedRoom === true || profileUser.isMutedRoom === 'true';
      const btnClass = isRoomMuted ? 'text-success' : 'text-danger';
      const btnBg = isRoomMuted ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)';
      const btnBorder = isRoomMuted ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)';
      const label = isRoomMuted ? 'فك إسكات من الغرفة' : 'إسكات من الكلام في الغرفة';
      const icon = isRoomMuted ? 'fa-microphone' : 'fa-microphone-slash';
      
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded ${btnClass} font-weight-bold" id="opt-mute-room" style="background: ${btnBg}; border: 1px solid ${btnBorder} !important; cursor: pointer; text-align: right;">
          <span><i class="fas ${icon} ms-2"></i> ${label}</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    
    if (showMuteGlobal) {
      const isWallMuted = profileUser.isMutedWall === true || profileUser.isMutedWall === 'true' || profileUser.isMuted === true || profileUser.isMuted === 'true';
      const btnClass = isWallMuted ? 'text-success' : 'text-danger';
      const btnBg = isWallMuted ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)';
      const btnBorder = isWallMuted ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)';
      const label = isWallMuted ? 'فك إسكات الحائط' : 'إسكات من الكلام بالحائط';
      const icon = isWallMuted ? 'fa-microphone' : 'fa-microphone-slash';
      
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded ${btnClass} font-weight-bold" id="opt-mute-global" style="background: ${btnBg}; border: 1px solid ${btnBorder} !important; cursor: pointer; text-align: right;">
          <span><i class="fas ${icon} ms-2"></i> ${label}</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    
    html += '</div>';

    Swal.fire({
      title: 'خيارات إسكات العضو',
      html: html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'إلغاء',
      customClass: {
        popup: 'mute-options-popup'
      },
      didOpen: () => {
        const optRoom = document.getElementById('opt-mute-room');
        const optGlobal = document.getElementById('opt-mute-global');

        if (optRoom) {
          optRoom.onclick = () => {
            Swal.close();
            const originalMuteRoomBtn = document.getElementById('btn-profile-mute-room');
            if (originalMuteRoomBtn) originalMuteRoomBtn.click();
          };
        }
        if (optGlobal) {
          optGlobal.onclick = () => {
            Swal.close();
            const originalMuteGlobalBtn = document.getElementById('btn-profile-mute-global');
            if (originalMuteGlobalBtn) originalMuteGlobalBtn.click();
          };
        }
      }
    });
  };
}

const btnProfileKickRoom = document.getElementById('btn-profile-kick-room');
if (btnProfileKickRoom) {
  btnProfileKickRoom.onclick = () => {
    socket.emit('room-kick-user', { targetUsername: profileUser.username, roomId: state.currentRoomId });
  };
}

const btnProfileKickGlobal = document.getElementById('btn-profile-kick-global');
if (btnProfileKickGlobal) {
  btnProfileKickGlobal.onclick = () => {
    profileModal.hide();
    Swal.fire({
      title: 'طرد الشات',
      text: 'هل أنت متأكد من طرد هذا المستخدم من الشات؟',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'نعم، اطرد',
      cancelButtonText: 'إلغاء'
    }).then((result) => {
      if (result.isConfirmed) {
        socket.emit('kick-user', { targetUsername: profileUser.username });
      } else {
        showUserProfile(profileUser.username);
      }
    });
  };
}

const btnProfileKick = document.getElementById('btn-profile-kick');
if (btnProfileKick) {
  btnProfileKick.onclick = () => {
    const targetRank = profileUser.roleRank || (profileUser.group && profileUser.group.roleRank) || 0;
    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
        const canAffect = myRank > targetRank;
    
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canKick = hasPermission('canKickUsers') || (isModerator && roomPermissions.includes('canKickUsers'));
    const isSameRoom = profileUser.roomId === state.currentRoomId;

    const showKickRoom = canKick && canAffect && isSameRoom;
    const showKickGlobal = hasPermission('canKickUsers') && canAffect;

    // Build options HTML
    let html = '<div class="list-group text-right" style="direction: rtl; gap: 8px; display: flex; flex-direction: column;">';
    if (showKickGlobal) {
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-danger font-weight-bold" id="opt-kick-global" style="background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.2) !important; cursor: pointer; text-align: right;">
          <span><i class="fas fa-sign-out-alt ms-2"></i> طرد من الدردشة</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    if (showKickRoom) {
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-dark font-weight-bold" id="opt-kick-room" style="background: rgba(108, 117, 125, 0.1); border: 1px solid rgba(108, 117, 125, 0.2) !important; cursor: pointer; text-align: right;">
          <span><i class="fas fa-user-minus ms-2"></i> طرد من الغرفة</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    html += '</div>';

    Swal.fire({
      title: 'خيارات طرد العضو',
      html: html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'إلغاء',
      customClass: {
        popup: 'kick-options-popup'
      },
      didOpen: () => {
        const optGlobal = document.getElementById('opt-kick-global');
        const optRoom = document.getElementById('opt-kick-room');

        if (optGlobal) {
          optGlobal.onclick = () => {
            Swal.close();
            const originalKickGlobalBtn = document.getElementById('btn-profile-kick-global');
            if (originalKickGlobalBtn) originalKickGlobalBtn.click();
          };
        }
        if (optRoom) {
          optRoom.onclick = () => {
            Swal.close();
            const originalKickRoomBtn = document.getElementById('btn-profile-kick-room');
            if (originalKickRoomBtn) originalKickRoomBtn.click();
          };
        }
      }
    });
  };
}

const btnProfileBan = document.getElementById('btn-profile-ban');
if (btnProfileBan) {
  btnProfileBan.onclick = () => {
    const targetRank = profileUser.roleRank || (profileUser.group && profileUser.group.roleRank) || 0;
    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
        const canAffect = myRank > targetRank;
    
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canBan = hasPermission('canBanUsers') || (isModerator && roomPermissions.includes('canBanUsers'));
    const isSameRoom = profileUser.roomId === state.currentRoomId;

    const showBanRoom = canBan && canAffect && isSameRoom;
    const showBanGlobal = hasPermission('canBanUsers') && canAffect;

    // Build options HTML
    let html = '<div class="list-group text-right" style="direction: rtl; gap: 8px; display: flex; flex-direction: column;">';
    if (showBanGlobal) {
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-danger font-weight-bold" id="opt-ban-perm" style="background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.2) !important; cursor: pointer; text-align: right;">
          <span><i class="fas fa-ban ms-2"></i> حظر دائم</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-warning font-weight-bold" id="opt-ban-temp" style="background: rgba(253, 126, 20, 0.1); border: 1px solid rgba(253, 126, 20, 0.2) !important; cursor: pointer; text-align: right; color: #856404 !important;">
          <span><i class="fas fa-clock ms-2"></i> حظر مؤقت</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    if (showBanRoom) {
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-dark font-weight-bold" id="opt-ban-room" style="background: rgba(108, 117, 125, 0.1); border: 1px solid rgba(108, 117, 125, 0.2) !important; cursor: pointer; text-align: right;">
          <span><i class="fas fa-user-slash ms-2"></i> حظر من الغرفة</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    html += '</div>';

    Swal.fire({
      title: 'خيارات حظر العضو',
      html: html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'إلغاء',
      customClass: {
        popup: 'ban-options-popup'
      },
      didOpen: () => {
        const optPerm = document.getElementById('opt-ban-perm');
        const optTemp = document.getElementById('opt-ban-temp');
        const optRoom = document.getElementById('opt-ban-room');

        if (optPerm) {
          optPerm.onclick = () => {
            Swal.close();
            const originalBanPermBtn = document.getElementById('btn-profile-ban-permanent');
            if (originalBanPermBtn) originalBanPermBtn.click();
          };
        }
        if (optTemp) {
          optTemp.onclick = () => {
            Swal.close();
            const originalBanTempBtn = document.getElementById('btn-profile-ban-temporary');
            if (originalBanTempBtn) originalBanTempBtn.click();
          };
        }
        if (optRoom) {
          optRoom.onclick = () => {
            Swal.close();
            const originalBanRoomBtn = document.getElementById('btn-profile-ban-room');
            if (originalBanRoomBtn) originalBanRoomBtn.click();
          };
        }
      }
    });
  };
}

const btnProfileBanRoom = document.getElementById('btn-profile-ban-room');
if (btnProfileBanRoom) {
  btnProfileBanRoom.onclick = async () => {
    profileModal.hide();
    const { value: reason } = await Swal.fire({
      title: 'حظر من الغرفة',
      input: 'text',
      inputLabel: 'سبب الحظر',
      showCancelButton: true,
      confirmButtonText: 'حظر',
      cancelButtonText: 'إلغاء'
    });
    if (reason !== undefined) {
      socket.emit('room-ban-user', { targetUsername: profileUser.username, roomId: state.currentRoomId, reason });
    } else {
      showUserProfile(profileUser.username);
    }
  };
}

const btnProfileBanPermanent = document.getElementById('btn-profile-ban-permanent');
if (btnProfileBanPermanent) {
  btnProfileBanPermanent.onclick = async () => {
    profileModal.hide();
    const { value: reason } = await Swal.fire({
      title: 'حظر نهائي',
      input: 'text',
      inputLabel: 'سبب الحظر',
      showCancelButton: true,
      confirmButtonText: 'حظر نهائي',
      cancelButtonText: 'إلغاء'
    });
    if (reason !== undefined) {
      socket.emit('ban-user', { username: profileUser.username, type: 'permanent', reason });
    } else {
      showUserProfile(profileUser.username);
    }
  };
}

const btnProfileReport = document.getElementById('btn-profile-report');
if (btnProfileReport) {
  btnProfileReport.onclick = () => {
    profileModal.hide();
    const reportUserModalEl = document.getElementById('reportUserModal');
    if (reportUserModalEl) {
      const modal = bootstrap.Modal.getInstance(reportUserModalEl) || new bootstrap.Modal(reportUserModalEl);
      modal.show();
    }
  };
}

const btnSubmitReport = document.getElementById('btn-submit-report');
if (btnSubmitReport) {
  btnSubmitReport.onclick = async () => {
    const reasonInput = document.getElementById('report-reason-input');
    const reason = reasonInput.value;
    if (!reason || reason.trim() === '') {
        document.getElementById('report-reason-error').classList.remove('d-none');
        return;
    }
    document.getElementById('report-reason-error').classList.add('d-none');
    
    let proofImage = null;
    const fileInput = document.getElementById('report-file-input');
    const uploadProgress = document.getElementById('report-upload-progress');
    
    if (fileInput.files && fileInput.files.length > 0) {
        try {
            uploadProgress.classList.remove('d-none');
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            
            const response = await safeFetch('/api/upload/report', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if(result.success) {
                proofImage = result.url;
            } else {
                throw new Error(result.message || 'فشل رفع الصورة');
            }
        } catch (err) {
            showToast(err.message, 'error');
            return;
        } finally {
            uploadProgress.classList.add('d-none');
        }
    }
    
    socket.emit('report-user', { targetUsername: profileUser.username, reason, proofImage }, (response) => {
        if (response.success) {
            Swal.fire({ title: 'نجاح', text: response.message, icon: 'success' });
            const modal = bootstrap.Modal.getInstance(document.getElementById('reportUserModal'));
            if(modal) modal.hide();
            reasonInput.value = '';
            fileInput.value = '';
        } else {
            Swal.fire({ title: 'خطأ', text: response.message, icon: 'error' });
        }
    });
  };
}

// Handle Temporary Ban
const btnProfileBanTemporary = document.getElementById('btn-profile-ban-temporary');

if (btnProfileBanTemporary) {
  btnProfileBanTemporary.onclick = async () => {
    profileModal.hide();

    const durationResult = await Swal.fire({
      title: 'حظر مؤقت',
      input: 'select',
      inputLabel: 'اختر مدة الحظر',
      inputOptions: {
        1: '1 دقيقة',
        5: '5 دقائق',
        10: '10 دقائق',
        20: '20 دقيقة',
        30: '30 دقيقة',
        60: '1 ساعة',
        120: '2 ساعتين',
        360: '6 ساعات',
        720: '12 ساعة',
        1440: '24 ساعة',
        2880: 'يومين',
        4320: '3 أيام',
        10080: '7 أيام',
        43200: '30 يوم'
      },
      inputValue: '20',
      showCancelButton: true,
      confirmButtonText: 'التالي',
      cancelButtonText: 'إلغاء',
      inputValidator: (value) => {
        const duration = Number(value);
        if (!Number.isFinite(duration) || duration <= 0) {
          return 'مدة الحظر المؤقت غير صحيحة';
        }
        return null;
      }
    });

    if (!durationResult.isConfirmed) {
      showUserProfile(profileUser.username);
      return;
    }

    const duration = Number(durationResult.value);

    if (!Number.isFinite(duration) || duration <= 0) {
      Swal.fire('تنبيه', 'مدة الحظر المؤقت غير صحيحة من الواجهة', 'error');
      return;
    }

    const reasonResult = await Swal.fire({
      title: 'سبب الحظر',
      input: 'text',
      inputLabel: 'السبب',
      inputPlaceholder: 'اكتب سبب الحظر أو اتركه فارغًا',
      showCancelButton: true,
      confirmButtonText: 'حظر مؤقت',
      cancelButtonText: 'إلغاء'
    });

    if (!reasonResult.isConfirmed) {
      showUserProfile(profileUser.username);
      return;
    }

    const payload = {
      username: profileUser.username,
      type: 'temporary',
      duration: duration,
      durationMinutes: duration,
      reason: reasonResult.value || '',
      country: profileUser.country,
      roomId: state.currentRoomId
    };

    console.log('[TEMP BAN PAYLOAD FINAL]', payload);

    socket.emit('ban-user', payload);
  };
}

const btnProfileBanner = document.getElementById('btn-profile-banner');
if (btnProfileBanner) {
  btnProfileBanner.onclick = () => {
    currentAddonMode = 'super_icon';
    
    // Update Addon Header
    const addonHeaderAvatar = document.getElementById('addon-header-avatar');
    if (addonHeaderAvatar) addonHeaderAvatar.src = window.getAvatarUrl(profileUser);
    
    const addonHeaderTopic = document.getElementById('addon-header-topic');
    if (addonHeaderTopic) {
      addonHeaderTopic.innerHTML = profileUser.topic || profileUser.username;
      addonHeaderTopic.style.color = profileUser.ucol || '#ffffff';
    }
    
    const addonHeaderBanner = document.getElementById('addon-header-banner');
    if (addonHeaderBanner) {
      if (profileUser.superIcon) {
        addonHeaderBanner.src = profileUser.superIcon;
        addonHeaderBanner.classList.remove('d-none');
      } else {
        addonHeaderBanner.classList.add('d-none');
      }
    }

    const btnRemoveAddon = document.getElementById('btn-remove-addon');
    const removeAddonText = document.getElementById('remove-addon-text');
    if (removeAddonText) removeAddonText.innerText = 'حذف البنر';
    if (btnRemoveAddon) btnRemoveAddon.classList.remove('d-none');

    loadAddons();
    manageAddonsModal.show();
  };
}

const btnAddonsBack = document.getElementById('btn-addons-back');
if (btnAddonsBack) {
  btnAddonsBack.onclick = () => {
    manageAddonsModal.hide();
  };
}

const btnProfileDelFrame = document.getElementById('btn-profile-del-frame');
if (btnProfileDelFrame) {
  btnProfileDelFrame.onclick = () => {
    socket.emit('delete-user-frame', { targetUsername: profileUser.username });
  };
}

const btnProfileDelBg = document.getElementById('btn-profile-del-bg');
if (btnProfileDelBg) {
  btnProfileDelBg.onclick = () => {
    socket.emit('delete-user-bg', { targetUsername: profileUser.username });
  };
}

const btnProfileDelLink = document.getElementById('btn-profile-del-link');
if (btnProfileDelLink) {
  btnProfileDelLink.onclick = () => {
    socket.emit('delete-user-link', { targetUsername: profileUser.username });
  };
}

const btnProfileIgnore = document.getElementById('btn-profile-ignore');
if (btnProfileIgnore) {
  btnProfileIgnore.onclick = () => {
    const isIgnored = state.ignoredUsers.has(profileUser.username);
    if (isIgnored) {
      state.ignoredUsers.delete(profileUser.username);
      showToast(`تم إلغاء تجاهل ${profileUser.topic || profileUser.username}`, 'success');
    } else {
      state.ignoredUsers.add(profileUser.username);
      showToast(`تم تجاهل ${profileUser.topic || profileUser.username}`, 'success');
    }
    saveIgnoredUsers();
    profileModal.hide();
  };
}

var manageAddonsModalEl = document.getElementById('manageAddonsModal');
var effectsModalEl = document.getElementById('effectsModal');
var manageAddonsModal = manageAddonsModalEl ? new bootstrap.Modal(manageAddonsModalEl) : null;
var effectsModal = effectsModalEl ? new bootstrap.Modal(effectsModalEl) : null;

if (effectsModalEl) {
  effectsModalEl.addEventListener('show.bs.modal', (e) => {
    effectsModalEl.style.setProperty('z-index', '1300', 'important');
    const effectiveLikeThreshold = (window.featuresSettings && window.featuresSettings.likes_effects !== undefined)
      ? Number(window.featuresSettings.likes_effects)
      : 0;
    const currentLikes = (state.currentUser && state.currentUser.likes) ? Number(state.currentUser.likes) : 0;
    if (effectiveLikeThreshold > 0 && currentLikes < effectiveLikeThreshold) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (window.showLikesLimitAlert) {
        window.showLikesLimitAlert(`عذراً، تحتاج إلى ${effectiveLikeThreshold} لايك لإرسال التأثيرات. (لديك ${currentLikes})`);
      } else {
        showToast(`عذراً، تحتاج إلى ${effectiveLikeThreshold} لايك لإرسال التأثيرات. (لديك ${currentLikes})`, 'warning');
      }
    }
  });
}

if (manageAddonsModalEl) {
  manageAddonsModalEl.addEventListener('show.bs.modal', () => {
    manageAddonsModalEl.style.setProperty('z-index', '1300', 'important');
  });
  manageAddonsModalEl.addEventListener('shown.bs.modal', () => {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    if (backdrops.length > 1) {
      backdrops[backdrops.length - 1].style.setProperty('z-index', '1250', 'important');
    }
  });
  manageAddonsModalEl.addEventListener('hidden.bs.modal', () => {
    // Ensure body keeps modal-open class if profile modal is still open
    const userProfileModalEl = document.getElementById('userProfileModal');
    if (userProfileModalEl && userProfileModalEl.classList.contains('show')) {
      document.body.classList.add('modal-open');
    }
  });
}

const btnManageAddonsTop = document.getElementById('btn-manage-addons');
if (btnManageAddonsTop) {
  btnManageAddonsTop.onclick = async () => {
    // Update Addon Header
    const addonHeaderAvatar = document.getElementById('addon-header-avatar');
    if (addonHeaderAvatar) addonHeaderAvatar.src = window.getAvatarUrl(profileUser);
    
    const addonHeaderTopic = document.getElementById('addon-header-topic');
    if (addonHeaderTopic) {
      addonHeaderTopic.innerHTML = profileUser.topic || profileUser.username;
      addonHeaderTopic.style.color = profileUser.ucol || '#ffffff';
    }
    
    const addonHeaderBanner = document.getElementById('addon-header-banner');
    if (addonHeaderBanner) {
      if (profileUser.superIcon) {
        addonHeaderBanner.src = profileUser.superIcon;
        addonHeaderBanner.classList.remove('d-none');
      } else {
        addonHeaderBanner.classList.add('d-none');
      }
    }
    
    // Handle tab visibility based on permissions
    const tabSuperIcon = document.getElementById('tab-item-super-icon');
    const tabGifts = document.getElementById('tab-item-gifts');
    const canAssignSuperIcon = hasPermission('canAssignSuperIcon');
    const canSendGifts = hasPermission('canSendGifts');

    if (canAssignSuperIcon) {
      if (tabSuperIcon) tabSuperIcon.classList.remove('d-none');
    } else {
      if (tabSuperIcon) tabSuperIcon.classList.add('d-none');
    }

    if (canSendGifts) {
      if (tabGifts) tabGifts.classList.remove('d-none');
    } else {
      if (tabGifts) tabGifts.classList.add('d-none');
    }

    // Activate the first available tab
    if (canAssignSuperIcon) {
      const superIconTab = document.getElementById('super-icon-tab');
      if (superIconTab) superIconTab.click();
    } else if (canSendGifts) {
      const giftsTab = document.getElementById('gifts-tab');
      if (giftsTab) giftsTab.click();
    }

    // Fetch and render available addons
    loadAddons();
    
    if (manageAddonsModal) {
      manageAddonsModal.show();
    }
  };
}

async function loadAddons() {
  const grid = document.getElementById('available-addons-grid');
  if (!grid) return;

  grid.innerHTML = '<div class="text-center w-100 p-4"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';

  try {
    const response = await fetch('/api/admin/addons', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (response.ok) {
      const allAddons = await response.json();
      const filtered = allAddons.filter(a => a.type === currentAddonMode);
      
      if (filtered.length === 0) {
        grid.innerHTML = '<div class="text-center w-100 p-4 text-muted">لا توجد إضافات متاحة حالياً.</div>';
        return;
      }

      grid.innerHTML = filtered.map(addon => `
        <div class="addon-item border rounded p-1 text-center d-flex align-items-center justify-content-center" style="cursor: pointer; height: 32px; min-width: 38px;" onclick="selectAddon('${addon.url}', '${addon.type}')" title="${addon.name}">
          <img src="${addon.url}" alt="${addon.name}" style="height: 18px; width: auto; object-fit: contain;" onload="if(this.naturalWidth > 100) { this.parentElement.classList.add('w-100', 'p-2'); this.parentElement.style.height = 'auto'; this.parentElement.style.order = '100'; }">
        </div>
      `).join('');
    } else {
      grid.innerHTML = '<div class="text-center w-100 p-4 text-danger">فشل في تحميل الإضافات.</div>';
    }
  } catch (err) {
    console.error('Error loading addons:', err);
    grid.innerHTML = '<div class="text-center w-100 p-4 text-danger">حدث خطأ أثناء التحميل.</div>';
  }
}

window.selectAddon = async (url, type) => {
  if (type === 'gift') {
    await assignGift(url);
  } else if (type === 'super_icon') {
    await assignSuperIcon(url);
  }
};

var btnRemoveAddon = document.getElementById('btn-remove-addon');
if (btnRemoveAddon) {
  btnRemoveAddon.onclick = async () => {
    if (currentAddonMode === 'super_icon') {
      Swal.fire({
        title: 'تأكيد الإزالة',
        text: 'هل أنت متأكد من إزالة البنر؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم',
        cancelButtonText: 'إلغاء'
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const botId = profileUser.isVirtualUser && profileUser.socketId?.startsWith('bot-')
              ? Number(profileUser.socketId.replace('bot-', ''))
              : null;
            const response = await fetch('/api/admin/addons/remove-super-icon', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
              },
              body: JSON.stringify({ 
                userId: profileUser.userId || profileUser.id || profileUser.username,
                isVirtualUser: !!profileUser.isVirtualUser,
                socketId: profileUser.socketId || null,
                botId
              })
            });
            if (response.ok) {
              profileUser.superIcon = null;
              manageAddonsModal.hide();
            } else {
              const data = await response.json().catch(() => ({}));
              showToast(data.message || 'فشل في إزالة البنر.');
            }
          } catch (err) { console.error(err); }
        }
      });
    } else {
      Swal.fire({
        title: 'تأكيد الإزالة',
        text: 'هل أنت متأكد من إزالة جميع الهدايا؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم',
        cancelButtonText: 'إلغاء'
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const response = await fetch('/api/admin/addons/remove-gift', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
              },
              body: JSON.stringify({ userId: profileUser.userId || profileUser.id || profileUser.username, giftUrl: profileUser.gifts[0] })
            });
            if (response.ok) {
              profileUser.gifts = [];
              manageAddonsModal.hide();
            }
          } catch (err) { console.error(err); }
        }
      });
    }
  };
}

async function assignSuperIcon(url) {
  try {
    const botId = profileUser.isVirtualUser && profileUser.socketId?.startsWith('bot-')
      ? Number(profileUser.socketId.replace('bot-', ''))
      : null;
    const response = await fetch('/api/admin/addons/assign-super-icon', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ 
        userId: profileUser.userId || profileUser.id || profileUser.username, 
        iconUrl: url,
        isVirtualUser: !!profileUser.isVirtualUser,
        socketId: profileUser.socketId || null,
        botId
      })
    });
    
    if (response.ok) {
      profileUser.superIcon = url;
      manageAddonsModal.hide();
    } else {
      const data = await response.json().catch(() => ({}));
      showToast(data.message || 'فشل في تعيين الأيقونة.');
    }
  } catch (err) {
    console.error('Error assigning super icon:', err);
  }
}
window.assignSuperIcon = assignSuperIcon;

async function assignGift(url) {
  try {
    const response = await fetch('/api/admin/addons/assign-gift', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ userId: profileUser.userId || profileUser.id || profileUser.username, giftUrl: url })
    });
    
    if (response.ok) {
      if (!profileUser.gifts) profileUser.gifts = [];
      if (!profileUser.gifts.includes(url)) {
        profileUser.gifts.push(url);
      }
      manageAddonsModal.hide();
    } else {
      showToast('فشل في إرسال الهدية.');
    }
  } catch (err) {
    console.error('Error assigning gift:', err);
  }
}

function extractYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}
window.assignGift = assignGift;

async function removeGift(url) {
  Swal.fire({
    title: 'تأكيد الإزالة',
    text: 'هل أنت متأكد من إزالة هذه الهدية؟',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم',
    cancelButtonText: 'إلغاء'
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        const response = await fetch('/api/admin/addons/remove-gift', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
          },
          body: JSON.stringify({ userId: profileUser.userId || profileUser.id || profileUser.username, giftUrl: url })
        });
        
        if (response.ok) {
          if (profileUser.gifts) {
            profileUser.gifts = [];
          }
          showToast('تم إزالة الهدية بنجاح', 'success');
          // Update UI components
          showUserProfile(profileUser.username);
        } else {
          showToast('فشل في إزالة الهدية.');
        }
      } catch (err) {
        console.error('Error removing gift:', err);
      }
    }
  });
}
window.removeGift = removeGift;


window.stopLightboxVideo = () => {
  const video = document.getElementById('lightbox-video');
  if (video) {
    video.pause();
    video.currentTime = 0;
  }
};

window.openLightbox = (url) => {
  if (ui.lightbox && ui.lightboxImg) {
    ui.lightboxImg.classList.remove('is-tall-image');
    ui.lightboxImg.onload = null;

    ui.lightboxImg.onload = function() {
      const ratio = this.naturalHeight / this.naturalWidth;
      if (ratio > 1.6) {
        this.classList.add('is-tall-image');
      } else {
        this.classList.remove('is-tall-image');
      }
    };

    ui.lightboxImg.src = url;
    ui.lightboxImg.style.display = 'block';
    const video = document.getElementById('lightbox-video');
    if (video) {
      video.style.display = 'none';
      video.pause();
      video.currentTime = 0;
    }
    history.pushState({ lightbox: true }, '');
    ui.lightbox.classList.add('show');
  }
};

window.showChatAlert = ({ message, senderName, senderAvatar, showSender = false, icon = 'info', isHtml = false }) => {
  const msgContent = isHtml ? message : escapeHTML(message);
  let html = `<div style="text-align: center; direction: rtl; font-family: inherit;">
    <div style="margin-bottom: 5px; font-size: inherit;">${msgContent}</div>
  </div>`;

  if (showSender && senderName) {
    let senderHtml = `<div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0;">`;
    if (senderAvatar) {
      senderHtml += `<img src="${escapeHTML(senderAvatar)}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd;" onerror="this.onerror=null;this.src='/uploads/site/default.png';">`;
    }
    const safeSenderName = isHtml ? senderName : escapeHTML(senderName);
    senderHtml += `<span style="font-weight: bold; font-size: inherit;">${safeSenderName}</span></div>`;
    
    html = senderHtml + html;
  }

  return Swal.fire({
    title: 'تنبيه',
    html: html,
    icon: icon !== 'none' ? icon : undefined,
    confirmButtonText: 'موافق',
    customClass: {
      popup: 'site-font-modal', // Make sure this will inherit site font
      content: 'site-font-modal-content'
    }
  });
};

window.openVideoLightbox = (url) => {
  if (ui.lightbox) {
    const video = document.getElementById('lightbox-video');
    if (video) {
      video.src = url;
      video.style.display = 'block';
      video.play();
    }
    if (ui.lightboxImg) ui.lightboxImg.style.display = 'none';
    history.pushState({ lightbox: true }, '');
    ui.lightbox.classList.add('show');
  }
};

// Lightbox Logic
if (ui.lightbox && ui.lightboxClose) {
  const closeLightbox = () => {
    if (history.state && history.state.lightbox) {
      history.back();
    } else {
      ui.lightbox.classList.remove('show');
      window.stopLightboxVideo();
      if (ui.lightboxImg) {
        ui.lightboxImg.classList.remove('is-tall-image');
        ui.lightboxImg.onload = null;
      }
    }
  };

  ui.lightboxClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closeLightbox();
  });

  ui.lightbox.addEventListener('click', (e) => {
    if (e.target === ui.lightbox) {
      e.stopPropagation();
      closeLightbox();
    }
  });
}

// Sidebar handling
document.addEventListener('click', (e) => {
  if (e.target.closest('.sidebar-action')) {
    if (window.PrivateChatManager && window.PrivateChatManager.isWindowOpen) {
      window.PrivateChatManager.closeChat();
    }
  }
});

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
  const sidebar = ui.sidebar;
  const target = e.target;
  
  // 1. If click is inside sidebar, do nothing
  if (sidebar && sidebar.contains(target)) return;
  
  // New: If target was removed from DOM (likely a re-render), do nothing
  if (target && !target.isConnected) return;

  // Safety check for closest
  if (!target || typeof target.closest !== 'function') return;

  // New: If click is on a sidebar-action, the file-input, or emoji-picker, do nothing
  if (target.closest('.sidebar-action') || target === ui.fileInput || target.closest('#emoji-picker') || target.closest('.story-add-btn') || target.id === 'direct-story-media-input') return;

  // 2. If click is on a toggle button, do nothing (let the toggle handle it)
  if (target.closest('#users-tab-btn') || 
      target.closest('#private-tab-btn') || 
      target.closest('#rooms-tab-btn') || 
      target.closest('#wall-tab-btn') || 
      target.closest('#games-tab-btn') || 
      target.closest('#settings-btn')) return;

  // 3. If click is on the modal backdrop or inside a modal, do nothing
  if (target.classList.contains('modal-backdrop') || 
      target.closest('.modal') || 
      target.closest('[class*="swal2"]') || 
      target.closest('.classic-alert-overlay') || 
      target.closest('.comment-modal-overlay')) return;

  // 4. If click is on an image in the wall or a media placeholder, do nothing (let the wall handle it)
  if (target.tagName === 'IMG' && (target.closest('.wall-post-content') || target.closest('.wall-post-avatar'))) return;
  if (target.closest('.media-placeholder')) return;

  // 5. If sidebar is open, close it
  if (sidebar && sidebar.classList.contains('open')) {
    closeSidebar();
  }
});

// Global event listener for clicking on images in chat
document.addEventListener('click', (e) => {
  const username = e.target.dataset.username;
  if (username) {
    // Only show profile if clicking on the avatar (message, quoted, or mic)
    if (e.target.classList.contains('message-avatar') || 
        e.target.classList.contains('quoted-avatar') || 
        e.target.classList.contains('mic-user-avatar')) {
      e.preventDefault();

      const isTargetHidden = e.target.getAttribute('data-is-hidden') === 'true' || e.target.dataset.isHidden === 'true';
      const targetRank = parseInt(e.target.getAttribute('data-role-rank') || e.target.dataset.roleRank || '0', 10);
      const myRank = (state.currentUser && (state.currentUser.group && state.currentUser.group.roleRank !== undefined ? state.currentUser.group.roleRank : state.currentUser.roleRank)) || 0;

      if (isTargetHidden && myRank < targetRank) {
        showToast('لا يمكن عرض الملف الشخصي للأعضاء المتخفين ذوي الرتب الأعلى من رتبتك', 'warning');
        return;
      }

      showUserProfile(username);
      return;
    }
  }

  if (e.target.tagName === 'IMG' && 
      (e.target.closest('.message-text') || e.target.closest('.quoted-text') || e.target.closest('.private-msg-text')) &&                
      !e.target.classList.contains('smiley-img') && 
      !e.target.classList.contains('sticker-img')) {
    if (typeof window.openLightbox === 'function') {
      window.openLightbox(e.target.src);
    }
  }
});

window.addEventListener('popstate', (e) => {
  if (ui.lightbox && ui.lightbox.classList.contains('show')) {
    ui.lightbox.classList.remove('show');
    window.stopLightboxVideo();
    if (ui.lightboxImg) {
      ui.lightboxImg.classList.remove('is-tall-image');
      ui.lightboxImg.onload = null;
    }
  }
});

// Initial UI state
updateChatUI();

socket.on('user-addons-updated', ({ userId, username, superIcon, gifts }) => {
  const targetIdStr = String(userId || '');
  const user = state.currentUsers.find(u => String(u.userId ?? u.id ?? '') === targetIdStr || u.username === username);
  if (user) {
    user.superIcon = superIcon;
    user.gifts = gifts || [];
  }
  if (state.currentUser && (String(state.currentUser.userId ?? state.currentUser.id ?? '') === targetIdStr || state.currentUser.username === username)) {
    state.currentUser.superIcon = superIcon;
    state.currentUser.gifts = gifts || [];
    updateChatUI();
  }

  // Refresh sidebar online users list if active
  if (typeof window.renderUsersInSidebar === 'function' && Array.isArray(state.currentUsers)) {
    window.renderUsersInSidebar(state.currentUsers);
  }

  // Update existing messages in DOM using centralized renderer
  const userData = user || { userId, username, superIcon, gifts: gifts || [] };
  
  const selectors = [];
  if (userId) selectors.push(`.user-identity[data-user-id="${CSS.escape(String(userId))}"]`);
  if (username) selectors.push(`.user-identity[data-username="${CSS.escape(username)}"]`);
  
  const identities = document.querySelectorAll(selectors.join(','));
  
  // Clear cache for this superIcon to force re-evaluation if it's updated
  if (superIcon && window.superIconWideCache) {
      delete window.superIconWideCache[superIcon];
      delete window.superIconWideCache[escapeHTML(superIcon)];
  }

  identities.forEach(el => {
      const nameEl = el.querySelector('.user-identity-name');
      const isAnchor = nameEl && nameEl.tagName.toLowerCase() === 'a';
      const nameClasses = nameEl ? nameEl.className.replace('user-identity-name', '').replace('wall-post-username', '').trim() : '';
      const nameStyle = nameEl ? nameEl.style.cssText : '';
      
      // Clean up old state classes to avoid them persisting if the width changes
      const containerClasses = el.className
          .replace('user-identity', '')
          .replace('user-identity-super-wide', '')
          .replace('user-identity-super-normal', '')
          .trim();

      const tag = isAnchor ? 'a' : 'span';
      let onClick = nameEl ? nameEl.getAttribute('onclick') : '';
      if (onClick && onClick.startsWith('event.preventDefault(); ')) {
          onClick = onClick.replace('event.preventDefault(); ', '');
      }
      
      const newHtml = window.renderUserIdentity(userData, {
          nameClasses: isAnchor && !nameClasses.includes('wall-post-username') ? nameClasses + ' wall-post-username' : nameClasses, // Preserve wall post specific class
          nameStyle,
          containerClasses,
          tag,
          onClick
      });
      
      // Use replaceWith for better handling of new elements and triggering loads
      const temp = document.createElement('div');
      temp.innerHTML = newHtml.trim();
      const newNode = temp.firstElementChild;
      if (newNode) {
          el.replaceWith(newNode);
          
          // Trigger check for the new icon
          const img = newNode.querySelector('.user-identity-super');
          if (img) {
              const runCheck = () => window.handleUserIdentitySuperLoad(img, img.getAttribute('src'));
              if (img.complete) {
                  setTimeout(runCheck, 0);
              } else {
                  img.addEventListener('load', runCheck, { once: true });
              }
          }
      }
  });

  // Also update profile modal if it's open for this user
  if (profileUser && profileUser.username === username) {
    const headerTopic = document.getElementById('profile-header-topic');
    if (headerTopic) {
      if (superIcon) {
        headerTopic.style.background = 'transparent';
        headerTopic.style.padding = '0';
      } else {
        const userData = state.currentUsers.find(cu => cu.username === username);
        if (userData && userData.bg) {
          if (userData.bg.startsWith('http') || userData.bg.startsWith('/')) {
            headerTopic.style.background = 'none';
            headerTopic.style.backgroundColor = 'transparent';
            headerTopic.style.backgroundImage = `url('${userData.bg}')`;
            headerTopic.style.backgroundPosition = 'center';
            headerTopic.style.backgroundSize = 'cover';
          } else {
            headerTopic.style.backgroundImage = 'none';
            headerTopic.style.background = userData.bg;
          }
          headerTopic.style.padding = '0 6px';
        } else {
          headerTopic.style.background = 'transparent';
          headerTopic.style.padding = '0';
        }
      }
    }
    const headerBanner = document.getElementById('profile-header-banner');
    if (headerBanner) {
      if (superIcon) {
        headerBanner.src = superIcon;
        headerBanner.classList.remove('d-none');
      } else {
        headerBanner.classList.add('d-none');
      }
    }
  }
});

window.renderPrivateNotificationText = function(rawText) {
  if (!rawText) return '';
  const esc = window.escapeHTML || ((str) => {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  });
  let safeHtml = esc(rawText);
  if (window.replaceShortcuts) {
    safeHtml = window.replaceShortcuts(safeHtml);
  }
  if (window.replacePlaceholders) {
    safeHtml = window.replacePlaceholders(safeHtml);
  }
  return safeHtml.replace(/\n/g, '<br>');
};

socket.on('private-notification', (data) => {
  if (typeof window.addSessionNotification === 'function') {
    window.addSessionNotification({
      id: data.id,
      type: 'manual_alert',
      senderId: data.senderId,
      senderUsername: data.sender,
      senderDisplayName: data.senderNickname,
      senderAvatar: data.senderAvatar,
      senderBanner: data.senderBanner,
      senderDecoration: data.senderDecoration,
      senderUcol: data.senderUcol,
      senderSuperIcon: data.senderSuperIcon,
      senderGifts: data.senderGifts || [],
      message: data.text,
      createdAt: data.createdAt,
      suppressPopup: true,
      suppressSound: true
    });
  }

  if (window.profileSoundManager) {
    window.profileSoundManager.playAlert();
  } else if (window.soundManager) {
    window.soundManager.playSound('notification');
  }

  const senderUsername = data.sender;
  const senderNickname = data.senderNickname;
  // Use best available display name: nickname (decoration) -> username
  const displayName = (senderNickname && senderNickname.trim() !== '') ? senderNickname : senderUsername;

  // Use the global helper if available, otherwise fallback
  const senderAvatar = typeof window.getAvatarUrl === 'function' 
    ? window.getAvatarUrl({ pic: data.senderAvatar }) 
    : (data.senderAvatar || '/uploads/site/default.png');

  const userIdentityHtml = window.renderUserIdentity({
      username: senderUsername,
      topic: senderNickname,
      superIcon: data.senderSuperIcon,
      ucol: data.senderUcol || '#333'
  }, {
      nameStyle: `color: ${data.senderUcol || '#333'}; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;`,
  });

  const canReply = data.senderId && senderUsername && senderUsername !== 'نظام';

  Swal.fire({
    title: 'تنبيه',
    html: `
      <!-- Header / Title Region -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; direction: rtl; font-family: inherit; font-size: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; margin-bottom: 10px;">
        <img src="${senderAvatar}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd; flex-shrink: 0; background: #fff;" onerror="this.src='/uploads/site/default.png'">
        <div style="display: flex; align-items: center; max-width: 200px; overflow: hidden;">
          ${userIdentityHtml}
        </div>
      </div>
      
      <!-- Body / Message Region -->
      <div style="direction: rtl; text-align: center; padding: 5px; font-size: 15.5px; color: #444; line-height: 1.7; min-height: 50px;">
        ${window.renderPrivateNotificationText(data.text)}
      </div>
    `,
    showConfirmButton: true,
    confirmButtonText: canReply ? 'رد على التنبيه' : 'إغلاق',
    showCancelButton: canReply,
    cancelButtonText: 'إغلاق',
    customClass: {
      popup: 'border-0 rounded-4 shadow-lg p-0',
      htmlContainer: 'p-4',
      confirmButton: canReply ? 'btn btn-primary px-4 mt-2 mb-3 rounded-pill shadow-sm mx-1' : 'btn btn-primary px-5 mt-2 mb-3 rounded-pill shadow-sm',
      cancelButton: 'btn btn-secondary px-4 mt-2 mb-3 rounded-pill mx-1'
    },
    buttonsStyling: false,
    width: '380px'
  }).then((result) => {
    if (result.isConfirmed && canReply) {
      const targetUserObj = {
        id: data.senderId,
        username: senderUsername,
        topic: senderNickname,
        pic: data.senderAvatar,
        superIcon: data.senderSuperIcon,
        ucol: data.senderUcol,
        mcol: data.senderMcol,
        allowAlerts: data.senderAllowAlerts !== false
      };
      window.showPrivateNotificationModal(targetUserObj, true);
    }
  });
});


socket.on('new-notification', (notification) => {
  // Classic database notifications are bypassed by user request
});

// Real-time session-based list items (direct_like, wall_like, wall_comment, manual_alert)
window.sessionNotifications = window.sessionNotifications || [];

window.addSessionNotification = function(n) {
  if (!n || !n.id) return;
  
  // Prevent duplicate notifications by ID
  const exists = window.sessionNotifications.some(item => item.id === n.id);
  if (exists) return;

  const msgText = n.message || n.text || '';

  // Format consistent with window.renderNotifications expectation
  const freshNotif = {
    id: n.id,
    type: n.type,
    createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
    message: msgText,
    text: msgText,
    sender: {
      username: n.senderUsername || 'نظام',
      pic: n.senderAvatar || '/uploads/site/default.png',
      membershipBg: n.type === 'manual_alert' ? null : (n.senderBanner || null),
      bg: n.senderDecoration || n.senderBg || 'transparent',
      ucol: n.senderUcol || null,
      superIcon: n.senderSuperIcon || null,
      gifts: n.senderGifts || [],
      topic: n.senderDisplayName || null
    }
  };

  // Add to the beginning (most recent first)
  window.sessionNotifications.unshift(freshNotif);

  // Enforce memory limit of 30 items
  if (window.sessionNotifications.length > 30) {
    window.sessionNotifications.splice(30);
  }

  // Play sound if not muted inside local storage and not silent
  const isSilent = n.suppressSound === true || n.type === 'manual_alert';
  if (!isSilent && !window.isNotificationSoundsMuted()) {
    if (window.profileSoundManager) {
      window.profileSoundManager.playAlert();
    } else if (window.soundManager) {
      window.soundManager.playSound('notification');
    }
  }

  // Refresh view if active
  if (currentSettingsView === 'notifications') {
    window.renderNotifications();
  }

  // Update UI notifications badge count if elements exist
  const badge = document.getElementById('sidebar-notifications-badge');
  if (badge) {
    const unreadCount = window.sessionNotifications.filter(x => !x.read).length;
    if (unreadCount > 0) {
      badge.innerText = unreadCount;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }

  // If we should show a popup
  const shouldShowPopup = n.type !== 'manual_alert' && n.suppressPopup !== true;
  if (shouldShowPopup && window.Swal) {
    const senderDisplayName = n.senderDisplayName || n.senderUsername || 'نظام';
    const senderAvatarStr = escapeHTML(n.senderAvatar || '/uploads/site/default.png');
    const actionText = escapeHTML(n.message || n.text || '');

    const userIdentityHtml = window.renderUserIdentity ? window.renderUserIdentity({
      username: n.senderUsername || 'نظام',
      pic: n.senderAvatar || '/uploads/site/default.png',
      bg: n.senderDecoration || n.senderBg || 'transparent',
      ucol: n.senderUcol || '#333',
      superIcon: n.senderSuperIcon || null,
      gifts: n.senderGifts || [],
      topic: n.senderDisplayName || null
    }, {
      nameStyle: `color: ${n.senderUcol || '#333'}; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;`,
    }) : `<strong style="color: ${n.senderUcol || '#333'}; font-weight: bold;">${escapeHTML(senderDisplayName)}</strong>`;

    window.Swal.fire({
      title: 'تنبيه جديد',
      html: `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; direction: rtl; font-family: inherit; font-size: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; margin-bottom: 10px;">
          <img src="${senderAvatarStr}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd; flex-shrink: 0; background: #fff;" onerror="this.src='/uploads/site/default.png'">
          <div style="display: flex; align-items: center; max-width: 200px; overflow: hidden;">
            ${userIdentityHtml}
          </div>
        </div>
        <div style="direction: rtl; text-align: center; padding: 5px; font-size: 15.5px; color: #444; line-height: 1.7; min-height: 50px;">
          ${actionText.replace(/\n/g, '<br>')}
        </div>
      `,
      showConfirmButton: true,
      confirmButtonText: 'إغلاق',
      customClass: {
        popup: 'border-0 rounded-4 shadow-lg p-0',
        htmlContainer: 'p-4',
        confirmButton: 'btn btn-primary px-5 mt-2 mb-3 rounded-pill shadow-sm'
      },
      buttonsStyling: false,
      width: '380px'
    });
  }
};

socket.on('session-notification', (n) => {
  window.addSessionNotification(n);
});

// RAM pending offline alert delivery logic (Swal chain)
socket.on('offline-pending-alert', (data) => {
  if (typeof window.addSessionNotification === 'function') {
    window.addSessionNotification({
      id: data.id,
      type: 'manual_alert',
      senderId: data.senderId,
      senderUsername: data.senderUsername,
      senderDisplayName: data.senderDisplayName,
      senderAvatar: data.senderAvatar,
      senderBanner: data.senderBanner,
      senderDecoration: data.senderDecoration,
      senderUcol: data.senderUcol,
      senderSuperIcon: data.senderSuperIcon,
      senderGifts: data.senderGifts || [],
      message: data.message,
      createdAt: data.createdAt,
      suppressPopup: true,
      suppressSound: true
    });
  }

  if (!window.isNotificationSoundsMuted()) {
    if (window.profileSoundManager) {
      window.profileSoundManager.playAlert();
    } else if (window.soundManager) {
      window.soundManager.playSound('notification');
    }
  }

  const senderUsername = data.senderUsername;
  const displayName = data.senderDisplayName || senderUsername;
  const senderAvatar = data.senderAvatar || '/uploads/site/default.png';

  const userIdentityHtml = window.renderUserIdentity ? window.renderUserIdentity({
      username: senderUsername,
      topic: displayName,
      superIcon: data.senderSuperIcon,
      ucol: data.senderUcol || '#333'
  }, {
      nameStyle: `color: ${data.senderUcol || '#333'}; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;`,
  }) : `<strong>${escapeHTML(displayName)}</strong>`;

  const canReply = data.senderId && senderUsername && senderUsername !== 'نظام';

  Swal.fire({
    title: 'تنبيه معلق (أثناء غيابك)',
    html: `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; direction: rtl; font-family: inherit; font-size: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; margin-bottom: 10px;">
        <img src="${escapeHTML(senderAvatar)}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd; flex-shrink: 0; background: #fff;" onerror="this.src='/uploads/site/default.png'">
        <div style="display: flex; align-items: center; max-width: 200px; overflow: hidden;">
          ${userIdentityHtml}
        </div>
      </div>
      <div style="direction: rtl; text-align: center; padding: 5px; font-size: 15.5px; color: #444; line-height: 1.7; min-height: 50px;">
        ${window.renderPrivateNotificationText(data.message)}
      </div>
    `,
    showConfirmButton: true,
    confirmButtonText: canReply ? 'رد على التنبيه' : 'إغلاق',
    showCancelButton: canReply,
    cancelButtonText: 'إغلاق',
    customClass: {
      popup: 'border-0 rounded-4 shadow-lg p-0',
      htmlContainer: 'p-4',
      confirmButton: canReply ? 'btn btn-primary px-4 mt-2 mb-3 rounded-pill shadow-sm mx-1' : 'btn btn-primary px-5 mt-2 mb-3 rounded-pill shadow-sm',
      cancelButton: 'btn btn-secondary px-4 mt-2 mb-3 rounded-pill mx-1'
    },
    buttonsStyling: false,
    width: '380px'
  }).then((result) => {
    // Confirm delivery so server can release it from RAM and send the next one
    socket.emit('offline-pending-alert-shown', { alertId: data.id });

    if (result.isConfirmed && canReply) {
      const targetUserObj = {
        id: data.senderId,
        username: senderUsername,
        topic: displayName,
        pic: data.senderAvatar,
        superIcon: data.senderSuperIcon,
        ucol: data.senderUcol,
        mcol: data.senderMcol,
        allowAlerts: data.senderAllowAlerts !== false
      };
      if (window.showPrivateNotificationModal) {
         window.showPrivateNotificationModal(targetUserObj, true);
      }
    }
  });
});

function showStoryInstantAlert(data) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000000;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #e9e9e9;
    border: 1px solid #000;
    width: 320px;
    box-shadow: 0 5px 25px rgba(0,0,0,0.4);
    border-radius: 2px;
    position: relative;
    padding: 20px 10px;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    background: #2c3e50;
    color: #fff;
    padding: 6px 30px;
    text-align: center;
    font-weight: bold;
    border-radius: 5px;
    border: 1px solid #111;
    position: absolute;
    top: -15px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    min-width: 80px;
    white-space: nowrap;
  `;
  header.innerText = 'تنبيه';

  const body = document.createElement('div');
  body.style.cssText = `
    padding: 25px 10px 15px;
    text-align: center;
    color: #000;
    font-size: 13px;
    font-weight: bold;
    direction: rtl;
    line-height: 1.4;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: inherit;
  `;

  const img = document.createElement('img');
  img.src = data.fromPic || '/img/default-avatar.png';
  img.style.cssText = `
    width: 25px;
    height: 25px;
    border-radius: 2px;
    border: 1px solid #999;
    object-fit: cover;
    flex-shrink: 0;
  `;

  // Construct styled text
  const contentSpan = document.createElement('span');
  contentSpan.style.display = 'flex';
  contentSpan.style.alignItems = 'center';
  contentSpan.style.gap = '4px';
  contentSpan.style.flexWrap = 'wrap';
  contentSpan.style.justifyContent = 'center';

  const prefix = document.createElement('span');
  prefix.innerText = 'قام ';
  contentSpan.appendChild(prefix);

  if (data.fromSuperIcon) {
    const sIcon = document.createElement('img');
    sIcon.src = data.fromSuperIcon;
    sIcon.style.width = 'auto';
    sIcon.style.height = '16px';
    contentSpan.appendChild(sIcon);
  }

  const nameSpan = document.createElement('span');
  nameSpan.innerText = data.fromName;
  if (data.fromColor) {
    nameSpan.style.color = data.fromColor;
  }
  contentSpan.appendChild(nameSpan);

  const suffix = document.createElement('span');
  suffix.innerText = data.type === 'story_like' ? ' بالإعجاب بالستوري الخاص بك' : ' بالتعليق على الستوري الخاص بك';
  contentSpan.appendChild(suffix);

  body.appendChild(img);
  body.appendChild(contentSpan);

  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = `
    text-align: center;
    padding-top: 10px;
  `;

  const btn = document.createElement('button');
  btn.style.cssText = `
    background: #2c3e50;
    color: #fff;
    border: 1px solid #111;
    padding: 5px 25px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 14px;
    min-width: 90px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  `;
  btn.innerText = 'موافق';
  btn.onclick = () => {
    document.body.removeChild(overlay);
  };

  btnContainer.appendChild(btn);
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(btnContainer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

socket.on('story-instant-alert', (data) => {
  showStoryInstantAlert(data);
  if (!window.isNotificationSoundsMuted()) {
    if (window.profileSoundManager) {
      window.profileSoundManager.playAlert();
    } else if (window.soundManager) {
      window.soundManager.playSound('notification');
    }
  }
  
  // If notifications list is open, refresh it
  if (ui.sidebarTitle && ui.sidebarTitle.innerText === 'الإشعارات') {
    renderNotifications();
  }
});

// Handle Membership Asset Uploads
document.addEventListener('change', (e) => {
  if (e.target.id === 'membership-bg-upload' && e.target.files.length > 0) {
    window.uploadMembershipAsset('background', e.target.files[0]);
    e.target.value = '';
  }
  if (e.target.id === 'membership-frame-upload' && e.target.files.length > 0) {
    window.uploadMembershipAsset('frame', e.target.files[0]);
    e.target.value = '';
  }
});

// News Ticker System
async function initNewsTicker() {
  try {
    const res = await fetch('/api/settings/news-ticker');
    if (res.ok) {
      const data = await res.json();
      window.updateNewsTickerUI(data);
    }
  } catch (err) {
    console.error('Failed to init news ticker:', err);
  }
}

window.updateNewsTickerUI = function(data) {
  const bar = document.getElementById('news-ticker-bar');
  const textElem = document.getElementById('news-ticker-text');
  const content = document.getElementById('news-ticker-content');
  
  if (!bar || !textElem || !content) return;
  
  if (data.enabled && data.text && data.text.trim() !== '') {
    bar.classList.remove('d-none');
    bar.classList.add('d-flex');
    
    let bgColor = data.bgColor || '#ff0000';
    let textColor = data.textColor || '#ffffff';
    
    if (window.domainConfig) {
      if (window.domainConfig.tickerBgColor && typeof window.domainConfig.tickerBgColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(window.domainConfig.tickerBgColor)) {
        bgColor = window.domainConfig.tickerBgColor;
      }
      if (window.domainConfig.tickerTextColor && typeof window.domainConfig.tickerTextColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(window.domainConfig.tickerTextColor)) {
        textColor = window.domainConfig.tickerTextColor;
      }
    }
    
    bar.style.backgroundColor = bgColor;
    content.style.color = textColor;
    textElem.innerText = data.text;
    
    // Update animation speed
    const speed = data.speed || 25;
    content.style.animationDuration = `${speed}s`;
  } else {
    bar.classList.add('d-none');
    bar.classList.remove('d-flex');
  }
};

socket.on('news_ticker_updated', (data) => {
  window.updateNewsTickerUI(data);
});

// Initialize news ticker
initNewsTicker();
initBotMessaging();

// Camera request delegation
document.addEventListener('click', async (e) => {
  if (!e.target || typeof e.target.closest !== 'function') return;

  // Handle Top Live Broadcast Button click
  const topLiveBtn = e.target.closest('#top-live-broadcast-btn');
  if (topLiveBtn) {
    e.stopPropagation();
    e.preventDefault();
    const manager = await window.ensureLiveBroadcastLoaded();
    if (manager) {
      if (manager.isBroadcasting) {
        manager.stopBroadcast();
      } else {
        manager.openStartModal();
      }
    }
    return;
  }

  // Handle Profile Battle Button click
  const btnBattle = e.target.closest('#btn-profile-battle');
  if (btnBattle) {
    e.stopPropagation();
    e.preventDefault();
    if (typeof window.openBattleModeSelectionModal !== 'function') {
      await window.ensureBattleLoaded();
    }
    if (typeof window.openBattleModeSelectionModal === 'function') {
      const target = (typeof window.getCurrentProfileUser === 'function' ? window.getCurrentProfileUser() : null) || window.profileUser;
      if (!target) {
        Swal.fire({
          title: 'خطأ',
          text: 'لم يتم العثور على معلومات العضو.',
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        return;
      }

      const room = window.state ? window.state.currentRoomId : 0;
      if (!room || Number(room) <= 0) {
        Swal.fire({
          title: 'تنبيه',
          text: 'يجب أن تكون متواجداً بنشاط داخل غرفة للتحدي.',
          icon: 'warning',
          confirmButtonText: 'حسناً'
        });
        return;
      }

      window.openBattleModeSelectionModal(target, Number(room));
    }
    return;
  }

  // Handle Live Broadcast Button click
  const liveBroadcastBtn = e.target.closest('.js-live-broadcast-btn');
  if (liveBroadcastBtn) {
    e.stopPropagation();
    const userId = parseInt(liveBroadcastBtn.getAttribute('data-user-id'), 10);
    if (!userId || isNaN(userId)) return;

    const manager = await window.ensureLiveBroadcastLoaded();
    if (manager && typeof manager.watchBroadcast === 'function') {
      manager.watchBroadcast(userId);
    }
    return;
  }

  // Handle Camera Request Button
  const cameraBtn = e.target.closest('.js-camera-request-btn');
  if (cameraBtn) {
    e.stopPropagation();
    
    const currentRoom = window.currentRoom || window.currentRoomData || (window.roomsData && state.currentRoomId ? window.roomsData[state.currentRoomId] : null);
    if (currentRoom && currentRoom.allowCamera !== true) {
      window.showToast('الكاميرا غير مفعلة في هذه الغرفة', 'error');
      return;
    }

    const userId = parseInt(cameraBtn.getAttribute('data-user-id'), 10);
    if (!userId || isNaN(userId)) return;

    // Search for user in state.currentUsers or state.rooms
    let userObj = null;
    if (state.currentUsers) {
      userObj = state.currentUsers.find(u => (u.userId === userId || u.id === userId));
    }
    
    // If user object found, pass it to requestView
    if (userObj) {
      const cameraManager = await window.ensureCameraLoaded();
      if (cameraManager && typeof cameraManager.requestView === 'function') {
        cameraManager.requestView(userObj);
      }
    } else {
      console.warn('User not found in memory to request camera view');
      window.showToast('تعذر العثور على بيانات المستخدم', 'error');
    }
    return;
  }

  // Handle User Profile List Item Button
  const profileBtn = e.target.closest('.js-user-profile-btn');
  if (profileBtn) {
    e.stopPropagation();
    const username = profileBtn.getAttribute('data-username');
    if (username && typeof window.showUserProfile === 'function') {
      const isTargetHidden = profileBtn.getAttribute('data-is-hidden') === 'true' || profileBtn.dataset.isHidden === 'true';
      const targetRank = parseInt(profileBtn.getAttribute('data-role-rank') || profileBtn.dataset.roleRank || '0', 10);
      const myRank = (state.currentUser && (state.currentUser.group && state.currentUser.group.roleRank !== undefined ? state.currentUser.group.roleRank : state.currentUser.roleRank)) || 0;

      if (isTargetHidden && myRank < targetRank) {
        showToast('لا يمكن عرض الملف الشخصي للأعضاء المتخفين ذوي الرتب الأعلى من رتبتك', 'warning');
        return;
      }
      window.showUserProfile(username);
    }
    return;
  }
});

// Profile Image Lightbox
function openProfileImageLightbox(imageSrc) {
  if (!imageSrc) return;
  if (!window.featuresSettings || !window.featuresSettings.profileLightboxEnabled) return;

  const lightbox = document.getElementById('profileImageLightbox');
  const img = document.getElementById('profileLightboxImg');

  if (!lightbox || !img) return;

  img.src = imageSrc;
  lightbox.classList.add('active');
}

function closeProfileImageLightbox() {
  const lightbox = document.getElementById('profileImageLightbox');
  const img = document.getElementById('profileLightboxImg');

  if (!lightbox || !img) return;

  lightbox.classList.remove('active');
  img.src = '';
}

document.addEventListener('click', function (e) {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const profileImg = e.target.closest('#profile-avatar-modal, .profile-header-avatar');

  if (profileImg) {
    e.preventDefault();
    e.stopPropagation();

    const imageSrc = profileImg.dataset.fullSrc || profileImg.src;
    openProfileImageLightbox(imageSrc);
    return;
  }

  if (
    e.target.id === 'profileImageLightbox' ||
    e.target.closest('.profile-lightbox-close')
  ) {
    closeProfileImageLightbox();
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeProfileImageLightbox();
  }
});

// Copy and Right-Click Disable Logic
function isInsideChat(target) {
  if (!target || typeof target.closest !== 'function') return false;
  // Use the main app container that wraps chat components (excluding admin CP)
  return !!target.closest('#chat-shell') || !!target.closest('#chat-ui') || !!target.closest('#right-sidebar') || !!target.closest('.modal') || !!target.closest('.layout-container');
}

function isEditable(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !!target.closest('input, textarea, [contenteditable="true"]');
}

document.addEventListener('contextmenu', function (e) {
  if (!window.featuresSettings?.disableRightClick) return;
  // Allow right click if it's an editable field or if user is an admin
  if (isEditable(e.target) || hasPermission('canAccessAdminPanel')) return;

  e.preventDefault();
});

function handleCopyBlock(e) {
  if (!window.featuresSettings?.disableCopy) return;
  // Allow copy/cut if it's an editable field or if user is an admin
  if (isEditable(e.target) || hasPermission('canAccessAdminPanel')) return;

  e.preventDefault();
}

document.addEventListener('copy', handleCopyBlock);
document.addEventListener('cut', handleCopyBlock);
document.addEventListener('paste', handleCopyBlock);

// Selectstart happens continuously as user drags to text. We will block it silently, no toast to prevent spam.
document.addEventListener('selectstart', function (e) {
  if (!window.featuresSettings?.disableCopy) return;
  if (isEditable(e.target) || hasPermission('canAccessAdminPanel')) return;

  e.preventDefault();
});

// Special Entry Notification Listener
socket.on('special-entry', (data) => {
    showSpecialEntryToast(data);
    playSpecialEntrySound(data.sound);
});

function showSpecialEntryToast(data) {
    const toast = document.createElement('div');
    toast.className = `special-entry-toast ${data.className}`;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'entry-content-wrapper';

    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'entry-avatar-container';

    const img = document.createElement('img');
    img.src = data.avatar;
    img.className = 'entry-avatar';
    img.onerror = () => { img.src = '/images/default-avatar.png'; }; // Fallback
    avatarContainer.appendChild(img);

    const textInfo = document.createElement('div');
    textInfo.className = 'entry-text-info';

    const entryUser = document.createElement('div');
    entryUser.className = 'entry-username';

    if (data.user && window.renderUserIdentity) {
        const identityHtml = window.renderUserIdentity(data.user, {
            tag: 'span'
        });

        entryUser.innerHTML = identityHtml;

        const identityElement = entryUser.querySelector('.user-identity');
        if (identityElement) {
            identityElement.classList.add('entry-identity');
        }
    } else {
        entryUser.textContent = data.name || 'مستخدم';
    }

    textInfo.appendChild(entryUser);

    contentWrapper.appendChild(avatarContainer);
    contentWrapper.appendChild(textInfo);
    toast.appendChild(contentWrapper);

    const voiceTopBar = document.querySelector('.voice-top-bar');
    if (voiceTopBar) {
        const voiceBarStyle = window.getComputedStyle(voiceTopBar);
        const voiceBarRect = voiceTopBar.getBoundingClientRect();

        const isVoiceBarVisible =
            !voiceTopBar.classList.contains('d-none') &&
            voiceBarStyle.display !== 'none' &&
            voiceBarStyle.visibility !== 'hidden' &&
            voiceBarRect.height > 0 &&
            voiceBarRect.bottom > 0;

        if (isVoiceBarVisible) {
            const safeGap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--special-entry-mics-gap')) || 8;
            const toastTop = Math.ceil(voiceBarRect.bottom + safeGap);
            toast.style.top = `${toastTop}px`;
        }
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5500); // Remove after animation
}

function playSpecialEntrySound(soundUrl) {
    if (!window.isChatAudioAllowed()) return;
    if (!soundUrl) return;
    try {
        const audio = new Audio(soundUrl);
        audio.loop = false;
        audio.play().catch(e => {
            // Ignore
        });
    } catch (e) {
        // Ignore
    }
}


// ==========================================
// ZAJEL FEATURE IMPLEMENTATION (CLIENT)
// ==========================================
let activeZajelMessages = [];

window.pendingZajelModeration = window.pendingZajelModeration || new Map();
window.currentZajelModerationAlertId = null;

window.updateZajelModerationUI = function() {
  if (currentSettingsView === 'notifications') {
    if (typeof window.renderNotifications === 'function') {
      window.renderNotifications(true);
    }
  } else if (currentSettingsView === 'addons') {
    if (typeof window.renderAddons === 'function') {
      window.renderAddons();
    }
  }
};

window.showZajelModerationAlert = function(req) {
  if (!req || !req.id) return;
  // Prevent showing more than one alert at the same time
  const overlay = document.getElementById('classic-alert-overlay');
  if (overlay && !overlay.classList.contains('d-none')) {
    return;
  }

  window.currentZajelModerationAlertId = req.id;

  const htmlContent = `
    <div style="direction: rtl; text-align: center; padding: 5px 0;">
      <div style="font-weight: bold; color: #1a252f; font-size: 15px; margin-bottom: 8px;">
        <i class="fas fa-user text-primary me-1"></i> ${escapeHTML(req.username)}
      </div>
      <div style="background: #fff; border: 1px solid #ccc; border-radius: 5px; padding: 10px; font-size: 13px; color: #333; word-break: break-word; text-align: right; max-height: 120px; overflow-y: auto;">
        ${escapeHTML(req.message)}
      </div>
    </div>
  `;

  if (window.Swal && typeof window.Swal.fire === 'function') {
    Swal.fire({
      title: 'طلب مراجعة رسالة زاجل',
      html: htmlContent,
      showConfirmButton: true,
      confirmButtonText: 'قبول ونشر',
      showDenyButton: true,
      denyButtonText: 'رفض',
      showCancelButton: true,
      cancelButtonText: 'لاحقاً',
      willClose: () => {
        if (window.currentZajelModerationAlertId === req.id) {
          window.currentZajelModerationAlertId = null;
        }
      }
    }).then((result) => {
      if (result.isConfirmed) {
        window.moderateZajelRequest(req.id, 'approve');
      } else if (result.isDenied) {
        window.moderateZajelRequest(req.id, 'reject');
      }
    });
  }
};

window.moderateZajelRequest = function(id, action) {
  if (!socket) return;
  socket.emit('zajel:moderate', { id: Number(id), action }, (response) => {
    if (response && response.success) {
      if (window.pendingZajelModeration) {
        window.pendingZajelModeration.delete(Number(id));
      }
      if (window.currentZajelModerationAlertId === Number(id)) {
        if (typeof window.closeClassicAlert === 'function') {
          window.closeClassicAlert();
        }
        window.currentZajelModerationAlertId = null;
      }
      window.updateZajelModerationUI();
      if (window.showToast) {
        window.showToast(response.message || 'تم اتخاذ الإجراء بنجاح');
      }
    } else {
      const msg = (response && response.message) ? response.message : 'حدث خطأ أثناء معالجة الطلب';
      if (window.showToast) window.showToast(msg);
      if (msg.includes('بالفعل') || msg.includes('غير موجودة')) {
        if (window.pendingZajelModeration) {
          window.pendingZajelModeration.delete(Number(id));
        }
        if (window.currentZajelModerationAlertId === Number(id)) {
          if (typeof window.closeClassicAlert === 'function') {
            window.closeClassicAlert();
          }
          window.currentZajelModerationAlertId = null;
        }
        window.updateZajelModerationUI();
      }
    }
  });
};

socket.on('zajel:moderation-request', (req) => {
  if (!req || !req.id) return;
  if (!window.pendingZajelModeration) window.pendingZajelModeration = new Map();
  window.pendingZajelModeration.set(req.id, req);
  window.updateZajelModerationUI();
  window.showZajelModerationAlert(req);
});

socket.on('zajel:moderation-resolved', (data) => {
  if (!data || !data.id) return;
  if (window.pendingZajelModeration) {
    window.pendingZajelModeration.delete(data.id);
  }
  if (window.currentZajelModerationAlertId === data.id) {
    if (typeof window.closeClassicAlert === 'function') {
      window.closeClassicAlert();
    }
    window.currentZajelModerationAlertId = null;
  }
  window.updateZajelModerationUI();
});

socket.on('zajel:moderation:pending-list', (list) => {
  if (!window.pendingZajelModeration) window.pendingZajelModeration = new Map();
  else window.pendingZajelModeration.clear();
  if (Array.isArray(list)) {
    list.forEach(item => {
      window.pendingZajelModeration.set(item.id, item);
    });
  }
  window.updateZajelModerationUI();
  if (window.pendingZajelModeration.size > 0) {
    const firstReq = window.pendingZajelModeration.values().next().value;
    if (firstReq && !window.currentZajelModerationAlertId) {
      window.showZajelModerationAlert(firstReq);
    }
  }
});



socket.on('zajel:list', (messages) => {
  activeZajelMessages = messages || [];
  renderZajelTicker();
});

socket.on('zajel:new', (msg) => {
  if (msg && msg.id && !activeZajelMessages.some(m => m.id === msg.id)) {
    activeZajelMessages.push(msg);
    if (activeZajelMessages.length > 30) {
      activeZajelMessages.shift();
    }
    renderZajelTicker();
  }
});

socket.on('zajel:delete', ({ id }) => {
  activeZajelMessages = activeZajelMessages.filter(m => m.id !== id);
  renderZajelTicker();
});

function updateZajelMarqueeMotion() {
  const container = document.getElementById('zajel-container');
  const textFlow = document.getElementById('zajel-text-flow');

  if (!container || !textFlow) return;

  requestAnimationFrame(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    const containerWidth = container.clientWidth || 300;
    const flowWidth = textFlow.scrollWidth || 300;

    textFlow.style.setProperty('--zajel-start-x', `-${flowWidth}px`);
    textFlow.style.setProperty('--zajel-end-x', `${containerWidth}px`);

    const distance = flowWidth + containerWidth;

    // السرعة: كلما قل الرقم أصبحت الحركة أبطأ
    const speed = isMobile ? 25 : 40;

    const minDuration = isMobile ? 22 : 18;
    const maxDuration = isMobile ? 90 : 120;

    const duration = Math.max(
      minDuration,
      Math.min(maxDuration, distance / speed)
    );

    textFlow.style.animation = 'none';
    void textFlow.offsetWidth; // force reflow
    textFlow.style.animation = `marquee-zajel ${duration}s linear infinite`;
  });
}

function setupZajelResizeObserver() {
  const container = document.getElementById('zajel-container');
  if (!container || container.dataset.zajelResizeObserverAttached === '1') return;

  container.dataset.zajelResizeObserverAttached = '1';

  const observer = new ResizeObserver(() => {
    updateZajelMarqueeMotion();
  });

  observer.observe(container);
}

if (!window.__zajelEventsRegistered) {
  window.__zajelEventsRegistered = true;
  window.addEventListener('resize', updateZajelMarqueeMotion);
  window.addEventListener('orientationchange', updateZajelMarqueeMotion);
}

function renderZajelTicker() {
  const zajelBar = document.getElementById('zajel-bar');
  const addBtn = document.getElementById('zajel-add-btn');
  const textFlow = document.getElementById('zajel-text-flow');

  if (!zajelBar || !textFlow) return;

  // If Zajel is disabled globally in Settings, hide the entire bar. Guard with !window.featuresSettings to prevent race condition before settings load.
  if (!window.featuresSettings || window.featuresSettings.zajelEnabled === false) {
    zajelBar.classList.add('d-none');
    return;
  }

  // Ensure the bar itself is visible (remove d-none) when enabled
  zajelBar.classList.remove('d-none');

  const hasSendPerm = hasPermission('sendZajelMessage');

  // Verify only the addition button depends on permission
  if (addBtn) {
    if (hasSendPerm) {
      addBtn.classList.remove('d-none');
    } else {
      addBtn.classList.add('d-none');
    }
  }

  const siteLogoEl = document.getElementById('site-logo');
  let logoUrl = (siteLogoEl && siteLogoEl.tagName === 'IMG' && siteLogoEl.src) || (window.siteAppearance && window.siteAppearance.logo) || (window.domainConfig && window.domainConfig.faviconUrl) || '';
  const logoImgHtml = logoUrl ? `<img src="${logoUrl}" class="zajel-logo-sep">` : `<span class="badge bg-secondary text-light ms-1 me-1" style="font-size: 10px; vertical-align: middle;">Logo</span>`;

  if (!activeZajelMessages || activeZajelMessages.length === 0) {
    // If no messages, show placeholder text as requested
    textFlow.innerHTML = `${logoImgHtml}<span class="zajel-msg-item" dir="rtl"><i class="fas fa-bullhorn ms-1"></i> لا توجد رسائل زاجل معتمدة حالياً...</span>${logoImgHtml}`;
    updateZajelMarqueeMotion();
    setupZajelResizeObserver();
    return;
  }

  // Remove username completely from the marquee; display only the message
  const flowHtml = activeZajelMessages.map(msg => {
    return `<span class="zajel-msg-item" dir="rtl">${escapeHTML(msg.message)}</span>`;
  }).join(logoImgHtml);

  textFlow.innerHTML = `${logoImgHtml}${flowHtml}${logoImgHtml}`;

  updateZajelMarqueeMotion();
  setupZajelResizeObserver();
}



window.openZajelModal = function() {
  const modalElement = document.getElementById('zajelSubmitModal');
  if (modalElement) {
    let modal = bootstrap.Modal.getInstance(modalElement);
    if (!modal) {
      modal = new bootstrap.Modal(modalElement);
    }
    const input = document.getElementById('zajel-msg-input');
    if (input) {
      input.value = '';
      const charCount = document.getElementById('zajel-char-count');
      if (charCount) charCount.innerText = 'المتبقي: 150 حرفاً';
      
      input.oninput = function() {
        const left = 150 - input.value.length;
        if (charCount) charCount.innerText = `المتبقي: ${left} حرفاً`;
      };
    }
    const errDiv = document.getElementById('zajel-submit-error');
    if (errDiv) {
      errDiv.innerText = '';
      errDiv.classList.add('d-none');
    }
    
    modal.show();
  }
};

window.submitZajelMsg = async function() {
  const input = document.getElementById('zajel-msg-input');
  const errDiv = document.getElementById('zajel-submit-error');
  if (!input) return;

  if (typeof hasPermission === 'function' && !hasPermission('sendZajelMessage')) {
    if (errDiv) {
      errDiv.innerText = 'عذراً، ليس لديك صلاحية إرسال رسائل زاجل.';
      errDiv.classList.remove('d-none');
    } else {
      alert('عذراً، ليس لديك صلاحية إرسال رسائل زاجل.');
    }
    return;
  }

  const text = input.value.trim();
  if (!text || text.length === 0) {
    if (errDiv) {
      errDiv.innerText = 'عذراً، لا يمكن إرسال رسالة فارغة.';
      errDiv.classList.remove('d-none');
    } else {
      alert('عذراً، لا يمكن إرسال رسالة فارغة.');
    }
    return;
  }

  if (text.length > 150) {
    if (errDiv) {
      errDiv.innerText = 'عذراً، يجب ألا تتجاوز الرسالة 150 حرفاً.';
      errDiv.classList.remove('d-none');
    } else {
      alert('عذراً، يجب ألا تتجاوز الرسالة 150 حرفاً.');
    }
    return;
  }

  if (errDiv) {
    errDiv.innerText = '';
    errDiv.classList.add('d-none');
  }

  socket.emit('zajel:send', { message: text });

  const modalElement = document.getElementById('zajelSubmitModal');
  if (modalElement) {
    const modal = bootstrap.Modal.getInstance(modalElement);
    if (modal) modal.hide();
  }
};

window.enforceAdminPasswordPolicy = function() {
  // Completely disabled as requested by user. Admins are no longer forced to change their passwords.
};

(function () {
  if (window.__mentionShakeInstalled) return;
  window.__mentionShakeInstalled = true;

  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes messageShake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-4px); }
      40% { transform: translateX(4px); }
      60% { transform: translateX(-2px); }
      80% { transform: translateX(2px); }
    }

    .mention-shake-effect {
      animation: messageShake 0.5s ease-in-out !important;
      background-color: rgba(212, 176, 165, 0.15) !important;
      border-radius: 8px;
      transition: background-color 0.3s ease;
    }
  `;
  document.head.appendChild(style);

  function triggerMentionShake(mentionEl) {
    const row = mentionEl.closest('.message-row');
    if (!row || row.dataset.hasMentionShaked === 'true') return;

    row.dataset.hasMentionShaked = 'true';

    row.classList.remove('mention-shake-effect');
    void row.offsetWidth;
    row.classList.add('mention-shake-effect');

    setTimeout(() => {
      row.classList.remove('mention-shake-effect');
    }, 600);
  }

  function scanMentionNode(node) {
    if (!node || node.nodeType !== 1) return;

    if (node.classList && node.classList.contains('mention-highlight')) {
      triggerMentionShake(node);
    }

    if (node.querySelectorAll) {
      node.querySelectorAll('.mention-highlight').forEach(triggerMentionShake);
    }
  }

  function initMentionShakeObserver() {
    const target = document.getElementById('messages-container') || document.body;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(scanMentionNode);
        }

        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          scanMentionNode(mutation.target);
        }
      });
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    scanMentionNode(target);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMentionShakeObserver);
  } else {
    initMentionShakeObserver();
  }
})();

(function() {
    if (window.__darkModeInstalled) return;
    window.__darkModeInstalled = true;

    const savedDarkMode = localStorage.getItem('darkModeActive') === 'true';
    if (savedDarkMode) {
        document.body.classList.add('dark-mode-active');
    } else {
        document.body.classList.remove('dark-mode-active');
    }

    function updateButtonUI(isDark) {
        const btn = document.getElementById('toggle-dark-mode-btn');
        if (!btn) return;

        const expectedHTML = isDark 
            ? '<i class="fas fa-sun btn-icon-left"></i><span>إيقاف الوضع الليلي</span>' 
            : '<i class="fas fa-moon btn-icon-left"></i><span>الوضع الليلي</span>';
            
        if (btn.innerHTML !== expectedHTML) {
            btn.innerHTML = expectedHTML;
            btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        }
    }

    function enableDarkMode() {
        document.body.classList.add('dark-mode-active');
        localStorage.setItem('darkModeActive', 'true');
        updateButtonUI(true);
    }

    function disableDarkMode() {
        document.body.classList.remove('dark-mode-active');
        localStorage.setItem('darkModeActive', 'false');
        updateButtonUI(false);
    }

    function toggleDarkMode() {
        if (document.body.classList.contains('dark-mode-active')) {
            disableDarkMode();
        } else {
            enableDarkMode();
        }
    }

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('#toggle-dark-mode-btn');
        if (btn) {
            toggleDarkMode();
            return;
        }

        if (e.target.closest('#settings-logout-btn')) {
            disableDarkMode();
        }
    });

    function syncButtonState() {
        const btn = document.getElementById('toggle-dark-mode-btn');
        if (!btn) return;
        updateButtonUI(document.body.classList.contains('dark-mode-active'));
    }

    const observer = new MutationObserver(syncButtonState);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Run once initially
    syncButtonState();

})();

function updateExtraActionsVisibility() {
    const extraActionsContainer = document.getElementById('extra-actions-container');
    if (!ui.extraActionsToggle || !extraActionsContainer) return;
    
    const canViewFilter = hasPermission('canViewFilterMonitorMessages');
    const canSendFiles = hasPermission('canSendFiles');
    const canWriteBot = hasPermission('canWriteAsBot');
    const canDelete = hasPermission('canDeletePublicMessages');

    const isVisible = canViewFilter || canSendFiles || canWriteBot || canDelete;
    
    extraActionsContainer.classList.toggle('d-none', !isVisible);

    if (isVisible) {
        ui.extraActionsToggle.classList.remove('d-none');
    } else {
        ui.extraActionsToggle.classList.add('d-none');
        if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
        if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');
    }

    if (ui.clearChatBtn) canDelete ? ui.clearChatBtn.classList.remove('d-none') : ui.clearChatBtn.classList.add('d-none');
    if (ui.uploadBtn) canSendFiles ? ui.uploadBtn.classList.remove('d-none') : ui.uploadBtn.classList.add('d-none');
    if (ui.botMsgBtn) canWriteBot ? ui.botMsgBtn.classList.remove('d-none') : ui.botMsgBtn.classList.add('d-none');
    
    const filterBtn = document.getElementById('filter-monitor-menu-btn');
    if (filterBtn) {
        canViewFilter ? filterBtn.classList.remove('d-none') : filterBtn.classList.add('d-none');
    }
    
    if (canViewFilter) {
        window.updateFilterNotificationBadge(typeof monitorUnreadCount !== 'undefined' ? monitorUnreadCount : 0);
    } else {
        window.updateFilterNotificationBadge(0);
    }
}


// --- QUICK CHAT MODULE ---
let quickChatMessagesList = [];
let quickChatUnreadCount = 0;
let isQuickChatSubmitting = false;

window.loadWallSidebar = function() {
  wallNotificationCount = 0;
  updateWallBadge();
  
  if (!ui.sidebarWallContainer) ui.sidebarWallContainer = document.getElementById('sidebar-wall-container');

  const isQuickChatEnabled = window.featuresSettings?.quickChatEnabled === true;
  
  if (!isQuickChatEnabled) {
    ui.sidebarWallContainer.style.display = 'flex';
    ui.sidebarWallContainer.style.flexDirection = 'column';
    ui.sidebarWallContainer.style.overflow = 'hidden';

    ui.sidebarWallContainer.innerHTML = `
      <div id="wall-stories-container"
           class="stories-container p-2 d-flex overflow-auto"
           style="white-space: nowrap; border-bottom: 10px solid var(--sidebar-header-bg, #555555); flex-shrink: 0;">
      </div>

      <div id="wall-posts-inner-container"
           style="flex-grow: 1; min-height: 0; overflow-y: auto;">
      </div>
    `;

    loadWall();

    requestAnimationFrame(() => {
      if (typeof window.ensureStoriesLoaded === 'function') {
        window.ensureStoriesLoaded();
      } else if (typeof window.renderStoriesBar === 'function') {
        window.renderStoriesBar('wall-stories-container');
      }
    });

    return;
  }

  if (!document.getElementById('quick-chat-tabs-header')) {
    ui.sidebarWallContainer.innerHTML = `
      <!-- Stories Container directly inside sidebar and above tabs -->
      <div id="wall-stories-container" class="stories-container p-2 d-flex overflow-auto" style="white-space: nowrap; border-bottom: 10px solid var(--sidebar-header-bg, #555555); flex-shrink: 0;">
        <!-- Stories will be rendered here -->
      </div>

      <!-- Tabs Header -->
      <div id="quick-chat-tabs-header" class="wall-subtabs" role="tablist">
        <button id="btn-tab-quickchat" class="wall-subtab" type="button" role="tab" aria-selected="false">
          <i class="fas fa-comments"></i>
          <span>الدردشة السريعة</span>
          <span id="quick-chat-unread-badge" class="wall-subtab-badge d-none">0</span>
        </button>
        <button id="btn-tab-posts" class="wall-subtab active" type="button" role="tab" aria-selected="true">
          <i class="fas fa-newspaper"></i>
          <span>المنشورات</span>
        </button>
      </div>

      <!-- Tab 1: Quick Chat Content -->
      <div id="quick-chat-content" class="d-flex flex-column flex-grow-1" style="min-height: 0; overflow: hidden;">
        <div id="quick-chat-messages" class="wall-posts-list" style="flex-grow: 1; min-height: 0; padding-bottom: 10px;">
          <div class="text-center text-muted p-4">جاري تحميل الرسائل...</div>
        </div>
        
        <!-- Quick Chat Form Container -->
        <div id="quick-chat-form-container" class="quick-chat-form-container">
          <div id="quick-chat-upload-progress-container" class="quick-chat-upload-progress-container" hidden>
            <div id="quick-chat-upload-progress-bar" class="quick-chat-upload-progress-bar"></div>
            <div id="quick-chat-upload-progress-text" class="quick-chat-upload-progress-text">0%</div>
            <button id="cancel-quick-chat-upload" type="button" class="quick-chat-upload-cancel-btn">
              <i class="fas fa-times"></i> إلغاء
            </button>
          </div>

          <form id="quick-chat-form" class="quick-chat-form">
            <div class="quick-chat-input-group">
              <button type="button" class="quick-chat-btn-icon quick-chat-btn-emoji" id="quick-chat-btn-emoji" title="إيموجي" aria-label="فتح الابتسامات">
                <img src="/emoii.gif" alt="">
              </button>
              <button type="button" class="quick-chat-btn-icon quick-chat-btn-upload" id="quick-chat-btn-upload" title="رفع صورة أو فيديو" aria-label="رفع صورة أو فيديو">
                <i class="fas fa-upload"></i>
              </button>
              <input type="file" id="quick-chat-file-input" class="quick-chat-file-input" accept="image/*,video/*,.mov,.MOV" hidden>
              <textarea id="quick-chat-input" name="quickChatMessage" class="quick-chat-textarea" placeholder="اكتب رسالتك هنا" rows="1" maxlength="300"></textarea>
              <button type="submit" id="quick-chat-btn-send" class="quick-chat-btn-send">
                <span>إرسال</span>
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Tab 2: Wall Posts Content -->
      <div id="wall-posts-tab-content" class="d-none flex-grow-1" style="min-height: 0; display: flex; flex-direction: column;">
        <!-- Standard Wall Posts inner wrapper -->
        <div id="wall-posts-inner-container" style="flex-grow: 1; overflow-y: auto;">
           <!-- This will receive the wall posts list, form, etc. -->
        </div>
      </div>
    `;
    
    requestAnimationFrame(() => {
      if (typeof window.ensureStoriesLoaded === 'function') {
        window.ensureStoriesLoaded();
      } else if (typeof window.renderStoriesBar === 'function') {
        window.renderStoriesBar('wall-stories-container');
      }
    });

    document.getElementById('btn-tab-quickchat').addEventListener('click', () => switchWallSubTab('quickchat'));
    document.getElementById('btn-tab-posts').addEventListener('click', () => switchWallSubTab('posts'));
    
    document.getElementById('quick-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (!e.shiftKey) {
          e.preventDefault();
          submitQuickChatMessage();
        }
      }
    });

    // Form submit listener (as requested in Section 6: submit listener)
    const quickChatForm = document.getElementById('quick-chat-form');
    quickChatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitQuickChatMessage();
    });

    // Emoji button handler
    const emojiBtn = document.getElementById('quick-chat-btn-emoji');
    if (emojiBtn) {
      emojiBtn.addEventListener('click', (event) => {
        openQuickChatEmojiPicker(event);
      });
    }

    // Upload button click handler
    const uploadBtn = document.getElementById('quick-chat-btn-upload');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        const fileInput = document.getElementById('quick-chat-file-input');
        if (fileInput) fileInput.click();
      });
    }

    // Media placeholders delegation (as requested in Section 3)
    const quickChatMessages = document.getElementById('quick-chat-messages');
    if (quickChatMessages) {
      const handleMediaPlaceholderTrigger = (placeholder, event) => {
        revealMedia(
          placeholder,
          placeholder.dataset.mediaType,
          placeholder.dataset.mediaUrl,
          event
        );
      };

      quickChatMessages.addEventListener('click', (event) => {
        const placeholder = event.target.closest('.quick-chat-media-placeholder');
        if (!placeholder) return;
        handleMediaPlaceholderTrigger(placeholder, event);
      });

      quickChatMessages.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          const placeholder = event.target.closest('.quick-chat-media-placeholder');
          if (!placeholder) return;
          event.preventDefault();
          handleMediaPlaceholderTrigger(placeholder, event);
        }
      });
    }

    document.getElementById('quick-chat-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleQuickChatUpload(file);
      e.target.value = '';
    });

    document.getElementById('cancel-quick-chat-upload').addEventListener('click', () => {
      if (window.currentQuickChatUploadXhr) {
        window.currentQuickChatUploadXhr.abort();
        window.currentQuickChatUploadXhr = null;
        showToast('تم إلغاء الرفع.');
        resetQuickChatUploadUI();
      }
    });

    resetQuickChatUnread();
  }

  ui.sidebarWallContainer.style.display = 'flex';
  ui.sidebarWallContainer.style.flexDirection = 'column';
  ui.sidebarWallContainer.style.overflow = 'hidden';

  if (!window.currentWallTab) {
    window.currentWallTab = 'posts';
  }
  switchWallSubTab(window.currentWallTab);
};

window.switchWallSubTab = function(tab) {
  window.currentWallTab = tab;
  const qcTabHeader = document.getElementById('btn-tab-quickchat');
  const postsTabHeader = document.getElementById('btn-tab-posts');
  const qcContent = document.getElementById('quick-chat-content');
  const postsContent = document.getElementById('wall-posts-tab-content');

  if (!qcTabHeader || !postsTabHeader || !qcContent || !postsContent) return;

  const isQuickChat = tab === 'quickchat';

  qcTabHeader.classList.toggle('active', isQuickChat);
  qcTabHeader.setAttribute('aria-selected', isQuickChat ? 'true' : 'false');

  postsTabHeader.classList.toggle('active', !isQuickChat);
  postsTabHeader.setAttribute('aria-selected', !isQuickChat ? 'true' : 'false');

  qcContent.classList.toggle('d-none', !isQuickChat);
  postsContent.classList.toggle('d-none', isQuickChat);

  if (isQuickChat) {
    requestQuickChatHistory();
    resetQuickChatUnread();
  } else {
    loadWall();
    requestAnimationFrame(() => {
      if (typeof window.ensureStoriesLoaded === 'function') {
        window.ensureStoriesLoaded();
      } else if (typeof window.renderStoriesBar === 'function') {
        window.renderStoriesBar('wall-stories-container');
      }
    });
  }
};

function requestQuickChatHistory() {
  if (typeof socket !== 'undefined' && socket.connected) {
    socket.emit('quick-chat:request-history');
  }
}

function handleQuickChatHistory(messages) {
  const container = document.getElementById('quick-chat-messages');
  if (!container) return;

  container.innerHTML = '';

  const sortedMessages = [...(messages || [])].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  quickChatMessagesList = sortedMessages;

  if (quickChatMessagesList.length === 0) {
    container.innerHTML = '<div class="text-center text-muted p-4" style="font-size: 13px;">لا توجد رسائل في الدردشة السريعة حالياً.</div>';
    return;
  }

  quickChatMessagesList.forEach((message) => {
    const messageElement = createQuickChatMessageElement(message);
    if (messageElement) {
      container.appendChild(messageElement);
    }
  });

  container.scrollTop = 0;
}

function renderAllQuickChatMessages() {
  const container = document.getElementById('quick-chat-messages');
  if (!container) return;

  container.innerHTML = '';

  if (quickChatMessagesList.length === 0) {
    container.innerHTML = '<div class="text-center text-muted p-4" style="font-size: 13px;">لا توجد رسائل في الدردشة السريعة حالياً.</div>';
    return;
  }

  quickChatMessagesList.forEach(msg => {
    const messageElement = createQuickChatMessageElement(msg);
    if (messageElement) {
      container.appendChild(messageElement);
    }
  });
}

function createQuickChatMessageElement(msg) {
  const temp = document.createElement('div');
  temp.innerHTML = renderQuickChatMessage(msg);
  return temp.firstElementChild;
}

function renderQuickChatMessage(msg) {
  const sender = msg.sender || {};
  const usersList = (window.state && window.state.currentUsers) || window.onlineUsers || [];
  const senderId = sender.id || sender.userId;
  const activeUser = usersList.find(u =>
    (senderId && (String(u.id || u.userId) === String(senderId))) ||
    (sender.username && u.username === sender.username)
  );
  const renderSenderData = activeUser ? { ...sender, ...activeUser } : sender;

  const currentUserId = state.currentUser?.id;
  const isMsgAuthor = (state.currentUser && sender.id && String(sender.id) === String(state.currentUser.id)) ||
                      (state.guestSessionId && msg.guestSessionId && String(msg.guestSessionId) === String(state.guestSessionId));
  const canDeleteOthers = hasPermission('canDeleteWallPosts');
  const showDeleteBtn = isMsgAuthor || canDeleteOthers;

  const avatarUrl = window.getAvatarUrl(renderSenderData);
  const userIdentityHtml = typeof window.renderUserIdentity === 'function' ? window.renderUserIdentity(renderSenderData, {
     nameClasses: 'quick-chat-username',
     nameStyle: `color: ${renderSenderData.ucol || '#e67e22'};`,
     tag: 'a',
     onClick: `event.preventDefault(); if (typeof showUserProfile === 'function') showUserProfile('${escapeHTML(renderSenderData.username || '')}');`
  }) : `<a href="#" onclick="event.preventDefault(); if (typeof showUserProfile === 'function') showUserProfile('${escapeHTML(renderSenderData.username || '')}');" class="quick-chat-username" style="color: ${escapeHTML(renderSenderData.ucol || '#e67e22')}">${escapeHTML(renderSenderData.topic || renderSenderData.username || '')}</a>`;

  const timeStr = formatTimeAgo(msg.createdAt);

  let renderedQuickText = msg.text
    ? replacePlaceholders(
        replaceShortcuts(
          escapeHTML(
            decodeWallEntities(msg.text)
          )
        )
      )
    : '';
  if (renderedQuickText && window.safeLinkify) {
    renderedQuickText = window.safeLinkify(renderedQuickText);
  }

  let mediaHtml = '';
  if (msg.mediaUrl) {
    const safeMediaUrl = escapeHTML(msg.mediaUrl);
    if (msg.mediaType === 'video') {
      mediaHtml = `
        <div class="quick-chat-media mt-2">
          <div class="quick-chat-media-placeholder quick-chat-video-placeholder"
               role="button"
               tabindex="0"
               data-media-type="video"
               data-media-url="${safeMediaUrl}">
            <span class="quick-chat-media-label">تشغيل الفيديو</span>
            <div class="quick-chat-media-icon">
              <i class="fas fa-play-circle"></i>
            </div>
          </div>
        </div>
      `;
    } else {
      mediaHtml = `
        <div class="quick-chat-media mt-2">
          <div class="quick-chat-media-placeholder quick-chat-image-placeholder"
               role="button"
               tabindex="0"
               data-media-type="image"
               data-media-url="${safeMediaUrl}">
            <span class="quick-chat-media-label">عرض الصورة</span>
            <div class="quick-chat-media-icon">
              <i class="fas fa-image"></i>
            </div>
          </div>
        </div>
      `;
    }
  }

  return `
    <div class="quick-chat-card" id="qc-msg-${msg.id}">
      <img src="${avatarUrl}" class="quick-chat-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${escapeHTML(sender.username || '')}" style="cursor: pointer;">
      
      <div class="quick-chat-main">
        <div class="quick-chat-header">
          <div class="d-flex align-items-center">
            ${userIdentityHtml}
          </div>
          <div class="quick-chat-time">${timeStr}</div>
        </div>

        <div class="quick-chat-content ${mediaHtml ? 'has-media' : ''}">
          <div class="quick-chat-body">
            ${renderedQuickText ? `
              <div class="quick-chat-text" style="color: ${sender.fontColor || '#000000'}">
                ${renderedQuickText}
              </div>
            ` : ''}
            ${mediaHtml ? `<div class="quick-chat-media-clear">${mediaHtml}</div>` : ''}
          </div>
          ${showDeleteBtn ? `
            <div class="quick-chat-actions-row">
              <button class="quick-chat-action-btn quick-chat-btn-delete" onclick="deleteQuickChatMessage('${msg.id}')" title="حذف">
                <i class="fas fa-times"></i>
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function handleNewQuickChatMessage(msg) {
  if (quickChatMessagesList.some(m => String(m.id) === String(msg.id))) {
    return;
  }

  quickChatMessagesList.unshift(msg);
  if (quickChatMessagesList.length > 50) {
    quickChatMessagesList.pop();
  }

  const container = document.getElementById('quick-chat-messages');
  if (container) {
    const noMsgPlaceholder = container.querySelector('.text-muted');
    if (noMsgPlaceholder) {
      container.innerHTML = '';
    }

    const oldScrollHeight = container.scrollHeight;
    const oldScrollTop = container.scrollTop;

    const msgEl = createQuickChatMessageElement(msg);
    if (msgEl) {
      container.prepend(msgEl);
    }

    while (container.children.length > 50) {
      container.lastElementChild.remove();
    }

    const isSelf = (state.currentUser && msg.sender?.id && String(msg.sender.id) === String(state.currentUser.id)) ||
                   (state.guestSessionId && msg.guestSessionId && String(msg.guestSessionId) === String(state.guestSessionId));

    if (isSelf || oldScrollTop <= 10) {
      container.scrollTop = 0;
    } else {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    }
  }

  const isQuickChatActive = state.activeSidebarTab === 'wall' && window.currentWallTab === 'quickchat';
  if (!isQuickChatActive) {
    incrementQuickChatUnread();
    
    const isSelf = (state.currentUser && msg.sender?.id && String(msg.sender.id) === String(state.currentUser.id)) ||
                   (state.guestSessionId && msg.guestSessionId && String(msg.guestSessionId) === String(state.guestSessionId));
    if (!isSelf && !window.isNotificationSoundsMuted()) {
      if (window.profileSoundManager) {
        window.profileSoundManager.playAlert();
      } else if (window.soundManager && typeof window.soundManager.playSound === 'function') {
        window.soundManager.playSound('notification');
      }
    }
  }
}

function handleQuickChatMessageDeleted(data) {
  quickChatMessagesList = quickChatMessagesList.filter(m => String(m.id) !== String(data.id));
  
  const el = document.getElementById(`qc-msg-${data.id}`);
  if (el) {
    el.remove();
  }

  const container = document.getElementById('quick-chat-messages');
  if (container && quickChatMessagesList.length === 0) {
    container.innerHTML = '<div class="text-center text-muted p-4" style="font-size: 13px;">لا توجد رسائل في الدردشة السريعة حالياً.</div>';
  }
}

function incrementQuickChatUnread() {
  quickChatUnreadCount++;
  updateQuickChatUnreadBadge();
  
  if (state.activeSidebarTab !== 'wall') {
    wallNotificationCount++;
    updateWallBadge();
  }
}

function resetQuickChatUnread() {
  quickChatUnreadCount = 0;
  updateQuickChatUnreadBadge();
}

function updateQuickChatUnreadBadge() {
  const badge = document.getElementById('quick-chat-unread-badge');
  if (badge) {
    if (quickChatUnreadCount > 0) {
      badge.innerText = quickChatUnreadCount;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }
}

window.deleteQuickChatMessage = function(id) {
  if (!id) return;
  Swal.fire({
    title: 'هل أنت متأكد؟',
    text: "لن تتمكن من استعادة هذه الرسالة!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، احذفها',
    cancelButtonText: 'إلغاء'
  }).then((result) => {
    if (result.isConfirmed) {
      if (typeof socket !== 'undefined' && socket.connected) {
        socket.emit('quick-chat:delete', { id });
      }
    }
  });
};

window.openQuickChatEmojiPicker = function(event) {
  event.preventDefault();
  event.stopPropagation();
  const input = document.getElementById('quick-chat-input');
  if (input && typeof window.toggleEmojiPicker === 'function') {
    window.toggleEmojiPicker(input);
  }
};

window.submitQuickChatMessage = function() {
  const input = document.getElementById('quick-chat-input');
  if (!input || isQuickChatSubmitting) return;

  const text = input.value.trim();
  if (!text) return;

  let mediaUrl = null;
  let mediaType = null;
  const ytId = typeof getYoutubeId === 'function' ? getYoutubeId(text) : null;
  if (ytId) {
    mediaUrl = ytId;
    mediaType = 'youtube';
  }

  isQuickChatSubmitting = true;
  const sendBtn = document.getElementById('quick-chat-btn-send');
  if (sendBtn) sendBtn.disabled = true;

  socket.emit('quick-chat:send', { text, mediaUrl, mediaType }, (response) => {
    isQuickChatSubmitting = false;
    if (sendBtn) sendBtn.disabled = false;

    if (response && response.success) {
      input.value = '';
    } else {
      const errorMsg = response?.error || 'فشل إرسال الرسالة السريعة.';
      showToast(errorMsg);
    }
  });
};

function setupQuickChatSocketListeners() {
  if (typeof socket === 'undefined' || !socket) return;

  socket.on('quick-chat:history', (messages) => {
    handleQuickChatHistory(messages);
  });

  socket.on('quick-chat:new', (msg) => {
    handleNewQuickChatMessage(msg);
  });

  const qcFileInput = document.getElementById('quick-chat-file-input');
  if (qcFileInput) {
    qcFileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        handleQuickChatUpload(file);
      }
      e.target.value = '';
    };
  }

  socket.on('quick-chat:deleted', (data) => {
    handleQuickChatMessageDeleted(data);
  });

  socket.on('quick-chat:clear', () => {
    quickChatMessagesList = [];
    renderAllQuickChatMessages();
    showToast('تم مسح رسائل الدردشة السريعة من قبل الإدارة.');
  });
}


function resetQuickChatUploadUI() {
  const container = document.getElementById('quick-chat-upload-progress-container');
  const bar = document.getElementById('quick-chat-upload-progress-bar');
  const text = document.getElementById('quick-chat-upload-progress-text');
  const sendBtn = document.getElementById('quick-chat-btn-send');
  const uploadBtn = document.getElementById('quick-chat-btn-upload');
  
  if (container) container.setAttribute('hidden', 'true');
  if (bar) bar.style.width = '0%';
  if (text) text.textContent = '0%';
  if (sendBtn) sendBtn.disabled = false;
  if (uploadBtn) uploadBtn.disabled = false;
}

function handleQuickChatUpload(file) {
  if (window.currentQuickChatUploadXhr) {
    showToast('هناك عملية رفع جارية بالفعل.');
    return;
  }
  
  const textInput = document.getElementById('quick-chat-input');
  const sendBtn = document.getElementById('quick-chat-btn-send');
  const uploadBtn = document.getElementById('quick-chat-btn-upload');
  const container = document.getElementById('quick-chat-upload-progress-container');
  const bar = document.getElementById('quick-chat-upload-progress-bar');
  const text = document.getElementById('quick-chat-upload-progress-text');

  sendBtn.disabled = true;
  uploadBtn.disabled = true;
  container.removeAttribute('hidden');
  bar.style.width = '0%';
  text.textContent = '0%';

  const formData = new FormData();
  formData.append('file', file);
  
  const xhr = new XMLHttpRequest();
  window.currentQuickChatUploadXhr = xhr;
  
  xhr.open('POST', '/api/upload/quickchatfiles', true);
  xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
  xhr.setRequestHeader('X-Chat-Token', getToken());

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      bar.style.width = percent + '%';
      text.textContent = percent + '%';
    }
  };

  xhr.onload = async () => {
    window.currentQuickChatUploadXhr = null;
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      
      socket.emit('quick-chat:send', { 
        text: textInput.value, 
        mediaUrl: response.url, 
        mediaType: response.mediaType 
      }, (ack) => {
        if (ack && ack.success) {
          textInput.value = '';
          resetQuickChatUploadUI();
        } else {
          showToast(ack?.error || 'فشل إرسال الرسالة.');
          resetQuickChatUploadUI();
          // Optional: handle file deletion if socket send failed
        }
      });
    } else {
      showToast(JSON.parse(xhr.responseText)?.message || 'فشل رفع الملف.');
      resetQuickChatUploadUI();
    }
  };
  
  xhr.onerror = () => {
    window.currentQuickChatUploadXhr = null;
    showToast('خطأ في الاتصال بالسيرفر.');
    resetQuickChatUploadUI();
  };
  
  xhr.send(formData);
}

setupQuickChatSocketListeners();





