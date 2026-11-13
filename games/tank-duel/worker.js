// Shared multiplayer relay for every VEXEL GAMES title.
// Each (game, room) pair gets its own Durable Object instance.
export class Room {
  constructor() { this.sockets = []; }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket only', { status: 426 });
    }
    this.sockets = this.sockets.filter(socket => socket.readyState === WebSocket.OPEN);
    if (this.sockets.length >= 2) return new Response('Ruang penuh', { status: 403 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const role = this.sockets.length === 0 ? 'host' : 'guest';
    this.sockets.push(server);
    server.send(JSON.stringify({ t: 'role', role }));
    if (this.sockets.length === 2) {
      this.sockets.forEach(socket => {
        try { socket.send(JSON.stringify({ t: 'ready' })); } catch {}
      });
    }

    server.addEventListener('message', event => {
      this.sockets.forEach(socket => {
        if (socket !== server && socket.readyState === WebSocket.OPEN) {
          try { socket.send(event.data); } catch {}
        }
      });
    });

    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      this.sockets = this.sockets.filter(socket => socket !== server && socket.readyState === WebSocket.OPEN);
      this.sockets.forEach(socket => {
        try { socket.send(JSON.stringify({ t: 'left' })); } catch {}
      });
    };
    server.addEventListener('close', leave);
    server.addEventListener('error', leave);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'vexel-multiplayer' });
    }
    if (url.pathname !== '/ws') return new Response('VEXEL GAMES Multiplayer Worker');

    const game = (url.searchParams.get('game') || '').toLowerCase();
    const room = (url.searchParams.get('room') || '').toUpperCase();
    if (!/^[a-z0-9-]{2,40}$/.test(game)) {
      return new Response('ID game tidak valid', { status: 400 });
    }
    if (!/^[A-Z0-9]{1,8}$/.test(room)) {
      return new Response('Kode ruang tidak valid', { status: 400 });
    }

    const roomKey = game + ':' + room;
    return env.ROOM.get(env.ROOM.idFromName(roomKey)).fetch(req);
  }
};
