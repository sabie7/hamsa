/**
 * Classic Alert
 *
 * SweetAlert2-compatible alert driven by a custom overlay, used instead of the
 * CDN SweetAlert2 popup. Patches `window.Swal` (fire / close / getPopup /
 * showLoading / getContainer) and exposes `window.closeClassicAlert`.
 *
 * Refactored from the deobfuscated `scraped_decoded/js-classic-alert.js`.
 * Behavioral contract (SweetAlert2 API subset) is preserved as-is.
 */

const OVERLAY_HTML = `
      <div id="classic-alert-overlay" class="classic-alert-overlay d-none">
        <div class="classic-alert-box">
          <div class="classic-alert-header" id="classic-alert-title"> تنبيه </div>
          <div class="classic-alert-body" id="classic-alert-text"></div>
          <div class="classic-alert-buttons" id="classic-alert-buttons"></div>
        </div>
      </div>
    `;

const SPINNER_HTML = '<div class="classic-spinner" style="margin-top:10px; text-align:center;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>';

function secureCreateElement(tagName, attributes = {}, textContent = null) {
  const el = document.createElement(tagName);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') {
      el.className = value;
    } else if (key === 'style') {
      el.style.cssText = value;
    } else {
      el.setAttribute(key, value);
    }
  }
  if (textContent !== null) {
    el.textContent = textContent;
  }
  return el;
}

function ensureOverlay() {
  if (document.getElementById('classic-alert-overlay')) return;
  if (document.body) {
    document.body.insertAdjacentHTML('beforeend', OVERLAY_HTML);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.insertAdjacentHTML('beforeend', OVERLAY_HTML);
    });
  }
}

function closeClassicAlert() {
  const overlay = document.getElementById('classic-alert-overlay');
  if (overlay) overlay.classList.add('d-none');
  document.body.classList.remove('classic-alert-active');
}

