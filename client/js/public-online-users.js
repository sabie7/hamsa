(function () {
  let pollingInterval = null;
  let isFetching = false;
  let isStopped = false;

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getAvatarUrl(user) {
    if (window.getAvatarUrl && typeof window.getAvatarUrl === 'function') {
      return window.getAvatarUrl(user);
    }
    var pic = user ? (user.pic !== undefined ? user.pic : (user.avatar !== undefined ? user.avatar : user.senderAvatar)) : null;
    if (pic && typeof pic === 'string') {
      var trimmed = pic.trim();
      var lower = trimmed.toLowerCase();
      var isInvalid = !trimmed ||
        lower === 'null' ||
        lower === 'undefined' ||
        lower === 'none' ||
        lower.includes('placehold.co') ||
        lower.includes('flaticon.com') ||
        lower === '/default-avatar.png' ||
        lower === '/img/default-avatar.png' ||
        lower === '/images/default-avatar.png' ||
        lower === '/uploads/site/default.png';
      if (!isInvalid) return trimmed;
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
  }

  function renderUserIdentity(u, opts) {
    if (window.renderUserIdentity && typeof window.renderUserIdentity === 'function') {
      return window.renderUserIdentity(u, opts);
    }
    var displayName = escapeHTML(u.topic || u.username);
    var color = u.ucol || '#000000';
    return '<span class="user-addon-container font-weight-bold"><span class="user-name" style="color: ' + color + '; font-family: var(--font-family);">' + displayName + '</span></span>';
  }

  function renderAvatar(u, sizeClass, extraStyles) {
    if (window.renderAvatar && typeof window.renderAvatar === 'function') {
      return window.renderAvatar(u, sizeClass, extraStyles);
    }
    var avatarUrl = getAvatarUrl(u);
    return '<img src="' + avatarUrl + '" class="rounded-circle" style="width: 50px; height: 50px; object-fit: cover;" onerror="window.handleAvatarError && window.handleAvatarError(this)">';
  }

  function syncDOMList(container, newItems) {
    if (!container) return;
    var existingMap = new Map();
    Array.from(container.children).forEach(function (child) {
      if (child.id) existingMap.set(child.id, child);
    });

    var newIds = new Set(newItems.map(function (item) { return item.id; }));
    existingMap.forEach(function (node, id) {
      if (!newIds.has(id)) node.remove();
    });

    function createNodeFromHTML(html) {
      var template = document.createElement('template');
      template.innerHTML = String(html).trim();
      return template.content.firstElementChild;
    }

    newItems.forEach(function (item, index) {
      var currentNode = existingMap.get(item.id);
      
      if (!currentNode) {
        var newNode = createNodeFromHTML(item.html);
        if (newNode) {
          newNode.dataset.signature = item.html;
          currentNode = newNode;
        }
      } else {
        if (currentNode.dataset.signature !== item.html) {
          var newNode = createNodeFromHTML(item.html);
          if (newNode) {
            if (typeof window.syncNodes === 'function') {
              window.syncNodes(currentNode, newNode);
            } else {
              currentNode.replaceWith(newNode);
              currentNode = newNode;
            }
            currentNode.dataset.signature = item.html;
          }
        }
      }

      if (!currentNode) return;

      var nodeAtIndex = container.children[index];
      if (nodeAtIndex !== currentNode) {
        container.insertBefore(currentNode, nodeAtIndex || null);
      }
    });
  }

  window.renderPublicOnlineUsers = function (users) {
    var listContainer = document.getElementById('landing-users-list');
    var countContainer = document.getElementById('landing-users-count');

    if (!listContainer) return;

    if (!Array.isArray(users)) {
      users = [];
    }

    if (countContainer) {
      countContainer.innerHTML = '<i class="fas fa-user-friends"></i> ' + users.length;
    }

    if (users.length === 0) {
      listContainer.innerHTML = '<div class="text-center text-muted p-4 small" id="empty-public-users-msg">لا يوجد متواجدون حالياً</div>';
      return;
    }

    var landingItems = users.map(function (u) {
      var selectedCountry = (u.profileCountry || u.country || '')
        .toString()
        .trim()
        .toLowerCase();

      var countryCode = selectedCountry && selectedCountry !== 'unknown'
        ? selectedCountry
        : null;

      var statusColor = '#28a745';
      if (u.isVirtualUser && u.onlineStatusStr) {
        if (u.onlineStatusStr === 'أخضر') statusColor = '#28a745';
        else if (u.onlineStatusStr === 'أحمر') statusColor = '#dc3545';
        else if (u.onlineStatusStr === 'أصفر') statusColor = '#ffc107';
        else if (u.onlineStatusStr === 'أزرق') statusColor = '#007bff';
        else statusColor = '#6c757d';
      } else if (u.isGhost) {
        statusColor = '#6c757d';
      } else if (u.isIdle || u.presenceState === 'idle') {
        statusColor = '#ffc107';
      }

      var appearance = window.siteAppearance || window.domainConfig;
      var rawLandingStatusVal = appearance ? appearance.showStatusOnLanding : undefined;
      var showStatusColorOnLanding =
        rawLandingStatusVal === true ||
        rawLandingStatusVal === 'true' ||
        rawLandingStatusVal === 1 ||
        rawLandingStatusVal === '1';

      var hasDesign = !!(u.membershipFrame || u.membershipBg);
      var showAvatar = u.showMembershipAvatar !== false;
      var showName = u.showMembershipName !== false;
      var showStatusText = u.showMembershipStatus !== false;

      var isActuallyOnline = u.isOnline && !u.isGhost;
      var isYellow = statusColor === '#ffc107';
      var borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;

      var landingStatusBorderDesign = showStatusColorOnLanding
        ? 'border-left: 5px solid ' + borderColor + ' !important;'
        : '';

      var landingStatusBorderDefault = showStatusColorOnLanding
        ? 'border-left: 4px solid ' + borderColor + ' !important;'
        : '';

      var ghostStyle = (showStatusColorOnLanding && u.isGhost)
        ? 'border-left: 4px solid #808080 !important;'
        : '';

      var html = '';

      if (hasDesign) {
        var avatarHtml = renderAvatar(u, '', 'width: 72px; height: 72px;');
        var bgStyle = u.membershipBg ? "background: url('" + u.membershipBg + "'); background-size: cover; background-position: center;" : 'background: #fff;';
        var textColor = u.membershipBg ? '#fff' : (u.ucol || '#000');
        var textShadow = '';

        html = '\
        <div id="landing-user-' + u.username + '" class="list-group-item d-flex align-items-center border-0 border-bottom p-0 user-pro-item ' + (u.isGhost ? 'ghost-user' : '') + '" data-user-id="' + (u.userId ?? u.id) + '" style="' + landingStatusBorderDesign + ' min-height: 90px; ' + bgStyle + ' ' + textShadow + ' ' + ghostStyle + ' overflow: hidden; position: relative;">\
          ' + (showAvatar ? '\
          <div style="margin: 5px 10px; flex-shrink: 0; z-index: 1;">\
            ' + avatarHtml + '\
          </div>\
          ' : '') + '\
          <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">\
            ' + (showName ? '\
            <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">\
              ' + renderUserIdentity(u, {
                containerClasses: 'user-addon-container font-weight-bold',
                nameStyle: 'color: ' + (u.ucol || textColor) + ';'
              }) + '\
            </div>\
            ' : '') + '\
            ' + (showStatusText ? '\
            <div class="user-sidebar-status fw-bold" style="color: ' + ((window.featuresSettings && window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888') + '; width: 100%; display: block;">\
              ' + (u.msg || (u.type === 'guest' ? 'زائر' : 'عضو')) + '\
            </div>\
            ' : '') + '\
          </div>\
          <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">\
            ' + ((u.showMembershipFlag !== false && countryCode) ? '<img src="/flags/' + countryCode + '.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">' : '') + '\
            ' + ((u.userId && u.showMembershipId !== false) ? '<span style="font-size: 11px; font-weight: 700; color: ' + (u.membershipBg ? '#fff' : '#6c757d') + '; letter-spacing: 0.5px;">#' + Math.abs(Number(u.userId)) + '</span>' : '') + '\
          </div>\
        </div>\
      ';
      } else {
        var rawId = u.userId ?? u.id;
        var displayId = (rawId && !isNaN(Number(rawId))) ? '#' + Math.abs(Number(rawId)) : '';
        html = '\
        <div id="landing-user-' + u.username + '" class="list-group-item d-flex align-items-start border-0 border-bottom p-0" data-user-id="' + (u.userId ?? u.id) + '" style="' + landingStatusBorderDefault + ' min-height: 52px; background-color: #fff; ' + ghostStyle + '; cursor: default; position: relative;">\
          <div>\
            <img src="' + getAvatarUrl(u) + '" style="width: 50px; height: 50px; object-fit: cover;" referrerPolicy="origin-when-cross-origin" onerror="window.handleAvatarError && window.handleAvatarError(this)">\
          </div>\
          <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">\
            <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">\
              ' + renderUserIdentity(u, {
                containerClasses: 'user-addon-container font-weight-bold',
                nameStyle: 'color: ' + (u.ucol || '#000000') + '; font-family: var(--font-family);'
              }) + '\
            </div>\
            ' + (showStatusText ? '\
            <div class="user-sidebar-status fw-bold" style="color: ' + ((window.featuresSettings && window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888') + '; width: 100%; display: block;">\
              ' + (u.msg || (u.isOnline ? 'متصل الآن' : 'غير متصل')) + '\
            </div>\
            ' : '') + '\
          </div>\
          <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">\
            ' + (countryCode ? '<img src="/flags/' + countryCode + '.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">' : '') + '\
            ' + (displayId ? '<span style="font-size: 9px; font-weight: 700; color: #6c757d; letter-spacing: 0.5px;">' + displayId + '</span>' : '') + '\
          </div>\
        </div>\
      ';
      }

      return { id: 'landing-user-' + u.username, html: html };
    });

    syncDOMList(listContainer, landingItems);
  };

  window.loadPublicOnlineUsers = function (force) {
    if (isStopped && !force) return;
    isStopped = false;

    var token = sessionStorage.getItem('token');
    if (token || (window.state && window.state.currentUser)) {
      window.stopPublicOnlineUsersPolling();
      return;
    }

    if (isFetching) return;
    isFetching = true;

    fetch('/api/public/online-users', {
      headers: {
        'Cache-Control': 'no-cache'
      }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Network response error');
        return res.json();
      })
      .then(function (users) {
        isFetching = false;
        if (isStopped) return;
        window.renderPublicOnlineUsers(users);
      })
      .catch(function (err) {
        console.warn('[PublicOnlineUsers] Fetch error:', err);
        isFetching = false;
      });
  };

  window.startPublicOnlineUsersPolling = function () {
    isStopped = false;
    var token = sessionStorage.getItem('token');
    if (token || (window.state && window.state.currentUser)) {
      return;
    }

    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }

    window.loadPublicOnlineUsers(true);

    pollingInterval = setInterval(function () {
      var token = sessionStorage.getItem('token');
      if (token || (window.state && window.state.currentUser)) {
        window.stopPublicOnlineUsersPolling();
        return;
      }
      window.loadPublicOnlineUsers();
    }, 12000);
  };

  window.stopPublicOnlineUsersPolling = function () {
    isStopped = true;
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  };

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      var token = sessionStorage.getItem('token');
      if (!token && (!window.state || !window.state.currentUser)) {
        window.loadPublicOnlineUsers();
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.startPublicOnlineUsersPolling();
    });
  } else {
    window.startPublicOnlineUsersPolling();
  }
})();

