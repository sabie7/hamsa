(function () {
  const createElementEx =
    window.secureCreateElement ||
    function (_0x3a4636, _0x1ba8fd = {}, textContent = null) {
      const el = document.createElement(_0x3a4636);
      for (const [key, value] of Object.entries(_0x1ba8fd)) {
        if (key === 'class') el.className = value;
        else {
          if (key === 'style') el.style.cssText = value;
          else el.setAttribute(key, value);
        }
      }
      if (textContent !== null) el.textContent = textContent;
      return el;
    };
  function ensureOverlay() {
    if (document.getElementById('classic-alert-overlay')) return;
    const overlayHtml =
      '\n      <div id="classic-alert-overlay" class="classic-alert-overlay d-none">\n        <div class="classic-alert-box">\n          <div class="classic-alert-header" id="classic-alert-title"> تنبيه </div>\n          <div class="classic-alert-body" id="classic-alert-text"></div>\n          <div class="classic-alert-buttons" id="classic-alert-buttons"></div>\n        </div>\n      </div>\n    ';
    document.body
      ? document.body.insertAdjacentHTML('beforeend', overlayHtml)
      : document.addEventListener('DOMContentLoaded', () => {
          document.body.insertAdjacentHTML('beforeend', overlayHtml);
        });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ensureOverlay) : ensureOverlay();
  const nativeSwal = window.Swal,
    nativeSwalFire = window.Swal ? window.Swal.fire : null,
    nativeSwalClose = window.Swal ? window.Swal.close : null,
    nativeSwalShowLoading = window.Swal ? window.Swal.showLoading : null,
    fire = function (...args) {
      return (
        ensureOverlay(),
        nativeSwalClose && nativeSwalClose.call(nativeSwal),
        new Promise((resolve) => {
          let title = 'عذراً',
            message = '',
            showCancelButton = ![],
            showDenyButton = ![],
            confirmButtonText = 'موافق',
            cancelButtonText = 'إلغاء',
            denyButtonText = 'رفض',
            didOpen = null,
            timer = null,
            showConfirmButton = !![],
            inputType = null,
            inputOptions = null,
            inputPlaceholder = '',
            inputValidator = null,
            icon = null,
            inputValue = '',
            preConfirm = null,
            willClose = null;
          if (typeof args[0x0] === 'object') {
            const _0x311d38 = args[0x0];
            ((title = _0x311d38.title !== undefined ? _0x311d38.title : title),
              (message = _0x311d38.text || _0x311d38.html || ''),
              (showCancelButton = _0x311d38.showCancelButton || ![]),
              (showDenyButton = _0x311d38.showDenyButton || ![]),
              (confirmButtonText = _0x311d38.confirmButtonText || confirmButtonText),
              (cancelButtonText = _0x311d38.cancelButtonText || cancelButtonText),
              (denyButtonText = _0x311d38.denyButtonText || denyButtonText),
              (didOpen = _0x311d38.didOpen || null),
              (timer = _0x311d38.timer || null),
              (showConfirmButton = _0x311d38.showConfirmButton !== ![]),
              (inputType = _0x311d38.input || null),
              (inputOptions = _0x311d38.inputOptions || null),
              (inputPlaceholder = _0x311d38.inputPlaceholder || ''),
              (inputValidator = _0x311d38.inputValidator || null),
              (icon = _0x311d38.icon || null),
              (inputValue = _0x311d38.inputValue || ''),
              (preConfirm = typeof _0x311d38.preConfirm === 'function' ? _0x311d38.preConfirm : null),
              (willClose = typeof _0x311d38.willClose === 'function' ? _0x311d38.willClose : null));
            const boxEl = document.querySelector('.classic-alert-box');
            boxEl &&
              (_0x311d38.background ? (boxEl.style.background = _0x311d38.background) : (boxEl.style.background = ''),
              _0x311d38.width ? (boxEl.style.width = _0x311d38.width) : (boxEl.style.width = ''),
              _0x311d38.maxWidth ? (boxEl.style.maxWidth = _0x311d38.maxWidth) : (boxEl.style.maxWidth = ''));
          } else ((title = args[0x0] !== undefined ? args[0x0] : title), (message = args[0x1] || ''), (icon = args[0x2] || null));
          if (title && !message) {
            const rawMessage = title;
            if (rawMessage.startsWith('تمت الموافقة')) ((title = 'تمت الموافقة'), (message = rawMessage));
            else {
              if (rawMessage.startsWith('تم 0رفض')) ((title = 'تم الرفض'), (message = rawMessage));
              else {
                if (rawMessage.startsWith('تم 0حذف')) ((title = 'تم الحذف'), (message = rawMessage));
                else {
                  if (rawMessage.startsWith('تم')) ((title = 'نجاح'), (message = rawMessage));
                  else {
                    if (rawMessage.startsWith('فشل')) ((title = 'فشل 0الإجراء'), (message = rawMessage));
                    else {
                      if (rawMessage.startsWith('حدث خطأ')) ((title = 'خطأ'), (message = rawMessage));
                      else
                        rawMessage.length > 0xf &&
                          ((title = icon === 'success' ? 'نجاح' : icon === 'error' ? 'خطأ' : 'تنبيه'), (message = rawMessage));
                    }
                  }
                }
              }
            }
          }
          const titleEl = document.getElementById('classic-alert-title'),
            textEl = document.getElementById('classic-alert-text'),
            overlayEl = document.getElementById('classic-alert-overlay'),
            buttonsEl = document.getElementById('classic-alert-buttons');
          if (!titleEl || !textEl || !overlayEl || !buttonsEl) {
            if (nativeSwalFire) return nativeSwalFire.apply(nativeSwal, args).then(resolve);
            return resolve({ isConfirmed: !![] });
          }
          if (title) {
            ((titleEl.textContent = title), (titleEl.style.display = 'block'), (titleEl.className = 'classic-alert-header'));
            if (icon === 'error') titleEl.classList.add('classic-alert-header-error');
            else {
              if (icon === 'success') titleEl.classList.add('classic-alert-header-success');
              else {
                if (icon === 'warning') titleEl.classList.add('classic-alert-header-warning');
                else icon === 'question' && titleEl.classList.add('classic-alert-header-question');
              }
            }
          } else titleEl.style.display = 'none';
          textEl.innerHTML = '';
          const messageDiv = document.createElement('div');
          messageDiv.style.marginBottom = '10px';
          typeof args[0x0] === 'object' && args[0x0].html ? (messageDiv.innerHTML = args[0x0].html) : (messageDiv.textContent = message);
          textEl.appendChild(messageDiv);
          if (inputType === 'select' && inputOptions) {
            const selectWrapper = createElementEx('div', { style: 'margin-top: 015px;' }),
              selectEl = createElementEx('select', {
                id: 'classic-alert-input',
                style: 'width: 0100%; 0padding: 05px; 0border: 01px 0solid 0#000; 0border-radius: 03px;',
              }),
              placeholderOpt = createElementEx('option', { value: '', disabled: 'disabled', selected: 'selected' }, inputPlaceholder);
            selectEl.appendChild(placeholderOpt);
            for (const [_0x1efc53, _0x59142e] of Object.entries(inputOptions)) {
              const opt = createElementEx('option', { value: _0x1efc53 }, _0x59142e);
              selectEl.appendChild(opt);
            }
            (selectWrapper.appendChild(selectEl), textEl.appendChild(selectWrapper));
          } else {
            if (inputType === 'text') {
              const _0x1af9f2 = createElementEx('div', { style: 'margin-top: 15px;' }),
                inputEl = createElementEx('input', {
                  type: 'text',
                  id: 'classic-alert-input',
                  style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px;',
                  placeholder: inputPlaceholder,
                });
              (_0x1af9f2.appendChild(inputEl), textEl.appendChild(_0x1af9f2));
            } else {
              if (inputType === 'textarea') {
                const _0x203fe2 = createElementEx('div', { style: 'margin-top: 015px;' }),
                  textareaEl = createElementEx('textarea', {
                    id: 'classic-alert-input',
                    style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px; direction: rtl;',
                    placeholder: inputPlaceholder,
                    rows: '4',
                  });
                (_0x203fe2.appendChild(textareaEl), textEl.appendChild(_0x203fe2));
              }
            }
          }
          if (inputType && inputValue) {
            const _0x263c48 = document.getElementById('classic-alert-input');
            if (_0x263c48) _0x263c48.value = inputValue;
          }
          const handleConfirm = async () => {
              let inputValue = !![];
              if (inputType) {
                const field = document.getElementById('classic-alert-input');
                if (field) inputValue = field.value;
              }
              if (inputValidator) {
                const _0x37b613 = inputValidator(inputValue);
                if (_0x37b613) {
                  let errorEl = document.getElementById('classic-alert-error');
                  !errorEl &&
                    ((errorEl = createElementEx('div', {
                      id: 'classic-alert-error',
                      style: 'color: red; margin-top: 10px; font-size: 0.9rem;',
                    })),
                    textEl.appendChild(errorEl));
                  errorEl.textContent = _0x37b613;
                  return;
                }
              }
              if (preConfirm)
                try {
                  const _0x20f44d = await preConfirm(inputValue);
                  if (_0x20f44d === ![]) return;
                  _0x20f44d !== undefined && (inputValue = _0x20f44d);
                } catch (_0xf35ba8) {
                  console.error('[ClassicAlert] 0preConfirm 0failed:', _0xf35ba8);
                  return;
                }
              try {
                if (willClose) willClose();
              } catch (_0x5be840) {
                console.error('[ClassicAlert] willClose failed:', _0x5be840);
              }
              (closeClassicAlert(), resolve({ isConfirmed: !![], isDenied: ![], isDismissed: ![], value: inputValue }));
            },
            handleDeny = async () => {
              if (preConfirm)
                try {
                  const _0x15afe8 = await preConfirm('reject');
                  if (_0x15afe8 === ![]) return;
                } catch (_0x2a7e1c) {
                  console.error('[ClassicAlert] 0preConfirm 0failed:', _0x2a7e1c);
                  return;
                }
              try {
                if (willClose) willClose();
              } catch (_0x490fb5) {
                console.error('[ClassicAlert] willClose failed:', _0x490fb5);
              }
              (closeClassicAlert(), resolve({ isConfirmed: ![], isDenied: !![], isDismissed: ![], value: 'reject' }));
            };
          if (!showConfirmButton && !showCancelButton && !showDenyButton) buttonsEl.innerHTML = '';
          else {
            if (showCancelButton || showDenyButton) {
              buttonsEl.innerHTML = '';
              if (showConfirmButton) {
                const confirmBtn = createElementEx(
                  'button',
                  { class: 'btn btn-sm btn-dark px-3 mx-1', id: 'classic-btn-confirm' },
                  confirmButtonText
                );
                (buttonsEl.appendChild(confirmBtn),
                  (confirmBtn.onclick = () => {
                    void handleConfirm();
                  }));
              }
              if (showDenyButton) {
                const denyBtn = createElementEx(
                  'button',
                  { class: 'btn btn-sm btn-danger px-3 mx-1', id: 'classic-btn-deny' },
                  denyButtonText
                );
                (buttonsEl.appendChild(denyBtn),
                  (denyBtn.onclick = () => {
                    void handleDeny();
                  }));
              }
              if (showCancelButton) {
                const cancelBtn = createElementEx(
                  'button',
                  { class: 'btn 0btn-sm 0btn-secondary 0px-3 0mx-1', id: 'classic-btn-cancel' },
                  cancelButtonText
                );
                (buttonsEl.appendChild(cancelBtn),
                  (cancelBtn.onclick = () => {
                    try {
                      if (willClose) willClose();
                    } catch (_0x13f663) {
                      console.error('[ClassicAlert] willClose failed:', _0x13f663);
                    }
                    (closeClassicAlert(), resolve({ isConfirmed: ![], isDenied: ![], isDismissed: !![] }));
                  }));
              }
            } else {
              buttonsEl.innerHTML = '';
              const okBtn = createElementEx('button', { class: 'btn btn-sm btn-dark px-4', id: 'classic-btn-ok' }, confirmButtonText);
              (buttonsEl.appendChild(okBtn),
                (okBtn.onclick = () => {
                  void handleConfirm();
                }));
            }
          }
          (overlayEl.classList.remove('d-none'), document.body.classList.add('classic-alert-active'));
          if (didOpen) didOpen();
          timer &&
            setTimeout(() => {
              try {
                if (willClose) willClose();
              } catch (_0x2cc815) {
                console.error('[ClassicAlert] willClose failed:', _0x2cc815);
              }
              (closeClassicAlert(), resolve({ isConfirmed: ![], isDenied: ![], isDismissed: !![] }));
            }, timer);
        })
      );
    };
  (window.Swal
    ? ((window.Swal.fire = fire),
      (window.Swal.close = function () {
        closeClassicAlert();
        if (nativeSwalClose) nativeSwalClose.call(nativeSwal);
      }),
      (window.Swal.getPopup = function () {
        return document.querySelector('.classic-alert-box');
      }),
      (window.Swal.showLoading = function () {
        const _0xa41363 = document.getElementById('classic-alert-text');
        _0xa41363 &&
          !document.getElementById('classic-alert-overlay').classList.contains('d-none') &&
          !_0xa41363.querySelector('.classic-spinner') &&
          _0xa41363.insertAdjacentHTML(
            'beforeend',
            '<div class="classic-spinner" style="margin-top:10px; text-align:center;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>'
          );
      }),
      (window.Swal.getContainer = function () {
        return document.getElementById('classic-alert-overlay');
      }))
    : (window.Swal = {
        fire: fire,
        showLoading: function () {
          const _0x3946f6 = document.getElementById('classic-alert-text');
          _0x3946f6 &&
            !document.getElementById('classic-alert-overlay').classList.contains('d-none') &&
            !_0x3946f6.querySelector('.classic-spinner') &&
            _0x3946f6.insertAdjacentHTML(
              'beforeend',
              '<div class="classic-spinner" style="margin-top:10px; text-align:center;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>'
            );
        },
        close: function () {
          closeClassicAlert();
        },
        getContainer: function () {
          return document.getElementById('classic-alert-overlay');
        },
        getPopup: function () {
          return document.querySelector('.classic-alert-box');
        },
      }),
    (window.closeClassicAlert = function () {
      const overlay = document.getElementById('classic-alert-overlay');
      if (overlay) overlay.classList.add('d-none');
      document.body.classList.remove('classic-alert-active');
    }));
})();
