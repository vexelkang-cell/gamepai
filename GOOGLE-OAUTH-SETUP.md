# Menyiapkan Google Login VEXEL GAMES

## 1. Google OAuth Client

Buka Google Cloud Console: https://console.cloud.google.com/

1. Pilih atau buat project.
2. Buka Google Auth Platform / OAuth consent screen, lalu lengkapi nama aplikasi dan email dukungan.
3. Buat OAuth Client ID dengan tipe **Web application**.
4. Authorized JavaScript origin:
   `https://vexelgamepai.pages.dev`
5. Authorized redirect URI:
   `https://vexel-games-uploader.vexelkang.workers.dev/auth/google/callback`
6. Simpan Client ID dan Client Secret. Jangan menaruh Client Secret di GitHub atau kode browser.

## 2. Cloudflare Worker secrets

Buka Cloudflare Dashboard → Workers & Pages → `vexel-games-uploader` → Settings → Variables and Secrets.

Tambahkan sebagai **Secret**:

- `GOOGLE_CLIENT_ID` — Client ID dari Google Cloud.
- `GOOGLE_CLIENT_SECRET` — Client Secret dari Google Cloud.
- `AUTH_SECRET` — rahasia acak minimal 32 karakter, khusus menandatangani sesi login.

Simpan perubahan dan deploy ulang Worker jika Dashboard meminta.

## 3. Database D1

Buka Cloudflare Dashboard → Storage & Databases → D1 → `vexel-leaderboard` → Console.

Jalankan seluruh isi file `auth-schema.sql` satu kali. Tabel ini menyimpan identitas Google, ID pemain, role, dan nickname unik.

## 4. Pengujian

1. Buka `https://vexelgamepai.pages.dev`.
2. Klik **MASUK PEMAIN**, lanjutkan dengan Google.
3. Akun non-admin harus diarahkan untuk membuat nickname 3–16 karakter.
4. Klik **LOGIN ADMIN** dan masuk menggunakan `vexelkang@gmail.com`.
5. Akun Google lain harus mendapatkan role pemain, bukan admin.

## Catatan keamanan

- Admin ditentukan di sisi Worker berdasarkan email Google terverifikasi `vexelkang@gmail.com`.
- Jangan membagikan Client Secret atau AUTH_SECRET.
- Login admin lama berbasis UPLOAD_KEY masih tersedia sementara selama migrasi. Setelah Google OAuth teruji, hapus metode lama agar akses admin hanya melalui email Google admin.
