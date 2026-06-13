// مراقبة وحذف عنصر رقم العضوية نهائيًا
const removeUserHash = () => {
  document.querySelectorAll('.chat_pane__user_item__status__hash').forEach(el => el.remove());
};

// حذف فوري عند التحميل
removeUserHash();

// مراقبة أي تغييرات في الصفحة (لأن العناصر تُضاف ديناميكيًا)
const observer = new MutationObserver(() => removeUserHash());
observer.observe(document.body, { childList: true, subtree: true });


(function() {
  'use strict';

  // ✅ التأكيد قبل مسح الرسائل
  setInterval(() => {
    const clearBtn = document.querySelector('button.chat__body__message-input__clear.btn.btn-primary.fa.fa-trash');
    if (clearBtn && !clearBtn.dataset.confirmAttached) {
      clearBtn.dataset.confirmAttached = 'true';
      clearBtn.addEventListener('click', function(event) {
        const confirmDelete = confirm('هل أنت متأكد أنك تريد مسح الحقل؟');
        if (!confirmDelete) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }
  }, 1000);
setInterval(() => {
  const revealNamesBtn = document.querySelector('button#user_profile__footer__actions__item--reveal-names.btn.btn-default.fa.fa-search');
  if (revealNamesBtn && !revealNamesBtn.dataset.confirmAttached) {
    revealNamesBtn.dataset.confirmAttached = 'true';
    revealNamesBtn.addEventListener('click', function(event) {
      // نافذة التنبيه
      const confirmReveal = confirm('يرجى العلم انه يمنع منعاً باتاً مشاركة معلومات هذا العضو مع اي شخص آخر.\nكشف النكات هي خاصية تنظيمية إدارية فقط لا غير.\nخصوصية الأعضاء أمانة بين يديكم.');
      if (!confirmReveal) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }
}, 1000);


(function () {
  let openOptionsMenu = null;
  let closeTimeout = null;

  function addOptionsButton(container) {
    if (container.querySelector("#optionsButton")) return;

    const replyButton = container.querySelector('.public_message__reply');
    const removeButton = container.querySelector('.public_message__remove');

    const btn = document.createElement("button");
    btn.id = "optionsButton";
    btn.className = "options-btn";
    btn.innerHTML = `<span><span class="fa fa-ellipsis-h"></span></span>`;
    container.appendChild(btn);

    const optionsMenu = document.createElement("div");
    optionsMenu.id = "optionsMenu";
    optionsMenu.className = "options-menu";
    optionsMenu.style.display = 'none';

    if (replyButton) {
      optionsMenu.appendChild(replyButton);
      replyButton.style.display = 'inline-flex';
      replyButton.addEventListener("click", function(event) {
        event.stopPropagation();
        console.log("تم النقر على زر الرد");
        optionsMenu.style.display = 'none';
      });
    }

    if (removeButton) {
      optionsMenu.appendChild(removeButton);
      removeButton.style.display = 'inline-flex';
      removeButton.addEventListener("click", function(event) {
        event.stopPropagation();
        console.log("تم النقر على زر الحذف");
        optionsMenu.style.display = 'none';
      });
    }

    container.appendChild(optionsMenu);

    btn.addEventListener("click", function(event) {
      event.stopPropagation();
      if (openOptionsMenu && openOptionsMenu !== optionsMenu) {
        openOptionsMenu.style.display = 'none';
      }
      optionsMenu.style.display = optionsMenu.style.display === 'block' ? 'none' : 'block';
      openOptionsMenu = optionsMenu;

      if (closeTimeout) clearTimeout(closeTimeout);
    });

    window.addEventListener("click", function(event) {
      if (!event.target.closest(".public_message__buttons")) {
        optionsMenu.style.display = 'none';
        closeTimeout = setTimeout(() => {
          if (openOptionsMenu) openOptionsMenu.style.display = 'none';
        }, 5000);
      }
    });
  }

  const observer = new MutationObserver(() => {
    const messageContainers = document.querySelectorAll(".public_message__buttons");
    messageContainers.forEach((container) => {
      addOptionsButton(container);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", () => {
    setTimeout(() => {
      const messageContainers = document.querySelectorAll(".public_message__buttons");
      messageContainers.forEach((container) => {
        addOptionsButton(container);
      });
    }, 700);
  });
})();

document.addEventListener(
  'pointerdown',
  function (e) {
    const chatBox = document.getElementById('chat_box');
    const closeBtn = document.getElementById('chat_box__header__close');

    if (!chatBox || !closeBtn) return;

    // تحقق فعلي أن الشات ظاهر
    const isVisible =
      chatBox.offsetWidth ||
      chatBox.offsetHeight ||
      chatBox.getClientRects().length;

    if (!isVisible) return;

    // إذا الضغط داخل مربع الشات لا تغلق
    if (chatBox.contains(e.target)) return;

    // نفّذ نفس إجراء زر الإغلاق
    closeBtn.click();
  },
  true // capture phase (مهم جداً)
);


document.addEventListener('click', function(event) {
    const welcomeMessages = document.querySelectorAll('.welcome-message');

    welcomeMessages.forEach(msg => {
        // إذا النقر كان خارج النافذة
        if (!msg.contains(event.target)) {
            // البحث عن زر الإغلاق داخل هذه النافذة
            const closeBtn = msg.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.click(); // محاكاة الضغط على زر الإغلاق
            } else {
                msg.remove(); // fallback: إزالة العنصر مباشرة إذا لم يوجد زر
            }
        }
    });
});



(function() {
    const elements = document.querySelectorAll(
        '.user_profile__body__stats, \
         .user_profile__body__stats--stars, \
         .user_profile__body__stats--points, \
         .user_profile__body__room'
    );

    function updateVisibility() {
        const giftWindow = document.querySelector('.gifts_picker__contianer');

        elements.forEach(el => {
            if (giftWindow && giftWindow.offsetParent !== null) {
                // نافذة الهدايا ظاهرة → أخفي العناصر مؤقتًا
                el.style.display = 'none';
            } else {
                // نافذة الهدايا مغلقة → أعد العناصر للظهور
                el.style.display = '';
            }
        });
    }

    // مراقبة أي تغيير في DOM (فتح/إغلاق نافذة الهدايا)
    const observer = new MutationObserver(updateVisibility);
    observer.observe(document.body, { childList: true, subtree: true });

    // تفعيل أولي عند تحميل الصفحة
    updateVisibility();
})();



(function () {

    function processMessages() {
        document.querySelectorAll('.public_message.linen').forEach(msg => {

            if (msg.dataset.processed === 'true') return;

            const text = msg.innerText.trim();

            /* دخول */
            if (text.includes('دخل')) {
                msg.dataset.processed = 'true';
                msg.classList.add('js-join');

                msg.innerHTML = msg.innerHTML.replace(
                    /هذا المستخدم قد دخل.*/g,
                    '✨ هذا المستخدم نوّر المكـان'
                );
                return;
            }

            /* خروج */
            if (text.includes('غادر')) {
                msg.dataset.processed = 'true';
                msg.classList.add('js-leave');
                return;
            }

            /* انتقال إلى غرفة */
            if (text.includes('إنتقل إلى')) {
                msg.dataset.processed = 'true';
                msg.classList.add('js-move');

                const content = msg.querySelector('.public_message__content');
                if (content) {
                    content.innerHTML = '<span>هذا المستخدم إنتقل إلى غرفة اخرى</span>';
                }
                return;
            }

            /* 🚫 طرد */
            if (text.includes('تم طرده من الدردشة')) {
                msg.dataset.processed = 'true';
                msg.classList.add('js-kick');

                const content = msg.querySelector('.public_message__content');
                if (content) {
                    content.innerHTML = '<span> تم طرده من الدردشة</span>';
                }
                return;
            }

        });
    }

    // تشغيل أولي
    processMessages();

    // مراقبة الرسائل الجديدة
    const observer = new MutationObserver(processMessages);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();


(function() {
    const emojiPickers = document.querySelectorAll('.emoji_picker');

    emojiPickers.forEach(picker => {
        const btn = document.querySelector(`[data-target="#${picker.id}"], .emoji-button`); // زر مرتبط أو عام
        const inputSelector = picker.dataset.input;
        const input = inputSelector ? document.querySelector(inputSelector) : null;

        if (!btn) return;

        btn.addEventListener('click', e => {
            e.stopPropagation();

            // ضبط موقع الصندوق
            const rect = btn.getBoundingClientRect();
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            let top = rect.bottom + 5;
            let left = rect.left;

            if (left + picker.offsetWidth > screenWidth - 10) {
                left = screenWidth - picker.offsetWidth - 10;
            }
            if (top + picker.offsetHeight > screenHeight - 10) {
                top = rect.top - picker.offsetHeight - 5;
            }

            picker.style.top = `${top}px`;
            picker.style.left = `${left}px`;
            picker.style.display = picker.style.display === 'grid' ? 'none' : 'grid';
        });

        // عند اختيار أي إيموجي
        picker.querySelectorAll('.emoji_picker__item').forEach(emoji => {
            emoji.addEventListener('click', e => {
                if (input) {
                    input.value += emoji.dataset.key; // إضافة الإيموجي للـ input
                }
                picker.style.display = 'none'; // إغلاق الصندوق
            });
        });
    });

    // إغلاق كل الصناديق عند الضغط خارجها
    document.addEventListener('click', e => {
        emojiPickers.forEach(picker => {
            if (!picker.contains(e.target)) {
                picker.style.display = 'none';
            }
        });
    });
})();


(function () {

    const applyGifName = () => {

        document.querySelectorAll('.username__wrapper').forEach(el => {

            if (el.dataset.processed) return;

            if (el.textContent.trim() === 'ＮＪＭ') {

                el.dataset.processed = '1';

                // تفريغ العنصر وإنشاء span داخلي
                el.textContent = '';
                const inner = document.createElement('span');
                inner.className = 'username__gif_inner';
                inner.textContent = 'ＮＪＭ';
                el.appendChild(inner);

                // إزالة الخلفية الأصلية للقوة
                el.style.background = 'none';
                el.style.backgroundColor = 'transparent';
            }

        });

    };

    applyGifName();

    new MutationObserver(applyGifName).observe(document.body, {
        childList: true,
        subtree: true
    });

})();


(function() {

    // إنشاء backdrop واحد فقط
    let backdrop = document.querySelector('.image-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'image-backdrop';
        document.body.appendChild(backdrop);
    }

    function enablePreview() {
        document.querySelectorAll(
            '.public_message__body__image, .private_message__body__image, .wall_post__body--photo-img'
        ).forEach(img => {

            if (img.dataset.previewAttached) return;
            img.dataset.previewAttached = 'true';

            const isPrivate = img.classList.contains('private_message__body__image') ||
                              img.classList.contains('wall_post__body--photo-img');

            let target = img;

            // إذا كانت خاصة أو wall → نضع overlay لمنع فتح الصفحة الجديدة
            if (isPrivate) {
                const wrapper = img.parentElement;
                if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';

                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:absolute;inset:0;cursor:zoom-in;background:rgba(0,0,0,0);z-index:5;';
                wrapper.appendChild(overlay);
                target = overlay;
            }

            target.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();

                if (document.querySelector('.image-preview')) return;

                const preview = document.createElement('img');
                preview.src = img.src;
                preview.className = 'image-preview';
                document.body.appendChild(preview);

                requestAnimationFrame(() => {
                    backdrop.classList.add('active');
                    preview.classList.add('active');
                });

                const closePreview = () => {
                    backdrop.classList.remove('active');
                    preview.classList.remove('active');
                    setTimeout(() => preview.remove(), 250);
                };

                backdrop.onclick = preview.onclick = closePreview;
            });
        });
    }

    enablePreview();
    new MutationObserver(enablePreview).observe(document.body, { childList: true, subtree: true });

})();

(function() {
    // جميع الـ textarea التي نريد تعديل placeholder لها
    const targetIds = [
        "chat__body__message-input__input",
        "chat__body__wall_pane__form__input",
        "chat_box__footer__input"
    ];

    function changePlaceholders() {
        targetIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.placeholder = "أكتـب رسالتـك يـا حُـلو ... ";
            }
        });
    }

    // نجرب مباشرة أول مرة
    changePlaceholders();

    // نراقب DOM لأي تغييرات قد تضيف أي من هذه العناصر لاحقًا
    const observer = new MutationObserver(changePlaceholders);
    observer.observe(document.body, { childList: true, subtree: true });
})();


(function() {
    function changeButtonText() {
        const btn = document.getElementById("chat__body__settings_pane__container__button--send_ad");
        if (btn && !btn.dataset.textChanged) {
            const span = btn.querySelector("span");
            if (span) {
                // نحافظ على أيقونة fa-send، ونغير فقط النص بعد الأيقونة
                const icon = span.querySelector(".fa");
                if (icon) {
                    // حذف أي نص موجود بعد الأيقونة
                    const textNode = Array.from(span.childNodes).find(n => n.nodeType === 3);
                    if (textNode) {
                        textNode.textContent = " إرسال إعلان";
                    } else {
                        span.appendChild(document.createTextNode(" إرسال إعلان"));
                    }
                    btn.dataset.textChanged = "true"; // لمنع التكرار
                }
            }
        }
    }

    // تنفيذ مباشر
    changeButtonText();

    // مراقبة DOM لأي تغييرات
    const observer = new MutationObserver(changeButtonText);
    observer.observe(document.body, { childList: true, subtree: true });
(function () {
  document.addEventListener(
    "click",
    function (e) {
      const micItem = e.target.closest(".mic-speakers--item");
      if (!micItem) return;

      // قبل الصعود فقط
      if (!micItem.classList.contains("is_speaking")) {
        const confirmMic = confirm("هل أنت متأكد أنك تريد الصعود للمايك؟");

        if (!confirmMic) {
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
          return false;
        }
      }
    },
    true // capture مهم جدًا
  );
})();

(function () {
  let lastClickTime = 0;
  const DOUBLE_CLICK_DELAY = 350; // بالمللي ثانية

  document.addEventListener("click", function (e) {
    const micItem = e.target.closest(".mic-speakers--item.is_speaking");
    if (!micItem) return;

    const now = Date.now();

    if (now - lastClickTime <= DOUBLE_CLICK_DELAY) {
      // دبل كليك تحقق
      const leaveBtn = document.getElementById(
        "mic-speakers--item__modal--leave-mic"
      );

      if (leaveBtn) {
        leaveBtn.click();
      }
    }

    lastClickTime = now;
  });
})();



(function () {

  const FORM_IDS = [
    "user_profile__footer__actions__item_group--change-decoration",
    "user_profile__footer__actions__item_group--control-likes",
    "user_profile__footer__actions__item_group--wall-points",
    "user_profile__footer__actions__item_group--change-room",
    "user_profile__footer__actions__item_group--change-role",
    "user_profile__footer__actions__item_group--change-subscription-end"
  ];

  let expanded = false;
  let currentContainer = null;

  function getExistingForms() {
    return FORM_IDS
      .map(id => document.getElementById(id))
      .filter(Boolean);
  }

  function forceApply() {
    const container = document.querySelector(".user_profile__footer__actions");

    // إذا دخلت على بروفايل جديد أو خرجت
    if (container !== currentContainer) {
      expanded = false; // إعادة ضبط الزر عند تغيير الصفحة
      currentContainer = container;
    }

    if (!container) return;

    const forms = getExistingForms();
    let span = container.querySelector("#moreActionsSpan");

    // إذا ما فيه أي عنصر → إحذف الزر لو موجود
    if (forms.length === 0) {
      if (span) span.remove();
      return;
    }

    // إنشاء الزر إذا غير موجود
    if (!span) {
      span = document.createElement("span");
      span.className = "user_profile__footer__actions__item";
      span.id = "moreActionsSpan";

      const btn = document.createElement("button");
      btn.id = "forceMoreBtn";
      btn.className = "btn btn-default fa fa-ellipsis-h";
      btn.textContent = " إدارة الصلاحيات";

      btn.onclick = () => {
        expanded = !expanded;
        applyVisibility();
        btn.textContent = expanded ? " أخفِ" : " إدارة الصلاحيات";
      };

      span.appendChild(btn);
      container.appendChild(span);
    }

    applyVisibility();
  }

  function applyVisibility() {
    const forms = getExistingForms();

    forms.forEach(el => {
      if (!el.dataset.originalDisplay) {
        el.dataset.originalDisplay = getComputedStyle(el).display;
      }

      el.style.display = expanded
        ? el.dataset.originalDisplay
        : "none";
    });
  }

  const observer = new MutationObserver(forceApply);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  setTimeout(forceApply, 500);

})();


(function() {
    const observer = new MutationObserver(() => {
        initGiftsFeature();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    function initGiftsFeature() {
        const gifts = document.querySelector('.gifts_picker');
        const giftBtn = document.querySelector('#user_profile__footer__actions__item--gift');
        const footer = document.querySelector('.user_profile__footer__actions');
        const modalBody = document.querySelector('.user_profile__body.modal-body');

        if (!gifts || !giftBtn || !footer || !modalBody) return;

     
        const userDetails = document.querySelector('#user_profile__body__user_details');
        const userStats = document.querySelector('.user_profile__body__stats');
        const userTags  = document.querySelector('.user_profile__body__tags');
        const userCover = document.querySelector('.user_profile__cover-container.position-relative');
        const userAvatarImg = document.querySelector('.user_profile__body__avatar.cover'); // الأفتار

        if (!userDetails || !userStats || !userTags || !userCover || !userAvatarImg) return;

      
        if (!modalBody.nextElementSibling || !modalBody.nextElementSibling.classList.contains('gifts_picker')) {
            modalBody.insertAdjacentElement('afterend', gifts);
        }


        let backBtn = document.querySelector('#gifts_back_btn');
        if (!backBtn) {
            backBtn = document.createElement('button');
            backBtn.id = 'gifts_back_btn';
            backBtn.textContent = 'رجوع';
            backBtn.style.cssText = 'margin-bottom:2px;padding:5px 10px;cursor:pointer;';
            gifts.insertBefore(backBtn, gifts.firstChild);

            backBtn.addEventListener('click', () => {
                // إخفاء الهدايا
                gifts.style.display = 'none';

                // إظهار الفوتر كما كان
                footer.style.visibility = 'visible';
                footer.style.position = '';
                footer.style.zIndex = '';

                // التأكيد على ثبات العناصر الأساسية
                userDetails.style.display = 'block';
                userStats.style.display = 'flex';
                userTags.style.display = 'flex';
                userCover.style.display = 'block';

                // التأكيد على ظهور الأفتار دائمًا
                userAvatarImg.style.display = 'block';
                userAvatarImg.style.position = 'relative';
                userAvatarImg.style.zIndex = '2000';
            });
        }


        if (!giftBtn.dataset.listener) {
            giftBtn.addEventListener('click', () => {
                gifts.style.display = 'block';
                gifts.style.position = 'relative';
                gifts.style.width = '100%';
                gifts.style.height = 'auto';
                gifts.style.zIndex = '1000';

                // فقط نجعل الفوتر مخفي مؤقتًا
                footer.style.visibility = 'hidden';
                footer.style.position = 'absolute';
                footer.style.zIndex = '-1';

                // التأكيد على ثبات العناصر الأساسية
                userDetails.style.display = 'block';
                userStats.style.display = 'flex';
                userTags.style.display = 'flex';
                userCover.style.display = 'block';

                // الأفتار يجب أن يظل ظاهرًا فوق كل شيء
                userAvatarImg.style.display = 'block';
                userAvatarImg.style.position = 'relative';
                userAvatarImg.style.zIndex = '2000';
            });
            giftBtn.dataset.listener = 'true';
        }
    }

    initGiftsFeature();
})();
 function createModal(message, onOk, onCancel) {
    const existing = document.getElementById("customRoleModal");
    if (existing) existing.remove();

    const modalBg = document.createElement("div");
    modalBg.id = "customRoleModal";
    Object.assign(modalBg.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.6)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999
    });

    const modalBox = document.createElement("div");
    Object.assign(modalBox.style, {
      width: "500px",
      maxHeight: "80%",
      backgroundColor: "#fff",
      padding: "20px",
      borderRadius: "8px",
      overflow: "hidden", // تعطيل أي تمرير داخل المودال
      boxShadow: "0 0 10px rgba(0,0,0,0.3)",
      fontFamily: "Arial, sans-serif",
      direction: "rtl",
      textAlign: "right"
    });

    const pre = document.createElement("pre");
    pre.textContent = message;
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordWrap = "break-word";
    pre.style.overflowY = "hidden"; // تعطيل التمرير العمودي تمامًا
    modalBox.appendChild(pre);

    const btnContainer = document.createElement("div");
    Object.assign(btnContainer.style, {
      marginTop: "15px",
      textAlign: "left"
    });

const okBtn = document.createElement("button");
okBtn.textContent = "حسناً";
okBtn.className = "role-modal-btn ok-btn"; // استخدم class فقط
okBtn.onclick = () => { modalBg.remove(); onOk(); };

const cancelBtn = document.createElement("button");
cancelBtn.textContent = "إلغاء";
cancelBtn.className = "role-modal-btn cancel-btn"; // استخدم class فقط
cancelBtn.onclick = () => { modalBg.remove(); onCancel(); };




    btnContainer.appendChild(okBtn);
    btnContainer.appendChild(cancelBtn);
    modalBox.appendChild(btnContainer);
    modalBg.appendChild(modalBox);
    document.body.appendChild(modalBg);
  }

// JS لتطبيق المربع تلقائياً على العناصر الديناميكية
(function() {
  function styleGiftContainers() {
    const containers = document.querySelectorAll(".gifts_picker__contianer");
    containers.forEach(el => {
      el.style.border = "1px solid black";
      el.style.borderRadius = "8px";
      el.style.padding = "1px";
      el.style.margin = "15px 10px"; // مسافة من اليمين واليسار
      el.style.boxSizing = "border-box";
      el.style.maxHeight = "300px";
      el.style.overflowY = "scroll";

      // إخفاء شريط التمرير
      el.style.scrollbarWidth = "none";  
      el.style.msOverflowStyle = "none"; 
      if (!el.classList.contains("scrollbar-hidden")) {
        el.classList.add("scrollbar-hidden");
      }
    });
  }

  // مراقبة DOM لتطبيق التنسيق على العناصر الجديدة
  const observer = new MutationObserver(styleGiftContainers);
  observer.observe(document.body, { childList: true, subtree: true });

  // تطبيق التنسيق فوراً على أي عنصر موجود
  styleGiftContainers();
})();



(function () {

    const applyStyles = (el, styles) => {
        Object.entries(styles).forEach(([prop, value]) => el.style.setProperty(prop, value, 'important'));
    };
(function () {

  function addExtraButton() {
    var tabsContent = document.getElementById("tabs-content");
    if (!tabsContent || tabsContent.dataset.extraBtnAdded) return;

    tabsContent.dataset.extraBtnAdded = "true";

    var wrapper = document.createElement("div");
    wrapper.style.textAlign = "center";
    wrapper.style.marginTop = "4px";
    wrapper.style.display = "flex";
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "8px"; // المسافة بين النص والزر

    // إضافة النص على اليسار
    var label = document.createElement("span");
    label.textContent = "المنفذ الآخر ->";
    label.style.color = "#5F0000";
    label.style.fontSize = "11px";
    label.style.fontWeight = "600";

    // إنشاء الزر
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "شات روح مسقط";

    /* أقل ارتفاع ممكن */
    btn.style.padding = "2px 12px";
    btn.style.fontSize = "11px";
    btn.style.fontWeight = "600";
    btn.style.lineHeight = "1.1";
    btn.style.whiteSpace = "nowrap";
    btn.style.color = "#fff";
    btn.style.background = "#5F0000";
    btn.style.border = "none";
    btn.style.outline = "none";
    btn.style.cursor = "pointer";

    /* زوايا عليا منحنية */
    btn.style.borderTopLeftRadius = "15px";
    btn.style.borderTopRightRadius = "15px";
    /* زوايا سفلية مستقيمة */
    btn.style.borderBottomLeftRadius = "0";
    btn.style.borderBottomRightRadius = "0";

    /* ظل كثيف واحترافي حول الزر */
    btn.style.boxShadow = `
      0 4px 8px rgba(95,0,0,0.9),
      0 8px 16px rgba(95,0,0,0.7),
      0 12px 24px rgba(95,0,0,0.5)
    `;

    // ربط الزر بالرابط
    btn.addEventListener("click", function () {
      window.open("https://www.chat300.com/", "_blank");
    });
    // إضافة النص أولاً على اليسار
    wrapper.appendChild(label);
    wrapper.appendChild(btn);
    tabsContent.appendChild(wrapper);
  }

  addExtraButton();

  new MutationObserver(addExtraButton).observe(document.body, {
    childList: true,
    subtree: true
  });

})();

(function () {
  "use strict";

  /* ==========================
   * Helpers
   * ========================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const once = (key) => {
    if (document.documentElement.dataset[key]) return false;
    document.documentElement.dataset[key] = "1";
    return true;
  };

  const observeBody = (fn) => {
    let raf = 0;
    const run = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        fn();
      });
    };
    run();
    new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  };

  function getOthersContainer() {
    return $(".chat__body__others-pane__container");
  }

  function makeBtnBase() {
    const btn = document.createElement("div");
    btn.className = "chat__body__others-pane__container__button form-control";
    btn.style.cursor = "pointer";
    btn.style.textAlign = "center";
    btn.style.fontWeight = "bold";
    btn.style.marginTop = "4px";
    return btn;
  }

  function makeWrapperBase(widthPx = 400) {
    const w = document.createElement("div");
    w.style.position = "absolute";
    w.style.top = "50px";
    w.style.left = "50%";
    w.style.transform = "translateX(-50%)";
    w.style.width = `${widthPx}px`;
    w.style.zIndex = "9999";
    w.style.display = "none";
    document.body.appendChild(w);
    return w;
  }

  function makeTopBar(parent) {
    const topBar = document.createElement("div");
    topBar.style.position = "relative";
    topBar.style.width = "100%";
    topBar.style.height = "40px";
    topBar.style.display = "flex";
    topBar.style.justifyContent = "space-between";
    topBar.style.alignItems = "center";
    topBar.style.padding = "0 10px";
    parent.appendChild(topBar);
    return topBar;
  }

  function makeIconBtn(parent, html, sizePx, title = "") {
    const el = document.createElement("div");
    el.innerHTML = html;
    el.style.color = "#fff";
    el.style.fontSize = sizePx;
    el.style.cursor = "pointer";
    el.style.fontWeight = "bold";
    el.style.userSelect = "none";
    if (title) el.title = title;
    parent.appendChild(el);
    return el;
  }

  /* ==========================
   * Runtime (performance)
   * ========================== */
  const RUNTIME = {
    snake: { interval: null },
    flappy: { interval: null }
  };

  // وقف استهلاك CPU بالخلف (مهم للجوال) بدون تغيير سلوك/شكل الألعاب
  if (once("games_visibility_pause")) {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          if (RUNTIME.snake.interval) {
            clearInterval(RUNTIME.snake.interval);
            RUNTIME.snake.interval = null;
          }
          if (RUNTIME.flappy.interval) {
            clearInterval(RUNTIME.flappy.interval);
            RUNTIME.flappy.interval = null;
          }
        }
      },
      { passive: true }
    );
  }
  /* ==========================
   * 1) Snake Game (Styled like other games)
   * ========================== */
  (function () {
    function addSnakeGameButton() {
      const container = getOthersContainer();
      if (!container || container.dataset.snakeBtnAdded) return;
      container.dataset.snakeBtnAdded = "true";

      const btn = document.createElement("div");
      btn.className = "chat__body__others-pane__container__button form-control";
      btn.style.backgroundColor = "#28a745";
      btn.style.color = "#fff";
      btn.style.cursor = "pointer";
      btn.style.textAlign = "center";
      btn.style.fontWeight = "bold";
      btn.style.marginTop = "4px";
      btn.innerHTML = '<span><span class="fa fa-gamepad"></span> لعبـة الثعبـان</span>';
      container.appendChild(btn);

      // ===== Wrapper (same style as others) =====
      const w = document.createElement("div");
      Object.assign(w.style, {
        position: "absolute",
        top: "50px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "360px",
        zIndex: "9999",
        display: "none",
        background: "#222",
        padding: "10px",
        borderRadius: "10px"
      });
      document.body.appendChild(w);

      // ===== Top Bar (same as others) =====
      const top = document.createElement("div");
      Object.assign(top.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "6px",
        color: "#fff"
      });
      w.appendChild(top);

      function icon(html, size, title) {
        const x = document.createElement("div");
        x.innerHTML = html;
        x.style.fontSize = size;
        x.style.cursor = "pointer";
        x.style.fontWeight = "bold";
        x.style.userSelect = "none";
        if (title) x.title = title;
        top.appendChild(x);
        return x;
      }

      const closeBtn = icon("&times;", "22px", "إغلاق");
      const restartBtn = icon("&#8635;", "18px", "إعادة اللعبة");

      const scoreBox = document.createElement("div");
      scoreBox.style.fontSize = "14px";
      scoreBox.style.fontWeight = "bold";
      top.appendChild(scoreBox);

      // ===== Square Canvas (like box style) =====
      const canvas = document.createElement("canvas");
      canvas.width = 340;
      canvas.height = 340; // مربع
      canvas.style.cssText =
        "background:rgba(0,0,0,0.7);display:block;margin:0 auto;border-radius:8px;";
      w.appendChild(canvas);

      // ===== Footer (same style as others) =====
      const foot = document.createElement("div");
      foot.style.textAlign = "center";
      foot.style.color = "rgba(255,255,255,.6)";
      foot.style.fontSize = "11px";
      foot.style.marginTop = "6px";
      foot.innerHTML = "البرمجة بواسطة:وديع";
      w.appendChild(foot);

      // ===== Joystick wrapper (keep, but style tidy) =====
      const joystickWrapper = document.createElement("div");
      joystickWrapper.style.position = "relative";
      joystickWrapper.style.width = "200px";
      joystickWrapper.style.height = "200px";
      joystickWrapper.style.margin = "10px auto 0";
      joystickWrapper.style.background = "rgba(0,0,0,0.35)";
      joystickWrapper.style.borderRadius = "12px";
      joystickWrapper.style.display = "grid";
      joystickWrapper.style.gridTemplateColumns = "repeat(3, 1fr)";
      joystickWrapper.style.gridTemplateRows = "repeat(3, 1fr)";
      joystickWrapper.style.gap = "5px";
      w.appendChild(joystickWrapper);

      for (let i = 0; i < 9; i++) {
        const cell = document.createElement("div");
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        joystickWrapper.appendChild(cell);
      }

      const ctx = canvas.getContext("2d");
      // تحسين بسيط للأداء/حدة الرسم (بدون تغيير شكل اللعبة عملياً)
      ctx.imageSmoothingEnabled = false;

      const currentDirection = { x: 1, y: 0 };
      let highScore = parseInt(localStorage.getItem("snakeHighScore") || "0", 10);

      let gameState = null;

      function initGame() {
        const scale = 20;
        const rows = Math.floor(canvas.height / scale);
        const cols = Math.floor(canvas.width / scale);

        const snake = [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }];
        const apple = { x: Math.floor(cols * 0.7), y: Math.floor(rows * 0.6) };
        const speed = 200;

        gameState = { scale, rows, cols, snake, apple, speed, gameOver: false, score: 0 };

        scoreBox.innerHTML = `Score: 0 | High: ${highScore}`;

        if (RUNTIME.snake.interval) {
          clearInterval(RUNTIME.snake.interval);
          RUNTIME.snake.interval = null;
        }
        RUNTIME.snake.interval = setInterval(draw, speed);
      }

      function draw() {
        const { scale, rows, cols, snake, apple } = gameState;

        if (gameState.gameOver) {
          if (RUNTIME.snake.interval) {
            clearInterval(RUNTIME.snake.interval);
            RUNTIME.snake.interval = null;
          }
          alert("انتهت اللعبة يا عسل، حظ اوّفر ... نقاطك: " + gameState.score);
          return;
        }

        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const head = { x: snake[0].x + currentDirection.x, y: snake[0].y + currentDirection.y };

        if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) gameState.gameOver = true;

        for (let i = 0; i < snake.length; i++) {
          if (snake[i].x === head.x && snake[i].y === head.y) gameState.gameOver = true;
        }
        if (gameState.gameOver) return;

        snake.unshift(head);

        if (head.x === apple.x && head.y === apple.y) {
          apple.x = Math.floor(Math.random() * cols);
          apple.y = Math.floor(Math.random() * rows);

          gameState.speed = Math.max(50, gameState.speed - 5);
          gameState.score++;

          if (gameState.score > highScore) {
            highScore = gameState.score;
            localStorage.setItem("snakeHighScore", String(highScore));
          }

          scoreBox.innerHTML = `Score: ${gameState.score} | High: ${highScore}`;

          if (RUNTIME.snake.interval) {
            clearInterval(RUNTIME.snake.interval);
            RUNTIME.snake.interval = null;
          }
          RUNTIME.snake.interval = setInterval(draw, gameState.speed);
        } else {
          snake.pop();
        }

        // Apple
        ctx.fillStyle = "#FF0000";
        ctx.fillRect(apple.x * scale, apple.y * scale, scale, scale);

        // Snake
        ctx.fillStyle = "#00FF00";
        for (let i = 0; i < snake.length; i++) {
          ctx.fillRect(snake[i].x * scale, snake[i].y * scale, scale, scale);
        }
      }

      function createButton(iconClass, dx, dy) {
        const b = document.createElement("button");
        b.innerHTML = `<span class="fa ${iconClass}"></span>`;
        b.style.width = "50px";
        b.style.height = "50px";
        b.style.fontSize = "20px";
        b.style.borderRadius = "8px";
        b.style.background = "#fff";
        b.style.border = "1px solid #555";
        b.style.cursor = "pointer";

        b.addEventListener(
          "mousedown",
          () => {
            if (Math.abs(dx) + Math.abs(dy) === 1) {
              currentDirection.x = dx;
              currentDirection.y = dy;
            }
          },
          { passive: true }
        );

        b.addEventListener(
          "touchstart",
          (e) => {
            e.preventDefault();
            if (Math.abs(dx) + Math.abs(dy) === 1) {
              currentDirection.x = dx;
              currentDirection.y = dy;
            }
          },
          { passive: false }
        );

        return b;
      }

      joystickWrapper.children[1].appendChild(createButton("fa-arrow-up", 0, -1));
      joystickWrapper.children[7].appendChild(createButton("fa-arrow-down", 0, 1));
      joystickWrapper.children[3].appendChild(createButton("fa-arrow-left", -1, 0));
      joystickWrapper.children[5].appendChild(createButton("fa-arrow-right", 1, 0));

      // ✅ Keyboard bind مرة واحدة فقط
      if (!document.documentElement.dataset.snakeKeyBound) {
        document.documentElement.dataset.snakeKeyBound = "true";
        document.addEventListener(
          "keydown",
          function (e) {
            switch (e.key) {
              case "ArrowUp":
                if (currentDirection.y === 0) {
                  currentDirection.x = 0;
                  currentDirection.y = -1;
                }
                break;
              case "ArrowDown":
                if (currentDirection.y === 0) {
                  currentDirection.x = 0;
                  currentDirection.y = 1;
                }
                break;
              case "ArrowLeft":
                if (currentDirection.x === 0) {
                  currentDirection.x = -1;
                  currentDirection.y = 0;
                }
                break;
              case "ArrowRight":
                if (currentDirection.x === 0) {
                  currentDirection.x = 1;
                  currentDirection.y = 0;
                }
                break;
            }
          },
          { passive: true }
        );
      }

      function startSnakeGame() {
        w.style.display = "block";
        currentDirection.x = 1;
        currentDirection.y = 0;
        initGame();
      }

      btn.addEventListener("click", startSnakeGame, false);

      closeBtn.addEventListener("click", function () {
        if (RUNTIME.snake.interval) {
          clearInterval(RUNTIME.snake.interval);
          RUNTIME.snake.interval = null;
        }
        w.style.display = "none";
      });

      restartBtn.addEventListener("click", function () {
        currentDirection.x = 1;
        currentDirection.y = 0;
        initGame();
      });
    }

    addSnakeGameButton();
    observeBody(addSnakeGameButton);
  })();

  /* ==========================
   * 2) Memory Game
   * ========================== */
  (function () {
    function addMemoryGameButton() {
      const container = getOthersContainer();
      if (!container || container.dataset.memoryBtnAdded) return;
      container.dataset.memoryBtnAdded = "true";

      const btn = makeBtnBase();
      btn.style.backgroundColor = "#ff5733";
      btn.style.color = "#fff";
      btn.innerHTML = '<span><span class="fa fa-clone"></span> لعبة الذاكرة</span>';
      container.appendChild(btn);

      const gameWrapper = makeWrapperBase(400);
      gameWrapper.style.background = "#222";
      gameWrapper.style.padding = "20px";
      gameWrapper.style.borderRadius = "10px";

      const topBar = makeTopBar(gameWrapper);
      topBar.style.marginBottom = "10px";

      const closeBtn = makeIconBtn(topBar, "&times;", "24px");
      const restartBtn = makeIconBtn(topBar, "&#8635;", "20px", "إعادة اللعبة");

      const scoreBoard = document.createElement("div");
      scoreBoard.style.color = "#fff";
      scoreBoard.style.fontSize = "16px";
      scoreBoard.style.fontWeight = "bold";
      scoreBoard.innerHTML = "Score: 0";
      topBar.appendChild(scoreBoard);

      const grid = document.createElement("div");
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "repeat(4, 1fr)";
      grid.style.gridGap = "10px";
      gameWrapper.appendChild(grid);
      const footerText = document.createElement("div");
      footerText.style.textAlign = "center";
      footerText.style.color = "rgba(255,255,255,0.6)";
      footerText.style.fontSize = "12px";
      footerText.style.marginTop = "10px";
      footerText.innerHTML = "البرمجة بواسطة: ربيع";
      gameWrapper.appendChild(footerText);
     const symbols = ["🍎", "🍌", "🍇", "🍉", "🍒", "🥝", "🍍", "🍑"];
      let firstCard = null,
        secondCard = null;
      let score = 0;

      // ✅ ستايل مرة واحدة فقط
      if (!document.documentElement.dataset.memoryStyleAdded) {
        document.documentElement.dataset.memoryStyleAdded = "true";
        const style = document.createElement("style");
        style.innerHTML = `
          .memory-card { perspective: 1000px; }
          .card-inner { position: relative; width: 100%; height: 80px; text-align: center; transition: transform 0.5s; transform-style: preserve-3d; cursor: pointer; border-radius: 8px; }
          .card-inner.flipped { transform: rotateY(180deg); }
          .card-front, .card-back { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; display: flex; align-items: center; justify-content: center; font-size: 32px; border-radius: 8px; }
          .card-front { background: #fff; color: #000; }
          .card-back { background: #555; color: #fff; transform: rotateY(180deg); }
        `;
        document.head.appendChild(style);
      }

      function shuffle(array) {
        return array.sort(() => Math.random() - 0.5);
      }

      function addCardListeners() {
        grid.querySelectorAll(".memory-card").forEach((card) => {
          if (card.dataset.listenerAdded) return; // ✅ منع تكرار listeners
          card.dataset.listenerAdded = "true";

          const inner = card.querySelector(".card-inner");

          card.addEventListener("click", () => {
            if (card.dataset.matched === "true" || !inner.classList.contains("flipped") || secondCard) return;

            inner.classList.remove("flipped"); // كشف البطاقة

            if (!firstCard) {
              firstCard = card;
              return;
            }

            if (!secondCard) {
              secondCard = card;

              if (firstCard.dataset.symbol === secondCard.dataset.symbol) {
                firstCard.dataset.matched = "true";
                secondCard.dataset.matched = "true";
                firstCard = null;
                secondCard = null;

                score++;
                scoreBoard.innerHTML = `Score: ${score}`;

                if (score === symbols.length) {
                  setTimeout(() => alert("مبروك! أنهيت اللعبة 🎉"), 200);
                }
              } else {
                setTimeout(() => {
                  firstCard.querySelector(".card-inner").classList.add("flipped");
                  secondCard.querySelector(".card-inner").classList.add("flipped");
                  firstCard = null;
                  secondCard = null;
                }, 800);
              }
            }
          });
        });
      }

      function initGame() {
        grid.innerHTML = "";
        score = 0;
        scoreBoard.innerHTML = `Score: ${score}`;
        firstCard = null;
        secondCard = null;

        const cards = shuffle(symbols.concat(symbols));

        cards.forEach((symbol) => {
          const card = document.createElement("div");
          card.className = "memory-card";

          const inner = document.createElement("div");
          inner.className = "card-inner"; // الوجه الأمامي ظاهر أولاً

          const front = document.createElement("div");
          front.className = "card-front";
          front.textContent = symbol;

          const back = document.createElement("div");
          back.className = "card-back";
          back.textContent = "?";

          inner.appendChild(front);
          inner.appendChild(back);
          card.appendChild(inner);

          card.dataset.symbol = symbol;
          card.dataset.matched = "false";

          grid.appendChild(card);
        });

        // تظهر الفواكه لمدة ثانيتين ثم تنقلب
        setTimeout(() => {
          grid.querySelectorAll(".card-inner").forEach((inner) => {
            inner.classList.add("flipped");
          });
          addCardListeners();
        }, 2000);
      }

      function startMemoryGame() {
        gameWrapper.style.display = "block";
        initGame();
      }

      btn.addEventListener("click", startMemoryGame, false);
      closeBtn.addEventListener("click", function () {
        gameWrapper.style.display = "none";
      });
      restartBtn.addEventListener("click", initGame);
    }

    addMemoryGameButton();
    observeBody(addMemoryGameButton);
  })();

  /* ==========================
   * 3) Games Menu Dropdown (collect existing buttons)
   * ========================== */
  (function () {
    function setupGamesMenu() {
      const container = getOthersContainer();
      if (!container) return;

      if (container.querySelector("[data-games-menu]")) return;

      const buttons = $$(".chat__body__others-pane__container__button", container);

      const youcamLudo = document.getElementById("others--youcam-ludo");
      const youcamUno = document.getElementById("others--youcam-uno");

      const snakeBtn = buttons.find((b) => b.textContent.includes("لعبـة الثعبـان"));
      const memoryBtn = buttons.find((b) => b.textContent.includes("لعبة الذاكرة"));
      const flappyBtn = buttons.find((b) => b.textContent.includes("Flappy Bird"));
    const carDodger = buttons.find(b => b.textContent.includes("Car Dodger"));

      if (!flappyBtn) return; // نفس شرطك: لا تبني القائمة إلا إذا موجود Flappy

      const gamesBtn = makeBtnBase();
      gamesBtn.dataset.gamesMenu = "true";
      gamesBtn.style.cssText =
        "background:#6f42c1;color:#fff;cursor:pointer;text-align:center;" +
        "font-weight:bold;margin-top:4px;display:flex;align-items:center;justify-content:center;";
      gamesBtn.innerHTML = '<span><span class="fa fa-gamepad"></span> الألعاب ▾</span>';

      container.appendChild(gamesBtn);

      const dropdown = document.createElement("div");
      dropdown.style.display = "none";
      dropdown.style.flexDirection = "column";
      dropdown.style.marginTop = "4px";
      container.appendChild(dropdown);

      // نقل الأزرار نفسها (بدون نسخ)
     [youcamLudo, youcamUno, snakeBtn, memoryBtn, flappyBtn, carDodger].forEach(btn => {
        if (!btn) return;
        btn.style.display = "flex";
        btn.style.justifyContent = "center";
        btn.style.padding = "6px 0";
        dropdown.appendChild(btn);
      });

      gamesBtn.onclick = () => {
        dropdown.style.display = dropdown.style.display === "flex" ? "none" : "flex";
      };
    }

    observeBody(setupGamesMenu);
  })();

  /* ==========================
   * 4) Flappy Bird
   * ========================== */
  (function () {
    function addFlappyGameButton() {
      const c = getOthersContainer();
      if (!c || c.dataset.flappyAdded) return;
      c.dataset.flappyAdded = "true";

      const btn = makeBtnBase();
      btn.style.background = "#17a2b8";
      btn.style.color = "#fff";
      btn.innerHTML = '<span><span class="fa fa-twitter"></span> Flappy Bird</span>';
      c.appendChild(btn);

      const w = makeWrapperBase(360);
      Object.assign(w.style, {
        background: "#222",
        padding: "10px",
        borderRadius: "10px"
      });

      const top = document.createElement("div");
      Object.assign(top.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "6px",
        color: "#fff"
      });
      w.appendChild(top);

      const closeBtn = makeIconBtn(top, "&times;", "22px");
      const restartBtn = makeIconBtn(top, "&#8635;", "18px");

      const scoreBox = document.createElement("div");
      scoreBox.style.fontSize = "14px";
      scoreBox.innerHTML = "Score: 0 | High: 0";
      top.appendChild(scoreBox);

      const canvas = document.createElement("canvas");
      canvas.width = 340;
      canvas.height = 420;
      canvas.style.background = "#70c5ce";
      canvas.style.display = "block";
      canvas.style.margin = "0 auto";
      canvas.style.borderRadius = "8px";
      w.appendChild(canvas);
      const foot = document.createElement("div");
      foot.style.textAlign = "center";
      foot.style.color = "rgba(255,255,255,.6)";
      foot.style.fontSize = "11px";
      foot.style.marginTop = "6px";
      foot.innerHTML = "البرمجة بواسطة: ربيع";
      w.appendChild(foot);
     const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;

      let bird, pipes, score, over;
      let high = +localStorage.getItem("flappyHigh") || 0;

      function clearLoop() {
        if (RUNTIME.flappy.interval) {
          clearInterval(RUNTIME.flappy.interval);
          RUNTIME.flappy.interval = null;
        }
      }

      function reset() {
        bird = { x: 60, y: 200, v: 0 };
        pipes = [];
        score = 0;
        over = false;
        scoreBox.innerHTML = `Score: 0 | High: ${high}`;
        clearLoop();
        RUNTIME.flappy.interval = setInterval(draw, 20);
      }

      function flap() {
        bird.v = -6;
      }

      function addPipe() {
        const gap = 120;
        const topH = Math.random() * 180 + 40;
        pipes.push({ x: 340, top: topH, bottom: topH + gap, passed: false });
      }

      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        bird.v += 0.35;
        bird.y += bird.v;

        ctx.fillStyle = "#ff0";
        ctx.beginPath();
        ctx.arc(bird.x, bird.y, 10, 0, Math.PI * 2);
        ctx.fill();

        if (pipes.length === 0 || pipes[pipes.length - 1].x < 180) addPipe();

        pipes.forEach((p) => {
          p.x -= 2;

          ctx.fillStyle = "#228B22";
          ctx.fillRect(p.x, 0, 40, p.top);
          ctx.fillRect(p.x, p.bottom, 40, canvas.height);

          if (!p.passed && p.x + 40 < bird.x) {
            p.passed = true;
            score++;
            if (score > high) {
              high = score;
              localStorage.setItem("flappyHigh", String(high));
            }
            scoreBox.innerHTML = `Score: ${score} | High: ${high}`;
          }

          if (bird.x > p.x && bird.x < p.x + 40 && (bird.y < p.top || bird.y > p.bottom)) end();
        });

        pipes = pipes.filter((p) => p.x > -50);

        if (bird.y > canvas.height || bird.y < 0) end();
      }

      function end() {
        if (over) return;
        over = true;
        clearLoop();
        setTimeout(() => alert("انتهت اللعبة 🐦"), 100);
      }

      btn.onclick = () => {
        w.style.display = "block";
        reset();
      };
      restartBtn.onclick = reset;
      closeBtn.onclick = () => {
        over = true;
        clearLoop();
        w.style.display = "none";
      };

      canvas.onclick = flap;

      // ✅ منع تكرار Space listener
      if (!document.documentElement.dataset.flappyKeyBound) {
        document.documentElement.dataset.flappyKeyBound = "true";
        document.addEventListener(
          "keydown",
          (e) => {
            if (e.code === "Space") flap();
          },
          { passive: true }
        );
      }
    }

    addFlappyGameButton();
    observeBody(addFlappyGameButton);
  })();

  /* ==========================
   * 5) Car Dodger
   * ========================== */
  (function () {
    function addCarDodgerButton() {
      const c = getOthersContainer();
      if (!c || c.dataset.carDodgerAdded) return;
      c.dataset.carDodgerAdded = "true";

      const btn = makeBtnBase();
      btn.style.cssText =
        "background:#dc3545;color:#fff;cursor:pointer;text-align:center;" +
        "font-weight:bold;margin-top:4px;";
      btn.innerHTML = '<span><span class="fa fa-car"></span> Car Dodger</span>';
      c.appendChild(btn);

      const w = makeWrapperBase(360);
      Object.assign(w.style, {
        background: "#222",
        padding: "10px",
        borderRadius: "10px"
      });

      const top = document.createElement("div");
      top.style.cssText =
        "display:flex;justify-content:space-between;align-items:center;" +
        "margin-bottom:6px;color:#fff;";
      w.appendChild(top);

      const closeBtn = makeIconBtn(top, "&times;", "22px");
      const restartBtn = makeIconBtn(top, "&#8635;", "18px");

      const scoreBox = document.createElement("div");
      scoreBox.style.fontSize = "14px";
      top.appendChild(scoreBox);

      const canvas = document.createElement("canvas");
      canvas.width = 340;
      canvas.height = 420;
      canvas.style.cssText = "background:#333;display:block;margin:0 auto;border-radius:8px;";
      w.appendChild(canvas);

      const foot = document.createElement("div");
      foot.style.cssText = "text-align:center;color:rgba(255,255,255,.6);font-size:11px;margin-top:6px;";
      foot.innerHTML = "البرمجة بواسطة: شرشبيل";
      w.appendChild(foot);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;

      let player, obstacles, score, over;
      let high = +localStorage.getItem("carDodgerHigh") || 0;

      let moveDir = 0;
      let playerSpeed = 0;
      const baseSpeed = 1.2;
      let obstacleTimer = 0;

      const playerImg = new Image();
      playerImg.src = "https://up6.cc/2026/01/176969413092251.png";

      const obstacleImgs = [
        "https://up6.cc/2026/01/176969413093742.png",
        "https://up6.cc/2026/01/176969413094883.png",
        "https://up6.cc/2026/01/176969413095474.png"
      ].map((src) => {
        const i = new Image();
        i.src = src;
        return i;
      });

      const carWidth = 42;
      const carHeight = 65;

      function reset() {
        player = { x: canvas.width / 2 - carWidth / 2, y: 350, width: carWidth, height: carHeight };
        obstacles = [];
        score = 0;
        over = false;
        playerSpeed = 0;
        obstacleTimer = 0;
        scoreBox.innerHTML = `Score: 0 | High: ${high}`;
        requestAnimationFrame(draw);
      }

      function addObstacle() {
        const minGap = 50;
        const maxX = canvas.width - carWidth;
        let xPos;

        let attempts = 0;
        do {
          xPos = Math.random() * maxX;
          attempts++;
          var collision = obstacles.some((o) => Math.abs(o.x - xPos) < minGap && o.y < 100);
        } while (collision && attempts < 10);

        obstacles.push({
          x: xPos,
          y: -carHeight - Math.random() * 50,
          width: carWidth,
          height: carHeight,
          img: obstacleImgs[Math.floor(Math.random() * obstacleImgs.length)],
          speed: baseSpeed + score * 0.03
        });
      }

      function draw() {
        if (over) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        playerSpeed += moveDir * 0.4;
        playerSpeed *= 0.8;
        player.x += playerSpeed;
        player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

        ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);

        obstacleTimer++;
        if (obstacleTimer > 55) {
          addObstacle();
          obstacleTimer = 0;
        }

        obstacles.forEach((o) => {
          o.y += o.speed;
          ctx.drawImage(o.img, o.x, o.y, o.width, o.height);

          if (o.y > canvas.height && !o.passed) {
            o.passed = true;
            score++;
            scoreBox.innerHTML = `Score: ${score} | High: ${high}`;
            if (score > high) {
              high = score;
              localStorage.setItem("carDodgerHigh", String(high));
            }
          }

          if (
            player.x < o.x + o.width &&
            player.x + player.width > o.x &&
            player.y < o.y + o.height &&
            player.y + player.height > o.y
          ) end();
        });

        obstacles = obstacles.filter((o) => o.y < canvas.height + carHeight + 20);
        requestAnimationFrame(draw);
      }

      function end() {
        over = true;
        setTimeout(() => alert("انتهت اللعبة 🚗"), 100);
      }

      // ===== Joystick =====
      const joystick = document.createElement("div");
      joystick.style.cssText = "display:flex;justify-content:center;margin-top:8px;";
      w.appendChild(joystick);

      function joyBtn(txt, dir) {
        const b = document.createElement("button");
        b.innerText = txt;
        b.style.cssText = "width:60px;height:45px;margin:0 30px;font-size:20px;border-radius:8px;";

        b.onmousedown = () => (moveDir = dir);
        b.onmouseup = b.onmouseleave = () => (moveDir = 0);

        b.ontouchstart = (e) => {
          e.preventDefault();
          moveDir = dir;
        };
        b.ontouchend = () => (moveDir = 0);

        joystick.appendChild(b);
      }

      joyBtn("⭅", -1);
      joyBtn("⭆", 1);

      // ✅ Bind arrows مرة واحدة فقط على مستوى الصفحة
      if (!document.documentElement.dataset.carKeyBound) {
        document.documentElement.dataset.carKeyBound = "true";
        document.addEventListener(
          "keydown",
          (e) => {
            if (e.key === "ArrowLeft") moveDir = -1;
            if (e.key === "ArrowRight") moveDir = 1;
          },
          { passive: true }
        );

        document.addEventListener(
          "keyup",
          (e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") moveDir = 0;
          },
          { passive: true }
        );
      }

      btn.onclick = () => {
        w.style.display = "block";
        reset();
      };
      restartBtn.onclick = reset;
      closeBtn.onclick = () => {
        over = true;
        w.style.display = "none";
      };
    }

    addCarDodgerButton();
    observeBody(addCarDodgerButton);
  })();

  /* ==========================
   * 6) Close games pane safely (NO polling)
   * ========================== */
  (function () {
    function closeGamesPaneSafely() {
      const closeBtn = $(".btn.chat_pane__header__close");
      if (closeBtn) closeBtn.click();
    }

    function isGameButton(btn) {
      const t = btn && btn.textContent ? btn.textContent : "";
      return t.includes("Car Dodger") || t.includes("Flappy") || t.includes("الثعبـان") || t.includes("الذاكرة");
    }

    function bindDelegatedOnce() {
      const container = getOthersContainer();
      if (!container || container.dataset.safeCloseDelegated) return;
      container.dataset.safeCloseDelegated = "true";

      // مستمع واحد فقط بدل setInterval + ربط متكرر
      container.addEventListener(
        "click",
        (e) => {
          const btn = e.target.closest(".chat__body__others-pane__container__button");
          if (!btn || !isGameButton(btn)) return;

          requestAnimationFrame(() => {
            requestAnimationFrame(() => closeGamesPaneSafely());
          });
        },
        false
      );
    }

    bindDelegatedOnce();
    observeBody(bindDelegatedOnce);
  })();
})();



