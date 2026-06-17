# Runtime Lifecycle

Dokumen ini menjelaskan lifecycle aplikasi sejak process Node dimulai sampai shutdown, termasuk WhatsApp client, reconnect, dashboard restart, scheduler, dan konsekuensi performa boot.

## Boot Sequence

Entry point:

- `src/main.ts`

Urutan besar:

1. `bootstrap()` membaca env runtime langsung dari `process.env`.
2. Jika `DASHBOARD_ENABLED !== false`, Nest HTTP app dibuat dengan `NestFactory.create(AppModule)`.
3. Jika dashboard disabled, Nest application context dibuat dengan `NestFactory.createApplicationContext(AppModule)`.
4. Nest membuat provider dan menjalankan lifecycle hook module/provider.
5. Prisma utama connect.
6. Sandbox Prisma connect dan membuat `sandbox.db` dari `dev.db` bila belum ada.
7. WhatsApp client lifecycle dimulai.
8. Scheduler mendaftarkan startup timer.
9. HTTP server listen di `DASHBOARD_PORT` bila dashboard enabled.

Catatan penting: provider `onModuleInit()` yang melakukan async blocking dapat menunda `app.listen()`.

## WhatsApp Client Lifecycle

Lokasi utama:

- `src/wa/whatsapp-web-client.service.ts`

State publik:

- `DISCONNECTED`
- `SCAN_QR`
- `AUTHENTICATING`
- `LOADING`
- `READY`

Flow normal:

1. `onModuleInit()` enqueue lifecycle operation `module_init`.
2. `initializeClient()` membuat instance `whatsapp-web.js` `Client`.
3. Event listener dipasang untuk `qr`, `authenticated`, `ready`, `loading_screen`, `change_state`, `auth_failure`, `disconnected`, `message`, dan `chat_state_change`.
4. `client.initialize()` membuka Chromium/Puppeteer dan WhatsApp Web.
5. Jika session valid, state bergerak ke `LOADING` lalu `READY`.
6. Jika session belum valid, event `qr` mengisi `lastQrCode` dan state menjadi `SCAN_QR`.

## Kenapa Boot Bisa Lambat

Bottleneck utama adalah `client.initialize()` karena:

- Membuka proses browser Chromium.
- Membaca LocalAuth session.
- Memuat WhatsApp Web.
- Menunggu auth/session validation.
- Bisa terkena delay jaringan.

Jika `client.initialize()` ditunggu di lifecycle Nest, dashboard baru bisa listen setelah init selesai. Optimasi paling berdampak adalah membuat WA init non-blocking atau optional auto-start.

## Lifecycle Operation Queue

WhatsApp lifecycle sekarang perlu diserialkan karena operasi berikut tidak aman jika overlap:

- initial boot
- scheduled reconnect
- manual restart dari dashboard
- disconnect cleanup
- session deletion
- new client initialization

Tanpa queue, skenario race:

1. HP memutus linked device.
2. WA event `UNPAIRED` diterima.
3. Service schedule reconnect 5 detik.
4. User klik restart dashboard sebelum timer selesai.
5. Manual restart dan scheduled reconnect sama-sama mencoba destroy/init.
6. Guard `initializing` bisa membuat salah satu operation return terlalu awal.
7. Browser/session bisa stuck.

Lifecycle queue membuat operation berikut menunggu operation sebelumnya selesai.

## Disconnect Reasons

Reason penting:

- `LOGOUT`: user logout/session invalid. LocalAuth harus dibersihkan.
- `UNPAIRED` atau reason yang diawali `UNPAIRED`: device diputus dari HP. LocalAuth juga harus dibersihkan.
- `NAVIGATION`/Puppeteer target closed style errors: sering transient saat destroy atau page close.

Rule:

- Untuk `LOGOUT` dan `UNPAIRED*`, hapus session lokal.
- Untuk transient navigation error dalam window expected, log sebagai warning/debug, bukan crash.
- Setelah disconnect, jadwalkan reconnect jika app tidak shutting down.

## Dashboard Restart Flow

Endpoint:

- `POST /api/dashboard/wa/restart`

Flow:

1. Dashboard service memanggil `waClient.restartClient()`.
2. WA service enqueue operation `manual_restart`.
3. Status diset `DISCONNECTED`.
4. Reconnect timer yang ada dibersihkan.
5. Client lama diretires dan destroy.
6. LocalAuth session dihapus.
7. `initializeClient()` dipanggil untuk membuat session baru.
8. Dashboard polling akan melihat `SCAN_QR` jika QR tersedia.

Operational expectation:

- Tombol restart bukan sekadar refresh UI.
- Tombol restart adalah hard reset session WA.
- Setelah restart, user harus scan QR ulang.

## Scheduler Lifecycle

### Proactive Scheduler

Lokasi:

- `src/proactive/proactive-scheduler.service.ts`

Behavior:

- Hanya aktif jika `PROACTIVE_ENABLED=true`.
- Pada boot, menunggu sekitar 30 detik sebelum cycle pertama.
- Cycle berikutnya mengikuti interval config.
- Ada guard `isCheckingInitiatives` agar cycle tidak overlap.
- Hanya mengirim jika WA status `READY`.

### Presence Scheduler

Lokasi:

- `src/roleplay/presence/roleplay-presence-scheduler.service.ts`

Behavior:

- Pada boot, menunggu sekitar 20 detik sebelum cycle pertama.
- Refresh presence berkala.
- Skip sandbox contacts.
- Butuh `roleplayState` untuk memastikan presence.
- Ada guard `isRefreshing`.

## Shutdown Sequence

Signal:

- `SIGINT`
- `SIGTERM`

Flow:

1. `main.ts` menangkap signal.
2. `app.close()` dipanggil.
3. Provider `onModuleDestroy()` berjalan.
4. WhatsApp service menandai `isShuttingDown`.
5. Reconnect timer dibersihkan.
6. Client destroy.
7. Prisma disconnect.
8. Process exit.

Risk:

- Jika browser child process sudah mati, Windows bisa menampilkan pesan `child process ... could not be terminated`. Ini biasanya tidak fatal jika tidak ada listener/process tersisa.

## Recommended Future Improvement

Prioritas jika ingin mempercepat boot:

1. Tambah env `WHATSAPP_AUTO_START=true|false`.
2. Ubah `onModuleInit()` agar tidak await `initializeClient()` saat dashboard enabled.
3. Expose endpoint `POST /api/dashboard/wa/start`.
4. Tambah status `STARTING` atau pakai `AUTHENTICATING` sebagai startup marker.
5. Dashboard bisa langsung hidup, QR muncul saat WA init selesai.

Tradeoff:

- Pro: Dashboard/Sandbox cepat terbuka.
- Pro: Development tanpa WA lebih nyaman.
- Contra: Proactive messaging tidak bisa jalan sampai WA client siap.
- Contra: Perlu state machine lebih eksplisit agar UI tidak membingungkan.
