# VEXEL SOCIAL — Tahap 1

Perubahan ini menambahkan fondasi komunitas sosial pada VEXEL GAMES dengan tetap memakai autentikasi Google, tabel `users`, dan Cloudflare D1 yang sudah ada.

## Yang ditambahkan

- Feed publik untuk pemain terdaftar, dengan paginasi dan tab "Mengikuti".
- Postingan teks maksimal 500 karakter.
- Like dan komentar.
- Edit/hapus postingan milik sendiri dan hapus komentar milik sendiri melalui API.
- Pencarian nickname pemain.
- Profil sosial dan hitungan postingan/followers/following, daftar koneksi, serta feed khusus postingan per pemain.
- Kontrol hapus komentar milik sendiri.
- Endpoint moderasi laporan khusus admin (daftar laporan terbuka/semua, tandai resolved/dismissed).
- Follow instan dan unfollow.
- Notifikasi follow, like, dan komentar.
- Blokir akun, laporan konten, dan pembatasan DM untuk akun yang saling diblokir.
- Antarmuka sosial Light Modern pada halaman utama.
- Pesan pribadi lama tetap menggunakan endpoint dan tabel yang sudah ada.

## Database

Worker membuat tabel sosial secara idempotent ketika pemain terautentikasi pertama kali membuka endpoint sosial. Untuk persiapan terkontrol, SQL lengkap juga tersedia pada `social-schema.sql`.

Jalankan SQL tersebut pada Cloudflare D1 database `vexel-leaderboard` sebelum peluncuran produksi, atau biarkan Worker membuat tabel saat endpoint sosial pertama kali dipanggil.

## Endpoint utama

- `GET/POST /social/posts`
- `PUT/DELETE /social/posts/:id`
- `POST /social/posts/:id/like`
- `GET/POST /social/posts/:id/comments`
- `DELETE /social/comments/:id`
- `GET /social/search?q=nickname`
- `GET /social/profile?id=userId`
- `POST/DELETE /social/follow/:userId`
- `GET /social/followers?userId=...`
- `GET /social/following?userId=...`
- `GET /social/notifications`
- `POST /social/notifications/read`
- `POST/DELETE /social/block/:userId`
- `GET /social/user-posts?userId=...&limit=30`
- `POST /social/report`
- `GET /admin/social/reports?status=open|all` (admin)
- `POST /admin/social/reports/:id` dengan body `{ "status": "resolved" | "dismissed" }` (admin)

Semua endpoint sosial di atas memerlukan bearer token pemain VEXEL GAMES yang valid.

## Sebelum produksi

1. Review perubahan pada pull request.
2. Terapkan `social-schema.sql` ke D1 produksi.
3. Deploy Worker dari branch yang telah disetujui.
4. Deploy Pages.
5. Uji endpoint moderasi menggunakan sesi admin dan pastikan sesi pemain biasa mendapat respons 401.
5. Uji login, feed, postingan, komentar, follow, notifikasi, DM, blokir, dan leaderboard pada akun uji.

## Batas tahap ini

Antarmuka feed, pencarian, profil akun sendiri, notifikasi, online, dan DM telah disiapkan. Tampilan profil publik pemain lain, balasan bertingkat, pengelolaan laporan oleh admin, push notification, dan pembatasan spam lanjutan masih memerlukan tahap berikutnya. Belum ada deployment produksi dari perubahan ini.
