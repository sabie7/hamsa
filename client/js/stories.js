var _fetch = window.apiFetch || window.fetch;

let stories = [];
let currentStoryIndex = 0;
let currentStoryUserIndex = 0;
let storyTimer = null;
let groupedStories = [];
let currentStoryUploadXhr = null;

// --- Sidebar Story Indicators ---

window.getSidebarStoryInfo = function(userId) {
  if (
    window.featuresSettings?.storiesEnabled === false ||
    window.featuresSettings?.storySidebarIndicatorEnabled === false
  ) {
    return { hasUnviewed: false, count: 0 };
  }

  const group = groupedStories.find(g => sameId(g.user.id, userId));
  if (!group || !Array.isArray(group.stories)) {
    return { hasUnviewed: false, count: 0 };
  }

  const currentUserId =
    window.state?.currentUser?.id ||
    window.currentUser?.id ||
    null;

  const localViewed = JSON.parse(sessionStorage.getItem('viewedStories') || '[]');

  const unviewedStories = group.stories.filter(story => {
    const storyId = String(story.id);

    if (localViewed.includes(storyId)) {
      return false;
    }

    const views = Array.isArray(story.views) ? story.views : [];

    if (!currentUserId) {
      return true;
    }

    return !views.some(v => sameId(v.userId || v.id, currentUserId));
  });

  return {
    hasUnviewed: unviewedStories.length > 0,
    count: unviewedStories.length
  };
};

window.openUserStoriesFromSidebar = function(e, userId) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }

  const userIndex = groupedStories.findIndex(g => sameId(g.user.id, userId));
  if (userIndex !== -1) {
    window.openStoryViewer(userIndex, 0);
  }
};

window.refreshSidebarStoryIndicators = function() {
    if (typeof window.renderUsersInSidebar === 'function') {
        const users = window.state?.currentUsers || window.onlineUsers || [];
        window.renderUsersInSidebar(users);
    }
};

// --- End Sidebar Story Indicators ---

window.cancelStoryUpload = function(event, containerId) {
  if (event) event.stopPropagation();
  if (currentStoryUploadXhr) {
    currentStoryUploadXhr.abort();
    currentStoryUploadXhr = null;
    window.renderStoriesBar(containerId);
    Swal.fire('تنبيه', 'تم إلغاء الرفع', 'info');
  }
};

// Lightweight image preparation (9gag-style): downscale + compress images
// client-side before upload so the site stays fast. Videos pass through.
window.prepareStoryMedia = async function(file) {
  if (!file) return null;
  const isImage = /^image\//.test(file.type) && !/gif/.test(file.type);
  if (!isImage) return file;
  try {
    const maxDim = 1280;          // Instagram-ish cap
    const quality = 0.82;         // JPEG quality balance size vs clarity
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close && bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch (e) {
    console.warn('[stories] image prep failed, uploading original:', e);
    return file;
  }
};

window.fetchStories = async function() {
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch('/api/stories', {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'X-Chat-Token': token
      }
    });
    if (res.ok) {
      stories = await res.json();
      window.renderStoriesBar('wall-stories-container');
      if (typeof window.refreshSidebarStoryIndicators === 'function') {
        window.refreshSidebarStoryIndicators();
      }
    }
  } catch (err) {
    console.error('Error fetching stories:', err);
  }
}

