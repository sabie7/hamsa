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
  if (icon === 'error') title = 'عذراً';
  if (icon === 'warning') title = 'عذراً';
  
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
    // Defense-in-depth: these values end up inside inline style="..." so strip
    // anything that could break out of the attribute (quotes, angle brackets,
    // backticks, semicolons, backslashes).
    const safeCssValue = (v) => String(v || '').replace(/["'<>`;\\]/g, '');
    const ucol = safeCssValue(user.ucol || '');
    const bg = safeCssValue(user.bg || '');
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

window.getThumbUrl = function(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (trimmed.includes('/uploads/site/default.png') || trimmed.includes('default-avatar')) return trimmed;
  if (trimmed.includes('_thumb.')) return trimmed;
  if (!trimmed.includes('/uploads/')) return trimmed;
  
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx > -1) {
    return trimmed.substring(0, dotIdx) + '_thumb.webp';
  }
  return trimmed;
};

window.getAvatarUrl = function(user, useThumb = false) {
  let pic = user;
  if (user && typeof user === 'object') {
    pic = user.pic !== undefined ? user.pic : (user.avatar !== undefined ? user.avatar : user.senderAvatar);
  }

  if (pic !== null && pic !== undefined) {
    if (typeof pic === 'string') {
      const trimmed = pic.trim();
      const lower = trimmed.toLowerCase();
      const isInvalid = !trimmed ||
        lower === 'null' ||
        lower === 'undefined' ||
        lower === 'none' ||
        lower.includes('placehold.co') ||
        lower.includes('flaticon.com') ||
        lower === '/default-avatar.png' ||
        lower === '/img/default-avatar.png' ||
        lower === '/images/default-avatar.png' ||
        lower === '/uploads/site/default.png';

      if (!isInvalid) {
        if (useThumb && typeof window.getThumbUrl === 'function') {
          return window.getThumbUrl(trimmed);
        }
        return trimmed;
      }
    }
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
};

window.handleAvatarError = function(imgEl) {
  if (!imgEl) return;

  if (imgEl.src && imgEl.src.includes('_thumb.')) {
    var origSrc = imgEl.dataset.originalSrc || imgEl.src.replace('_thumb.webp', '.webp').replace('_thumb.', '.');
    delete imgEl.dataset.originalSrc;
    if (origSrc && origSrc !== imgEl.src) {
      imgEl.src = origSrc;
      return;
    }
  }

  var currentStage = imgEl.dataset.avatarFallbackStage || 'none';
  var localFallback = '/uploads/site/default.png';

  if (currentStage === 'none') {
    imgEl.dataset.avatarFallbackStage = 'customDefault';

    var showDefault = window.showDefaultAvatar;
    if (showDefault === undefined && window.domainConfig) {
      showDefault = window.domainConfig.showDefaultAvatar;
    }

    var customDefault = window.defaultAvatarUrl;
    if (!customDefault && window.domainConfig && window.domainConfig.defaultAvatarUrl) {
      customDefault = window.domainConfig.defaultAvatarUrl;
    }

    if (showDefault !== false && showDefault !== 'false' && customDefault && typeof customDefault === 'string' && customDefault.trim() !== '') {
      var targetUrl = customDefault.trim();
      if (!imgEl.src.endsWith(targetUrl) && imgEl.src !== targetUrl) {
        imgEl.src = targetUrl;
        return;
      }
    }
  }

  if (currentStage !== 'localFallback') {
    imgEl.dataset.avatarFallbackStage = 'localFallback';
    if (!imgEl.src.endsWith(localFallback) && imgEl.src !== localFallback) {
      imgEl.src = localFallback;
      return;
    }
  }

  imgEl.onerror = null;
};

window.getFrameUrl = function(url, useSmall = true) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (trimmed.includes('_small.')) return trimmed;
  if (!trimmed.includes('/uploads/')) return trimmed;
  if (useSmall && trimmed.endsWith('.webp')) {
    return trimmed.replace(/\.webp$/, '_small.webp');
  }
  return trimmed;
};

window.handleFrameError = function(imgEl) {
  if (!imgEl) return;
  if (imgEl.src && imgEl.src.includes('_small.webp')) {
    const origSrc = imgEl.dataset.originalFrame || imgEl.src.replace('_small.webp', '.webp');
    delete imgEl.dataset.originalFrame;
    imgEl.src = origSrc;
  }
};

window.renderAvatar = function(user, sizeClass = '', extraStyles = '', imgStyles = '', useThumb = true) {
  const fullAvatarUrl = window.getAvatarUrl(user, false);
  const avatarUrl = useThumb ? window.getAvatarUrl(user, true) : fullAvatarUrl;
  const fullFrameUrl = user && user.membershipFrame ? user.membershipFrame : null;
  const frameUrl = (useThumb && fullFrameUrl) ? window.getFrameUrl(fullFrameUrl, true) : fullFrameUrl;
  
  if (frameUrl) {
    return `
      <div class="avatar-with-frame ${sizeClass}" style="position: relative; display: inline-flex; align-items: center; justify-content: center; overflow: visible; flex-shrink: 0; ${extraStyles}">
        <img src="${avatarUrl}" data-original-src="${fullAvatarUrl}" class="avatar-img" loading="lazy" decoding="async" style="width: 78%; height: 78%; object-fit: cover; border-radius: 50%; z-index: 1; ${imgStyles}" onerror="window.handleAvatarError(this)">
        <img src="${frameUrl}" data-original-frame="${fullFrameUrl || ''}" class="avatar-frame" loading="lazy" decoding="async" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; object-fit: cover; box-sizing: border-box;" onerror="window.handleFrameError(this)">
      </div>
    `;
  } else {
    const borderColor = user && user.ucol ? user.ucol : '#222';
    return `
      <div class="avatar-animated-wrapper ${sizeClass}" style="display: inline-flex; align-items: center; justify-content: center; position: relative; border: 2px dotted ${borderColor}; border-radius: 50%; box-sizing: border-box; flex-shrink: 0; animation: spin-border 8s linear infinite; ${extraStyles}">
        <img src="${avatarUrl}" data-original-src="${fullAvatarUrl}" class="avatar-img-inner" loading="lazy" decoding="async" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; animation: spin-border-reverse 8s linear infinite; ${imgStyles}" onerror="window.handleAvatarError(this)">
      </div>
    `;
  }
};

window.normalizeAssetUrl = function(url) {
  if (!url) return '';
  try {
    return new URL(url, window.location.origin).href;
  } catch (e) {
    return String(url);
  }
};

window.syncNodes = function(oldNode, newNode) {
  if (!oldNode || !newNode) return;
  if (oldNode.nodeType !== newNode.nodeType) {
    oldNode.replaceWith(newNode.cloneNode(true));
    return;
  }
  if (oldNode.nodeType === Node.TEXT_NODE) {
    if (oldNode.nodeValue !== newNode.nodeValue) {
      oldNode.nodeValue = newNode.nodeValue;
    }
    return;
  }
  if (oldNode.nodeType === Node.ELEMENT_NODE) {
    if (oldNode.tagName !== newNode.tagName) {
      oldNode.replaceWith(newNode.cloneNode(true));
      return;
    }

    // Sync attributes
    const oldAttrs = oldNode.attributes;
    const newAttrs = newNode.attributes;
    
    // Add/Update new attributes
    for (let i = 0; i < newAttrs.length; i++) {
      const attr = newAttrs[i];
      if (attr.name === 'src' || attr.name === 'background-image' || attr.name === 'href') {
        const oldVal = window.normalizeAssetUrl(oldNode.getAttribute(attr.name));
        const newVal = window.normalizeAssetUrl(attr.value);
        if (oldVal !== newVal) {
          oldNode.setAttribute(attr.name, attr.value);
        }
      } else if (attr.name === 'style') {
         // Special handling for style
         if (oldNode.style.cssText !== newNode.style.cssText) {
             oldNode.style.cssText = newNode.style.cssText;
         }
      } else {
        if (oldNode.getAttribute(attr.name) !== attr.value) {
          oldNode.setAttribute(attr.name, attr.value);
        }
      }
    }
    
    // Remove old attributes that don't exist in new node
    for (let i = oldAttrs.length - 1; i >= 0; i--) {
      const attr = oldAttrs[i];
      if (!newNode.hasAttribute(attr.name)) {
        if (attr.name !== 'data-signature' && attr.name !== 'data-user-sig') {
          oldNode.removeAttribute(attr.name);
        }
      }
    }

    // Sync children
    const oldChildren = Array.from(oldNode.childNodes);
    const newChildren = Array.from(newNode.childNodes);
    const maxLen = Math.max(oldChildren.length, newChildren.length);
    for (let i = 0; i < maxLen; i++) {
      if (!oldChildren[i]) {
        oldNode.appendChild(newChildren[i].cloneNode(true));
      } else if (!newChildren[i]) {
        oldNode.removeChild(oldChildren[i]);
      } else {
        window.syncNodes(oldChildren[i], newChildren[i]);
      }
    }
  }
};