(function () {
  const hideGuest = () => {
    const guest = document.querySelector('a.nav-link[href="#guest"]');
    if (guest) {
      const li = guest.closest('li');
      if (li) li.remove();
    }
  };

  hideGuest();

  const observer = new MutationObserver(hideGuest);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();


(function () {
  const registerForm = document.getElementById('register-form');
  const memberTab = document.getElementById('member');

  if (!registerForm || !memberTab) return;

  if (document.querySelectorAll('#howRegisterBtn').length) return;

  function createBtn() {
    const btn = document.createElement('button');
    btn.id = 'howRegisterBtn';
    btn.type = 'button';
    btn.textContent = 'كيف أسجل عضوية؟';

    // إزالة أي تأثير خارجي بالـ !important
    btn.style.cssText = `
      display: block !important;
      width: 99% !important;
      margin-left: auto !important;
      margin-right: auto !important;
      margin-bottom: 8px !important;
      padding: 6px 10px !important;
      font-size: 12px !important;
      font-weight: 500 !important;
      color: #5F0000 !important;
      background: transparent !important;
      border: 1px dashed #5F0000 !important;
      border-radius: 18px 0 18px 0 !important;
      cursor: pointer !important;
      box-shadow: none !important;
      transition: none !important;
    `;

    // الحدث عند الضغط
    btn.onclick = function () {
      alert(
        'اختر تبويب "تسجيل عضوية" > أدخل اسم المستخدم وكلمة المرور > ثم اضغط على تسجيل\n' +
        'بعد ذلك اختر تبويب "دخول الأعضاء" > ادخل نفس البيانات > اضغط دخول'
      );
    };

    return btn;
  }

  // زر فوق الفورم في تبويب التسجيل
  const btnRegister = createBtn();
  registerForm.insertBefore(btnRegister, registerForm.firstChild);

  // زر فوق الفورم في تبويب دخول الأعضاء
  const btnMember = createBtn();
  const loginForm = memberTab.querySelector('#login-form');
  if (loginForm) {
    memberTab.insertBefore(btnMember, loginForm);
  }
})();
(function () {
  'use strict';

  const CLOSE_ID = 'chat_pane_youtube_items--close';
  const POSTS_SELECTOR = '.chat_pane__container__posts';
  const SEND_ID = 'ytSend';

  function closeYoutubePane() {
    const closeBtn = document.getElementById(CLOSE_ID);
    if (closeBtn) closeBtn.click();
  }

  function bindActions() {
    /* زر الإرسال داخل نافذة الفيديو */
    const sendBtn = document.getElementById(SEND_ID);
    if (sendBtn && !sendBtn.dataset.boundClose) {
      sendBtn.dataset.boundClose = '1';
      sendBtn.addEventListener('click', closeYoutubePane);
    }

    /* الضغط على منطقة المنشورات */
    const posts = document.querySelector(POSTS_SELECTOR);
    if (posts && !posts.dataset.boundClose) {
      posts.dataset.boundClose = '1';
      posts.addEventListener('click', closeYoutubePane);
    }
  }

  // مراقبة العناصر الديناميكية
  const observer = new MutationObserver(bindActions);
  observer.observe(document.body, { childList: true, subtree: true });

  // محاولة أولية
  bindActions();

})();

(function () {
  'use strict';

  const H = 45;
  const HEADER_ID = 'top-white-chat-header';
  const STYLE_ID  = 'top-white-chat-header-style';

  const HEADER_WIDTH_VW = 103;

  const MESSAGES_BOTTOM_SHRINK = 50;

  const SEL_LEAVE = 'button.chat__body__message-input__leave_room';
  const SEL_NOTIF = '#others--notifications';
  const SEL_OTHERS_STAR = '#chat__footer__menu__others';

  const ROOM_ACTIVE_SEL = '.chat_pane__room_item.active .chat_pane__room_item__name';
  const ROOM_BADGE_ID = 'hdr-room-badge';

  const SEL_STORY_BOARD = '#story-board';
  const STORY_BTN_ID = 'hdr-story-btn';
  const STORY_MODAL_ID = 'hdr-story-modal';
  const STORY_PLACEHOLDER_ID = 'hdr-story-board-placeholder';

  const CHAT_BOX_ID = 'chat_box';

  // ✅ اسم افتراضي عند أول دخول
  const DEFAULT_ROOM_NAME = 'الغرفة العامة';

  let inited = false;

  // ✅ نشتغل فقط داخل الشات
  function isChatReady() {
    return !!document.getElementById('chat');
  }

  function injectStyle() {
    // لا تحقن CSS إلا داخل الشات
    if (!isChatReady()) return;
    if (document.getElementById(STYLE_ID)) return;

    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      :root{
        --chat-header-h:${H}px;
        --chat-body-bg:#384159;
        --chat-accent:#384159;
        --messages-bottom-shrink:${MESSAGES_BOTTOM_SHRINK}px;
      }

      #${HEADER_ID}{
        position: fixed !important;
        top: 0 !important;
        left: 50% !important;
        width: ${HEADER_WIDTH_VW}vw !important;
        transform: translateX(-50%) !important;
        height: var(--chat-header-h) !important;
        background: #fff !important;
        z-index: 2147483000 !important;
        box-shadow: 0 1px 0 rgba(0,0,0,.08) !important;

        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;

        padding: 0 10px !important;
        box-sizing: border-box !important;

        direction: rtl !important;
        pointer-events: auto !important;
      }

      #${HEADER_ID} .hdr-left,
      #${HEADER_ID} .hdr-right{
        display:flex !important;
        align-items:center !important;
        gap: 10px !important;
        min-width: 0 !important;
      }

      #${HEADER_ID} .hdr-title{
        flex: 1 1 auto !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        min-width: 0 !important;
        pointer-events: none !important;
      }

      #chat__body{
        padding-top: var(--chat-header-h) !important;
        box-sizing: border-box !important;
      }

      #${CHAT_BOX_ID}{
        top: var(--chat-header-h) !important;
        height: calc(100% - var(--chat-header-h)) !important;
        box-sizing: border-box !important;
      }

      #chat__body__messages_container{
        box-sizing: border-box !important;
        padding-bottom: calc(var(--messages-bottom-shrink) + env(safe-area-inset-bottom, 0px)) !important;
        max-height: calc(100% - var(--messages-bottom-shrink)) !important;
        overflow: auto !important;
      }

      #chat__body__users-pane,
      #chat__body__conversations_pane,
      #chat__body__rooms_pane,
      #chat__body__wall_pane,
      #chat__body__wall_creator_pane,
      #chat__body__others-pane,
      #chat__body__ignored-users-pane,
      #chat__body__profile-views-pane,
      #chat__body__notifications-pane,
      #chat__body__settings_pane,
      #audio-gallery-pane,
      #chat__body__live-pane{
        top: var(--chat-header-h) !important;
        height: calc(100% - var(--chat-header-h)) !important;
        box-sizing: border-box !important;
      }

      .modal-dialog{
        margin: 60px auto 0 auto !important;
      }
      .modal-dialog.modal-fullscreen{
        margin-top: 0 !important;
      }

      #${HEADER_ID} .hdr-btn{
        width: 36px !important;
        height: 36px !important;
        min-width: 36px !important;
        min-height: 36px !important;

        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;

        background: rgba(255,255,255,.92) !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        border-radius: 999px !important;

        box-shadow: 0 2px 8px rgba(0,0,0,.06) !important;

        cursor: pointer !important;
        user-select: none !important;

        transition: transform .12s ease, box-shadow .12s ease, filter .12s ease !important;

        padding: 0 !important;
        margin: 0 !important;
        line-height: 0 !important;
        text-align: center !important;
      }

      #${HEADER_ID} .hdr-btn::before,
      #${HEADER_ID} .hdr-btn::after{
        content: none !important;
        display: none !important;
      }

      #${HEADER_ID} .hdr-btn:hover{
        transform: translateY(-1px) !important;
        box-shadow: 0 6px 14px rgba(0,0,0,.10) !important;
        filter: brightness(1.02) !important;
      }
      #${HEADER_ID} .hdr-btn:active{
        transform: translateY(0) scale(.98) !important;
      }

      #${HEADER_ID} .hdr-btn .fa{
        color: var(--chat-accent) !important;
        font-size: 18px !important;
        line-height: 1 !important;
        margin: 0 !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      #${HEADER_ID} button.hdr-btn{
        appearance: none !important;
        -webkit-appearance: none !important;
        outline: none !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        background: rgba(255,255,255,.92) !important;
      }

      #${HEADER_ID} li.hdr-btn{
        list-style: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      #${HEADER_ID} #others--notifications{
        width: 36px !important;
        height: 36px !important;
        min-width: 36px !important;
        min-height: 36px !important;

        padding: 0 !important;
        margin: 0 !important;

        background: rgba(255,255,255,.92) !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        border-radius: 999px !important;
        box-shadow: 0 2px 8px rgba(0,0,0,.06) !important;

        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;

        line-height: 0 !important;
        text-indent: 0 !important;
        font-size: 0 !important;
      }
      #${HEADER_ID} #others--notifications span{ font-size: 0 !important; }
      #${HEADER_ID} #others--notifications .fa{ font-size: 18px !important; }

      #${HEADER_ID} #${ROOM_BADGE_ID}{
        height: 36px !important;
        max-width: 260px !important;
        padding: 0 12px !important;

        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;

        background: rgba(255,255,255,.92) !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        border-radius: 999px !important;
        box-shadow: 0 2px 8px rgba(0,0,0,.06) !important;

        font-family: 'El Messiri', Tahoma, Arial, sans-serif !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        color: var(--chat-accent) !important;

        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;

        pointer-events: none !important;
      }

      /* =============================
         STORY MODAL (hdr-story-modal)
      ============================= */
      #${STORY_MODAL_ID}{
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483500 !important;
        display: none !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 18px !important;
        box-sizing: border-box !important;
      }
      #${STORY_MODAL_ID}.open{ display:flex !important; }
      #${STORY_MODAL_ID} .sb-backdrop{
        position:absolute !important;
        inset:0 !important;
        background: rgba(0,0,0,.45) !important;
      }
      #${STORY_MODAL_ID} .sb-card{
        position: relative !important;
        width: min(720px, 96vw) !important;
        max-height: min(620px, 86vh) !important;
        background: #fff !important;
        border-radius: 16px !important;
        box-shadow: 0 18px 60px rgba(0,0,0,.35) !important;
        overflow: hidden !important;
        display:flex !important;
        flex-direction: column !important;
      }
      #${STORY_MODAL_ID} .sb-head{
        height: 54px !important;
        display:flex !important;
        align-items:center !important;
        justify-content: space-between !important;
        padding: 0 12px !important;
        border-bottom: 1px solid rgba(0,0,0,.08) !important;
        box-sizing: border-box !important;
        direction: rtl !important;
      }
      #${STORY_MODAL_ID} .sb-title{
        font-family: 'El Messiri', Tahoma, Arial, sans-serif !important;
        font-size: 14px !important;
        font-weight: 700 !important;
        color: #222 !important;
        display:flex !important;
        align-items:center !important;
        gap: 8px !important;
      }
      #${STORY_MODAL_ID} .sb-close{
        width: 36px !important;
        height: 36px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        background: rgba(255,255,255,.92) !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        cursor:pointer !important;
      }
      #${STORY_MODAL_ID} .sb-close .fa{
        color: var(--chat-accent) !important;
        font-size: 16px !important;
      }
      #${STORY_MODAL_ID} .sb-body{
        padding: 12px !important;
        box-sizing: border-box !important;
        overflow: auto !important;
      }
      #${STORY_MODAL_ID} .sb-body #story-board{
        margin: 0 !important;
      }

      /* الأعلى */
      #story-modal{
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483600 !important;
      }
    `;
    document.head.appendChild(s);
  }

  // ✅ نفس فكرة زر "..." : إذا انحذف الهيدر نعيد إنشاؤه
  function ensureHeader() {
    if (!isChatReady()) return null;

    let h = document.getElementById(HEADER_ID);

    if (h && !h.isConnected) {
      try { h.remove(); } catch (_) {}
      h = null;
    }

    if (h) return h;

    h = document.createElement('div');
    h.id = HEADER_ID;
    h.innerHTML = `
      <div class="hdr-right"></div>
      <div class="hdr-title"></div>
      <div class="hdr-left"></div>
    `;
    document.body.appendChild(h);
    return h;
  }

  function guardHeaderWhite() {
    const h = document.getElementById(HEADER_ID);
    if (!h) return;
    h.style.setProperty('background', '#ffffff', 'important');
    h.style.setProperty('background-color', '#ffffff', 'important');
    h.style.setProperty('display', 'flex', 'important');
    h.style.setProperty('visibility', 'visible', 'important');
    h.style.setProperty('opacity', '1', 'important');
    h.style.setProperty('z-index', '2147483000', 'important');
  }

  function setAccentFromChatBody() {
    const body = document.getElementById('chat__body');
    if (!body) return;
    const cs = getComputedStyle(body);
    const bg = cs.backgroundColor || '#384159';
    document.documentElement.style.setProperty('--chat-accent', bg);
    document.documentElement.style.setProperty('--chat-body-bg', bg);
  }

  function markAsHeaderBtn(el) {
    if (!el) return;
    el.classList.add('hdr-btn');
  }

  function ensureFaChild(el, faClassKeep) {
    if (!el) return null;

    let fa = el.querySelector(':scope > .fa');
    if (!fa) {
      const inner = el.querySelector('.fa');
      if (inner) {
        fa = inner;
        try { el.appendChild(fa); } catch (_) {}
      } else {
        fa = document.createElement('span');
        fa.className = 'fa ' + (faClassKeep || '');
        el.appendChild(fa);
      }
    }

    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.padding = '0';
    el.style.lineHeight = '0';

    fa.style.display = 'inline-flex';
    fa.style.alignItems = 'center';
    fa.style.justifyContent = 'center';
    fa.style.margin = '0';
    fa.style.padding = '0';
    fa.style.lineHeight = '1';

    return fa;
  }

  function ensureRoomBadge(leftContainer) {
    if (!leftContainer) return null;

    let badge = document.getElementById(ROOM_BADGE_ID);
    if (badge && !badge.isConnected) {
      try { badge.remove(); } catch (_) {}
      badge = null;
    }
    if (badge) return badge;

    badge = document.createElement('div');
    badge.id = ROOM_BADGE_ID;
    badge.textContent = DEFAULT_ROOM_NAME;

    return badge;
  }

  function readRoomName() {
    const nameEl = document.querySelector(ROOM_ACTIVE_SEL);
    const name = nameEl ? (nameEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
    return name;
  }

  function updateRoomName() {
    const header = document.getElementById(HEADER_ID);
    if (!header) return;
    const left = header.querySelector('.hdr-left');
    if (!left) return;

    const badge = ensureRoomBadge(left);
    const name = readRoomName();

    badge.textContent = name || (badge.textContent && badge.textContent.trim() ? badge.textContent : DEFAULT_ROOM_NAME);
  }

  function removeStoryDot(board) {
    if (!board) return;
    board.querySelectorAll('span.dot').forEach(d => d.remove());
  }

  function ensureStoryModal() {
    if (!isChatReady()) return null;

    let m = document.getElementById(STORY_MODAL_ID);
    if (m && !m.isConnected) {
      try { m.remove(); } catch (_) {}
      m = null;
    }
    if (m) return m;

    m = document.createElement('div');
    m.id = STORY_MODAL_ID;
    m.innerHTML = `
      <div class="sb-backdrop"></div>
      <div class="sb-card" role="dialog" aria-modal="true">
        <div class="sb-head">
          <div class="sb-title">الستوري</div>
          <div class="sb-close" title="إغلاق"><span class="fa fa-times"></span></div>
        </div>
        <div class="sb-body"></div>
      </div>
    `;
    document.body.appendChild(m);

    const backdrop = m.querySelector('.sb-backdrop');
    const closeBtn = m.querySelector('.sb-close');

    if (backdrop) backdrop.addEventListener('click', closeStoryModal, { passive: true });
    if (closeBtn) closeBtn.addEventListener('click', closeStoryModal, { passive: true });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeStoryModal();
    });

    return m;
  }

  function openStoryModal() {
    const board = document.querySelector(SEL_STORY_BOARD);
    if (!board) return;

    removeStoryDot(board);

    const modal = ensureStoryModal();
    const body = modal ? modal.querySelector('.sb-body') : null;
    if (!body) return;

    ensureStoryMovedToModal();
    modal.classList.add('open');
  }

  function closeStoryModal() {
    const modal = document.getElementById(STORY_MODAL_ID);
    if (!modal) return;
    modal.classList.remove('open');
  }

  function ensureStoryMovedToModal() {
    const board = document.querySelector(SEL_STORY_BOARD);
    const modal = ensureStoryModal();
    const body  = modal ? modal.querySelector('.sb-body') : null;
    if (!board || !body) return;

    if (!document.getElementById(STORY_PLACEHOLDER_ID)) {
      const ph = document.createElement('div');
      ph.id = STORY_PLACEHOLDER_ID;
      ph.style.display = 'none';
      try { board.parentNode.insertBefore(ph, board); } catch (_) {}
    }

    if (board.parentElement === body) return;

    removeStoryDot(board);
    try { body.appendChild(board); } catch (_) {}
  }

  function ensureStoryButton(rightContainer) {
    if (!rightContainer) return null;

    let btn = document.getElementById(STORY_BTN_ID);
    if (btn && !btn.isConnected) {
      try { btn.remove(); } catch (_) {}
      btn = null;
    }
    if (btn) return btn;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = STORY_BTN_ID;
    btn.className = 'hdr-btn';
    btn.setAttribute('title', 'الستوري');
    btn.innerHTML = `<span class="fa fa-camera"></span>`;

    btn.addEventListener('click', () => {
      const m = document.getElementById(STORY_MODAL_ID);
      if (m && m.classList.contains('open')) closeStoryModal();
      else openStoryModal();
    });

    return btn;
  }

  function hardRemoveNotifText(notif) {
    if (!notif) return;

    try {
      const walker = document.createTreeWalker(notif, NodeFilter.SHOW_TEXT, null);
      const texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      texts.forEach(t => (t.nodeValue = ''));
    } catch (_) {}

    notif.querySelectorAll('span').forEach(sp => {
      if (sp.classList && sp.classList.contains('fa')) return;
      if (sp.querySelector && sp.querySelector('.fa')) return;
      sp.textContent = '';
    });

    ensureFaChild(notif, 'fa-bell');
  }

  function moveButtonsAndRoom() {
    const header = document.getElementById(HEADER_ID);
    if (!header) return;

    const right = header.querySelector('.hdr-right');
    const left  = header.querySelector('.hdr-left');
    if (!right || !left) return;

    const star = document.querySelector(SEL_OTHERS_STAR);
    if (star) {
      if (!star.dataset.movedToHeader || star.parentElement !== right) {
        star.dataset.movedToHeader = '1';
        markAsHeaderBtn(star);
        right.appendChild(star);
      }
      ensureFaChild(star, 'fa-star');
    }

    const notif = document.querySelector(SEL_NOTIF);
    if (notif) {
      if (!notif.dataset.movedToHeader || notif.parentElement !== right) {
        notif.dataset.movedToHeader = '1';
        markAsHeaderBtn(notif);
        right.appendChild(notif);
      }
      hardRemoveNotifText(notif);
    }

    const storyBtn = ensureStoryButton(right);
    if (storyBtn && (!storyBtn.dataset.movedToHeader || storyBtn.parentElement !== right)) {
      storyBtn.dataset.movedToHeader = '1';
      right.appendChild(storyBtn);
      ensureFaChild(storyBtn, 'fa-camera');
    }

    const leaveBtn = document.querySelector(SEL_LEAVE);
    if (leaveBtn) {
      if (!leaveBtn.dataset.movedToHeader || leaveBtn.parentElement !== left) {
        leaveBtn.dataset.movedToHeader = '1';
        markAsHeaderBtn(leaveBtn);
        left.appendChild(leaveBtn);
      }
      ensureFaChild(leaveBtn, 'fa-sign-out');
    }

    const badge = ensureRoomBadge(left);
    if (badge && badge.parentElement !== left) left.appendChild(badge);

    if (leaveBtn && badge) {
      try { left.insertBefore(badge, leaveBtn); } catch (_) {}
    }
  }

  // ✅ (نفس زر "…") تحديث throttled
  let rafPending = false;
  function scheduleUpdate() {
    if (rafPending) return;
    rafPending = true;

    requestAnimationFrame(() => {
      rafPending = false;

      // لا تعمل أي شيء قبل وجود الشات
      if (!isChatReady()) return;

      try {
        // ✅ الأهم: كل تحديث يضمن الهيدر/الستايل موجودين
        injectStyle();
        ensureHeader();
        ensureStoryModal();

        guardHeaderWhite();
        setAccentFromChatBody();
        moveButtonsAndRoom();
        updateRoomName();
        ensureStoryMovedToModal();
      } catch (_) {}
    });
  }

  function initWhenChatReady() {
    if (!isChatReady()) return;

    if (!inited) {
      inited = true;

      injectStyle();
      ensureHeader();
      ensureStoryModal();

      scheduleUpdate();

      // مراقبة تغييرات DOM داخل الشات (SPA)
      const mo = new MutationObserver(() => scheduleUpdate());
      mo.observe(document.body, { childList: true, subtree: true });

      setTimeout(scheduleUpdate, 200);
      setTimeout(scheduleUpdate, 600);
      setTimeout(scheduleUpdate, 1200);
    } else {
      scheduleUpdate();
    }
  }

  // ✅ مراقبة عامة مستمرة (مثل زر "…") — ما تنقطع
  let lock = false;
  const globalObs = new MutationObserver(() => {
    if (lock) return;
    lock = true;
    requestAnimationFrame(() => {
      lock = false;
      initWhenChatReady();
    });
  });

  function start() {
    try {
      globalObs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}

    initWhenChatReady();
    window.addEventListener('load', initWhenChatReady, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();


(function () {
  function fixChatPaneHeight() {
    document
      .querySelectorAll('.chat_pane__container.border')
      .forEach(el => {
        el.style.height = 'calc(111% - 83.4px - 2.4rem)';
      });
  }

  // تشغيل مباشر
  fixChatPaneHeight();

  // مراقبة أي تغيير مستقبلي (لو النظام يعيد كتابة الستايل)
  const mo = new MutationObserver(fixChatPaneHeight);
  mo.observe(document.body, { childList: true, subtree: true });
})();

(function () {
  'use strict';

  /* =============================
     الأساسيات
  ============================= */
  const PANE_ID = 'chat__body__settings_pane';
  const CONTAINER_SEL = '#chat__body__settings_pane .chat__body__settings_pane__container';

  const IDS = {
    private: 'chat__body__settings_pane__container__button--toggle_private',
    notifications: 'chat__body__settings_pane__container__button--toggle_notifications',
    changePass: 'chat__body__settings_pane__container__button-change_password',
    manageRoom: 'chat__body__settings_pane__container__button--manage_room'
  };

  const WRAP_ID   = 'np_privacy_wrap';
  const TOGGLE_ID = 'np_privacy_toggle';
  const BODY_ID   = 'np_privacy_body';
  const STYLE_ID  = 'np_privacy_style';

  // زر جديد
  const MUTE_BTN_ID = 'np_mute_notifications_btn';
  const MUTE_KEY = 'mute_popup_notifications';

  // Proxy IDs
  const PROXY_NOTI_ID = 'np_proxy_toggle_notifications';
  const PROXY_PRIV_ID = 'np_proxy_toggle_private';
  const PROXY_PASS_ID = 'np_proxy_change_pass';

  // محاذاة/مساحات
  const PAD_L = 48;
  const PAD_R = 78;
  const SW_RIGHT = 12;

  /* =============================
     حالة الكتم
  ============================= */
  function isMuteOn() {
    return localStorage.getItem(MUTE_KEY) === '1';
  }
  function setMute(on) {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
    applyGlobalMuteState();
  }

  /* =============================
     CSS
  ============================= */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${WRAP_ID}{ margin-top:.15rem; }

      /* زر الإشعارات والخصوصية */
      #${TOGGLE_ID}{
        position:relative;
        display:block;
        padding:.55rem .65rem;
        cursor:pointer;
        user-select:none;
        line-height:1.2;
      }

      /* السهم (مكانه وحجمه يضبطه JS) */
      #${TOGGLE_ID} .np_caret{
        position:absolute;
        top:50%;
        transform: translateY(-50%);
        opacity:.9;
        pointer-events:none;
        transition: transform .18s ease;
      }

      #${WRAP_ID}.open #${TOGGLE_ID} .np_caret{
        transform: translateY(-50%) rotate(180deg);
      }

      #${TOGGLE_ID} .np_title{
        display:block;
        width:100%;
        text-align:center;
        font-weight:800;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        padding-left:${PAD_L}px;
        padding-right:${PAD_L}px;
      }

      /* جسم القائمة */
      #${BODY_ID}{
        overflow:hidden;
        max-height:0;
        opacity:0;
        transform: translateY(-2px);
        transition:max-height .22s ease, opacity .18s ease, transform .18s ease;
        margin-top:.2rem;
        padding:0 .15rem;
      }
      #${WRAP_ID}.open #${BODY_ID}{
        max-height:560px;
        opacity:1;
        transform: translateY(0);
      }

      /* توحيد شكل الأزرار الداخلية */
      #${BODY_ID} .np_unified{
        background:#ffffff !important;
        color:#111111 !important;
        border-color:rgba(0,0,0,.18) !important;
        position:relative !important;
        overflow:hidden !important;
      }

      /* واجهتنا فوق الأزرار */
      #${BODY_ID} .np_ui{
        position:absolute;
        inset:0;
        pointer-events:none;
      }
      #${BODY_ID} .np_icon{
        position:absolute;
        left:12px;
        top:50%;
        transform:translateY(-50%);
        opacity:.9;
        font-size:16px;
      }
      #${BODY_ID} .np_center_text{
        position:absolute;
        left:0; right:0;
        top:50%;
        transform:translateY(-50%);
        text-align:center;
        font-weight:800;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        padding-left:${PAD_L}px;
        padding-right:${PAD_R}px;
        pointer-events:none;
      }

      /* iOS Switch */
      #${BODY_ID} .np_sw{
        position:absolute;
        right:${SW_RIGHT}px;
        top:50%;
        transform:translateY(-50%);
        width:46px;
        height:26px;
        border-radius:999px;
        background: rgba(0,0,0,.16);
        box-shadow: inset 0 0 0 1px rgba(0,0,0,.12);
        pointer-events:auto;
        cursor:pointer;
        transition: background .18s ease;
      }
      #${BODY_ID} .np_sw::after{
        content:"";
        position:absolute;
        top:3px;
        right:3px;
        width:20px;
        height:20px;
        border-radius:999px;
        background:#fff;
        box-shadow:0 4px 12px rgba(0,0,0,.25);
        transition: transform .18s ease;
      }
      #${BODY_ID} .np_sw.on{ background:#34C759; }
      #${BODY_ID} .np_sw.on::after{ transform:translateX(-20px); }

      /* كلمة المرور: بدون سويتش */
      #${BODY_ID} .np_pass .np_center_text{
        padding-right:${PAD_L}px;
      }
      #${BODY_ID} .np_pass .np_center_text{
        padding-right:${PAD_L}px;
      }

      /* نخفي الأزرار الأصلية لكن نبقيها بمكانها عشان Event Delegation يشتغل */
      .np_hidden_original{
        display:none !important;
      }
    `;
    document.head.appendChild(style);
  }

  /* =============================
     إغلاق القائمة الداخلية عند إغلاق الإعدادات الأساسية ✅
  ============================= */
  function closePrivacyMenu() {
    const wrap = document.getElementById(WRAP_ID);
    if (wrap) wrap.classList.remove('open');
  }

  function isPaneVisible() {
    const pane = document.getElementById(PANE_ID);
    if (!pane) return false;
    const cs = window.getComputedStyle(pane);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) return false;
    return !!(pane.offsetWidth || pane.offsetHeight || pane.getClientRects().length);
  }

  function watchPaneClose() {
    if (watchPaneClose._started) return;
    watchPaneClose._started = true;

    let lastVisible = isPaneVisible();

    const obs = new MutationObserver(() => {
      const nowVisible = isPaneVisible();
      if (lastVisible && !nowVisible) closePrivacyMenu();
      lastVisible = nowVisible;
    });

    const pane = document.getElementById(PANE_ID);
    if (pane) {
      obs.observe(pane, { attributes:true, attributeFilter:['style','class'] });
    }

    const obs2 = new MutationObserver(() => {
      const nowVisible = isPaneVisible();
      if (lastVisible && !nowVisible) closePrivacyMenu();
      lastVisible = nowVisible;
    });
    obs2.observe(document.body, { childList:true, subtree:true });
  }

  /* =============================
     محاذاة سهم زر "الإشعارات والخصوصية"
  ============================= */
  function alignCaretToMenuIcon() {
    const toggle = document.getElementById(TOGGLE_ID);
    if (!toggle) return;

    const caret = toggle.querySelector('.np_caret');
    if (!caret) return;

    const refBtn = document.getElementById(IDS.manageRoom);
    if (!refBtn) return;

    const refIcon = refBtn.querySelector('.fa');
    if (!refIcon) return;

    const refBtnRect = refBtn.getBoundingClientRect();
    const refIconRect = refIcon.getBoundingClientRect();

    let leftInside = refIconRect.left - refBtnRect.left;

    const cs = window.getComputedStyle(refIcon);
    const fs = cs.fontSize || '16px';
    const lh = cs.lineHeight || '1';
    const iconPx = parseFloat(fs) || 16;

    const toggleWidth = toggle.clientWidth || 0;
    const minLeft = 6;
    const maxLeft = Math.max(minLeft, toggleWidth - iconPx - 6);
    leftInside = Math.max(minLeft, Math.min(Math.round(leftInside), maxLeft));

    caret.style.left = leftInside + 'px';
    caret.style.fontSize = fs;
    caret.style.lineHeight = lh;
    caret.style.width = iconPx + 'px';
    caret.style.textAlign = 'center';
  }

  /* =============================
     أدوات: dispatch click موثوق
  ============================= */
  function safeClick(el){
    if (!el) return;
    try {
      el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
    } catch(_) {
      try { el.click(); } catch(__) {}
    }
  }

  /* =============================
     Proxy Toggle (بدل نقل الزر الأصلي)
  ============================= */
  function ensureProxyToggle(body, proxyId, origBtn, title, iconClass, enableSel, disableSel, activeClass) {
    if (!body || !origBtn) return;

    if (!origBtn.classList.contains('np_hidden_original')) {
      origBtn.classList.add('np_hidden_original');
    }

    let proxy = document.getElementById(proxyId);
    if (!proxy) {
      proxy = document.createElement('div');
      proxy.id = proxyId;
      proxy.className = 'chat__body__settings_pane__container__button form-control np_unified';
      proxy.style.position = 'relative';
      proxy.style.overflow = 'hidden';

      proxy.innerHTML = `
        <div class="np_ui">
          <span class="fa ${iconClass} np_icon" aria-hidden="true"></span>
          <span class="np_center_text">${title}</span>
          <div class="np_sw" role="switch" aria-checked="false"></div>
        </div>
      `;

      body.appendChild(proxy);
    }

    const en = origBtn.querySelector(enableSel);
    const dis = origBtn.querySelector(disableSel);
    if (!en || !dis) return;

    const sw = proxy.querySelector('.np_sw');
    if (!sw) return;

    function isOn() { 
      // السويتش ON = الخاص / التنبيهات شغّالة
      return !dis.classList.contains(activeClass); 
    }

    function sync() {
      const on = isOn();
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    function toggle() {
      const wasOn = isOn();
      safeClick(wasOn ? en : dis);
      setTimeout(sync, 60);
      setTimeout(sync, 180);
    }

    if (!proxy.dataset.np_bound) {
      proxy.dataset.np_bound = '1';

      sw.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        toggle();
      });

      proxy.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.target === sw || sw.contains(e.target)) return;
        toggle();
      }, { passive:false });

      new MutationObserver(sync).observe(en,  { attributes:true, attributeFilter:['class'] });
      new MutationObserver(sync).observe(dis, { attributes:true, attributeFilter:['class'] });
    }

    sync();
  }

  /* =============================
     Proxy Password (بدل نقل زر كلمة المرور)
  ============================= */
  function ensureProxyPassword(body, origBtn){
    if (!body || !origBtn) return;

    if (!origBtn.classList.contains('np_hidden_original')) {
      origBtn.classList.add('np_hidden_original');
    }

    let proxy = document.getElementById(PROXY_PASS_ID);
    if (!proxy) {
      proxy = document.createElement('div');
      proxy.id = PROXY_PASS_ID;
      proxy.className = 'chat__body__settings_pane__container__button form-control np_unified np_pass';
      proxy.style.position = 'relative';
      proxy.style.overflow = 'hidden';

      proxy.innerHTML = `
        <div class="np_ui">
          <span class="fa fa-key np_icon" aria-hidden="true"></span>
          <span class="np_center_text">تغيير كلمة المرور</span>
        </div>
      `;
      body.appendChild(proxy);

      proxy.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        safeClick(origBtn);
      }, { passive:false });
    }
  }

  /* =============================
     زر: كتم صوت الإشعارات (سويتش)
  ============================= */
  function ensureMuteButton(body) {
    if (!body) return;

    let btn = document.getElementById(MUTE_BTN_ID);
    if (!btn) {
      btn = document.createElement('div');
      btn.id = MUTE_BTN_ID;
      btn.className = 'chat__body__settings_pane__container__button form-control np_unified';
      btn.style.position = 'relative';
      btn.style.overflow = 'hidden';

      btn.innerHTML = `
        <div class="np_ui">
          <span class="fa fa-volume-off np_icon" aria-hidden="true"></span>
          <span class="np_center_text">كتم صوت الإشعارات</span>
          <div class="np_sw" role="switch" aria-checked="false"></div>
        </div>
      `;

      body.appendChild(btn);

      const sw = btn.querySelector('.np_sw');

      function sync() {
        const on = isMuteOn();
        sw.classList.toggle('on', on);
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
        applyGlobalMuteState();
      }

      function toggle() {
        setMute(!isMuteOn());
        sync();
      }

      sw.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.target === sw || sw.contains(e.target)) return;
        toggle();
      }, { passive: false });

      sync();
    } else {
      const sw = btn.querySelector('.np_sw');
      if (sw) {
        const on = isMuteOn();
        sw.classList.toggle('on', on);
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    }
  }

  /* =============================
     كتم الصوت فعليًا (Media + WebAudio)
  ============================= */
  const mediaOriginal = new WeakMap();
  function muteAllMediaElements() {
    const els = document.querySelectorAll('audio,video');
    els.forEach(el => {
      try {
        if (!mediaOriginal.has(el)) {
          mediaOriginal.set(el, { muted: el.muted, volume: el.volume });
        }
        el.muted = true;
        el.volume = 0;
      } catch (_) {}
    });
  }
  function restoreAllMediaElements() {
    const els = document.querySelectorAll('audio,video');
    els.forEach(el => {
      try {
        const prev = mediaOriginal.get(el);
        if (prev) {
          el.muted = prev.muted;
          el.volume = prev.volume;
        }
      } catch (_) {}
    });
  }

  let masterGains = [];
  function setMasterGain(value) {
    masterGains.forEach(g => {
      try { g.gain.gain.value = value; } catch (_) {}
    });
  }

  function patchWebAudioOnce() {
    if (patchWebAudioOnce._patched) return;
    patchWebAudioOnce._patched = true;

    function wrapContext(CtorName) {
      const Original = window[CtorName];
      if (typeof Original !== 'function') return;

      function Wrapped() {
        const ctx = new Original(...arguments);

        try {
          const master = ctx.createGain();
          master.gain.value = isMuteOn() ? 0 : 1;
          master.connect(ctx.destination);

          const originalDestination = ctx.destination;
          Object.defineProperty(ctx, '__npMaster', { value: master });

          const nodeProto = window.AudioNode && window.AudioNode.prototype;
          if (nodeProto && !nodeProto.__npConnectPatched) {
            const origConnect = nodeProto.connect;
            nodeProto.connect = function () {
              try {
                const target = arguments[0];
                if (target === originalDestination && ctx.__npMaster) {
                  arguments[0] = ctx.__npMaster;
                }
              } catch (_) {}
              return origConnect.apply(this, arguments);
            };
            nodeProto.__npConnectPatched = true;
          }

          masterGains.push({ ctx, gain: master });
        } catch (_) {}

        return ctx;
      }

      Wrapped.prototype = Original.prototype;
      window[CtorName] = Wrapped;
    }

    wrapContext('AudioContext');
    wrapContext('webkitAudioContext');
  }

  function patchMediaPlayOnce() {
    if (patchMediaPlayOnce._patched) return;
    patchMediaPlayOnce._patched = true;

    const proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (proto && typeof proto.play === 'function') {
      const originalPlay = proto.play;
      proto.play = function () {
        try {
          if (isMuteOn()) {
            if (!mediaOriginal.has(this)) {
              mediaOriginal.set(this, { muted: this.muted, volume: this.volume });
            }
            this.muted = true;
            this.volume = 0;
          }
        } catch (_) {}
        return originalPlay.apply(this, arguments);
      };
    }

    if (typeof window.Audio === 'function') {
      const OriginalAudio = window.Audio;
      window.Audio = function () {
        const a = new OriginalAudio(...arguments);
        try {
          if (isMuteOn()) {
            if (!mediaOriginal.has(a)) {
              mediaOriginal.set(a, { muted: a.muted, volume: a.volume });
            }
            a.muted = true;
            a.volume = 0;
          }
        } catch (_) {}
        return a;
      };
      window.Audio.prototype = OriginalAudio.prototype;
    }
  }

  function applyGlobalMuteState() {
    if (isMuteOn()) {
      muteAllMediaElements();
      setMasterGain(0);
    } else {
      restoreAllMediaElements();
      setMasterGain(1);
    }
  }

  /* =============================
     بناء القائمة وتجميع الأزرار
  ============================= */
  function init(){
    const pane = document.getElementById(PANE_ID);
    if (!pane) return;

    const container = pane.querySelector(CONTAINER_SEL);
    if (!container) return;

    const existingWrap = document.getElementById(WRAP_ID);
    if (existingWrap) {
      alignCaretToMenuIcon();

      const body = document.getElementById(BODY_ID);
      if (body) {
        const bNoti = document.getElementById(IDS.notifications);
        const bPriv = document.getElementById(IDS.private);
        const bPass = document.getElementById(IDS.changePass);

        ensureProxyToggle(body, PROXY_NOTI_ID, bNoti, 'تعطيل التنبيهات', 'fa-bell-o',
          '.toggle_notifications__enable', '.toggle_notifications__disable', 'toggle_notifications--active'
        );

        ensureProxyToggle(body, PROXY_PRIV_ID, bPriv, 'تعطيل المحادثات الخاصة', 'fa-lock',
          '.toggle_private__enable', '.toggle_private__disable', 'toggle_private--active'
        );

        ensureMuteButton(body);
        ensureProxyPassword(body, bPass);
      }
      return;
    }

    injectStyle();

    const bNoti = document.getElementById(IDS.notifications);
    const bPriv = document.getElementById(IDS.private);
    const bPass = document.getElementById(IDS.changePass);
    if (!bNoti || !bPriv || !bPass) return;

    const wrap = document.createElement('div');
    wrap.id = WRAP_ID;

    const toggle = document.createElement('div');
    toggle.id = TOGGLE_ID;
    toggle.className = 'chat__body__settings_pane__container__button form-control';
    toggle.innerHTML = `
      <span class="fa fa-angle-down np_caret" aria-hidden="true"></span>
      <span class="np_title">الإشعارات والخصوصية</span>
    `;

    const body = document.createElement('div');
    body.id = BODY_ID;

    wrap.appendChild(toggle);
    wrap.appendChild(body);

    // ✅ التغيير الوحيد: ضع القائمة في مكان زر "المحادثات الخاصة" السابق
    const priv = document.getElementById(IDS.private);
    if (priv && priv.parentNode === container) container.insertBefore(wrap, priv);
    else container.prepend(wrap);

    ensureProxyToggle(body, PROXY_NOTI_ID, bNoti, 'تعطيل التنبيهات', 'fa-bell-o',
      '.toggle_notifications__enable', '.toggle_notifications__disable', 'toggle_notifications--active'
    );

    ensureProxyToggle(body, PROXY_PRIV_ID, bPriv, 'تعطيل المحادثات الخاصة', 'fa-lock',
      '.toggle_private__enable', '.toggle_private__disable', 'toggle_private--active'
    );

    ensureMuteButton(body);
    ensureProxyPassword(body, bPass);

    toggle.addEventListener('click', () => {
      wrap.classList.toggle('open');
      setTimeout(alignCaretToMenuIcon, 0);
    });

    setTimeout(alignCaretToMenuIcon, 0);
    window.addEventListener('resize', () => setTimeout(alignCaretToMenuIcon, 0));

    watchPaneClose();
  }

  /* =============================
     تشغيل
  ============================= */
  patchWebAudioOnce();
  patchMediaPlayOnce();

  init();
  new MutationObserver(init).observe(document.documentElement, { childList:true, subtree:true });

  watchPaneClose();

  applyGlobalMuteState();

  new MutationObserver(() => {
    if (isMuteOn()) muteAllMediaElements();
  }).observe(document.documentElement, { childList:true, subtree:true });
})();

