var _fetch = window.apiFetch || window.fetch;

async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
  try {
    const res = await _fetch(url, options);
    return res;
  } catch (err) {
    if (retries > 0) {
      console.warn(`Fetch failed for ${url}, retrying in ${backoff}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

window.fetchWithRetry = fetchWithRetry;

function escapeHTML(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.escapeHTML = escapeHTML;
window.escapeHtml = escapeHTML;

/**
 * Robust fetch with authentication header and error handling
 */
async function safeFetch(url, options = {}) {
  const token = sessionStorage.getItem('token');
  const headers = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };
  
  // Only set default Content-Type if not already specified and body is NOT FormData
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  const res = await _fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    const hasToken = !!sessionStorage.getItem('token');
    sessionStorage.removeItem('token');
    if (window.location.pathname.startsWith('/cp') || window.location.pathname.startsWith('/admin')) {
      Swal.fire({
        title: 'انتهت الجلسة',
        text: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد',
        icon: 'error',
        confirmButtonText: 'حسناً'
      }).then(() => {
        window.location.href = '/';
      });
    } else {
      if (hasToken) {
        window.location.reload();
      }
    }
    throw new Error('Session expired');
  }

  if (res.ok) {
    return res;
  }
  
  // Handle error
  const contentType = res.headers.get('content-type');
  let errorMessage = 'تعذر إتمام العملية، يرجى التحقق من الجلسة والصلاحيات';
  let responseText = '';
  
  try {
    responseText = await res.text();
  } catch (e) {
    console.error('Failed to read response body text:', e);
  }

  if (contentType && contentType.includes('application/json') && responseText) {
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.message || errorMessage;
      
      // Auto-detect likes limit error and show unified alert
      if (errorMessage && (errorMessage.includes('لايك') || errorMessage.includes('requiredLikes'))) {
        if (window.showLikesLimitAlert) {
          window.showLikesLimitAlert(errorMessage);
          // We still throw to let the caller handle it if needed
        }
      }
    } catch (e) {
      console.error('Failed to parse error response as JSON:', e, responseText);
      // Fallback to text cleanup if it's actually an HTML error page
      if (responseText.includes('<html') || responseText.includes('<body')) {
        const doc = new DOMParser().parseFromString(responseText, 'text/html');
        const textContent = doc.body?.textContent?.trim() || doc.head?.textContent?.trim() || responseText;
        const cleanText = textContent.replace(/\s+/g, ' ').trim();
        if (cleanText && cleanText.length < 300) {
          errorMessage = cleanText;
        } else {
          errorMessage = 'حدث خطأ في السيرفر أثناء معالجة الطلب';
        }
      } else {
        errorMessage = 'حدث خطأ أثناء الاتصال بالسيرفر';
      }
    }
  } else {
    console.error('Non-JSON error response:', responseText);
    if (responseText && (responseText.includes('<html') || responseText.includes('<body'))) {
      try {
        const doc = new DOMParser().parseFromString(responseText, 'text/html');
        const textContent = doc.body?.textContent?.trim() || doc.head?.textContent?.trim() || responseText;
        const cleanText = textContent.replace(/\s+/g, ' ').trim();
        if (cleanText && cleanText.length < 300) {
          errorMessage = cleanText;
        } else {
          errorMessage = 'حدث خطأ في السيرفر أثناء معالجة الطلب';
        }
      } catch (e) {
        errorMessage = 'حدث خطأ أثناء الاتصال بالسيرفر';
      }
    } else if (responseText) {
      errorMessage = responseText;
    } else {
      errorMessage = 'حدث خطأ أثناء الاتصال بالسيرفر';
    }
  }
  
  throw new Error(errorMessage);
}
window.safeFetch = safeFetch;

function secureCreateElement(tagName, attributes = {}, textContent = null) {
  const el = document.createElement(tagName);
  for (const [key, value] of Object.entries(attributes)) {
    el.setAttribute(key, value);
  }
  if (textContent) {
    el.textContent = textContent;
  }
  return el;
}
window.secureCreateElement = secureCreateElement;

/**
 * Phase 6: Safe Linkification helper.
 * Categorizes and neutralizes links based on safety classification.
 */
function safeLinkify(text) {
  if (!text) return '';
  
  let processed = text;

  // 1. Identify suspicious patterns already neutralized by the server (example [dot] com)
  // We wrap them in a span that looks different and isn't clickable
  processed = processed.replace(/([^\s]+)\s+\[dot\]\s+([^\s]+)/gi, (match) => {
    return `<span class="text-muted fw-bold link-neutralized" title="رابط تم تحييده أمنياً">[رابط مشبوه: ${match}]</span>`;
  });

  // 2. Identify remaining raw URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  processed = processed.replace(urlRegex, (url) => {
    // Basic safety check for characters that indicate obfuscation
    if (url.includes('[dot]') || url.includes('@') || url.includes('%2e') || url.includes('%2f')) {
      return `<span class="text-danger fw-bold link-blocked" title="حماية أمنية">[رابط مشبوه أو محجوب]</span>`;
    }

    // Wrap in a secure redirector
    const encodedUrl = encodeURIComponent(url);
    return `<a href="/api/redirect?url=${encodedUrl}" target="_blank" rel="noopener noreferrer" class="safe-link text-decoration-none border-bottom border-primary" title="رابط خارجي مآمن"><i class="fas fa-external-link-alt fa-xs me-1"></i>${url}</a>`;
  });

  return processed;
}
window.safeLinkify = safeLinkify;

window.showClassicAlert = function(text, icon = 'info') {
  let title = 'تنبيه';
  if (icon === 'success') title = 'نجاح';
  if (icon === 'error') title = 'خطأ';
  if (icon === 'warning') title = 'تحذير';
  
  if (window.Swal && window.Swal.fire) {
    window.Swal.fire(title, text, icon);
  } else {
    alert(text);
  }
};

window.superIconWideCache = window.superIconWideCache || {};

window.renderUserIdentity = function(user, options = {}) {
    if (!user) return '';

    const superIcon = user.superIcon || '';
    const gifts = user.gifts || [];
    const topic = user.topic || '';
    const username = user.username || 'مستخدم';
    const ucol = user.ucol || '';
    const bg = user.bg || 'transparent'; 
    const userId = user.id || user.userId || '';

    const nameStyle = options.nameStyle || (ucol ? `color: ${ucol};` : '');
    const nameClasses = options.nameClasses || '';
    let containerClasses = options.containerClasses || '';
    
    // Clean up any old state classes that might have been passed in
    containerClasses = containerClasses
        .replace(/\buser-identity-super-(wide|normal)\b/g, '')
        .trim();

    const containerStyle = options.containerStyle || '';
    const tag = options.tag || 'span';
    const href = options.href ? `href="${escapeHTML(options.href)}"` : 'href="#"';
    const linkOnClick = options.onClick ? `onclick="event.preventDefault(); ${escapeHTML(options.onClick)}"` : 'onclick="event.preventDefault();"';
    const spanOnClick = options.onClick ? `onclick="${escapeHTML(options.onClick)}"` : '';
    
    let bgStyle = '';
    if (bg && bg !== 'transparent') {
        if (bg.startsWith('http') || bg.startsWith('/')) {
            bgStyle = `background: url('${bg}') center/cover;`;
        } else {
            bgStyle = `background: ${bg};`;
        }
        bgStyle += ' padding: 0 4px; border-radius: 2px; display: inline-block;';
    }

    const isWideCached = superIcon ? window.superIconWideCache[escapeHTML(superIcon)] : false;
    const wideClass = isWideCached === true ? 'user-identity-super-wide' : (isWideCached === false && superIcon ? 'user-identity-super-normal' : '');

    const displayName = escapeHTML(topic || username);
    const escapedUsername = escapeHTML(username);
    
    // We need to differentiate name/decoration if it is wide
    let nameHtml = '';
    if (tag === 'a') {
      nameHtml = `<a ${href} ${linkOnClick} class="user-identity-name ${nameClasses}" style="${nameStyle} ${bgStyle}" data-username="${escapedUsername}" data-is-hidden="${user.isHidden ? 'true' : 'false'}" data-role-rank="${user.roleRank || 0}">${displayName}</a>`;
    } else {
      nameHtml = `<span class="user-identity-name ${nameClasses}" style="${nameStyle} ${bgStyle}" data-username="${escapedUsername}" ${spanOnClick} data-is-hidden="${user.isHidden ? 'true' : 'false'}" data-role-rank="${user.roleRank || 0}">${displayName}</span>`;
    }

    let html = `<span class="user-identity ${containerClasses} ${wideClass}" style="${containerStyle}" data-username="${escapedUsername}" data-user-id="${userId}" data-is-hidden="${user.isHidden ? 'true' : 'false'}" data-role-rank="${user.roleRank || 0}">`;

    // Always output nameHtml first
    html += nameHtml;

    // Output speaker muted icon if applicable
    const isPublicMessage = options && options.nameClasses && (options.nameClasses.includes('message-username') || options.nameClasses.includes('quoted-username'));
    if (isPublicMessage && (user.isSpeakerMuted === true || user.isSpeakerMuted === 'true')) {
        html += `<span class="user-identity-speaker-muted" title="كاتم صوت المايكات"><i class="fas fa-volume-mute"></i></span>`;
    }

    // Always output gifts if applicable
    if (gifts && gifts.length > 0 && typeof gifts === 'object') {
        html += `<img src="${escapeHTML(gifts[0])}" class="user-identity-gifts" alt="Gift">`;
    }

    // If superIcon exists, append it next to the name/decoration
    if (superIcon) {
        const iconUrl = escapeHTML(superIcon);
        html += `<img src="${iconUrl}" class="user-identity-super" onload="window.handleUserIdentitySuperLoad(this, '${iconUrl}')" onerror="this.style.display='none'" alt="SuperIcon">`;
    }

    html += `</span>`;
    return html;
};

window.handleUserIdentitySuperLoad = function(img, url) {
    if (!img) return;

    const parent = img.closest('.user-identity');
    if (!parent) return;

    const SUPER_BANNER_MIN_WIDTH = 120;
    const SUPER_BANNER_MIN_ASPECT_RATIO = 1.8;

    const naturalWidth = Number(img.naturalWidth || 0);
    const naturalHeight = Number(img.naturalHeight || 0);

    const isWideBanner =
        naturalWidth >= SUPER_BANNER_MIN_WIDTH &&
        naturalHeight > 0 &&
        (naturalWidth / naturalHeight) >= SUPER_BANNER_MIN_ASPECT_RATIO;

    if (isWideBanner) {
        if (url && window.superIconWideCache) {
            window.superIconWideCache[url] = true;
        }

        parent.classList.remove('user-identity-super-normal');
        parent.classList.add('user-identity-super-wide');
    } else {
        if (url && window.superIconWideCache) {
            window.superIconWideCache[url] = false;
        }

        parent.classList.remove('user-identity-super-wide');
        parent.classList.add('user-identity-super-normal');
    }
};

window.updateSpeakerMutedIcon = function(userId, username, isMuted) {
  const selectors = [];

  if (userId) {
    selectors.push(`#messages-container .user-identity[data-user-id="${CSS.escape(String(userId))}"]`);
  }

  if (username) {
    selectors.push(`#messages-container .user-identity[data-username="${CSS.escape(String(username))}"]`);
  }

  if (!selectors.length) return;

  document.querySelectorAll(selectors.join(',')).forEach(el => {
    let existing = el.querySelector('.user-identity-speaker-muted');
    if (existing) existing.remove();

    if (isMuted) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'user-identity-speaker-muted';
      iconSpan.title = 'كاتم صوت المايكات';
      iconSpan.innerHTML = '<i class="fas fa-volume-mute"></i>';

      const nameEl = el.querySelector('.user-identity-name');
      if (nameEl && nameEl.nextSibling) {
        el.insertBefore(iconSpan, nameEl.nextSibling);
      } else {
        el.appendChild(iconSpan);
      }
    }
  });
};
