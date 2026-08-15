// Lightweight Landing and Login Manager (v3)
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

(function() {
  // Capture previous session termination on page reload
  window.__previousSessionExitPromise = (async () => {
    try {
      const navEntries = performance.getEntriesByType('navigation');
      const isReload = navEntries.length > 0 && navEntries[0]?.type === 'reload';
      const oldClientSessionId = sessionStorage.getItem('chat_client_session_id');
      const oldToken = sessionStorage.getItem('token') || localStorage.getItem('token');

      if (isReload) {
        if (oldClientSessionId && oldToken) {
          console.log('[Landing] Page reload detected. Sending terminal-exit for previous session...');
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2000);
          try {
            await window.fetch('/api/presence/terminal-exit', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${oldToken}`
              },
              body: JSON.stringify({ token: oldToken, clientSessionId: oldClientSessionId, reason: 'terminal-exit' }),
              signal: controller.signal
            }).catch(() => {});
          } finally {
            clearTimeout(timer);
          }
        }
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('chat_client_session_id');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    } catch (e) {
      console.error('[Landing] Reload check error:', e);
    }
  })();

  window.__previousSessionExitPromise.finally(() => {
    if (typeof window.startPublicOnlineUsersPolling === 'function') {
      window.startPublicOnlineUsersPolling();
    }
  });

  async function waitForPreviousSessionExit() {
    if (!window.__previousSessionExitPromise) return;
    try {
      await Promise.race([
        window.__previousSessionExitPromise,
        new Promise(r => setTimeout(r, 2500))
      ]);
    } catch (e) {
      console.warn('[Landing] Error waiting for previous session exit:', e);
    }
  }

  const ui = {
    loginOverlay: document.getElementById('login-overlay'),
    chatShell: document.getElementById('chat-shell'),
    memberForm: document.getElementById('member-login-form'),
    guestForm: document.getElementById('guest-login-form'),
    registerForm: document.getElementById('register-form'),
    showRegister: document.getElementById('show-register'),
    showMemberLogin: document.getElementById('show-member-login'),
    showGuestLogin: document.getElementById('show-guest-login')
  };

  function shakeElement(el) {
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
  }

  window.showAuthMessage = (message, icon = 'error') => {
    if (window.Swal && window.Swal.fire) {
      return window.Swal.fire({
        title: 'تنبيه',
        text: message,
        icon: icon,
        confirmButtonText: 'موافق',
        customClass: { confirmButton: 'btn btn-primary px-5' },
        buttonsStyling: false
      });
    } else {
      alert(message);
    }
  };

  async function getFingerprint() {
    try {
      if (typeof window.FingerprintJS !== 'undefined') {
        const fp = await window.FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId;
      }
    } catch (e) {}
    return 'fp_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  window.createNewClientSessionId = () => {
    const id = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    try {
      sessionStorage.setItem('chat_client_session_id', id);
    } catch (e) {}
    return id;
  };

  async function parseAuthResponse(res) {
    try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await res.json();
      }
      return { success: false, message: await res.text() };
    } catch (err) {
      return null;
    }
  }

  window.buildAuthErrorMessage = (result, fallback) => {
    if (!result) return fallback;
    let msg = result.message || fallback;
    if (result.code === 'BANNED' || result.reason) {
      msg = 'لقد تم حظرك من دخول الدردشة';
      if (result.reason) msg += `\nالسبب: ${result.reason}`;
      if (result.banType === 'permanent') {
        msg += `\nنوع الحظر: دائم`;
      } else if (result.expiresAt || result.banType === 'temporary') {
        msg += `\nنوع الحظر: مؤقت`;
      }
    }
    return msg;
  };

  // Toggle Auth Forms using hidden-form and visible-form
  function showAuthForm(formName) {
    const memberForm = ui.memberForm;
    const guestForm = ui.guestForm;
    const registerForm = ui.registerForm;
    
    const showRegister = ui.showRegister;
    const showMemberLogin = ui.showMemberLogin;
    const showGuestLogin = ui.showGuestLogin;

    [memberForm, guestForm, registerForm].forEach(f => {
      if (f) {
        f.classList.add('hidden-form');
        f.classList.remove('visible-form');
      }
    });

    [showRegister, showMemberLogin, showGuestLogin].forEach(b => {
      if (b) b.classList.remove('active');
    });

    if (formName === 'member') {
      if (memberForm) {
        memberForm.classList.remove('hidden-form');
        memberForm.classList.add('visible-form');
      }
      if (showMemberLogin) showMemberLogin.classList.add('active');
    } else if (formName === 'guest') {
      if (guestForm) {
        guestForm.classList.remove('hidden-form');
        guestForm.classList.add('visible-form');
      }
      if (showGuestLogin) showGuestLogin.classList.add('active');
    } else if (formName === 'register') {
      if (registerForm) {
        registerForm.classList.remove('hidden-form');
        registerForm.classList.add('visible-form');
      }
      if (showRegister) showRegister.classList.add('active');
    }
  }

  ui.showMemberLogin?.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('member'); });
  ui.showGuestLogin?.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('guest'); });
  ui.showRegister?.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('register'); });

  let isAuthInProgress = false;

  const handleMemberLogin = async () => {
    if (isAuthInProgress) return;
    isAuthInProgress = true;

    const btn = document.getElementById('member-login-btn');
    const btnText = btn?.querySelector('.btn-text');
    const spinner = btn?.querySelector('.spinner-border');
    
    if (btn) {
      btn.disabled = true;
      if (btnText) btnText.classList.add('d-none');
      if (spinner) spinner.classList.remove('d-none');
    }

    try {
      await waitForPreviousSessionExit();

      const username = document.getElementById('member-username')?.value;
      const password = document.getElementById('member-password')?.value;
      const isHidden = document.getElementById('login-hidden-input')?.value === 'true';

      if (!username) {
        window.showAuthMessage('يرجى إدخال اسم المستخدم');
        shakeElement(ui.memberForm);
        return;
      }
      if (!password) {
        window.showAuthMessage('يرجى إدخال كلمة المرور');
        shakeElement(ui.memberForm);
        return;
      }

      const fingerprint = await getFingerprint();
      const clientSessionId = window.createNewClientSessionId();
      const data = { username, password, isHidden, fp: fingerprint, clientSessionId };

      const res = await window.fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const result = await parseAuthResponse(res);
      if (!result) {
        window.showAuthMessage('تعذر الاتصال بالسيرفر، يرجى المحاولة لاحقاً');
        return;
      }

      if (!res.ok || result.success === false) {
        const errMsg = window.buildAuthErrorMessage(result, 'اسم المستخدم أو كلمة المرور غير صحيحة');
        window.showAuthMessage(errMsg);
        return;
      }

      await onLoginSuccess({ ...result.user, type: 'member' }, result.token, clientSessionId);
    } catch (err) {
      console.error('[Landing] Login error:', err);
    } finally {
      isAuthInProgress = false;
      if (btn) {
        btn.disabled = false;
        if (btnText) btnText.classList.remove('d-none');
        if (spinner) spinner.classList.add('d-none');
      }
    }
  };

  const handleGuestLogin = async () => {
    if (isAuthInProgress) return;
    isAuthInProgress = true;

    const btn = document.getElementById('guest-login-btn');
    
    if (btn) {
      btn.disabled = true;
    }

    try {
      await waitForPreviousSessionExit();

      const nickname = document.getElementById('guest-nickname')?.value;
      if (!nickname) {
        window.showAuthMessage('يرجى إدخال اسم الزائر');
        shakeElement(ui.guestForm);
        return;
      }

      const fingerprint = await getFingerprint();
      const clientSessionId = window.createNewClientSessionId();
      const data = { nickname, fp: fingerprint, clientSessionId };

      const res = await window.fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await parseAuthResponse(res);
      if (!result) {
        window.showAuthMessage('تعذر الاتصال بالسيرفر، يرجى المحاولة لاحقاً');
        shakeElement(ui.guestForm);
        return;
      }

      if (!res.ok || result.success === false) {
        const errMsg = window.buildAuthErrorMessage(result, 'حدث خطأ أثناء دخول الزائر، يرجى المحاولة لاحقاً');
        window.showAuthMessage(errMsg);
        shakeElement(ui.guestForm);
        return;
      }

      await onLoginSuccess({ ...result.user, type: 'guest' }, result.token, clientSessionId);
    } catch (err) {
      console.error('[Landing] Guest login error:', err);
      shakeElement(ui.guestForm);
    } finally {
      isAuthInProgress = false;
      if (btn) {
        btn.disabled = false;
      }
    }
  };

  const handleRegister = async () => {
    if (isAuthInProgress) return;
    isAuthInProgress = true;

    const btn = document.getElementById('register-btn');
    if (btn) btn.disabled = true;

    try {
      await waitForPreviousSessionExit();

      const username = document.getElementById('register-username')?.value;
      const password = document.getElementById('register-password')?.value;

      if (!username) {
        window.showAuthMessage('يرجى إدخال اسم المستخدم');
        shakeElement(ui.registerForm);
        return;
      }
      if (!password) {
        window.showAuthMessage('يرجى إدخال كلمة المرور');
        shakeElement(ui.registerForm);
        return;
      }

      const fingerprint = await getFingerprint();
      const clientSessionId = window.createNewClientSessionId();
      const data = { username, password, fp: fingerprint, clientSessionId };

      const res = await window.fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await parseAuthResponse(res);
      if (!result) {
        window.showAuthMessage('تعذر الاتصال بالسيرفر، يرجى المحاولة لاحقاً');
        shakeElement(ui.registerForm);
        return;
      }

      if (!res.ok || result.success === false) {
        const errMsg = window.buildAuthErrorMessage(result, 'فشل في عملية التسجيل، يرجى المحاولة لاحقاً');
        window.showAuthMessage(errMsg);
        shakeElement(ui.registerForm);
        return;
      }

      await onLoginSuccess({ ...result.user, type: 'member' }, result.token, clientSessionId);
    } catch (err) {
      console.error('[Landing] Registration error:', err);
      shakeElement(ui.registerForm);
    } finally {
      isAuthInProgress = false;
      if (btn) btn.disabled = false;
    }
  };

  async function onLoginSuccess(user, token, clientSessionId) {
    if (typeof window.stopPublicOnlineUsersPolling === 'function') {
      window.stopPublicOnlineUsersPolling();
    }

    if (user && user.type === 'member' && user.username) {
      localStorage.setItem('chat_member_username', user.username);
      localStorage.setItem('chat_remember_member_name', 'true');
    }

    if (token) {
      try {
        sessionStorage.setItem('token', token);
      } catch (e) {}
    }

    const sessionToUse = clientSessionId || window.createNewClientSessionId();
    sessionStorage.setItem('chat_client_session_id', sessionToUse);

    window._preloadedLoginData = { user, token, clientSessionId: sessionToUse };

    try {
      // Ensure main.js is loaded
      if (!window.__mainScriptLoadingPromise && typeof window.completeChatLogin !== 'function') {
        window.__mainScriptLoadingPromise = new Promise((resolve, reject) => {
          const mainScript = document.createElement('script');
          mainScript.type = 'module';
          mainScript.src = '/js/main.js?v=presence-v20';

          mainScript.onload = () => resolve();
          mainScript.onerror = (err) => {
            console.error('[Landing] Failed to load main.js:', err);
            reject(err);
          };

          document.body.appendChild(mainScript);
        });
      }

      if (window.__mainScriptLoadingPromise) {
        await window.__mainScriptLoadingPromise;
      }

      // Wait for initApp if loading for the first time
      if (window.__chatAppInitPromise) {
        await window.__chatAppInitPromise;
      }

      if (typeof window.completeChatLogin === 'function') {
        await window.completeChatLogin(user, token, sessionToUse);
      } else {
        throw new Error('completeChatLogin function not found');
      }

      // Show chat-shell immediately and hide login-overlay
      if (ui.loginOverlay) ui.loginOverlay.classList.add('d-none');
      if (ui.chatShell) ui.chatShell.classList.remove('d-none');
      if (typeof window.scheduleDelayedViewportSync === 'function') {
        window.scheduleDelayedViewportSync();
      }
    } catch (err) {
      console.error('[Landing] onLoginSuccess failed:', err);
      // If loading script failed, reset promise so user can retry
      if (typeof window.completeChatLogin !== 'function') {
        window.__mainScriptLoadingPromise = null;
      }
      if (ui.chatShell) ui.chatShell.classList.add('d-none');
      if (ui.loginOverlay) ui.loginOverlay.classList.remove('d-none');
      window.showAuthMessage('تعذر الدخول إلى الشات، يرجى المحاولة لاحقاً');
      throw err;
    } finally {
      delete window._preloadedLoginData;
    }
  }

  // Bind events
  if (ui.memberForm) {
    ui.memberForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleMemberLogin();
    });
  }
  document.getElementById('guest-login-btn')?.addEventListener('click', handleGuestLogin);
  document.getElementById('register-btn')?.addEventListener('click', handleRegister);

  document.getElementById('guest-nickname')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGuestLogin(); });
  document.getElementById('register-password')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
  document.getElementById('register-username')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });

  [ui.guestForm, ui.registerForm].forEach(form => {
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
      });
    }
  });

  // Fill saved username if exists
  const savedUsername = localStorage.getItem('chat_member_username');
  const rememberName = localStorage.getItem('chat_remember_member_name');
  if (savedUsername && rememberName === 'true') {
    const memberUsernameInput = document.getElementById('member-username');
    if (memberUsernameInput) memberUsernameInput.value = savedUsername;
  }
})();

