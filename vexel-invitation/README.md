# VEXEL INVITATION

Fondasi website undangan digital yang dikelola admin.

## Struktur saat ini
- `index.html`: halaman depan publik, katalog contoh desain, keunggulan, dan alur pemesanan.
- Tampilan responsif untuk ponsel dan desktop.
- Belum terhubung ke database, sistem login, atau formulir pemesanan. Fitur tersebut akan dibangun pada tahap berikutnya.

## Deploy ke Cloudflare Pages
Buat proyek Pages baru dengan repository GitHub `vexelkang-cell/gamepai`, lalu atur:
- Production branch: `main`
- Root directory: `vexel-invitation`
- Build command: kosongkan
- Build output directory: `.`

Jangan mengubah konfigurasi proyek VEXEL GAMES yang sudah ada. Tambahkan domain khusus `vexelinvitation.pages.dev` pada proyek Pages baru setelah deployment pertama berhasil.

## Tahap berikutnya
1. Halaman login admin dengan autentikasi aman.
2. Dashboard admin dan manajemen pesanan.
3. CRUD undangan dan template.
4. Database dan penyimpanan media.
5. Publikasi halaman undangan dengan slug unik.
