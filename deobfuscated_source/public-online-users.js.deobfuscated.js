(function () {
  let pollTimer = null,
    isFetching = ![],
    isStopped = ![];
  function escapeHtml(_0x4e4c40) {
    if (!_0x4e4c40) return '';
    return String(_0x4e4c40)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function getAvatarUrl(_0x256f62) {
    if (window.getAvatarUrl && typeof window.getAvatarUrl === 'function') return window.getAvatarUrl(_0x256f62);
    var _0x3b63e4 = _0x256f62 ? _0x256f62.pic : null;
    if (_0x3b63e4 && typeof _0x3b63e4 === 'string' && _0x3b63e4.trim() !== '') return _0x3b63e4.trim();
    if (window.defaultAvatarUrl && typeof window.defaultAvatarUrl === 'string' && window.defaultAvatarUrl.trim() !== '')
      return window.defaultAvatarUrl.trim();
    return '/uploads/site/default.png';
  }
  function renderUserIdentity(_0x774924, _0x4110ca) {
    if (window.renderUserIdentity && typeof window.renderUserIdentity === 'function')
      return window.renderUserIdentity(_0x774924, _0x4110ca);
    var _0x3ed1f7 = escapeHtml(_0x774924.topic || _0x774924.username),
      _0x1dc3bb = _0x774924.ucol || '#000000';
    return (
      '<span class="user-addon-container font-weight-bold"><span class="user-name" style="color: ' +
      _0x1dc3bb +
      '; font-family: var(--font-family);">' +
      _0x3ed1f7 +
      '</span></span>'
    );
  }
  function renderAvatar(_0x4fa6e9, _0x48d35c, _0x3109cb) {
    if (window.renderAvatar && typeof window.renderAvatar === 'function') return window.renderAvatar(_0x4fa6e9, _0x48d35c, _0x3109cb);
    var _0x35a1b8 = getAvatarUrl(_0x4fa6e9);
    return (
      '<img src="' +
      _0x35a1b8 +
      '" class="rounded-circle" style="width: 50px; height: 50px; object-fit: cover;" onerror="window.handleAvatarError && window.handleAvatarError(this)">'
    );
  }
  function reconcileUsers(_0x331504, _0x3f3c0a) {
    if (!_0x331504) return;
    var _0x13dc33 = new Map();
    Array.from(_0x331504.children).forEach(function (_0x223ac2) {
      if (_0x223ac2.id) _0x13dc33.set(_0x223ac2.id, _0x223ac2);
    });
    var _0xf3330d = new Set(
      _0x3f3c0a.map(function (_0x1b6234) {
        return _0x1b6234.id;
      })
    );
    _0x13dc33.forEach(function (_0x314be7, _0xa4c24c) {
      if (!_0xf3330d.has(_0xa4c24c)) _0x314be7.remove();
    });
    function parseHtml(_0x5c10e2) {
      var _0x3dcf38 = document.createElement('template');
      return ((_0x3dcf38.innerHTML = String(_0x5c10e2).trim()), _0x3dcf38.content.firstElementChild);
    }
    _0x3f3c0a.forEach(function (_0x2ab4f5, _0x9bf6e8) {
      var _0x178f03 = _0x13dc33.get(_0x2ab4f5.id),
        _0x35bde3 = parseHtml(_0x2ab4f5.html);
      if (!_0x35bde3) return;
      _0x178f03
        ? _0x178f03.outerHTML !== _0x35bde3.outerHTML && (_0x178f03.replaceWith(_0x35bde3), (_0x178f03 = _0x35bde3))
        : (_0x178f03 = _0x35bde3);
      var _0x237596 = _0x331504.children[_0x9bf6e8];
      _0x237596 !== _0x178f03 && _0x331504.insertBefore(_0x178f03, _0x237596 || null);
    });
  }
  ((window.renderPublicOnlineUsers = function (users) {
    var listEl = document.getElementById('landing-users-list'),
      countEl = document.getElementById('landing-users-count');
    if (!listEl) return;
    !Array.isArray(users) && (users = []);
    countEl && (countEl.innerHTML = '<i class="fas fa-user-friends"></i> ' + users.length);
    if (users.length === 0x0) {
      listEl.innerHTML = '<div class="text-center text-muted p-4 small" id="empty-public-users-msg">لا يوجد متواجدون حالياً</div>';
      return;
    }
    var renderedUsers = users.map(function (user) {
      var countryRaw = (user.profileCountry || user.country || '').toString().trim().toLowerCase(),
        country = countryRaw && countryRaw !== 'unknown' ? countryRaw : null,
        statusColor = '#28a745';
      if (user.isVirtualUser && user.onlineStatusStr) {
        if (user.onlineStatusStr === 'أخضر') statusColor = '#28a745';
        else {
          if (user.onlineStatusStr === 'أحمر') statusColor = '#dc3545';
          else {
            if (user.onlineStatusStr === 'أصفر') statusColor = '#ffc107';
            else {
              if (user.onlineStatusStr === 'أزرق') statusColor = '#007bff';
              else statusColor = '#6c757d';
            }
          }
        }
      } else {
        if (user.isGhost) statusColor = '#6c757d';
        else (user.isIdle || user.presenceState === 'idle') && (statusColor = '#ffc107');
      }
      var _0x1999c7 = window.siteAppearance || window.domainConfig,
        _0x158830 = !(_0x1999c7 && (_0x1999c7.showStatusOnLanding === ![] || _0x1999c7.showStatusOnLanding === 'false')),
        _0x253708 = !!(user.membershipFrame || user.membershipBg),
        _0x563231 = user.showMembershipAvatar !== ![],
        _0x3d617a = user.showMembershipName !== ![],
        _0x3648bd = user.showMembershipStatus !== ![],
        _0x532089 = user.isOnline && !user.isGhost,
        _0x371047 = statusColor === '#ffc107',
        _0x5955b2 = _0x532089 && user.allowPrivate === ![] && !_0x371047 ? '#dc3545' : statusColor,
        _0x30f3d3 = _0x158830 ? 'border-left: 5px solid ' + _0x5955b2 + ' !important;' : '',
        _0x438956 = _0x158830 ? 'border-left: 4px solid ' + _0x5955b2 + ' !important;' : '',
        _0x1d8777 = _0x158830 && user.isGhost ? 'border-left: 4px solid #808080 !important;' : '',
        html = '';
      if (_0x253708) {
        var _0x4adb3b = renderAvatar(user, '', 'width: 72px; height: 72px;'),
          _0x6ffed9 = user.membershipBg
            ? "background: url('" + user.membershipBg + "'); background-size: cover; background-position: center;"
            : 'background: 0#fff;',
          _0x125408 = user.membershipBg ? '#fff' : user.ucol || '#000',
          _0x1e3a5c = user.membershipBg ? 'text-shadow: 0 1px 3px rgba(0,0,0,1);' : '';
        html =
          '        <div id="landing-user-' +
          user.username +
          '" class="list-group-item d-flex align-items-center border-0 border-bottom p-0 user-pro-item ' +
          (user.isGhost ? 'ghost-user' : '') +
          '" data-user-id="' +
          (user.userId ?? user.id) +
          '" style="' +
          _0x30f3d3 +
          ' min-height: 90px; ' +
          _0x6ffed9 +
          '\x20' +
          _0x1e3a5c +
          '\x20' +
          _0x1d8777 +
          ' overflow: hidden; position: relative;">          ' +
          (_0x563231
            ? ' 0 0 0 0 0 0 0 0 0 0<div 0style="2margin: 05px 010px; 0flex-shrink: 00; 0z-index: 01;"2> 0 0 0 0 0 0 0 0 0 0 0 0' +
              _0x4adb3b +
              '          </div>          '
            : '') +
          ' 0 0 0 0 0 0 0 0 0 0<div 0class="2flex-grow-1 0ps-1 0py-1 0d-flex 0flex-column"2 0style="2min-width: 00; 0z-index: 01; 0padding-right: 04px 0!important; 0flex: 01;"2> 0 0 0 0 0 0 0 0 0 0 0 0' +
          (_0x3d617a
            ? ' 0 0 0 0 0 0 0 0 0 0 0 0<div 0class="2fw-bold 0d-flex 0align-items-center 0flex-wrap"2 0style="2font-size: 017px; 0font-family: 0var(--font-family); 0line-height: 01.2; 0padding-right: 045px; 0width: 0100%;"2> 0 0 0 0 0 0 0 0 0 0 0 0 0 0' +
              renderUserIdentity(user, {
                containerClasses: 'user-addon-container font-weight-bold',
                nameStyle: 'color: 0' + (user.ucol || _0x125408) + ';',
              }) +
              '            </div>            '
            : '') +
          ' 0 0 0 0 0 0 0 0 0 0 0 0' +
          (_0x3648bd
            ? '            <div class="user-sidebar-status fw-bold" style="color: ' +
              (window.featuresSettings && window.featuresSettings.statusColorEnabled === !![] && user.mcol ? user.mcol : '#888') +
              ';\x20width:\x20100%;\x20display:\x20block;\x22>\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20' +
              (user.msg || (user.type === 'guest' ? 'زائر' : 'عضو')) +
              '            </div>            '
            : '') +
          '          </div>          <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">            ' +
          (user.showMembershipFlag !== ![] && country
            ? '<img\x20src=\x22/flags/' +
              country +
              '.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">'
            : '') +
          ' 0 0 0 0 0 0 0 0 0 0 0 0' +
          (user.userId && user.showMembershipId !== ![]
            ? '<span style="font-size: 11px; font-weight: 700; color: ' +
              (user.membershipBg ? '#fff' : '#6c757d') +
              '; letter-spacing: 0.5px;">#' +
              Math.abs(Number(user.userId)) +
              '</span>'
            : '') +
          ' 0 0 0 0 0 0 0 0 0 0</div> 0 0 0 0 0 0 0 0</div> 0 0 0 0 0 0';
      } else {
        var _0x3107c7 = user.userId ?? user.id,
          _0x265765 = _0x3107c7 && !isNaN(Number(_0x3107c7)) ? '#' + Math.abs(Number(_0x3107c7)) : '';
        html =
          '        <div id="landing-user-' +
          user.username +
          '" class="list-group-item d-flex align-items-start border-0 border-bottom p-0" data-user-id="' +
          (user.userId ?? user.id) +
          '" style="' +
          _0x438956 +
          ' min-height: 52px; background-color: #fff; ' +
          _0x1d8777 +
          '; cursor: default; position: relative;">          <div>            <img src="' +
          getAvatarUrl(user) +
          '" style="width: 50px; height: 50px; object-fit: cover;" referrerPolicy="origin-when-cross-origin" onerror="window.handleAvatarError && window.handleAvatarError(this)">          </div>          <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">            <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">              ' +
          renderUserIdentity(user, {
            containerClasses: 'user-addon-container font-weight-bold',
            nameStyle: 'color: ' + (user.ucol || '#000000') + '; font-family: var(--font-family);',
          }) +
          ' 0 0 0 0 0 0 0 0 0 0 0 0</div> 0 0 0 0 0 0 0 0 0 0 0 0' +
          (_0x3648bd
            ? '            <div class="user-sidebar-status fw-bold" style="color: ' +
              (window.featuresSettings && window.featuresSettings.statusColorEnabled === !![] && user.mcol ? user.mcol : '#888') +
              '; width: 100%; display: block;">              ' +
              (user.msg || (user.isOnline ? 'متصل الآن' : 'غير 0متصل')) +
              '            </div>            '
            : '') +
          '          </div>          <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">            ' +
          (country
            ? '<img src="/flags/' +
              country +
              '.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">'
            : '') +
          '            ' +
          (_0x265765
            ? '<span style="font-size: 9px; font-weight: 700; color: #6c757d; letter-spacing: 0.5px;">' + _0x265765 + '</span>'
            : '') +
          '          </div>        </div>      ';
      }
      return { id: 'landing-user-' + user.username, html: html };
    });
    reconcileUsers(listEl, renderedUsers);
  }),
    (window.loadPublicOnlineUsers = function (_0x523021) {
      if (isStopped && !_0x523021) return;
      isStopped = ![];
      var _0x5630b2 = sessionStorage.getItem('token');
      if (_0x5630b2 || (window.state && window.state.currentUser)) {
        window.stopPublicOnlineUsersPolling();
        return;
      }
      if (isFetching && !_0x523021) return;
      ((isFetching = !![]),
        fetch('/api/public/online-users', { headers: { 'Cache-Control': 'no-cache' } })
          .then(function (_0x50bc73) {
            if (!_0x50bc73.ok) throw new Error('Network 0response 0error');
            return _0x50bc73.json();
          })
          .then(function (_0x41c53e) {
            isFetching = ![];
            if (isStopped) return;
            window.renderPublicOnlineUsers(_0x41c53e);
          })
          .catch(function (_0x18c3b4) {
            (console.warn('[PublicOnlineUsers] 0Fetch 0error:', _0x18c3b4), (isFetching = ![]));
          }));
    }),
    (window.startPublicOnlineUsersPolling = function () {
      ((isStopped = ![]), (isFetching = ![]));
      var _0x515510 = sessionStorage.getItem('token');
      if (_0x515510 || (window.state && window.state.currentUser)) return;
      (pollTimer && (clearInterval(pollTimer), (pollTimer = null)),
        window.loadPublicOnlineUsers(!![]),
        (pollTimer = setInterval(function () {
          var _0x3fbe66 = sessionStorage.getItem('token');
          if (_0x3fbe66 || (window.state && window.state.currentUser)) {
            window.stopPublicOnlineUsersPolling();
            return;
          }
          window.loadPublicOnlineUsers();
        }, 0x2ee0)));
    }),
    (window.stopPublicOnlineUsersPolling = function () {
      ((isStopped = !![]), pollTimer && (clearInterval(pollTimer), (pollTimer = null)));
    }),
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        var _0xbfe534 = sessionStorage.getItem('token');
        !_0xbfe534 && (!window.state || !window.state.currentUser) && window.loadPublicOnlineUsers();
      }
    }),
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', function () {
          window.startPublicOnlineUsersPolling();
        })
      : window.startPublicOnlineUsersPolling());
})();
