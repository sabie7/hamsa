const helpers = require('../../../src/utils/helpers');

describe('helpers', function () {
  describe('stringGen', function () {
    it('generates a string of the requested length', function () {
      expect(helpers.stringGen(10)).toHaveLength(10);
      expect(helpers.stringGen(177)).toHaveLength(177);
    });

    it('only uses lowercase alphanumerics', function () {
      const s = helpers.stringGen(100);
      expect(s).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe('randomInt', function () {
    it('returns a number inside [min, max)', function () {
      for (let i = 0; i < 200; i++) {
        const n = helpers.randomInt(5, 10);
        expect(n).toBeGreaterThanOrEqual(5);
        expect(n).toBeLessThan(10);
      }
    });
  });

  describe('escapeHtml', function () {
    it('escapes the five dangerous characters', function () {
      expect(helpers.escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;');
    });

    it('returns an empty string for falsy input', function () {
      expect(helpers.escapeHtml(null)).toBe('');
      expect(helpers.escapeHtml(undefined)).toBe('');
      expect(helpers.escapeHtml('')).toBe('');
    });

    it('coerces non-strings', function () {
      expect(helpers.escapeHtml(5)).toBe('5');
    });
  });

  describe('escapeRegex', function () {
    it('escapes regex metacharacters', function () {
      expect(helpers.escapeRegex('a.b*c')).toBe('a\\.b\\*c');
      expect(new RegExp(helpers.escapeRegex('(x)')).test('(x)')).toBe(true);
    });
  });

  describe('hash', function () {
    it('is deterministic and 16 chars long', function () {
      const h1 = helpers.hash('hello');
      const h2 = helpers.hash('hello');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(16);
      expect(helpers.hash('world')).not.toBe(h1);
    });
  });

  describe('getBrowser / getOS', function () {
    it('classifies browsers', function () {
      expect(helpers.getBrowser('Mozilla/5.0 Chrome/120.0')).toBe('Chrome');
      expect(helpers.getBrowser('Firefox/115.0')).toBe('Firefox');
      expect(helpers.getBrowser('Version/16.0 Safari/605.1')).toBe('Safari');
      expect(helpers.getBrowser('Chrome Edg/120.0')).toBe('Edge');
      expect(helpers.getBrowser('OPR/95.0')).toBe('Opera');
      expect(helpers.getBrowser('')).toBe('Unknown');
      expect(helpers.getBrowser(null)).toBe('Unknown');
    });

    it('classifies operating systems', function () {
      expect(helpers.getOS('Windows NT 10.0')).toBe('Windows');
      expect(helpers.getOS('Android 13')).toBe('Android');
      expect(helpers.getOS('iPhone; CPU iPhone OS 16')).toBe('iOS');
      expect(helpers.getOS('X11; Linux x86_64')).toBe('Linux');
      expect(helpers.getOS('Macintosh; Intel Mac OS X 10_15')).toBe('Mac OS');
      expect(helpers.getOS(null)).toBe('Unknown');
    });
  });

  describe('isSystemOrBrowserBlocked', function () {
    let state;

    beforeEach(function () {
      state = { bans: { browsers: {}, systems: {} } };
    });

    it('returns null when nothing is blocked', function () {
      expect(helpers.isSystemOrBrowserBlocked(state, { fp: 'Chrome Windows' })).toBeNull();
    });

    it('blocks a specific browser when disabled', function () {
      state.bans.browsers.browser1 = false; // Chrome
      expect(helpers.isSystemOrBrowserBlocked(state, { fp: 'Chrome/120' })).toBe('Chrome');
      expect(helpers.isSystemOrBrowserBlocked(state, { fp: 'Firefox/115' })).toBeNull();
    });

    it('blocks a specific OS when disabled', function () {
      state.bans.systems.system1 = false; // Windows
      expect(helpers.isSystemOrBrowserBlocked(state, { fp: 'Windows NT 10.0' })).toBe('Windows');
      expect(helpers.isSystemOrBrowserBlocked(state, { fp: 'Linux' })).toBeNull();
    });

    it('browser_all === true disables browser blocking', function () {
      state.bans.browsers.browser_all = true;
      state.bans.browsers.browser1 = false;
      expect(helpers.isSystemOrBrowserBlocked(state, { fp: 'Chrome/120' })).toBe(false);
    });

    it('system_all === true disables system blocking', function () {
      state.bans.systems.system_all = true;
      state.bans.systems.system1 = false;
      expect(helpers.isSystemOrBrowserBlocked(state, { fp: 'Windows NT 10.0' })).toBe(false);
    });
  });

  describe('sniffExt', function () {
    function buf(bytes) { return Buffer.from(bytes); }

    it('returns null for buffers shorter than 12 bytes', function () {
      expect(helpers.sniffExt(Buffer.alloc(4))).toBeNull();
      expect(helpers.sniffExt(null)).toBeNull();
    });

    it('detects jpg', function () {
      expect(helpers.sniffExt(buf([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpg');
    });

    it('detects png', function () {
      expect(helpers.sniffExt(buf([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('png');
    });

    it('detects gif', function () {
      expect(helpers.sniffExt(buf([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('gif');
    });

    it('detects webp', function () {
      expect(helpers.sniffExt(buf([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('webp');
    });

    it('detects mp4', function () {
      expect(helpers.sniffExt(buf([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]))).toBe('mp4');
    });

    it('detects webm', function () {
      expect(helpers.sniffExt(buf([0x1A, 0x45, 0xDF, 0xA3, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('webm');
    });

    it('detects mp3', function () {
      expect(helpers.sniffExt(buf([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('mp3');
    });

    it('detects ogg', function () {
      expect(helpers.sniffExt(buf([0x4F, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('ogg');
    });

    it('detects wav', function () {
      expect(helpers.sniffExt(buf([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBe('wav');
    });

    it('returns null for unknown signatures', function () {
      expect(helpers.sniffExt(buf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
    });
  });
});
