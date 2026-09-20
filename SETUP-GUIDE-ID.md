# Zapzap — Panduan Setup untuk Non-Programmer

Dokumen ini menjelaskan persiapan yang perlu dilakukan agar Zapzap dapat dijalankan di Cloudflare dan digunakan melalui PWA serta Chrome Extension.

Kamu tidak perlu menjalankan semua langkah sekaligus. Selesaikan bagian Cloudflare dan Google terlebih dahulu, lalu deployment dapat dilakukan.

## Gambaran singkat

Zapzap menggunakan:

- Cloudflare Workers untuk aplikasi dan API;
- Cloudflare D1 untuk data akun, device, dan pesan;
- Cloudflare R2 untuk gambar;
- Google OAuth untuk login;
- Web Push untuk notifikasi opsional;
- Chrome Extension sebagai alat kirim cepat.

## Yang perlu disiapkan

Siapkan hal berikut:

1. Akun Cloudflare.
2. Akun Google.
3. Satu alamat email Google yang akan digunakan untuk login.
4. Node.js versi LTS di komputer development.
5. Domain sendiri yang sudah diarahkan ke Cloudflare, atau subdomain `workers.dev` untuk tahap awal.
6. Terminal.

Untuk penggunaan personal, Cloudflare biasanya cukup untuk memulai dengan biaya sangat rendah. R2 menggunakan free tier, tetapi Cloudflare dapat meminta metode pembayaran dan penggunaan di atas kuota gratis dapat dikenakan biaya. Tetapkan batas ukuran file 20 MB seperti yang digunakan aplikasi.

## Bagian A — Install Node.js

Jika belum memiliki Node.js:

