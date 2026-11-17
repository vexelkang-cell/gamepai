# Standar Game dan Leaderboard VEXEL GAMES

## Upload otomatis (cara yang disarankan)

Unggah game melalui tombol **UPLOAD GAME** di beranda VEXEL GAMES. Cloudflare Worker akan otomatis menyisipkan SDK `/vexel-leaderboard.js` ke HTML game dan mengatur ID game dari nama folder (slug). Game langsung mendapatkan tombol **🏆 Peringkat**, membaca 10 skor terbaik, dan mengambil nickname akun yang sedang login.

**Syarat dari sisi game:** ketika permainan berakhir, kirim satu event berikut dengan nilai skor akhir:

```js
window.dispatchEvent(new CustomEvent('vexel:gameover', {
  detail: { score: skorAkhir }
}));
```

Tidak perlu membuat kode login, membaca nickname, memanggil API, atau membuat tampilan papan peringkat sendiri. SDK mengambil sesi dari `vexel_player_session`, memeriksa profil melalui API resmi, lalu mengirim skor dengan token login. Server menentukan identitas dan nickname dari database; jangan mengirim atau mempercayai nickname dari browser.

Alternatif pemanggilan langsung:
```js
window.submitVexelScore(skorAkhir);
```

## Pengembangan lokal / upload manual ke GitHub

Jika game tidak diunggah melalui form beranda, tambahkan sebelum `</body>`:

```html
<script src="/vexel-leaderboard.js" data-game-id="slug-game" defer></script>
```

Gunakan slug yang sama dengan nama folder di `games/<slug-game>/`. File SDK berada di root repository dan dilayani pada `/vexel-leaderboard.js`.

## Template starter

Salin `templates/game-starter/index.html` sebagai awal game baru. Template berisi contoh event game-over. Untuk setiap game baru, gunakan ID folder unik agar peringkat tiap game terpisah.

## API pusat

- `GET /auth/me` — memeriksa sesi dan mengambil nickname akun.
- `GET /leaderboard?gameId=<slug>` — membaca peringkat game.
- `POST /leaderboard/submit` — menyimpan skor; identitas pemain berasal dari token.
- Database: Cloudflare D1 binding `DB`, tabel `leaderboard`.

## Keamanan dan batasan

- Jangan menanam token admin, secret, atau kunci API di HTML game.
- Skor harus berupa bilangan bulat non-negatif; server membatasi nilai hingga 100.000.000.
- Leaderboard menyimpan skor terbaik per akun untuk setiap game.
- SDK tidak dapat menebak kapan game berakhir atau variabel skor internal game. Karena itu setiap game perlu mengirim satu event `vexel:gameover` pada kondisi game-over. Setelah event tersebut, login, pengiriman, dan tampilan peringkat ditangani otomatis.
- Sistem ini untuk game yang menggunakan login VEXEL GAMES dan API Worker yang sama.


## Konfirmasi tombol Back HP

SDK pusat `/vexel-leaderboard.js` juga menangani tombol Back fisik Android. Saat pemain menekan Back di dalam game, dialog **“Kembali ke beranda?”** muncul dengan pilihan **TIDAK** (tetap bermain) dan **IYA** (menuju beranda VEXEL GAMES). Upload melalui form beranda memasang SDK ini otomatis untuk game baru. Untuk upload manual, pastikan tag SDK dipasang sebelum `</body>`.
