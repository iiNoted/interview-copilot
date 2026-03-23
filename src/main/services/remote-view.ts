import { createServer, IncomingMessage, ServerResponse } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { networkInterfaces } from 'os'
import { randomBytes } from 'crypto'
import type { Socket } from 'net'

interface RemoteViewState {
  transcript: string[]
  detectedQuestions: Array<{
    id: string
    question: string
    timestamp: number
    response: string
    isStreaming: boolean
  }>
  isTranscribing: boolean
  currentModel: string
  resumeFilename: string | null
  jobFilename: string | null
  mode: string
}

let httpServer: ReturnType<typeof createServer> | null = null
let wss: WebSocketServer | null = null
let authToken: string | null = null
let currentState: RemoteViewState | null = null
let serverPort: number = 18791

export function generateAuthToken(): string {
  return randomBytes(32).toString('hex')
}

export function getLocalIpAddress(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return '127.0.0.1'
}

export function startRemoteViewServer(port: number, token: string): { url: string } {
  if (httpServer) stopRemoteViewServer()

  authToken = token
  serverPort = port
  const ip = getLocalIpAddress()

  httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?'))) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:"
      })
      res.end(getClientHtml())
      return
    }
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`)
    const clientToken = url.searchParams.get('token')

    if (clientToken !== authToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss!.handleUpgrade(request, socket, head, (ws) => {
      wss!.emit('connection', ws)
    })
  })

  wss.on('connection', (ws: WebSocket) => {
    // Send current state immediately
    if (currentState) {
      ws.send(JSON.stringify({ type: 'state', data: currentState }))
    }
  })

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Remote view server listening on http://${ip}:${port}`)
  })

  return { url: `http://${ip}:${port}` }
}

export function stopRemoteViewServer(): void {
  if (wss) {
    wss.clients.forEach((client) => client.close())
    wss.close()
    wss = null
  }
  if (httpServer) {
    httpServer.close()
    httpServer = null
  }
  currentState = null
}

export function broadcastState(state: RemoteViewState): void {
  currentState = state
  if (!wss) return

  const payload = JSON.stringify({ type: 'state', data: state })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  })
}

export function getRemoteViewStatus(): {
  running: boolean
  url: string | null
  connectedClients: number
  token: string | null
} {
  const ip = getLocalIpAddress()
  return {
    running: !!httpServer,
    url: httpServer ? `http://${ip}:${serverPort}` : null,
    connectedClients: wss ? wss.clients.size : 0,
    token: authToken
  }
}

function getClientHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>Interview Copilot</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#121620;color:rgba(255,255,255,.85);min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
.header{position:sticky;top:0;z-index:10;padding:12px 16px;background:#151a24;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between}
.header h1{font-size:13px;font-weight:600;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.06em}
.status{display:flex;align-items:center;gap:8px}
.status-text{font-size:11px;color:rgba(255,255,255,.4)}
.dot{width:8px;height:8px;border-radius:50%}
.dot.on{background:#4ade80}
.dot.off{background:#ef4444;animation:pulse 2s infinite}
.section{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.05)}
.section-title{font-size:11px;font-weight:600;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.live-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse 1.5s infinite}
.t-line{font-size:14px;line-height:1.6;color:rgba(255,255,255,.7);padding:2px 0}
.t-line.sys{color:rgba(255,255,255,.3);font-style:italic;font-size:12px}
.q-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;margin-bottom:12px;overflow:hidden}
.q-head{padding:10px 14px;font-size:13px;font-weight:500;color:#fde047}
.q-body{padding:10px 14px;border-top:1px solid rgba(255,255,255,.05);font-size:13px;line-height:1.7;color:rgba(255,255,255,.8);white-space:pre-wrap}
.q-body strong{color:#93c5fd}
.cursor{display:inline-block;width:6px;height:14px;background:#60a5fa;border-radius:2px;animation:blink .8s infinite;vertical-align:text-bottom;margin-left:2px}
.meta{padding:8px 16px;font-size:11px;color:rgba(255,255,255,.25);display:flex;justify-content:space-between}
.empty{text-align:center;padding:60px 20px;color:rgba(255,255,255,.15)}
.empty p{font-size:14px;margin-top:8px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
</style>
</head>
<body>
<div class="header">
  <h1>Interview Copilot</h1>
  <div class="status">
    <span id="st" class="status-text">Connecting...</span>
    <div id="sd" class="dot off"></div>
  </div>
</div>
<div id="c"><div class="empty"><p>Connecting to Interview Copilot...</p></div></div>
<div class="meta"><span id="mm"></span><span id="md"></span></div>
<script>
var P=new URLSearchParams(location.search),T=P.get('token');
if(!T)document.getElementById('c').innerHTML='<div class="empty"><p>Missing auth token. Copy the URL from Settings.</p></div>';
var ws,rt,rd=1000;
function conn(){
  if(!T)return;
  var p=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(p+'//'+location.host+'/?token='+T);
  ws.onopen=function(){
    document.getElementById('sd').className='dot on';
    document.getElementById('st').textContent='Connected';
    rd=1000;
  };
  ws.onmessage=function(e){
    try{var m=JSON.parse(e.data);if(m.type==='state')render(m.data)}catch(x){}
  };
  ws.onclose=function(){
    document.getElementById('sd').className='dot off';
    document.getElementById('st').textContent='Reconnecting...';
    sched();
  };
  ws.onerror=function(){ws.close()};
}
function sched(){
  if(rt)return;
  rt=setTimeout(function(){rt=null;rd=Math.min(rd*1.5,10000);conn()},rd);
}
function render(s){
  var h='';
  h+='<div class="section"><div class="section-title">';
  if(s.isTranscribing)h+='<span class="live-dot"></span> Live Transcript';
  else h+='Transcript';
  h+='</div>';
  if(!s.transcript||!s.transcript.length){
    h+='<p style="font-size:13px;color:rgba(255,255,255,.15)">No transcript yet</p>';
  }else{
    var lines=s.transcript.slice(-50);
    for(var i=0;i<lines.length;i++){
      var sys=lines[i].charAt(0)==='[';
      h+='<p class="t-line'+(sys?' sys':'')+'">'+esc(lines[i])+'</p>';
    }
  }
  h+='</div>';
  if(s.detectedQuestions&&s.detectedQuestions.length){
    h+='<div class="section"><div class="section-title">AI Copilot ('+s.detectedQuestions.length+')</div>';
    for(var j=0;j<s.detectedQuestions.length;j++){
      var q=s.detectedQuestions[j];
      h+='<div class="q-card"><div class="q-head">'+esc(q.question)+'</div>';
      h+='<div class="q-body">'+fmt(q.response||'');
      if(q.isStreaming)h+='<span class="cursor"></span>';
      h+='</div></div>';
    }
    h+='</div>';
  }
  document.getElementById('c').innerHTML=h;
  window.scrollTo(0,document.body.scrollHeight);
  document.getElementById('mm').textContent=s.currentModel||'';
  var d=[];
  if(s.resumeFilename)d.push('Resume: '+s.resumeFilename);
  if(s.jobFilename)d.push('Job: '+s.jobFilename);
  document.getElementById('md').textContent=d.join(' | ');
}
function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML}
function fmt(t){
  if(!t)return'';
  var h=esc(t);
  h=h.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');
  h=h.replace(/^## (.+)$/gm,'<strong style="color:#93c5fd;display:block;margin-top:8px">$1</strong>');
  h=h.replace(/^- (.+)$/gm,'<span style="display:block;padding-left:12px">&bull; $1</span>');
  h=h.replace(/\\n/g,'<br>');
  return h;
}
conn();
</script>
</body>
</html>`
}
