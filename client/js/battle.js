/**
 * Battle Challenge / نظام تحدي الجولات داخل الغرف
 * Client-Side Socket integration and responsive live visual controls
 */

(function () {
  const PANEL_ID = 'battle-challenge-panel';
  let activeBattleId = null;
  let activePlayer1Id = null;
  let activePlayer2Id = null;
  let currentBattle = null;
  let isBattleMinimized = false;

  function toggleBattleMinimization(minimize) {
    isBattleMinimized = !!minimize;
    const panel = document.getElementById('battle-challenge-panel');
    const indicator = document.getElementById('battle-minimized-indicator');
    
    if (minimize) {
      if (panel) {
        panel.classList.add('d-none');
        panel.style.display = 'none';
      }
      if (indicator) {
        indicator.classList.remove('d-none');
        updateMinimizedIndicatorValues();
      }
    } else {
      if (panel) {
        panel.classList.remove('d-none');
        panel.style.display = 'block';
      }
      if (indicator) {
        indicator.classList.add('d-none');
      }
    }
  }

  function updateMinimizedIndicatorValues() {
    const roundEl = document.getElementById('mini-bt-round');
    const timerEl = document.getElementById('mini-bt-timer');
    const p1ScoreEl = document.getElementById('mini-bt-p1-score');
    const p2ScoreEl = document.getElementById('mini-bt-p2-score');

    const mainRound = '1';
    const mainTimer = document.getElementById('bt-timer-value')?.textContent || '60';
    const mainP1Score = document.getElementById('bt-player1-score')?.textContent || '0';
    const mainP2Score = document.getElementById('bt-player2-score')?.textContent || '0';

    if (roundEl) roundEl.textContent = mainRound;
    if (timerEl) timerEl.textContent = mainTimer;
    if (p1ScoreEl) p1ScoreEl.textContent = mainP1Score;
    if (p2ScoreEl) p2ScoreEl.textContent = mainP2Score;
  }

  function renderBattleIdentity(player, options = {}) {
    if (!player) return 'عضو';
    if (typeof window.renderUserIdentity === 'function') {
      return window.renderUserIdentity(player, { tag: 'span', ...options });
    }
    return player.topic || player.username || player.name || 'عضو';
  }

  function getBattlePlainName(player) {
    return player?.topic || player?.username || player?.name || 'عضو';
  }

  function getBattleAvatarUrl(player) {
    if (typeof window.getAvatarUrl === 'function') {
      return window.getAvatarUrl(player);
    }

    if (player && typeof player.pic === 'string' && player.pic.trim() !== '') {
      return player.pic;
    }

    return window.defaultAvatarUrl || '/uploads/site/default.png';
  }

  function setBattleAvatar(imgId, player) {
    const img = document.getElementById(imgId);
    if (!img) return;

    img.src = getBattleAvatarUrl(player);
    img.setAttribute('referrerpolicy', 'origin-when-cross-origin');

    img.onerror = function () {
      window.handleAvatarError(this);
    };
  }

  function getActiveRoundArabicWord(round) {
    switch (Number(round)) {
      case 1: return 'الأولى';
      case 2: return 'الثانية';
      case 3: return 'الثالثة';
      case 4: return 'الرابعة';
      case 5: return 'الخامسة';
      default: return String(round);
    }
  }

  function showRoundEndedAnnouncement(data) {
    const parent = document.getElementById('messages-container')?.parentNode || document.body;
    
    // Remove any previous round result overlays
    const oldAnnouncements = document.querySelectorAll('.bt-round-ended-announcement');
    oldAnnouncements.forEach(el => el.remove());

    const container = document.createElement('div');
    container.className = 'bt-round-ended-announcement';
    container.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
      border: 2px solid rgba(255, 215, 0, 0.45);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(234, 179, 8, 0.25);
      padding: 24px;
      width: 90%;
      max-width: 380px;
      color: #f8fafc;
      font-family: 'Tajawal', sans-serif;
      direction: rtl;
      text-align: center;
      transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      opacity: 0;
      scale: 0.9;
    `;

    // Determine Winner and Loser info
    const isTie = !data.roundWinnerId;
    const winnerId = data.roundWinnerId;
    
    let winnerObj = null;
    let winnerName = 'التعادل';
    let winnerPic = window.defaultAvatarUrl || '/uploads/site/default.png';
    let settlementMsg = '';

    if (!isTie) {
      if (currentBattle) {
        winnerObj = Number(winnerId) === Number(activePlayer1Id) ? currentBattle.player1 : currentBattle.player2;
      }
      winnerName = data.roundWinnerName || (winnerObj ? getBattlePlainName(winnerObj) : 'البطل');
      winnerPic = data.roundWinnerPic || getBattleAvatarUrl(winnerObj);
    }

    // Settlement Status/Summary
    const settlement = data.coinSettlement || {};
    if (settlement.status === 'paid_to_winner') {
      settlementMsg = `🏆 تم تحويل <span style="color: #eab308; font-weight: 800;">${settlement.poolAmount} كوينز</span> (كامل ريع الجولة) لرصيد الفائز!`;
    } else if (settlement.status === 'refunded') {
      settlementMsg = `🤝 انتهت الجولة بالتعادل! تم إعادة <span style="color: #eab308; font-weight: 800;">${settlement.poolAmount} كوينز</span> للداعمين.`;
    } else {
      settlementMsg = `لم يتم إرسال هدايا دعم خلال هذه الجولة.`;
    }

    const roundArabic = getActiveRoundArabicWord(data.currentRound);
    
    let winnerSection = '';
    if (isTie) {
      winnerSection = `
        <div style="margin: 15px 0;">
          <div style="width: 72px; height: 72px; border-radius: 50%; border: 3px solid #94a3b8; background: #334155; display: flex; align-items: center; justify-content: center; font-size: 30px; margin: 0 auto 10px;">
            🤝
          </div>
          <h4 style="font-size: 18px; font-weight: 800; color: #cbd5e1; margin: 0;">انتهت الجولة بالتعادل!</h4>
        </div>
      `;
    } else {
      const formattedWinner = winnerObj ? renderBattleIdentity(winnerObj) : `<span style="color: #eab308; font-weight: bold;">${winnerName}</span>`;
      winnerSection = `
        <div style="margin: 15px 0;">
          <img src="${winnerPic}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid #eab308; box-shadow: 0 0 15px rgba(234, 179, 8, 0.4); object-fit: cover; margin-bottom: 10px;" onerror="this.src=window.defaultAvatarUrl">
          <div style="font-size: 11px; color: #a1a1aa; margin-bottom: 4px;">الفائز بالجولة</div>
          <h4 style="font-size: 16px; font-weight: 800; margin: 0; display: flex; align-items: center; justify-content: center; gap: 4px;">
            ${formattedWinner}
          </h4>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="font-size: 11px; font-weight: 700; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 15px;">
        📢 نتيجة الجولة ${roundArabic}
      </div>
      
      ${winnerSection}

      <!-- Score Comparison -->
      <div style="background: rgba(15, 23, 42, 0.6); border-radius: 10px; padding: 12px; margin: 15px 0; border: 1px solid rgba(255,255,255,0.05);">
        <div style="display: flex; justify-content: space-around; align-items: center; margin-bottom: 6px;">
          <div>
            <div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">نقاط الأول</div>
            <div style="font-size: 18px; font-weight: 800; color: #3b82f6;">${data.player1Score}</div>
          </div>
          <div style="font-size: 12px; font-weight: 800; color: #64748b;">مقابل</div>
          <div>
            <div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">نقاط الثاني</div>
            <div style="font-size: 18px; font-weight: 800; color: #ec4899;">${data.player2Score}</div>
          </div>
        </div>
        
        <div style="font-size: 11px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; color: #94a3b8; font-weight: 500;">
          الجولات حتى الآن: 
          <span style="color: #3b82f6; font-weight: bold;">${data.player1RoundsWon}</span>
          -
          <span style="color: #ec4899; font-weight: bold;">${data.player2RoundsWon}</span>
        </div>
      </div>

      <!-- Coin Settlement Message -->
      <div style="font-size: 11px; font-weight: 600; line-height: 1.5; color: #e2e8f0; background: rgba(234, 179, 8, 0.1); border-radius: 8px; padding: 10px; border: 1px solid rgba(234, 179, 8, 0.2);">
        ${settlementMsg}
      </div>
    `;

    parent.appendChild(container);

    // Trigger transition
    setTimeout(() => {
      container.style.opacity = '1';
      container.style.scale = '1';
    }, 50);

    // Auto fade out
    setTimeout(() => {
      container.style.opacity = '0';
      container.style.scale = '0.9';
      setTimeout(() => {
        container.remove();
      }, 500);
    }, 3800);
  }

  function showBattleFinalResultOverlay(data) {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    }

    const parent = document.body;
    
    const old = document.getElementById('battle-final-result-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'battle-final-result-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 100000;
      display: flex;
      justify-content: center;
      align-items: center;
      direction: rtl;
      font-family: 'Tajawal', sans-serif;
      transition: opacity 0.5s ease-in-out;
      opacity: 0;
    `;

    const p1 = currentBattle?.player1 || { id: activePlayer1Id, username: currentBattle?.player1Name };
    const p2 = currentBattle?.player2 || { id: activePlayer2Id, username: currentBattle?.player2Name };

    const p1Name = renderBattleIdentity(p1, { nameStyle: 'color: #ffffff !important;' });
    const p2Name = renderBattleIdentity(p2, { nameStyle: 'color: #ffffff !important;' });

    const p1Avatar = getBattleAvatarUrl(p1);
    const p2Avatar = getBattleAvatarUrl(p2);

    const winnerId = data.winnerId;
    const isTie = !winnerId;

    let titleText = '🏆 نهاية التحدي المثير!';
    let winnerSectionHtml = '';

    if (isTie) {
      titleText = '🤝 انتهى التحدي بالتعادل!';
      winnerSectionHtml = `
        <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin: 20px 0;">
          <div style="text-align: center;">
            <img src="${p1Avatar}" style="width: 70px; height: 70px; border-radius: 50%; border: 3px solid #3b82f6; object-fit: cover; margin-bottom: 8px;">
            <div>${p1Name}</div>
          </div>
          <div style="font-size: 28px; font-weight: bold; color: #cbd5e1;">VS</div>
          <div style="text-align: center;">
            <img src="${p2Avatar}" style="width: 70px; height: 70px; border-radius: 50%; border: 3px solid #ec4899; object-fit: cover; margin-bottom: 8px;">
            <div>${p2Name}</div>
          </div>
        </div>
        <h4 style="color: #facc15; font-weight: 800; font-size: 18px;">تعادل فخم بين العمالقة!</h4>
      `;
    } else {
      const isP1Winner = Number(winnerId) === Number(activePlayer1Id);
      const winnerName = isP1Winner ? p1Name : p2Name;
      const winnerAvatar = isP1Winner ? p1Avatar : p2Avatar;
      const winnerColor = isP1Winner ? '#3b82f6' : '#ec4899';
      
      titleText = '🏆 انتصار ساحق!';
      winnerSectionHtml = `
        <div style="text-align: center; margin: 20px 0; position: relative;">
          <div style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%) rotate(-10deg); background: #eab308; color: #1e1b4b; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
            👑 الفائز بالتحدي
          </div>
          <img src="${winnerAvatar}" style="width: 100px; height: 100px; border-radius: 50%; border: 4px solid ${winnerColor}; box-shadow: 0 0 25px ${winnerColor}80; object-fit: cover; margin-bottom: 12px;" onerror="this.src=window.defaultAvatarUrl">
          <h3 style="font-size: 18px; font-weight: 800; margin: 0;">${winnerName}</h3>
        </div>
      `;
    }

    let forfeitHtml = '';
    if (data.forfeitReason) {
      forfeitHtml = `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 10px; padding: 12px; margin-bottom: 20px; color: #fca5a5; font-size: 12px; line-height: 1.5; font-weight: 600;">
          ⚠️ ${data.forfeitReason}
        </div>
      `;
    }

    // Compiling coin settlement summary description
    let coinsSettlementDesc = 'تم تسوية كوينز الجولات بنجاح لصالح المستحقين.';
    if (data.coinSettlement) {
      if (data.coinSettlement.status === 'paid_to_winner') {
        coinsSettlementDesc = `تم تسوية <span style="color: #eab308; font-weight: bold;">${data.coinSettlement.poolAmount} كوينز</span> لصالح البطل.`;
      } else if (data.coinSettlement.status === 'refunded') {
        coinsSettlementDesc = `انتهت الجولة بالتعادل وتم استرجاع <span style="color: #eab308; font-weight: bold;">${data.coinSettlement.poolAmount} كوينز</span> للداعمين.`;
      }
    }

    overlay.innerHTML = `
      <div style="background: linear-gradient(180deg, #1e1b4b 0%, #0b0f19 100%); border: 3px solid rgba(255, 215, 0, 0.35); border-radius: 24px; width: 95%; max-width: 460px; padding: 28px; box-shadow: 0 30px 60px rgba(0, 0, 0, 0.8), 0 0 50px rgba(234, 179, 8, 0.15); color: #f8fafc; position: relative; text-align: center; transform: scale(0.9); transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
        
        <h2 style="font-size: 22px; font-weight: 900; color: #eab308; text-shadow: 0 0 10px rgba(234, 179, 8, 0.3); margin-top: 10px; margin-bottom: 5px;">${titleText}</h2>
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 15px;">نهاية جولات المتحدين الأقوياء</div>

        ${forfeitHtml}

        ${winnerSectionHtml}

        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 16px; margin: 20px 0; text-align: right;">
          
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 10px;">
            <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">الجولات المكتسبة:</div>
            <div style="font-size: 14px; font-weight: 800;">
              <span style="color: #3b82f6;">${data.player1RoundsWon} جولات</span>
              <span style="color: #64748b; margin: 0 8px;">مقابل</span>
              <span style="color: #ec4899;">${data.player2RoundsWon} جولات</span>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 10px;">
            <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">إجمالي النقاط بالتحدي:</div>
            <div style="font-size: 14px; font-weight: 800;">
              <span style="color: #3b82f6;">${data.player1TotalScore} نقطة</span>
              <span style="color: #64748b; margin: 0 8px;">مقابل</span>
              <span style="color: #ec4899;">${data.player2TotalScore} نقطة</span>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">حالة تسوية الكوينز:</div>
            <div style="font-size: 12px; font-weight: 700; color: #eab308; max-width: 65%; text-align: left; line-height: 1.4;">
              ${coinsSettlementDesc}
            </div>
          </div>

        </div>

        <button type="button" id="battle-close-result-btn" style="background: linear-gradient(90deg, #eab308 0%, #ca8a04 100%); color: #1e1b4b; border: none; font-size: 14px; font-weight: 800; padding: 12px 32px; border-radius: 12px; cursor: pointer; width: 100%; box-shadow: 0 10px 20px rgba(234, 179, 8, 0.25); transition: all 0.2s ease;">
          إغلاق النتيجة والعودة للشات
        </button>

      </div>
    `;

    parent.appendChild(overlay);

    setTimeout(() => {
      overlay.style.opacity = '1';
      overlay.querySelector('div').style.transform = 'scale(1)';
    }, 50);

    let autoCloseTimer = setTimeout(() => {
      closeOverlay();
    }, 7000);

    const closeOverlay = () => {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      overlay.style.opacity = '0';
      const dialog = overlay.querySelector('div');
      if (dialog) dialog.style.transform = 'scale(0.9)';
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
        collapseBattleWidget();
      }, 400);
    };

    const closeBtn = overlay.querySelector('#battle-close-result-btn');
    if (closeBtn) {
      closeBtn.onclick = closeOverlay;
  
    // Auto-close overlay after 10 seconds and clean up
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        closeOverlay();
      }
    }, 10000);
  }
  }

  const updateInteractiveTapButtons = () => {
    const trigger1 = document.getElementById('bt-support-player1');
    const trigger2 = document.getElementById('bt-support-player2');
    if (!trigger1 || !trigger2 || !currentBattle) return;

    const p1Plain = getBattlePlainName(currentBattle.player1);
    const p2Plain = getBattlePlainName(currentBattle.player2);

    const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);

    trigger1.style.backgroundColor = '#2563eb';
    trigger1.style.color = '#ffffff';
    trigger1.style.border = 'none';
    trigger1.style.opacity = '1';
    trigger1.disabled = false;
    trigger1.innerHTML = `👍 دعم ${p1Plain} <span class="badge" id="bt-p1-tap-badge" style="background: rgba(255,255,255,0.2); margin-right: 4px;">+1</span>`;

    trigger2.style.backgroundColor = '#db2777';
    trigger2.style.color = '#ffffff';
    trigger2.style.border = 'none';
    trigger2.style.opacity = '1';
    trigger2.disabled = false;
    trigger2.innerHTML = `👍 دعم ${p2Plain} <span class="badge" id="bt-p2-tap-badge" style="background: rgba(255,255,255,0.2); margin-right: 4px;">+1</span>`;

    if (meId && Number(meId) === Number(activePlayer1Id)) {
      trigger1.disabled = true;
      trigger1.style.opacity = '0.4';
      trigger1.style.cursor = 'not-allowed';
      trigger1.innerHTML = `🔒 ممنوع دعم نفسك`;
    }
    if (meId && Number(meId) === Number(activePlayer2Id)) {
      trigger2.disabled = true;
      trigger2.style.opacity = '0.4';
      trigger2.style.cursor = 'not-allowed';
      trigger2.innerHTML = `🔒 ممنوع دعم نفسك`;
    }
  };

  const seenOperationIds = new Set();

  function generateOperationId(prefix = 'op') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  function limitTapBubbles() {
    const bubbles = document.querySelectorAll('.bt-tap-avatar-bubble');
    if (bubbles.length > 15) {
      bubbles[0].remove();
    }
  }

  function clearAllSupportBubbles() {
    const bubbles = document.querySelectorAll('.bt-tap-avatar-bubble');
    bubbles.forEach(b => b.remove());
  }

  function handleSupportAnimationBubble(data) {
    if (!data || !data.battleId) return;
    if (activeBattleId && Number(data.battleId) !== Number(activeBattleId)) return;

    const targetUserId = Number(data.targetUserId || data.receiverId);
    if (targetUserId !== Number(activePlayer1Id) && targetUserId !== Number(activePlayer2Id)) return;

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const opId = data.operationId;
    if (opId) {
      if (seenOperationIds.has(opId)) return;
      seenOperationIds.add(opId);
      if (seenOperationIds.size > 500) {
        const first = seenOperationIds.values().next().value;
        seenOperationIds.delete(first);
      }
    }

    const supporterAvatar = data.supporterAvatar || getBattleAvatarUrl(data.tapper || {});
    const supportType = data.supportType || 'tap';

    const spawnBubble = () => {
      const btnId = targetUserId === Number(activePlayer1Id) ? 'bt-support-player1' : 'bt-support-player2';
      const cardId = targetUserId === Number(activePlayer1Id) ? 'bt-player1-card' : 'bt-player2-card';
      const targetEl = document.getElementById(btnId) || document.getElementById(cardId);
      const panel = document.getElementById('battle-challenge-panel');

      if (!targetEl || !panel) return;

      const targetRect = targetEl.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      const bubble = document.createElement('div');
      bubble.className = 'bt-tap-avatar-bubble';

      const badgeText = supportType === 'gift' ? '🎁' : '+1';
      const badgeBg = supportType === 'gift' ? '#ec4899' : '#facc15';

      bubble.innerHTML = `
        <img src="${supporterAvatar}" class="bt-tap-avatar-img" onerror="this.src=window.defaultAvatarUrl || '/uploads/site/default.png'">
        <span class="bt-bubble-badge" style="position: absolute; right: -6px; top: -6px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px; background: ${badgeBg}; color: #111827; font-size: 10px; font-weight: 900; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.8);">${badgeText}</span>
      `;

      const startLeft = targetRect.left - panelRect.left + (targetRect.width / 2) - 18;
      const startTop = targetRect.top - panelRect.top - 5;

      bubble.style.left = `${startLeft}px`;
      bubble.style.top = `${startTop}px`;

      const randomX = Math.floor(Math.random() * 60) - 30;
      bubble.style.setProperty('--bt-tap-random-x', `${randomX}px`);

      limitTapBubbles();
      panel.appendChild(bubble);

      const removeBubble = () => {
        if (bubble.parentNode) bubble.remove();
      };

      bubble.addEventListener('animationend', removeBubble);
      setTimeout(removeBubble, 1600);
    };

    spawnBubble();
    if (supportType === 'gift') {
      setTimeout(spawnBubble, 150);
    }
  }

  function createTapAvatarBubble(data) {
    handleSupportAnimationBubble(data);
  }

  function renderBattleFinalResult(data) {
    const p1 = currentBattle?.player1 || { id: activePlayer1Id, username: currentBattle?.player1Name };
    const p2 = currentBattle?.player2 || { id: activePlayer2Id, username: currentBattle?.player2Name };

    const p1NameWinner = renderBattleIdentity(p1, { nameStyle: 'color: #ffffff !important;' });
    const p2NameWinner = renderBattleIdentity(p2, { nameStyle: 'color: #ffffff !important;' });

    const p1NameDetail = renderBattleIdentity(p1, { nameStyle: 'color: #93c5fd !important;' });
    const p2NameDetail = renderBattleIdentity(p2, { nameStyle: 'color: #fbcfe8 !important;' });

    const p1Avatar = getBattleAvatarUrl(p1);
    const p2Avatar = getBattleAvatarUrl(p2);

    let winnerHtml = "";

    const isP1Winner = Number(data.winnerId) === Number(activePlayer1Id);
    const isP2Winner = Number(data.winnerId) === Number(activePlayer2Id);

    if (isP1Winner) {
      winnerHtml = `
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 3px solid #eab308; border-radius: 20px; padding: 24px 16px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(234, 179, 8, 0.2); text-align: center; position: relative; overflow: hidden;">
          <div style="position: absolute; top: -50px; left: -50px; width: 150px; height: 150px; background: rgba(234, 179, 8, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
          <div style="position: absolute; bottom: -50px; right: -50px; width: 150px; height: 150px; background: rgba(37, 99, 235, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
          
          <div style="font-size: 46px; line-height: 1; margin-bottom: -10px; z-index: 2; position: relative; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">👑</div>
          
          <div style="position: relative; width: 96px; height: 96px; margin: 0 auto 12px; z-index: 1;">
            <img src="${p1Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 4px solid #eab308; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);" />
            <span style="position: absolute; bottom: -4px; right: 50%; transform: translateX(50%); background: #eab308; color: #0f172a; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 2px solid #111827; white-space: nowrap;">الفائز</span>
          </div>
          
          <div style="font-size: 16px; font-weight: 800; color: #ffffff; margin-bottom: 6px;">${p1NameWinner}</div>
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 20px; padding: 4px 14px;">
            <span style="color: #facc15; font-size: 11px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">🏆 بطل التحدي الحالي</span>
          </div>
        </div>
      `;
    } else if (isP2Winner) {
      winnerHtml = `
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 3px solid #ec4899; border-radius: 20px; padding: 24px 16px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(236, 72, 153, 0.2); text-align: center; position: relative; overflow: hidden;">
          <div style="position: absolute; top: -50px; left: -50px; width: 150px; height: 150px; background: rgba(236, 72, 153, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
          <div style="position: absolute; bottom: -50px; right: -50px; width: 150px; height: 150px; background: rgba(234, 179, 8, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
          
          <div style="font-size: 46px; line-height: 1; margin-bottom: -10px; z-index: 2; position: relative; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">👑</div>
          
          <div style="position: relative; width: 96px; height: 96px; margin: 0 auto 12px; z-index: 1;">
            <img src="${p2Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 4px solid #ec4899; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);" />
            <span style="position: absolute; bottom: -4px; right: 50%; transform: translateX(50%); background: #ec4899; color: #ffffff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 2px solid #111827; white-space: nowrap;">الفائز</span>
          </div>
          
          <div style="font-size: 16px; font-weight: 800; color: #ffffff; margin-bottom: 6px;">${p2NameWinner}</div>
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(236, 72, 153, 0.15); border: 1px solid rgba(236, 72, 153, 0.3); border-radius: 20px; padding: 4px 14px;">
            <span style="color: #f472b6; font-size: 11px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">🏆 بطل التحدي الحالي</span>
          </div>
        </div>
      `;
    } else {
      winnerHtml = `
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 3px solid #64748b; border-radius: 20px; padding: 24px 16px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(100, 116, 139, 0.2); text-align: center; position: relative; overflow: hidden;">
          <div style="position: absolute; top: -50px; left: -50px; width: 150px; height: 150px; background: rgba(100, 116, 139, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
          
          <div style="font-size: 40px; line-height: 1; margin-bottom: 12px; z-index: 2; position: relative;">🤝</div>
          
          <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 14px; position: relative; z-index: 1;">
            <img src="${p1Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 70px; height: 70px; object-fit: cover; border-radius: 50%; border: 3px solid #3b82f6; box-shadow: -4px 6px 12px rgba(0,0,0,0.3); z-index: 2;" />
            <img src="${p2Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 70px; height: 70px; object-fit: cover; border-radius: 50%; border: 3px solid #ec4899; box-shadow: 4px 6px 12px rgba(0,0,0,0.3); z-index: 1; margin-right: -15px;" />
          </div>
          
          <div style="font-size: 18px; font-weight: 800; color: #f8fafc; margin-bottom: 4px;">انتهى التحدي بالتعادل!</div>
          <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">تكافؤ تام وأداء رائع ومميز من الطرفين</div>
        </div>
      `;
    }

    const reasonHtml = data.forfeitReason
      ? `<div class="bt-final-reason" style="margin-bottom: 16px; font-weight: 500; font-size: 13px; color: #f43f5e; background: rgba(244, 63, 94, 0.08); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(244, 63, 94, 0.15);">${data.forfeitReason}</div>`
      : "";

    return `
      <div class="bt-final-result-box" style="direction: rtl; text-align: center; padding: 5px; font-family: 'Tajawal', sans-serif;">
        ${winnerHtml}
        ${reasonHtml}

        <div style="border: 2px solid rgba(255, 255, 255, 0.08); border-radius: 18px; background: #0f172a; padding: 18px; width: 100%; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);">
          <div style="font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em;">لوحة النتيجة التفصيلية والبلورات</div>
          
          <div class="test-vs-wrapper" style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <!-- Player 1 Details -->
            <div style="flex: 1; min-width: 0; background: rgba(59, 130, 246, 0.04); border: 1.5px solid rgba(59, 130, 246, 0.2); border-radius: 14px; padding: 16px 10px; text-align: center; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15); transition: all 0.2s;">
              <div style="width: 58px; height: 58px; margin: 0 auto 10px; border-radius: 50%; border: 2.5px solid #3b82f6; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.25);">
                <img src="${p1Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 100%; height: 100%; object-fit: cover;" />
              </div>
              <div style="font-size: 13px; font-weight: 700; color: #93c5fd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 6px;">${p1NameDetail}</div>
              <div style="font-size: 30px; font-weight: 900; color: #3b82f6; line-height: 1; margin: 4px 0 8px;">${Number(data.player1TotalScore) || 0}</div>
              <div style="display: inline-block; background: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: 11px; font-weight: bold; border-radius: 12px; padding: 4px 10px; margin-top: 2px;">
                الجولات الفائزة: ${Number(data.player1RoundsWon) || 0}
              </div>
            </div>

            <!-- VS Divider -->
            <div style="width: 40px; text-align: center; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #64748b; line-height: 1;">VS</div>
            </div>

            <!-- Player 2 Details -->
            <div style="flex: 1; min-width: 0; background: rgba(236, 72, 153, 0.04); border: 1.5px solid rgba(236, 72, 153, 0.2); border-radius: 14px; padding: 16px 10px; text-align: center; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15); transition: all 0.2s;">
              <div style="width: 58px; height: 58px; margin: 0 auto 10px; border-radius: 50%; border: 2.5px solid #ec4899; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.25);">
                <img src="${p2Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 100%; height: 100%; object-fit: cover;" />
              </div>
              <div style="font-size: 13px; font-weight: 700; color: #fbcfe8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 6px;">${p2NameDetail}</div>
              <div style="font-size: 30px; font-weight: 900; color: #ec4899; line-height: 1; margin: 4px 0 8px;">${Number(data.player2TotalScore) || 0}</div>
              <div style="display: inline-block; background: rgba(236, 72, 153, 0.15); color: #f472b6; font-size: 11px; font-weight: bold; border-radius: 12px; padding: 4px 10px; margin-top: 2px;">
                الجولات الفائزة: ${Number(data.player2RoundsWon) || 0}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function showBattleClassicAlert(message, icon = 'info') {
    if (window.showChatAlert) {
      return window.showChatAlert({
        message,
        icon,
        isHtml: false
      });
    }

    if (window.showToast) {
      window.showToast(message, icon === 'error' ? 'error' : 'info');
      return Promise.resolve();
    }

    return Swal.fire({
      title: 'تنبيه',
      text: message,
      icon,
      confirmButtonText: 'موافق'
    });
  }

  function showBattleClassicHtmlAlert(message, icon = 'info') {
    if (window.showChatAlert) {
      return window.showChatAlert({
        message,
        icon,
        isHtml: true
      });
    }

    return Swal.fire({
      title: 'تنبيه',
      html: message,
      icon,
      confirmButtonText: 'موافق'
    });
  }

  // Web Audio Synth audio cue generator
  const playBattleCue = (type) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'start') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } else if (type === 'tick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      } else if (type === 'tap') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(750, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.06);
      } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // E5
        osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.3); // G5
        osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.45); // C5 octave
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.8);
      }
    } catch (e) {
      console.warn('[BattleAudio] Synth failed:', e);
    }
  };

  // Flying supported gift particle generator
  const createFlyingGiftParticle = (receiverId, icon, name, quantity) => {
    try {
      const cardId = Number(receiverId) === Number(activePlayer1Id) ? 'bt-player1-card' : 'bt-player2-card';
      const anchorNode = document.getElementById(cardId);
      if (!anchorNode) return;

      const element = document.createElement('div');
      element.className = 'battle-flying-gift';
      
      const iconNode = document.createElement('div');
      iconNode.className = 'gift-fly-icon';
      iconNode.textContent = icon || '🎁';
      element.appendChild(iconNode);

      const labelNode = document.createElement('div');
      labelNode.className = 'gift-fly-label';
      labelNode.textContent = `${name || 'دعم'} ×${quantity}`;
      element.appendChild(labelNode);

      // Random offset margins
      const randomLeft = Math.floor(Math.random() * 40) - 20; 
      element.style.left = `calc(50% + ${randomLeft}px)`;
      element.style.bottom = '100px';

      anchorNode.appendChild(element);

      // Self cleanup
      setTimeout(() => {
        element.remove();
      }, 1600);
    } catch (err) {
      console.error('[BattleUI] Fly gift anim failed:', err);
    }
  };

  // Export openBattleModeSelectionModal globally on window for instant single-click access
  window.openBattleModeSelectionModal = (targetUserOrId, room) => {
    const target = (typeof targetUserOrId === 'object' && targetUserOrId)
      ? targetUserOrId
      : ((typeof window.getCurrentProfileUser === 'function' ? window.getCurrentProfileUser() : null) || window.profileUser);

    if (!target) {
      Swal.fire({
        title: 'خطأ',
        text: 'لم يتم العثور على معلومات العضو.',
        icon: 'error',
        confirmButtonText: 'حسناً'
      });
      return;
    }

    const targetUserId = target.userId || target.id || targetUserOrId;
    if (!targetUserId) {
      Swal.fire({
        title: 'خطأ',
        text: 'لم يتم تحديد معرف المستخدم المستهدف.',
        icon: 'error',
        confirmButtonText: 'حسناً'
      });
      return;
    }

    const targetRoomId = room || (window.state ? window.state.currentRoomId : 0);
    if (!targetRoomId || Number(targetRoomId) <= 0) {
      Swal.fire({
        title: 'تنبيه',
        text: 'يجب أن تكون متواجداً بنشاط داخل غرفة للتحدي.',
        icon: 'warning',
        confirmButtonText: 'حسناً'
      });
      return;
    }

    let overlay = document.getElementById('battle-mode-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'battle-mode-modal-overlay';
      overlay.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        z-index: 99999;
        justify-content: center;
        align-items: center;
        direction: rtl;
        font-family: 'Tajawal', sans-serif;
      `;
      document.body.appendChild(overlay);
    }

    const targetUsernameHtml = renderBattleIdentity(target);

    overlay.innerHTML = `
      <div style="background: #0f172a; border: 2px solid rgba(255, 255, 255, 0.1); border-radius: 12px; width: 95%; max-width: 450px; padding: 20px; box-shadow: 0 15px 30px rgba(0, 0, 0, 0.5); color: #f8fafc; position: relative; text-align: right;">
        <!-- Modal Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 15px; margin-bottom: 15px; direction: rtl;">
          <h5 style="margin: 0; font-size: 16px; font-weight: 700; color: #eab308; display: flex; align-items: center; gap: 8px;">
            <span>🏆 إرسال تحدي الجولات</span>
          </h5>
          <button type="button" onclick="window.closeBattleModeModal()" style="background: none; border: none; color: #94a3b8; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
        </div>

        <!-- Modal Info -->
        <div style="margin-bottom: 15px; font-size: 13px; color: #cbd5e1; direction: rtl;">
          أنت على وشك إرسال تحدي إلى العضو: <strong style="color: #60a5fa;">${targetUsernameHtml}</strong>
        </div>

        <!-- Single Round Challenge Card -->
        <div style="background: rgba(59, 130, 246, 0.08); border: 2px solid #3b82f6; border-radius: 12px; padding: 14px; margin-bottom: 20px; direction: rtl; text-align: right;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 28px; flex-shrink: 0;">⏱️</span>
            <div>
              <strong style="display: block; font-size: 14px; color: #f8fafc; margin-bottom: 2px;">تحدي الجولات (جولة واحدة حاسمة)</strong>
              <span style="font-size: 12px; color: #94a3b8;">تحدي حاسم ومباشر تمتد مدته لـ 3 دقائق (180 ثانية).</span>
            </div>
          </div>
        </div>

        <!-- Foot Action Buttons -->
        <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 15px; direction: rtl;">
          <button type="button" id="bt-mode-submit-btn" class="btn btn-warning btn-sm fw-bold" style="background: #eab308; color: #1e1b4b; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">تأكيد وإرسال التحدي ⚡</button>
          <button type="button" onclick="window.closeBattleModeModal()" class="btn btn-secondary btn-sm" style="background: #475569; color: #f8fafc; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">إلغاء</button>
        </div>
      </div>
    `;

    // Wire up Confirm button
    const submitBtn = overlay.querySelector('#bt-mode-submit-btn');
    submitBtn.onclick = () => {
      console.log('[BattleCtrl] Sending battle invite mode: single');

      if (window.socket) {
        window.socket.emit('battle:invite', {
          targetUserId: Number(targetUserId),
          roomId: Number(targetRoomId),
          battleMode: 'single'
        });
      }

      // Hide profile modal gracefully
      const modalEl = document.getElementById('userProfileModal');
      if (modalEl && window.bootstrap) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      window.closeBattleModeModal();
    };

    window.closeBattleModeModal = () => {
      overlay.style.display = 'none';
    };

    overlay.style.display = 'flex';
  };

  const initializeProfileTrigger = () => {
    // No-op: openBattleModeSelectionModal is globally exposed on window and called directly from main.js delegated listener
  };

  // Connect click tap handlers
  const wireUpInteractiveTaps = () => {
    const trigger1 = document.getElementById('bt-support-player1');
    const trigger2 = document.getElementById('bt-support-player2');

    if (trigger1) {
      trigger1.onclick = (e) => {
        e.preventDefault();
        const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
        if (meId && Number(meId) === Number(activePlayer1Id)) {
          showBattleClassicAlert('لا يمكنك التكبيس لنفسك.', 'warning');
          return;
        }
        if (activeBattleId && activePlayer1Id) {
          const opId = generateOperationId('tap');
          window.socket.emit('battle:tap', { battleId: activeBattleId, receiverId: activePlayer1Id, operationId: opId });
          playBattleCue('tap');
          renderClickRipple(e, trigger1);
        }
      };
    }

    if (trigger2) {
      trigger2.onclick = (e) => {
        e.preventDefault();
        const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
        if (meId && Number(meId) === Number(activePlayer2Id)) {
          showBattleClassicAlert('لا يمكنك التكبيس لنفسك.', 'warning');
          return;
        }
        if (activeBattleId && activePlayer2Id) {
          const opId = generateOperationId('tap');
          window.socket.emit('battle:tap', { battleId: activeBattleId, receiverId: activePlayer2Id, operationId: opId });
          playBattleCue('tap');
          renderClickRipple(e, trigger2);
        }
      };
    }

    const cancelTrigger = document.getElementById('bt-cancel-challenge-btn');
    if (cancelTrigger) {
      cancelTrigger.onclick = () => {
        const room = window.state ? window.state.currentRoomId : 0;
        if (room) {
          window.socket.emit('battle:cancel', { roomId: Number(room) });
        }
      };
    }

    const giftTrigger = document.getElementById('bt-gift-support-trigger');
    if (giftTrigger) {
      giftTrigger.onclick = () => {
        window.openBattleGiftSelectionModal();
      };
    }
  };

  const renderClickRipple = (event, element) => {
    try {
      const rect = element.getBoundingClientRect();
      const ripple = document.createElement('div');
      ripple.className = 'battle-tap-ripple';
      
      const x = event.clientX - rect.left - 20;
      const y = event.clientY - rect.top - 20;
      
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      
      element.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    } catch (err) {}
  };

  // Wire Socket Listeners
  const hookSocketInboundEvents = () => {
    if (window.__battleSocketEventsBound) return;
    if (!window.socket) {
      console.warn('[BattleSocket] Socket transport unavailable, retrying in 500ms...');
      setTimeout(hookSocketInboundEvents, 500);
      return;
    }
    
    window.__battleSocketEventsBound = true;
    const socket = window.socket;

    // Expose handleBattleInvitation on window and do not register socket listener here to prevent duplication
    window.handleBattleInvitation = (data) => {
      console.log('[BattleSocket] Invited to live battle room:', data);
      playBattleCue('start');

      Swal.fire({
        title: 'تحدي جولات',
        html: `${data.senderName} يطلب تحديك الآن<br>هل تقبل التحدي؟`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'قبول',
        cancelButtonText: 'رفض'
      }).then((result) => {
        if (result.isConfirmed) {
          socket.emit('battle:accept', { senderId: data.senderId, roomId: data.roomId });
        } else {
          socket.emit('battle:reject', { senderId: data.senderId, roomId: data.roomId });
        }
      });
    };

    socket.on('battle:inviteRejected', (data) => {
      showBattleClassicAlert(`تم رفض التحدي من قبل ${data.receiverName || 'المتحدي'}`, 'warning');
    });

    // Handle generic error warnings
    socket.on('battle:error', (data) => {
      showBattleClassicAlert(data?.message || 'حدث خطأ', data?.type === 'success' ? 'success' : 'info');
    });

    // Battle successfully created / start
    window.handleBattleCreated = (data) => {
      console.log('[BattleSocket] Match structure active:', data);
      currentBattle = data;
      currentBattle.status = 'countdown';
      activeBattleId = data.battleId;
      activePlayer1Id = Number(data.player1.userId || data.player1.id);
      activePlayer2Id = Number(data.player2.userId || data.player2.id);

      console.log('[BattleUI] active players ids:', {
        activePlayer1Id,
        activePlayer2Id,
        player1: data.player1,
        player2: data.player2
      });

      // Populate layout structures
      // Players details
      const p1n = document.getElementById('bt-player1-name'); if(p1n) p1n.innerHTML = renderBattleIdentity(data.player1);
      const p2n = document.getElementById('bt-player2-name'); if(p2n) p2n.innerHTML = renderBattleIdentity(data.player2);
      
      setBattleAvatar('bt-player1-pic', data.player1);
      setBattleAvatar('bt-player2-pic', data.player2);

      // Reset score panels
      const p1s = document.getElementById('bt-player1-score'); if(p1s) p1s.textContent = '0';
      const p2s = document.getElementById('bt-player2-score'); if(p2s) p2s.textContent = '0';
      const pb = document.getElementById('bt-progress-bar'); if(pb) pb.style.width = '50%';
      const sb = document.getElementById('bt-status-bar'); if(sb) sb.textContent = 'بدء التحدي... جاري التجهيز!';

      // Reset gift feeds and top supporters on initiation
      const feedContainer = document.getElementById('bt-gift-feed');
      if (feedContainer) feedContainer.innerHTML = '';
      const topSupportersContainer = document.getElementById('bt-top-supporters');
      if (topSupportersContainer) topSupportersContainer.innerHTML = '';

      // Render won-round placeholders
      const buildDots = (targetElId) => {
        const wrap = document.getElementById(targetElId);
        if (!wrap) return;
        wrap.innerHTML = '';
        for (let i = 0; i < data.totalRounds; i++) {
          const dot = document.createElement('div');
          dot.className = 'round-won-dot';
          wrap.appendChild(dot);
        }
      };
      buildDots('bt-player1-won-badges');
      buildDots('bt-player2-won-badges');

      // Participant cancel controls only
      const activeMe = window.state?.currentUser?.id || 0;
      const isParticipant = Number(activeMe) === Number(activePlayer1Id) || Number(activeMe) === Number(activePlayer2Id);
      
      const cancelTrigger = document.getElementById('bt-cancel-challenge-btn');
      if (cancelTrigger) {
        cancelTrigger.classList.toggle('d-none', !isParticipant);
      }

      // Display main container panel smoothly
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.classList.remove('d-none');
        panel.style.display = 'block';
      }

      // Ensure we reset any previous local minimization state on challenge startup
      toggleBattleMinimization(false);

      updateInteractiveTapButtons();

      playBattleCue('start');
    };

    socket.on('battle:countdown', (data) => {
      if (currentBattle) currentBattle.status = 'countdown';
      const elVal = document.getElementById('bt-timer-value') || document.getElementById('bt-timer');
      if (elVal) elVal.textContent = String(data.timer);
      const elLbl = document.getElementById('bt-timer-label');
      if (elLbl) elLbl.textContent = 'الاستعداد';
      const rs_sb = document.getElementById('bt-status-bar'); if(rs_sb) rs_sb.innerHTML = `الاستعداد للجولة ${data.currentRound}... <span class="text-warning fw-bold fs-5">${data.timer}</span>`;
      playBattleCue('tick');
    });

    socket.on('battle:roundStarted', (data) => {
      if (currentBattle) currentBattle.status = 'active';

      const p1 = Number(data.player1Score) || 0;
      const p2 = Number(data.player2Score) || 0;

      const rs_p1s = document.getElementById('bt-player1-score'); if(rs_p1s) rs_p1s.textContent = String(p1);
      const rs_p2s = document.getElementById('bt-player2-score'); if(rs_p2s) rs_p2s.textContent = String(p2);
      const pb = document.getElementById('bt-progress-bar'); if(pb) pb.style.width = '50%';

      const elVal = document.getElementById('bt-timer-value') || document.getElementById('bt-timer');
      if (elVal) elVal.textContent = String(data.timer);

      const elLbl = document.getElementById('bt-timer-label');
      if (elLbl) elLbl.textContent = 'الجولة';

      const rs_sb = document.getElementById('bt-status-bar'); if(rs_sb) rs_sb.innerHTML =
        `<span class="text-success fw-bold">ابدأ!</span> الجولة ${data.currentRound} انطلقت! ادعم بـ التكبيس والهدايا!`;
      playBattleCue('start');
    });

    socket.on('battle:giftError', (data) => {
      showBattleClassicAlert(data?.message || 'تعذر إرسال الدعم.', 'warning');
    });

    socket.on('coins:updated', (data) => {
      console.log('[Coins] Updated balance:', data);
      const currentUserId = window.state?.currentUser?.id;
      if (data && data.userId && currentUserId && Number(data.userId) !== Number(currentUserId)) {
        return;
      }

      const coinsEls = document.querySelectorAll('[data-user-coins], .js-user-coins, #current-user-coins');
      coinsEls.forEach(el => {
        el.textContent = data.balance;
      });

      if (window.state && window.state.currentUser) {
        // Only the coin balance changes here — never touch `rep` (rep is rating points).
        window.state.currentUser.coins = data.balance;
      }
    });

    socket.on('battle:tapError', (data) => {
      showBattleClassicAlert(data?.message || 'لا يمكنك التكبيس الآن.', 'warning');
    });

    socket.on('battle:timer', (data) => {
      const elVal = document.getElementById('bt-timer-value') || document.getElementById('bt-timer');
      if (elVal) elVal.textContent = String(data.timer);
      if (data.timer <= 10) {
        playBattleCue('tick');
      }
    });

    socket.on('battle:scoreUpdate', (data) => {
      const p1 = Number(data.player1Score) || 0;
      const p2 = Number(data.player2Score) || 0;
      
      const rs_p1s = document.getElementById('bt-player1-score'); if(rs_p1s) rs_p1s.textContent = String(p1);
      const rs_p2s = document.getElementById('bt-player2-score'); if(rs_p2s) rs_p2s.textContent = String(p2);

      // Percentage recalculation
      let pct = 50;
      if (p1 + p2 > 0) {
        pct = (p1 / (p1 + p2)) * 100;
        // Clamp bounds securely
        pct = Math.max(5, Math.min(95, pct));
      }
      document.getElementById('bt-progress-bar').style.width = `${pct}%`;
    });

    socket.on('battle:tapBurst', (data) => {
       const p1Burst = Number(data.player1TapCount) || 0;
       const p2Burst = Number(data.player2TapCount) || 0;
       
       const showBurst = (side, val) => {
          if (val <= 0) return;
          const container = document.getElementById(`bt-${side}-side`);
          if (!container) return;
          const el = document.createElement('div');
          el.className = 'tap-burst-effect';
          el.textContent = `+${val}`;
          container.appendChild(el);
          setTimeout(() => el.remove(), 800);
       };

       if (p1Burst > 0) showBurst('player1', p1Burst);
       if (p2Burst > 0) showBurst('player2', p2Burst);
    });

    socket.on('battle:giftAnimation', (data) => {
      const senderHtml = data.sender ? renderBattleIdentity(data.sender) : (data.senderName || 'عضو');
      const receiverHtml = data.receiver ? renderBattleIdentity(data.receiver) : (data.receiverName || 'عضو');

      const statusBar = document.getElementById('bt-status-bar');
      if (statusBar) {
        statusBar.innerHTML =
          `${senderHtml} دعم ${receiverHtml} بـ ${data.giftIcon || '🎁'} ${data.giftName} ×${data.quantity}`;
      }

      createFlyingGiftParticle(data.receiverId, data.giftIcon, data.giftName, data.quantity);

      // Render TikTok-style side gift feed item
      const feedContainer = document.getElementById('bt-gift-feed');
      if (feedContainer) {
        const item = document.createElement('div');
        item.className = 'bt-gift-feed-item';

        const avatarUrl = getBattleAvatarUrl(data.sender);
        const plainSenderName = getBattlePlainName(data.sender) || data.senderName || 'عضو';
        const plainReceiverName = getBattlePlainName(data.receiver) || data.receiverName || 'عضو';

        item.innerHTML = `
          <img class="bt-gift-feed-avatar" src="${avatarUrl}" referrerPolicy="origin-when-cross-origin" />
          <div class="bt-gift-feed-body">
            <div class="bt-gift-feed-name">${plainSenderName}</div>
            <div class="bt-gift-feed-text">أرسل <span class="bt-gift-feed-gift">${data.giftIcon || '🎁'} ${data.giftName}</span> إلى ${plainReceiverName}</div>
          </div>
          <div class="bt-gift-feed-qty">×${data.quantity}</div>
        `;

        feedContainer.prepend(item);

        // Keep at most 5 items in the feed
        const items = feedContainer.querySelectorAll('.bt-gift-feed-item');
        items.forEach((el, index) => {
          if (index >= 5) el.remove();
        });

        // Auto remove animation
        setTimeout(() => {
          item.classList.add('fade-out');
          setTimeout(() => {
            item.remove();
          }, 600);
        }, 4000);
      }
    });

    socket.on('battle:topSupporters', (data) => {
      const topContainer = document.getElementById('bt-top-supporters');
      if (!topContainer) return;

      const p1List = data.player1Supporters || [];
      const p2List = data.player2Supporters || [];

      // Combine both teams' supporters to discover top overall active sponsors
      const allSponsors = [];
      p1List.forEach(s => allSponsors.push({ ...s, target: 'p1' }));
      p2List.forEach(s => allSponsors.push({ ...s, target: 'p2' }));
      allSponsors.sort((a, b) => b.score - a.score);

      const top3 = allSponsors.slice(0, 3);

      if (top3.length === 0) {
        topContainer.innerHTML = '';
        return;
      }

      let itemsHtml = '';
      top3.forEach((supp, idx) => {
        const rank = idx + 1;
        const avatarUrl = getBattleAvatarUrl(supp.user);
        const nameText = getBattlePlainName(supp.user) || 'داعم';
        const isP1 = supp.target === 'p1';
        const targetColor = isP1 ? '#38bdf8' : '#ec4899';
        const teamIndicator = isP1 ? '💙' : '💖';

        itemsHtml += `
          <div class="bt-top-item">
            <span class="bt-top-rank" style="color: ${targetColor};">#${rank}</span>
            <img class="bt-top-avatar" src="${avatarUrl}" referrerPolicy="origin-when-cross-origin" />
            <span class="bt-top-name">${nameText} ${teamIndicator}</span>
            <span class="bt-top-score" style="color: ${targetColor}; font-weight: 900;">${supp.score}</span>
          </div>
        `;
      });

      topContainer.innerHTML = `
        <div class="bt-top-title">🔥 كبار الداعمين</div>
        <div class="bt-top-list">
          ${itemsHtml}
        </div>
      `;
    });

    socket.on('battle:tapEffect', (data) => {
      // Add micro visual ripples to tap
      try {
        const cardId = Number(data.receiverId) === Number(activePlayer1Id) ? 'bt-player1-card' : 'bt-player2-card';
        const cardNode = document.getElementById(cardId);
        if (cardNode) {
          cardNode.classList.add('animate-pulse');
          setTimeout(() => cardNode.classList.remove('animate-pulse'), 500);
        }
      } catch (err) {}

      createTapAvatarBubble(data);
    });

    socket.on('battle:support-animation', (data) => {
      handleSupportAnimationBubble(data);
    });

    socket.on('battle:roundEnded', (data) => {
      if (currentBattle) currentBattle.status = 'break';
      const winnerId = data.roundWinnerId;
      console.log('[BattleSocket] Round ended. Winner user id:', winnerId);

      // Mark dot index as verified
      const markWonDots = (dotContainerId, wonRoundsCount) => {
        const dots = document.querySelectorAll(`#${dotContainerId} .round-won-dot`);
        for (let i = 0; i < dots.length; i++) {
          if (i < wonRoundsCount) {
            dots[i].classList.add('won');
          }
        }
      };

      markWonDots('bt-player1-won-badges', data.player1RoundsWon);
      markWonDots('bt-player2-won-badges', data.player2RoundsWon);

      if (Number(winnerId) === Number(activePlayer1Id)) {
        const name1 = currentBattle ? renderBattleIdentity(currentBattle.player1) : 'اللاعب الأول';
        const rs_sb = document.getElementById('bt-status-bar'); if(rs_sb) rs_sb.innerHTML = `انتهت الجولة! فوز ${name1} بالنقاط.`;
      } else if (Number(winnerId) === Number(activePlayer2Id)) {
        const name2 = currentBattle ? renderBattleIdentity(currentBattle.player2) : 'اللاعب الثاني';
        const rs_sb = document.getElementById('bt-status-bar'); if(rs_sb) rs_sb.innerHTML = `انتهت الجولة! فوز ${name2} بالنقاط.`;
      } else {
        document.getElementById('bt-status-bar').textContent = 'انتهت الجولة بالتعادل!';
      }

      showRoundEndedAnnouncement(data);

      playBattleCue('win');
    });

    socket.on('battle:cancelled', (data) => {
      if (currentBattle) currentBattle.status = 'finished';
      showBattleClassicAlert(data.reason || 'تم إلغاء التحدي الحالي.', 'warning');
      collapseBattleWidget();
    });

    socket.on('battle:finished', (data) => {
      if (currentBattle) currentBattle.status = 'finished';
      console.log('[BattleSocket] Challenge concluded:', data);
      
      playBattleCue('win');
      
      showBattleFinalResultOverlay(data);
    });

    window.handleBattleSync = (data) => {
      console.log('[BattleSocket] Received state sync:', data);
      if (!data || !data.hasActiveBattle) {
        if (currentBattle) {
          collapseBattleWidget();
        }
        return;
      }
      currentBattle = data;
      activeBattleId = data.battleId;
      activePlayer1Id = Number(data.player1?.userId || data.player1?.id);
      activePlayer2Id = Number(data.player2?.userId || data.player2?.id);

      const activeMe = window.state?.currentUser?.id || 0;
      const isParticipant = Number(activeMe) === Number(activePlayer1Id) || Number(activeMe) === Number(activePlayer2Id);
      const cancelTrigger = document.getElementById('bt-cancel-challenge-btn');
      if (cancelTrigger) {
        cancelTrigger.classList.toggle('d-none', !isParticipant);
      }

      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.classList.remove('d-none');
        panel.style.display = 'block';
      }

      if (data.player1 && document.getElementById('bt-player1-name')) {
        const p1n = document.getElementById('bt-player1-name'); if(p1n) p1n.innerHTML = renderBattleIdentity(data.player1);
        setBattleAvatar('bt-player1-pic', data.player1);
      }
      if (data.player2 && document.getElementById('bt-player2-name')) {
        const p2n = document.getElementById('bt-player2-name'); if(p2n) p2n.innerHTML = renderBattleIdentity(data.player2);
        setBattleAvatar('bt-player2-pic', data.player2);
      }

      if (document.getElementById('bt-player1-score')) {
        document.getElementById('bt-player1-score').textContent = String(data.player1Score || 0);
      }
      if (document.getElementById('bt-player2-score')) {
        document.getElementById('bt-player2-score').textContent = String(data.player2Score || 0);
      }

      const p1 = Number(data.player1Score) || 0;
      const p2 = Number(data.player2Score) || 0;
      let pct = 50;
      if (p1 + p2 > 0) {
        pct = Math.max(5, Math.min(95, (p1 / (p1 + p2)) * 100));
      }
      if (document.getElementById('bt-progress-bar')) {
        document.getElementById('bt-progress-bar').style.width = `${pct}%`;
      }

      const elVal = document.getElementById('bt-timer-value') || document.getElementById('bt-timer');
      if (elVal) elVal.textContent = String(data.timer || 0);

      updateInteractiveTapButtons();
    };

    // Auto-request sync if room is active
    const activeRoomId = window.state?.currentRoomId;
    if (activeRoomId) {
      socket.emit('battle:syncState', { roomId: Number(activeRoomId) });
    }
  };

  const collapseBattleWidget = () => {
    activeBattleId = null;
    activePlayer1Id = null;
    activePlayer2Id = null;
    currentBattle = null;
    isBattleMinimized = false;
    clearAllSupportBubbles();
    
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.classList.add('d-none');
      panel.style.display = 'none';
    }

    const indicator = document.getElementById('battle-minimized-indicator');
    if (indicator) {
      indicator.classList.add('d-none');
    }
  };

  const ensureGiftModalInDOM = () => {
    let overlay = document.getElementById('battle-gift-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'battle-gift-modal-overlay';
    overlay.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      z-index: 99999;
      justify-content: center;
      align-items: center;
      direction: rtl;
      font-family: 'Tajawal', sans-serif;
    `;

    overlay.innerHTML = `
      <div style="background: #0f172a; border: 2px solid rgba(255, 255, 255, 0.1); border-radius: 12px; width: 95%; max-width: 450px; padding: 20px; box-shadow: 0 15px 30px rgba(0, 0, 0, 0.5); color: #f8fafc; position: relative;">
        <!-- Modal Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 15px; margin-bottom: 15px;">
          <h5 style="margin: 0; font-size: 16px; font-weight: 700; color: #eab308; display: flex; align-items: center; gap: 8px;">
            <span>🎁 اختر هدية دعم المتحدين</span>
          </h5>
          <button type="button" onclick="window.closeBattleGiftModal()" style="background: none; border: none; color: #94a3b8; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
        </div>

        <!-- Modal Content with Interactive Cards -->
        <div style="text-align: right; margin-bottom: 15px;">
          <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 8px; font-weight: 600;">اختر المتحدي الذي تسجّل النقاط باسمه:</label>
          <div style="display: flex; gap: 12px; margin-bottom: 15px;">
            <!-- Player 1 Card -->
            <div id="bt-modal-card-p1" class="bt-modal-player-card" onclick="window.selectBattleSupportPlayer('player1')" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px; border-radius: 10px; background: rgba(30, 41, 59, 0.5); border: 2px solid transparent; cursor: pointer; position: relative; transition: all 0.2s ease;">
              <img id="bt-modal-img-p1" src="" class="rounded-circle" style="width: 44px; height: 44px; border: 2px solid #3b82f6; margin-bottom: 6px; object-fit: cover;" referrerpolicy="no-referrer">
              <div id="bt-modal-name-p1" class="text-truncate w-full text-center" style="font-size: 12px; font-weight: 700; color: #f8fafc;"></div>
              <div id="bt-modal-desc-p1" style="font-size: 9px; color: #94a3b8; margin-top: 4px; text-align: center;">ادعم المتحدي بالنقاط!</div>
            </div>
            <!-- Player 2 Card -->
            <div id="bt-modal-card-p2" class="bt-modal-player-card" onclick="window.selectBattleSupportPlayer('player2')" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px; border-radius: 10px; background: rgba(30, 41, 59, 0.5); border: 2px solid transparent; cursor: pointer; position: relative; transition: all 0.2s ease;">
              <img id="bt-modal-img-p2" src="" class="rounded-circle" style="width: 44px; height: 44px; border: 2px solid #ec4899; margin-bottom: 6px; object-fit: cover;" referrerpolicy="no-referrer">
              <div id="bt-modal-name-p2" class="text-truncate w-full text-center" style="font-size: 12px; font-weight: 700; color: #f8fafc;"></div>
              <div id="bt-modal-desc-p2" style="font-size: 9px; color: #94a3b8; margin-top: 4px; text-align: center;">ادعم الثاني بالنقاط!</div>
            </div>
          </div>
          <!-- Hidden slot input -->
          <input type="hidden" id="bt-selected-support-slot" value="">
        </div>

        <!-- Gift Catalog Grid -->
        <div id="bt-modal-gifts-container" class="battle-gift-selection-grid select-gifts-scroller" style="max-height: 200px; overflow-y: auto; margin-bottom: 15px; padding-right: 5px;">
          <!-- Items populated dynamically -->
        </div>

        <!-- Custom Pricing Table / Quantity Options -->
        <div class="row align-items-center" style="margin-top: 15px;">
          <div class="col-7">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-dark text-white-50 border-secondary" style="font-size: 12px;">الكمية</span>
              <input type="number" id="bt-gift-qty-input" class="form-control bg-dark text-white border-secondary" value="1" min="1" max="100" style="font-size: 13px;">
            </div>
          </div>
          <div class="col-5 text-end text-warning fw-bold" id="bt-gift-total-cost-preview" style="font-size: 13px;">
            كوينز: 0
          </div>
        </div>

        <!-- Gift Summary Preview -->
        <div id="bt-gift-summary-block" style="background: rgba(15, 23, 42, 0.8); border: 1px dashed rgba(255,255,255,0.15); border-radius: 8px; padding: 10px; margin-top: 15px; display: none; font-size: 11px; line-height: 1.5; color: #cbd5e1; text-align: right;">
          <!-- Dynamically populated -->
        </div>

        <!-- Foot Action Buttons -->
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 15px;">
          <button type="button" onclick="window.submitBattleGift()" class="btn btn-warning btn-sm fw-bold" style="background: #eab308; color: #1e1b4b; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;" id="bt-submit-gift-btn">🚀 تقديم الدعم السخي</button>
          <button type="button" onclick="window.closeBattleGiftModal()" class="btn btn-secondary btn-sm" style="background: #475569; color: #f8fafc; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">إلغاء</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  };

  window.closeBattleGiftModal = () => {
    const overlay = document.getElementById('battle-gift-modal-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  };

  window.submitBattleGift = () => {
    const slotInput = document.getElementById('bt-selected-support-slot');
    const receiverSlot = slotInput ? slotInput.value : '';
    const qtyInput = document.getElementById('bt-gift-qty-input');
    const quantity = Math.max(1, Number(qtyInput ? qtyInput.value : 1));
    const giftKey = window.selectedGiftKey;

    const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
    const p1Disabled = meId && Number(meId) === Number(activePlayer1Id);
    const p2Disabled = meId && Number(meId) === Number(activePlayer2Id);

    if (p1Disabled && p2Disabled) {
      showBattleClassicAlert('لا يمكنك دعم لاعبين أنت أحدهم.', 'warning');
      return;
    }

    if (!receiverSlot) {
      showBattleClassicAlert('الرجاء اختيار مستلم الهدية بالنقر على بطاقته أولاً.', 'warning');
      return;
    }

    let receiverId = null;
    if (receiverSlot === 'player1') {
      receiverId = Number(activePlayer1Id);
    } else if (receiverSlot === 'player2') {
      receiverId = Number(activePlayer2Id);
    }

    if (meId && Number(meId) === Number(receiverId)) {
      showBattleClassicAlert('لا يمكنك دعم نفسك.', 'warning');
      return;
    }

    if (!giftKey) {
      showBattleClassicAlert('الرجاء اختيار هدية من الشبكة أولاً!', 'warning');
      return;
    }

    const opId = generateOperationId('gift');

    console.log('[BattleUI] Final gift payload:', {
      battleId: activeBattleId,
      receiverSlot,
      giftKey,
      quantity,
      operationId: opId
    });

    window.socket.emit('battle:sendGift', {
      battleId: activeBattleId,
      receiverSlot,
      giftKey,
      quantity,
      operationId: opId
    });

    window.closeBattleGiftModal();
  };

  // Selection toggle callbacks
  window.selectBattleSupportPlayer = (slot) => {
    const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
    const isP1 = slot === 'player1';
    
    // Check if they are trying to support themselves
    if (isP1 && meId && Number(meId) === Number(activePlayer1Id)) {
      showBattleClassicAlert('لا يمكنك دعم نفسك.', 'warning');
      return;
    }
    if (!isP1 && meId && Number(meId) === Number(activePlayer2Id)) {
      showBattleClassicAlert('لا يمكنك دعم نفسك.', 'warning');
      return;
    }

    const input = document.getElementById('bt-selected-support-slot');
    if (input) input.value = slot;

    // Apply Highlight borders
    const card1 = document.getElementById('bt-modal-card-p1');
    const card2 = document.getElementById('bt-modal-card-p2');

    if (card1 && card2) {
      if (isP1) {
        card1.style.border = '2px solid #3b82f6';
        card1.style.background = 'rgba(59, 130, 246, 0.15)';
        card2.style.border = '2px solid transparent';
        card2.style.background = 'rgba(30, 41, 59, 0.5)';
      } else {
        card2.style.border = '2px solid #ec4899';
        card2.style.background = 'rgba(236, 72, 153, 0.15)';
        card1.style.border = '2px solid transparent';
        card1.style.background = 'rgba(30, 41, 59, 0.5)';
      }
    }

    window.updateGiftModalReaction();
  };

  window.updateGiftModalReaction = () => {
    const slotInput = document.getElementById('bt-selected-support-slot');
    const slot = slotInput ? slotInput.value : '';
    const qtyInput = document.getElementById('bt-gift-qty-input');
    const quantity = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;
    
    const sendBtn = document.getElementById('bt-submit-gift-btn');
    const summaryBlock = document.getElementById('bt-gift-summary-block');

    if (!slot || !currentBattle) {
      if (sendBtn) {
        sendBtn.innerText = '🚀 تقديم الدعم السخي';
        sendBtn.style.background = '#eab308';
        sendBtn.style.color = '#1e1b4b';
      }
      if (summaryBlock) summaryBlock.style.display = 'none';
      return;
    }

    const isP1 = slot === 'player1';
    const selectedPlayerName = isP1 ? getBattlePlainName(currentBattle.player1) : getBattlePlainName(currentBattle.player2);
    
    // Update Button
    if (sendBtn) {
      sendBtn.innerText = `👍 دعم ${selectedPlayerName}`;
      if (isP1) {
        sendBtn.style.background = '#3b82f6';
        sendBtn.style.color = '#ffffff';
      } else {
        sendBtn.style.background = '#ec4899';
        sendBtn.style.color = '#ffffff';
      }
    }

    // Find selected gift in catalog
    const catalogGift = window.selectedGiftKey;
    const price = window.selectedGiftPrice || 0;
    const totalCost = price * quantity;

    if (catalogGift && summaryBlock) {
      let giftName = catalogGift;
      const selectedCard = document.querySelector('.battle-gift-card.selected');
      if (selectedCard) {
        const nameEl = selectedCard.querySelector('.battle-gift-name-view');
        if (nameEl) giftName = nameEl.textContent;
      }

      summaryBlock.innerHTML = `سوف ترسل هدية: <strong style="color: #ffffff;">${giftName}</strong>، الكمية: <strong style="color: #ffffff;">${quantity}</strong>، التكلفة الإجمالية: <strong style="color: #fbbf24;">${totalCost}</strong> كوينز لصالح المتحدي <strong style="color: #ffffff;">${selectedPlayerName}</strong>.`;
      summaryBlock.style.display = 'block';
    } else {
      if (summaryBlock) summaryBlock.style.display = 'none';
    }
  };

  // Open beautifully formatted gift catalog modal inside workspace
  window.openBattleGiftSelectionModal = () => {
    if (!activeBattleId) {
      showBattleClassicAlert('لا يوجد تحدي قائم حالياً.', 'warning');
      return;
    }

    if (!currentBattle) {
      showBattleClassicAlert('لا توجد بيانات تحدي نشطة حاليًا.', 'warning');
      return;
    }

    if (currentBattle.status !== 'active') {
      showBattleClassicAlert('لا يمكن إرسال الدعم إلا أثناء الجولة النشطة.', 'warning');
      return;
    }

    // Emit event requesting gift catalog
    window.socket.emit('battle:getGiftCatalog', (res) => {
      if (!res || !res.success) {
        showBattleClassicAlert(res.message || 'تعذر تحميل كتالوج الهدايا.', 'warning');
        return;
      }

      const catalog = res.catalog || [];
      if (catalog.length === 0) {
        showBattleClassicAlert('كتالوج الهدايا فارغ.', 'warning');
        return;
      }

      // Ensure modal container in DOM
      const overlay = ensureGiftModalInDOM();

      // Render catalog UI to grid
      let cardsHtml = '';
      catalog.forEach((gift) => {
        cardsHtml += `
          <div class="battle-gift-card" onclick="window.selectBattleGiftingCard(event, '${gift.key}', ${gift.price})">
            <span class="battle-gift-icon-view">${gift.icon || '🎁'}</span>
            <span class="battle-gift-name-view">${gift.name}</span>
            <span class="battle-gift-price-view"><i class="fas fa-star"></i> ${gift.price} كوينز</span>
          </div>
        `;
      });
      document.getElementById('bt-modal-gifts-container').innerHTML = cardsHtml;

      // Render Active Player details inside Cards
      const p1Plain = getBattlePlainName(currentBattle.player1);
      const p2Plain = getBattlePlainName(currentBattle.player2);
      
      document.getElementById('bt-modal-name-p1').innerHTML = renderBattleIdentity(currentBattle.player1);
      document.getElementById('bt-modal-name-p2').innerHTML = renderBattleIdentity(currentBattle.player2);

      const imgP1 = document.getElementById('bt-modal-img-p1');
      const imgP2 = document.getElementById('bt-modal-img-p2');
      if (imgP1) imgP1.src = getBattleAvatarUrl(currentBattle.player1);
      if (imgP2) imgP2.src = getBattleAvatarUrl(currentBattle.player2);

      // Disable self-support
      const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
      const p1Self = meId && Number(meId) === Number(activePlayer1Id);
      const p2Self = meId && Number(meId) === Number(activePlayer2Id);

      const card1 = document.getElementById('bt-modal-card-p1');
      const card2 = document.getElementById('bt-modal-card-p2');
      
      let preSelectedSlot = '';

      if (card1 && card2) {
        // Reset styles first
        card1.style.opacity = '1';
        card1.style.cursor = 'pointer';
        document.getElementById('bt-modal-desc-p1').textContent = `ادعم ${p1Plain} بالنقاط!`;
        document.getElementById('bt-modal-desc-p1').style.color = '#94a3b8';

        card2.style.opacity = '1';
        card2.style.cursor = 'pointer';
        document.getElementById('bt-modal-desc-p2').textContent = `ادعم ${p2Plain} بالنقاط!`;
        document.getElementById('bt-modal-desc-p2').style.color = '#94a3b8';

        if (p1Self) {
          card1.style.opacity = '0.4';
          card1.style.cursor = 'not-allowed';
          document.getElementById('bt-modal-desc-p1').textContent = '🔒 لا يمكنك دعم نفسك';
          document.getElementById('bt-modal-desc-p1').style.color = '#ef4444';
          preSelectedSlot = 'player2';
        }
        if (p2Self) {
          card2.style.opacity = '0.4';
          card2.style.cursor = 'not-allowed';
          document.getElementById('bt-modal-desc-p2').textContent = '🔒 لا يمكنك دعم نفسك';
          document.getElementById('bt-modal-desc-p2').style.color = '#ef4444';
          preSelectedSlot = 'player1';
        }

        if (!p1Self && !p2Self) {
          preSelectedSlot = 'player1'; // Default
        }
      }

      // Reset state variables inside dialog
      window.selectedGiftKey = null;
      window.selectedGiftPrice = 0;
      const preview = document.getElementById('bt-gift-total-cost-preview');
      if (preview) {
        preview.textContent = 'كوينز: 0';
      }
      
      const qtyInput = document.getElementById('bt-gift-qty-input');
      if (qtyInput) {
        qtyInput.value = '1';
        qtyInput.oninput = () => {
          const q = Math.max(1, parseInt(qtyInput.value) || 1);
          const previewPr = document.getElementById('bt-gift-total-cost-preview');
          if (previewPr) {
            previewPr.textContent = `كوينز: ${window.selectedGiftPrice * q}`;
          }
          window.updateGiftModalReaction();
        };
      }

      // Pre-select allowed slot
      if (preSelectedSlot) {
        window.selectBattleSupportPlayer(preSelectedSlot);
      } else {
        const slotInput = document.getElementById('bt-selected-support-slot');
        if (slotInput) slotInput.value = '';
        window.updateGiftModalReaction();
      }

      // Show modal overlay
      overlay.style.display = 'flex';
    });
  };

  window.selectBattleGiftingCard = (event, key, price) => {
    window.selectedGiftKey = key;
    window.selectedGiftPrice = Number(price);

    // Update active highlight classes
    document.querySelectorAll('.battle-gift-card').forEach((card) => {
      card.classList.remove('selected');
    });

    const targetCard = event.currentTarget;
    if (targetCard) {
      targetCard.classList.add('selected');
    }

    // Update pricing text preview
    const qtyInput = document.getElementById('bt-gift-qty-input');
    const q = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;
    const preview = document.getElementById('bt-gift-total-cost-preview');
    if (preview) {
      preview.textContent = `كوينز: ${Number(price) * q}`;
    }

    window.updateGiftModalReaction();
  };

  window.cancelActiveBattle = () => {
    const room = window.state ? window.state.currentRoomId : 0;
    if (room) {
      window.socket.emit('battle:cancel', { roomId: Number(room) });
    }
  };

  // Mount listeners on script load
  const setupOnReady = () => {
    wireUpInteractiveTaps();
    hookSocketInboundEvents();
    initializeProfileTrigger();

    // Hook minimize button
    const minBtn = document.getElementById('bt-minimize-btn');
    if (minBtn) {
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBattleMinimization(true);
      });
    }

    // Hook floating live badge restore
    const miniInd = document.getElementById('battle-minimized-indicator');
    if (miniInd) {
      miniInd.addEventListener('click', () => {
        toggleBattleMinimization(false);
      });
    }


    // Hook user profile inspection changes
    const profileModalEl = document.getElementById('userProfileModal');
    if (profileModalEl) {
      profileModalEl.addEventListener('shown.bs.modal', function () {
        initializeProfileTrigger();
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupOnReady);
  } else {
    setupOnReady();
  }
})();