(function () {
  'use strict';

  /* =========================
     CONFIG
  ========================= */
  const STYLE_ID = 'np_unified_inputs_full_v2';

  // Main (الحقل الرئيسي)
  const MAIN_BTN_H = 36;
  const MAIN_RAD   = 11;
  const MAIN_GAP   = 8;
  const MAIN_PAD   = 6;
  const MAIN_RAISE_PX = 14;

  // Slim (wall + footer)
  const SLIM_BTN_H = 30;
  const SLIM_RAD   = 9;
  const SLIM_GAP   = 6;
  const SLIM_PAD   = 5;

  // أيقونة زر الخيارات (جميلة)
  const OPTIONS_ICON_HTML = `<span class="fa fa-ellipsis-h" aria-hidden="true"></span>`;

  /* =========================
     COLOR HELPERS
  ========================= */
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function getAccentRGB() {
    const el = document.getElementById('chat__body') || document.body;
    return getComputedStyle(el).backgroundColor || 'rgb(56,65,89)';
  }

  function rgbToHex(rgb) {
    const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return '#384159';
    const r = clamp(+m[1], 0, 255);
    const g = clamp(+m[2], 0, 255);
    const b = clamp(+m[3], 0, 255);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function isLight(rgb) {
    const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return false;
    const r = +m[1], g = +m[2], b = +m[3];
    return (0.2126*r + 0.7152*g + 0.0722*b) / 255 > 0.62;
  }

  function setAccentVars() {
    const rgb = getAccentRGB();
    document.documentElement.style.setProperty('--np-accent', rgbToHex(rgb));
    document.documentElement.style.setProperty('--np-accent-text', isLight(rgb) ? '#111' : '#fff');
  }

  /* =========================
     STYLE INJECT (instant)
  ========================= */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    setAccentVars();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* =========================
         Unified Inputs – FULL v2
         ========================= */

      /* رفع الحقل الرئيسي للأعلى فقط */
      #chat__body__message-input{
        transform: translateY(-${MAIN_RAISE_PX}px) !important;
        background: transparent !important;
      }

      /* =========================
         Base for all 3 forms
      ========================= */
      #chat__body__message-input > form,
      form.chat__body__wall_pane__form,
      footer.chat_box__footer > form{
        direction: ltr !important;
        display: flex !important;
        align-items: center !important;
        width: 100% !important;
        margin: 0 !important;

        background: #fff !important;
        border: 1px solid rgba(0,0,0,.10) !important;

        box-sizing: border-box !important;
      }

      /* =========================
         MAIN sizing
      ========================= */
      #chat__body__message-input > form{
        gap: ${MAIN_GAP}px !important;
        padding: ${MAIN_PAD}px !important;
        border-radius: 15px !important;
        box-shadow: 0 8px 22px rgba(0,0,0,.08) !important;
      }

      #chat__body__message-input > form button,
      #chat__body__message-input > form .np-options-btn{
        height: ${MAIN_BTN_H}px !important;
        min-height: ${MAIN_BTN_H}px !important;
        border-radius: ${MAIN_RAD}px !important;
        box-sizing: border-box !important;
      }

      #chat__body__message-input__input{
        direction: rtl !important;
        text-align: right !important;
        unicode-bidi: plaintext !important;

        flex: 1 1 auto !important;
        min-height: ${MAIN_BTN_H}px !important;
        max-height: 110px !important;

        padding: 7px 10px !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        border-radius: ${MAIN_RAD}px !important;
        outline: none !important;

        background: #fff !important;
        color: #111 !important;
        resize: none !important;
        line-height: 1.6 !important;
      }
      #chat__body__message-input__input::placeholder{
        direction: rtl !important;
        text-align: right !important;
      }

      /* إرسال الرئيسي */
      #chat__body__message-input > form .fa-send,
      #chat__body__message-input > form button.chat__body__message-input__submit{
        background: var(--np-accent, #384159) !important;
        color: var(--np-accent-text, #fff) !important;
        border: 0 !important;
        padding: 0 14px !important;
        white-space: nowrap !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 8px 18px rgba(0,0,0,.10) !important;
      }

      /* فيس الرئيسي */
      #chat__body__message-input__face{
        width: ${MAIN_BTN_H}px !important;
        height: ${MAIN_BTN_H}px !important;
        border-radius: ${MAIN_RAD}px !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        background: #fff !important;
        object-fit: cover !important;
        cursor: pointer !important;
      }

      /* =========================
         SLIM sizing (wall + footer)
      ========================= */
      form.chat__body__wall_pane__form,
      footer.chat_box__footer > form{
        gap: ${SLIM_GAP}px !important;
        padding: ${SLIM_PAD}px !important;
        border-radius: 13px !important;
        box-shadow: 0 6px 16px rgba(0,0,0,.07) !important;
      }

      form.chat__body__wall_pane__form button,
      form.chat__body__wall_pane__form .np-options-btn,
      footer.chat_box__footer > form button,
      footer.chat_box__footer > form .np-options-btn{
        height: ${SLIM_BTN_H}px !important;
        min-height: ${SLIM_BTN_H}px !important;
        border-radius: ${SLIM_RAD}px !important;
        line-height: ${SLIM_BTN_H}px !important;
        font-size: 13px !important;
      }

      #chat__body__wall_pane__form__input,
      #chat_box__footer__input,
      footer.chat_box__footer .chat_box__footer__input{
        direction: rtl !important;
        text-align: right !important;
        unicode-bidi: plaintext !important;

        flex: 1 1 auto !important;
        min-height: ${SLIM_BTN_H}px !important;
        max-height: 92px !important;

        padding: 6px 9px !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        border-radius: ${SLIM_RAD}px !important;
        outline: none !important;

        background: #fff !important;
        color: #111 !important;
        resize: none !important;
        line-height: 1.45 !important;
        font-size: 13px !important;
      }
      #chat__body__wall_pane__form__input::placeholder,
      #chat_box__footer__input::placeholder,
      footer.chat_box__footer .chat_box__footer__input::placeholder{
        direction: rtl !important;
        text-align: right !important;
      }

      /* إرسال slim */
      form.chat__body__wall_pane__form .fa-send,
      footer.chat_box__footer > form .fa-send,
      form.chat__body__wall_pane__form button.chat__body__wall_pane__form__send{
        background: var(--np-accent, #384159) !important;
        color: var(--np-accent-text, #fff) !important;
        border: 0 !important;
        padding: 0 12px !important;
        white-space: nowrap !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 7px 14px rgba(0,0,0,.10) !important;
      }

      /* فيس slim – تصغير الفيس فقط (بدون تغيير الزر) */
      #chat__body__wall_pane__form__attach__face,
      footer.chat_box__footer #chat_box__footer__smile,
      footer.chat_box__footer .chat_box__footer__smile{
        width: ${SLIM_BTN_H}px !important;
        height: ${SLIM_BTN_H}px !important;
        border-radius: ${SLIM_RAD}px !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        background: #fff !important;

        padding: 4px !important;
        box-sizing: border-box !important;
        object-fit: contain !important;

        cursor: pointer !important;
      }

      /* FontAwesome icons slim */
      form.chat__body__wall_pane__form .fa,
      footer.chat_box__footer > form .fa{
        font-size: 14px !important;
      }

      /* =========================
         OPTIONS (common)
      ========================= */
      .np-options-wrap{
        position: relative !important;
        display: inline-flex !important;
        align-items: center !important;
        flex: 0 0 auto !important;
      }

      .np-options-btn{
        background: #fff !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        color: #222 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        user-select: none !important;
      }

      /* عرض زر الخيارات حسب الحجم */
      #chat__body__message-input > form .np-options-btn{ width: ${MAIN_BTN_H}px !important; }
      form.chat__body__wall_pane__form .np-options-btn,
      footer.chat_box__footer > form .np-options-btn{ width: ${SLIM_BTN_H}px !important; }

      /* Menu base */
      .np-options-menu{
        position: absolute !important;
        bottom: calc(100% + 10px) !important;
        left: 0 !important;
        display: none !important;

        background: #fff !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        z-index: 99999 !important;
      }
      .np-options-menu.is-open{ display: block !important; }

      /* MAIN menu size */
      #chat__body__message-input > form .np-options-menu{
        min-width: 190px !important;
        padding: 8px !important;
        border-radius: 14px !important;
        box-shadow: 0 18px 45px rgba(0,0,0,.14) !important;
      }

      /* SLIM menu size */
      form.chat__body__wall_pane__form .np-options-menu,
      footer.chat_box__footer > form .np-options-menu{
        min-width: 165px !important;
        padding: 6px !important;
        border-radius: 12px !important;
        box-shadow: 0 14px 35px rgba(0,0,0,.13) !important;
      }

      .np-options-item{
        width: 100% !important;
        display: flex !important;
        align-items: center !important;
        border: 0 !important;
        background: #fff !important;
        color: #111 !important;
        cursor: pointer !important;
        text-align: right !important;
      }
      .np-options-item:hover{ background: rgba(0,0,0,.05) !important; }

      /* MAIN item */
      #chat__body__message-input > form .np-options-item{
        gap: 10px !important;
        padding: 10px 10px !important;
        border-radius: 12px !important;
      }
      #chat__body__message-input > form .np-options-ico{
        width: 26px !important;
        height: 26px !important;
        border-radius: 9px !important;
      }
      #chat__body__message-input > form .np-options-title{
        font-size: 13px !important;
        font-weight: 700 !important;
      }

      /* SLIM item */
      form.chat__body__wall_pane__form .np-options-item,
      footer.chat_box__footer > form .np-options-item{
        gap: 9px !important;
        padding: 8px 9px !important;
        border-radius: 10px !important;
      }
      form.chat__body__wall_pane__form .np-options-ico,
      footer.chat_box__footer > form .np-options-ico{
        width: 22px !important;
        height: 22px !important;
        border-radius: 8px !important;
      }
      form.chat__body__wall_pane__form .np-options-title,
      footer.chat_box__footer > form .np-options-title{
        font-size: 12.5px !important;
        font-weight: 700 !important;
      }
      .np-options-ico{
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(0,0,0,.06) !important;
        color: #111 !important;
        flex: 0 0 auto !important;
      }

      /* =========================
         Hide original buttons after merge
      ========================= */
      /* main */
      #chat__body__message-input .chat__body__message-input__share,
      #chat__body__message-input .chat__body__message-input__clear{
        display: none !important;
      }

      /* ==================================================
         ✅ SLIM ALIGN PATCH (wall + footer only)
         ================================================== */
      form.chat__body__wall_pane__form > *,
      footer.chat_box__footer > form > *{
        align-self: center !important;
        vertical-align: middle !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }

      form.chat__body__wall_pane__form > span,
      footer.chat_box__footer > form > span{
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        height: ${SLIM_BTN_H}px !important;
        line-height: 1 !important;
      }

      .chat__body__wall_pane__form__loader,
      #chat_box__footer__loader{
        vertical-align: middle !important;
        align-self: center !important;
        margin: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  ========================= */
  function buildOptionsForForm(form, items) {
    if (!form) return;

    // ✅ إذا موجود wrap لكن "انكسر" بسبب re-render (أو زر داخله مفقود) نعيد البناء
    const existing = form.querySelector('.np-options-wrap');
    if (existing) {
      const ok = existing.querySelector('.np-options-btn') && existing.querySelector('.np-options-menu');
      if (!ok) { try { existing.remove(); } catch (_) {} }
      else return; // موجود وسليم
    }

    const available = items
      .map(it => ({ ...it, el: it.get() }))
      .filter(it => !!it.el);

    // ✅ لا نخرج نهائياً، نخلي المراقبة تعيد المحاولة لاحقاً
    if (!available.length) return;

    // hide originals
    available.forEach(it => it.hide && it.hide(it.el));

    const wrap = document.createElement('span');
    wrap.className = 'np-options-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'np-options-btn';
    btn.setAttribute('aria-label', 'خيارات');
    btn.innerHTML = OPTIONS_ICON_HTML;

    const menu = document.createElement('div');
    menu.className = 'np-options-menu';

    function makeItem(icon, text, cb) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'np-options-item';
      b.innerHTML = `
        <span class="np-options-ico"><span class="fa ${icon}"></span></span>
        <span class="np-options-title">${text}</span>
      `;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.classList.remove('is-open');
        cb();
      });
      return b;
    }

    available.forEach(it => {
      menu.append(makeItem(it.icon, it.label, () => it.click(it.el)));
    });

    if (!menu.children.length) return;

    wrap.append(btn, menu);
    form.insertBefore(wrap, form.firstChild);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu.classList.toggle('is-open');
    });

    document.addEventListener('click', () => menu.classList.remove('is-open'), { passive: true });
  }

  /* =========================
     ORDER APPLIER
  ========================= */
  function applyOrder(form, selectors) {
    try {
      const optionsWrap = form.querySelector('.np-options-wrap');
      if (optionsWrap) optionsWrap.style.order = '1';

      const face = selectors.face ? form.querySelector(selectors.face) : null;
      if (face) face.style.order = '2';

      const textarea = selectors.textarea ? form.querySelector(selectors.textarea) : null;
      if (textarea) textarea.style.order = '3';

      const send = selectors.send ? form.querySelector(selectors.send) : null;
      if (send) send.style.order = '4';
    } catch (_) {}
  }

  /* =========================
     MOUNT ALL
  ========================= */
  function mountAll() {
    setAccentVars();

    // MAIN form
    const mainForm = document.querySelector('#chat__body__message-input > form');
    if (mainForm) {
      buildOptionsForForm(mainForm, [
        {
          get: () => mainForm.querySelector('.chat__body__message-input__share'),
          icon: 'fa-share-alt',
          label: 'مشاركة',
          hide: (el) => (el.style.display = 'none'),
          click: (el) => el.click()
        },
        {
          get: () => mainForm.querySelector('.chat__body__message-input__clear'),
          icon: 'fa-trash',
          label: 'حذف حقل الدردشة',
          hide: (el) => (el.style.display = 'none'),
          click: (el) => el.click()
        }
      ]);

      applyOrder(mainForm, {
        face: '#chat__body__message-input__face',
        textarea: '#chat__body__message-input__input',
        send: '.chat__body__message-input__submit'
      });
    }

    // WALL form (Slim)
    const wallForm = document.querySelector('form.chat__body__wall_pane__form');
    if (wallForm) {
      buildOptionsForForm(wallForm, [
        {
          get: () => wallForm.querySelector('.chat__body__wall_pane__form__attach'),
          icon: 'fa-share-alt',
          label: 'مشاركة',
          hide: (el) => (el.style.display = 'none'),
          click: (el) => el.click()
        },
        {
          get: () => wallForm.querySelector('.chat__body__wall_pane__form__clear'),
          icon: 'fa-trash',
          label: 'حذف حقل الدردشة',
          hide: (el) => (el.style.display = 'none'),
          click: (el) => el.click()
        }
      ]);

      applyOrder(wallForm, {
        face: '#chat__body__wall_pane__form__attach__face',
        textarea: '#chat__body__wall_pane__form__input',
        send: '.chat__body__wall_pane__form__send'
      });
    }

    // FOOTER form (Slim)
    const footerForm = document.querySelector('footer.chat_box__footer > form');
    if (footerForm) {
      buildOptionsForForm(footerForm, [
        {
          get: () => footerForm.querySelector('#chat_box__footer__call'),
          icon: 'fa-phone',
          label: 'اتصال',
          hide: (el) => (el.style.display = 'none'),
          click: (el) => el.click()
        },
        {
          get: () => footerForm.querySelector('#chat_box__footer__share'),
          icon: 'fa-share-alt',
          label: 'مشاركة',
          hide: (el) => (el.style.display = 'none'),
          click: (el) => el.click()
        }
      ]);

      applyOrder(footerForm, {
        face: '#chat_box__footer__smile',
        textarea: '#chat_box__footer__input',
        send: '#chat_box__footer__submit'
      });
    }
  }

  /* =========================
     START
  ========================= */
  injectStyles();
  mountAll();

  // ✅ تشغيل إضافي عند اكتمال التحميل (يفيد إذا الأزرار تتأخر)
  document.addEventListener('DOMContentLoaded', mountAll, { passive: true });
  window.addEventListener('load', mountAll, { passive: true });

  // ✅ مراقبة مستمرة لكن "خفيفة" (throttled) عشان ما تثقل الموقع
  let rafLock = false;
  const obs = new MutationObserver(() => {
    if (rafLock) return;
    rafLock = true;
    requestAnimationFrame(() => {
      rafLock = false;
      try { mountAll(); } catch (_) {}
    });
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });

})();


