# Mengaktifkan Upload Game dari Beranda VEXEL GAMES

Fitur upload beranda memakai Cloudflare Worker sebagai perantara. Token GitHub hanya disimpan sebagai Secret di Cloudflare, tidak pernah ditanam di HTML.

## 1. Buat token GitHub

1. Buka GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Buat token baru dengan nama, misalnya `VEXEL GAMES UPLOADER`.
3. Repository access: **Only select repositories** → pilih `gamepai`.
4. Repository permissions: **Contents: Read and write**. Permission lain tidak diperlukan.
5. Generate token dan salin. Jangan kirim token ini ke ChatGPT atau orang lain.

## 2. Buat Cloudflare Worker

1. Buka Cloudflare Dashboard → **Workers & Pages**.
2. Pilih **Create** → **Worker** → **Deploy**.
3. Beri nama `vexel-games-uploader`.
4. Setelah Worker dibuat, pilih **Edit code**.
5. Ganti seluruh kode contoh dengan isi file `cloudflare-worker.js` di repository ini, lalu pilih **Deploy**.

## 3. Pasang Secrets

Di halaman Worker, buka **Settings → Variables and Secrets** lalu tambahkan dua nilai sebagai **Secret**:

- `GITHUB_TOKEN`: token Fine-grained GitHub dari langkah 1.
- `UPLOAD_KEY`: buat kata kunci admin yang panjang dan sulit ditebak (minimal 32 karakter). Simpan baik-baik.

Simpan perubahan dan deploy ulang jika diminta. Jangan pernah menaruh kedua nilai ini di file HTML atau repository.

## 4. Upload dari beranda

1. Buka `https://gamepai-7a9.pages.dev/`.
2. Klik **UPLOAD GAME**.
3. Masukkan alamat Worker, bentuknya `https://NAMA-WORKER.NAMA-AKUN.workers.dev` (tanpa tambahan `/upload`).
4. Masukkan kunci admin yang sama dengan Secret `UPLOAD_KEY`.
5. Isi nama, kategori, deskripsi, pilih file HTML dan thumbnail, lalu klik **TERBITKAN GAME**.

Alamat Worker dapat disimpan browser untuk penggunaan berikutnya. Kunci admin hanya disimpan sementara di tab browser saat sesi itu berlangsung.

## Batasan dan keamanan

- Worker hanya menerima permintaan dari situs produksi `https://gamepai-7a9.pages.dev`.
- Ukuran maksimal file HTML 2,5 MB dan thumbnail 1,5 MB.
- Thumbnail harus PNG, JPG, atau WEBP.
- Nama game digunakan sebagai nama folder. Jika folder sudah ada, Worker menolak agar game lama tidak tertimpa.
- File HTML harus mandiri atau memakai aset yang sudah dapat diakses melalui URL publik. Fitur ini belum mengunggah paket ZIP atau banyak file aset sekaligus.
- Setelah file masuk ke folder `games/<nama-game>/`, workflow **Perbarui Katalog Game** akan membuat entri `games.json). Beranda publik akan menampilkan game setelah deployment selesai.
- Jika Worker URL atau kunci salah, beranda akan menampilkan pesan kesalahan. Periksa URL dan Secrets di Cloudflare.

## Struktur file hasil upload

```
games/
  nama-game/
    game.json
    thumbnail.png
    index.html
```