window.renderStoriesBar = function(containerId = 'wall-stories-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Check if stories are enabled in features settings
  if (window.featuresSettings && window.featuresSettings.storiesEnabled === false) {
    container.style.setProperty('display', 'none', 'important');
    return;
  }

  container.style.setProperty('display', 'flex', 'important');

  // If currentUser is not yet loaded, wait and retry
  if (!window.state || !window.state.currentUser) {
    console.debug('Waiting for currentUser to load...');
    setTimeout(() => {
        window.renderStoriesBar(containerId);
    }, 500);
    return;
  }

  // Group stories by user
  const userStoriesMap = new Map();
  stories.forEach(story => {
    if (!userStoriesMap.has(story.userId)) {
      userStoriesMap.set(story.userId, {
        user: story.user,
        stories: []
      });
    }
    userStoriesMap.get(story.userId).stories.push(story);
  });

  groupedStories = Array.from(userStoriesMap.values());
  
  // Sort: current user first, then others
  const currentUserId = window.state?.currentUser?.id;
  groupedStories.sort((a, b) => {
    if (sameId(a.user.id, currentUserId)) return -1;
    if (sameId(b.user.id, currentUserId)) return 1;
    return 0;
  });

  // Always show the add story button
  let html = `
    <div class="story-add-btn ${currentStoryUploadXhr ? 'story-uploading' : ''}" id="story-add-btn-${containerId}" onclick="openAddStoryDirectly('${containerId}')">
      <img src="${window.getAvatarUrl(window.state?.currentUser)}" alt="Avatar" class="story-avatar" data-username="${window.state?.currentUser ? window.state.currentUser.username : ''}">
      <div class="plus-icon">+</div>
      <svg class="story-upload-ring" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#ddd" stroke-width="5" />
        <circle id="story-upload-progress-circle-${containerId}" cx="50" cy="50" r="45" fill="none" stroke="#007bff" stroke-width="5" stroke-dasharray="283" stroke-dashoffset="283" />
      </svg>
      <div class="story-upload-cancel" onclick="cancelStoryUpload(event, '${containerId}')">
        <i class="fas fa-times"></i>
      </div>
      <div class="story-upload-percentage" id="story-upload-perc-${containerId}">0%</div>
    </div>
    <input type="file" id="direct-story-media-input-${containerId}" class="d-none" accept="image/*,video/*,audio/*,.mov,.MOV" onchange="window.submitDirectStory(this.files[0], '${containerId}')">
  `;

  groupedStories.forEach((group, index) => {
    // Check if all stories viewed by current user (views are private now —
    // fall back to the local sessionStorage record for non-owners)
    const localViewed = JSON.parse(sessionStorage.getItem('viewedStories') || '[]');
    const allViewed = group.stories.every(s =>
      localViewed.includes(String(s.id)) ||
      (s.views || []).some(v => sameId(v.userId, currentUserId))
    );
    const borderClass = allViewed ? 'viewed' : '';
    
    html += `
      <div class="story-circle ${borderClass}" onclick="openStoryViewer(${index})">
        <img src="${window.getAvatarUrl(group.user)}" alt="${group.user.username}" class="story-avatar" data-username="${group.user.username}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
        <span class="story-count-badge">${group.stories.length}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.openAddStoryDirectly = function(containerId) {
  document.getElementById(`direct-story-media-input-${containerId}`).click();
};

window.submitDirectStory = async function(file, containerId) {
  file = await window.prepareStoryMedia(file);
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  
  try {
      const token = sessionStorage.getItem('token');
      
      // Update UI to uploading state
      const btn = document.getElementById(`story-add-btn-${containerId}`);
      if (btn) btn.classList.add('story-uploading');
      
      // 1. Upload using XHR for progress
      const uploadRes = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          currentStoryUploadXhr = xhr;
          
          xhr.open('POST', '/api/upload/stories');
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('X-Chat-Token', token || '');
          
          xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                  const percent = Math.round((e.loaded / e.total) * 100);
                  const circle = document.getElementById(`story-upload-progress-circle-${containerId}`);
                  const percText = document.getElementById(`story-upload-perc-${containerId}`);
                  
                  if (circle) {
                      // Circumference is 2 * PI * r = 2 * 3.14 * 45 = 282.6
                      const offset = 283 - (percent / 100) * 283;
                      circle.style.strokeDashoffset = offset;
                  }
                  if (percText) percText.innerText = percent + '%';
              }
          };
          
          xhr.statusText = ''; // help keep track
          xhr.onload = () => {
              currentStoryUploadXhr = null;
              if (xhr.status === 200) {
                  try {
                      resolve(JSON.parse(xhr.responseText));
                  } catch (e) {
                      reject(new Error('Invalid response from server'));
                  }
              } else {
                  let errorMessage = 'فشل رفع الملف';
                  try {
                      const errorData = JSON.parse(xhr.responseText);
                      errorMessage = errorData.message || errorMessage;
                  } catch (e) {}
                  reject(new Error(errorMessage));
              }
          };
          
          xhr.onerror = () => {
              currentStoryUploadXhr = null;
              reject(new Error('خطأ في الاتصال بالسيرفر'));
          };
          
          xhr.onabort = () => {
             currentStoryUploadXhr = null;
             reject(new Error('UPLOAD_ABORTED'));
          };
          
          xhr.send(formData);
      });
      
      // 2. Post story
      const postRes = await fetch('/api/stories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Chat-Token': token
        },
        body: JSON.stringify({ mediaUrl: uploadRes.url, mediaType: uploadRes.mediaType })
      });
      
      if (postRes.ok) {
        window.fetchStories();
      } else {
        let errorMessage = 'خطأ غير معروف';
        try {
          const errorData = await postRes.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          errorMessage = 'فشل نشر الستوري (خطأ في السيرفر)';
        }
        
        if (errorMessage.includes('لايك') || errorMessage.includes('requiredLikes')) {
          window.showLikesLimitAlert(errorMessage);
        } else {
          Swal.fire('عذراً', errorMessage, 'error');
        }
      }
  } catch (err) {
      if (err.message === 'UPLOAD_ABORTED') return;
      
      console.error(err);
      if (err.message && (err.message.includes('لايك') || err.message.includes('requiredLikes'))) {
        window.showLikesLimitAlert(err.message);
      } else {
        Swal.fire('عذراً', err.message, 'error');
      }
  } finally {
      currentStoryUploadXhr = null;
      const input = document.getElementById(`direct-story-media-input-${containerId}`);
      if (input) input.value = '';
      window.renderStoriesBar(containerId);
  }
}

window.submitStory = async function() {
  const mediaInput = document.getElementById('story-media-input');
  const textInput = document.getElementById('story-text-input').value;
  const bgInput = document.getElementById('story-bg-input').value;
  const textColorInput = document.getElementById('story-text-color-input').value;
  const textBgInput = document.getElementById('story-text-bg-input').value;
  
  let mediaUrl = null;
  let mediaType = null;
  
  if (mediaInput.files.length > 0) {
    const prepared = await window.prepareStoryMedia(mediaInput.files[0]);
    if (!prepared) { mediaInput.value = ''; return; }
    const formData = new FormData();
    formData.append('file', prepared);
    
    const progressBar = document.getElementById('upload-progress-bar');
    const progressContainer = document.getElementById('upload-progress-container');
    progressContainer.style.display = 'block';
    
    try {
      const token = sessionStorage.getItem('token');
      // Using XMLHttpRequest for progress tracking
      const uploadResult = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        currentStoryUploadXhr = xhr;
        xhr.open('POST', '/api/upload/stories');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('X-Chat-Token', token || '');
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percent + '%';
            
            // Also update the circular progress if it exists in the background
            const circle = document.getElementById('story-upload-progress-circle');
            const percText = document.getElementById('story-upload-perc');
            const btn = document.getElementById('story-add-btn');
            
            if (btn) btn.classList.add('story-uploading');
            if (circle) {
                const offset = 283 - (percent / 100) * 283;
                circle.style.strokeDashoffset = offset;
            }
            if (percText) percText.innerText = percent + '%';
          }
        };
        
        xhr.onload = () => {
          currentStoryUploadXhr = null;
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            let errorMsg = 'Upload failed';
            try {
                const response = JSON.parse(xhr.responseText);
                errorMsg = response.message || errorMsg;
            } catch (e) {
                // If not JSON, try to extract from HTML
                const doc = new DOMParser().parseFromString(xhr.responseText, 'text/html');
                const textContent = doc.body.textContent || doc.head.textContent || xhr.responseText;
                if (textContent && textContent.includes('Forbidden')) {
                    errorMsg = 'عذراً، لا تملك الصلاحية لرفع الملف.';
                }
            }
            reject(new Error(errorMsg));
          }
        };
        xhr.onerror = () => {
          currentStoryUploadXhr = null;
          reject(new Error('خطأ في الاتصال بالسيرفر'));
        };
        xhr.onabort = () => {
          currentStoryUploadXhr = null;
          reject(new Error('UPLOAD_ABORTED'));
        };
        xhr.send(formData);
      });
      mediaUrl = uploadResult.url || null;
      mediaType = uploadResult.mediaType || null;
    } catch (err) {
      if (err.message === 'UPLOAD_ABORTED') {
        progressContainer.style.display = 'none';
        return;
      }
      console.error('Upload failed', err);
      if (err.message && (err.message.includes('لايك') || err.message.includes('requiredLikes'))) {
        window.showLikesLimitAlert(err.message);
      } else {
        Swal.fire('عذراً', 'فشل رفع الملف: ' + err.message, 'error');
      }
      progressContainer.style.display = 'none';
      return;
    }
  }
  
  if (!mediaUrl && !textInput.trim()) {
    Swal.fire('تنبيه', 'يجب إضافة صورة أو نص', 'warning');
    return;
  }
  
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch('/api/stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Chat-Token': token
      },
      body: JSON.stringify({
        mediaUrl,
        mediaType,
        text: textInput,
        backgroundColor: bgInput,
        textColor: textColorInput,
        textBackgroundColor: textBgInput
      })
    });
    
    if (res.ok) {
      const modalEl = document.getElementById('addStoryModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      window.fetchStories();
    } else {
      let errorData = { message: 'خطأ غير معروف' };
      try {
        const rawText = await res.text();
        try {
          errorData = JSON.parse(rawText);
        } catch (e) {
          // If not JSON, try to extract error from HTML if possible
          const doc = new DOMParser().parseFromString(rawText, 'text/html');
          const textContent = doc.body.textContent || doc.head.textContent || rawText;
          const cleanText = textContent.replace(/\s+/g, ' ').trim();
          
          if (cleanText.includes('Forbidden')) {
              errorData.message = 'عذراً، لا تملك الصلاحية للقيام بهذا الإجراء.';
          } else {
              errorData.message = cleanText.length < 100 ? cleanText : 'خطأ غير معروف من السيرفر';
          }
        }
      } catch (e) {
        console.error('Error parsing error response', e);
      }

      if (errorData.message && (errorData.message.includes('لايك') || errorData.message.includes('requiredLikes'))) {
        showLikesLimitAlert(errorData.message);
      } else {
        Swal.fire('عذراً', 'فشل نشر الستوري: ' + errorData.message, 'error');
      }
    }
  } catch (err) {
    Swal.fire('عذراً', 'فشل نشر الستوري: ' + err.message, 'error');
  } finally {
    currentStoryUploadXhr = null;
    const progressContainer = document.getElementById('upload-progress-container');
    if (progressContainer) progressContainer.style.display = 'none';
    window.renderStoriesBar('wall-stories-container');
  }
}

window.openStoryViewer = function(userIndex, storyIndex = 0) {
  if (!groupedStories[userIndex]) return;
  
  currentStoryUserIndex = userIndex;
  currentStoryIndex = storyIndex;
  
  renderStoryViewer();
}

function sameId(a, b) { return String(a) === String(b); }

function isAdminUser() {
  const cu = window.state?.currentUser || window.currentUser || null;
  if (!cu) return false;
  return !!(cu.isAdmin || cu.role === 'admin' || cu.power === 'admin' ||
    (typeof window.hasPermission === 'function' && window.hasPermission('canManageRooms')));
}

function canUserModerateStory(story) {
  const cu = window.state?.currentUser || window.currentUser || null;
  if (!cu) return false;
  return sameId(story.userId, cu.id || cu.userId) || isAdminUser();
}

window.canCurrentUserModerateStory = canUserModerateStory;
window.isAdminUser = isAdminUser; // references in inline onclick

function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return "الآن";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} د`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} س`;
  
  const days = Math.floor(diffInSeconds / 86400);
  if (days === 1) return "يوم";
  if (days === 2) return "يومان";
  if (days < 11) return `${days} أيام`;
  return `${days} يوم`;
}

let storyRemainingTime = 0;
let storyLastStartTime = 0;
let isPaused = false;
let storyTotalDuration = 10000;

window.renderStoryViewer = function(resume = false) {
  const group = groupedStories[currentStoryUserIndex];
  if (!group) {
    closeStoryViewer();
    return;
  }
  
  const story = group.stories[currentStoryIndex];
  if (!story) {
    // Move to next user
    if (currentStoryUserIndex + 1 < groupedStories.length) {
      openStoryViewer(currentStoryUserIndex + 1, 0);
    } else {
      closeStoryViewer();
    }
    return;
  }
  
  if (!resume) {
    const currentUserId = window.state?.currentUser?.id || window.currentUser?.id || null;
    const isOwnerStory = currentUserId != null && sameId(story.userId, currentUserId);

    // Record view locally for immediate UI response
    const localViewed = JSON.parse(sessionStorage.getItem('viewedStories') || '[]');
    if (!localViewed.includes(String(story.id))) {
        localViewed.push(String(story.id));
        sessionStorage.setItem('viewedStories', JSON.stringify(localViewed));
    }
    
    // Refresh indicators immediately
    if (typeof window.refreshSidebarStoryIndicators === 'function') {
        window.refreshSidebarStoryIndicators();
    }

    // Mark as viewed in DB (skip own stories — owner never counts as viewer)
    if (!isOwnerStory) {
      const token = sessionStorage.getItem('token');
      fetch(`/api/stories/${story.id}/view`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-Chat-Token': token
        }
      });
    }
  }
  
  let viewerContainer = document.getElementById('story-viewer-container');
  if (!viewerContainer) {
    viewerContainer = document.createElement('div');
    viewerContainer.id = 'story-viewer-container';
    viewerContainer.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.9); backdrop-filter: blur(5px);';
    document.body.appendChild(viewerContainer);

    // Protection: disallow right-click, drag-open, screenshot-style save on story media
    viewerContainer.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.story-media, .story-text, .story-right-actions, .story-header, .story-modal-content')) {
        e.preventDefault();
        if (window.showToast) window.showToast('غير مسموح بحفظ محتوى الستوري', 'warning');
      }
    });
    viewerContainer.addEventListener('keydown', (e) => {
      if (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P' || e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
      }
    });
    viewerContainer.addEventListener('dragstart', (e) => {
      if (e.target.closest('.story-media')) e.preventDefault();
    }, true);

    // Lightweight screenshot deterrent: blur/hide media when the tab or
    // window loses focus, restore on focus. One class toggle, no polling.
    function storyProtect() {
      viewerContainer.classList.add('story-viewer-protected');
      const v = document.getElementById('current-story-video');
      if (v && !v.paused) { try { v.pause(); } catch (e) {} }
      const a = document.getElementById('current-story-audio');
      if (a && !a.paused) { try { a.pause(); } catch (e) {} }
    }
    function storyUnprotect() {
      viewerContainer.classList.remove('story-viewer-protected');
      const v = document.getElementById('current-story-video');
      if (v) { try { v.play().catch(() => {}); } catch (e) {} }
      const a = document.getElementById('current-story-audio');
      if (a) { try { a.play().catch(() => {}); } catch (e) {} }
    }
    window._storyBlurH = () => storyProtect();
    window._storyFocusH = () => storyUnprotect();
    window._storyVisH = () => {
      if (document.hidden) storyProtect();
      else storyUnprotect();
    };
    window.addEventListener('blur', window._storyBlurH);
    window.addEventListener('focus', window._storyFocusH);
    document.addEventListener('visibilitychange', window._storyVisH);

    // Add styles for the new UI
    const style = document.createElement('style');
    style.innerHTML = `
      #story-viewer-container .story-media {
        -webkit-user-drag: none;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        touch-action: none;
        pointer-events: none;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      #story-viewer-container .story-media.story-audio {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        background: radial-gradient(circle at 30% 20%, #2a2a4a 0%, #10102a 70%);
      }
      #story-viewer-container .story-music-cover {
        width: 100%;
        height: 100%;
        max-width: 400px;
        max-height: 400px;
        border-radius: 20px;
        background: linear-gradient(135deg, #ff5f6d, #ffc371, #38ef7d);
        background-size: 300% 300%;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), inset 0 0 0 3px rgba(255, 255, 255, 0.25);
        animation: storyMusicGradient 6s ease infinite;
      }
      @keyframes storyMusicGradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      #story-viewer-container .story-music-cover-icon {
        font-size: 64px;
        color: rgba(255, 255, 255, 0.92);
        text-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
      }
      #story-viewer-container .story-media-wrapper {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      #story-viewer-container.story-viewer-protected .story-media,
      #story-viewer-container.story-viewer-protected .story-text,
      #story-viewer-container.story-viewer-protected .story-header,
      #story-viewer-container.story-viewer-protected .story-right-actions {
        filter: blur(14px) opacity(0.25) !important;
        transition: filter 0.15s ease;
      }
      .story-right-actions {
        position: absolute;
        right: 15px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        gap: 18px;
        z-index: 20;
        background: rgba(0, 0, 0, 0.3);
        padding: 20px 10px;
        border-radius: 40px;
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      }
      .story-action-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        color: white;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      .story-action-item:hover {
        transform: scale(1.15);
        color: #ddd;
      }
      .story-action-item:active { 
        transform: scale(0.85); 
      }
      .story-action-item i { 
        font-size: 19px; 
        margin-bottom: 5px;
      }
      .story-action-item span { 
        font-size: 10px; 
        font-weight: 600; 
        opacity: 0.9;
        letter-spacing: 0.5px;
      }
      
      .story-header-info {
        display: flex;
        flex-direction: column;
        margin-left: 10px;
      }
      .story-time-text {
        font-size: 11px;
        color: rgba(255,255,255,0.7);
      }
      
      .story-like-anim { animation: heartBeat 0.4s ease-in-out; }
      @keyframes heartBeat {
        0% { transform: scale(1); }
        50% { transform: scale(1.4); }
        100% { transform: scale(1); }
      }
      
      #story-interactions-modal, #story-comments-modal {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: white;
        border-radius: 20px 20px 0 0;
        max-height: 70%;
        overflow-y: auto;
        z-index: 100;
        padding: 20px;
        transform: translateY(100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      #story-interactions-modal.show, #story-comments-modal.show { transform: translateY(0); }
      .interaction-row, .comment-row {
        display: flex;
        align-items: flex-start;
        padding: 12px 0;
        border-bottom: 1px solid #f0f0f0;
      }
      .interaction-avatar, .comment-avatar { 
        width: 35px; height: 35px; border-radius: 50%; margin-right: 12px; border: 1px solid #eee; flex-shrink: 0;
      }
      .comment-content { flex: 1; }
      .comment-user { font-weight: bold; font-size: 13px; display: flex; align-items: center; }
      .comment-text { font-size: 14px; color: #333; margin-top: 2px; line-height: 1.4; word-break: break-word; }
      .story-comment-input-area {
        display: flex;
        gap: 10px;
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #eee;
      }
      .story-comment-input {
        flex: 1;
        border: 1px solid #ddd;
        border-radius: 20px;
        padding: 8px 15px;
        outline: none;
        font-size: 14px;
      }
      .story-comment-send {
        background: #007bff;
        color: white;
        border: none;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `;
    document.head.appendChild(style);
  }
  
  const currentUser = window.state?.currentUser || null;
  const currentUserId = currentUser?.id || null;

  if (!resume) {
    let progressHtml = '';
    for (let i = 0; i < group.stories.length; i++) {
        let stateClass = '';
        if (i < currentStoryIndex) stateClass = 'completed';
        else if (i === currentStoryIndex) stateClass = 'active';
        
        progressHtml += `
        <div class="story-progress-segment ${stateClass}">
            <div class="story-progress-fill"></div>
        </div>
        `;
    }
    
    const isOwner = sameId(story.userId, currentUserId);
    const isAdmin = isAdminUser();
    const ownerCanViewStats = isOwner; // only the owner sees likes/views counts & lists
    const isLiked = story.likedByMe != null ? !!story.likedByMe : (story.likes || []).some(l => sameId(l.userId, currentUserId));
    const canDelete = isOwner || isAdmin;
    
    let mediaHtml = '';
    if (story.mediaUrl) {
        if (story.mediaUrl.match(/\.(mp4|webm|mov|avi|m4v|ogg)$/i) || story.mediaType === 'video') {
        mediaHtml = `<video src="${story.mediaUrl}" id="current-story-video" class="story-media" autoplay playsinline draggable="false" oncontextmenu="return false;"></video>`;
        } else if (story.mediaType === 'audio' || story.mediaUrl.match(/\.(mp3|wav|oga|m4a|aac|flac|opus|weba)$/i)) {
        mediaHtml = `
          <div class="story-media story-audio" draggable="false" oncontextmenu="return false;">
            <div class="story-music-cover">
              <div class="story-music-cover-icon"><i class="fas fa-music"></i></div>
            </div>
            <audio id="current-story-audio" src="${story.mediaUrl}" autoplay preload="auto" playsinline style="display: none;"></audio>
          </div>
        `;
        } else {
        mediaHtml = `<img src="${story.mediaUrl}" class="story-media" draggable="false" oncontextmenu="return false;" alt="">`;
        }
    }
    
    viewerContainer.innerHTML = `
        <div class="story-modal-content" style="position: relative; width: 100%; max-width: 400px; height: 80%; max-height: 80vh; background: ${story.backgroundColor || '#000'}; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <div class="story-progress-bar">${progressHtml}</div>
        <div class="story-header" style="display: flex; align-items: center; padding: 15px; background: linear-gradient(to bottom, rgba(0,0,0,0.5), transparent); position: absolute; top:0; left:0; right:0; z-index: 10;">
            <img src="${window.getAvatarUrl(group.user)}" class="story-user-avatar story-avatar" style="width:38px; height:38px; border: 2px solid white;" data-username="${group.user.username}">
            <div class="story-header-info">
            <div class="text-white fw-bold text-shadow" style="font-size: 14px; display: flex; align-items: center;">
             ${window.renderUserIdentity(group.user, {
                 nameStyle: 'color: white; font-weight: bold;',
                 containerClasses: 'user-addon-container'
             })}
            </div>
            <span class="story-time-text">${getRelativeTime(story.createdAt)}</span>
            </div>
            <button class="btn btn-link text-white ms-auto" onclick="closeStoryViewer()"><i class="fas fa-times"></i></button>
        </div>
        
        <div class="story-nav-btn left" style="position: absolute; left:0; top:0; bottom:0; width:30%; z-index: 5;" onclick="prevStory(event)"></div>
        <div class="story-nav-btn right" style="position: absolute; right:0; top:0; bottom:0; width:30%; z-index: 5;" onclick="nextStory(event)"></div>
        
        <div class="story-media-wrapper" style="width:100%; height:100%; display: flex; align-items: center; justify-content: center;">
            ${mediaHtml}
        </div>

        ${story.text ? `
            <div class="story-text-container" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80%; text-align: center; z-index: 6;">
            <div class="story-text text-shadow" style="color: ${story.textColor || '#fff'}; background-color: ${story.textBackgroundColor || 'transparent'}; padding: 12px 18px; border-radius: 8px; font-size: 18px; font-weight: 500; display: inline-block;">${story.text}</div>
            </div>
        ` : ''}
        
        <!-- Right Side Vertical Panel -->
        <div class="story-right-actions">
            ${isOwner ? `
            <div class="story-action-item" onclick="showStoryInteractions('views')" title="المشاهدات">
                <i class="fas fa-eye"></i>
                <span>${story.views ? story.views.length : 0}</span>
            </div>
            <div class="story-action-item" onclick="showStoryInteractions('likes')" title="قائمة المعجبين">
                <i class="fas fa-users"></i>
                <span>${story.likes ? story.likes.length : 0}</span>
            </div>
            ` : ''}
            ${!isOwner ? `
            <div class="story-action-item ${isLiked ? 'story-liked' : ''}" onclick="likeStory('${story.id}', event)" title="أعجبني">
                <i class="fas fa-heart ${isLiked ? 'text-danger story-like-anim' : ''}"></i>
                <span>${isLiked ? 'لايك' : 'أعجبني'}</span>
            </div>
            ` : ''}
            <div class="story-action-item" onclick="toggleStoryComments()" title="التعليقات">
                <i class="fas fa-comment"></i>
                <span>${story.comments ? story.comments.length : 0}</span>
            </div>
            ${canDelete ? `
            <div class="story-action-item text-danger" onclick="deleteStory('${story.id}')" title="حذف">
                <i class="fas fa-trash"></i>
                <span>حذف</span>
            </div>
            ` : ''}
            ${isAdmin && !isOwner ? `
            <div class="story-action-item text-warning" onclick="toggleStoryBan('${story.userId}')" title="منع من نشر الستوريات">
                <i class="fas fa-ban"></i>
                <span>منع النشر</span>
            </div>
            ` : ''}
        </div>

        <!-- Modals -->
        <div id="story-interactions-modal"></div>
        <div id="story-comments-modal"></div>
        </div>
    `;
  }

  // Update interaction UI (likes, views, comments) even if just resuming/refreshing
  const rightActions = viewerContainer.querySelector('.story-right-actions');
  if (rightActions) {
      const isOwner = sameId(story.userId, currentUserId);
      const isAdmin = isAdminUser();
      const isLiked = story.likedByMe != null ? !!story.likedByMe : (story.likes || []).some(l => sameId(l.userId, currentUserId));
      const canDelete = isOwner || isAdmin;
      rightActions.innerHTML = `
          ${isOwner ? `
          <div class="story-action-item" onclick="showStoryInteractions('views')" title="المشاهدات">
              <i class="fas fa-eye"></i>
              <span>${story.views ? story.views.length : 0}</span>
          </div>
          <div class="story-action-item" onclick="showStoryInteractions('likes')" title="قائمة المعجبين">
          <i class="fas fa-users"></i>
          <span>${story.likes ? story.likes.length : 0}</span>
          </div>
          ` : ''}
          ${!isOwner ? `
          <div class="story-action-item ${isLiked ? 'story-liked' : ''}" onclick="likeStory('${story.id}', event)" title="أعجبني">
          <i class="fas fa-heart ${isLiked ? 'text-danger story-like-anim' : ''}"></i>
          <span>${isLiked ? 'لايك' : 'أعجبني'}</span>
          </div>
          ` : ''}
          <div class="story-action-item" onclick="toggleStoryComments()" title="التعليقات">
          <i class="fas fa-comment"></i>
          <span>${story.comments ? story.comments.length : 0}</span>
          </div>
          ${canDelete ? `
          <div class="story-action-item text-danger" onclick="deleteStory('${story.id}')" title="حذف">
              <i class="fas fa-trash"></i>
              <span>حذف</span>
          </div>
          ` : ''}
          ${isAdmin && !isOwner ? `
          <div class="story-action-item text-warning" onclick="toggleStoryBan('${story.userId}')" title="منع من نشر الستوريات">
              <i class="fas fa-ban"></i>
              <span>منع النشر</span>
          </div>
          ` : ''}
      `;
  }

  const video = viewerContainer.querySelector('#current-story-video');
  const fill = viewerContainer.querySelector('.story-progress-segment.active .story-progress-fill');
  
  if (!resume) {
    clearTimeout(storyTimer);
    const audio = viewerContainer.querySelector('#current-story-audio');
    if (video) {
        video.onloadedmetadata = () => {
           const vDur = video.duration;
           storyTotalDuration = vDur * 1000;
           storyRemainingTime = storyTotalDuration;
           if (fill) fill.style.animationDuration = `${vDur}s`;
           startStoryTimer(storyRemainingTime);
        };
        video.onended = () => window.nextStory();
    } else if (audio) {
        audio.onloadedmetadata = () => {
           const aDur = (Number.isFinite(audio.duration) && audio.duration > 0) ? audio.duration : 10000;
           storyTotalDuration = aDur * 1000;
           storyRemainingTime = storyTotalDuration;
           if (fill) fill.style.animationDuration = `${aDur}s`;
           startStoryTimer(storyRemainingTime);
        };
        audio.onended = () => window.nextStory();
        audio.onerror = () => { audio.onerror = null; startStoryTimer(10000); };
    } else {
        storyTotalDuration = 10000;
        storyRemainingTime = storyTotalDuration;
        startStoryTimer(storyRemainingTime);
        if (fill) fill.style.animationDuration = `10s`;
    }
  } else {
    // Resume
    startStoryTimer(storyRemainingTime);
  }
}

function startStoryTimer(duration) {
    clearTimeout(storyTimer);
    storyLastStartTime = Date.now();
    isPaused = false;
    
    storyTimer = setTimeout(() => {
        window.nextStory();
    }, duration);
}

window.showStoryInteractions = function(type) {
  const group = groupedStories[currentStoryUserIndex];
  const story = group.stories[currentStoryIndex];
  const data = type === 'likes' ? (story.likes || []) : (story.views || []);
  const title = type === 'likes' ? 'المعجبون' : 'المشاهدون';
  
  const modal = document.getElementById('story-interactions-modal');
  if (!modal) return;

  // Pause
  pauseStory();

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h5 style="margin: 0; font-weight: bold; color: #333;">${title} (${data.length})</h5>
      <button class="btn-close" onclick="closeInteractionsModal()"></button>
    </div>
    <div style="max-height: 400px; overflow-y: auto;">
  `;

  if (data.length === 0) {
    html += `<div style="text-align:center; color: #888; padding: 20px;">لا يوجد بيانات حتى الآن</div>`;
  } else {
    data.forEach(item => {
      const u = item.user || item;
      if (!u) return;
      
      html += `
        <div class="interaction-row" onclick="openUserProfile('${u.id || u.userId}')" style="cursor: pointer;">
          <img src="${window.getAvatarUrl(u)}" class="interaction-avatar">
          <div style="flex: 1;">
            <div style="font-weight: bold; display: flex; align-items: center;">
              ${window.renderUserIdentity(u, {
                  nameStyle: `color: ${u.ucol || '#333'}; font-weight: bold;`,
                  containerClasses: 'user-addon-container'
              })}
            </div>
          </div>
        </div>
      `;
    });
  }
  html += `</div>`;
  
  modal.innerHTML = html;
  modal.classList.add('show');
}

function pauseStory() {
    if (isPaused) return;
    isPaused = true;
    clearTimeout(storyTimer);
    const elapsed = Date.now() - storyLastStartTime;
    storyRemainingTime = Math.max(0, storyRemainingTime - elapsed);
    
    const video = document.getElementById('current-story-video');
    if (video) video.pause();
    const audio = document.getElementById('current-story-audio');
    if (audio && !audio.paused) { try { audio.pause(); } catch (e) {} }
    
    const fill = document.querySelector('.story-progress-segment.active .story-progress-fill');
    if (fill) {
        fill.style.animationPlayState = 'paused';
    }
}

function resumeStory() {
    if (!isPaused) return;
    const video = document.getElementById('current-story-video');
    if (video) video.play();
    const audio = document.getElementById('current-story-audio');
    if (audio) { try { audio.play().catch(() => {}); } catch (e) {} }
    
    const fill = document.querySelector('.story-progress-segment.active .story-progress-fill');
    if (fill) fill.style.animationPlayState = 'running';
    
    startStoryTimer(storyRemainingTime);
}

window.closeInteractionsModal = function() {
  const modal = document.getElementById('story-interactions-modal');
  if (modal) modal.classList.remove('show');
  resumeStory();
}

window.toggleStoryComments = function() {
  const modal = document.getElementById('story-comments-modal');
  if (!modal) return;
  
  if (modal.classList.contains('show')) {
    modal.classList.remove('show');
    resumeStory();
  } else {
    pauseStory();
    renderStoryComments();
    modal.classList.add('show');
  }
}

window.renderStoryComments = function() {
  const modal = document.getElementById('story-comments-modal');
  const group = groupedStories[currentStoryUserIndex];
  const story = group.stories[currentStoryIndex];
  const comments = story.comments || [];
  
  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h5 style="margin: 0; font-weight: bold; color: #333;">التعليقات (${comments.length})</h5>
      <button class="btn-close" onclick="toggleStoryComments()"></button>
    </div>
    <div id="comments-list" style="max-height: 300px; overflow-y: auto;">
  `;
  
  if (comments.length === 0) {
    html += `<div id="no-comments" style="text-align:center; color: #888; padding: 20px;">لا يوجد تعليقات بعد</div>`;
  } else {
    comments.forEach(c => {
      html += `
        <div class="comment-row">
          <img src="${window.getAvatarUrl(c.user)}" class="comment-avatar">
          <div class="comment-content">
            <div class="comment-user" style="display: flex; align-items: center;">
                ${window.renderUserIdentity(c.user, {
                    nameStyle: `color: ${c.user.ucol || '#333'}; font-weight: bold;`,
                    containerClasses: 'user-addon-container'
                })}
            </div>
            <div class="comment-text">${c.msg}</div>
            <div style="font-size: 10px; color: #999; margin-top: 4px;">${getRelativeTime(c.createdAt)}</div>
          </div>
        </div>
      `;
    });
  }
  
  html += `
    </div>
    <div class="story-comment-input-area">
      <input type="text" id="story-comment-field" class="story-comment-input" placeholder="اكتب تعليقاً..." onkeypress="if(event.key === 'Enter') sendStoryComment('${story.id}')">
      <button class="story-comment-send" onclick="sendStoryComment('${story.id}')">
        <i class="fas fa-paper-plane"></i>
      </button>
    </div>
  `;
  
  modal.innerHTML = html;
}

window.sendStoryComment = async function(storyId) {
  const input = document.getElementById('story-comment-field');
  const msg = input.value.trim();
  if (!msg) return;
  
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/api/stories/${storyId}/comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Chat-Token': token
      },
      body: JSON.stringify({ msg })
    });
    
    if (res.ok) {
      input.value = '';
      const comment = await res.json();
      
      // Update local state
      const group = groupedStories[currentStoryUserIndex];
      const story = group.stories[currentStoryIndex];
      if (!story.comments) story.comments = [];
      story.comments.push(comment);
      
      // Refresh UI
      renderStoryComments();
      renderStoryViewer(true);
    }
  } catch (err) {
    console.error('Error sending comment:', err);
  }
}



window.nextStory = function(e) {
  if (e) e.stopPropagation();
  clearTimeout(storyTimer);
  
  const group = groupedStories[currentStoryUserIndex];
  if (currentStoryIndex + 1 < group.stories.length) {
    // Next story in current user's list
    openStoryViewer(currentStoryUserIndex, currentStoryIndex + 1);
  } else if (currentStoryUserIndex + 1 < groupedStories.length) {
    // Next user's first story
    openStoryViewer(currentStoryUserIndex + 1, 0);
  } else {
    // No more stories, close
    closeStoryViewer();
  }
}

window.prevStory = function(e) {
  if (e) e.stopPropagation();
  clearTimeout(storyTimer);
  if (currentStoryIndex > 0) {
    openStoryViewer(currentStoryUserIndex, currentStoryIndex - 1);
  } else if (currentStoryUserIndex > 0) {
    const prevGroup = groupedStories[currentStoryUserIndex - 1];
    openStoryViewer(currentStoryUserIndex - 1, prevGroup.stories.length - 1);
  }
}

window.closeStoryViewer = function() {
  clearTimeout(storyTimer);
  const container = document.getElementById('story-viewer-container');
  if (container) container.remove();
  if (window._storyBlurH) window.removeEventListener('blur', window._storyBlurH);
  if (window._storyFocusH) window.removeEventListener('focus', window._storyFocusH);
  if (window._storyVisH) document.removeEventListener('visibilitychange', window._storyVisH);
  fetchStories(); // Refresh to update viewed status
  if (typeof window.refreshSidebarStoryIndicators === 'function') window.refreshSidebarStoryIndicators();
}

window.deleteStory = async function(storyId) {
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/api/stories/${storyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Chat-Token': token
      }
    });
    if (res.ok) {
      closeStoryViewer();
      fetchStories();
    } else {
      let msg = 'تعذر الحذف';
      try { msg = (await res.json()).error || msg; } catch (e) {}
      if (window.showClassicAlert) window.showClassicAlert(msg);
    }
  } catch (err) {
    console.error(err);
  }
};

window.toggleStoryBan = async function(userId) {
  const token = sessionStorage.getItem('token');
  // discover current ban state from any story by this user
  const byUser = stories.find(s => sameId(s.userId, userId));
  let currentlyBanned = false;
  try {
    const bans = await (await fetch('/api/admin/stories/bans', { headers: { 'Authorization': `Bearer ${token}`, 'X-Chat-Token': token } })).json();
    currentlyBanned = !!(bans.banned || []).some(id => sameId(id, userId));
  } catch (e) {}
  const action = currentlyBanned ? 'إلغاء منع النشر' : 'منع المستخدم من نشر الستوريات';
  if (!window.confirm('تأكيد: ' + action + '؟')) return;
  const res = await fetch('/api/admin/stories/ban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Chat-Token': token },
    body: JSON.stringify({ userId, banned: !currentlyBanned })
  });
  if (res.ok) {
    const data = await res.json();
    if (window.showClassicAlert) window.showClassicAlert(data.banned ? 'تم منع المستخدم من نشر الستوريات' : 'تم إلغاء المنع');
    else alert(data.banned ? 'تم المنع' : 'تم إلغاء المنع');
    fetchStories();
  } else {
    let msg = 'المنع فشل';
    try { msg = (await res.json()).error || msg; } catch (e) {}
    if (window.showClassicAlert) window.showClassicAlert(msg); else alert(msg);
  }
};

let isLikingStory = false;
window.likeStory = async function(storyId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (isLikingStory) return;

  const currentUser = window.state?.currentUser;
  if (!currentUser) return;

  const currentUserId = String(currentUser.id || currentUser.userId);
  
  // Find the story in local state
  const story = stories.find(s => sameId(s.id, storyId));
  if (!story) return;

  // Optimistic UI: Update local state immediately.
  // For non-owners the likes array is private — track via likedByMe.
  const wasLiked = story.likedByMe != null ? !!story.likedByMe : (story.likes || []).some(l => sameId(l.userId, currentUserId));
  story.likedByMe = !wasLiked;
  if (story.likes) {
    const existingLikeIndex = story.likes.findIndex(l => sameId(l.userId, currentUserId));
    if (story.likedByMe) {
      if (existingLikeIndex === -1) story.likes.push({ userId: currentUserId, user: currentUser, username: currentUser.username, pic: currentUser.pic || 'pic.png' });
    } else if (existingLikeIndex !== -1) {
      story.likes.splice(existingLikeIndex, 1);
    }
  }

  // Update groupedStories as well (it references the same story objects, but let's be sure)
  // Since groupedStories is derived from stories array, updating stories objects usually reflects there 
  // but if it was deep cloned we'd need to find it there too. 
  // In the current renderStoriesBar, it creates new arrays but same objects.

  // Refresh the viewer UI immediately
  window.renderStoryViewer(true);
  
  isLikingStory = true;
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/api/stories/${storyId}/like`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'X-Chat-Token': token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Revert state on failure
      story.likedByMe = wasLiked;
      window.renderStoryViewer(true);
      
      console.error('Failed to like story:', data);
      if (window.showClassicAlert) {
        window.showClassicAlert(data.message || 'تعذر تسجيل اللايك');
      } else {
        alert(data.message || 'تعذر تسجيل اللايك');
      }
    } else {
        // Success: optionally update with server data if needed, but local is usually enough
        story.likedByMe = !!data.liked;
        window.renderStoryViewer(true);
    }
  } catch (err) {
    // Revert state on network error
    story.likedByMe = wasLiked;
    window.renderStoryViewer(true);
    console.error('Error liking story:', err);
  } finally {
    isLikingStory = false;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for token to be available
  setTimeout(fetchStories, 1000);
});

