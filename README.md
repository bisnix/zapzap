# Zapzap

Personal cloud inbox untuk mengirim teks, link, dan gambar antar-device tanpa membuka aplikasi chat.

Zapzap berjalan sebagai PWA, Chrome Extension, dan Cloudflare Worker. Target awalnya satu akun pribadi dengan device macOS, Windows, Android, dan iOS.

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
