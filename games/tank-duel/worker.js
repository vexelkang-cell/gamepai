// Shared multiplayer relay for every VEXEL GAMES title.
// Each (game, room) pair gets its own Durable Object instance.
export class Room {
  constructor() {
    this.sockets = [];
    this.roles = new Map();
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket only', { status: 426 });
    }
    this.sockets = this.sockets.filter(socket => socket.readyState === WebSocket.OPEN);
    for (const socket of [...this.roles.keys()]) {
      if (socket.readyState !== WebSocket.OPEN) this.roles.delete(socket);
    }
    if (this.sockets.length >= 2) return new Response('Ruang penuh', { status: 403 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const role = this.sockets.length === 0 ? 'host' : 'guest';
    this.sockets.push(server);
    this.roles.set(server, role);
    server.send(JSON.stringify({ t: 'role', role }));
    if (this.sockets.length === 2) {
      this.sockets.forEach(socket => {
        try { socket.send(JSON.stringify({ t: 'ready' })); } catch {}
      });
    }

    server.addEventListener('message', event => {
      // Relay hanya menerima protokol game yang dikenal dan payload kecil.
      // Guest hanya boleh mengirim input; host hanya boleh mengirim snapshot.
      if (typeof event.data !== 'string' || event.data.length > 16384) {
        try { server.close(1009, 'Payload terlalu besar'); } catch {}
        return;
      }
      let message;
      try { message = JSON.parse(event.data); } catch {
        try { server.close(1008, 'Format pesan tidak valid'); } catch {}
        return;
      }
      const senderRole = this.roles.get(server);
      if (!message || (senderRole === 'guest' && message.t !== 'i') ||
          (senderRole === 'host' && message.t !== 's')) {
        try { server.close(1008, 'Jenis pesan tidak diizinkan'); } catch {}
        return;
      }
      if (senderRole === 'guest') {
        const jx = Number(message.jx), jy = Number(message.jy);
        message = {
          t: 'i',
          jx: Number.isFinite(jx) ? Math.max(-1, Math.min(1, jx)) : 0,
          jy: Number.isFinite(jy) ? Math.max(-1, Math.min(1, jy)) : 0,
          f: message.f ? 1 : 0
        };
      }
      const payload = JSON.stringify(message);
      this.sockets.forEach(socket => {
        if (socket !== server && socket.readyState === WebSocket.OPEN) {
          try { socket.send(payload); } catch {}
        }
      });
    });

    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      this.roles.delete(server);
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
