/**
 * liveBroadcastManager.js
 * Comprehensive, professional, and independent live broadcasting client implementation using WebRTC.
 * Does not interfere with cameraManager.
 */

class LiveBroadcastManager {
  constructor(socket) {
    this.socket = socket || window.socket;
    this.localStream = null;
    this.peerConnections = new Map(); // Map of viewerSocketId -> RTCPeerConnection (Broadcaster mode) OR broadcasterSocketId -> RTCPeerConnection (Viewer mode)
    this.pendingCandidates = new Map(); // Map of socketId -> Array of RTCIceCandidate
    this.isBroadcasting = false;
    this.currentSourceType = null;
    this.currentScope = null;
    this.isSwitchingCamera = false;
    this.activeViewers = new Set(); // Set of active viewer socket IDs
    this.watchingBroadcasterSocketId = null; // Stored broadcaster socket ID when watching
    this.watchingBroadcasterUserId = null;
    this.watchingBroadcasterName = null;
    this.recentBroadcastNotifications = new Set();
    
    this.isVideoPaused = false;
    this.currentCameraFacing = 'front';

    this.iceServers = [
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

    this.init();
  }

  init() {
    if (!this.socket) {
      this.socket = window.socket;
    }
    if (this.socket) {
      this.setupSocketHandlers();
    } else {
      setTimeout(() => this.init(), 1000);
      return;
    }

    // Attach click handler to top bar live btn
    const btn = document.getElementById('top-live-broadcast-btn');
    if (btn) {
      btn.onclick = () => {
        if (this.isBroadcasting) {
          this.stopBroadcast();
        } else {
          this.openStartModal();
        }
      };
    }
  }

  setupSocketHandlers() {
    // A viewer has clicked to watch us
    this.socket.on('liveBroadcast:viewer-request', async (data) => {
      console.log('[Live] Viewer request received from:', data);
      if (!this.isBroadcasting) return;
      this.activeViewers.add(data.viewerSocketId);
      this.updateViewersCountUI();
      await this.initiatePeerForViewer(data.viewerSocketId);
    });

    // Signaling Offer received (as Viewer)
    this.socket.on('liveBroadcast:offer', async (data) => {
      console.log('[Live] Offer received from:', data.fromUserId);
      this.watchingBroadcasterSocketId = data.fromSocketId;
      this.watchingBroadcasterUserId = data.fromUserId;
      this.watchingBroadcasterName = data.fromName || 'بث مباشر';
      this.showViewerUI(data.fromSocketId, this.watchingBroadcasterName);
      await this.handleOffer(data);
    });

    // Signaling Answer received (as Broadcaster)
    this.socket.on('liveBroadcast:answer', async (data) => {
      console.log('[Live] Answer received from socket:', data.fromSocketId);
      await this.handleAnswer(data);
    });

    // Signaling ICE Candidate received
    this.socket.on('liveBroadcast:ice-candidate', async (data) => {
      await this.handleIceCandidate(data);
    });

    // Error response
    this.socket.on('liveBroadcast:error', (data) => {
      Swal.fire({
        title: 'تنبيه',
        text: data.message || 'حدث خطأ غير متوقع في البث المباشر',
        icon: 'warning',
        confirmButtonText: 'حسناً'
      });
      this.closeViewerUI();
    });

    // Broadcast ended
    this.socket.on('liveBroadcast:ended', (data) => {
      console.log('[Live] Broadcast ended by Broadcaster');
      if (
        this.watchingBroadcasterUserId &&
        Number(data.broadcasterId) === Number(this.watchingBroadcasterUserId)
      ) {
        Swal.fire({
          title: 'إنهاء البث',
          text: 'تم إنهاء البث المباشر',
          icon: 'info',
          timer: 2500,
          showConfirmButton: false
        });
        this.stopWatching();
      }
    });

    // Viewer disconnected
    this.socket.on('liveBroadcast:viewer-left', (data) => {
      console.log('[Live] Viewer disconnected:', data.viewerSocketId);
      this.activeViewers.delete(data.viewerSocketId);
      this.updateViewersCountUI();
      const pc = this.peerConnections.get(data.viewerSocketId);
      if (pc) {
        pc.close();
        this.peerConnections.delete(data.viewerSocketId);
      }
      this.pendingCandidates.delete(data.viewerSocketId);
    });

    // Broadcast notification
    this.socket.on('liveBroadcast:notify', (data) => {
      this.showBroadcastNotification(data);
    });
  }

  // --- Start Live Broadcast Selection UI ---
  openStartModal() {
    if (this.isBroadcasting) {
      window.showToast('أنت تبث حالياً بالفعل', 'error');
      return;
    }

    const htmlContent = `
      <div class="text-end" style="direction: rtl; font-family: sans-serif;">
        <label class="fw-bold mb-2 d-block text-dark" style="font-size: 14px;">1. اختر مصدر البث المباشر:</label>
        <div class="row g-2 mb-4">
          <div class="col-4">
            <div class="live-broadcast-source-option active" data-source="front" style="border: 2px solid #6f42c1; border-radius: 12px; padding: 12px 6px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
              <i class="fas fa-camera d-block mb-1 text-primary" style="font-size: 22px;"></i>
              <span style="font-size: 12px; font-weight: bold; color: #333;">كاميرا أمامية</span>
            </div>
          </div>
          <div class="col-4">
            <div class="live-broadcast-source-option" data-source="back" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 6px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
              <i class="fas fa-sync d-block mb-1 text-success" style="font-size: 22px;"></i>
              <span style="font-size: 12px; font-weight: bold; color: #333;">كاميرا خلفية</span>
            </div>
          </div>
          <div class="col-4">
            <div class="live-broadcast-source-option" data-source="screen" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 6px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
              <i class="fas fa-desktop d-block mb-1 text-warning" style="font-size: 22px;"></i>
              <span style="font-size: 12px; font-weight: bold; color: #333;">مشاركة شاشة</span>
            </div>
          </div>
        </div>

        <label class="fw-bold mb-2 d-block text-dark" style="font-size: 14px;">2. نطاق البث المباشر:</label>
        <div class="row g-2 mb-2">
          <div class="col-6">
            <div class="live-broadcast-scope-option active" data-scope="global" style="border: 2px solid #6f42c1; border-radius: 12px; padding: 14px 10px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
              <i class="fas fa-globe d-block mb-1 text-info" style="font-size: 18px;"></i>
              <span style="font-size: 13px; font-weight: bold; color: #333;">بث للجميع</span>
            </div>
          </div>
          <div class="col-6">
            <div class="live-broadcast-scope-option" data-scope="room" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 10px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
              <i class="fas fa-door-open d-block mb-1 text-secondary" style="font-size: 18px;"></i>
              <span style="font-size: 13px; font-weight: bold; color: #333;">الغرفة الحالية فقط</span>
            </div>
          </div>
        </div>
      </div>
    `;

    Swal.fire({
      title: 'بدء بث مباشر',
      html: htmlContent,
      showCancelButton: true,
      confirmButtonText: 'بدء الآن 🚀',
      cancelButtonText: 'إلغاء',
      confirmButtonColor: '#6f42c1',
      cancelButtonColor: '#475569',
      width: '420px',
      didOpen: () => {
        const sources = document.querySelectorAll('.live-broadcast-source-option');
        let selectedSource = 'front';
        sources.forEach(opt => {
          opt.addEventListener('click', () => {
            sources.forEach(o => {
              o.classList.remove('active');
              o.style.borderColor = '#e2e8f0';
              o.style.borderWidth = '1px';
            });
            opt.classList.add('active');
            opt.style.borderColor = '#6f42c1';
            opt.style.borderWidth = '2px';
            selectedSource = opt.getAttribute('data-source');
            window._selectedBroadcastConfig.source = selectedSource;
          });
        });

        const scopes = document.querySelectorAll('.live-broadcast-scope-option');
        let selectedScope = 'global';
        scopes.forEach(opt => {
          opt.addEventListener('click', () => {
            scopes.forEach(o => {
              o.classList.remove('active');
              o.style.borderColor = '#e2e8f0';
              o.style.borderWidth = '1px';
            });
            opt.classList.add('active');
            opt.style.borderColor = '#6f42c1';
            opt.style.borderWidth = '2px';
            selectedScope = opt.getAttribute('data-scope');
            window._selectedBroadcastConfig.scope = selectedScope;
          });
        });

        window._selectedBroadcastConfig = { source: selectedSource, scope: selectedScope };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const cfg = window._selectedBroadcastConfig || { source: 'front', scope: 'global' };
        this.startBroadcast({
          sourceType: cfg.source,
          scope: cfg.scope
        });
      }
    });
  }

  // --- Start Streaming Logic ---
  async startBroadcast({ sourceType, scope }) {
    console.log('[Live] Starting broadcast with sourceType:', sourceType, 'scope:', scope);
    try {
      if (sourceType === 'screen' && (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia)) {
        Swal.fire('خطأ', 'مشاركة الشاشة غير مدعومة في هذا المتصفح', 'error');
        return;
      }

      let stream = null;
      if (sourceType === 'front') {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24 }
          },
          audio: true
        });
      } else if (sourceType === 'back') {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24 }
          },
          audio: true
        });
      } else if (sourceType === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 24 }
          },
          audio: true
        });
      }

      if (!stream) {
        throw new Error('Could not acquire MediaStream');
      }

      this.localStream = stream;
      this.isBroadcasting = true;
      this.currentSourceType = sourceType;
      this.currentScope = scope;
      this.activeViewers.clear();
      
      this.currentCameraFacing = sourceType === 'back' ? 'back' : 'front';
      this.isVideoPaused = false;

      // Monitor Screen Sharing stop by user
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && sourceType === 'screen') {
        videoTrack.onended = () => {
          console.log('[Live] Screen sharing track ended');
          this.stopBroadcast();
        };
      } else if (videoTrack) {
        videoTrack.onended = () => {
          if (this.isSwitchingCamera) return;
          console.log('[Live] Camera track ended');
        };
      }

      // Tell Server about the live broadcast launch
      const currentRoomId = window.currentRoomId || (window.state && window.state.currentRoomId);
      this.socket.emit('liveBroadcast:start', {
        sourceType,
        scope,
        roomId: currentRoomId || null
      });

      // Show Active UI State for broadcast buttons and previews
      const btn = document.getElementById('top-live-broadcast-btn');
      if (btn) {
        btn.classList.add('active');
        btn.title = 'إنهاء البث المباشر';
      }

      this.showLocalPreviewUI(sourceType, scope);

    } catch (err) {
      console.error('[Live] Error starting broadcast:', err);
      Swal.fire('فشل بدء البث', 'يرجى التأكد من توفر الكاميرا والميكروفون وإعطاء الصلاحية', 'error');
      this.stopBroadcast();
    }
  }

  // Stop broadcasting
  stopBroadcast() {
    console.log('[Live] Stopping broadcast');
    // Tell socket server to stop broadcast
    this.socket.emit('liveBroadcast:stop');

    // Terminate Peer list
    this.peerConnections.forEach((pc) => {
      try { pc.close(); } catch(e) {}
    });
    this.peerConnections.clear();
    this.pendingCandidates.clear();

    // Terminate local streams
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try { track.stop(); } catch(e) {}
      });
      this.localStream = null;
    }

    this.isBroadcasting = false;
    this.currentSourceType = null;
    this.currentScope = null;
    this.activeViewers.clear();
    this.isVideoPaused = false;
    this.currentCameraFacing = 'front';

    // Reset button design
    const btn = document.getElementById('top-live-broadcast-btn');
    if (btn) {
      btn.classList.remove('active');
      btn.title = 'بث مباشر';
    }

    this.closeLocalPreviewUI();
  }

  // Helper to make panels draggable and resizable
  setupDraggableAndResizable(container, header) {
    if (!container || !header) return;

    let isDragging = false;
    let isResizing = false;
    let startX, startY;
    let startWidth, startHeight;
    let containerLeft, containerTop;

    // Set cursor for header
    header.style.cursor = 'move';

    // 1. Draggable implementation
    const onMouseDown = (e) => {
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
        return;
      }

      isDragging = true;
      const clientX = e.type.indexOf('touch') !== -1 ? e.touches[0].clientX : e.clientX;
      const clientY = e.type.indexOf('touch') !== -1 ? e.touches[0].clientY : e.clientY;

      const rect = container.getBoundingClientRect();
      
      startX = clientX - rect.left;
      startY = clientY - rect.top;

      // Switch positioning styles to explicit left/top to prevent layout shifts
      container.style.bottom = 'auto';
      container.style.right = 'auto';
      container.style.left = rect.left + 'px';
      container.style.top = rect.top + 'px';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('touchmove', onMouseMove, { passive: false });
      document.addEventListener('touchend', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault();

      const clientX = e.type.indexOf('touch') !== -1 ? e.touches[0].clientX : e.clientX;
      const clientY = e.type.indexOf('touch') !== -1 ? e.touches[0].clientY : e.clientY;

      let left = clientX - startX;
      let top = clientY - startY;

      const rect = container.getBoundingClientRect();
      const maxLeft = window.innerWidth - rect.width;
      const maxTop = window.innerHeight - rect.height;

      left = Math.max(0, Math.min(left, maxLeft));
      top = Math.max(0, Math.min(top, maxTop));

      container.style.left = left + 'px';
      container.style.top = top + 'px';
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onMouseMove);
      document.removeEventListener('touchend', onMouseUp);
    };

    header.addEventListener('mousedown', onMouseDown);
    header.addEventListener('touchstart', onMouseDown, { passive: true });

    // 2. Resizable implementation (Corners styling & math)
    const handleLeft = document.createElement('div');
    handleLeft.style.position = 'absolute';
    handleLeft.style.bottom = '0';
    handleLeft.style.left = '0';
    handleLeft.style.width = '18px';
    handleLeft.style.height = '18px';
    handleLeft.style.cursor = 'nesw-resize';
    handleLeft.style.zIndex = '10001';
    handleLeft.style.background = 'linear-gradient(45deg, rgba(255, 255, 255, 0.3) 30%, transparent 30%)';

    const handleRight = document.createElement('div');
    handleRight.style.position = 'absolute';
    handleRight.style.bottom = '0';
    handleRight.style.right = '0';
    handleRight.style.width = '18px';
    handleRight.style.height = '18px';
    handleRight.style.cursor = 'nwse-resize';
    handleRight.style.zIndex = '10001';
    handleRight.style.background = 'linear-gradient(135deg, transparent 70%, rgba(255, 255, 255, 0.3) 70%)';

    container.appendChild(handleLeft);
    container.appendChild(handleRight);

    const onResizeStart = (e, isRightSide) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;

      const clientX = e.type.indexOf('touch') !== -1 ? e.touches[0].clientX : e.clientX;
      const clientY = e.type.indexOf('touch') !== -1 ? e.touches[0].clientY : e.clientY;

      startX = clientX;
      startY = clientY;

      const rect = container.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      containerLeft = rect.left;
      containerTop = rect.top;

      container.style.bottom = 'auto';
      container.style.right = 'auto';
      container.style.left = containerLeft + 'px';
      container.style.top = containerTop + 'px';

      const onResizeMove = (moveEvt) => {
        if (!isResizing) return;
        if (moveEvt.cancelable) moveEvt.preventDefault();

        const currentX = moveEvt.type.indexOf('touch') !== -1 ? moveEvt.touches[0].clientX : moveEvt.clientX;
        const currentY = moveEvt.type.indexOf('touch') !== -1 ? moveEvt.touches[0].clientY : moveEvt.clientY;

        let deltaX = currentX - startX;
        let newWidth;

        if (isRightSide) {
          newWidth = startWidth + deltaX;
        } else {
          newWidth = startWidth - deltaX;
        }

        newWidth = Math.max(220, Math.min(newWidth, window.innerWidth - 40));

        if (!isRightSide) {
          const shiftLeft = startWidth - newWidth;
          container.style.left = (containerLeft + shiftLeft) + 'px';
        }

        container.style.width = newWidth + 'px';
      };

      const onResizeEnd = () => {
        isResizing = false;
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
        document.removeEventListener('touchmove', onResizeMove);
        document.removeEventListener('touchend', onResizeEnd);
      };

      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', onResizeEnd);
      document.addEventListener('touchmove', onResizeMove, { passive: false });
      document.addEventListener('touchend', onResizeEnd);
    };

    handleLeft.addEventListener('mousedown', (e) => onResizeStart(e, false));
    handleLeft.addEventListener('touchstart', (e) => onResizeStart(e, false), { passive: false });

    handleRight.addEventListener('mousedown', (e) => onResizeStart(e, true));
    handleRight.addEventListener('touchstart', (e) => onResizeStart(e, true), { passive: false });
  }

  // --- Broadcaster Floating Window UI ---
  showLocalPreviewUI(sourceType, scope) {
    this.closeLocalPreviewUI();

    const parent = document.createElement('div');
    parent.id = 'live-broadcast-preview-container';
    parent.className = 'live-broadcast-preview';
    parent.style.position = 'fixed';
    parent.style.bottom = '15px';
    parent.style.right = '15px';
    parent.style.width = '240px';
    parent.style.backgroundColor = '#1e1e2e';
    parent.style.border = '2.5px solid #ff4757';
    parent.style.borderRadius = '14px';
    parent.style.boxShadow = '0 10px 25px rgba(0,0,0,0.4)';
    parent.style.zIndex = '9999';
    parent.style.overflow = 'hidden';
    parent.style.color = '#fff';
    parent.style.direction = 'rtl';

    let typeText = 'كاميرا أمامية';
    if (sourceType === 'back') typeText = 'كاميرا خلفية';
    if (sourceType === 'screen') typeText = 'مشاركة شاشة';

    let scopeText = scope === 'room' ? 'الغرفة الحالية فقط' : 'للجميع';

    parent.innerHTML = `
      <div id="live-local-header" style="background: rgba(0,0,0,0.5); padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #ff4757; animation: livePulse 1s infinite; display: inline-block;"></span>
          <span style="font-size: 11px; font-weight: bold;">معاينة البث</span>
        </div>
        <button id="live-btn-close-local" class="btn btn-sm btn-outline-light" style="padding: 1px 6px; font-size: 10px; border-radius: 4px;">إنهاء البث</button>
      </div>
      <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000;">
        <video id="live-local-video" autoplay muted playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
      </div>
      <div class="live-broadcast-preview-actions" style="${sourceType === 'screen' ? 'display: none !important;' : ''}">
        <button id="live-btn-switch-camera" ${sourceType === 'screen' ? 'style="display:none"' : ''} title="تبديل الكاميرا">
          <i class="fas fa-sync-alt"></i>
        </button>
        <button id="live-btn-toggle-video">
          <i class="fas fa-video-slash"></i> إيقاف الكاميرا
        </button>
      </div>
      <div style="padding: 8px 12px; font-size: 11px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.08);">
        <div style="margin-bottom: 2px;">• المصدر: <strong>${typeText}</strong></div>
        <div style="margin-bottom: 2px;">• النطاق: <strong>${scopeText}</strong></div>
        <div>• المشاهدون: <strong id="live-broadcast-viewers-count" class="live-broadcast-badge" style="background: #6f42c1; color: white; padding: 1px 7px; border-radius: 10px; font-size: 11px;">0</strong></div>
      </div>
    `;

    document.body.appendChild(parent);

    const header = parent.querySelector('#live-local-header');
    this.setupDraggableAndResizable(parent, header);

    const video = document.getElementById('live-local-video');
    if (video) video.srcObject = this.localStream;

    const stopBtn = document.getElementById('live-btn-close-local');
    if (stopBtn) {
      stopBtn.onclick = () => this.stopBroadcast();
    }

    const switchBtn = document.getElementById('live-btn-switch-camera');
    if (switchBtn) {
      switchBtn.onclick = () => this.switchBroadcastCamera();
    }

    const toggleVideoBtn = document.getElementById('live-btn-toggle-video');
    if (toggleVideoBtn) {
      toggleVideoBtn.onclick = () => this.toggleBroadcastVideo();
    }
  }

  closeLocalPreviewUI() {
    const el = document.getElementById('live-broadcast-preview-container');
    if (el) el.remove();
  }

  async switchBroadcastCamera() {
    if (!this.isBroadcasting) return;

    if (this.currentSourceType === 'screen') {
      window.showToast('لا يمكن تبديل الكاميرا أثناء مشاركة الشاشة', 'warning');
      return;
    }

    if (this.isSwitchingCamera) return;

    const nextFacing = this.currentCameraFacing === 'front' ? 'back' : 'front';
    this.isSwitchingCamera = true;

    let newStream = null;
    let newVideoTrack = null;

    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing === 'front' ? 'user' : { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 20, max: 24 }
        },
        audio: false
      });

      newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('No video track found');
      }

      const oldVideoTrack = this.localStream?.getVideoTracks?.()[0];

      // استبدال الفيديو في جميع اتصالات المشاهدين
      const replaceTasks = [];

      this.peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          replaceTasks.push(sender.replaceTrack(newVideoTrack));
        }
      });

      await Promise.allSettled(replaceTasks);

      // استبدال التراك داخل localStream مع الحفاظ على الصوت
      if (this.localStream) {
        if (oldVideoTrack) {
          // Remove from local stream
          this.localStream.removeTrack(oldVideoTrack);
        }

        this.localStream.addTrack(newVideoTrack);
      } else {
        this.localStream = new MediaStream([newVideoTrack]);
      }

      if (oldVideoTrack) {
        oldVideoTrack.onended = null;
        try { oldVideoTrack.stop(); } catch (e) {}
      }

      // تحديث المعاينة المحلية
      const localVideo = document.getElementById('live-local-video');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
        await localVideo.play().catch(() => {});
      }

      this.currentCameraFacing = nextFacing;
      this.currentSourceType = nextFacing === 'front' ? 'front' : 'back';
      this.isVideoPaused = false;

      const toggleBtn = document.getElementById('live-btn-toggle-video');
      if (toggleBtn) {
        toggleBtn.innerHTML = '<i class="fas fa-video-slash"></i> إيقاف الكاميرا';
      }

    } catch (err) {
      console.error('[Live] switch camera error:', err);

      if (newVideoTrack) {
        try { newVideoTrack.stop(); } catch (e) {}
      }

      window.showToast('تعذر تبديل الكاميرا، تأكد من توفر الكاميرا الأخرى', 'error');
    } finally {
      this.isSwitchingCamera = false;
    }
  }

  toggleBroadcastVideo() {
    if (!this.isBroadcasting || !this.localStream) return;

    if (this.currentSourceType === 'screen') {
      window.showToast('إيقاف الفيديو المؤقت غير متاح أثناء مشاركة الشاشة، يمكنك إنهاء مشاركة الشاشة', 'warning');
      return;
    }

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    this.isVideoPaused = !this.isVideoPaused;
    videoTrack.enabled = !this.isVideoPaused;

    const btn = document.getElementById('live-btn-toggle-video');
    if (btn) {
      btn.innerHTML = this.isVideoPaused
        ? '<i class="fas fa-video"></i> تشغيل الكاميرا'
        : '<i class="fas fa-video-slash"></i> إيقاف الكاميرا';
    }

    const localVideo = document.getElementById('live-local-video');
    if (localVideo) {
      localVideo.style.opacity = this.isVideoPaused ? '0.35' : '1';
    }
  }

  updateViewersCountUI() {
    const countEl = document.getElementById('live-broadcast-viewers-count');
    if (countEl) {
      countEl.innerText = this.activeViewers.size;
    }
  }

  // --- WebRTC Broadcaster signaling connections ---
  async initiatePeerForViewer(viewerSocketId) {
    if (this.peerConnections.has(viewerSocketId)) {
      try { this.peerConnections.get(viewerSocketId).close(); } catch(e) {}
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(viewerSocketId, pc);

    pc.onconnectionstatechange = () => {
      console.log('[Live] Broadcaster PC state:', viewerSocketId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn('[Live] Viewer connection failed/disconnected:', viewerSocketId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Live] Broadcaster ICE state:', viewerSocketId, pc.iceConnectionState);
    };

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('liveBroadcast:ice-candidate', {
          targetSocketId: viewerSocketId,
          candidate: event.candidate
        });
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('liveBroadcast:offer', {
        targetSocketId: viewerSocketId,
        offer: offer
      });
    } catch (err) {
      console.error('[Live] Error generating initial offer for viewer:', err);
    }
  }

  // --- Watching a Stream (Viewer mode) ---
  watchBroadcast(broadcasterUserId) {
    console.log('[Live] Requesting to watch broadcaster:', broadcasterUserId);
    this.socket.emit('liveBroadcast:watch', { broadcasterId: broadcasterUserId });
  }

  // Handle Offer coming from broadcaster
  async handleOffer(data) {
    const { fromSocketId, offer } = data;
    console.log('[Live] Creating peer as viewer to respond offer');

    if (this.peerConnections.has(fromSocketId)) {
      try { this.peerConnections.get(fromSocketId).close(); } catch(e) {}
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(fromSocketId, pc);

    pc.onconnectionstatechange = () => {
      console.log('[Live] Viewer PC state:', fromSocketId, pc.connectionState);

      if (pc.connectionState === 'connected') {
        const video = document.getElementById('live-remote-video');
        if (video && video.paused) {
          video.play().catch(() => this.showTapToPlayOverlay(video));
        }
      }

      if (pc.connectionState === 'failed') {
        window.showToast('فشل الاتصال بالبث المباشر، حاول مرة أخرى', 'error');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Live] Viewer ICE state:', fromSocketId, pc.iceConnectionState);
    };

    // Track listener
    const remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      console.log('[Live] Track received from broadcaster:', event.track.kind);
      const video = document.getElementById('live-remote-video');
      if (video) {
        if (event.streams && event.streams[0]) {
          video.srcObject = event.streams[0];
        } else {
          remoteStream.addTrack(event.track);
          video.srcObject = remoteStream;
        }

        video.muted = false;
        video.playsInline = true;
        video.autoplay = true;

        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            this.showTapToPlayOverlay(video);
          });
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('liveBroadcast:ice-candidate', {
          targetSocketId: fromSocketId,
          candidate: event.candidate
        });
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Handle any buffered candidates
      const pending = this.pendingCandidates.get(fromSocketId);
      if (pending) {
        for (const cand of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(e) {}
        }
        this.pendingCandidates.delete(fromSocketId);
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Respond with answer
      this.socket.emit('liveBroadcast:answer', {
        targetSocketId: fromSocketId,
        answer: answer
      });

    } catch (err) {
      console.error('[Live] Error during setRemoteDescription/createAnswer:', err);
      window.showToast('فشل الاستجابة لطلب البث', 'error');
    }
  }

  // Handle Answer
  async handleAnswer(data) {
    const pc = this.peerConnections.get(data.fromSocketId);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

      const pending = this.pendingCandidates.get(data.fromSocketId);
      if (pending) {
        for (const cand of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(e) {}
        }
        this.pendingCandidates.delete(data.fromSocketId);
      }
    } catch (err) {
      console.error('[Live] Error setRemoteDescription of answer:', err);
    }
  }

  // Handle ICE Candidate
  async handleIceCandidate(data) {
    const pc = this.peerConnections.get(data.fromSocketId);
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('[Live] Error adding received candidate:', err);
      }
    } else {
      if (!this.pendingCandidates.has(data.fromSocketId)) {
        this.pendingCandidates.set(data.fromSocketId, []);
      }
      this.pendingCandidates.get(data.fromSocketId).push(data.candidate);
    }
  }

  // Stop watching stream
  stopWatching() {
    console.log('[Live] Stop watching broadcaster');
    if (this.watchingBroadcasterSocketId) {
      this.socket.emit('liveBroadcast:viewer-left', {
        broadcasterId: this.watchingBroadcasterUserId
      });
      const pc = this.peerConnections.get(this.watchingBroadcasterSocketId);
      if (pc) {
        try { pc.close(); } catch(e) {}
        this.peerConnections.delete(this.watchingBroadcasterSocketId);
      }
    }
    this.watchingBroadcasterSocketId = null;
    this.watchingBroadcasterUserId = null;
    this.watchingBroadcasterName = null;
    this.closeViewerUI();
  }

  // --- Viewer Floating Screen UI ---
  showViewerUI(broadcasterSocketId, broadcasterName = 'بث مباشر') {
    this.closeViewerUI();

    const parent = document.createElement('div');
    parent.id = 'live-broadcast-viewer-container';
    parent.className = 'live-broadcast-viewer';
    parent.style.position = 'fixed';
    parent.style.bottom = '15px';
    parent.style.left = '15px';
    parent.style.width = '300px';
    parent.style.backgroundColor = '#181824';
    parent.style.border = '2.5px solid #6f42c1';
    parent.style.borderRadius = '16px';
    parent.style.boxShadow = '0 12px 30px rgba(0,0,0,0.5)';
    parent.style.zIndex = '9999';
    parent.style.overflow = 'hidden';
    parent.style.color = '#fff';
    parent.style.direction = 'rtl';

    parent.innerHTML = `
      <div id="live-viewer-header" style="background: rgba(0,0,0,0.6); padding: 9px 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(111, 66, 193, 0.25);">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #2ed573; animation: livePulse 1s infinite; display: inline-block;"></span>
          <span style="font-size: 12px; font-weight: bold;">مشاهدة بث: ${broadcasterName}</span>
        </div>
        <button id="live-btn-close-viewer" class="btn btn-sm btn-outline-danger" style="padding: 1px 8px; font-size: 11px; font-weight: bold; border-radius: 5px;">إغلاق</button>
      </div>
      <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000;">
        <video id="live-remote-video" autoplay playsinline controls style="width: 100%; height: 100%; object-fit: cover;"></video>
      </div>
    `;

    document.body.appendChild(parent);

    const header = parent.querySelector('#live-viewer-header');
    this.setupDraggableAndResizable(parent, header);

    const closeViewer = document.getElementById('live-btn-close-viewer');
    if (closeViewer) {
      closeViewer.onclick = () => this.stopWatching();
    }
  }

  closeViewerUI() {
    const el = document.getElementById('live-broadcast-viewer-container');
    if (el) el.remove();
  }

  showTapToPlayOverlay(video) {
    const container = document.getElementById('live-broadcast-viewer-container');
    if (!container || container.querySelector('.live-tap-play-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'live-tap-play-overlay';
    overlay.innerHTML = `
      <button type="button" class="live-tap-play-btn">
        <i class="fas fa-play"></i>
        اضغط لتشغيل البث
      </button>
    `;

    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.55)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '5';

    const videoParent = video.parentElement;
    if (videoParent) {
      videoParent.style.position = 'relative';
      videoParent.appendChild(overlay);
    }

    overlay.querySelector('button').onclick = async () => {
      try {
        await video.play();
        overlay.remove();
      } catch (e) {
        console.error('[Live] manual play failed:', e);
      }
    };
  }

  showBroadcastNotification(data) {
    if (!data || !data.broadcasterId) return;

    const key = `${data.broadcasterId}-${data.scope}-${data.roomId || 'global'}`;
    if (this.recentBroadcastNotifications.has(key)) {
      return;
    }

    this.recentBroadcastNotifications.add(key);
    setTimeout(() => {
      this.recentBroadcastNotifications.delete(key);
    }, 30000);

    const broadcasterName = data.broadcasterName || 'مستخدم';
    
    let iconClass = 'fas fa-video';
    let sourceText = 'بث مباشر';
    if (data.sourceType === 'screen') {
      iconClass = 'fas fa-desktop';
      sourceText = 'مشاركة شاشة مباشرة';
    } else if (data.sourceType === 'front') {
      iconClass = 'fas fa-camera';
      sourceText = 'بث مباشر بالكاميرا الأمامية';
    } else if (data.sourceType === 'back') {
      iconClass = 'fas fa-sync';
      sourceText = 'بث مباشر بالكاميرا الخلفية';
    }

    let scopeText = 'هذا البث متاح للجميع';
    if (data.scope === 'room') {
      scopeText = 'هذا البث مخصص للغرفة الحالية';
    }

    Swal.fire({
      title: 'بث مباشر جديد',
      html: `
        <div class="live-broadcast-alert">
          <div class="live-broadcast-alert-icon">
            <i class="${iconClass}"></i>
          </div>
          <div class="live-broadcast-alert-title">
            قام <b>${broadcasterName}</b> ببدء بث مباشر
          </div>
          <div class="live-broadcast-alert-desc">
            ${sourceText}
          </div>
          <div class="live-broadcast-alert-scope">
            ${scopeText}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'مشاهدة البث',
      cancelButtonText: 'تجاهل',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      customClass: {
        popup: 'live-broadcast-swal-popup'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.watchBroadcast(data.broadcasterId);
      }
    });
  }
}

// Instantiate globally
window.liveBroadcastManager = new LiveBroadcastManager(window.socket);
