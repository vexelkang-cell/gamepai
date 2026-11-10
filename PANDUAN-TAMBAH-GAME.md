# Panduan Menambahkan Game ke VEXEL GAMES

## Cara paling mudah

1. Buka repository GitHub `vexelkang-cell/gamepai`.
2. Masuk ke folder `games`.
3. Buat folder baru dengan nama singkat, tanpa spasi. Contoh: `game-pai-baru`.
4. Unggah file utama game ke dalam folder tersebut dan beri nama **index.html**.
5. Commit perubahan ke branch utama (`main` atau `master`).

Contoh susunan folder:

```
games/
  game-pai-baru/
    index.html
    thumbnail.png
```

Setelah folder diunggah, GitHub Actions akan memindai folder game dan memperbarui `games.json`. Kartu game kemudian akan tampil di beranda VEXEL GAMES setelah katalog dan situs selesai diperbarui.

## Thumbnail (opsional)

Letakkan gambar sampul di folder game dengan salah satu nama berikut:
- `thumbnail.png`
- `thumbnail.jpg`
- `thumbnail.webp`
- `cover.png`
- `cover.jpg`
- `cover.webp`

Jika tidak ada thumbnail, kartu game akan memakai ikon emoji.

## Nama dan kategori

Nama game dibaca otomatis dari tag `<title>` pada file `index.html`. Kategori ditebak dari nama folder dan judul game. Jika tidak cocok, kategori menjadi **Lainnya**.

Untuk mengatur nama, kategori, dan deskripsi secara manual, tambahkan file `game.json` di folder game. Contoh:

```json
{
  "name": "Petualangan PAI",
  "category": "Edukasi",
  "description": "Belajar PAI sambil berpetualang.",
  "emoji": "📚"
}
```

Kategori yang tersedia: Edukasi, Petualangan, Aksi, Puzzle, Olahraga, Multiplayer, dan Lainnya.

**Penting:** file game harus berada di foldernya sendiri di dalam `games/`, dan file utamanya harus bernama `index.html`. Jangan mengunggah file HTML game langsung di luar folder game.