export function initClassicAlert() {
  ensureOverlay();

  const realSwal = window.Swal;
  const realFire = realSwal ? realSwal.fire : null;
  const realClose = realSwal ? realSwal.close : null;

  function fire(...args) {
    ensureOverlay();
    if (realClose) realClose.call(realSwal);

    return new Promise((resolve) => {
      let title = 'عذراً';
      let text = '';
      let showCancelButton = false;
      let showDenyButton = false;
      let confirmButtonText = 'موافق';
      let cancelButtonText = 'إلغاء';
      let denyButtonText = 'رفض';
      let didOpen = null;
      let timer = null;
      let showConfirmButton = true;
      let input = null;
      let inputOptions = null;
      let inputPlaceholder = '';
      let inputValidator = null;
      let icon = null;
      let inputValue = '';
      let preConfirm = null;
      let willClose = null;

      if (typeof args[0] === 'object') {
        const opts = args[0];
        if (opts.title !== undefined) title = opts.title;
        text = opts.text || opts.html || '';
        showCancelButton = opts.showCancelButton || false;
        showDenyButton = opts.showDenyButton || false;
        confirmButtonText = opts.confirmButtonText || confirmButtonText;
        cancelButtonText = opts.cancelButtonText || cancelButtonText;
        denyButtonText = opts.denyButtonText || denyButtonText;
        didOpen = opts.didOpen || null;
        timer = opts.timer || null;
        showConfirmButton = opts.showConfirmButton !== false;
        input = opts.input || null;
        inputOptions = opts.inputOptions || null;
        inputPlaceholder = opts.inputPlaceholder || '';
        inputValidator = opts.inputValidator || null;
        icon = opts.icon || null;
        inputValue = opts.inputValue || '';
        preConfirm = typeof opts.preConfirm === 'function' ? opts.preConfirm : null;
        willClose = typeof opts.willClose === 'function' ? opts.willClose : null;

        const box = document.querySelector('.classic-alert-box');
        if (box) {
          box.style.background = opts.background || '';
          box.style.width = opts.width || '';
          box.style.maxWidth = opts.maxWidth || '';
        }
      } else {
        if (args[0] !== undefined) title = args[0];
        text = args[1] || '';
        icon = args[2] || null;
      }

      if (title && !text) {
        if (title.startsWith('تمت الموافقة')) {
          title = 'تمت الموافقة';
          text = title;
        } else if (title.startsWith('تم رفض')) {
          title = 'تم الرفض';
          text = title;
        } else if (title.startsWith('تم حذف')) {
          title = 'تم الحذف';
          text = title;
        } else if (title.startsWith('تم')) {
          title = 'نجاح';
          text = title;
        } else if (title.startsWith('فشل')) {
          title = 'فشل الإجراء';
          text = title;
        } else if (title.startsWith('حدث خطأ')) {
          title = 'خطأ';
          text = title;
        } else if (title.length > 15) {
          title = icon === 'success' ? 'نجاح' : icon === 'error' ? 'خطأ' : 'تنبيه';
          text = title;
        }
      }

      const titleEl = document.getElementById('classic-alert-title');
      const textEl = document.getElementById('classic-alert-text');
      const overlay = document.getElementById('classic-alert-overlay');
      const buttonsEl = document.getElementById('classic-alert-buttons');

      if (!titleEl || !textEl || !overlay || !buttonsEl) {
        if (realFire) return realFire.apply(realSwal, args).then(resolve);
        return resolve({ isConfirmed: true });
      }

      if (title) {
        titleEl.textContent = title;
        titleEl.style.display = 'block';
        titleEl.className = 'classic-alert-header';
        if (icon === 'error') titleEl.classList.add('classic-alert-header-error');
        else if (icon === 'success') titleEl.classList.add('classic-alert-header-success');
        else if (icon === 'warning') titleEl.classList.add('classic-alert-header-warning');
        else if (icon === 'question') titleEl.classList.add('classic-alert-header-question');
      } else {
        titleEl.style.display = 'none';
      }

      textEl.innerHTML = '';
      const textWrap = document.createElement('div');
      textWrap.style.marginBottom = '10px';
      if (typeof args[0] === 'object' && args[0].html) {
        textWrap.innerHTML = args[0].html;
      } else {
        textWrap.textContent = text;
      }
      textEl.appendChild(textWrap);

      if (input === 'select' && inputOptions) {
        const wrap = secureCreateElement('div', { style: 'margin-top: 15px;' });
        const select = secureCreateElement('select', {
          id: 'classic-alert-input',
          style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px;',
        });
        const placeholder = secureCreateElement('option', { value: '', disabled: 'disabled', selected: 'selected' }, inputPlaceholder);
        select.appendChild(placeholder);
        for (const [value, label] of Object.entries(inputOptions)) {
          select.appendChild(secureCreateElement('option', { value }, label));
        }
        wrap.appendChild(select);
        textEl.appendChild(wrap);
      } else if (input === 'text') {
        const wrap = secureCreateElement('div', { style: 'margin-top: 15px;' });
        const inputEl = secureCreateElement('input', {
          type: 'text',
          id: 'classic-alert-input',
          style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px;',
          placeholder: inputPlaceholder,
        });
        wrap.appendChild(inputEl);
        textEl.appendChild(wrap);
      } else if (input === 'textarea') {
        const wrap = secureCreateElement('div', { style: 'margin-top: 15px;' });
        const inputEl = secureCreateElement('textarea', {
          id: 'classic-alert-input',
          style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px; direction: rtl;',
          placeholder: inputPlaceholder,
          rows: '4',
        });
        wrap.appendChild(inputEl);
        textEl.appendChild(wrap);
      }

      if (input && inputValue) {
        const inputEl = document.getElementById('classic-alert-input');
        if (inputEl) inputEl.value = inputValue;
      }

      const confirmFlow = async () => {
        let value = true;
        if (input) {
          const inputEl = document.getElementById('classic-alert-input');
          if (inputEl) value = inputEl.value;
        }
        if (inputValidator) {
          const error = inputValidator(value);
          if (error) {
            let errorEl = document.getElementById('classic-alert-error');
            if (!errorEl) {
              errorEl = secureCreateElement('div', {
                id: 'classic-alert-error',
                style: 'color: red; margin-top: 10px; font-size: 0.9rem;',
              });
              textEl.appendChild(errorEl);
            }
            errorEl.textContent = error;
            return;
          }
        }
        if (preConfirm) {
          try {
            const result = await preConfirm(value);
            if (result === false) return;
            if (result !== undefined) value = result;
          } catch (err) {
            console.error('[ClassicAlert] preConfirm failed:', err);
            return;
          }
        }
        try {
          if (willClose) willClose();
        } catch (err) {
          console.error('[ClassicAlert] willClose failed:', err);
        }
        closeClassicAlert();
        resolve({ isConfirmed: true, isDenied: false, isDismissed: false, value });
      };

      const denyFlow = async () => {
        if (preConfirm) {
          try {
            const result = await preConfirm('reject');
            if (result === false) return;
          } catch (err) {
            console.error('[ClassicAlert] preConfirm failed:', err);
            return;
          }
        }
        try {
          if (willClose) willClose();
        } catch (err) {
          console.error('[ClassicAlert] willClose failed:', err);
        }
        closeClassicAlert();
        resolve({ isConfirmed: false, isDenied: true, isDismissed: false, value: 'reject' });
      };

      buttonsEl.innerHTML = '';
      if (!showConfirmButton && !showCancelButton && !showDenyButton) {
        // no buttons at all
      } else if (showCancelButton || showDenyButton) {
        if (showConfirmButton) {
          const confirmBtn = secureCreateElement('button', { class: 'btn btn-sm btn-dark px-3 mx-1', id: 'classic-btn-confirm' }, confirmButtonText);
          confirmBtn.onclick = () => { void confirmFlow(); };
          buttonsEl.appendChild(confirmBtn);
        }
        if (showDenyButton) {
          const denyBtn = secureCreateElement('button', { class: 'btn btn-sm btn-danger px-3 mx-1', id: 'classic-btn-deny' }, denyButtonText);
          denyBtn.onclick = () => { void denyFlow(); };
          buttonsEl.appendChild(denyBtn);
        }
        if (showCancelButton) {
          const cancelBtn = secureCreateElement('button', { class: 'btn btn-sm btn-secondary px-3 mx-1', id: 'classic-btn-cancel' }, cancelButtonText);
          cancelBtn.onclick = () => {
            try {
              if (willClose) willClose();
            } catch (err) {
              console.error('[ClassicAlert] willClose failed:', err);
            }
            closeClassicAlert();
            resolve({ isConfirmed: false, isDenied: false, isDismissed: true });
          };
          buttonsEl.appendChild(cancelBtn);
        }
      } else {
        const okBtn = secureCreateElement('button', { class: 'btn btn-sm btn-dark px-4', id: 'classic-btn-ok' }, confirmButtonText);
        okBtn.onclick = () => { void confirmFlow(); };
        buttonsEl.appendChild(okBtn);
      }

      overlay.classList.remove('d-none');
      document.body.classList.add('classic-alert-active');
      if (didOpen) didOpen();
      if (timer) {
        setTimeout(() => {
          try {
            if (willClose) willClose();
          } catch (err) {
            console.error('[ClassicAlert] willClose failed:', err);
          }
          closeClassicAlert();
          resolve({ isConfirmed: false, isDenied: false, isDismissed: true });
        }, timer);
      }
    });
  }

  if (window.Swal) {
    window.Swal.fire = fire;
    window.Swal.close = function () {
      closeClassicAlert();
      if (realClose) realClose.call(realSwal);
    };
    window.Swal.getPopup = function () {
      return document.querySelector('.classic-alert-box');
    };
    window.Swal.showLoading = function () {
      const textEl = document.getElementById('classic-alert-text');
      if (textEl && !document.getElementById('classic-alert-overlay').classList.contains('d-none') && !textEl.querySelector('.classic-spinner')) {
        textEl.insertAdjacentHTML('beforeend', SPINNER_HTML);
      }
    };
    window.Swal.getContainer = function () {
      return document.getElementById('classic-alert-overlay');
    };
  } else {
    window.Swal = {
      fire,
      showLoading: function () {
        const textEl = document.getElementById('classic-alert-text');
        if (textEl && !document.getElementById('classic-alert-overlay').classList.contains('d-none') && !textEl.querySelector('.classic-spinner')) {
          textEl.insertAdjacentHTML('beforeend', SPINNER_HTML);
        }
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
    };
  }

  window.closeClassicAlert = closeClassicAlert;
}
