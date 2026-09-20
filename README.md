# Zapzap — Pushbullet Alternative

Personal cloud inbox untuk mengirim teks, link, dan gambar antar-device tanpa membuka aplikasi chat.

Zapzap berjalan sebagai PWA, Chrome Extension, dan Cloudflare Worker. Target awalnya satu akun pribadi dengan device macOS, Windows, Android, dan iOS.

Zapzap adalah alternatif ringan untuk Pushbullet: kirim sesuatu dari browser dalam beberapa detik, lalu buka dan terima di device mana pun yang sedang kamu gunakan. Tidak perlu membuka WhatsApp, Telegram, email, atau aplikasi chat lain hanya untuk memindahkan satu link, potongan teks, atau gambar.

## Kenapa Zapzap?

Alur utamanya sengaja dibuat sesingkat mungkin:

1. Dari Chrome, klik extension atau gunakan context menu pada tab, link, teks, atau gambar.
2. Tekan **Kirim**.
3. Buka Zapzap di macOS, Windows, Android, atau iOS untuk mengambilnya nanti.

Pesan disimpan di cloud, sehingga pengirim dan penerima tidak harus berada di Wi-Fi yang sama atau berada di tempat yang sama. Link di dalam pesan teks juga otomatis dibuat clickable.

## Perbandingan dengan aplikasi sejenis

| Aplikasi | Fokus utama | Lintas jaringan | macOS / Windows / Android / iOS | Chrome Extension | Riwayat cloud | Kelebihan utama | Trade-off |
|---|---|---:|---:|---:|---:|---|---|
| **Zapzap** | Inbox pribadi untuk teks, link, dan gambar | Ya | Ya, lewat PWA | **Ya** | **Ya, permanen** | Kirim cepat tanpa membuka aplikasi chat; satu akun; cloud; open source dan bisa self-host di Cloudflare | Masih MVP; belum end-to-end encrypted |
| [Pushbullet](https://www.pushbullet.com/) | Push pesan, link, file, dan notifikasi antar-device | Ya | Ya | Ya | Ya | Pengalaman yang sangat mirip dengan tujuan Zapzap | Layanan pihak ketiga dan pengembangan resminya tidak lagi menjadi fokus utama |
| [LocalSend](https://localsend.org/) | Transfer file langsung antar-device | Tidak, umumnya satu jaringan lokal | Ya | Tidak, aplikasi native | Tidak fokus pada cloud | Gratis, open source, cepat, dan tidak membutuhkan server cloud | Pengirim dan penerima perlu berada di jaringan yang sama; bukan inbox lintas tempat |
| [AirDrop](https://support.apple.com/en-us/119857) | Berbagi file antar-device Apple terdekat | Tidak | Terutama ekosistem Apple | Tidak | Tidak | Sangat cepat dan terintegrasi di Apple | Tidak cocok untuk alur Mac/Windows/Android/iOS sekaligus; perlu device berada dekat |
| [Quick Share](https://support.google.com/android/answer/13801258) | Berbagi file Android, Chromebook, dan Windows | Umumnya lokal / nearby | Android dan Windows; dukungan platform lain terbatas | Tidak | Tidak | Praktis untuk Android ke Windows | Bukan inbox cloud; tidak ideal untuk mengambil pesan dari tempat berbeda |
| [KDE Connect](https://kdeconnect.kde.org/) | Integrasi device, clipboard, link, dan file | Umumnya lokal | Ya, dengan setup aplikasi masing-masing | Integrasi browser, bukan extension Chrome utama | Tidak fokus pada cloud | Banyak fitur power-user seperti clipboard dan remote control | Setup lebih teknis dan biasanya membutuhkan jaringan yang sama |
| [PairDrop](https://pairdrop.net/) | Transfer file peer-to-peer dari browser | Umumnya lokal | Browser modern | Tidak perlu extension | Tidak | Tanpa instalasi dan cepat untuk transfer sesaat | Tidak menyediakan inbox cloud atau riwayat permanen |
| WhatsApp / Telegram | Komunikasi dan pengiriman pesan | Ya | Ya | Bukan alur utama | Ya | Sudah biasa digunakan banyak orang | Terlalu banyak distraksi untuk sekadar mengirim sesuatu ke diri sendiri |

### Posisi Zapzap

Zapzap berada di antara aplikasi transfer lokal dan aplikasi chat. Ia tidak berusaha menggantikan AirDrop atau LocalSend untuk transfer file besar ketika device berada di sebelah kita. Fokusnya adalah kasus sehari-hari seperti:

- menemukan artikel di Chrome lalu ingin membacanya di ponsel;
- mengirim screenshot atau gambar dari komputer ke iPhone/Android;
- menyimpan teks sementara tanpa mengirim pesan ke chat pribadi;
- mengirim sesuatu sekarang dan membukanya beberapa jam kemudian di device lain;
- memindahkan informasi antar-device yang berada di jaringan berbeda.

Dengan Chrome Extension, tindakan tersebut cukup dilakukan dari browser. Device penerima hanya perlu membuka PWA Zapzap—atau mengaktifkan notifikasi—tanpa harus menjalankan aplikasi chat dan tanpa mengganggu fokus kerja.

## Fitur

- Google OAuth;
- inbox cloud lintas jaringan;
- teks, link, dan gambar hingga 20 MB;
- histori permanen;
- Chrome Extension untuk tab aktif, selected text, dan clipboard image;
- PWA untuk Android, iOS, macOS, dan Windows;
- Web Push notification;
- Android Share Target untuk teks, link, dan gambar;
- swipe kiri untuk hapus dan swipe kanan untuk tandai dibaca;
- pencarian histori;
- thumbnail gambar yang dibuat di browser.

## Stack

- TypeScript;
- Preact + Vite;
- Hono + Cloudflare Workers;
- Cloudflare D1;
- Cloudflare R2;
- Google OAuth;
- Web Push dengan VAPID.

## Development

```bash
npm install
npm run typecheck
npm run build
npx wrangler dev
```

Lihat [SETUP-GUIDE-ID.md](./SETUP-GUIDE-ID.md) untuk setup Cloudflare, Google OAuth, VAPID, dan Chrome Extension.

## Deployment

```bash
npm run db:remote
npm run deploy
```

## Struktur

```text
src/worker.ts       API Worker dan authentication
src/client/         PWA frontend
extension/          Chrome Extension Manifest V3
migrations/         D1 migrations
public/             PWA manifest, icon, service worker
```

## Security notes

Secret tidak boleh disimpan di repository. Gunakan `.dev.vars` untuk local development dan `wrangler secret put` untuk production. Pesan saat ini belum menggunakan end-to-end encryption.

## License

MIT. Lihat [LICENSE](./LICENSE).
