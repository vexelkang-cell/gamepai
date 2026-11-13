export class Room {
  constructor() { this.sockets = []; }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket only', { status: 426 });
    if (this.sockets.length >= 2) return new Response('Ruang penuh', { status: 403 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const role = this.sockets.length === 0 ? 'host' : 'guest';
    this.sockets.push(server);
    server.send(JSON.stringify({ t: 'role', role }));
    if (this.sockets.length === 2) this.sockets.forEach(s => s.send(JSON.stringify({ t: 'ready' })));
    server.addEventListener('message', e => {
      this.sockets.forEach(s => { if (s !== server) { try { s.send(e.data); } catch {} } });
    });
    const leave = () => {
      this.sockets = this.sockets.filter(s => s !== server);
      this.sockets.forEach(s => { try { s.send(JSON.stringify({ t: 'left' })); } catch {} });
    };
    server.addEventListener('close', leave);
    server.addEventListener('error', leave);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') || '').toUpperCase().slice(0, 8);
      if (!room) return new Response('Kode ruang kosong', { status: 400 });
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(req);
    }
    return new Response('Tank server OK');
  }
};