// Listen for socket events if socket is available
if (window.socket) {
  window.socket.on('new-story', (story) => {
    fetchStories();
  });
  window.socket.on('stories_cleared', () => {
    stories = [];
    groupedStories = [];
    if (typeof window.closeStoryViewer === 'function') window.closeStoryViewer();
    if (typeof window.renderStoriesBar === 'function') window.renderStoriesBar('wall-stories-container');
  });
  window.socket.on('stories:updated', () => {
    fetchStories();
  });
  // Lightweight targeted updates (no full refetch)
  function currentViewedStoryId() {
    const group = groupedStories[currentStoryUserIndex];
    if (!group) return null;
    const s = group.stories[currentStoryIndex];
    return s ? String(s.id) : null;
  }
  window.socket.on('story:like', (data) => {
    const story = stories.find(s => String(s.id) === String(data.storyId));
    if (!story) { fetchStories(); return; }
    const me = window.state?.currentUser;
    const meId = me ? String(me.id || me.userId) : null;
    if (meId && data.liked === true && meId === String(data.byUserId)) {
      story.likedByMe = true;
    } else if (meId && data.liked === false && meId === String(data.byUserId)) {
      story.likedByMe = false;
    }
    // Owner: keep the local likes list/count in sync
    if (meId && String(story.userId) === meId && data.like) {
      if (!story.likes) story.likes = [];
      const idx = story.likes.findIndex(l => String(l.userId) === String(data.like.userId));
      if (data.liked && idx === -1) {
        story.likes.unshift(data.like);
      } else if (!data.liked && idx !== -1) {
        story.likes.splice(idx, 1);
      }
      story.likesCount = story.likes.length;
    }
    const isViewerOpen = document.getElementById('story-viewer-container');
    const isOwnerViewing = meId != null && String(story.userId) === meId;
    if (isViewerOpen && currentViewedStoryId() === String(story.id)) {
      window.renderStoryViewer(true);
      const ownersModal = document.getElementById('story-interactions-modal');
      if (ownersModal && ownersModal.classList.contains('show') && isOwnerViewing) {
        window.showStoryInteractions('likes');
      }
    }
    renderStoriesBar('wall-stories-container');
  });
  window.socket.on('story:view', (data) => {
    const story = stories.find(s => String(s.id) === String(data.storyId));
    if (!story) { fetchStories(); return; }
    const me = window.state?.currentUser;
    const meId = me ? String(me.id || me.userId) : null;
    // Only the owner receives view entries into their private list
    if (meId && String(story.userId) === meId && data.view) {
      if (!story.views) story.views = [];
      if (!story.views.some(v => String(v.userId) === String(data.view.userId))) {
        story.views.unshift(data.view);
      }
      story.viewsCount = story.views.length;
    }
    const isViewerOpen = document.getElementById('story-viewer-container');
    const isOwnerViewer = meId != null && String(story.userId) === meId;
    if (isViewerOpen && currentViewedStoryId() === String(story.id)) {
      window.renderStoryViewer(true);
      const intModal = document.getElementById('story-interactions-modal');
      if (intModal && intModal.classList.contains('show') && isOwnerViewer) {
        window.showStoryInteractions('views');
      }
    }
    renderStoriesBar('wall-stories-container');
  });
  window.socket.on('story:comment', (data) => {
    const story = stories.find(s => String(s.id) === String(data.storyId));
    if (!story) { fetchStories(); return; }
    if (!story.comments) story.comments = [];
    story.comments.push(data.comment);
    renderStoriesBar('wall-stories-container');
  });
  window.socket.on('story:delete', (data) => {
    const before = stories.length;
    stories = stories.filter(s => String(s.id) !== String(data.storyId));
    if (stories.length !== before) {
      groupedStories = [];
      if (typeof window.closeStoryViewer === 'function') window.closeStoryViewer();
      if (typeof window.renderStoriesBar === 'function') window.renderStoriesBar('wall-stories-container');
      if (typeof window.refreshSidebarStoryIndicators === 'function') window.refreshSidebarStoryIndicators();
    }
  });
}
