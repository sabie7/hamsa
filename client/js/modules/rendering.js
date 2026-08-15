import { emit } from './ctx.js';
import * as state from './state.js';
import { prettifySystemMessage } from './site-enhancements.js';
import { showProfile } from './auth.js';
import { renderRichContent, containsImageUrl } from './image-preview.js';

export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function defaultAvatar() {
  return '/uploads/site/defaultAvatar-1783610496476-957604529.jpeg';
}

export function currentUserId() {
  var u = state.getState().user;
  return u && u.name ? u.name : (sessionStorage.getItem('user') ? JSON.parse(sessionStorage.getItem('user')).name : '');
}

export function renderMessage(item) {
  var container = document.getElementById('messages-container');
  if (!container || !item) return;
  var isSystem = item.type === 'broadcast' || item.type === 'system';
  var row = document.createElement('div');
  row.className = 'message-row d-flex align-items-start gap-2 p-2 border-bottom';
  row.setAttribute('data-username', item.user || '');
  row.setAttribute('data-message-id', item.id || '');

  if (isSystem) {
    var sys = document.createElement('div');
    sys.className = 'system-message small text-center py-1';
    sys.textContent = prettifySystemMessage(item.msg || '');
    row.appendChild(sys);
  } else {
    var avatar = document.createElement('img');
    avatar.src = item.pic && item.pic !== 'pic.png' ? item.pic : defaultAvatar();
    avatar.className = 'message-avatar';
    avatar.style.cssText = 'width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;';
    avatar.setAttribute('referrerpolicy', 'origin-when-cross-origin');

    var body = document.createElement('div');
    body.className = 'message-body';

    var header = document.createElement('div');
    header.className = 'message-header d-flex align-items-baseline gap-2';

    var name = document.createElement('span');
    name.className = 'message-username fw-bold small';
    name.textContent = item.user || 'مجهول';
    if (item.color) name.style.color = item.color;
    name.style.cursor = 'pointer';
    name.addEventListener('click', function () {
      showProfile(item.user);
    });

    var text = document.createElement('div');
    text.className = 'message-text small';
    if (containsImageUrl(item.msg)) {
      text.appendChild(renderRichContent(item.msg || '', { maxWidth: 260 }));
    } else {
      text.textContent = item.msg || '';
    }

    header.appendChild(name);
    body.appendChild(header);
    body.appendChild(text);
    row.appendChild(avatar);
    row.appendChild(body);
  }

  container.appendChild(row);
  while (container.children.length > 200) container.removeChild(container.firstChild);
  container.scrollTop = container.scrollHeight;
}

export function renderSidebarUsers(users) {
  var container = document.getElementById('sidebar-users-container');
  if (!container) return;
  container.innerHTML = '';
  users.forEach(function (user) {
    var div = document.createElement('div');
    div.className = 'user-pro-item d-flex align-items-center gap-2 p-2';
    div.setAttribute('data-username', user.topic || user.username || '');
    div.setAttribute('data-user-id', user.id || '');
    var avatar = document.createElement('img');
    avatar.src = user.pic && user.pic !== 'pic.png' ? user.pic : defaultAvatar();
    avatar.className = 'user-avatar';
    avatar.style.cssText = 'width: 36px; height: 36px; border-radius: 10px; object-fit: cover;';
    avatar.setAttribute('referrerpolicy', 'origin-when-cross-origin');
    var name = document.createElement('span');
    name.className = 'fw-bold small';
    name.textContent = user.topic || user.username || 'مستخدم';
    div.appendChild(avatar);
    div.appendChild(name);
    var rank = user.power || user.rank || '';
    if (rank && String(rank) !== '0') {
      var r = document.createElement('span');
      r.className = 'profile-rank-badge badge rounded-pill text-white';
      r.style.fontSize = '10px';
      r.textContent = String(rank);
      div.appendChild(r);
    }
    div.addEventListener('click', function () {
      showProfile(user.topic || user.username);
    });
    container.appendChild(div);
  });
}

export function renderLandingUsers(users) {
  var landingList = document.getElementById('landing-users-list');
  if (!landingList) return;
  landingList.innerHTML = '';
  users.forEach(function (user) {
    var div = document.createElement('div');
    div.className = 'list-group-item list-group-item-action py-1 px-2 d-flex align-items-center gap-2';
    var avatar = document.createElement('img');
    avatar.src = user.pic && user.pic !== 'pic.png' ? user.pic : defaultAvatar();
    avatar.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0;';
    avatar.setAttribute('referrerpolicy', 'origin-when-cross-origin');
    var name = document.createElement('span');
    name.textContent = user.topic || user.username || 'مستخدم';
    var rank = user.power || user.rank || '';
    var nameWrap = document.createElement('span');
    nameWrap.style.cssText = 'display:flex;flex-direction:column;line-height:1.2;';
    nameWrap.appendChild(name);
    if (rank && String(rank) !== '0') {
      var r = document.createElement('small');
      r.className = 'profile-rank-badge badge rounded-pill text-white';
      r.style.fontSize = '10px';
      r.textContent = String(rank);
      nameWrap.appendChild(r);
    }
    div.appendChild(avatar);
    div.appendChild(nameWrap);
    div.addEventListener('click', function () {
      showProfile(user.topic || user.username);
    });
    landingList.appendChild(div);
  });
}

