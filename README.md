# VEXEL GAMES — Cloudflare Pages Starter

## Isi paket
- `index.html` — halaman utama portal
- `style.css` — desain responsif dark modern
- `script.js` — pencarian, filter kategori, navigasi mobile
- `assets/logo.svg` — logo sementara

## Preview lokal (opsional)
Buka `index.html` langsung di browser, atau jalankan server lokal:
`python -m http.server 8000`
lalu buka `http://localhost:8000`.

## Upload ke Cloudflare Pages — Direct Upload
1. Ekstrak ZIP ini di komputer.
2. Buka Cloudflare Dashboard: https://dash.cloudflare.com/
3. Pilih **Workers & Pages** → **Create application** → **Pages**.
4. Pilih **Upload assets** / **Direct Upload** (nama menu bisa sedikit berubah).
5. Beri nama proyek, misalnya `vexel-games`.
6. Upload folder hasil ekstrak `vexel-games` (atau ZIP sesuai instruksi UI).
   PENTING: `index.html` harus berada di root folder yang diunggah, bukan di dalam folder bertingkat lain.
7. Klik **Deploy site** / **Save and Deploy**.
8. Setelah selesai, Cloudflare memberikan alamat seperti `https://vexel-games.pages.dev`.

## Catatan
- Ini adalah template portal awal; kartu game masih berupa contoh "COMING SOON".
- Belum ada akun pemain, database, leaderboard, atau sistem upload game. Fitur-fitur itu ditambahkan pada tahap berikutnya.
- Font Google Fonts memerlukan koneksi internet; jika offline, font fallback tetap digunakan.
- Jangan memasukkan secret/API key ke file frontend.