(function () {
  'use strict';

  const BELL_SEL  = '#others--notifications';
  const POP_CONT  = '#popup_container';
  const TITLE_SEL = '.popup__title';

  // ✅ الكلمات اللي تفعّل النقطة
  const WATCH_TITLES = new Set(['تنبيه', 'إعجاب', 'ترقية']);

  const DOT_ID = 'np_noti_body_dot';
  const LS_SEEN_POPUP_ID = 'np_last_seen_popup_id_v3';

  const DOT_SIZE = 10;

  const $ = (s, root = document) => root.querySelector(s);

  /* ---------- Dot overlay (forced) ---------- */
  function ensureDot() {
    let dot = document.getElementById(DOT_ID);
    if (!dot) {
      dot = document.createElement('div');
      dot.id = DOT_ID;
      document.body.appendChild(dot);
    }

    dot.style.setProperty('position', 'fixed', 'important');
    dot.style.setProperty('z-index', '2147483647', 'important');
    dot.style.setProperty('pointer-events', 'none', 'important');
    dot.style.setProperty('width', DOT_SIZE + 'px', 'important');
    dot.style.setProperty('height', DOT_SIZE + 'px', 'important');
    dot.style.setProperty('border-radius', '999px', 'important');
    dot.style.setProperty('background', '#e53935', 'important');
    dot.style.setProperty('box-shadow', '0 0 0 2px #fff', 'important');
    dot.style.setProperty('opacity', '1', 'important');
    dot.style.setProperty('visibility', 'visible', 'important');

    return dot;
  }

  /* ✅ تموضع احترافي: الزاوية العلوية اليسرى للجرس (مكان السهم) */
  function placeDot() {
    const bell = $(BELL_SEL);
    const dot = ensureDot();
    if (!bell) return;

    const r = bell.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;

    // 🔴 Top-left corner placement (tweak values if needed)
    dot.style.setProperty('left', Math.round(r.right - 1) + 'px', 'important'); // يسار شوي
    dot.style.setProperty('top',  Math.round(r.top  - 0) + 'px', 'important'); // فوق شوي
  }

  function showDot() {
    const dot = ensureDot();
    placeDot();
    dot.style.setProperty('display', 'block', 'important');
  }

  function hideDot() {
    const dot = ensureDot();
    dot.style.setProperty('display', 'none', 'important');
  }

  /* ---------- Storage ---------- */
  function getSeenPopupId() {
    try { return Number(localStorage.getItem(LS_SEEN_POPUP_ID) || 0) || 0; }
    catch (_) { return 0; }
  }

  function setSeenPopupId(v) {
    try { localStorage.setItem(LS_SEEN_POPUP_ID, String(v || 0)); } catch (_) {}
  }

  /* ---------- Popup detection ---------- */
  function latestPopupInfo() {
    const cont = $(POP_CONT);
    if (!cont) return null;

    const pops = cont.querySelectorAll('.popup');
    if (!pops.length) return null;

    const last = pops[pops.length - 1];

    const id = Number(last.getAttribute('data-id') || 0) || 0;
    const titleEl = last.querySelector(TITLE_SEL);
    const title = (titleEl ? (titleEl.textContent || '') : '').trim();

    return { id, title };
  }

  function onNewPopup() {
    const info = latestPopupInfo();
    if (!info) return;

    // ✅ لازم يكون من الكلمات المراقبة
    if (!WATCH_TITLES.has(info.title)) return;

    const seenId = getSeenPopupId();

    // ✅ Popup جديد (data-id أكبر)
    if (info.id && info.id > seenId) {
      showDot();
    }
  }

  /* ---------- Clear when user clicks bell ---------- */
  function markSeen() {
    const info = latestPopupInfo();
    if (info && info.id) setSeenPopupId(info.id);
    hideDot();
  }

  function bindBell() {
    const bell = $(BELL_SEL);
    if (bell && !bell.__npBellBoundPopupV3) {
      bell.__npBellBoundPopupV3 = true;
      bell.addEventListener('click', markSeen, { passive: true });
    }
  }

  /* ---------- Observe popup container ---------- */
  function startObservers() {
    const attach = () => {
      const cont = $(POP_CONT);
      if (!cont || cont.__npObsAttachedV3) return false;

      cont.__npObsAttachedV3 = true;

      const mo = new MutationObserver(() => {
        bindBell();
        onNewPopup();
      });

      mo.observe(cont, { childList: true, subtree: true, characterData: true });
      return true;
    };

    // Retry attach (container might be injected later)
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      attach();
      bindBell();

      // keep dot aligned if visible
      const dot = ensureDot();
      if (dot.style.display !== 'none') placeDot();

      if (tries > 300) clearInterval(t);
    }, 200);

    window.addEventListener('scroll', placeDot, { passive: true });
    window.addEventListener('resize', placeDot, { passive: true });
  }

  /* ---------- Boot ---------- */
  let tries = 0;
  const boot = setInterval(() => {
    tries++;
    if ($(BELL_SEL) && document.body) {
      clearInterval(boot);

      ensureDot();
      bindBell();
      startObservers();

      // ✅ أول مرة: اعتبر آخر popup الحالي "مقروء" (ما نطلع نقطة على القديم)
      if (!localStorage.getItem(LS_SEEN_POPUP_ID)) {
        const info = latestPopupInfo();
        if (info && info.id) setSeenPopupId(info.id);
        hideDot();
      }
    }
    if (tries > 300) clearInterval(boot);
  }, 200);

})();

