# FLIKER KILL — Catatan Migrasi Isometric 2D

Tanggal pengamanan: 2026-11-28

## Tujuan
Dokumen ini menjadi acuan Tahap 1 migrasi dari FLIKER KILL 3D (Three.js) ke FLIKER KILL Isometric 2D berbasis sprite. Tidak ada perubahan gameplay atau data pemain yang dilakukan dalam tahap pengamanan ini.

## Titik pemulihan versi 3D
- File aktif saat pengamanan: `games/fliker-kill/index.html`
- Salinan arsip 3D: `games/fliker-kill/legacy-3d/index.html`
- Library Three.js tetap berada di: `games/fliker-kill/three.min.js`
- Branch cadangan: `backup/fliker-kill-3d-before-isometric-2026-11-28`
- SHA file sumber ketika disalin: `92205cd6a47498868c22519cf8d9360f3674af7b`
- Commit penyalinan arsip: `c0e379c2c84f61889abcced793ff49fd17cf281d`

Arsip HTML mempertahankan URL library absolut `/games/fliker-kill/three.min.js`, sehingga salinan arsip dapat dijalankan dari path arsip tanpa mengubah referensi library.

## Kunci penyimpanan progres yang wajib kompatibel

Versi Isometric 2D harus membaca dan mempertahankan kunci localStorage berikut. Jangan mengganti nama kunci ini pada migrasi pertama.

| Kunci | Isi |
|---|---|
| `flicker-hero-level` | Level Ninja |
| `flicker-hero-xp` | EXP saat ini |
| `flicker-hero-coins` | Jumlah koin |
| `flicker-mission-index` | Indeks misi aktif (0–4) |
| `flicker-mission-progress` | Jumlah target misi yang sudah dikalahkan |
| `flicker-up-attack` | Level upgrade serangan |
| `flicker-up-hp` | Level upgrade nyawa |
| `flicker-up-speed` | Level upgrade kecepatan |
| `flicker-up-shuriken` | Level upgrade Shuriken |
| `flicker-skill-shadow` | Status buka Shadow Burst |
| `flicker-kill-high` | High score |
| `flicker-mission-minimized` | Preferensi panel misi diminimalkan |

## Aturan kompatibilitas
1. Jangan menghapus localStorage saat memuat versi baru.
2. Jangan reset level, EXP, koin, misi, upgrade, skill, atau high score saat migrasi.
3. Buat pembacaan data defensif: jika suatu kunci tidak ada atau nilainya tidak valid, gunakan nilai default tanpa menghapus kunci lain.
4. Simpan data menggunakan kunci lama yang sama selama fase migrasi.
5. Sebelum migrasi format data, buat cadangan seluruh 12 kunci di bawah namespace cadangan baru. Jangan menimpa cadangan yang sudah ada.
6. Uji dengan data uji dan profil pemain lama sebelum versi 2D menggantikan versi live.

## Data sesi yang bukan progres permanen
Skor sesi, jumlah monster dikalahkan pada sesi, timer, nyawa saat sesi berjalan, combo, cooldown, posisi karakter, monster aktif, proyektil, dan efek pertarungan diinisialisasi ulang saat permainan dimulai. Jangan menganggapnya sebagai data progres permanen kecuali kelak ada fitur resume-session yang dirancang terpisah.

## Ruang lingkup Tahap 1
- Mengamankan sumber 3D dan branch cadangan.
- Mendokumentasikan kunci penyimpanan dan aturan kompatibilitas.
- Tidak mengubah file live, sistem pertarungan, visual, atau data pemain.
- Belum membangun renderer 2D; itu dimulai pada tahap berikutnya.
