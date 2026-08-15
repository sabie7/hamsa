const http = require('http');
const { io } = require('socket.io-client');
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname: 'localhost', port: 3000, path, method, headers: {} };
    if (body) opts.headers['Content-Type'] = 'application/json';
    const r = http.request(opts, (res) => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(b||'{}')})}catch(e){resolve({status:res.statusCode,body:{raw:b}})}}); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const mk = (n) => 'g'+Math.floor(Math.random()*1e5)+n;
(async () => {
  const guest = await req('POST','/api/auth/guest',{nickname:mk('g'),fp:'fptest',clientSessionId:'csg_'+mk('')});
  console.log('guest register:', guest.status, 'user.type=', guest.body.user && guest.body.user.type, 'tokenLen=', (guest.body.token||'').length);

  // Guest socket connects exactly like client: socket.auth = { token, clientSessionId }
  const g = io('http://localhost:3000',{auth:{token:guest.body.token, clientSessionId:'csg_'+mk('')}, transports:['websocket'], reconnection:false});
  g.on('connect', ()=>console.log('GUEST connected'));
  g.on('connect_error', e=>console.log('GUEST connect_error:', e.message));
  g.on('disconnect', (r)=>console.log('GUEST disconnect reason:', r));
  g.on('duplicate-session', d=>console.log('GUEST duplicate-session:', JSON.stringify(d)));
  g.on('error', e=>console.log('GUEST error:', JSON.stringify(e)));

  // Member joins after guest
  setTimeout(async ()=>{
    const mem = await req('POST','/api/auth/register',{username:mk('m'),password:'x'});
    const m = io('http://localhost:3000',{auth:{token:mem.body.token, clientSessionId:'csm_'+mk('')}, transports:['websocket'], reconnection:false});
    m.on('connect', ()=>console.log('MEMBER connected'));
    m.on('connect_error', e=>console.log('MEMBER connect_error:', e.message));
    m.on('disconnect', r=>console.log('MEMBER disconnect reason:', r));
  }, 2000);

  setTimeout(()=>process.exit(0), 6000);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});