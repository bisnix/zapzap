# Zapzap — MVP Specification

## 1. Ringkasan

Zapzap adalah personal cloud inbox lintas-device untuk mengirim teks, link, dan gambar dengan cepat tanpa membuka aplikasi chat.

Target penggunaan utama:

- mengirim konten dari Chrome di macOS atau Windows;
- menerima dan mengirim konten dari Android dan iOS melalui PWA;
- bekerja lintas jaringan dan lokasi;
- menyimpan riwayat pesan secara permanen;
- menggunakan Cloudflare sebagai infrastruktur utama;
- tidak membutuhkan native application.

Tahap awal difokuskan untuk satu pengguna, tetapi fondasinya tetap disiapkan agar dapat dibuka sebagai proyek open source dan dikembangkan menjadi multi-user.

## 2. Prinsip Produk

- **Cepat:** alur kirim harus dapat dilakukan dalam beberapa klik.
- **Ringan:** dependency dan ukuran frontend dijaga tetap kecil.
- **Scalable:** tidak bergantung pada server stateful atau proses background permanen.
- **Cross-platform:** browser dan PWA menjadi antarmuka utama.
- **Private by default:** pesan hanya dapat diakses oleh akun dan device yang telah diotorisasi.
- **Persistent:** pesan tidak otomatis kedaluwarsa.
- **Non-distracting:** tidak ada fitur sosial, chat, atau timeline publik.

## 3. Platform Target

### Prioritas MVP

- Chrome Extension di macOS;
- Chrome Extension di Windows;
- PWA di Android;
- PWA di iOS;
- PWA di browser desktop sebagai fallback.

### Di luar scope MVP

- aplikasi native macOS;
- aplikasi native Windows;
- aplikasi native Android;
- aplikasi native iOS;
- mirroring notifikasi sistem;
- sinkronisasi clipboard otomatis.

## 4. Fitur MVP

### Authentication

- Login menggunakan Google OAuth.
- Akun awal dapat dibatasi ke satu alamat email yang diizinkan.
- Session menggunakan secure HTTP-only cookie pada PWA.
- User tidak perlu membuat atau mengingat password aplikasi.

### Messages

Jenis pesan:

- teks;
- URL/link;
- gambar dengan ukuran maksimum 20 MB.

Setiap pesan memiliki:

- device pengirim;
- waktu pembuatan;
- status read/unread;
- target device;
- attachment jika tersedia.

Pesan tidak otomatis dihapus. Penghapusan dilakukan secara manual oleh user.

### Chrome Extension

- mengirim URL tab aktif;
- mengirim teks yang dipilih;
- mengirim teks dari popup;
- mengirim gambar dari clipboard atau file;
- menampilkan pesan terbaru;
- context menu untuk link dan selected text;
- menampilkan indikator pesan yang belum dibaca.

### PWA

- melihat inbox;
- mengirim teks, link, dan gambar;
- memilih target device;
- menandai pesan sebagai sudah dibaca;
- menghapus pesan;
- mengelola device;
- dapat di-install ke Home Screen.

### Device Management

- menambahkan device melalui pairing code;
- memberi nama device;
- melihat waktu terakhir aktif;
- mencabut akses device;
- setiap device memiliki token terpisah.

### Storage

- metadata dan teks disimpan di Cloudflare D1;
- file gambar disimpan di Cloudflare R2;
- penghapusan pesan menghapus attachment terkait;
- pesan tetap tersedia sampai dihapus manual.

## 5. Arsitektur

```text
Chrome Extension ─┐
                  ├── Cloudflare Worker API ── Cloudflare D1
PWA Android/iOS ──┘                         └── Cloudflare R2
```

Satu domain dapat digunakan untuk frontend, API, dan authentication:

```text
app.example.com/
├── PWA static assets
├── /api/*
├── /auth/*
└── /uploads/*
```

Cloudflare Workers menyajikan frontend static assets sekaligus menjalankan API. Ini menghindari server frontend dan backend yang terpisah.

## 6. Tech Stack

- **Language:** TypeScript
- **Frontend:** Preact
- **Bundler:** Vite
- **Chrome Extension:** Manifest V3
- **Backend:** Cloudflare Workers
- **HTTP framework:** Hono
- **Database:** Cloudflare D1
- **Database access:** SQL langsung dengan migration versioned
- **File storage:** Cloudflare R2
- **Authentication:** Google OAuth 2.0
- **Hosting:** Cloudflare Workers Static Assets
- **Styling:** CSS biasa atau CSS Modules

Framework frontend tidak menggunakan SSR karena aplikasi bersifat authenticated SPA dan tidak membutuhkan SEO. Backend tidak menggunakan ORM pada MVP agar bundle, abstraction, dan query tetap minimal.

## 7. Authentication Flow

```text
User membuka PWA
        ↓
Login dengan Google OAuth
        ↓
Worker memvalidasi identitas Google
        ↓
Worker membuat session cookie
        ↓
User masuk ke inbox
```

Google OAuth client secret hanya disimpan sebagai Cloudflare Worker Secret.

### Extension Pairing Flow

Chrome Extension tidak menyimpan Google credential.

```text
User login di PWA
        ↓
PWA membuat pairing session
        ↓
Extension menampilkan pairing code
        ↓
User mengonfirmasi code di PWA
        ↓
Worker membuat device token
        ↓
Extension menyimpan token di chrome.storage.local
```

