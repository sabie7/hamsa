/* ══════════════════════════════════════════════════════════════
   CUSTOM MODALS — rules / about / contact / zakhrafa
   Clean ES-module rebuild of the owner's legacy custom-modal
   patch (sor/1 (1).txt) adapted to the 2026 layout. Injects a
   small toolbar above the chat input with the original buttons.
   ══════════════════════════════════════════════════════════════ */

var MOUNTED = false;

function showModal(title, content) {
  var old = document.querySelector('.legacy-custom-modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.className = 'modal legacy-custom-modal';
  modal.innerHTML =
    '<div class="modal-content">' +
    '  <span class="legacy-custom-close" style="cursor:pointer">&times;</span>' +
    '  <h1 class="legacy-custom-title"></h1>' +
    '  <div class="modal-text" style="color: #fff !important; direction: rtl; font-size: 14px; line-height: 1.9; padding: 1px; margin-bottom: 17px; text-align: center;"></div>' +
    '</div>';
  document.body.appendChild(modal);

  modal.querySelector('.legacy-custom-title').textContent = title;
  modal.querySelector('.modal-text').innerHTML = content;
  modal.querySelector('.legacy-custom-close').addEventListener('click', function () { modal.remove(); });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.remove();
  });
  modal.style.display = 'block';
}

function buildToolbar() {
  var bar = document.createElement('div');
  bar.className = 'legacy-custom-toolbar';
  bar.id = 'legacy-custom-toolbar';

  var contactBtn = document.createElement('button');
  contactBtn.className = 'tab-button';
  contactBtn.type = 'button';
  contactBtn.innerText = 'تواصـل معنـا';
  contactBtn.addEventListener('click', function () {
    window.open('https://www.instagram.com/njm.chat?igsh=ZjI2cWs2c2l0MjZ1&utm_source=qr', '_blank');
  });

  var rulesBtn = document.createElement('button');
  rulesBtn.className = 'tab-button';
  rulesBtn.type = 'button';
  rulesBtn.innerText = 'قوانيـن الشـات';
  rulesBtn.addEventListener('click', function () {
    showModal('قوانين الشات', [
      '<p><b>الاحترام أولاً:</b> تعامل مع الجميع بلطف واحترام، واحذر من الإساءة أو العنصرية.</p>',
      '<p><b>المحتوى اللائق:</b> يمنع نشر أي محتوى مسيء أو غير لائق (نصوص، صور، روابط).</p>',
      '<p><b>حماية الخصوصية:</b> لا تشارك معلومات شخصية دون إذن.</p>',
      '<p><b>الإعلانات ممنوعة:</b> لا تنشر إعلانات ترويجية لمواقع اخرى وتجنب ذكر اسماء المواقع</p>',
      '<p><b>الالتزام بالموضوع:</b> حافظ على تركيز المحادثات في المواضيع المناسبة.</p>',
      '<p><b>منع التحريض والعنف:</b> يمنع الدعوة للعنف أو التحريض ضد الآخرين.</p>',
      '<p><b>الامتثال للإدارة:</b> احترم قرارات الإدارة واطلب المساعدة عند الحاجة.</p>',
      '<p><b>حظر المخالفين:</b> سيتم حظر الأعضاء الذين يخالفون القوانين.</p>',
      '<p>هدفنا هو توفير بيئة آمنة وممتعة للجميع!</p>'
    ].join(''));
  });

  var aboutBtn = document.createElement('button');
  aboutBtn.className = 'tab-button';
  aboutBtn.type = 'button';
  aboutBtn.innerText = 'مـن نحـن';
  aboutBtn.addEventListener('click', function () {
    showModal('من نحن', 'في شات نجم عُمان، نحن نعيد تعريف التواصل الإلكتروني بأسلوب يجمع بين الأصالة العمانية وروح الخليج.<br>' +
      'بفضل رؤية السيد نجم، صاحب الموقع، وبدعم من فريق الإدارة المتميز: رماد، صُـوفيـا، اسكوبار، و هيام،<br>' +
      'نقدم لكم منصة فريدة تجمع بين الحوارات الهادفة، واللحظات المميزة، والاحترام المتبادل.<br>' +
      'في شات نجم عُمان، نحن أكثر من مجرد دردشة؛ نحن أسرة واحدة، نبني جسورًا من المحبة والاحترام بين الجميع.');
  });

  var fancyBtn = document.createElement('button');
  fancyBtn.className = 'tab-button';
  fancyBtn.type = 'button';
  fancyBtn.innerText = 'زخرفـة';
  fancyBtn.addEventListener('click', function () {
    window.open('https://www.wmadaat.com/textdecor/en/', '_blank');
  });

  bar.append(contactBtn, rulesBtn, aboutBtn, fancyBtn);
  return bar;
}

function insertToolbar() {
  if (document.getElementById('legacy-custom-toolbar')) return true;
  var chatInput = document.getElementById('chat-input');
  if (!chatInput) return false;
  var wrapper = chatInput.closest('.chat-input-container') || chatInput.parentElement;
  if (!wrapper) return false;
  try {
    var bar = buildToolbar();
    if (chatInput.parentElement === wrapper) {
      wrapper.insertBefore(bar, chatInput);
    } else if (wrapper.firstChild) {
      wrapper.insertBefore(bar, wrapper.firstChild);
    } else {
      wrapper.appendChild(bar);
    }
    return true;
  } catch (e) {
    console.error('[custom-modals] insertToolbar failed:', e);
    return false;
  }
}

export function initCustomModals() {
  if (MOUNTED) return;
  MOUNTED = true;
  if (insertToolbar()) return;
  var obs = new MutationObserver(function () {
    if (insertToolbar()) obs.disconnect();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', function () {
    if (!document.getElementById('legacy-custom-toolbar')) insertToolbar();
  });
}
