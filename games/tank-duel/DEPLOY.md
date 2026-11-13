# Multiplayer bersama VEXEL GAMES

Server ini adalah **satu Cloudflare Worker bersama** untuk game-game multiplayer VEXEL GAMES. Deploy satu kali; game baru cukup memakai alamat Worker yang sama dan mengirim ID game masing-masing.

## Deploy (sekali untuk fondasi server)

Workflow GitHub Actions: `.github/workflows/deploy-tank-duel-worker.yml`.

Tambahkan dua repository secrets di GitHub → Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN`: API Token dengan izin deploy Workers dan mengelola Durable Objects pada akun tujuan.
- `CLOUDFLARE_ACCOUNT_ID`: Account ID Cloudflare.

Setelah PR digabung ke `main`, buka Actions → **Deploy VEXEL Multiplayer Worker** → Run workflow. Workflow juga akan berjalan otomatis jika file Worker atau konfigurasinya berubah di `main`.

Nama Worker: `vexel-multiplayer`. Setelah deploy, alamatnya berbentuk:

`https://vexel-multiplayer.<subdomain-akun>.workers.dev`

Endpoint pemeriksaan: `/health`.

## Cara game bergabung

Semua game memakai hostname Worker yang sama. Setiap game wajib memberi ID unik dan kode room:

`wss://vexel-multiplayer.<subdomain-akun>.workers.dev/ws?game=<game-id>&room=<kode-room>`

Contoh Tank Duel:

`wss://vexel-multiplayer.<subdomain-akun>.workers.dev/ws?game=tank-duel&room=AB12`

- ID game: huruf kecil, angka, dan tanda hubung; 2–40 karakter.
- Kode room: 1–8 huruf/angka.
- Setiap pasangan `game-id + room` mendapat Durable Object sendiri, maksimal dua koneksi untuk protokol relay saat ini.
- Dua pemain harus memakai ID game, kode room, dan hostname yang sama.

Game berikutnya cukup menggunakan hostname Worker ini, lalu menentukan ID unik, misalnya `chess-duel` atau `snake-battle`. **Tidak perlu membuat Worker atau Durable Object namespace baru per game**; Durable Object room dibuat otomatis per pasangan game/room.

## Tank Duel

Folder game: `games/tank-duel/`. Game menggunakan `game=tank-duel` dan kode room yang sama pada kedua perangkat. Hostname Worker disimpan di browser, sehingga cukup dimasukkan sekali pada perangkat tersebut.

## Catatan keamanan dan arsitektur

Worker ini adalah relay WebSocket dua pemain. Logika permainan Tank Duel saat ini masih dijalankan oleh perangkat host; relay bersama tidak otomatis membuat server authoritative atau anti-cheat. Untuk game kompetitif, validasi state dan tindakan pemain perlu dipindahkan ke server.

Jangan pernah memasukkan API Token ke HTML, source code, atau chat. Simpan hanya sebagai GitHub Actions secret.