Token device:

- hanya ditampilkan satu kali;
- disimpan dalam bentuk hash di D1;
- dapat dicabut dari PWA;
- hanya dapat digunakan untuk akun pemiliknya.

## 8. Data Model

### `users`

```text
id
google_subject
email
created_at
updated_at
```

### `sessions`

```text
id
user_id
token_hash
expires_at
created_at
last_seen_at
```

### `devices`

```text
id
user_id
name
type
token_hash
last_seen_at
created_at
revoked_at
```

### `messages`

```text
id
user_id
sender_device_id
type
text_content
url
attachment_key
created_at
deleted_at
```

### `message_recipients`

```text
message_id
device_id
delivered_at
read_at
```

Tabel `message_recipients` digunakan agar status delivery dan read dapat berbeda untuk setiap device.

## 9. API MVP

### Authentication

```text
GET    /auth/google
GET    /auth/google/callback
POST   /auth/logout
GET    /api/me
```

### Messages

```text
GET    /api/messages
POST   /api/messages
GET    /api/messages/:id
PATCH  /api/messages/:id/read
DELETE /api/messages/:id
```

### Uploads

```text
POST   /api/uploads
DELETE /api/uploads/:key
```

Upload gambar dibatasi maksimal 20 MB dan hanya menerima MIME type gambar yang diizinkan.

### Devices

```text
GET    /api/devices
POST   /api/devices/pair
PATCH  /api/devices/:id
DELETE /api/devices/:id
```

## 10. Message Semantics

- Default target adalah semua device milik user selain device pengirim.
- User dapat memilih device tertentu.
- Pesan tetap ada walaupun device penerima sedang offline.
- Pesan yang belum dibaca dapat diambil saat device kembali online.
- Menghapus device tidak menghapus histori pesan.
- Menghapus pesan menghapus metadata dan file attachment terkait.
- URL disimpan sebagai URL asli.
- Link preview ditunda dari MVP agar pengiriman tetap cepat.

## 11. Realtime dan Notification

### MVP

- PWA melakukan polling ketika sedang aktif.
- Chrome Extension melakukan polling ringan.
- Tidak menggunakan WebSocket pada tahap awal.
- Tidak menggunakan Web Push pada tahap awal.

### Fase berikutnya

- Web Push untuk browser desktop dan PWA;
- notifikasi unread count;
- Durable Objects atau WebSocket jika realtime penuh diperlukan;
- background sync jika dukungan browser memadai.

Di iOS, Web Push hanya digunakan setelah PWA ditambahkan ke Home Screen dan perangkat mendukung iOS/iPadOS 16.4 atau lebih baru.

## 12. Keamanan Minimum

- seluruh komunikasi menggunakan HTTPS;
- session cookie menggunakan `HttpOnly`, `Secure`, dan `SameSite=Lax`;
- token device tidak disimpan plaintext di database;
- OAuth secret disimpan sebagai Worker Secret;
- seluruh query dibatasi berdasarkan `user_id`;
- upload memvalidasi ukuran, MIME type, dan extension;
- pairing code memiliki masa berlaku pendek;
- pairing code hanya dapat digunakan sekali;
- endpoint login, pairing, dan upload memiliki rate limit;
- CORS dibatasi ke domain aplikasi dan extension;
- secret dan credential tidak boleh dikomit ke repository.

## 13. Urutan Implementasi

1. Membuat struktur project TypeScript.
2. Menyiapkan konfigurasi Cloudflare Worker.
3. Membuat D1 schema dan migration.
4. Membuat Google OAuth dan session.
5. Membuat API inbox teks dan link.
6. Membuat UI PWA login, inbox, dan compose.
7. Membuat device registration dan pairing.
8. Membuat Chrome Extension Manifest V3.
9. Menghubungkan extension ke API.
10. Menambahkan upload gambar ke R2.
11. Menambahkan read/unread dan target device.
12. Menambahkan manifest PWA dan installability.
13. Menambahkan pengujian dan dokumentasi deployment.

## 14. Di Luar Scope MVP

- user-to-user sharing;
- public share link;
- end-to-end encryption;
- native applications;
- automatic clipboard sync;
- notification mirroring;
- link metadata preview;
- search full-text;
- folders, tags, dan collections;
- offline message composition;
- multi-account dalam satu extension.

## 15. Kriteria Selesai MVP

MVP dianggap berhasil jika:

1. User dapat login dengan Google.
2. User dapat menambahkan Chrome Extension sebagai device.
3. User dapat mengirim URL dari Chrome ke PWA mobile.
4. User dapat mengirim teks dari iOS/Android ke Chrome.
5. User dapat mengirim gambar hingga 20 MB.
6. Pesan tetap tersedia ketika device penerima offline.
7. Pesan dapat dibaca kembali setelah browser atau PWA ditutup.
8. User dapat menghapus pesan secara manual.
9. User dapat mencabut akses device.
10. Tidak ada secret yang tersimpan di source code.

## 16. Keputusan yang Ditunda

- nama domain produksi;
- nama resmi aplikasi;
- apakah akun dibatasi satu email atau memakai allowlist;
- apakah attachment lama dapat diekspor;
- apakah end-to-end encryption diperlukan setelah MVP;
- apakah project langsung dipublikasikan sebagai open source.

