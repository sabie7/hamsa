// Classic Alert Override
(function() {
  const secureCreateElement = window.secureCreateElement || function(tagName, attributes = {}, textContent = null) {
    const el = document.createElement(tagName);
    for (const [key, val] of Object.entries(attributes)) {
      if (key === 'class') el.className = val;
      else if (key === 'style') el.style.cssText = val;
      else el.setAttribute(key, val);
    }
    if (textContent !== null) el.textContent = textContent;
    return el;
  };

  function injectAlertHtml() {
    if (document.getElementById('classic-alert-overlay')) return;
    
    const alertHtml = `
      <div id="classic-alert-overlay" class="classic-alert-overlay d-none">
        <div class="classic-alert-box">
          <div class="classic-alert-header" id="classic-alert-title"> تنبيه </div>
          <div class="classic-alert-body" id="classic-alert-text"></div>
          <div class="classic-alert-buttons" id="classic-alert-buttons"></div>
        </div>
      </div>
    `;
    
    if (document.body) {
      document.body.insertAdjacentHTML('beforeend', alertHtml);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.insertAdjacentHTML('beforeend', alertHtml);
      });
    }
  }

  // Inject as soon as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAlertHtml);
  } else {
    injectAlertHtml();
  }

  // Override Swal immediately
  const originalSwal = window.Swal;
  const originalFire = window.Swal ? window.Swal.fire : null;
  const originalClose = window.Swal ? window.Swal.close : null;
  const originalShowLoading = window.Swal ? window.Swal.showLoading : null;
  
  const customFire = function(...args) {
    // Ensure HTML is injected
    injectAlertHtml();

    // Close original Swal if it's open to prevent overlapping/lingering spinners
    if (originalClose) {
      originalClose.call(originalSwal);
    }

    return new Promise((resolve) => {
      let title = 'عذراً';
      let text = '';
      let showCancel = false;
      let showDeny = false;
      let confirmText = 'موافق';
      let cancelText = 'إلغاء';
      let denyText = 'رفض';
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
        const options = args[0];
        // We now intercept even toasts to provide a consistent "classic" experience as requested by the user
        // if (options.toast && originalFire) {
        //   return originalFire.apply(originalSwal, args).then(resolve);
        // }
        title = options.title !== undefined ? options.title : title;
        text = options.text || options.html || '';
        showCancel = options.showCancelButton || false;
        showDeny = options.showDenyButton || false;
        confirmText = options.confirmButtonText || confirmText;
        cancelText = options.cancelButtonText || cancelText;
        denyText = options.denyButtonText || denyText;
        didOpen = options.didOpen || null;
        timer = options.timer || null;
        showConfirmButton = options.showConfirmButton !== false;
        input = options.input || null;
        inputOptions = options.inputOptions || null;
        inputPlaceholder = options.inputPlaceholder || '';
        inputValidator = options.inputValidator || null;
        icon = options.icon || null;
        inputValue = options.inputValue || '';
        preConfirm = typeof options.preConfirm === 'function' ? options.preConfirm : null;
        willClose = typeof options.willClose === 'function' ? options.willClose : null;
        
        // Custom background and size style
        const alertBox = document.querySelector('.classic-alert-box');
        if (alertBox) {
            if (options.background) {
                alertBox.style.background = options.background;
            } else {
                alertBox.style.background = ''; // reset to default css
            }
            if (options.width) {
                alertBox.style.width = options.width;
            } else {
                alertBox.style.width = ''; // reset to default css
            }
            if (options.maxWidth) {
                alertBox.style.maxWidth = options.maxWidth;
            } else {
                alertBox.style.maxWidth = ''; // reset to default css
            }
        }
      } else {
        title = args[0] !== undefined ? args[0] : title;
        text = args[1] || '';
        icon = args[2] || null;
      }

      // Normalize/split long titles into body text if body text is empty to ensure clean visual styling
      if (title && !text) {
        const origTitle = title;
        if (origTitle.startsWith('تمت الموافقة')) {
          title = 'تمت الموافقة';
          text = origTitle;
        } else if (origTitle.startsWith('تم رفض')) {
          title = 'تم الرفض';
          text = origTitle;
        } else if (origTitle.startsWith('تم حذف')) {
          title = 'تم الحذف';
          text = origTitle;
        } else if (origTitle.startsWith('تم')) {
          title = 'نجاح';
          text = origTitle;
        } else if (origTitle.startsWith('فشل')) {
          title = 'فشل الإجراء';
          text = origTitle;
        } else if (origTitle.startsWith('حدث خطأ') || origTitle.startsWith('خطأ')) {
          title = 'عذراً';
          text = origTitle;
        } else if (origTitle.startsWith('عذراً') || origTitle.startsWith('عذرا')) {
          title = 'عذراً';
          text = origTitle;
        } else if (origTitle.length > 15) {
          title = icon === 'success' ? 'نجاح' : (icon === 'error' ? 'عذراً' : (icon === 'warning' ? 'عذراً' : 'تنبيه'));
          text = origTitle;
        }
      }

      if (title === 'خطأ') {
        title = 'عذراً';
      }

      const titleEl = document.getElementById('classic-alert-title');
      const textEl = document.getElementById('classic-alert-text');
      const overlayEl = document.getElementById('classic-alert-overlay');
      const buttonsContainer = document.getElementById('classic-alert-buttons');

      if (!titleEl || !textEl || !overlayEl || !buttonsContainer) {
        // Fallback to original if DOM elements not ready
        if (originalFire) {
          return originalFire.apply(originalSwal, args).then(resolve);
        }
        return resolve({ isConfirmed: true });
      }

      if (title) {
        titleEl.textContent = title;
        titleEl.style.display = 'block';
        
        // Reset classes and apply icon-based class
        titleEl.className = 'classic-alert-header';
        if (icon === 'error') {
          titleEl.classList.add('classic-alert-header-error');
        } else if (icon === 'success') {
          titleEl.classList.add('classic-alert-header-success');
        } else if (icon === 'warning') {
          titleEl.classList.add('classic-alert-header-warning');
        } else if (icon === 'question') {
          titleEl.classList.add('classic-alert-header-question');
        }
      } else {
        titleEl.style.display = 'none';
      }
      
      textEl.innerHTML = ''; // Clear existing
      
      const contentWrapper = document.createElement('div');
      contentWrapper.style.marginBottom = '10px';
      
      if (typeof args[0] === 'object' && args[0].html) {
        // If HTML is explicitly provided in options, render it
        contentWrapper.innerHTML = args[0].html;
      } else {
        // Otherwise, use secure text content
        contentWrapper.textContent = text;
      }
      
      textEl.appendChild(contentWrapper);
      
      if (input === 'select' && inputOptions) {
        const wrapper = secureCreateElement('div', { style: 'margin-top: 15px;' });
        const select = secureCreateElement('select', { 
            id: 'classic-alert-input', 
            style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px;' 
        });
        
        const placeholderOption = secureCreateElement('option', { value: '', disabled: 'disabled', selected: 'selected' }, inputPlaceholder);
        select.appendChild(placeholderOption);

        for (const [val, label] of Object.entries(inputOptions)) {
          const option = secureCreateElement('option', { value: val }, label);
          select.appendChild(option);
        }
        wrapper.appendChild(select);
        textEl.appendChild(wrapper);
      } else if (input === 'text') {
        const wrapper = secureCreateElement('div', { style: 'margin-top: 15px;' });
        const inputEl = secureCreateElement('input', { 
            type: 'text', 
            id: 'classic-alert-input', 
            style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px;',
            placeholder: inputPlaceholder
        });
        wrapper.appendChild(inputEl);
        textEl.appendChild(wrapper);
      } else if (input === 'textarea') {
        const wrapper = secureCreateElement('div', { style: 'margin-top: 15px;' });
        const textareaEl = secureCreateElement('textarea', { 
            id: 'classic-alert-input', 
            style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px; direction: rtl;',
            placeholder: inputPlaceholder,
            rows: '4'
        });
        wrapper.appendChild(textareaEl);
        textEl.appendChild(wrapper);
      }

      if (input && inputValue) {
        const inputEl = document.getElementById('classic-alert-input');
        if (inputEl) inputEl.value = inputValue;
      }

      const handleConfirm = async () => {
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
                style: 'color: red; margin-top: 10px; font-size: 0.9rem;'
              });
              textEl.appendChild(errorEl);
            }

            errorEl.textContent = error;
            return;
          }
        }

        if (preConfirm) {
          try {
            const preConfirmValue = await preConfirm(value);

            if (preConfirmValue === false) {
              return;
            }

            // إن أعادت preConfirm قيمة محددة، استخدمها كقيمة نهائية.
            if (preConfirmValue !== undefined) {
              value = preConfirmValue;
            }
          } catch (error) {
            console.error('[ClassicAlert] preConfirm failed:', error);
            return;
          }
        }

        try {
          if (willClose) willClose();
        } catch (error) {
          console.error('[ClassicAlert] willClose failed:', error);
        }

        closeClassicAlert();

        resolve({
          isConfirmed: true,
          isDenied: false,
          isDismissed: false,
          value
        });
      };

      const handleDeny = async () => {
        if (preConfirm) {
          try {
            const preConfirmValue = await preConfirm('reject');
            if (preConfirmValue === false) return;
          } catch (error) {
            console.error('[ClassicAlert] preConfirm failed:', error);
            return;
          }
        }

        try {
          if (willClose) willClose();
        } catch (error) {
          console.error('[ClassicAlert] willClose failed:', error);
        }

        closeClassicAlert();

        resolve({
          isConfirmed: false,
          isDenied: true,
          isDismissed: false,
          value: 'reject'
        });
      };

      if (!showConfirmButton && !showCancel && !showDeny) {
        buttonsContainer.innerHTML = '';
      } else if (showCancel || showDeny) {
        buttonsContainer.innerHTML = '';
        if (showConfirmButton) {
          const btnConfirm = secureCreateElement('button', { class: 'btn btn-sm btn-dark px-3 mx-1', id: 'classic-btn-confirm' }, confirmText);
          buttonsContainer.appendChild(btnConfirm);
          btnConfirm.onclick = () => { void handleConfirm(); };
        }
        if (showDeny) {
          const btnDeny = secureCreateElement('button', { class: 'btn btn-sm btn-danger px-3 mx-1', id: 'classic-btn-deny' }, denyText);
          buttonsContainer.appendChild(btnDeny);
          btnDeny.onclick = () => { void handleDeny(); };
        }
        if (showCancel) {
          const btnCancel = secureCreateElement('button', { class: 'btn btn-sm btn-secondary px-3 mx-1', id: 'classic-btn-cancel' }, cancelText);
          buttonsContainer.appendChild(btnCancel);
          btnCancel.onclick = () => {
            try {
              if (willClose) willClose();
            } catch (error) {
              console.error('[ClassicAlert] willClose failed:', error);
            }

            closeClassicAlert();

            resolve({
              isConfirmed: false,
              isDenied: false,
              isDismissed: true
            });
          };
        }
      } else {
        buttonsContainer.innerHTML = '';
        const btnOk = secureCreateElement('button', { class: 'btn btn-sm btn-dark px-4', id: 'classic-btn-ok' }, confirmText);
        buttonsContainer.appendChild(btnOk);
        
        btnOk.onclick = () => {
          void handleConfirm();
        };
      }
      
      overlayEl.classList.remove('d-none');
      document.body.classList.add('classic-alert-active');
      if (didOpen) didOpen();

      if (timer) {
        setTimeout(() => {
          try {
            if (willClose) willClose();
          } catch (error) {
            console.error('[ClassicAlert] willClose failed:', error);
          }
          closeClassicAlert();
          resolve({ isConfirmed: false, isDenied: false, isDismissed: true });
        }, timer);
      }
    });
  };

  if (window.Swal) {
    window.Swal.fire = customFire;
    window.Swal.close = function() {
      closeClassicAlert();
      if (originalClose) originalClose.call(originalSwal);
    };
    window.Swal.getPopup = function() { return document.querySelector('.classic-alert-box'); };
    window.Swal.showLoading = function() {
      // If we're using classic alerts, we might want to show a loading state in the classic box
      const textEl = document.getElementById('classic-alert-text');
      if (textEl && !document.getElementById('classic-alert-overlay').classList.contains('d-none')) {
        if (!textEl.querySelector('.classic-spinner')) {
          textEl.insertAdjacentHTML('beforeend', '<div class="classic-spinner" style="margin-top:10px; text-align:center;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>');
        }
      }
      // Do NOT call originalShowLoading here as it triggers the standard SweetAlert UI
      // which appears behind our classic alert.
    };
    window.Swal.getContainer = function() { return document.getElementById('classic-alert-overlay'); };
  } else {
    window.Swal = {
      fire: customFire,
      showLoading: function() {
        const textEl = document.getElementById('classic-alert-text');
        if (textEl && !document.getElementById('classic-alert-overlay').classList.contains('d-none')) {
          if (!textEl.querySelector('.classic-spinner')) {
            textEl.insertAdjacentHTML('beforeend', '<div class="classic-spinner" style="margin-top:10px; text-align:center;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>');
          }
        }
      },
      close: function() { closeClassicAlert(); },
      getContainer: function() { return document.getElementById('classic-alert-overlay'); },
      getPopup: function() { return document.querySelector('.classic-alert-box'); }
    };
  }

  window.closeClassicAlert = function() {
    const overlay = document.getElementById('classic-alert-overlay');
    if (overlay) overlay.classList.add('d-none');
    document.body.classList.remove('classic-alert-active');
  };
})();