1. Buka [nodejs.org](https://nodejs.org/).
2. Download versi **LTS**.
3. Install dengan pilihan default.
4. Buka Terminal baru.
5. Jalankan:

```bash
node --version
npm --version
```

Jika kedua perintah menampilkan nomor versi, Node.js sudah siap.

## Bagian B — Login ke Cloudflare

1. Buka [dash.cloudflare.com](https://dash.cloudflare.com/).
2. Buat akun atau login.
3. Pastikan kamu berada di account Cloudflare yang ingin digunakan.
4. Buka Terminal.
5. Masuk ke folder project Zapzap:

```bash
cd /Users/macminim2/Documents/PROJECT/Zapzap
```

6. Login Wrangler:

```bash
npx wrangler login
```

Browser akan terbuka. Izinkan Wrangler mengakses akun Cloudflare.

## Bagian C — Buat database D1

Di Terminal, dari folder project:

```bash
npx wrangler d1 create zapzap-db
```

Cloudflare akan menampilkan hasil yang berisi `database_id`. Contohnya:

```text
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Salin nilai tersebut.

Buka file `wrangler.jsonc`, lalu ganti:

```json
"database_id": "REPLACE_WITH_D1_DATABASE_ID"
```

menjadi database ID milikmu.

Jangan mengganti `database_name` kecuali memang membuat database dengan nama berbeda.

## Bagian D — Buat bucket gambar R2

Jalankan:

```bash
npx wrangler r2 bucket create zapzap-files
```

Nama bucket harus sama dengan konfigurasi di `wrangler.jsonc`:

```json
"bucket_name": "zapzap-files"
```

Jika nama bucket tersebut sudah digunakan di account-mu, buat nama lain dan ubah juga nilai `bucket_name` di `wrangler.jsonc`.

## Bagian E — Buat Google OAuth

### 1. Buat Google Cloud project

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat project baru, misalnya `Zapzap`.
3. Pilih project tersebut.

### 2. Konfigurasi OAuth consent screen

1. Buka menu **Google Auth Platform** atau **APIs & Services**.
2. Buka **OAuth consent screen**.
3. Pilih tipe **External** jika menggunakan akun Google biasa.
4. Isi nama aplikasi: `Zapzap`.
5. Masukkan email support dan developer contact milikmu.
6. Tambahkan scope berikut jika diminta:

```text
openid
email
profile
```

7. Jika aplikasi masih dalam mode testing, tambahkan email Google milikmu sebagai test user.

### 3. Buat OAuth Client ID

1. Buka **Credentials**.
2. Pilih **Create Credentials**.
3. Pilih **OAuth client ID**.
4. Application type: **Web application**.
5. Isi nama, misalnya `Zapzap Worker`.
6. Tambahkan Authorized redirect URI.

Untuk deployment sementara menggunakan Workers URL:

```text
https://NAMA-WORKER-MU.workers.dev/auth/google/callback
```

Jika menggunakan domain sendiri:

```text
https://zapzap.domainmu.com/auth/google/callback
```

Simpan dua nilai berikut:

- Client ID;
- Client secret.

Jangan commit client secret ke Git atau mengirimkannya di chat.

## Bagian F — Install dependency project

Dari folder project:

```bash
npm install
```

Perintah ini hanya perlu dijalankan sekali, atau setiap kali dependency project berubah.

## Bagian G — Siapkan environment secrets

Untuk deployment Cloudflare, masukkan secret satu per satu:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REDIRECT_URI
npx wrangler secret put ALLOWED_EMAIL
npx wrangler secret put APP_ORIGIN
```

Isi setiap prompt sebagai berikut:

```text
GOOGLE_CLIENT_ID      = Client ID dari Google Cloud
GOOGLE_CLIENT_SECRET  = Client secret dari Google Cloud
GOOGLE_REDIRECT_URI   = URL callback yang sama persis dengan Google Cloud
ALLOWED_EMAIL         = alamat Google yang diizinkan login
APP_ORIGIN            = URL utama aplikasi tanpa slash terakhir
```

Contoh:

```text
GOOGLE_REDIRECT_URI = https://zapzap-example.workers.dev/auth/google/callback
APP_ORIGIN          = https://zapzap-example.workers.dev
ALLOWED_EMAIL       = namaku@gmail.com
```

`GOOGLE_REDIRECT_URI` harus sama persis antara Cloudflare secret dan Google Cloud Console. Perbedaan `http`/`https`, domain, path, atau slash terakhir dapat menyebabkan OAuth gagal.

## Bagian H — Jalankan database migration

Untuk database remote Cloudflare:

```bash
npm run db:remote
```

Jika berhasil, tabel users, sessions, devices, messages, message recipients, dan pairing codes akan dibuat.

Untuk database lokal saat development:

```bash
npm run db:local
```

## Bagian I — Build dan deploy

Build frontend:

```bash
npm run build
```

Periksa tipe TypeScript:

```bash
npm run typecheck
```

Deploy ke Cloudflare:

```bash
npm run deploy
```

Setelah deploy selesai, Wrangler akan menampilkan URL aplikasi. Buka URL tersebut di browser.

## Bagian I.1 — Konfigurasi Web Push

Notifikasi membutuhkan tiga nilai VAPID. Generate pasangan key sekali:

```bash
npx web-push generate-vapid-keys
```

Simpan `publicKey` dan `privateKey` yang ditampilkan. Jangan kirim private key ke chat atau commit ke repository.

Masukkan sebagai Worker secrets:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

Nilainya:

```text
VAPID_PUBLIC_KEY  = public key hasil generate
VAPID_PRIVATE_KEY = private key hasil generate
VAPID_SUBJECT     = mailto:alamat-email-kamu@example.com
```

Setelah itu jalankan migration dan deploy ulang:

```bash
npm run db:remote
npm run deploy
```

Di PWA, klik **Aktifkan notifikasi**. Di iOS, PWA harus sudah ditambahkan ke Home Screen terlebih dahulu.

## Bagian J — Login pertama kali

1. Buka URL aplikasi.
2. Klik **Continue with Google**.
3. Login menggunakan alamat yang sama dengan `ALLOWED_EMAIL`.
4. Jika berhasil, kamu akan masuk ke inbox.

Jika muncul pesan akun tidak diizinkan, periksa kembali nilai `ALLOWED_EMAIL` dan pastikan email tersebut sudah menjadi test user di Google OAuth consent screen.

## Bagian K — Pasangkan Chrome Extension

### 1. Ubah domain di extension

Buka file berikut:

```text
extension/manifest.json
extension/background.js
extension/popup.js
```

Ganti semua:

```text
YOUR_ZAPZAP_DOMAIN
```

dengan domain aplikasi, tanpa slash di akhir.

Contoh:

```text
https://zapzap-example.workers.dev
```

### 2. Buka halaman extension Chrome

1. Buka Chrome.
2. Masukkan `chrome://extensions` di address bar.
3. Aktifkan **Developer mode**.
4. Klik **Load unpacked**.
5. Pilih folder:

```text
/Users/macminim2/Documents/PROJECT/Zapzap/extension
```

### 3. Pairing

1. Buka PWA Zapzap.
2. Di bagian Devices, klik **Pair new**.
3. Salin kode enam digit.
4. Buka detail extension Zapzap.
5. Pilih **Extension options**.
6. Masukkan URL aplikasi.
7. Masukkan pairing code.
8. Klik **Pair device**.

Jika berhasil, popup extension dapat digunakan untuk mengirim teks atau tab aktif.

## Bagian L — Cara menggunakan

### Mengirim tab aktif

1. Buka halaman yang ingin dikirim.
2. Klik icon Zapzap di Chrome.
3. Klik **Kirim tab aktif**.

### Mengirim teks

1. Klik icon Zapzap.
2. Masukkan teks.
3. Klik **Kirim**.

### Mengirim selected text

1. Blok teks di halaman web.
2. Klik kanan.
3. Pilih **Send selection to Zapzap**.

### Mengirim link

1. Klik kanan link.
2. Pilih **Send link to Zapzap**.

## Bagian M — Local development

Untuk menjalankan aplikasi secara lokal:

```bash
npm install
npm run build
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

Buka URL lokal yang ditampilkan Wrangler, biasanya:

```text
http://localhost:8787
```

OAuth lokal membutuhkan redirect URI tambahan di Google Cloud:

```text
http://localhost:8787/auth/google/callback
```

Untuk local development, gunakan file `.dev.vars` di root project. File ini sudah masuk `.gitignore` dan tidak boleh di-commit.

Contoh isi `.dev.vars`:

```text
GOOGLE_CLIENT_ID="isi-client-id"
GOOGLE_CLIENT_SECRET="isi-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:8787/auth/google/callback"
ALLOWED_EMAIL="namaku@gmail.com"
APP_ORIGIN="http://localhost:8787"
```

## Troubleshooting

### `database_id` masih placeholder

Pastikan nilai `database_id` di `wrangler.jsonc` sudah diganti dari hasil `npx wrangler d1 create zapzap-db`.

### Google OAuth redirect error

Pastikan URL callback di Google Cloud Console dan `GOOGLE_REDIRECT_URI` benar-benar sama.

### Akun Google ditolak

Pastikan:

- email sama persis dengan `ALLOWED_EMAIL`;
- email sudah terdaftar sebagai test user;
- email Google sudah verified.

### Gambar gagal dikirim

Pastikan:

- file berformat gambar;
- ukuran file tidak lebih dari 20 MB;
- bucket R2 sudah dibuat;
- nama bucket di `wrangler.jsonc` benar.

### Extension menampilkan unauthorized

Pasangkan ulang extension melalui halaman Options. Device token lama mungkin sudah dicabut atau hilang dari `chrome.storage.local`.

### Extension tidak muncul di context menu

Buka `chrome://extensions`, klik tombol reload pada Zapzap, lalu refresh halaman web yang sedang dibuka.

## Checklist persiapan human

- [ ] Node.js LTS ter-install.
- [ ] Sudah login dengan `npx wrangler login`.
- [ ] D1 database sudah dibuat.
- [ ] Database ID sudah dimasukkan ke `wrangler.jsonc`.
- [ ] R2 bucket sudah dibuat.
- [ ] Google Cloud project sudah dibuat.
- [ ] OAuth consent screen sudah dikonfigurasi.
- [ ] Google OAuth Client ID sudah dibuat.
- [ ] Redirect URI sudah ditambahkan.
- [ ] Lima Worker secrets sudah diisi.
- [ ] `ALLOWED_EMAIL` sudah benar.
- [ ] Database migration sudah dijalankan.
- [ ] Extension sudah di-load melalui `chrome://extensions`.
