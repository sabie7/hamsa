import { voiceState } from './voiceState.js';

const IceServerURL = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.chat-host.net:5349" },
  { urls: "stun:stun.chat-host.net" },
  { urls: ["turn:eu-0.turn.peerjs.com:3478","turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
  { urls: ["turn:turn.chat-host.net:5349?transport=udp","turn:turn.chat-host.net:5349?transport=tcp","turns:turn.chat-host.net:5349?transport=tcp","turn:turn.chat-host.net:443?transport=udp","turn:turn.chat-host.net:443?transport=tcp","turns:turn.chat-host.net:443?transport=tcp"], username: "gN3yO0cF0uM6mQ2yU4tY3lR9vQ3qA9uA", credential: "fE7lY5-oR5tU0-fE5qY1-oE1oL5-pA5pU0" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelaypassword" },
  { urls: "stun:fr-turn3.xirsys.com" },
  { urls: ["turn:fr-turn3.xirsys.com:80?transport=udp","turn:fr-turn3.xirsys.com:3478?transport=udp","turn:fr-turn3.xirsys.com:80?transport=tcp","turn:fr-turn3.xirsys.com:3478?transport=tcp","turns:fr-turn3.xirsys.com:443?transport=tcp","turns:fr-turn3.xirsys.com:5349?transport=tcp"], username: "tXzcEcDOut6ZNSuKQqTRWklYZwYrMJN0JQK2kly4cJmPews5xLNVT1b3WTleKKByAAAAAGV0k3NtYWhkb3VzaA==", credential: "a90a77d6-96ae-11ee-94a6-0242ac120004" },
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "turn:a.relay.metered.ca:80", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
  { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
  { urls: "turn:a.relay.metered.ca:443", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
  { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" }
];

export class VoiceManager {
  constructor(socket) {
    this.socket = socket;
    this.state = voiceState;
    this.audioSessionUnlocked = false;
    this.silentAudioEl = null;
    this.pendingRemoteAudio = new Set();
    this.visualizerAudioContext = null;
    this.visualizers = new Map();
    this.visualizerAnimationFrame = null;
    this.pendingIceCandidates = new Map();
    this.isMicOperationPending = false;
    this.pendingBroadcasterSignals = new Map();
    this.signalingQueues = new Map();
    this.pendingLocalStream = null;
    this.audioContextResumePromise = null;
    this.initSocketListeners();
    this.initVisibilityListeners();
  }

  initVisibilityListeners() {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            console.warn('[VoiceAudio] Page became visible. Ensuring AudioContext is running.');
            void this.ensureVoiceAudioContextRunning();
            if (this.audioSessionUnlocked && this.silentAudioEl && this.silentAudioEl.paused) {
                this.silentAudioEl.play().catch(() => {});
            }
            this.retryPendingRemoteAudio();
            for (const socketId in this.state.audioElements) {
                const el = this.state.audioElements[socketId];
                if (el && el.paused && (!el.muted || el.volume > 0)) {
                    this.playRemoteAudio(el, socketId);
                }
            }
        }
    });
    
    window.addEventListener('pageshow', async () => {
        console.warn('[VoiceAudio] Page show event. Ensuring AudioContext is running.');
        void this.ensureVoiceAudioContextRunning();
        this.retryPendingRemoteAudio();
    });
    
    window.addEventListener('focus', async () => {
        console.warn('[VoiceAudio] Page focused. Ensuring AudioContext is running.');
        void this.ensureVoiceAudioContextRunning();
        this.retryPendingRemoteAudio();
    });
    
    const interactionHandler = async () => {
        if (!this.audioSessionUnlocked) {
            this.unlockAudioSession();
        }
        void this.ensureVoiceAudioContextRunning();
        this.retryPendingRemoteAudio();
    };
    
    document.addEventListener('pointerdown', interactionHandler, { passive: true });
    document.addEventListener('touchstart', interactionHandler, { passive: true });
    document.addEventListener('click', interactionHandler, { passive: true });
  }

  unlockAudioSession() {
    if (this.audioSessionUnlocked) return;
    this.startSilentAudioSession();
    void this.ensureVoiceAudioContextRunning();
  }

  startSilentAudioSession() {
    if (this.silentAudioEl) {
      if (this.silentAudioEl.paused) {
        this.silentAudioEl.play().catch(() => {});
      }
      return;
    }

    let existingAnchor = document.getElementById('voice-audio-session-anchor');
    if (existingAnchor) {
      this.silentAudioEl = existingAnchor;
    } else {
      try {
        this.silentAudioEl = document.createElement('audio');
        this.silentAudioEl.id = 'voice-audio-session-anchor';
        Object.assign(this.silentAudioEl.style, {
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          width: '1px',
          height: '1px',
          opacity: '0',
          pointerEvents: 'none'
        });
        this.silentAudioEl.autoplay = false;
        this.silentAudioEl.loop = true;
        this.silentAudioEl.preload = 'auto';
        this.silentAudioEl.playsInline = true;
        this.silentAudioEl.setAttribute('playsinline', '');
        this.silentAudioEl.setAttribute('webkit-playsinline', '');
        this.silentAudioEl.src = '/sounds/voice-silence.mp3';
        document.body.appendChild(this.silentAudioEl);
      } catch (e) {
        console.warn('Error creating silent audio session element:', e);
        return;
      }
    }

    try {
      const playPromise = this.silentAudioEl.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          this.audioSessionUnlocked = true;
          this.retryPendingRemoteAudio();
        }).catch(err => {
          console.warn('Silent audio session failed to start:', err);
          // Keep element to retry on next interaction
        });
      } else {
        this.audioSessionUnlocked = true;
        this.retryPendingRemoteAudio();
      }
    } catch (e) {
      console.warn('Error starting silent audio session play:', e);
    }
  }

  stopSilentAudioSession() {
    if (this.silentAudioEl) {
      try { this.silentAudioEl.pause(); } catch (e) {}
      this.silentAudioEl.src = '';
      try { this.silentAudioEl.removeAttribute('src'); } catch (e) {}
      try { this.silentAudioEl.remove(); } catch (e) {}
      this.silentAudioEl = null;
    }
    const existingAnchor = document.getElementById('voice-audio-session-anchor');
    if (existingAnchor) {
      try { existingAnchor.pause(); } catch (e) {}
      existingAnchor.src = '';
      try { existingAnchor.remove(); } catch (e) {}
    }
    this.audioSessionUnlocked = false;
  }

  async playRemoteAudio(audioEl, socketId) {
    if (!audioEl) return;

    try {
      await audioEl.play();
      this.pendingRemoteAudio.delete(socketId);
    } catch (err) {
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'AbortError'
      ) {
        this.pendingRemoteAudio.add(socketId);
      } else {
        console.warn(
          `[VoiceAudio] Failed to play remote audio for ${socketId}:`,
          err
        );
      }
    }
  }

  retryPendingRemoteAudio() {
    if (!this.pendingRemoteAudio || this.pendingRemoteAudio.size === 0) return;
    for (const socketId of this.pendingRemoteAudio) {
      const audioEl = this.state.audioElements[socketId];
      if (audioEl) {
        this.playRemoteAudio(audioEl, socketId);
      } else {
        this.pendingRemoteAudio.delete(socketId);
      }
    }
  }

  initSocketListeners() {
    this.socket.on('voice:state', (data) => {
      if (data.roomId !== window.state.currentRoomId) return;
      
      const oldMicsState = { ...this.state.micsState };
      this.state.micsState = data.mics || {};
      
      // Pass 1: Identify moved sessions before processing leave/join
      const movedSessions = new Set();
      for (const newIdx in this.state.micsState) {
          const newUser = this.state.micsState[newIdx];
          if (!newUser) continue;
          
          for (const oldIdx in oldMicsState) {
              const oldUser = oldMicsState[oldIdx];
              if (!oldUser) continue;
              
              if (oldUser.socketId === newUser.socketId && oldUser.voiceSessionId === newUser.voiceSessionId && oldIdx !== newIdx) {
                  movedSessions.add(newUser.voiceSessionId);
                  
                  if (newUser.socketId === this.socket.id) {
                      this.state.currentMicIndex = parseInt(newIdx);
                  }
                  break;
              }
          }
      }
      
      this.updateUI();
      
      const allIndices = new Set([
        ...Object.keys(oldMicsState),
        ...Object.keys(this.state.micsState)
      ]);
      
      for (const idx of allIndices) {
        const oldUser = oldMicsState[idx];
        const newUser = this.state.micsState[idx];
        
        // Case 1: New user joined or changed on this mic
        if (newUser && (!oldUser || oldUser.socketId !== newUser.socketId)) {
          if (!movedSessions.has(newUser.voiceSessionId)) {
            if (newUser.socketId !== this.socket.id) {
              this.connectToPeer(newUser.socketId, parseInt(idx), newUser.voiceSessionId);
            } else {
              if (newUser.isMutedSelf !== undefined) {
                this.state.isMuted = newUser.isMutedSelf;
                if (this.state.localStream) {
                  this.state.localStream.getAudioTracks().forEach(track => {
                    track.enabled = !this.state.isMuted;
                  });
                }
              }
            }
          }
        }
        
        // Case 2: User left this mic
        if (oldUser && (!newUser || oldUser.socketId !== newUser.socketId)) {
          if (!movedSessions.has(oldUser.voiceSessionId)) {
            if (oldUser.socketId === this.socket.id) {
              console.log('Detected we are no longer on mic via voice:state');
              this.stopBroadcasting();
            } else {
              this.disconnectFromPeer(oldUser.socketId, oldUser.voiceSessionId);
            }
          }
        }

        // Case 3: Existing user changed state
        if (newUser && oldUser && newUser.socketId === oldUser.socketId && newUser.voiceSessionId === oldUser.voiceSessionId) {
          if (newUser.socketId === this.socket.id) {
            if (newUser.isMutedSelf !== undefined && newUser.isMutedSelf !== this.state.isMuted) {
              this.state.isMuted = newUser.isMutedSelf;
              if (this.state.localStream) {
                this.state.localStream.getAudioTracks().forEach(track => {
                  track.enabled = !this.state.isMuted;
                });
              }
            }
          }
        }
      }
    });

    this.socket.on('voice:cleanup', () => {
      console.log('Received voice:cleanup from server');
      this.stopBroadcasting();
      const menu = document.querySelector('.mic-context-menu');
      if (menu) menu.remove();
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[VoiceManager] Socket disconnected:', reason);
      this.cleanup();
    });

    this.socket.on('connect', () => {
      console.log('[VoiceManager] Socket connected/reconnected.');
      this.state.currentMicIndex = null;
      this.state.currentVoiceSessionId = null;
    });

    this.socket.on('voice:signal', async (data) => {
      const { senderSocketId, signalData, voiceSessionId } = data;
      
      const isBroadcaster = this.isOurVoiceSession(voiceSessionId) || (this.state.currentVoiceSessionId === voiceSessionId);
      
      if (isBroadcaster) {
        const outgoingStream = this.state.localStream || this.pendingLocalStream;
        if (!outgoingStream) {
          console.warn('[VoiceRTC] broadcaster signal received but no local/pending stream yet. Queueing signal.');
          this.queueBroadcasterSignal(voiceSessionId, senderSocketId, signalData);
          return;
        }
      }

      const key = this.getConnectionKey(voiceSessionId, senderSocketId, isBroadcaster);
      
      await this.enqueueSignal(key, async () => {
        let pc = this.state.peerConnections[key];
        if (pc && pc.connectionState === 'closed') {
          pc = null;
        }
        if (!pc) {
          pc = this.createPeerConnection(senderSocketId, isBroadcaster, voiceSessionId);
        }
        await this.handleSignal(pc, senderSocketId, signalData, voiceSessionId);
      });
    });
  }

  async handleSignal(pc, senderSocketId, signalData, voiceSessionId) {
    try {
      if (signalData.type === 'offer') {
        if (pc.signalingState !== 'stable') {
          console.warn('[VoiceRTC] Ignoring duplicate/invalid offer in signaling state:', pc.signalingState);
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signalData));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        this.socket.emit('voice:signal', {
          targetSocketId: senderSocketId,
          signalData: pc.localDescription || answer,
          roomId: window.state.currentRoomId,
          voiceSessionId
        });
        await this.processPendingIceCandidates(pc);
      } else if (signalData.type === 'answer') {
        if (pc.signalingState !== 'have-local-offer') {
          console.warn('[VoiceRTC] Ignoring duplicate/invalid answer in signaling state:', pc.signalingState);
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signalData));
        await this.processPendingIceCandidates(pc);
      } else if (signalData.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(signalData));
        } else {
          let candidates = this.pendingIceCandidates.get(pc) || [];
          candidates.push(signalData);
          this.pendingIceCandidates.set(pc, candidates);
        }
      }
    } catch (err) {
      console.error('WebRTC Signal Error:', err);
    }
  }

  async processPendingIceCandidates(pc) {
    const candidates = this.pendingIceCandidates.get(pc);
    if (candidates && candidates.length > 0) {
      for (const candidateData of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidateData));
        } catch (e) {
          console.error('Error adding pending ICE candidate:', e);
        }
      }
    }
    this.pendingIceCandidates.delete(pc);
  }

  async toggleMic(roomId, micIndex) {
    if (this.isMicOperationPending) return;
    
    console.warn('[VoiceAudio] User toggling mic.');
    void this.ensureVoiceAudioContextRunning();

    const isActive = this.state.currentRoomId === roomId && this.state.currentMicIndex === micIndex;
    
    if (isActive) {
      await this.leaveMic(roomId, micIndex);
    } else if (this.state.currentMicIndex !== null && this.state.currentRoomId === roomId) {
      await this.moveMic(roomId, micIndex);
    } else {
      await this.takeMic(roomId, micIndex);
    }
  }

  async moveMic(roomId, toMicIndex) {
    if (this.isMicOperationPending) return;
    this.isMicOperationPending = true;
    
    try {
      return new Promise((resolve) => {
        this.socket.emit('voice:move-mic', { roomId, toMicIndex }, (res) => {
          if (res && res.ok) {
            this.state.currentMicIndex = toMicIndex;
            // The visualizer DOM movement is handled by updateUI,
            // which will be triggered by voice:state or here
            this.updateUI();
          } else {
            const reason = res ? res.reason : 'unknown';
            if (reason === 'mic-busy') {
              window.showToast('هذا المايك مشغول حالياً', 'error');
            } else if (reason === 'mic-locked') {
              window.showToast('هذا المايك مقفل حالياً', 'error');
            } else {
              window.showToast('لا يمكنك الانتقال لهذا المايك حالياً', 'error');
            }
          }
          resolve();
        });
      });
    } finally {
      this.isMicOperationPending = false;
    }
  }

  async takeMic(roomId, micIndex) {
    if (this.isMicOperationPending) return;
    
    console.warn('[VoiceAudio] User taking mic.');
    void this.ensureVoiceAudioContextRunning();

    this.isMicOperationPending = true;
    
    if (this.state.currentMicIndex !== null) {
      window.showToast('أنت متواجد على مايك آخر بالفعل');
      this.isMicOperationPending = false;
      return;
    }
    
    let tempStream = null;
    try {
      // Get media first to ensure permission with proper constraints for speech
      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
      const audioConstraints = {
        echoCancellation: supportedConstraints.echoCancellation ? true : undefined,
        noiseSuppression: supportedConstraints.noiseSuppression ? true : undefined,
        autoGainControl: supportedConstraints.autoGainControl ? true : undefined,
        channelCount: 1
      };
      
      tempStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      
      // Hint to OS that this is speech
      tempStream.getAudioTracks().forEach(track => {
         if ('contentHint' in track) {
             track.contentHint = 'speech';
         }
      });
      
      this.pendingLocalStream = tempStream;
      console.warn('[VoiceRTC] local stream ready. Setting pendingLocalStream.');

      // Second resume after getUserMedia to keep session active on iOS
      void this.ensureVoiceAudioContextRunning();
      
      return new Promise((resolve) => {
        // Ask server for permission
        this.socket.emit('voice:take-mic', { roomId, micIndex }, async (res) => {
          if (res && res.ok) {
            this.state.localStream = this.pendingLocalStream;
            this.pendingLocalStream = null;

            this.state.currentRoomId = roomId;
            this.state.currentMicIndex = micIndex;
            this.state.currentVoiceSessionId = res.voiceSessionId;
            this.state.isMuted = false;
            
            // Third resume to secure running audio state
            void this.ensureVoiceAudioContextRunning();

            // Create shared visualizer context on first mic take if not present
            this.getOrCreateVisualizerAudioContext();
            this.setupVisualizer(this.state.localStream, this.socket.id, res.voiceSessionId);
            
            this.updateUI();

            // Flush broadcaster signals
            await this.flushPendingBroadcasterSignals();
          } else {
            if (this.pendingLocalStream) {
              this.pendingLocalStream.getTracks().forEach(track => track.stop());
              this.pendingLocalStream = null;
            }
            if (tempStream) {
              tempStream.getTracks().forEach(track => track.stop());
            }

            const rejectedSessionId = res ? res.voiceSessionId : null;
            if (rejectedSessionId) {
              for (const key of this.pendingBroadcasterSignals.keys()) {
                if (key.startsWith(rejectedSessionId + '_')) {
                  this.pendingBroadcasterSignals.delete(key);
                }
              }
            }

            const reason = res ? res.reason : 'unknown';
            if (reason === 'mic-busy') {
              window.showToast('هذا المايك مشغول حالياً', 'error');
            } else if (reason === 'mic-locked') {
              window.showToast('هذا المايك مقفل حالياً', 'error');
            } else if (reason === 'already-on-mic') {
              window.showToast('أنت متواجد على مايك آخر بالفعل', 'error');
            } else if (reason.includes('تحتاج إلى') || reason.includes('لايك') || reason.includes('requiredLikes')) {
              if (window.showLikesLimitAlert) {
                window.showLikesLimitAlert(reason);
              } else {
                Swal.fire({
                  title: 'عذراً',
                  text: reason,
                  icon: 'warning',
                  confirmButtonText: 'موافق'
                });
              }
            } else {
              window.showToast('لا يمكنك الصعود على المايك حالياً', 'error');
            }
          }
          resolve();
        });
      });
    } catch (err) {
      if (tempStream) {
        tempStream.getTracks().forEach(track => track.stop());
      }
      if (this.pendingLocalStream) {
        this.pendingLocalStream.getTracks().forEach(track => track.stop());
        this.pendingLocalStream = null;
      }
      window.showToast('فشل في الوصول للمايكروفون');
      console.error(err);
    } finally {
      this.isMicOperationPending = false;
    }
  }

  async leaveMic(roomId, micIndex) {
    if (this.isMicOperationPending) return;
    this.isMicOperationPending = true;
    try {
      this.socket.emit('voice:leave-mic', { roomId, micIndex });
      this.stopBroadcasting();
    } finally {
      this.isMicOperationPending = false;
    }
  }

  getOrCreateVisualizerAudioContext() {
    if (!this.visualizerAudioContext || this.visualizerAudioContext.state === 'closed') {
      this.visualizerAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.setupAudioContextStateChangeListener(this.visualizerAudioContext);
    }
    return this.visualizerAudioContext;
  }

  setupAudioContextStateChangeListener(ctx) {
    if (!ctx) return;
    ctx.onstatechange = () => {
      console.warn('[VoiceAudio] context state changed to:', ctx.state);
      if (ctx.state === 'running') {
        this.onVoiceAudioContextResumed();
      }
    };
  }

  onVoiceAudioContextResumed() {
    console.warn('[VoiceAudio] AudioContext running.');
    this.retryPendingRemoteAudio();
  }

  async ensureVoiceAudioContextRunning() {
    const ctx = this.getOrCreateVisualizerAudioContext();
    if (!ctx) return null;
    
    if (ctx.state !== 'running' && ctx.state !== 'closed') {
      if (this.audioContextResumePromise) {
        return this.audioContextResumePromise;
      }
      
      console.warn('[VoiceAudio] attempting to resume context, current state:', ctx.state);
      this.audioContextResumePromise = ctx.resume().then(() => {
        this.audioContextResumePromise = null;
        if (ctx.state === 'running') {
          console.warn('[VoiceAudio] context successfully resumed and running');
          this.onVoiceAudioContextResumed();
        }
      }).catch(err => {
        this.audioContextResumePromise = null;
        console.warn('[VoiceAudio] Failed to resume voice audio context:', err);
      });
      
      return this.audioContextResumePromise;
    }
    return ctx;
  }

  resumeVisualizerAudioContext() {
    void this.ensureVoiceAudioContextRunning();
  }

  setupVisualizer(stream, socketId, voiceSessionId) {
    if (!stream || !socketId || !voiceSessionId) return;
    const ctx = this.getOrCreateVisualizerAudioContext();
    
    // Don't duplicate if already exists for this session
    if (this.visualizers.has(voiceSessionId)) return;
    
    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      
      this.visualizers.set(voiceSessionId, {
        analyser,
        source,
        stream,
        socketId,
        dataArray: new Uint8Array(analyser.frequencyBinCount)
      });
      
      if (!this.visualizerAnimationFrame) {
        this.renderVisualizerFrame();
      }
    } catch (err) {
      console.warn('Failed to setup visualizer:', err);
    }
  }

  stopVisualizer(voiceSessionId) {
    const viz = this.visualizers.get(voiceSessionId);
    if (viz) {
      try { viz.source.disconnect(); } catch (e) {}
      this.visualizers.delete(voiceSessionId);
    }
  }

  stopAllVisualizers() {
    for (const [voiceSessionId, viz] of this.visualizers.entries()) {
      try { viz.source.disconnect(); } catch (e) {}
    }
    this.visualizers.clear();
    if (this.visualizerAnimationFrame) {
      cancelAnimationFrame(this.visualizerAnimationFrame);
      this.visualizerAnimationFrame = null;
    }
  }

  renderVisualizerFrame() {
    if (this.visualizers.size === 0 || !window.state.currentRoomId) {
      this.visualizerAnimationFrame = null;
      return;
    }
    
    for (const [voiceSessionId, viz] of this.visualizers.entries()) {
      // Find current mic index for this session
      let currentMicIndex = null;
      for (const idx in this.state.micsState) {
        const user = this.state.micsState[idx];
        if (user && user.socketId === viz.socketId && user.voiceSessionId === voiceSessionId) {
          currentMicIndex = parseInt(idx);
          break;
        }
      }
      
      if (currentMicIndex === null) {
        // User is no longer on a mic with this session, but we wait for cleanup to remove them
        continue;
      }
      
      const micButtons = document.querySelectorAll('.btn-mic');
      const btn = micButtons[currentMicIndex - 1];
      if (!btn) continue;
      
      // Ensure DOM exists
      let visualizer = btn.querySelector('.mic-visualizer');
      if (!visualizer) {
        visualizer = document.createElement('div');
        visualizer.className = 'mic-visualizer';
        for (let i = 0; i < 7; i++) {
          const bar = document.createElement('div');
          bar.className = 'visualizer-bar';
          visualizer.appendChild(bar);
        }
        btn.appendChild(visualizer);
      }
      
      viz.analyser.getByteTimeDomainData(viz.dataArray);
      
      let rms = 0;
      for (let i = 0; i < viz.dataArray.length; i++) {
        const val = (viz.dataArray[i] - 128) / 128;
        rms += val * val;
      }
      rms = Math.sqrt(rms / viz.dataArray.length);
      
      const isSpeaking = rms > 0.015; // Threshold for speech
      
      if (isSpeaking) {
        const level = Math.min(1, rms * 5); // Scale RMS for UI
        btn.style.setProperty('--mic-level', level.toFixed(2));
        btn.classList.add('speaking');
        
        // Update bars
        viz.analyser.getByteFrequencyData(viz.dataArray);
        const bars = visualizer.querySelectorAll('.visualizer-bar');
        const step = Math.floor(viz.dataArray.length / bars.length);
        
        bars.forEach((bar, i) => {
          const val = viz.dataArray[i * step];
          const height = Math.max(2, (val / 255) * 20); // Max height 20px
          bar.style.height = `${height}px`;
        });
        
        const icon = btn.querySelector('i');
        if (icon) icon.style.color = '#28a745';
      } else {
        btn.style.setProperty('--mic-level', '0');
        btn.classList.remove('speaking');
        
        const bars = visualizer.querySelectorAll('.visualizer-bar');
        bars.forEach(bar => bar.style.height = '2px');
        
        const icon = btn.querySelector('i');
        if (icon) icon.style.color = '';
      }
    }
    
    this.visualizerAnimationFrame = requestAnimationFrame(() => this.renderVisualizerFrame());
  }

  stopBroadcasting() {
    console.log('Stopping broadcasting and cleaning up local voice state...');
    
    // Stop our own visualizer
    if (this.state.currentVoiceSessionId) {
       this.stopVisualizer(this.state.currentVoiceSessionId);
    }
    
    // Stop pendingLocalStream if any
    if (this.pendingLocalStream) {
      this.pendingLocalStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
        console.log('[VoiceRTC] stopped pendingLocalStream track:', track.kind);
      });
      this.pendingLocalStream = null;
    }

    // 1. Stop local stream tracks
    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
        console.log('Stopped track:', track.kind);
      });
      this.state.localStream = null;
    }

    // Clear queues
    this.pendingBroadcasterSignals.clear();

    // 2. Close all peer connections where we were the broadcaster
    for (const key in this.state.peerConnections) {
      const pc = this.state.peerConnections[key];
      // If this PC has an outgoing audio track, it's a broadcast connection
      const isBroadcaster = pc.getSenders().some(sender => sender.track && sender.track.kind === 'audio');
      
      if (isBroadcaster) {
        console.log('Closing broadcast connection:', key);
        try { pc.close(); } catch (e) {}
        delete this.state.peerConnections[key];
        this.pendingIceCandidates.delete(pc);
      }
    }

    // 3. Reset local state
    this.state.currentMicIndex = null;
    this.state.currentRoomId = null;
    this.state.currentVoiceSessionId = null;
    this.state.isMuted = false;
    
    // 4. Reset UI styles for ALL mic buttons to be safe
    const micButtons = document.querySelectorAll('.btn-mic');
    micButtons.forEach(btn => {
      btn.style.removeProperty('box-shadow');
      btn.style.removeProperty('border');
      btn.style.removeProperty('border-color');
      btn.style.removeProperty('--mic-level');
      btn.blur();
      // Remove any visualizer classes if they exist
      btn.classList.remove('speaking'); 
      
      const visualizer = btn.querySelector('.mic-visualizer');
      if (visualizer) visualizer.remove();
      
      const icon = btn.querySelector('i');
      if (icon) {
        icon.style.textShadow = 'none';
        icon.style.color = '';
      }
    });
    
    this.updateUI();
  }

  cleanup() {
    console.log('Cleaning up VoiceManager (local-only)...');
    
    // Stop silent audio session
    try {
      this.stopSilentAudioSession();
    } catch (e) {
      console.warn('[VoiceManager] Error stopping silent audio session in cleanup:', e);
    }

    // Stop local broadcasting (stops local stream tracks & resets mic button UI)
    try {
      this.stopBroadcasting();
    } catch (e) {
      console.warn('[VoiceManager] Error in stopBroadcasting during cleanup:', e);
    }

    // Stop all visualizers & Web Audio context
    try {
      this.stopAllVisualizers();
    } catch (e) {
      console.warn('[VoiceManager] Error in stopAllVisualizers during cleanup:', e);
    }

    if (this.visualizerAudioContext) {
      try {
        if (this.visualizerAudioContext.state !== 'closed') {
          this.visualizerAudioContext.close().catch(() => {});
        }
      } catch (e) {}
      this.visualizerAudioContext = null;
    }

    // Close all peer connections and stop sender/receiver tracks
    if (this.state && this.state.peerConnections) {
      for (const key in this.state.peerConnections) {
        const pc = this.state.peerConnections[key];
        if (pc) {
          try {
            if (typeof pc.getSenders === 'function') {
              pc.getSenders().forEach(sender => {
                if (sender && sender.track) {
                  try { sender.track.stop(); } catch (e) {}
                }
              });
            }
            if (typeof pc.getReceivers === 'function') {
              pc.getReceivers().forEach(receiver => {
                if (receiver && receiver.track) {
                  try { receiver.track.stop(); } catch (e) {}
                }
              });
            }
            pc.close();
          } catch (e) {}
        }
        delete this.state.peerConnections[key];
      }
    }

    if (this.pendingIceCandidates) {
      try { this.pendingIceCandidates.clear(); } catch (e) {}
    }
    if (this.pendingBroadcasterSignals) {
      try { this.pendingBroadcasterSignals.clear(); } catch (e) {}
    }
    if (this.signalingQueues) {
      try { this.signalingQueues.clear(); } catch (e) {}
    }

    // Remove all remote audio elements & stop their media streams
    if (this.state && this.state.audioElements) {
      for (const socketId in this.state.audioElements) {
        const audioEl = this.state.audioElements[socketId];
        if (audioEl) {
          try {
            audioEl.pause();
            if (audioEl.srcObject && typeof audioEl.srcObject.getTracks === 'function') {
              audioEl.srcObject.getTracks().forEach(track => {
                try { track.stop(); } catch (e) {}
              });
            }
            audioEl.srcObject = null;
            audioEl.src = '';
            audioEl.removeAttribute('src');
            try { audioEl.load(); } catch (e) {}
            audioEl.remove();
          } catch (e) {}
        }
        delete this.state.audioElements[socketId];
      }
    }

    if (this.pendingRemoteAudio) {
      try { this.pendingRemoteAudio.clear(); } catch (e) {}
    }

    // Reset state & update UI
    if (this.state) {
      this.state.micsState = {};
    }
    try {
      this.updateUI();
    } catch (e) {}
  }

  applyRemoteGain(socketId) {
    const isMuted = this.state.localMutedUsers.has(socketId) || this.state.isIncomingMuted;
    const userVolume = this.state.localVolumes[socketId] ?? 1;
    const masterVolume = this.state.masterIncomingVolume ?? 1;
    
    const effectiveVolume = Math.max(0, Math.min(1, userVolume * masterVolume));
    
    const audioEl = this.state.audioElements[socketId];
    if (audioEl) {
      audioEl.muted = isMuted || effectiveVolume === 0;
      try {
        audioEl.volume = audioEl.muted ? 0 : effectiveVolume;
      } catch (err) {
        console.debug('[VoiceAudio] Browser does not support programmatic volume', err);
      }
    }
  }

  setIncomingVolume(volume) {
    const vol = Math.max(0, Math.min(1, parseFloat(volume) || 0));
    this.state.masterIncomingVolume = vol;
    for (const socketId in this.state.audioElements) {
       this.applyRemoteGain(socketId);
    }
    this.resumeVisualizerAudioContext();
  }

  setIncomingMuted(isMuted) {
    this.state.isIncomingMuted = isMuted;
    for (const socketId in this.state.audioElements) {
      this.applyRemoteGain(socketId);
      
      const audioEl = this.state.audioElements[socketId];
      if (audioEl && !isMuted && !this.state.localMutedUsers.has(socketId)) {
          this.playRemoteAudio(audioEl, socketId);
      }
    }
    if (!isMuted) {
        this.retryPendingRemoteAudio();
    }
  }

  toggleMuteSelf() {
    if (!this.state.currentMicIndex) return;
    const newMuteState = !this.state.isMuted;
    this.state.isMuted = newMuteState;
    
    if (this.state.localStream) {
      this.state.localStream.getAudioTracks().forEach(track => {
        track.enabled = !newMuteState;
      });
    }
    
    this.socket.emit('voice:toggle-mute-self', {
      roomId: this.state.currentRoomId,
      micIndex: this.state.currentMicIndex,
      isMuted: newMuteState
    });
    
    this.updateUI();
  }

  toggleLocalMute(socketId) {
    if (this.state.localMutedUsers.has(socketId)) {
      this.state.localMutedUsers.delete(socketId);
    } else {
      this.state.localMutedUsers.add(socketId);
    }
    
    this.applyRemoteGain(socketId);
    
    const audioEl = this.state.audioElements[socketId];
    if (audioEl && !this.state.localMutedUsers.has(socketId) && !this.state.isIncomingMuted) {
        this.playRemoteAudio(audioEl, socketId);
    }
    
    if (!this.state.localMutedUsers.has(socketId)) {
        this.retryPendingRemoteAudio();
    }
    
    this.updateUI();
  }

  setLocalVolume(socketId, volume) {
    const vol = Math.max(0, Math.min(1, parseFloat(volume) || 0));
    this.state.localVolumes[socketId] = vol;
    this.applyRemoteGain(socketId);
  }

  kickFromMic(micIndex) {
    this.socket.emit('voice:kick-from-mic', {
      roomId: window.state.currentRoomId,
      micIndex
    });
  }

  pullFromMic(micIndex) {
    this.socket.emit('voice:pull-from-mic', {
      roomId: window.state.currentRoomId,
      micIndex
    }, (res) => {
      if (!res.ok) {
        window.showToast(res.reason || 'فشل سحب المايك', 'error');
      }
    });
  }

  showMicMenu(event, micIndex) {
    event.preventDefault();
    event.stopPropagation();
    
    const user = this.state.micsState[micIndex];
    if (!user) return;

    // Remove existing menu
    const existingMenu = document.querySelector('.mic-context-menu');
    if (existingMenu) existingMenu.remove();

    const isSelf = user.socketId === this.socket.id;
    const menu = document.createElement('div');
    menu.className = 'mic-context-menu';
    
    // Position menu centered horizontally but starting below the mic
    const btn = event.currentTarget;
    const rect = btn.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const bottomY = rect.bottom + 5;
    
    menu.style.top = `${bottomY}px`;
    menu.style.left = `${centerX}px`;
    menu.style.transform = 'translateX(-50%)'; // Only center horizontally

    let html = '';
    if (isSelf) {
      html = `
        <div class="menu-item" id="menu-leave-mic">
          <i class="fas fa-sign-out-alt"></i> <span>ترك المايك</span>
        </div>
        <div class="menu-item" id="menu-toggle-mute">
          <i class="fas ${this.state.isMuted ? 'fa-microphone' : 'fa-microphone-slash'}"></i> 
          <span>${this.state.isMuted ? 'تفعيل المايك' : 'كتم المايك'}</span>
        </div>
        <div class="menu-item" id="menu-profile">
          <i class="fas fa-user"></i> <span>البروفايل</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-volume">
          <i class="fas fa-volume-up"></i>
          <input type="range" min="0" max="1" step="0.01" value="${this.state.masterIncomingVolume !== undefined ? this.state.masterIncomingVolume : 1}" id="menu-master-volume">
        </div>
      `;
    } else {
      const isLocalMuted = this.state.localMutedUsers.has(user.socketId);
      const localVol = this.state.localVolumes[user.socketId] !== undefined ? this.state.localVolumes[user.socketId] : 1;
      
      // Check admin permissions
      const currentUser = window.state.currentUser;
      const room = window.roomsData ? window.roomsData[window.state.currentRoomId] : null;
      const isRoomOwner = room && currentUser && room.ownerId === currentUser.userId;
      const isGlobalAdmin = window.state.hasPermission(currentUser, 'canManageRooms');
      const canManageMics = isRoomOwner || isGlobalAdmin || (currentUser && currentUser.permissions && (currentUser.permissions.includes('canTakeMic') || currentUser.permissions.includes('canRemoveMic')));
      
      const hasPullPermission = isGlobalAdmin || window.state.hasPermission(currentUser, 'canPullFromMic');
      const isTargetLowerRank = currentUser && user && currentUser.group && (currentUser.group.roleRank > user.roleRank);
      const isPullDisabled = !isTargetLowerRank;

html = `
  ${hasPullPermission ? `
  <div class="menu-item danger ${isPullDisabled ? 'disabled' : ''}" id="menu-pull-mic" title="${isPullDisabled ? 'لا يمكنك سحب عضو بنفس رتبتك أو أعلى منك' : ''}">
    <i class="fas fa-hand-rock"></i>
    <span>سحب المايك</span>
  </div>
  ` : ''}

  <div class="menu-item" id="menu-local-mute">
    <i class="fas ${isLocalMuted ? 'fa-volume-up' : 'fa-volume-mute'}"></i> 
    <span>${isLocalMuted ? 'إلغاء كتم العضو' : 'كتم العضو محلياً'}</span>
  </div>

  <div class="menu-item" id="menu-profile">
    <i class="fas fa-user"></i>
    <span>البروفايل</span>
  </div>

  <div class="menu-divider"></div>

  <div class="menu-volume">
    <i class="fas fa-volume-down"></i>
    <input type="range" min="0" max="1" step="0.01" value="${localVol}" id="menu-local-volume">
  </div>
`;
    }

    menu.innerHTML = html;
    document.body.appendChild(menu);

    // Add listeners
    if (isSelf) {
      menu.querySelector('#menu-leave-mic').onclick = () => {
        this.leaveMic(window.state.currentRoomId, micIndex);
        menu.remove();
      };
      menu.querySelector('#menu-toggle-mute').onclick = () => {
        this.toggleMuteSelf();
        menu.remove();
      };
      menu.querySelector('#menu-master-volume').oninput = (e) => {
        const val = parseFloat(e.target.value);
        this.setIncomingVolume(val);
      };
    } else {
      if (menu.querySelector('#menu-kick-mic')) {
        menu.querySelector('#menu-kick-mic').onclick = () => {
          this.kickFromMic(micIndex);
          menu.remove();
        };
      }
      if (menu.querySelector('#menu-pull-mic')) {
        menu.querySelector('#menu-pull-mic').onclick = () => {
          if (menu.querySelector('#menu-pull-mic').classList.contains('disabled')) {
            // Check why it's disabled and show toast
            const currentUser = window.state.currentUser;
            if (currentUser && user && currentUser.group) {
              if (user.roleRank > currentUser.group.roleRank) {
                window.showToast('لا يمكنك سحب عضو أعلى منك رتبة', 'error');
              } else if (user.roleRank === currentUser.group.roleRank) {
                window.showToast('لا يمكنك سحب عضو بنفس رتبتك', 'error');
              }
            }
            return;
          }
          this.pullFromMic(micIndex);
          menu.remove();
        };
      }
      menu.querySelector('#menu-local-mute').onclick = () => {
        this.toggleLocalMute(user.socketId);
        menu.remove();
      };
      menu.querySelector('#menu-local-volume').oninput = (e) => {
        this.setLocalVolume(user.socketId, parseFloat(e.target.value));
      };
    }

    menu.querySelector('#menu-profile').onclick = () => {
      if (window.showUserProfile) window.showUserProfile(user.username);
      menu.remove();
    };

    // Close on click outside
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
      }
    };
    document.addEventListener('mousedown', closeMenu);
  }

  getMicIndexBySocketId(socketId) {
    for (const [idx, user] of Object.entries(this.state.micsState)) {
      if (user && user.socketId === socketId) return parseInt(idx);
    }
    return 0;
  }

  isOurVoiceSession(voiceSessionId) {
    for (const user of Object.values(this.state.micsState)) {
      if (user && user.voiceSessionId === voiceSessionId && user.socketId === this.socket.id) {
        return true;
      }
    }
    return false;
  }

  getConnectionKey(voiceSessionId, otherSocketId, isBroadcaster) {
    const listenerSocketId = isBroadcaster ? otherSocketId : this.socket.id;
    return `${voiceSessionId}_${listenerSocketId}`;
  }

  async enqueueSignal(key, fn) {
    if (!this.signalingQueues) {
      this.signalingQueues = new Map();
    }
    if (!this.signalingQueues.has(key)) {
      this.signalingQueues.set(key, Promise.resolve());
    }
    const currentPromise = this.signalingQueues.get(key);
    const nextPromise = currentPromise.then(async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[VoiceRTC] Error processing queued signal for key ${key}:`, err);
      }
    });
    this.signalingQueues.set(key, nextPromise);
    return nextPromise;
  }

  queueBroadcasterSignal(voiceSessionId, senderSocketId, signalData) {
    const key = `${voiceSessionId}:::${senderSocketId}`;
    if (!this.pendingBroadcasterSignals.has(key)) {
      this.pendingBroadcasterSignals.set(key, {
        voiceSessionId,
        senderSocketId,
        signals: [],
        processing: false
      });
    }
    const record = this.pendingBroadcasterSignals.get(key);
    record.signals.push(signalData);
    console.warn(`[VoiceRTC] Queued broadcaster signal for session ${voiceSessionId}, sender ${senderSocketId}. Type: ${signalData.type || 'candidate'}`);
  }

  async flushPendingBroadcasterSignals() {
    console.warn('[VoiceRTC] Flushing pending broadcaster signals. Total queued keys:', this.pendingBroadcasterSignals.size);
    const activeVoiceSessionId = this.state.currentVoiceSessionId;
    if (!activeVoiceSessionId) {
      console.warn('[VoiceRTC] No active voiceSessionId to flush.');
      return;
    }

    for (const [key, record] of this.pendingBroadcasterSignals.entries()) {
      if (record.voiceSessionId !== activeVoiceSessionId) {
        continue;
      }
      
      if (record.processing) {
        continue;
      }
      
      record.processing = true;
      const { senderSocketId, signals } = record;
      const isBroadcaster = true;
      const connKey = this.getConnectionKey(activeVoiceSessionId, senderSocketId, isBroadcaster);
      
      console.warn(`[VoiceRTC] Queueing flush of ${signals.length} signals for session: ${activeVoiceSessionId}, sender: ${senderSocketId}`);
      
      await this.enqueueSignal(connKey, async () => {
        try {
          let pc = this.state.peerConnections[connKey];
          if (pc && pc.connectionState === 'closed') {
            pc = null;
          }
          if (!pc) {
            pc = this.createPeerConnection(senderSocketId, isBroadcaster, activeVoiceSessionId);
          }
          
          for (const signalData of signals) {
            await this.handleSignal(pc, senderSocketId, signalData, activeVoiceSessionId);
          }
          
          this.pendingBroadcasterSignals.delete(key);
          console.warn(`[VoiceRTC] Successfully flushed and cleared signals for key: ${key}`);
        } catch (err) {
          record.processing = false;
          console.error('[VoiceRTC] Error processing flush for key:', key, err);
        }
      });
    }
  }

  createPeerConnection(targetSocketId, isBroadcaster, voiceSessionId) {
    const key = this.getConnectionKey(voiceSessionId, targetSocketId, isBroadcaster);
    
    if (this.state.peerConnections[key] && this.state.peerConnections[key].connectionState !== 'closed') {
      console.warn('[VoiceRTC] PeerConnection already exists for key inside createPeerConnection:', key);
      return this.state.peerConnections[key];
    }

    const pc = new RTCPeerConnection({ iceServers: IceServerURL });
    this.state.peerConnections[key] = pc;

    pc.onconnectionstatechange = () => {
      console.warn(`[VoiceRTC] PC connectionState changed for key ${key}:`, pc.connectionState);
    };
    pc.oniceconnectionstatechange = () => {
      console.warn(`[VoiceRTC] PC iceConnectionState changed for key ${key}:`, pc.iceConnectionState);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('voice:signal', {
          targetSocketId,
          signalData: event.candidate,
          roomId: window.state.currentRoomId,
          voiceSessionId
        });
      }
    };

    if (isBroadcaster) {
      const outgoingStream = this.state.localStream || this.pendingLocalStream;
      const belongsToUs = this.isOurVoiceSession(voiceSessionId) || (this.state.currentVoiceSessionId === voiceSessionId);
      if (outgoingStream && belongsToUs) {
        outgoingStream.getTracks().forEach(track => {
          const alreadyAdded = pc.getSenders().some(sender => sender.track === track);
          if (!alreadyAdded) {
            pc.addTrack(track, outgoingStream);
            console.warn('[VoiceRTC] outgoing track attached for key:', key);
          }
        });
      } else {
        console.warn('[VoiceRTC] broadcaster requested but no local/pending stream or session doesn\'t belong to us:', key);
      }
    } else {
      console.warn('[VoiceRTC] Receiver transceiver added');
      pc.addTransceiver('audio', { direction: 'recvonly' });      pc.ontrack = async (event) => {
        console.warn('[VoiceRTC] remote track received for key:', key);
        
        const remoteStream = event.streams?.[0] || new MediaStream([event.track]);

        let audioEl = this.state.audioElements[targetSocketId];
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          audioEl.setAttribute('playsinline', '');
          audioEl.setAttribute('webkit-playsinline', '');
          
          audioEl.addEventListener('loadedmetadata', () => {
            this.playRemoteAudio(audioEl, targetSocketId);
          });
          audioEl.addEventListener('canplay', () => {
             this.playRemoteAudio(audioEl, targetSocketId);
          });
          
          this.state.audioElements[targetSocketId] = audioEl;
          document.body.appendChild(audioEl);
        }
        
        if (audioEl.srcObject !== remoteStream) {
          audioEl.srcObject = remoteStream;
        }
        
        this.applyRemoteGain(targetSocketId);
        this.setupVisualizer(remoteStream, targetSocketId, voiceSessionId);
        await this.playRemoteAudio(audioEl, targetSocketId);
        
        event.track.onunmute = async () => {
             await this.playRemoteAudio(audioEl, targetSocketId);
        };

        // Try to resume AudioContext in the background
        void this.ensureVoiceAudioContextRunning();
      };
    }
    return pc;
  }

  async connectToPeer(targetSocketId, micIndex, voiceSessionId) {
    const key = this.getConnectionKey(voiceSessionId, targetSocketId, false);
    let pc = this.state.peerConnections[key];
    if (pc && pc.connectionState !== 'closed') {
      console.warn('[VoiceRTC] PeerConnection already exists and is active for key:', key);
      return;
    }

    try {
      pc = this.createPeerConnection(targetSocketId, false, voiceSessionId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      this.socket.emit('voice:signal', {
        targetSocketId,
        signalData: pc.localDescription || offer,
        roomId: window.state.currentRoomId,
        voiceSessionId
      });
      console.warn(`[VoiceRTC] connectToPeer: sent offer to ${targetSocketId} for session ${voiceSessionId}`);
    } catch (err) {
      console.error('[VoiceRTC] connectToPeer failed:', err);
      if (pc) {
        try { pc.close(); } catch (e) {}
        delete this.state.peerConnections[key];
        this.pendingIceCandidates.delete(pc);
      }
    }
  }

  disconnectFromPeer(targetSocketId, voiceSessionId) {
    const key = this.getConnectionKey(voiceSessionId, targetSocketId, false);
    const pc = this.state.peerConnections[key];
    if (pc) {
      try { pc.close(); } catch (e) {}
      delete this.state.peerConnections[key];
      this.pendingIceCandidates.delete(pc);
    }
    if (this.state.audioElements[targetSocketId]) {
      const audioEl = this.state.audioElements[targetSocketId];
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
      delete this.state.audioElements[targetSocketId];
    }
    
    this.pendingRemoteAudio.delete(targetSocketId);
    this.stopVisualizer(voiceSessionId);
  }

  updateUser(updatedUser) {
    if (!updatedUser) return;

    const updatedUserId = Number(updatedUser.userId ?? updatedUser.id);

    if (!Number.isFinite(updatedUserId)) {
      console.warn('[VoiceManager.updateUser] ignored update without valid id:', updatedUser);
      return;
    }

    let updated = false;

    for (const micIndex in this.state.micsState) {
      const micUser = this.state.micsState[micIndex];
      if (!micUser) continue;

      const micUserId = Number(micUser.userId ?? micUser.id);

      if (!Number.isFinite(micUserId)) {
        continue;
      }

      if (micUserId === updatedUserId) {
        this.state.micsState[micIndex] = {
          ...micUser,
          ...updatedUser,
          id: updatedUserId,
          userId: updatedUserId
        };

        updated = true;
      }
    }

    if (updated) {
      this.updateUI();
    }
  }

  updateUI() {
    const micContainer = document.querySelector('.mic-container');
    if (!micContainer) return;

    const micButtons = micContainer.querySelectorAll('.btn-mic');
    micButtons.forEach((btn, index) => {
      const micIndex = index + 1;
      const user = this.state.micsState[micIndex];
      const content = btn.querySelector('.mic-content');
      if (!content) return;

      if (user) {
        btn.classList.add('active');
        const avatarUrl = window.getAvatarUrl(user);
        const currentImg = content.querySelector('img');
        
        if (!currentImg || currentImg.getAttribute('src') !== avatarUrl) {
          content.innerHTML = '';
          const imgOptions = { 
            src: avatarUrl, 
            class: 'mic-user-avatar',
            referrerPolicy: 'no-referrer',
            'data-username': user.username,
            'data-is-hidden': user.isHidden ? 'true' : 'false',
            'data-role-rank': user.roleRank || 0
          };
          const resolvedUserId = user.userId || user.id;
          if (resolvedUserId) {
            imgOptions['data-user-id'] = resolvedUserId;
          }
          content.appendChild(window.secureCreateElement('img', imgOptions));
        }

        let nameLabel = btn.querySelector('.mic-user-label');
        if (!nameLabel) {
          nameLabel = window.secureCreateElement('div', { class: 'mic-user-label' });
          btn.appendChild(nameLabel);
        }

        // 1. Priority: Super Icon
        if (user.superIcon) {
          nameLabel.innerHTML = `<img src="${user.superIcon}" style="max-height: 100%; max-width: 100%; object-fit: contain; vertical-align: middle; display: inline-block;">`;
        } 
        // 2. Secondary: Topic (Decorated Name)
        else if (user.topic && user.topic !== user.username) {
          nameLabel.textContent = user.topic;
        }
        // 3. Last: Original Username
        else {
          nameLabel.textContent = user.username;
        }

        nameLabel.setAttribute('data-username', user.username);
        const resolvedUserIdForLabel = user.userId ?? user.id;
        if (resolvedUserIdForLabel) {
            nameLabel.setAttribute('data-user-id', resolvedUserIdForLabel);
        }
        
        btn.title = user.topic || user.username;

        // Show mute icons
        const isMutedSelf = user.isMutedSelf;
        const isLocalMuted = this.state.localMutedUsers.has(user.socketId);
        
        let muteIcon = btn.querySelector('.mic-mute-status');
        if (isMutedSelf || isLocalMuted) {
          if (!muteIcon) {
            muteIcon = document.createElement('div');
            muteIcon.className = 'mic-mute-status';
            btn.appendChild(muteIcon);
          }
          muteIcon.innerHTML = `<i class="fas ${isLocalMuted ? 'fa-volume-mute' : 'fa-microphone-slash'}"></i>`;
        } else if (muteIcon) {
          muteIcon.remove();
        }

        // Change click behavior if occupied
        btn.onclick = (e) => {
          if (e && e.currentTarget) e.currentTarget.blur();
          this.showMicMenu(e, micIndex);
        };
      } else {
        btn.classList.remove('active');
        btn.classList.remove('speaking');
        const visualizer = btn.querySelector('.mic-visualizer');
        if (visualizer) visualizer.remove();
        
        const muteIcon = btn.querySelector('.mic-mute-status');
        if (muteIcon) muteIcon.remove();
        
        const nameLabel = btn.querySelector('.mic-user-label');
        if (nameLabel) nameLabel.remove();
        
        btn.title = btn.classList.contains('locked') ? 'المايك مقفل' : `مايك ${micIndex}`;

        if (!content.querySelector('i.fa-microphone') && !btn.classList.contains('locked')) {
          content.innerHTML = `<i class="fas fa-microphone"></i>`;
        }

        // Restore default click behavior if empty
        btn.onclick = (e) => {
          if (e && e.currentTarget) e.currentTarget.blur();
          this.toggleMic(window.state.currentRoomId, micIndex);
        };
      }
    });
  }
}
