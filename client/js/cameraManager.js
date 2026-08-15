/**
 * CameraManager.js
 * Independent system for camera viewing requests and P2P streaming via WebRTC.
 * Enhanced with ICE Candidate buffering, viewer-ready flow, and shared iceServers.
 */

const CameraIceServers = [
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
window.CameraIceServers = CameraIceServers;

class CameraManager {
  constructor(socket, state) {
    this.socket = socket || window.socket;
    this.state = state || window.state;
    this.localStream = null;
    this.peerConnections = {}; // Map of userId -> peerConnection
    this.pendingCandidates = {}; // Map of userId -> [candidate]
    this.remoteStreams = {}; // Map of userId -> stream (buffer if element not ready)
    
    this.config = {
      iceServers: CameraIceServers
    };
    
    if (this.socket) {
      this.setupSocketHandlers();
    } else {
      console.warn('[Camera] Socket not ready in constructor, manual init needed if not using dev server reload');
    }
  }

  setupSocketHandlers() {
    if (!this.socket) return;
    console.log('[Camera] Setting up socket handlers');

    // Incoming request from someone wanting to see my camera
    this.socket.on('camera:request', (data) => {
      console.log('[Camera] Received request from', data.requester?.username);
      this.handleIncomingRequest(data);
    });

    // Request was accepted by the user I wanted to see
    this.socket.on('camera:accepted', (data) => {
      console.log('[Camera] Request accepted by', data.ownerUsername);
      this.handleRequestAccepted(data);
    });

    // Owner should start broadcasting because viewer is ready
    this.socket.on('camera:start-broadcast', (data) => {
      console.log('[Camera] Viewer ready, starting broadcast to', data.viewerId);
      this.startBroadcasting(data.viewerId);
    });

    // Request was rejected
    this.socket.on('camera:rejected', (data) => {
      Swal.fire({
        title: 'تم الرفض',
        text: `لقد رفض ${data.username} طلب مشاهدة الكاميرا`,
        icon: 'info',
        timer: 3000,
        showConfirmButton: false
      });
    });

    // Server-side rejection (target offline / not in same room / not approved)
    this.socket.on('camera:error', (data) => {
      Swal.fire({
        title: 'خطأ',
        text: (data && data.message) || 'تعذر إتمام طلب الكاميرا',
        icon: 'error',
        timer: 3000,
        showConfirmButton: false
      });
    });

    // Signaling: Offer received
    this.socket.on('camera:offer', async (data) => {
      await this.handleOffer(data);
    });

    // Signaling: Answer received
    this.socket.on('camera:answer', async (data) => {
      await this.handleAnswer(data);
    });

    // Signaling: ICE candidiate received
    this.socket.on('camera:candidate', async (data) => {
      await this.handleCandidate(data);
    });

    // Signaling: Session ended
    this.socket.on('camera:ended', (data) => {
      this.cleanupSession(data.userId);
    });

    // Camera paused/resumed by owner
    this.socket.on('camera:paused', (data) => {
      const { userId, paused } = data;
      const overlay = document.getElementById(`camera-muted-overlay-${userId}`);
      if (overlay) {
        overlay.style.display = paused ? 'flex' : 'none';
      }
    });
  }

  /**
   * Send a request to watch someone's camera
   */
  requestView(targetUser) {
    if (!this.state.currentUser) {
       window.showToast('يجب تسجيل الدخول أولاً', 'warning');
       return;
    }
    
    const targetUserId = targetUser.userId || targetUser.id;
    if (targetUserId === (this.state.currentUser.userId || this.state.currentUser.id)) return;

    Swal.fire({
      title: 'طلب مشاهدة',
      text: `هل تريد إرسال طلب لمشاهدة الكاميرا الخاصة بـ ${targetUser.topic || targetUser.username}؟`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'إرسال الطلب',
      cancelButtonText: 'إلغاء'
    }).then((result) => {
      if (result.isConfirmed) {
        this.socket.emit('camera:request', { targetId: targetUserId });
        window.showToast('تم إرسال الطلب، بانتظار الموافقة...', 'info');
      }
    });
  }

  /**
   * Handle incoming request popup
   */
  async handleIncomingRequest(data) {
    const { requester } = data;
    const requesterId = requester.userId || requester.id;
    
    const result = await Swal.fire({
      title: 'طلب مشاهدة كاميرا',
      html: `
        <div class="d-flex flex-column align-items-center gap-2">
          <img src="${requester.pic || '/default-avatar.png'}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
          <div class="fw-bold">${requester.topic || requester.username} يريد مشاهدة الكاميرا الخاصة بك</div>
          <div class="text-muted small">المشاهدة ستكون فيديو فقط وبدون صوت</div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'قبول',
      cancelButtonText: 'رفض',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#dc3545',
      allowOutsideClick: false
    });

    if (result.isConfirmed) {
      this.socket.emit('camera:accept', { targetId: requesterId });
    } else {
      this.socket.emit('camera:reject', { targetId: requesterId });
    }
  }

  /**
   * Logic for the person sharing their camera (The Broadcaster)
   */
  async startBroadcasting(viewerId) {
    if (this.peerConnections[viewerId] && this.peerConnections[viewerId].connectionState === 'connected') {
      console.log('[Camera] Already broadcasting to', viewerId);
      return;
    }

    try {
      if (!this.localStream) {
        const facingMode = this.currentFacingMode || 'user';
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 }
          },
          audio: false
        });
        console.log('[Camera] Local stream started with facingMode:', facingMode);
        this.createLocalPreview();
        this.socket.emit('camera:status', { isBroadcasting: true });
      }

      const pc = this.getOrCreatePeerConnection(viewerId, true);
      const existingSenders = pc.getSenders();
      
      this.localStream.getTracks().forEach(track => {
        const alreadyAdded = existingSenders.some(sender => sender.track && sender.track.id === track.id);
        if (!alreadyAdded) {
          pc.addTrack(track, this.localStream);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.socket.emit('camera:offer', {
        targetId: viewerId,
        offer: offer
      });

    } catch (err) {
      console.error('[Camera] Error broadcasting:', err);
      window.showToast('فشل تشغيل الكاميرا. يرجى التأكد من الصلاحيات.', 'error');
      this.socket.emit('camera:end', { targetId: viewerId });
      this.cleanupSession(viewerId);
    }
  }

  async switchCamera() {
    console.log('[Camera] Switching camera...');
    try {
      this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
      
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }
      
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.currentFacingMode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      
      const videoEl = document.getElementById('video-local-preview');
      if (videoEl) videoEl.srcObject = this.localStream;
      
      const videoTrack = this.localStream.getVideoTracks()[0];
      for (const userId in this.peerConnections) {
        const pc = this.peerConnections[userId];
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(videoTrack);
        }
      }
      
      // No toast notification as requested
    } catch (err) {
      console.error('[Camera] Error switching camera:', err);
      window.showToast('فشل تحويل الكاميرا', 'error');
    }
  }

  toggleCameraMute(btn) {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const isEnabled = videoTrack.enabled;
    videoTrack.enabled = !isEnabled;

    const icon = btn.querySelector('i');
    const overlay = document.getElementById('local-camera-muted-overlay');

    if (videoTrack.enabled) {
      icon.className = 'fas fa-eye';
      btn.style.background = 'rgba(255,255,255,0.1)';
      if (overlay) overlay.style.display = 'none';
      this.socket.emit('camera:pause', { paused: false });
    } else {
      icon.className = 'fas fa-eye-slash';
      btn.style.background = '#dc3545';
      if (overlay) overlay.style.display = 'flex';
      this.socket.emit('camera:pause', { paused: true });
    }
  }

  /**
   * Logic for the person watching (The Viewer)
   */
  async handleRequestAccepted(data) {
    const { ownerId, ownerUsername } = data;
    console.log('[Camera] Preparing viewer window for', ownerUsername);
    
    // Check if we are already viewing or setting up
    if (document.getElementById(`camera-view-${ownerId}`)) {
      console.log('[Camera] Already viewing or window exists for', ownerId);
      return;
    }

    // 1. Create UI
    this.createVideoWindow(ownerId, ownerUsername);
    
    // 2. Peer is ready to handle signals
    this.getOrCreatePeerConnection(ownerId, false);

    // 3. Inform owner that viewer is ready
    this.socket.emit('camera:viewer-ready', { targetId: ownerId });
  }

  createLocalPreview() {
    if (document.getElementById('camera-local-preview')) return;
    console.log('[Camera] Creating local preview window');

    const container = document.createElement('div');
    container.id = 'camera-local-preview';
    container.className = 'camera-viewer-window local-preview';
    container.style.cssText = `
      transition: width 0.2s;
      position: fixed !important;
      top: 60px !important;
      left: 10px !important;
      z-index: 2000 !important;
      display: flex !important;
      flex-direction: column !important;
      background: #000 !important;
      border: 2px solid rgb(51, 51, 51) !important;
      box-shadow: rgba(0, 0, 0, 0.6) 0px 0px 30px !important;
      width: 320px !important;
      height: auto !important;
      min-height: auto !important;
      max-height: 90vh !important;
      overflow: hidden !important;
      border-radius: 8px !important;
    `;

    container.innerHTML = `
      <div class="camera-window-header" style="background: #333 !important; color: white !important; padding: 8px 12px !important; cursor: move !important; display: flex !important; justify-content: space-between !important; align-items: center !important; font-weight: bold !important; font-size: 14px !important; border-bottom: 1px solid #444 !important; flex-shrink: 0 !important; height: 40px !important;">
        <div class="d-flex align-items-center" style="pointer-events: none;">
            <i class="fas fa-video me-2"></i>
            <span>معاينة (أنت)</span>
        </div>
        <div class="d-flex gap-2">
            <button class="camera-mute-btn" title="كتم/تشغيل الكاميرا" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
              <i class="fas fa-eye"></i>
            </button>
            <button class="camera-zoom-out-btn" title="تصغير" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
              <i class="fas fa-search-minus"></i>
            </button>
            <button class="camera-zoom-in-btn" title="تكبير" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
              <i class="fas fa-search-plus"></i>
            </button>
            <button class="camera-switch-btn" title="قلب الكاميرا" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
              <i class="fas fa-sync-alt"></i>
            </button>
            <button class="camera-window-close" style="color: white !important; border: none !important; background: none !important; font-size: 24px !important; padding: 0 5px !important; line-height: 1 !important; cursor: pointer !important;">&times;</button>
        </div>
      </div>
      <div class="camera-window-body" style="position: relative !important; background: black !important; display: block !important; width: 100% !important; aspect-ratio: 4/3 !important; overflow: hidden !important; flex-shrink: 0 !important; flex-grow: 0 !important;">
        <video id="video-local-preview" autoplay playsinline muted style="width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important;"></video>
        <div id="local-camera-muted-overlay" style="position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; display: none !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; color: white !important; z-index: 5 !important;">
           <i class="fas fa-eye-slash fa-3x mb-2"></i><span>الكاميرا متوقفة مؤقتاً</span>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    
    const videoEl = document.getElementById('video-local-preview');
    if (videoEl && this.localStream) {
      videoEl.srcObject = this.localStream;
    }

    const muteBtn = container.querySelector('.camera-mute-btn');
    if (muteBtn) muteBtn.onclick = () => this.toggleCameraMute(muteBtn);

    const switchBtn = container.querySelector('.camera-switch-btn');
    if (switchBtn) switchBtn.onclick = () => this.switchCamera();

    const zoomInBtn = container.querySelector('.camera-zoom-in-btn');
    const zoomOutBtn = container.querySelector('.camera-zoom-out-btn');
    
    if (zoomInBtn) zoomInBtn.onclick = () => this.handleZoom(container, 'in');
    if (zoomOutBtn) zoomOutBtn.onclick = () => this.handleZoom(container, 'out');

    const closeBtn = container.querySelector('.camera-window-close');
    closeBtn.onclick = () => {
      Swal.fire({
        title: 'إيقاف الكاميرا',
        text: 'هل تريد إيقاف بث الكاميرا لجميع المشاهدين؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، أوقف البث',
        cancelButtonText: 'إلغاء'
      }).then(result => {
        if (result.isConfirmed) {
          this.stopAllBroadcasting();
        }
      });
    };

    this.makeDraggable(container);
  }

  stopAllBroadcasting() {
    Object.keys(this.peerConnections).forEach(userId => {
      this.socket.emit('camera:end', { targetId: userId });
      this.cleanupSession(userId);
    });
    
    if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
    }
    const localPrev = document.getElementById('camera-local-preview');
    if (localPrev) {
      localPrev.remove();
      this.socket.emit('camera:status', { isBroadcasting: false });
    }
  }

  createVideoWindow(userId, username) {
    if (document.getElementById(`camera-view-${userId}`)) return;
    console.log('[Camera] Appending viewer window to body for', username);

    const container = document.createElement('div');
    container.id = `camera-view-${userId}`;
    container.className = 'camera-viewer-window';
    container.style.cssText = `
      transition: width 0.2s;
      position: fixed !important;
      top: 60px !important;
      left: 10px !important;
      z-index: 2000 !important;
      display: flex !important;
      flex-direction: column !important;
      background: #000 !important;
      border: 2px solid rgb(51, 51, 51) !important;
      box-shadow: rgba(0, 0, 0, 0.6) 0px 0px 30px !important;
      width: 320px !important;
      height: auto !important;
      min-height: auto !important;
      max-height: 90vh !important;
      overflow: hidden !important;
      border-radius: 8px !important;
    `;
    
    container.innerHTML = `
      <div class="camera-window-header" style="background: #333 !important; color: white !important; padding: 8px 12px !important; cursor: move !important; display: flex !important; justify-content: space-between !important; align-items: center !important; font-weight: bold !important; font-size: 14px !important; border-bottom: 1px solid #444 !important; flex-shrink: 0 !important; height: 40px !important;">
        <div class="d-flex align-items-center" style="pointer-events: none;">
            <i class="fas fa-camera me-2"></i>
            <span>مشاهدة: ${username}</span>
        </div>
        <div class="d-flex gap-2">
            <button class="camera-zoom-out-btn" title="تصغير" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
              <i class="fas fa-search-minus"></i>
            </button>
            <button class="camera-zoom-in-btn" title="تكبير" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
              <i class="fas fa-search-plus"></i>
            </button>
            <button class="camera-window-close" style="color: white !important; border: none !important; background: none !important; font-size: 24px !important; padding: 0 5px !important; line-height: 1 !important; cursor: pointer !important;">&times;</button>
        </div>
      </div>
      <div class="camera-window-body" style="position: relative !important; background: black !important; display: block !important; width: 100% !important; aspect-ratio: 4/3 !important; overflow: hidden !important; flex-shrink: 0 !important; flex-grow: 0 !important;">
        <video id="video-remote-${userId}" autoplay playsinline muted style="width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important;"></video>
        <div class="camera-loading" style="position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; color: white !important; background: rgba(0,0,0,0.6) !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 10px !important;">
           <i class="fas fa-spinner fa-spin"></i>
           <span>جاري الاتصال...</span>
        </div>
        <div id="camera-muted-overlay-${userId}" style="position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; display: none !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; color: white !important; z-index: 5 !important;">
           <i class="fas fa-eye-slash fa-3x mb-2"></i><span>الكاميرا متوقفة مؤقتاً</span>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    const zoomInBtn = container.querySelector('.camera-zoom-in-btn');
    const zoomOutBtn = container.querySelector('.camera-zoom-out-btn');
    
    if (zoomInBtn) zoomInBtn.onclick = () => this.handleZoom(container, 'in');
    if (zoomOutBtn) zoomOutBtn.onclick = () => this.handleZoom(container, 'out');

    const closeBtn = container.querySelector('.camera-window-close');
    closeBtn.onclick = () => {
      this.stopViewing(userId);
    };

    this.makeDraggable(container);

    if (this.remoteStreams[userId]) {
      this.bindStreamToVideo(userId, this.remoteStreams[userId]);
    }
  }

  handleZoom(el, type) {
    const currentWidth = parseFloat(getComputedStyle(el, null).getPropertyValue('width'));
    const step = 60;
    
    let newWidth;
    
    if (type === 'in') {
      newWidth = currentWidth + step;
      if (newWidth > 800) return; 
    } else {
      newWidth = currentWidth - step;
      if (newWidth < 200) return; 
    }
    
    el.style.width = newWidth + 'px';
    // Removed minHeight setting to let aspect-ratio of the body handle the height naturally
    el.style.minHeight = 'auto'; 
  }

  bindStreamToVideo(userId, stream) {
    const videoEl = document.getElementById(`video-remote-${userId}`);
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.play().catch(e => console.warn('[Camera] Auto-play prevented', e));
      
      const loading = videoEl.parentElement.querySelector('.camera-loading');
      if (loading) loading.style.display = 'none';
      
      delete this.remoteStreams[userId];
    } else {
      this.remoteStreams[userId] = stream;
    }
  }

  makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = el.querySelector('.camera-window-header');
    
    const dragMouseDown = (e) => {
      e = e || window.event;
      // Handle both mouse and touch
      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      
      pos3 = clientX;
      pos4 = clientY;
      
      if (e.type === 'mousedown') {
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
      } else {
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementDrag;
      }
    };

    const elementDrag = (e) => {
      e = e || window.event;
      // Prevent scrolling while dragging on touch
      if (e.type === 'touchmove') e.preventDefault();
      
      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
      
      pos1 = pos3 - clientX;
      pos2 = pos4 - clientY;
      pos3 = clientX;
      pos4 = clientY;
      
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
      // Clear right/transform if dragged
      el.style.right = 'auto';
      el.style.transform = 'none';
    };

    const closeDragElement = () => {
      document.onmouseup = null;
      document.onmousemove = null;
      document.ontouchend = null;
      document.ontouchmove = null;
    };
    
    header.onmousedown = dragMouseDown;
    header.addEventListener('touchstart', dragMouseDown, { passive: false });
  }

  stopViewing(userId) {
    this.socket.emit('camera:end', { targetId: userId });
    this.cleanupSession(userId);
  }

  getOrCreatePeerConnection(userId, isOwner) {
    if (this.peerConnections[userId]) return this.peerConnections[userId];

    const pc = new RTCPeerConnection(this.config);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('camera:candidate', {
          targetId: userId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[Camera] Received remote track for', userId);
      this.bindStreamToVideo(userId, event.streams[0]);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Camera] ICE Status (${userId}):`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        this.cleanupSession(userId);
      }
    };

    this.peerConnections[userId] = pc;
    this.flushPendingCandidates(userId);
    return pc;
  }

  async handleOffer(data) {
    const { fromId, offer } = data;
    const pc = this.getOrCreatePeerConnection(fromId, false);
    
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.emit('camera:answer', {
        targetId: fromId,
        answer: answer
      });

      this.flushPendingCandidates(fromId);
    } catch (e) {
      console.error('[Camera] Error handling offer:', e);
    }
  }

  async handleAnswer(data) {
    const { fromId, answer } = data;
    const pc = this.peerConnections[fromId];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        this.flushPendingCandidates(fromId);
      } catch (e) {
        console.error('[Camera] Error handling answer:', e);
      }
    }
  }

  async handleCandidate(data) {
    const { fromId, candidate } = data;
    const pc = this.peerConnections[fromId];
    
    if (!pc || !pc.remoteDescription) {
      if (!this.pendingCandidates[fromId]) this.pendingCandidates[fromId] = [];
      this.pendingCandidates[fromId].push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('[Camera] Error adding ice candidate', e);
    }
  }

  async flushPendingCandidates(userId) {
    const pc = this.peerConnections[userId];
    if (!pc || !pc.remoteDescription || !this.pendingCandidates[userId]) return;

    const candidates = this.pendingCandidates[userId];
    delete this.pendingCandidates[userId];

    for (const cand of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('[Camera] ICE candidate buffer flush error', e);
      }
    }
  }

  cleanupSession(userId) {
    const pc = this.peerConnections[userId];
    if (pc) {
      pc.close();
      delete this.peerConnections[userId];
    }

    delete this.pendingCandidates[userId];
    delete this.remoteStreams[userId];

    const videoWindow = document.getElementById(`camera-view-${userId}`);
    if (videoWindow) {
      videoWindow.remove();
    }

    if (Object.keys(this.peerConnections).length === 0 && this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      console.log('[Camera] Local stream stopped');
      const localPrev = document.getElementById('camera-local-preview');
      if (localPrev) localPrev.remove();
    }
  }
}

window.CameraManager = CameraManager;
