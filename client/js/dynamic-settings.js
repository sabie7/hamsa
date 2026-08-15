(function() {
  // Helper functions for cleaner organization
  const applyColors = (config) => {
    if (config.primaryColor) document.documentElement.style.setProperty('--primary-color', config.primaryColor);
    if (config.buttonColor) document.documentElement.style.setProperty('--button-color', config.buttonColor);
    if (config.textColor) document.documentElement.style.setProperty('--text-color', config.textColor);
  };

  const applyImages = (config) => {
    // Handle Logo/Favicon
    const logo = document.getElementById('site-logo');
    if (logo) {
      if (config.showFavicon === 'false' || config.showFavicon === false) {
        logo.style.display = 'none';
      } else if (config.faviconUrl) {
        if (logo.tagName === 'IMG') {
          logo.src = config.faviconUrl;
        } else {
          const img = document.createElement('img');
          img.id = 'site-logo';
          img.src = config.faviconUrl;
          img.className = logo.className;
          img.style.cssText = logo.style.cssText;
          img.setAttribute('referrerPolicy', 'origin-when-cross-origin');
          img.setAttribute('loading', 'lazy');
          logo.replaceWith(img);
        }
      }
    }

    // Handle Banner
    const banner = document.querySelector('.site-banner');
    if (banner) {
      if (config.showBanner === 'false' || config.showBanner === false) {
        banner.style.display = 'none';
      } else if (config.bannerUrl) {
        banner.src = config.bannerUrl;
      }
    }
  };

  // Main initialization
  document.addEventListener('DOMContentLoaded', () => {
    const config = window.domainConfig;
    if (!config || Object.keys(config).length === 0) return;

    applyColors(config);
    applyImages(config);
  });
})();