export function updateLandingCount() {
  var count = state.getState().onlineUsers || [];
  var landingCount = document.getElementById('landing-users-count');
  var onlineCount = document.getElementById('online-count');
  if (landingCount) landingCount.innerHTML = '<i class="fas fa-user-friends"></i> ' + count.length;
  if (onlineCount) onlineCount.textContent = count.length;
}

export function openRoomPasswordModal(room) {
  var modal = document.getElementById('roomPasswordModal');
  if (modal) {
    modal.setAttribute('data-room-id', room.id);
    var bs = new bootstrap.Modal(modal);
    bs.show();
  }
}

export function renderRooms(rooms) {
  var container = document.getElementById('sidebar-rooms-container');
  var gridContainer = document.getElementById('rooms-grid-container');
  if (container) {
    container.innerHTML = '';
    rooms.forEach(function (room) {
      var div = document.createElement('div');
      div.className = 'room-card d-flex align-items-center gap-2 p-2';
      var thumb = document.createElement('img');
      thumb.src = room.thumbnail || room.pic || '/uploads/site/defaultRoom-1783610496484-436012667.jpeg';
      thumb.className = 'room-card-thumbnail';
      thumb.style.cssText = 'width: 40px; height: 40px; border-radius: 8px; object-fit: cover;';
      thumb.setAttribute('referrerpolicy', 'origin-when-cross-origin');
      var info = document.createElement('div');
      info.className = 'flex-grow-1';
      var name = document.createElement('div');
      name.className = 'fw-bold small';
      name.textContent = room.name || 'غرفة';
      var count = document.createElement('span');
      count.className = 'room-user-count small';
      count.textContent = (room.online || 0) + ' مستخدم';
      info.appendChild(name);
      info.appendChild(count);
      div.appendChild(thumb);
      div.appendChild(info);
      div.addEventListener('click', function () {
        joinRoom(room);
      });
      container.appendChild(div);
    });
  }
  if (gridContainer) {
    gridContainer.innerHTML = '';
    rooms.forEach(function (room) {
      var col = document.createElement('div');
      col.className = 'col';
      var card = document.createElement('div');
      card.className = 'card room-select-card';
      card.innerHTML = '<div class="card-body text-center"><h6>' + escapeHtml(room.name || 'غرفة') + '</h6><small>' + (room.online || 0) + ' مستخدم</small></div>';
      card.addEventListener('click', function () {
        joinRoom(room);
      });
      col.appendChild(card);
      gridContainer.appendChild(col);
    });
  }
}

export function joinRoom(room) {
  if (!room) return;
  if (room.hasPassword || room.password || room.isLocked) {
    openRoomPasswordModal(room);
  } else {
    emit('join_room', { roomId: room.id });
  }
}

export function renderWallPosts(posts) {
  var container = document.getElementById('wall-posts-container');
  if (!container) return;
  container.innerHTML = '';
  (posts || []).forEach(function (post) {
    var div = document.createElement('div');
    div.className = 'wall-post card mb-2';
    var header = document.createElement('div');
    header.className = 'card-header d-flex align-items-center gap-2 py-1';
    var avatar = document.createElement('img');
    avatar.src = post.pic && post.pic !== 'pic.png' ? post.pic : defaultAvatar();
    avatar.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; object-fit: cover;';
    var name = document.createElement('span');
    name.className = 'fw-bold small';
    name.textContent = post.name || '';
    header.appendChild(avatar);
    header.appendChild(name);
    var body = document.createElement('div');
    body.className = 'card-body py-2';
    if (containsImageUrl(post.msg)) {
      body.appendChild(renderRichContent(post.msg || '', { maxWidth: 320, extraClass: 'wall-post-image' }));
    } else {
      body.textContent = post.msg || '';
    }
    var footer = document.createElement('div');
    footer.className = 'card-footer py-1 d-flex gap-3 small';
    var likeBtn = document.createElement('a');
    likeBtn.href = '#';
    likeBtn.className = 'text-decoration-none';
    likeBtn.textContent = '❤ ' + (post.likes ? post.likes.length : 0);
    likeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      emit('walllike', { id: post.id });
    });
    var commentBtn = document.createElement('a');
    commentBtn.href = '#';
    commentBtn.className = 'text-decoration-none';
    commentBtn.textContent = '💬 ' + (post.comments ? post.comments.length : 0);
    footer.appendChild(likeBtn);
    footer.appendChild(commentBtn);
    div.appendChild(header);
    div.appendChild(body);
    div.appendChild(footer);
    container.appendChild(div);
  });
}

export function renderZajel(list) {
  var container = document.getElementById('zajel-messages-container');
  if (!container) return;
  container.innerHTML = '';
  (list || []).forEach(function (item) {
    var row = document.createElement('div');
    row.className = 'zajel-item small py-1 border-bottom';
    row.setAttribute('data-zajel-id', item.id || '');
    var from = document.createElement('strong');
    from.textContent = (item.sender || '') + ': ';
    var text = document.createElement('span');
    text.textContent = item.text || '';
    row.appendChild(from);
    row.appendChild(text);
    container.appendChild(row);
  });
}

export function renderQuickChat(list) {
  var container = document.getElementById('quick-chat-messages');
  if (!container) return;
  container.innerHTML = '';
  (list || []).forEach(function (item) {
    var row = document.createElement('div');
    row.className = 'quick-chat-item small py-1 border-bottom';
    var from = document.createElement('strong');
    from.textContent = (item.user || '') + ': ';
    var text = document.createElement('span');
    text.textContent = item.text || '';
    row.appendChild(from);
    row.appendChild(text);
    container.appendChild(row);
  });
}
