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

## Deploy otomatis dari GitHub Actions (tanpa terminal)

Workflow `.github/workflows/deploy-tank-duel-worker.yml` sudah disiapkan. Agar GitHub boleh menerbitkan Worker ke akun Cloudflare, pemilik repository perlu menambahkan dua **Actions secrets**:

1. Buka repository GitHub `vexelkang-cell/gamepai`.
2. Masuk ke **Settings → Secrets and variables → Actions → New repository secret**.
3. Tambahkan secret bernama `CLOUDFLARE_API_TOKEN` berisi API Token Cloudflare dengan izin yang diperlukan untuk Workers Scripts dan Durable Objects pada akun yang dipakai.
4. Tambahkan secret bernama `CLOUDFLARE_ACCOUNT_ID` berisi Account ID Cloudflare.
5. Buka tab **Actions**, pilih workflow **Deploy Tank Duel Multiplayer Worker**, lalu tekan **Run workflow**.

Setelah workflow berstatus sukses, alamat Worker mengikuti nama Worker di `wrangler.toml`, yaitu `tank-server`, dengan format `tank-server.<subdomain-akun>.workers.dev`. Masukkan hostname tersebut di kolom Alamat Worker dalam game.

**Keamanan:** jangan menaruh API Token atau Account ID rahasia di file HTML, source code, issue, atau chat. Simpan token hanya sebagai GitHub Actions secret. Saya tidak dapat membuat secrets tersebut atau membaca nilainya melalui repository.
