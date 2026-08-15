const crypto = require('crypto');

module.exports = {
  stringGen: function (len) {
    let text = '';
    const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < len; i++) text += charset.charAt(Math.floor(Math.random() * charset.length));
    return text;
  },
  randomInt: function (min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  },
  escapeHtml: function (str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  escapeRegex: function (str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
  hash: function (str) {
    return crypto.createHash('sha256').update(String(str)).digest('hex').substring(0, 16);
  },
  getBrowser: function (ua) {
    if (!ua) return 'Unknown';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
    return 'Other';
  },
  getOS: function (ua) {
    if (!ua) return 'Unknown';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Mac OS')) return 'Mac OS';
    return 'Other';
  },
  isSystemOrBrowserBlocked: function (state, data) {
    const ua = data.fp || '';
    const browser = this.getBrowser(ua);
    const os = this.getOS(ua);
    const bans = state.bans || {};
    const bb = bans.browsers || {};
    const bs = bans.systems || {};
    if (bb['browser_all'] === true) return false;
    if (bb['browser1'] === false && browser === 'Chrome') return 'Chrome';
    if (bb['browser2'] === false && browser === 'Firefox') return 'Firefox';
    if (bb['browser3'] === false && browser === 'Safari') return 'Safari';
    if (bb['browser4'] === false && browser === 'Opera') return 'Opera';
    if (bb['browser6'] === false && browser === 'Edge') return 'Edge';
    if (bs['system_all'] === true) return false;
    if (bs['system1'] === false && os === 'Windows') return 'Windows';
    if (bs['system2'] === false && os === 'Linux') return 'Linux';
    if (bs['system3'] === false && os === 'Android') return 'Android';
    if (bs['system4'] === false && os === 'iOS') return 'iOS';
    if (bs['system5'] === false && os === 'Mac OS') return 'Mac OS';
    return null;
  },
  // Validate a file's magic bytes against the declared extension.
  // Returns true when the content signature matches (or unknown-but-safe for text-like types).
  sniffExt: function (buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'mp4'; // ....ftyp
    if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'webm'; // EBML
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3'; // ID3
    if (buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg'; // OggS
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) return 'wav'; // RIFF....WAVE
    return null;
  },
};
