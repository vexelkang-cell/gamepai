# Menjalankan Tank Duel Multiplayer

Folder game: `games/tank-duel/`

## 1. Deploy server WebSocket (wajib sekali)

Server multiplayer adalah **Cloudflare Worker terpisah** dari Cloudflare Pages dan terpisah dari Worker untuk upload game.

1. Buka terminal di komputer yang sudah terpasang Node.js.
2. Masuk ke folder `games/tank-duel` dari salinan repository.
3. Jalankan:

```bash
npm install -g wrangler
npx wrangler login
npx wrangler deploy
```

4. Ikuti proses login Cloudflare. Setelah berhasil, terminal menampilkan alamat Worker, biasanya berbentuk `https://tank-server.NAMA-AKUN.workers.dev`.
5. Salin alamat tersebut. Bagian yang dimasukkan ke game adalah hostname saja, misalnya `tank-server.nama-akun.workers.dev` (tanpa `https://`).

File `wrangler.toml` sudah menyiapkan binding Durable Object bernama `ROOM` dan migrasi awal kelas `Room`. Jangan menghapus konfigurasi ini; server menggunakannya untuk memisahkan setiap kode ruang.

## 2. Buka game

Setelah folder game tersedia di situs VEXEL GAMES:

1. Buka game Tank Duel pada HP atau komputer.
2. Isi kode ruang yang sama pada kedua perangkat (maksimal 8 huruf/angka).
3. Isi kolom **Alamat Worker** dengan hostname yang didapat dari langkah 1.
4. Tekan **Masuk** pada kedua perangkat. Pemain pertama menjadi biru (host), pemain kedua merah.
5. Pada HP gunakan joystick dan tombol TEMBAK. Pada komputer gunakan WASD/panah dan Spasi.

Alamat Worker disimpan di browser perangkat setelah pertama kali dipakai, jadi tidak perlu diisi ulang pada perangkat yang sama.

## 3. Jika belum tersambung

- Pastikan Worker sudah selesai di-deploy dan alamatnya benar.
- Pastikan kedua pemain memakai hostname Worker dan kode ruang yang sama.
- Satu ruang hanya menerima dua pemain. Jika ruang penuh atau koneksi terputus, muat ulang game dan coba kode ruang baru.
- Worker multiplayer tidak otomatis dibuat oleh deployment Cloudflare Pages. Deploy Worker pada langkah 1 tetap diperlukan.

## Catatan

Game berjalan dengan model host-authoritative sederhana: perangkat pemain pertama menjalankan simulasi dan mengirim status permainan ke pemain kedua melalui Worker. Ini cocok untuk prototipe; bukan server anti-cheat untuk kompetisi publik.
