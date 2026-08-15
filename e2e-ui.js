const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9238;
const PROFILE = 'C:/Users/Kaz/AppData/Local/Temp/opencode/chrome-modern';
const BASE = 'http://localhost:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}
function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  return new Promise((res, rej) => {
    ws.onopen = () => {
      let id = 0; const p = new Map(); const logs = [];
      ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && p.has(m.id)) { const { r, j } = p.get(m.id); p.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); }
        else if (m.method === 'Runtime.consoleAPICalled') {
          const a = (m.params.args || []).map(x => x.value ?? x.description ?? '').join(' ');
          if (m.params.type === 'error' || a.includes('[init]') || a.includes('[Landing]') || a.includes('[Main]')) logs.push('[' + m.params.type + '] ' + a.slice(0, 300));
        } else if (m.method === 'Runtime.exceptionThrown') {
          const d = m.params.exceptionDetails;
          logs.push('[EXC] ' + (d.exception ? d.exception.description : d.text).slice(0, 400) + ' @' + (d.url || '') + ':' + d.lineNumber);
        }
      };
      res({
        logs,
        send(method, params = {}) { return new Promise((r, j) => { const mid = ++id; p.set(mid, { r, j }); ws.send(JSON.stringify({ id: mid, method, params })); }); }
      });
    };
    ws.onerror = rej;
  });
}

(async () => {
  const uname = 'ui_' + Date.now().toString(36).slice(-6);
  const pass = 'pass1234';
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 30; i++) { try { await getJson(`http://localhost:${PORT}/json/version`); break; } catch (e) { await sleep(500); } }

  const list = await getJson(`http://localhost:${PORT}/json/list`);
  const cdp = await cdpClient(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: BASE + '/' });
  await sleep(8000);

  async function evalJs(expr) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return r && r.result && r.result.value;
  }

  // 1. Check login overlay rendered
  const loginOverlayVisible = await evalJs(`(() => { const o = document.getElementById('login-overlay'); return !!o && !o.classList.contains('d-none'); })()`);
  console.log('login-overlay visible:', loginOverlayVisible);

  // 2. Switch to register form
  await evalJs(`document.getElementById('show-register').click()`);
  await sleep(500);

  // 3. Fill register form
  await evalJs(`document.getElementById('register-username').value = ${JSON.stringify(uname)}; document.getElementById('register-password').value = ${JSON.stringify(pass)};`);
  await evalJs(`document.getElementById('register-btn').click()`);
  await sleep(3000);

  // 4. Check if chat shell became visible
  const chatVisible = await evalJs(`(() => { const c = document.getElementById('chat-shell'); return !!c && !c.classList.contains('d-none'); })()`);
  console.log('chat-shell visible after register:', chatVisible);

  // 5. Check socket connected
  const sockConnected = await evalJs(`window.socket ? window.socket.connected : false`);
  console.log('socket connected:', sockConnected);

  // 6. Check messages-container has content / input exists
  const inputPresent = await evalJs(`!!document.getElementById('chat-input')`);
  console.log('chat-input present:', inputPresent);

  // 7. Try sending a message
  await evalJs(`(() => { const i = document.getElementById('chat-input'); if (i) { i.value = 'مرحبا من اختبار واجهة المستخدم'; i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await sleep(300);
  const sent = await evalJs(`(() => { const f = document.querySelector('#chat-shell form'); if (f) { f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return true; } return false; })()`);
  console.log('message form submitted:', sent);
  await sleep(2000);

  const msgCount = await evalJs(`document.querySelectorAll('#messages-container .message-row').length`);
  console.log('message rows rendered:', msgCount);

  console.log('\n=== CONSOLE / JS ERRORS ===');
  console.log(JSON.stringify(cdp.logs, null, 2));

  chrome.kill();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); try { process.exit(1); } catch (_) { } });
