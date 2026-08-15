const fetch = window.apiFetch || window.fetch;

let privateMessageQueue = [];
let privateMessageRAF = null;

export const PrivateChatManager = {
  conversations: new Map(),
  activeChatUser: null,
  socket: null,
  isWindowOpen: false,

  init() {
    this.socket = window.socket;
    if (!this.socket) return;

    this.setupSocketListeners();
    this.renderChatWindowContainer();
    this.updateSidebarBadge();
    
    // Make window draggable
    this.makeDraggable();

    // Load persistent archived conversations
    this.loadArchivedConversations();
  },

  getConvKey(user) {
    if (!user) return '';
    if (typeof window.getPresenceKey === 'function') {
      return window.getPresenceKey(user);
    }
    if (user.key) return user.key;
    const isGuest = user.type === 'guest' || user.isGuest || user.guestId || (typeof user.id === 'number' && user.id < 0) || (user.id && String(user.id).startsWith('g_'));
    if (isGuest) {
      const guestId = user.guestId ?? user.userId ?? user.id ?? user.username;
      return `guest:${guestId}`;
    }
    const memberId = user.userId ?? user.id;
    if (memberId && memberId !== 'unknown' && memberId !== undefined) {
      return `reg:${memberId}`;
    }
    return user.username ? `reg:${user.username}` : 'unknown:0';
  },

  findConversation(userOrKeyOrUsername) {
    if (!userOrKeyOrUsername) return null;
    if (typeof userOrKeyOrUsername === 'object') {
      const key = this.getConvKey(userOrKeyOrUsername);
      for (const [k, conv] of this.conversations.entries()) {
        if (this.getConvKey(conv.user) === key) return conv;
        if (userOrKeyOrUsername.id && (conv.user.id === userOrKeyOrUsername.id || conv.user.userId === userOrKeyOrUsername.id)) return conv;
        if (userOrKeyOrUsername.userId && (conv.user.id === userOrKeyOrUsername.userId || conv.user.userId === userOrKeyOrUsername.userId)) return conv;
        if (userOrKeyOrUsername.username && conv.user.username && conv.user.username.toLowerCase() === userOrKeyOrUsername.username.toLowerCase()) return conv;
      }
      if (userOrKeyOrUsername.username && this.conversations.has(userOrKeyOrUsername.username)) {
        return this.conversations.get(userOrKeyOrUsername.username);
      }
    } else {
      const targetStr = String(userOrKeyOrUsername).toLowerCase();
      for (const [k, conv] of this.conversations.entries()) {
        const cKey = this.getConvKey(conv.user);
        const uId = String(conv.user.userId || conv.user.id || '').toLowerCase();
        const uName = String(conv.user.username || '').toLowerCase();
        if (k === userOrKeyOrUsername || cKey === userOrKeyOrUsername || uName === targetStr || uId === targetStr || targetStr === `reg:${uId}` || targetStr === `member:${uId}` || targetStr === `guest:${uId}`) {
          return conv;
        }
      }
      if (this.conversations.has(userOrKeyOrUsername)) {
        return this.conversations.get(userOrKeyOrUsername);
      }
    }
    return null;
  },

  applyPresenceSnapshot(users) {
    if (!Array.isArray(users)) return;
    
    const onlineKeysSet = new Set();
    const onlineUserIdsSet = new Set();
    const onlineUsernamesSet = new Set();

    users.forEach(u => {
      const k = this.getConvKey(u);
      if (k) onlineKeysSet.add(k);
      if (u.id) onlineUserIdsSet.add(String(u.id));
      if (u.userId) onlineUserIdsSet.add(String(u.userId));
      if (u.username) onlineUsernamesSet.add(String(u.username).toLowerCase());

      const conv = this.findConversation(u);
      if (conv) {
        conv.user = { ...conv.user, ...u, isOnline: true };
      }
    });

    this.conversations.forEach(conv => {
      const cKey = this.getConvKey(conv.user);
      const uId = String(conv.user.userId || conv.user.id || '');
      const uName = String(conv.user.username || '').toLowerCase();

      const isOnlineInSnapshot = (cKey && onlineKeysSet.has(cKey)) ||
                                 (uId && onlineUserIdsSet.has(uId)) ||
                                 (uName && onlineUsernamesSet.has(uName));

      if (!isOnlineInSnapshot && !conv.user.isVirtualUser) {
        conv.user.isOnline = false;
        conv.user.isGhost = false;
        conv.user.isIdle = false;
        conv.user.presenceState = 'offline';
      }
    });

    this.renderSidebar();
  },

  applyPresencePatch(upserts, removes) {
    let updated = false;
    if (Array.isArray(upserts) && upserts.length > 0) {
      upserts.forEach(u => {
        const conv = this.findConversation(u);
        if (conv) {
          conv.user = { ...conv.user, ...u, isOnline: true };
          updated = true;
          this.updateSidebarItem(conv);
        }
      });
    }
    if (Array.isArray(removes) && removes.length > 0) {
      removes.forEach(key => {
        const keyStr = String(key).toLowerCase();
        for (const [username, conv] of this.conversations.entries()) {
          const cKey = this.getConvKey(conv.user);
          const uId = String(conv.user.userId || conv.user.id || '').toLowerCase();
          const uName = String(conv.user.username || '').toLowerCase();

          if (cKey === key || uName === keyStr || uId === keyStr || keyStr === `reg:${uId}` || keyStr === `member:${uId}` || keyStr === `guest:${uId}`) {
            conv.user.isOnline = false;
            conv.user.isGhost = false;
            conv.user.isIdle = false;
            conv.user.presenceState = 'offline';
            updated = true;
            this.updateSidebarItem(conv);
          }
        }
      });
    }
  },

  updateSidebarItem(conv) {
    const container = document.getElementById('sidebar-private-container');
    if (!container) {
      this.renderSidebar();
      return;
    }
    const username = conv.user.username;
    const userId = conv.user.userId || conv.user.id;
    let itemEl = container.querySelector(`[data-username="${username}"]`) || container.querySelector(`[data-user-id="${userId}"]`);
    if (itemEl) {
      const statusSpan = itemEl.querySelector('.rounded-circle');
      if (statusSpan) {
        statusSpan.style.backgroundColor = this.getUserStatusHex(conv.user);
      }
    } else {
      this.renderSidebar();
    }
  },

  getUserStatusHex(u) {
    if (!u) return '#6c757d';
    let color = '#6c757d'; // Offline (gray)
    if (u.isOnline) {
      if (u.isVirtualUser && u.onlineStatusStr) {
        if (u.onlineStatusStr === 'أخضر') color = '#28a745';
        else if (u.onlineStatusStr === 'أحمر') color = '#dc3545';
        else if (u.onlineStatusStr === 'أصفر') color = '#ffc107';
        else if (u.onlineStatusStr === 'أزرق') color = '#007bff';
        else color = '#6c757d';
      } else if (u.isGhost) {
        color = '#6c757d';
      } else if (u.isHidden) {
        color = '#007bff';
      } else if (u.isReconnecting) {
        color = '#ffc107';
      } else {
        color = (u.isIdle || u.presenceState === 'idle') ? '#ffc107' : '#28a745';
      }
    }
    const isActuallyOnline = u.isOnline && !u.isGhost;
    const isYellow = color === '#ffc107';
    if (isActuallyOnline && u.allowPrivate === false && !isYellow) {
      color = '#dc3545';
    }
    return color;
  },

  async loadArchivedConversations() {
    const token = sessionStorage.getItem('token');
    if (!token) return;

    try {
      const sessionParam = window.getClientSessionId ? `?clientSessionId=${encodeURIComponent(window.getClientSessionId())}` : '';
      const res = await fetch(`/api/private/conversations${sessionParam}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch archived conversations');
      const data = await res.json();
      
      if (Array.isArray(data)) {
        data.forEach(conv => {
          const user = conv.user;
          const username = user.username;
          let existing = this.findConversation(user);
          if (!existing) {
            this.conversations.set(username, {
              ...conv,
              user,
              lastMessageTime: new Date(conv.lastMessageTime)
            });
          } else {
            existing.user = { ...existing.user, ...user };
            const existingIds = new Set(existing.messages.map(m => String(m.id)));
            conv.messages.forEach(m => {
              if (!existingIds.has(String(m.id))) {
                existing.messages.push(m);
              }
            });
            existing.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            existing.lastMessageTime = new Date(conv.lastMessageTime);
          }
        });

        this.updateSidebarBadge();
        this.renderSidebar();
      }
    } catch (err) {
      console.error('[PrivateChatManager] Error loading archived conversations:', err);
    }
  },

  typingTimeout: null,

  resetForFreshSession() {
    this.conversations.clear();
    this.activeChatUser = null;
    this.isWindowOpen = false;
    const inner = document.getElementById('private-chat-messages-inner');
    if (inner) inner.innerHTML = '';
    if (typeof this.renderSidebar === 'function') this.renderSidebar();
    if (typeof this.updateSidebarBadge === 'function') this.updateSidebarBadge();
    if (typeof this.closeChat === 'function') { try { this.closeChat(); } catch (e) {} }
  },

  setupSocketListeners() {
    this.socket.on('connect', () => {
      this.loadArchivedConversations();
    });

    this.socket.on('private_message', (data) => {
      this.handleIncomingMessage(data);
    });

    this.socket.on('offline-private-messages', (payload, callback) => {
      if (Array.isArray(payload)) {
        let addedAny = false;
        payload.forEach(data => {
          const added = this.handleIncomingMessage(data);
          if (added) addedAny = true;
        });
        if (addedAny && typeof this.playPingSound === 'function') {
          this.playPingSound();
        }
      }
      if (typeof callback === 'function') {
        callback(true);
      }
    });

    this.socket.on('private_message_sent', (data) => {
      this.handleSentMessage(data);
    });

    this.socket.on('private-conversation-deleted', (data) => {
      const peerName = data && (data.fromUsername || data.peerUsername);
      if (!peerName) return;
      const existing = this.conversations.get(peerName) ||
        Array.from(this.conversations.keys()).find(k => String(k).toLowerCase() === String(peerName).toLowerCase());
      if (existing) this.conversations.delete(existing);
      if (this.activeChatUser && String(this.activeChatUser.username).toLowerCase() === String(peerName).toLowerCase()) {
        this.closeChat();
      }
      this.renderSidebar();
      this.updateSidebarBadge();
      if (typeof this.showToast === 'function') {
        this.showToast(`تم حذف المحادثة الخاصة مع ${peerName}`, 'info');
      }
    });

    this.socket.on('private_message_read', (data) => {
      this.handleMessageRead(data);
    });

    this.socket.on('private_message_deleted', (data) => {
      this.handleMessageDeleted(data);
    });

    this.socket.on('private_message_edited', (data) => {
      this.handleMessageEdited(data);
    });

    this.socket.on('private_typing', (data) => {
      this.handleIncomingTyping(data);
    });

    this.socket.on('private_ping_received', (data) => {
      this.handlePingReceived(data);
    });
  },

  handlePingReceived(data) {
    const { fromUser } = data;
    
    // Don't ping yourself
    if (fromUser.username === window.state?.currentUser?.username) return;

    // Play sound
    this.playPingSound();

    // Open chat if not open
    this.openChat(fromUser);

    // Shake window
    const chatWindow = document.getElementById('private-chat-window');
    if (chatWindow) {
      chatWindow.classList.remove('chat-nudge');
      void chatWindow.offsetWidth; // trigger reflow
      chatWindow.classList.add('chat-nudge');
      setTimeout(() => chatWindow.classList.remove('chat-nudge'), 500);
    }

    // Add system message
    const conv = this.conversations.get(fromUser.username);
    if (conv) {
      const pingMsg = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text: 'قام بإرسال تنبيه (Ping) لك!',
        type: 'system',
        timestamp: new Date().toISOString(),
        isMine: false
      };
      conv.messages.push(pingMsg);
      if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === fromUser.username) {
        this.appendMessage(pingMsg, conv);
      }
    }
  },

  playPingSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq / 2, startTime + duration);
        gain.gain.setValueAtTime(1, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = ctx.currentTime;
      playTone(800, now, 0.15);
      playTone(600, now + 0.1, 0.2);
    } catch(e) {
      console.debug('AudioContext not supported');
    }
  },

  lastTypingTime: 0,

  handleTyping() {
    if (!this.activeChatUser || !this.socket) return;
    
    const now = Date.now();
    if (now - this.lastTypingTime > 1500) {
      this.socket.emit('private_typing', { targetUsername: this.activeChatUser.username });
      this.lastTypingTime = now;
    }
  },

  handleIncomingTyping(data) {
    const { byUsername } = data;

    // Don't show typing for yourself
    if (byUsername === window.state?.currentUser?.username) return;

    const conv = this.conversations.get(byUsername);
    if (conv) {
      conv.isTyping = true;
      if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
        this.updateTypingIndicator(true);
      }
      
      // Clear typing indicator after 3 seconds
      if (conv.typingTimer) clearTimeout(conv.typingTimer);
      conv.typingTimer = setTimeout(() => {
        conv.isTyping = false;
        if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
          this.updateTypingIndicator(false);
        }
      }, 3000);
    }
  },

  updateTypingIndicator(isTyping) {
    const container = document.getElementById('private-chat-messages-inner');
    if (!container) return;
    
    let indicator = container.querySelector('.private-msg-typing');
    
    if (isTyping && !indicator) {
      const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      indicator = document.createElement('div');
      indicator.className = 'd-flex align-items-center justify-content-start ps-2 private-msg-typing';
      indicator.style = 'height: 30px; margin: 0; padding: 0;';
      indicator.innerHTML = `
          <div class="d-flex align-items-center gap-1 px-2 py-1 bg-light rounded-pill text-muted small shadow-sm my-1">
            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px;" role="status"></span>
            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px; animation-delay: 0.2s;" role="status"></span>
            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px; animation-delay: 0.4s;" role="status"></span>
            <span class="ms-1" style="font-size: 11px;">يكتب الآن...</span>
          </div>
      `;
      container.appendChild(indicator);
      if (wasNearBottom) {
        this.scrollToBottom();
      }
    } else if (!isTyping && indicator) {
      indicator.remove();
    }
  },

  handleMessageRead(data) {
    const { byUsername, messageIds } = data;
    const conv = this.conversations.get(byUsername);
    if (conv) {
      conv.messages.forEach(msg => {
        if (messageIds.includes(msg.id)) {
          msg.status = 'read';
        }
      });
      if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
        messageIds.forEach(id => {
           const el = document.querySelector(`.private-msg-item[data-id="${id}"] .fa-check, .private-msg-item[data-id="${id}"] .fa-check-double`);
           if (el) {
              el.className = 'fas fa-check-double text-primary ms-1';
           }
        });
      }
    }
  },

  handleMessageDeleted(data) {
    const { byUsername, messageId } = data;
    const conv = this.conversations.get(byUsername);
    if (conv) {
      conv.messages = conv.messages.filter(msg => String(msg.id) !== String(messageId));
      if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
        this.renderMessages();
      }
      this.renderSidebar();
    }
  },

  handleMessageEdited(data) {
    const { byUsername, messageId, newText } = data;
    const conv = this.conversations.get(byUsername);
    if (conv) {
      const msg = conv.messages.find(m => String(m.id) === String(messageId));
      if (msg) {
        msg.text = newText;
        if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
          this.renderMessages();
        }
        this.renderSidebar();
      }
    }
  },

  handleIncomingMessage(data) {
    const { fromUser, message } = data;
    const username = fromUser.username;

    if (!this.conversations.has(username)) {
      this.conversations.set(username, {
        user: fromUser,
        messages: [],
        unreadCount: 0,
        lastMessageTime: new Date()
      });
    }

    const conv = this.conversations.get(username);
    
    // Self-chat check: if we already have this message ID, don't add it again
    if (message.id && conv.messages.some(m => String(m.id) === String(message.id))) {
      return false;
    }

    const newMessage = { ...message, isMine: false };
    conv.messages.push(newMessage);
    conv.lastMessageTime = new Date(message.timestamp);

    if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === username) {
      // Chat is open, mark as read
      this.appendMessage(newMessage, conv);
      
      // Send read receipt
      if (this.socket) {
        this.socket.emit('private_message_read', {
          targetUsername: username,
          messageIds: [message.id]
        });
      }
    } else if (username !== window.state?.currentUser?.username) {
      conv.unreadCount++;
      this.updateSidebarBadge();
      
      // If private tab is not open, show toast or badge
      if (window.state && window.state.activeSidebarTab !== 'private') {
        const privateBtn = document.getElementById('private-tab-btn');
        if (privateBtn) {
          let badge = privateBtn.querySelector('.private-badge');
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'badge rounded-pill bg-danger private-badge ms-1';
            badge.style.fontSize = '0.7rem';
            privateBtn.appendChild(badge);
          }
          const unreadConversations = Array.from(this.conversations.values()).filter(c => c.unreadCount > 0).length;
          badge.innerText = unreadConversations > 99 ? '+99' : unreadConversations;
        }
      }
    }

    this.renderSidebar();
    return true;
  },

  handleSentMessage(data) {
    const { toUsername, message, targetUser } = data;
    
    if (!this.conversations.has(toUsername)) {
      this.conversations.set(toUsername, {
        user: targetUser,
        messages: [],
        unreadCount: 0,
        lastMessageTime: new Date()
      });
    }

    const conv = this.conversations.get(toUsername);

    // Self-chat check: if we already have this message ID, don't add it again
    if (message.id && conv.messages.some(m => String(m.id) === String(message.id))) {
      // Update isMine to true if it already existed (from incoming handler) 
      // so it shows on the right side if it was sent by the user
      const existing = conv.messages.find(m => String(m.id) === String(message.id));
      if (existing) existing.isMine = true;
      return;
    }

    const newMessage = { ...message, isMine: true };
    conv.messages.push(newMessage);
    conv.lastMessageTime = new Date(message.timestamp);

    if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === toUsername) {
      this.appendMessage(newMessage, conv);
    }

    this.renderSidebar();
  },

  updateSidebarBadge() {
    const unreadConversations = Array.from(this.conversations.values()).filter(c => c.unreadCount > 0).length;
    const privateBtn = document.getElementById('private-tab-btn');
    if (privateBtn) {
      let badge = privateBtn.querySelector('.private-badge');
      if (unreadConversations > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'badge rounded-pill bg-danger private-badge ms-1';
          badge.style.fontSize = '0.7rem';
          privateBtn.appendChild(badge);
        }
        badge.innerText = unreadConversations > 99 ? '+99' : unreadConversations;
      } else if (badge) {
        badge.remove();
      }
    }
  },

  openChat(user) {
    if (!user) return;
    
    this.activeChatUser = user;
    this.isWindowOpen = true;

    if (!this.conversations.has(user.username)) {
      this.conversations.set(user.username, {
        user: user,
        messages: [],
        unreadCount: 0,
        lastMessageTime: new Date()
      });
    }

    const conv = this.conversations.get(user.username);
    
    // Fetch archived messages from database asynchronously to restore history on demand
    const peerType = user.type || (user.isGuest ? 'guest' : 'user');
    const peerId = user.id || user.userId || user.username;
    const token = sessionStorage.getItem('token');
    if (token) {
      const sessionParam = window.getClientSessionId ? `?clientSessionId=${encodeURIComponent(window.getClientSessionId())}` : '';
      fetch(`/api/private/messages/${peerType}/${peerId}${sessionParam}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(res => {
        if (!res.ok) {
          // Fallback to username endpoint
          return fetch(`/api/private/messages-by-username/${user.username}${sessionParam}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
        }
        return res;
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const existingIds = new Set(conv.messages.map(m => String(m.id)));
          let updated = false;
          data.forEach(msg => {
            if (!existingIds.has(String(msg.id))) {
              conv.messages.push(msg);
              updated = true;
            }
          });
          if (updated) {
            conv.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === user.username) {
              this.renderMessages();
              this.scrollToBottom();
            }
          }
        }
      })
      .catch(err => console.error('[PrivateChatManager] Error loading chat history:', err));
    }

    // Send read receipts for unread messages
    if (conv.unreadCount > 0 && this.socket) {
      const unreadIds = conv.messages.filter(m => !m.isMine && m.status !== 'read').map(m => m.id);
      if (unreadIds.length > 0) {
        this.socket.emit('private_message_read', {
          targetUsername: user.username,
          messageIds: unreadIds
        });
        conv.messages.forEach(m => {
          if (!m.isMine) m.status = 'read';
        });
      }
    }
    
    conv.unreadCount = 0;
    this.updateSidebarBadge();
    this.renderSidebar();

    const chatWindow = document.getElementById('private-chat-window');
    if (chatWindow) {
      chatWindow.style.setProperty('display', 'flex', 'important');
      
      // Update header
      const headerName = document.getElementById('private-chat-name');
      const headerAvatar = document.getElementById('private-chat-avatar');
      const headerId = document.getElementById('private-chat-id');
      
      if (headerName) {
        headerName.innerHTML = window.renderUserIdentity(user, {
          onClick: `window.showUserProfile('${user.username}')`,
          tag: 'span',
          containerStyle: 'cursor: pointer;'
        });
      }
      
      if (headerAvatar) {
        headerAvatar.src = window.getAvatarUrl ? window.getAvatarUrl(user) : '/uploads/site/default.png';
        headerAvatar.onerror = function() { window.handleAvatarError(this); };
        headerAvatar.style.cursor = 'pointer';
        headerAvatar.onclick = () => window.showUserProfile(user.username);
      }
      if (headerId) headerId.innerText = `#${Math.abs(Number(user.id || Math.floor(Math.random() * 1000)))}`; // Fallback if ID is not available
      
      this.renderMessages();
      if (typeof window.applyRoomMessagesNightMode === 'function') {
        window.applyRoomMessagesNightMode();
      }
      if (window.PrivateCallManager) window.PrivateCallManager.renderCurrentCall();
      this.scrollToBottom();
      
      const input = document.getElementById('private-chat-input');
      if (input) {
        input.focus();
        // Add auto-resize listeners
        input.addEventListener('input', () => {
          this.handleTyping();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });
      }

      // Close sidebar ONLY on mobile/small screens when a chat is opened
      if (window.innerWidth <= 768) {
        const closeBtn = document.getElementById('close-sidebar');
        if (closeBtn) closeBtn.click();
      }
    }
  },

  closeChat() {
    this.isWindowOpen = false;
    this.activeChatUser = null;
    const chatWindow = document.getElementById('private-chat-window');
    if (chatWindow) {
      chatWindow.style.setProperty('display', 'none', 'important');
    }
  },

  minimizeChat() {
    this.isWindowOpen = false;
    const chatWindow = document.getElementById('private-chat-window');
    if (chatWindow) {
      chatWindow.style.setProperty('display', 'none', 'important');
    }
  },

  isMaximized: false,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  recordingTimer: null,
  recordingSeconds: 0,

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording(true);
    } else {
      this.startRecording();
    }
  },

  startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.showToast) window.showToast('متصفحك لا يدعم تسجيل الصوت', 'error');
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];
        
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          if (this.audioChunks.length > 0) {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            this.uploadVoice(audioBlob);
          }
          
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        this.recordingSeconds = 0;
        this.updateRecordingUI(true);
        
        this.recordingTimer = setInterval(() => {
          this.recordingSeconds++;
          const timerEl = document.getElementById('private-recording-timer');
          if (timerEl) {
            const mins = Math.floor(this.recordingSeconds / 60);
            const secs = this.recordingSeconds % 60;
            timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
          }
        }, 1000);
      })
      .catch(err => {
        console.error('Error accessing microphone:', err);
        if (window.showToast) window.showToast('لا يمكن الوصول للميكروفون', 'error');
      });
  },

  stopRecording(send = true) {
    if (this.mediaRecorder && this.isRecording) {
      if (!send) {
        this.mediaRecorder.onstop = () => {
          this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        };
      }
      this.mediaRecorder.stop();
      this.isRecording = false;
      clearInterval(this.recordingTimer);
      this.updateRecordingUI(false);
    }
  },

  cancelRecording() {
    this.stopRecording(false);
  },

  updateRecordingUI(isRecording) {
    const input = document.getElementById('private-chat-input');
    const micBtn = document.getElementById('private-mic-btn');
    const recordingOverlay = document.getElementById('private-recording-overlay');
    
    if (isRecording) {
      input.classList.add('d-none');
      recordingOverlay.classList.remove('d-none');
      recordingOverlay.classList.add('d-flex');
      micBtn.classList.add('text-danger', 'recording-pulse');
    } else {
      input.classList.remove('d-none');
      recordingOverlay.classList.add('d-none');
      recordingOverlay.classList.remove('d-flex');
      micBtn.classList.remove('text-danger', 'recording-pulse');
    }
  },

  uploadVoice(blob) {
    const formData = new FormData();
    const filename = `voice-${Date.now()}.webm`;
    formData.append('file', blob, filename);

    fetch('/api/upload/voice', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if (data.url) {
        this.socket.emit('private_message', {
          targetUsername: this.activeChatUser.username,
          message: {
            text: '',
            type: 'audio',
            fileUrl: data.url
          }
        });
      }
    })
    .catch(err => {
      console.error('Error uploading voice:', err);
      if (window.showToast) window.showToast('حدث خطأ أثناء إرسال التسجيل', 'error');
    });
  },

  toggleMaximize() {
    const chatWindow = document.getElementById('private-chat-window');
    const maximizeBtn = document.getElementById('private-chat-maximize-btn');
    if (!chatWindow || !maximizeBtn) return;

    this.isMaximized = !this.isMaximized;
    
    if (this.isMaximized) {
      chatWindow.classList.add('maximized');
      maximizeBtn.innerHTML = '';
      maximizeBtn.appendChild(secureCreateElement('i', { class: 'fas fa-compress' }));

      maximizeBtn.title = 'تصغير';
    } else {
      chatWindow.classList.remove('maximized');
      maximizeBtn.innerHTML = '<i class="fas fa-expand"></i>';
      maximizeBtn.title = 'تكبير';
    }
    
    this.scrollToBottom();
  },

  deleteConversation(username, event) {
    event.stopPropagation();
    if (confirm('هل أنت متأكد من حذف هذه المحادثة؟')) {
      const conv = this.conversations.get(username);
      const peerId = conv?.user?.id || null;
      const peerType = conv?.user?.type || 'user';

      this.conversations.delete(username);
      this.renderSidebar();
      if (this.activeChatUser && this.activeChatUser.username === username) {
        this.closeChat();
      }

      // Notify the server asynchronously about the deletion
      const token = sessionStorage.getItem('token');
      if (token) {
        fetch('/api/private/conversations/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            peerUsername: username,
            peerType,
            peerId
          })
        })
        .catch(err => console.error('[PrivateChatManager] Error deleting conversation on server:', err));
      }
    }
  },

  renderSidebar() {
    const container = document.getElementById('sidebar-private-container');
    if (!container) return;
    
    // Sync live user states from global online users if available
    const liveUsers = (window.state && window.state.currentUsers) || window.onlineUsers;
    if (Array.isArray(liveUsers)) {
      this.conversations.forEach(conv => {
        const liveUser = liveUsers.find(u => 
          (conv.user.id && u.id && Number(conv.user.id) === Number(u.id)) ||
          (conv.user.userId && u.userId && Number(conv.user.userId) === Number(u.userId)) ||
          (conv.user.username && u.username && conv.user.username.toLowerCase() === u.username.toLowerCase())
        );
        if (liveUser) {
          conv.user = { ...conv.user, ...liveUser, isOnline: true };
        } else if (!conv.user.isVirtualUser) {
          conv.user.isOnline = false;
          conv.user.isGhost = false;
          conv.user.isIdle = false;
          conv.user.presenceState = 'offline';
        }
      });
    }

    // Clear existing content
    container.innerHTML = '';

    const convs = Array.from(this.conversations.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);

    if (convs.length === 0) {
      container.innerHTML = '<div class="p-4 text-center text-muted">لا توجد محادثات خاصة حالياً</div>';
      return;
    }

    let html = '<div class="list-group list-group-flush">';
    convs.forEach(conv => {
      const user = conv.user;
      const avatar = window.getAvatarUrl ? window.getAvatarUrl(user) : '/uploads/site/default.png';
      const name = user.topic || user.username;
      const lastMsg = conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null;
      let lastMsgText = 'بدء المحادثة';
      if (lastMsg) {
        if (lastMsg.type === 'image') lastMsgText = '📷 صورة';
        else if (lastMsg.type === 'file') lastMsgText = '📎 ملف';
        else if (lastMsg.type === 'video') lastMsgText = '🎥 فيديو';
        else {
          const rawText = (lastMsg.text || '').trim();
          if (rawText) {
            // Render placeholders/shortcuts for the preview
            if (window.replacePlaceholders && window.replaceShortcuts && window.escapeHTML) {
               lastMsgText = window.replacePlaceholders(window.replaceShortcuts(window.escapeHTML(rawText)));
            } else {
               lastMsgText = rawText;
            }
          } else {
            lastMsgText = 'بدء المحادثة';
          }
        }
      }
      
      const timeStr = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
      const unreadBadge = conv.unreadCount > 0 ? `<span class="badge bg-danger rounded-pill">${conv.unreadCount}</span>` : '';
      
      const statusHex = this.getUserStatusHex(user);
 
      const wrapper = secureCreateElement('div', { class: 'list-group-item d-flex align-items-center p-2 border-bottom', style: 'cursor: pointer;', 'data-username': user.username, 'data-user-id': user.userId || user.id });
      wrapper.onclick = (e) => {
          e.stopPropagation();
          window.PrivateChatManager.openChatByUsername(user.username);
      };
 
      const imgWrapper = secureCreateElement('div', { class: 'position-relative me-2' });
      const img = secureCreateElement('img', { src: avatar, class: 'rounded', width: '40', height: '40', style: 'object-fit: cover;', onerror: 'window.handleAvatarError(this)' });
      const statusSpan = secureCreateElement('span', { class: `position-absolute bottom-0 end-0 border border-light rounded-circle`, style: `width: 10px; height: 10px; background-color: ${statusHex};` });
      imgWrapper.appendChild(img);
      imgWrapper.appendChild(statusSpan);
      
      const contentWrapper = secureCreateElement('div', { class: 'flex-grow-1 min-width-0 text-end' });
      const headerDiv = secureCreateElement('div', { class: 'd-flex justify-content-between align-items-baseline mb-1' });
      
      const userIdentityHtml = window.renderUserIdentity(user, {
        nameStyle: `font-size: 0.9rem; font-weight: bold; color: ${user.ucol || '#333'};`,
        containerStyle: 'max-width: 150px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'
      });
      
      const nameContainer = secureCreateElement('div', { class: 'mb-0' });
      nameContainer.innerHTML = userIdentityHtml;
      
      const timeSmall = secureCreateElement('small', { class: 'text-muted', style: 'font-size: 0.7rem;' }, timeStr);
      headerDiv.appendChild(nameContainer);
      headerDiv.appendChild(timeSmall);
      
      const bodyDiv = secureCreateElement('div', { class: 'd-flex justify-content-between align-items-center' });
      const msgSmall = secureCreateElement('small', { class: 'text-muted text-truncate d-block private-sidebar-preview', style: 'max-width: 150px;' });
      msgSmall.innerHTML = lastMsgText;
      const actionsDiv = secureCreateElement('div', { class: 'd-flex align-items-center gap-2' });
      
      if (conv.unreadCount > 0) {
          const badge = secureCreateElement('span', { class: 'badge bg-danger rounded-pill' }, conv.unreadCount.toString());
          actionsDiv.appendChild(badge);
      }
      
      const delBtn = secureCreateElement('button', { class: 'btn btn-sm btn-outline-danger p-0 px-1', title: 'حذف المحادثة' });
      delBtn.appendChild(secureCreateElement('i', { class: 'fas fa-trash-alt' }));
      delBtn.onclick = (e) => {
          e.stopPropagation();
          window.PrivateChatManager.deleteConversation(user.username, e);
      };
      
      actionsDiv.appendChild(delBtn);
      
      bodyDiv.appendChild(msgSmall);
      bodyDiv.appendChild(actionsDiv);
      
      contentWrapper.appendChild(headerDiv);
      contentWrapper.appendChild(bodyDiv);
      
      wrapper.appendChild(imgWrapper);
      wrapper.appendChild(contentWrapper);
      
      container.appendChild(wrapper);
    });
  },

  openChatByUsername(username) {
    const conv = this.conversations.get(username);
    if (conv) {
      this.openChat(conv.user);
    }
  },

  renderSingleMessage(msg, conv) {
    if (msg.type === 'system') {
      return `<div class="text-center text-muted my-2 small fw-bold" style="background: #f8f9fa; padding: 4px; border-radius: 4px; margin: 0 10px;">${msg.text}</div>`;
    }

    const isMine = msg.isMine;
    const now = new Date();
    const msgTime = new Date(msg.timestamp);
    const diffMs = now - msgTime;
    const diffMins = Math.floor(diffMs / 60000);
    let timeStr = '';
    if (diffMins < 1) {
      timeStr = 'الآن';
    } else if (diffMins < 60) {
      timeStr = `${diffMins}د`;
    } else if (diffMins < 1440) {
      timeStr = `${Math.floor(diffMins / 60)}س`;
    } else {
      timeStr = `${Math.floor(diffMins / 1440)}ي`;
    }
    
    let contentHtml = '';
    if (msg.type === 'image') {
      contentHtml = `<div style="text-align: left;"><img src="${msg.fileUrl}" class="img-fluid rounded mt-1 private-msg-image" style="max-width: 200px; max-height: 150px; object-fit: contain; cursor: pointer;" onclick="window.openLightbox('${msg.fileUrl}')"></div>`;
    } else if (msg.type === 'video') {
      contentHtml = `
        <div class="private-msg-video mt-1" style="width: 200px; position: relative; cursor: pointer;" onclick="window.openVideoLightbox('${msg.fileUrl}')">
          <video src="${msg.fileUrl}" style="width: 100%; height: 150px; object-fit: contain; background: #000; border-radius: 8px;"></video>
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); color: white; padding: 5px 10px; border-radius: 50%;">
            <i class="fas fa-play"></i>
          </div>
        </div>
      `;
    } else if (msg.type === 'file') {
      contentHtml = `<a href="${msg.fileUrl}" target="_blank" class="btn btn-sm btn-light d-flex align-items-center gap-2 private-msg-file"><i class="fas fa-file-download"></i> تحميل الملف</a>`;
    } else if (msg.type === 'audio') {
      contentHtml = `
        <div class="private-msg-audio">
          <audio controls style="width: 100%; height: 30px;">
            <source src="${msg.fileUrl}" type="audio/webm">
            متصفحك لا يدعم مشغل الصوت.
          </audio>
        </div>
      `;
    }

    if (msg.type !== 'text' && msg.text) {
      contentHtml += `<div class="private-msg-text mt-1">${this.formatMessage(msg.text)}</div>`;
    } else if (msg.type === 'text') {
      contentHtml = `<div class="private-msg-text">${this.formatMessage(msg.text)}</div>`;
    }

    let statusHtml = '';
    if (isMine) {
      if (msg.status === 'read') {
        statusHtml = '<i class="fas fa-check-double text-primary ms-1" style="font-size: 0.7rem;"></i>';
      } else if (msg.status === 'delivered') {
        statusHtml = '<i class="fas fa-check-double text-secondary ms-1" style="font-size: 0.7rem;"></i>';
      } else {
        statusHtml = '<i class="fas fa-check text-secondary ms-1" style="font-size: 0.7rem;"></i>';
      }
    }

    const rawUser = isMine ? window.state.currentUser : conv.user;
    const user = { ...rawUser };

    const avatarUrl = window.getAvatarUrl ? window.getAvatarUrl(user) : '/uploads/site/default.png';
    const username = user.topic || user.username;
    const fontColor = user.fontColor || '#333';
    
    const userBgStyle = user.bg ? ((user.bg.startsWith('http') || user.bg.startsWith('/')) ? `background: url('${user.bg}') center / cover;` : `background: ${user.bg};`) : 'background: transparent;';
    const usernamePadding = user.bg ? 'padding: 2px 6px; border-radius: 3px;' : '';

    const safeUsername = window.escapeHTML ? window.escapeHTML(user.username) : user.username;

    let nameStyle = `font-weight: bold; font-size: 1rem; color: ${user.ucol || '#333'};`;

    return `
      <div class="private-msg-item" data-id="${msg.id || ''}">
        <div class="d-flex flex-column align-items-start justify-content-between p-2" style="width: 60px; flex-shrink: 0;">
          <div class="d-flex align-items-center">
            <span class="private-msg-time text-muted">${timeStr}</span>
            ${statusHtml}
          </div>
          ${isMine && msg.type === 'text' ? `
          <div class="private-msg-actions d-flex gap-1 mt-auto">
            <button class="private-btn-msg-action border-0 p-0 d-flex align-items-center justify-content-center" style="background: #e74c3c; color: white; width: 22px; height: 22px; border-radius: 3px; cursor: pointer; position: relative; z-index: 10;" onclick="window.PrivateChatManager.deleteMessage('${msg.id}')" title="حذف"><i class="fas fa-times" style="font-size: 0.7rem; pointer-events: none;"></i></button>
            <button class="private-btn-msg-action border-0 p-0 d-flex align-items-center justify-content-center" style="background: #fff; color: #666; width: 22px; height: 22px; border-radius: 3px; border: 1px solid #ddd !important; cursor: pointer; position: relative; z-index: 10;" onclick="window.PrivateChatManager.editMessage('${msg.id}')" title="تعديل"><i class="fas fa-edit" style="font-size: 0.7rem; pointer-events: none;"></i></button>
          </div>
          ` : ''}
        </div>
        
        <div class="private-msg-body">
          <div class="private-msg-header">
            ${window.renderUserIdentity(user, {
              nameStyle: nameStyle,
              onClick: `window.showUserProfile('${safeUsername}')`,
              containerStyle: 'cursor: pointer;'
            })}
          </div>
          ${msg.replyTo ? `
          <div class="private-msg-quote">
            <div class="fw-bold text-primary" style="font-size: 0.8rem;">${window.escapeHTML ? window.escapeHTML(msg.replyTo.username) : msg.replyTo.username}</div>
            ${msg.replyTo.type === 'image' ? `
              <div class="mt-1"><img src="${msg.replyTo.fileUrl}" style="max-height: 40px; border-radius: 2px;"></div>
            ` : `
              <div class="text-truncate text-muted">${this.formatMessage(msg.replyTo.text)}</div>
            `}
          </div>
          ` : ''}
          ${contentHtml}
        </div>
        
        <div style="width: 50px; flex-shrink: 0; display: flex; justify-content: center;">
          <img src="${avatarUrl}" class="private-msg-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${safeUsername}" onerror="window.handleAvatarError(this)">
        </div>
      </div>
    `;
  },

  appendMessage(msg, conv) {
    privateMessageQueue.push({ msg, conv });
    this.schedulePrivateMessageRender();
  },

  schedulePrivateMessageRender() {
    if (privateMessageRAF) return;
    privateMessageRAF = requestAnimationFrame(() => {
      privateMessageRAF = null;
      if (privateMessageQueue.length === 0) return;

      const messagesContainer = document.getElementById('private-chat-messages-inner');
      if (!messagesContainer) {
        privateMessageQueue = [];
        return;
      }

      const messagesToProcess = [...privateMessageQueue];
      privateMessageQueue = [];

      const startMsg = messagesContainer.querySelector('.text-center.text-muted');
      if (startMsg && startMsg.innerText === 'بدء المحادثة') {
        startMsg.remove();
      }

      const wasNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 80;
      const fragment = document.createDocumentFragment();

      messagesToProcess.forEach(({ msg, conv }) => {
        if (msg.id) {
          const existing = messagesContainer.querySelector(`[data-id="${msg.id}"]`);
          if (existing) return;
          const inFragment = fragment.querySelector(`[data-id="${msg.id}"]`);
          if (inFragment) return;
        }

        const temp = document.createElement('div');
        temp.innerHTML = this.renderSingleMessage(msg, conv).trim();
        const el = temp.firstElementChild;
        if (el) {
          fragment.appendChild(el);
        }
      });

      if (fragment.children.length > 0) {
        const typingIndicator = messagesContainer.querySelector('.private-msg-typing');
        if (typingIndicator) {
          messagesContainer.insertBefore(fragment, typingIndicator);
        } else {
          messagesContainer.appendChild(fragment);
        }

        if (wasNearBottom) {
          this.scrollToBottom();
        }
      }
    });
  },

  renderMessages() {
    const messagesContainer = document.getElementById('private-chat-messages-inner');
    if (!messagesContainer || !this.activeChatUser) return;
    
    // Clear existing messages
    messagesContainer.innerHTML = '';

    const conv = this.conversations.get(this.activeChatUser.username);
    if (!conv || conv.messages.length === 0) {
      messagesContainer.innerHTML = '<div class="text-center text-muted my-4 small">بدء المحادثة</div>';
      return;
    }

    let html = '';
    conv.messages.forEach(msg => {
      html += this.renderSingleMessage(msg, conv);
    });

    if (conv.isTyping) {
      html += `
        <div class="d-flex align-items-center justify-content-start ps-2 private-msg-typing" style="height: 30px; margin: 0; padding: 0;">
          <div class="d-flex align-items-center gap-1 px-2 py-1 bg-light rounded-pill text-muted small shadow-sm my-1">
            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px;" role="status"></span>
            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px; animation-delay: 0.2s;" role="status"></span>
            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px; animation-delay: 0.4s;" role="status"></span>
            <span class="ms-1" style="font-size: 11px;">يكتب الآن...</span>
          </div>
        </div>
      `;
    }

    messagesContainer.innerHTML = html;
  },

  formatMessage(text) {
    if (!text) return '';
    
    // Unified escaping using window.escapeHTML
    let formatted = window.escapeHTML ? window.escapeHTML(text) : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    
    // Advance Safe Linkification (Phase 6)
    formatted = window.safeLinkify ? window.safeLinkify(formatted) : formatted;
    
    // Process Shortcuts (ه1 etc) - Added to ensure they work in private chat
    if (window.replaceShortcuts) {
      formatted = window.replaceShortcuts(formatted);
    }

    // Use the unified replacement logic from main.js (handles __SMILEY and __SHT)
    if (window.replacePlaceholders) {
      formatted = window.replacePlaceholders(formatted);
    } else {
      // Fallback for shortcut placeholders if replacePlaceholders is missing
      formatted = formatted.replace(/__SHT\|([^|]*)\|([\s\S]*?)__SHT/g, (match, key, val) => {
        return `<span class="shortcut-text" title="${key}">${val}</span>`;
      });
      formatted = formatted.replace(/__SMILEY\|(.*?)\|(.*?)\|(.*?)\|(.*?)\|(.*?)__/g, (match, url, width, height, name, type) => {
        const className = type === 'sticker' ? 'sticker-img' : 'smiley-img';
        const style = width && height ? `style="width: ${width}; height: ${height};"` : '';
        return `<img src="${url}" class="${className}" ${style} alt="" loading="lazy">`;
      });
    }
    
    return formatted;
  },

  currentReply: null,
  lastPingSentTime: 0,

  sendPing() {
    if (!this.activeChatUser || !this.socket) return;
    
    const now = Date.now();
    if (now - this.lastPingSentTime < 5000) {
      if (window.showToast) window.showToast('يرجى الانتظار قليلاً قبل إرسال تنبيه آخر', 'warning');
      return;
    }
    this.lastPingSentTime = now;

    this.socket.emit('private_ping', {
      targetUsername: this.activeChatUser.username
    });

    const conv = this.conversations.get(this.activeChatUser.username);
    if (conv) {
      const pingMsg = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text: 'لقد قمت بإرسال تنبيه!',
        type: 'system',
        timestamp: new Date().toISOString(),
        isMine: true
      };
      conv.messages.push(pingMsg);
      this.appendMessage(pingMsg, conv);
    }
  },

  setReply(msgId, msgText, msgUsername, msgType = 'text', msgFileUrl = null) {
    this.currentReply = { id: msgId, text: msgText, username: msgUsername, type: msgType, fileUrl: msgFileUrl };
    const preview = document.getElementById('private-chat-reply-preview');
    const nameEl = document.getElementById('private-chat-reply-name');
    const textEl = document.getElementById('private-chat-reply-text');
    const input = document.getElementById('private-chat-input');
    
    if (preview && nameEl && textEl) {
      nameEl.innerText = msgUsername;
      if (msgType === 'image') {
        textEl.innerHTML = `<img src="${msgFileUrl}" style="max-height: 40px; border-radius: 2px;">`;
      } else {
        textEl.innerText = msgText;
      }
      preview.classList.remove('d-none');
    }
    if (input) input.focus();
  },

  cancelReply() {
    this.currentReply = null;
    const preview = document.getElementById('private-chat-reply-preview');
    if (preview) preview.classList.add('d-none');
  },

  sendMessage() {
    if (!this.activeChatUser || !this.socket) return;
    
    const input = document.getElementById('private-chat-input');
    let text = input.value.trim();
    
    if (!text) return;

    const msgId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    this.socket.emit('private_message', {
      targetUsername: this.activeChatUser.username,
      message: {
        id: msgId,
        text: text,
        type: 'text',
        replyTo: this.currentReply
      }
    });

    input.value = '';
    this.cancelReply();
    input.focus();
  },

  editMessage(messageId) {
    if (!this.activeChatUser || !this.socket) return;
    
    const conv = this.conversations.get(this.activeChatUser.username);
    if (!conv) return;
    
    const message = conv.messages.find(m => String(m.id) === String(messageId));
    if (!message) {
      console.warn('Message not found for edit:', messageId);
      return;
    }
    
    const oldText = message.text;

    Swal.fire({
      title: 'تعديل الرسالة',
      input: 'textarea',
      inputValue: oldText,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      inputValidator: (value) => {
        if (!value || value.trim() === '') {
          return 'لا يمكن أن تكون الرسالة فارغة!';
        }
      },
      didOpen: () => {
        const container = Swal.getContainer();
        if (container) container.style.zIndex = '3000';
      }
    }).then((result) => {
      if (result.isConfirmed) {
        let newText = result.value.trim();
        
        if (newText !== oldText) {
          this.socket.emit('private_message_edit', {
            targetUsername: this.activeChatUser.username,
            messageId: messageId,
            newText: newText
          });
          
          // Optimistic update
          message.text = newText;
          this.renderMessages();
        }
      }
    });
  },

  deleteMessage(messageId) {
    if (!this.activeChatUser || !this.socket) return;
    
    this.socket.emit('private_message_delete', {
      targetUsername: this.activeChatUser.username,
      messageId: messageId
    });
    
    // Optimistic update
    const conv = this.conversations.get(this.activeChatUser.username);
    if (conv) {
      conv.messages = conv.messages.filter(m => String(m.id) !== String(messageId));
      this.renderMessages();
    }
  },

  sendFile(file, type) {
    if (!this.activeChatUser || !this.socket) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Using existing upload endpoint
    fetch('/api/upload/pmfiles', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` },
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if (data.url) {
        this.socket.emit('private_message', {
          targetUsername: this.activeChatUser.username,
          message: {
            text: '',
            type: type,
            fileUrl: data.url
          }
        });
      }
    })
    .catch(err => {
      console.error('Error uploading file:', err);
      if (window.showToast) window.showToast('حدث خطأ أثناء رفع الملف', 'error');
    });
  },

  scrollToBottom() {
    const container = document.getElementById('private-chat-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  },

  renderChatWindowContainer() {
    if (document.getElementById('private-chat-window')) return;

    const html = `
      <div id="private-chat-window" class="private-chat-window d-flex flex-column" style="display: none !important; border: 1px solid #333; overflow: hidden; border-radius: 2px;">
        <div class="private-chat-header d-flex justify-content-between align-items-stretch" id="private-chat-header" style="background: #333; color: #fff; cursor: move; height: 35px;">
          <div class="d-flex align-items-center">
            <div style="background: #555; padding: 0 8px; height: 100%; display: flex; align-items: center;">
              <i class="fas fa-user text-white"></i>
            </div>
            <img id="private-chat-avatar" src="https://placehold.co/100x100?text=Avatar" style="width: 35px; height: 35px; object-fit: cover; border-right: 1px solid #444; cursor: pointer;" onclick="window.PrivateChatManager.openActiveUserProfile()" referrerPolicy="origin-when-cross-origin">
            <span id="private-chat-name" class="fw-bold text-truncate ms-2" style="max-width: 150px; font-size: 0.9rem; margin-right: 10px;"></span>
          </div>
          <div class="d-flex align-items-stretch">
            <div id="private-chat-id" class="d-flex align-items-center px-2 fw-bold" style="font-size: 0.85rem;"></div>
            <button id="private-chat-maximize-btn" class="btn border-0 rounded-0 p-0 d-flex align-items-center justify-content-center" style="background: #2ecc71; color: white; width: 35px;" onclick="window.PrivateChatManager.toggleMaximize()" title="تكبير/تصغير">
              <i class="fas fa-expand"></i>
            </button>
            <button class="btn border-0 rounded-0 p-0 d-flex align-items-center justify-content-center" style="background: #e74c3c; color: white; width: 35px;" onclick="window.PrivateChatManager.closeChat()" title="إغلاق">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        
        <div id="private-chat-call-slot" style="position: absolute; top: 35px; left: 0; right: 0; z-index: 1000; pointer-events: none;"></div>
        
        <div id="private-chat-messages" class="private-chat-messages flex-grow-1 p-0 overflow-auto" style="background: #fff; direction: ltr; overflow-x: hidden; overflow-y: auto;">
          <div id="private-chat-messages-inner" style="direction: rtl;">
            <!-- Messages will be rendered here -->
          </div>
        </div>
        
        <div id="upload-preview-container" class="d-none bg-light border-top p-2" style="position: relative;">
          <div class="d-flex align-items-center gap-2">
            <div id="upload-preview-content" style="width: 60px; height: 60px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center;"></div>
            <div class="flex-grow-1">
              <div class="progress" id="upload-progress-container" style="height: 20px; position: relative;">
                <div class="progress-bar" id="upload-progress-bar" role="progressbar" style="width: 0%;">0%</div>
              </div>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="window.PrivateChatManager.cancelUpload()">إلغاء</button>
            <button class="btn btn-sm btn-primary" id="send-file-btn">إرسال</button>
          </div>
        </div>
        
        <div id="private-chat-reply-preview" class="d-none bg-light border-top p-2" style="position: relative; border-right: 3px solid #3498db;">
          <div class="d-flex justify-content-between align-items-center">
            <small class="fw-bold text-primary" id="private-chat-reply-name"></small>
            <button class="btn-close btn-sm" onclick="window.PrivateChatManager.cancelReply()" style="font-size: 0.6rem;"></button>
          </div>
          <div class="text-truncate text-muted small mt-1" id="private-chat-reply-text"></div>
        </div>
        
        <div class="private-chat-input-area p-1 border-top d-flex align-items-center gap-1">
          <button class="btn btn-light btn-sm border" onclick="window.PrivateChatManager.sendPing()" title="إرسال تنبيه (Ping)">
            <i class="fas fa-bell text-warning"></i>
          </button>
          
          <button id="private-call-btn" class="btn btn-sm border" style="background: #5cb85c; color: #fff;" onclick="window.PrivateCallManager.startCall(window.PrivateChatManager.activeChatUser.userId || window.PrivateChatManager.activeChatUser.id)" title="اتصال صوتي">
            <i class="fas fa-phone"></i>
          </button>

          <button id="private-mic-btn" class="btn btn-sm border" style="background: #5cb85c; color: #fff;" onclick="window.PrivateChatManager.toggleRecording()" title="تسجيل صوت">
            <i class="fas fa-microphone"></i>
          </button>

          <button class="btn btn-light btn-sm border" onclick="document.getElementById('private-file-input').click()" title="إرفاق ملف/صورة">
            <i class="fas fa-paperclip text-muted"></i>
          </button>

          <input type="file" id="private-file-input" class="d-none" accept="image/*,video/*,.mov,.MOV,.pdf,.doc,.docx,.zip" onchange="window.PrivateChatManager.handleFileUpload(event)">
          <button class="btn btn-sm" style="padding: 5px; width: 34px; background: transparent !important; border: none !important; outline: none !important; box-shadow: none !important;" onclick="window.toggleEmojiPicker(document.getElementById('private-chat-input'))" title="إيموجي">
            <img src="/emoii.gif" style="width: 34px; padding: 5px;" alt="emoji">
          </button>
          <div id="private-recording-overlay" class="d-none flex-grow-1 align-items-center justify-content-between px-2 bg-white rounded" style="height: 31px; border: 1px solid #ced4da;">
            <div class="d-flex align-items-center">
              <span class="recording-dot me-2"></span>
              <span id="private-recording-timer" class="small fw-bold">0:00</span>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-link btn-sm text-danger p-0" onclick="window.PrivateChatManager.cancelRecording()">إلغاء</button>
              <button class="btn btn-link btn-sm text-success p-0 fw-bold" onclick="window.PrivateChatManager.stopRecording()">إرسال</button>
            </div>
          </div>
          <textarea id="private-chat-input" class="form-control form-control-sm chat-input-field" placeholder="اكتب رسالة..." dir="rtl" rows="1" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="${window.state?.limits?.private || 500}"></textarea>
          <button class="btn btn-secondary btn-sm" onclick="window.PrivateChatManager.sendMessage()">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    
    // Add styles
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes nudge-shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-10px) rotate(-1deg); }
        20%, 40%, 60%, 80% { transform: translateX(10px) rotate(1deg); }
      }
      .chat-nudge {
        animation: nudge-shake 0.5s ease-in-out;
      }
      .private-chat-window {
        position: absolute;
        top: 1px;
        bottom: 46%;
        width: 99.8%;
        min-height: 190px;
        max-height: 500px;
        max-width: 500px;
        border-radius: 2px;
        background: #f5f5f5;
        border: 1px solid #ccc;
        z-index: 1150 !important;
        box-shadow: 2px 2px 10px rgba(0,0,0,0.1);
        display: flex;
        flex-direction: column;
      }
      
      @media (max-width: 767px) {
        .private-chat-window {
          bottom: 65% !important;
        }
        .private-chat-window.maximized {
          top: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          border-radius: 0;
          z-index: 1150 !important;
          transform: none !important;
          transition: none !important;
        }
      }
      
      .private-chat-window.maximized {
        top: 55px !important;
        left: 0 !important;
        width: 100% !important;
        height: calc(100% - 95px) !important;
        max-width: none !important;
        max-height: none !important;
        bottom: 38px !important;
        border-radius: 0;
        z-index: 1150 !important;
        transform: none !important;
        transition: none !important;
      }
      
      .private-msg-typing {
        font-size: 1.2rem;
        font-weight: bold;
        color: #666;
      }

      .private-chat-messages::-webkit-scrollbar {
        width: 6px !important;
        display: block !important;
      }
      .private-chat-messages::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.05) !important;
      }
      .private-chat-messages::-webkit-scrollbar-thumb {
        background-color: rgba(0, 0, 0, 0.2) !important;
        border-radius: 4px !important;
      }
      .private-chat-messages::-webkit-scrollbar-thumb:hover {
        background-color: rgba(0, 0, 0, 0.4) !important;
      }
      
      .recording-pulse {
        animation: pulse-red 1.5s infinite;
      }
      @keyframes pulse-red {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(231, 76, 60, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); }
      }
      .recording-dot {
        width: 10px;
        height: 10px;
        background: #e74c3c;
        border-radius: 50%;
        display: inline-block;
        animation: blink 1s infinite;
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      
      @media (max-width: 768px) {
        .private-chat-window {
          left: 0;
          width: 100%;
          height: calc(100% - 50%);
          max-height: none;
          max-width: none;
          border-radius: 0;
          border: none;
          bottom: 38px;
        }
      }
    `;
    document.head.appendChild(style);
  },

  handleFileUpload(event) {
    if (!this.activeChatUser) return;
    if (!sessionStorage.getItem('token')) {
      if (window.showToast) window.showToast('انتهت الجلسة، يرجى تسجيل الدخول مجدداً', 'error');
      else alert('انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
      return;
    }

    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      if (window.showToast) window.showToast('حجم الملف أكبر من الحد المسموح (50MB)', 'error');
      else alert('حجم الملف أكبر من الحد المسموح (50MB)');
      event.target.value = '';
      return;
    }
    
    let type = 'file';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/') || file.type === 'video/quicktime' || file.name.toLowerCase().endsWith('.mov')) type = 'video';
    
    this.showUploadPreview(file, type);
    event.target.value = ''; // Reset
  },

  showUploadPreview(file, type) {
    const previewUrl = URL.createObjectURL(file);
    const previewContent = document.getElementById('upload-preview-content');
    previewContent.innerHTML = type === 'image' ? `<img src="${previewUrl}" class="img-fluid" style="max-height: 50px;">` : 
                                type === 'video' ? `<video src="${previewUrl}" class="img-fluid" style="max-height: 50px;"></video>` :
                                `<i class="fas fa-file mb-1 d-block fa-2x"></i> <small>${escapeHTML(file.name)}</small>`;
    
    document.getElementById('upload-preview-container').classList.remove('d-none');
    document.getElementById('upload-progress-container').classList.add('d-none');
    
    const sendBtn = document.getElementById('send-file-btn');
    sendBtn.disabled = false;

    sendBtn.onclick = () => {
      sendBtn.disabled = true;
      document.getElementById('upload-progress-container').classList.remove('d-none');
      this.uploadFileWithProgress(file, (progress) => {
        const bar = document.getElementById('upload-progress-bar');
        bar.style.width = progress + '%';
        bar.innerText = progress + '%';
      }, (url, data) => {
        // Success
        sendBtn.disabled = false;
        document.getElementById('upload-preview-container').classList.add('d-none');
        
        let finalType = 'file';
        if (data.mimetype) {
          if (data.mimetype.startsWith('image/')) finalType = 'image';
          else if (data.mimetype.startsWith('video/') || data.mimetype === 'video/quicktime' || (url && url.toLowerCase().endsWith('.mov'))) finalType = 'video';
        }

        let textContent = '';
        const input = document.getElementById('private-chat-input');
        if (input && input.value) {
          textContent = input.value.trim();
          input.value = '';
        }

        this.socket.emit('private_message', {
          targetUsername: this.activeChatUser.username,
          message: { text: textContent, type: finalType, fileUrl: url }
        });
        URL.revokeObjectURL(previewUrl);
      }, (errorMsg) => {
        // Error
        sendBtn.disabled = false;
        document.getElementById('upload-progress-container').classList.add('d-none');
        if (window.showToast) window.showToast(errorMsg, 'error');
        else alert(errorMsg);
      });
    };
  },

  cancelUpload() {
    document.getElementById('upload-preview-container').classList.add('d-none');
    const sendBtn = document.getElementById('send-file-btn');
    if (sendBtn) sendBtn.disabled = false;
  },

  uploadFileWithProgress(file, onProgress, onComplete, onError) {
    const formData = new FormData();
    formData.append('file', file);
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/pmfiles', true);
    xhr.setRequestHeader('Authorization', `Bearer ${sessionStorage.getItem('token')}`);
    xhr.timeout = 120000; // 2 minutes timeout
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 100);
        onProgress(progress);
      }
    };
    
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch (e) {}

      if (xhr.status >= 200 && xhr.status < 300 && data.url) {
        onComplete(data.url, data);
      } else {
        const msg = data.message || 'تعذر رفع الملف، حاول مرة أخرى';
        if (typeof onError === 'function') onError(msg);
      }
    };

    xhr.onerror = () => {
      if (typeof onError === 'function') onError('فشل الاتصال بالخادم، يرجى التحقق من اتصالك');
    };

    xhr.ontimeout = () => {
      if (typeof onError === 'function') onError('انتهى وقت الاتصال (Timeout) أثناء رفع الملف');
    };
    
    xhr.send(formData);
  },

  openActiveUserProfile() {
    if (this.activeChatUser && window.showUserProfile) {
      window.showUserProfile(this.activeChatUser.username);
    }
  },

  sendPrivateSticker(arg1, arg2) {
    if (!this.socket || !this.activeChatUser) return;
    
    // Handle both signatures: (id, shortcut) or (shortcut) or (msgObj)
    let text = "";
    if (arg2 && typeof arg2 === 'string') {
        text = arg2;
    } else if (typeof arg1 === 'string') {
        text = arg1;
    } else if (arg1 && arg1.text) {
        text = arg1.text;
    }

    if (!text) return;

    this.socket.emit('private_message', {
      targetUsername: this.activeChatUser.username,
      message: {
        text: text,
        type: 'text',
        isSticker: true
      }
    });
  },

  makeDraggable() {
    const dragItem = document.getElementById('private-chat-window');
    const dragHeader = document.getElementById('private-chat-header');
    
    if (!dragItem || !dragHeader) return;

    let active = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e) => {
      if (window.innerWidth <= 768 || this.isMaximized) return; // Don't drag on mobile or when maximized
      
      if (e.type === "touchstart") {
        initialX = e.touches[0].clientX - xOffset;
        initialY = e.touches[0].clientY - yOffset;
      } else {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
      }

      if (e.target === dragHeader || dragHeader.contains(e.target)) {
        active = true;
      }
    };

    const dragEnd = () => {
      initialX = currentX;
      initialY = currentY;
      active = false;
    };

    const drag = (e) => {
      if (active) {
        e.preventDefault();
        
        if (e.type === "touchmove") {
          currentX = e.touches[0].clientX - initialX;
          currentY = e.touches[0].clientY - initialY;
        } else {
          currentX = e.clientX - initialX;
          currentY = e.clientY - initialY;
        }

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, dragItem);
      }
    };

    const setTranslate = (xPos, yPos, el) => {
      el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    };

    dragHeader.addEventListener("touchstart", dragStart, false);
    dragHeader.addEventListener("touchend", dragEnd, false);
    dragHeader.addEventListener("touchmove", drag, false);

    dragHeader.addEventListener("mousedown", dragStart, false);
    document.addEventListener("mouseup", dragEnd, false);
    document.addEventListener("mousemove", drag, false);
  }
};

window.PrivateChatManager = PrivateChatManager;
