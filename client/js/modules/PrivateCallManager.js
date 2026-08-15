export const PrivateCallManager = {
  peerConnection: null,
  localStream: null,
  remoteAudio: null,
  callId: null,
  isMuted: false,
  isSpeakerMuted: false,
  callPanel: null,
  timerInterval: null,
  incomingCaller: null,
  currentState: null,
  currentStatus: null,
  currentCallUserId: null,
  pendingIceCandidates: [],
  iceServers: [
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
  ],
  ringtone: new Audio('https://actions.google.com/sounds/v1/alarms/phone_ringing.ogg'), // صوت رنين افتراضي

  escapeHtml(str) {
    if (!str) return '';
    if (window.escapeHTML) return window.escapeHTML(str);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  async startCall(targetUserId) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.currentCallUserId = targetUserId;
      window.socket.emit('pmcall:invite', { targetUserId });
      this.ringtone.loop = true;
      this.ringtone.play().catch(e => console.warn('Autoplay prevented by browser', e));
      this.showCallPanel('calling', 'جارٍ الاتصال...');
    } catch (err) {
      if (window.Swal) Swal.fire('خطأ', 'تعذر الوصول للميكروفون', 'error');
    }
  },

  async acceptCall(callId) {
    try {
      this.stopRingtone();
      this.callId = callId;
      this.pendingIceCandidates = [];
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      
      // جهز peerConnection أولاً قبل إرسال القبول للتأكد من الجاهزية الكاملة واستقبال الـ Signals فوراً
      await this.initPeerConnection(callId, false);
      
      window.socket.emit('pmcall:accept', { callId });
      this.showCallPanel('active', 'متصل');
    } catch (err) {
      console.warn('[PrivateCall] acceptCall failed:', err);
      this.hangup('فشل بدء الاتصال');
    }
  },

  async initPeerConnection(callId, isCaller) {
    this.callId = callId;
    this.pendingIceCandidates = [];
    const servers = (window.CameraIceServers && Array.isArray(window.CameraIceServers)) ? window.CameraIceServers : this.iceServers;
    this.peerConnection = new RTCPeerConnection({ iceServers: servers });
    
    this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));
    
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.callId === callId) {
        window.socket.emit('pmcall:signal', { callId, signal: { candidate: event.candidate } });
      }
    };
    
    this.peerConnection.ontrack = (event) => {
      if (!this.remoteAudio) {
        this.remoteAudio = new Audio();
      }
      this.remoteAudio.autoplay = true;
      this.remoteAudio.playsInline = true;
      this.remoteAudio.srcObject = event.streams[0];
      this.remoteAudio.play()
        .then(() => console.log('[PrivateCall] Audio playback started.'))
        .catch(e => console.warn('[PrivateCall] Remote video audio playback prevented', e));

      this.startTimer();
      this.showCallPanel('active', 'متصل');
    };
    
    if (isCaller) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      window.socket.emit('pmcall:signal', { callId, signal: { offer } });
    }
  },

  async handleSignal(data) {
    const { signal, callId } = data;
    // تجاهل أي signal لا يخص callId الحالي
    if (!this.callId || String(callId || data.callId) !== String(this.callId)) {
      return;
    }
    if (!this.peerConnection) {
      console.warn('[PrivateCall] Signal received but peerConnection is not initialized.');
      return;
    }

    try {
      if (signal.offer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        window.socket.emit('pmcall:signal', { callId: this.callId, signal: { answer } });
        await this.processPendingIceCandidates();
      } else if (signal.answer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
        await this.processPendingIceCandidates();
      } else if (signal.candidate) {
        const candy = new RTCIceCandidate(signal.candidate);
        if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
          await this.peerConnection.addIceCandidate(candy);
        } else {
          this.pendingIceCandidates.push(candy);
        }
      }
    } catch (err) {
      console.warn('[PrivateCall] Error handling signal:', err);
    }
  },

  async processPendingIceCandidates() {
    if (this.pendingIceCandidates && this.pendingIceCandidates.length > 0) {
      for (const candy of this.pendingIceCandidates) {
        try {
          await this.peerConnection.addIceCandidate(candy);
        } catch (e) {
          console.warn('[PrivateCall] Error adding buffered ICE candidate:', e);
        }
      }
      this.pendingIceCandidates = [];
    }
  },

  init(socket) {
    if (window.domainConfig && window.domainConfig.privateCallRingtoneUrl) {
      this.ringtone.src = window.domainConfig.privateCallRingtoneUrl;
    }
    this.ringtone.loop = true; // جعل الرنين مستمراً

    socket.on('pmcall:incoming', (data) => {
      this.callId = data.callId;
      this.incomingCaller = data.caller;
      this.currentCallUserId = data.caller.userId || data.caller.id;
      
      // Auto-open chat to ensure chat workspace and slot are loaded & active
      if (window.PrivateChatManager) {
        window.PrivateChatManager.openChat(data.caller);
      }

      // تشغيل صوت الرنين
      this.ringtone.play().catch(e => console.warn('Autoplay prevented by browser', e));

      this.showCallPanel('incoming', 'مكالمة واردة');
    });
    
    socket.on('pmcall:state', (data) => {
      if (data.callId) {
        this.callId = data.callId;
      }
      if (data.status === 'ringing') {
        this.showCallPanel('calling', 'يرن الآن...');
      }
    });

    socket.on('pmcall:accept', (data) => {
      this.stopRingtone();
      this.startTimer();
      this.initPeerConnection(data.callId, true);
    });

    socket.on('pmcall:signal', (data) => this.handleSignal(data));

    socket.on('pmcall:hangup', (data) => {
      const reason = data && data.reason;
      let statusMsg = 'انتهت المكالمة';
      if (reason === 'rejected') {
        statusMsg = 'تم رفض المكالمة';
      } else if (reason === 'disconnected') {
        statusMsg = 'انقطع الاتصال';
      }
      this.hangup(statusMsg, false); // false يعني لا ترسل pmcall:hangup للسيرفر مرة أخرى
    });

    socket.on('pmcall:busy', () => this.hangup('مشغول', false));
    socket.on('pmcall:error', (data) => this.hangup(data.message || 'خطأ في الاتصال', false));
  },

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    let seconds = 0;
    this.timerInterval = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      const timerEl = document.getElementById('call-timer');
      if (timerEl) timerEl.innerText = `${mins}:${secs}`;
    }, 1000);
  },

  showCallPanel(state, status) {
    this.currentState = state;
    this.currentStatus = status;

    const activeUser = window.PrivateChatManager?.activeChatUser;
    const activeUserId = activeUser ? (activeUser.userId || activeUser.id) : null;
    
    let chatContainer = null;
    let isGlobalFloating = false;

    // Check if we should mount inside the opened private chat, or floating globally
    if (activeUser && this.currentCallUserId && String(activeUserId) === String(this.currentCallUserId)) {
      chatContainer = document.getElementById('private-chat-call-slot');
    }

    if (!chatContainer) {
      // Mount floating globally
      let bodySlot = document.getElementById('global-call-slot');
      if (!bodySlot) {
        bodySlot = document.createElement('div');
        bodySlot.id = 'global-call-slot';
        bodySlot.style.cssText = 'position: fixed; top: 75px; left: 50%; transform: translateX(-50%); z-index: 99999; pointer-events: auto;';
        document.body.appendChild(bodySlot);
      }
      chatContainer = bodySlot;
      isGlobalFloating = true;
    } else {
      // Remove global call panel if moving to slot
      const globalPanel = document.getElementById('global-call-slot');
      if (globalPanel) {
        globalPanel.innerHTML = '';
      }
    }

    if (!this.callPanel) {
      this.callPanel = document.createElement('div');
      this.callPanel.className = 'call-panel';
      this.callPanel.style.pointerEvents = 'auto';
      this.makeDraggable(this.callPanel);
    }

    // Adjust calling panel style if global floating vs slot
    if (isGlobalFloating) {
      this.callPanel.style.position = 'relative';
      this.callPanel.style.margin = '0 auto';
      this.callPanel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
      this.callPanel.style.borderRadius = '10px';
      this.callPanel.style.border = '1px solid #444';
      this.callPanel.style.background = '#222';
      this.callPanel.style.color = '#fff';
      this.callPanel.style.width = '280px';
    } else {
      // Reset styles
      this.callPanel.style.position = '';
      this.callPanel.style.margin = '';
      this.callPanel.style.boxShadow = '';
      this.callPanel.style.borderRadius = '';
      this.callPanel.style.border = '';
      this.callPanel.style.background = '';
      this.callPanel.style.color = '';
      this.callPanel.style.width = '';
    }

    // Attach to selected container
    if (this.callPanel.parentElement !== chatContainer) {
      chatContainer.innerHTML = '';
      chatContainer.appendChild(this.callPanel);
    }

    const isRinging = state === 'calling' || state === 'incoming';
    const isActive = state === 'active';
    
    // Choose which user metadata to show
    const user = (state === 'incoming' && this.incomingCaller) 
      ? this.incomingCaller 
      : (activeUser && String(activeUserId) === String(this.currentCallUserId) ? activeUser : { username: 'مكالمة غامضة', pic: null });

    const pic = (window.getAvatarUrl ? window.getAvatarUrl(user) : user.pic) || 'https://placehold.co/100x100?text=User';
    
    let iconHtml = user.icon ? `<img src="${user.icon}" style="width:18px;height:18px;margin-left:5px;vertical-align:middle;">` : '';
    let nameHtml = this.escapeHtml(user.topic || user.username || 'مستخدم');
    let finalNameHtml = `${iconHtml}<span>${nameHtml}</span>`;

    this.callPanel.innerHTML = `
      <div class="call-avatar-wrapper ${isActive ? 'active-call-waves' : ''}">
        <img src="${pic}" class="call-avatar ${isRinging ? 'ringing' : ''}">
      </div>
      <div class="call-info">
        <div class="call-name">${finalNameHtml}</div>
        <div class="call-status">${this.escapeHtml(status)} ${state === 'active' ? '<span id="call-timer" class="call-timer">00:00</span>' : ''}</div>
      </div>
      <div class="call-controls">
        ${state === 'incoming' ? `
          <button id="call-reject-btn" class="btn btn-call-sm btn-reject"><i class="fas fa-phone-slash"></i></button>
          <button id="call-accept-btn" class="btn btn-call-sm btn-accept"><i class="fas fa-phone"></i></button>
        ` : state === 'active' ? `
          <button id="call-mute-btn" class="btn btn-call-sm" style="background-color: #28a745;"><i class="fas fa-microphone"></i></button>
          <button id="call-speaker-btn" class="btn btn-call-sm" style="background-color: #28a745;"><i class="fas fa-volume-up"></i></button>
          <button id="call-end-btn" class="btn btn-call-sm btn-reject"><i class="fas fa-phone-slash"></i></button>
        ` : `
          <button id="call-end-btn" class="btn btn-call-sm btn-reject"><i class="fas fa-phone-slash"></i></button>
        `}
      </div>
    `;

    if (state === 'incoming') {
      document.getElementById('call-accept-btn').onclick = (e) => { e.stopPropagation(); this.acceptCall(this.callId); };
      document.getElementById('call-reject-btn').onclick = (e) => { e.stopPropagation(); this.hangup('تم الرفض', true, 'rejected'); };
    } else if (state === 'active') {
      document.getElementById('call-end-btn').onclick = (e) => { e.stopPropagation(); this.hangup('تم الإنهاء', true, 'ended'); };
      document.getElementById('call-mute-btn').onclick = (e) => { e.stopPropagation(); this.toggleMute(); };
      document.getElementById('call-speaker-btn').onclick = (e) => { e.stopPropagation(); this.toggleSpeakerMute(); };
    } else {
      document.getElementById('call-end-btn').onclick = (e) => { e.stopPropagation(); this.hangup('تم الإلغاء', true, 'canceled'); };
    }
  },

  renderCurrentCall() {
    if (this.callId && this.currentState) {
      this.showCallPanel(this.currentState, this.currentStatus);
    }
  },

  makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    const dragStart = (e) => {
      // لا تبدأ السحب إذا كان المستخدم يضغط على الأزرار أو الأيقونات أو عناصر التحكم
      const targetTag = e.target.tagName.toLowerCase();
      if (targetTag === 'button' || targetTag === 'i' || e.target.closest('button')) {
        return;
      }
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      pos3 = clientX; pos4 = clientY;
      
      document.onmouseup = document.ontouchend = dragEnd;
      document.onmousemove = document.ontouchmove = dragMove;
    };

    const dragMove = (e) => {
      if (e.cancelable) e.preventDefault(); // منع التمرير الافتراضي فقط أثناء عملية السحب الفعلية
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      pos1 = pos3 - clientX; pos2 = pos4 - clientY;
      pos3 = clientX; pos4 = clientY;
      
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
    };

    const dragEnd = () => {
      document.onmouseup = document.ontouchend = null;
      document.onmousemove = document.ontouchmove = null;
    };

    el.onmousedown = el.ontouchstart = dragStart;
    el.style.cursor = 'move';
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      const track = this.localStream.getAudioTracks()[0];
      if (track) track.enabled = !this.isMuted;
    }
    
    const btn = document.getElementById('call-mute-btn');
    if (btn) {
      btn.style.backgroundColor = this.isMuted ? '#dc3545' : '#28a745';
      btn.innerHTML = this.isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    }
  },

  toggleSpeakerMute() {
    this.isSpeakerMuted = !this.isSpeakerMuted;
    
    // Mute all remote audio tracks
    if (this.peerConnection) {
      this.peerConnection.getReceivers().forEach(receiver => {
        if (receiver.track && receiver.track.kind === 'audio') {
          receiver.track.enabled = !this.isSpeakerMuted;
        }
      });
    }
    
    const btn = document.getElementById('call-speaker-btn');
    if (btn) {
      btn.style.backgroundColor = this.isSpeakerMuted ? '#dc3545' : '#28a745';
      btn.innerHTML = this.isSpeakerMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    }
  },

  hangup(status, notifyServer = true, reason = 'ended') {
    this.stopRingtone();
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch(e){}
    }
    if (this.localStream) {
      try { this.localStream.getTracks().forEach(t => t.stop()); } catch(e){}
    }
    if (this.remoteAudio) {
      try {
        this.remoteAudio.pause();
        this.remoteAudio.srcObject = null;
      } catch(e){}
      this.remoteAudio = null;
    }
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.callPanel) {
      const statusEl = this.callPanel.querySelector('.call-status');
      if (statusEl) statusEl.innerText = status;
      setTimeout(() => { 
        if (this.callPanel) { 
          this.callPanel.remove(); 
          this.callPanel = null; 
        } 
        const globalPanel = document.getElementById('global-call-slot');
        if (globalPanel) {
          globalPanel.innerHTML = '';
        }
      }, 2000);
    }
    
    if (notifyServer && this.callId) {
      window.socket.emit('pmcall:hangup', { callId: this.callId, reason });
    }
    this.callId = null;
    this.currentState = null;
    this.currentStatus = null;
    this.incomingCaller = null;
    this.currentCallUserId = null;
    this.pendingIceCandidates = [];
  },

  cleanup() {
    // دالة cleanup آمنة تُستدعى لتنظيف المكالمة الحالية دون إرسال إشارات إضافية لعدم التكرار
    this.stopRingtone();
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch(e){}
      this.peerConnection = null;
    }
    if (this.localStream) {
      try { this.localStream.getTracks().forEach(t => t.stop()); } catch(e){}
      this.localStream = null;
    }
    if (this.remoteAudio) {
      try {
        this.remoteAudio.pause();
        this.remoteAudio.srcObject = null;
      } catch(e){}
      this.remoteAudio = null;
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.callPanel) {
      this.callPanel.remove();
      this.callPanel = null;
    }
    const globalPanel = document.getElementById('global-call-slot');
    if (globalPanel) {
      globalPanel.innerHTML = '';
    }
    this.callId = null;
    this.currentState = null;
    this.currentStatus = null;
    this.incomingCaller = null;
    this.currentCallUserId = null;
    this.pendingIceCandidates = [];
    this.isMuted = false;
    this.isSpeakerMuted = false;
  },

  stopRingtone() {
    if (this.ringtone) {
      try {
        this.ringtone.pause();
        this.ringtone.currentTime = 0;
      } catch(e){}
    }
  }
};

window.PrivateCallManager = PrivateCallManager;