(function () {
  'use strict';

  const ID = 'chat_box__body__is_writing';

  function buildIndicator(oldEl) {
    // عنصر جديد بدل img
    const sp = document.createElement('span');
    sp.id = ID;

    // حافظ على أي class قديم
    if (oldEl && oldEl.className) sp.className = oldEl.className;
    sp.classList.add('typing-indicator');

    // حافظ على الـ style (خصوصاً display اللي النظام عندك يغيّره عند الكتابة)
    const oldStyle = oldEl ? oldEl.getAttribute('style') : null;
    if (oldStyle) sp.setAttribute('style', oldStyle);

    // محتوى النقاط
    sp.innerHTML = `
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    `;

    // استبدال في الـ DOM
    if (oldEl && oldEl.parentNode) oldEl.parentNode.replaceChild(sp, oldEl);

    return sp;
  }

  function ensure() {
    const el = document.getElementById(ID);
    if (!el) return null;

    // إذا مازال img → استبدله
    if (el.tagName && el.tagName.toLowerCase() === 'img') {
      return buildIndicator(el);
    }

    // إذا صار span لكن بدون كلاسنا
    el.classList.add('typing-indicator');

    // إذا ما فيه dots لأي سبب
    if (!el.querySelector('.typing-dot')) {
      el.innerHTML = `
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      `;
    }

    return el;
  }

  // تشغيل أولي
  let node = ensure();

  // لو الصفحة عندك تعيد رسم العنصر لاحقاً (SPA) نراقب ونصلح تلقائياً
  const mo = new MutationObserver(() => {
    node = ensure() || node;
  });

  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
(function () {
  "use strict";

  const MODAL_ID = "user_profile";
  const STYLE_ID = "np_user_profile_tweaks";
  const FLAG_KEY = "npUserProfileTweaksMounted";
  const TARGET_USER = "26"; // ← رقم العضو المطلوب

  const $ = (s, r = document) => r.querySelector(s);
  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `

      /* يطبق فقط عند وجود الكلاس */
      #user_profile.np-target-user .user_profile__body__ip{
        display: none !important;
      }

      #user_profile.np-target-user .user_profile__body__stats--time{
        visibility: hidden !important;
      }

      #user_profile.np-target-user .user_profile__avatar-overlay{
        left: 50% !important;
        right: auto !important;
        transform: translate(-50%, 30px) !important;
      }

      /* نبض الإضاءة */
      @keyframes npAvatarGlowPulse {
        0% {
          box-shadow:
            0 0 6px rgba(255,255,255,.45),
            0 0 14px rgba(255,255,255,.28),
            0 0 28px rgba(255,255,255,.18),
            0 0 46px rgba(255,255,255,.10);
        }
        50% {
          box-shadow:
            0 0 10px rgba(255,255,255,.90),
            0 0 22px rgba(255,255,255,.65),
            0 0 44px rgba(255,255,255,.45),
            0 0 80px rgba(255,255,255,.25);
        }
        100% {
          box-shadow:
            0 0 6px rgba(255,255,255,.45),
            0 0 14px rgba(255,255,255,.28),
            0 0 28px rgba(255,255,255,.18),
            0 0 46px rgba(255,255,255,.10);
        }
      }

      /* إطار أبيض نحيف جداً + إضاءة نابضة */
      #user_profile.np-target-user .user_profile__avatar-overlay img{
        border-radius: 50% !important;
        border: 1px solid rgba(255,255,255,.95) !important;
        animation: npAvatarGlowPulse 1.6s ease-in-out infinite !important;
        will-change: box-shadow;
      }

      #user_profile.np-target-user .user_profile__body__status{
        display: block !important;
        text-align: center !important;
        width: 100% !important;
        margin: 55px 0 10px 0 !important;
      }

    `;
    document.head.appendChild(st);
  }

  function applyOnlyForTarget(modal) {
    if (!modal) return;

    const userId = modal.getAttribute("data-user");

    if (userId === TARGET_USER) {
      modal.classList.add("np-target-user");
    } else {
      modal.classList.remove("np-target-user");
    }

    injectStyleOnce();
  }

  function watch() {
    const modal = $("#" + MODAL_ID);
    if (!modal) return;

    const isShown =
      modal.classList.contains("show") &&
      modal.style.display !== "none";

    if (!isShown) return;

    applyOnlyForTarget(modal);
  }

  if (!document.documentElement.dataset[FLAG_KEY]) {
    document.documentElement.dataset[FLAG_KEY] = "1";

    const mo = new MutationObserver(() => requestAnimationFrame(watch));
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    watch();
  }
})(); });
