# Environment Configuration

Dokumen ini menjelaskan environment variable yang divalidasi oleh `src/config/env.validation.ts`, fungsinya, dan rekomendasi setting per mode kerja.

## Prinsip Umum

- `.env` adalah konfigurasi lokal dan tidak boleh dicommit.
- `.env.example` harus mencerminkan semua env penting.
- Semua env diparse melalui Zod validation saat app boot.
- Banyak boolean memakai rule: nilai string `false` berarti false, nilai lain berarti true.
- Provider/model LLM wajib valid karena roleplay runtime membutuhkan LLM.

## Core Runtime

### `NODE_ENV`

Default: `development`

Nilai:

- `development`
- `test`
- `production`

Dampak utama ada pada expectation operasional, bukan banyak branching logic.

### `DATABASE_URL`

Default: `file:./dev.db`

Dipakai Prisma utama. Untuk SQLite, path relatif dievaluasi dari folder Prisma saat Prisma client membaca datasource.

### `APP_URL`

Default: `http://localhost:3000`

Dipakai untuk menampilkan URL dashboard di log.

## Dashboard

### `DASHBOARD_ENABLED`

Default: `true`

Jika `true`, app membuat HTTP server dan listen di host/port dashboard.

Jika `false`, app berjalan sebagai application context tanpa HTTP dashboard.

### `DASHBOARD_PORT`

Default: `3000`

Port HTTP dashboard dan sandbox.

Jika muncul `EADDRINUSE`, berarti port sudah dipakai process lain.

### `DASHBOARD_HOST`

Digunakan langsung di `main.ts`, default logic: `127.0.0.1`.

Belum masuk schema Zod, tetapi dibaca via `process.env.DASHBOARD_HOST`.

Rekomendasi:

- Lokal aman: `127.0.0.1`
- LAN testing: gunakan host yang sesuai dengan risiko exposure.

## WhatsApp

### `WHATSAPP_CLIENT_ID`

Default: `personal`

Digunakan oleh `LocalAuth` untuk membuat folder session:

```text
<WHATSAPP_DATA_PATH>/session-<WHATSAPP_CLIENT_ID>
```

Ubah ini jika ingin session terpisah.

### `WHATSAPP_DATA_PATH`

Default: `.wwebjs_auth`

Folder LocalAuth. Jangan commit folder ini.

### `WHATSAPP_HEADLESS`

Default: `true`

Jika `false`, Chromium terlihat. Berguna untuk debugging WA Web/Puppeteer.

### `WHATSAPP_BROWSER_PATH`

Default: empty string.

Jika diisi, bot memakai browser executable spesifik.

Gunakan jika Puppeteer tidak menemukan browser atau ingin pakai Chrome lokal.

### `WHATSAPP_SESSION_RM_MAX_RETRIES`

Default: `20`

Jumlah retry saat menghapus folder LocalAuth. Penting di Windows karena file Chromium bisa masih locked.

### Typing Simulation

Env:

- `WHATSAPP_TYPING_ENABLED`
- `WHATSAPP_TYPING_MIN_MS`
- `WHATSAPP_TYPING_MAX_MS`
- `WHATSAPP_TYPING_CHARS_PER_SECOND`

Fungsi:

- Mensimulasikan typing sebelum reply.
- Delay dihitung dari panjang teks dan dibatasi min/max.

Rekomendasi:

- Development cepat: matikan typing atau turunkan max.
- Realistic personal bot: biarkan aktif.

## Bot Policy

### `BOT_OWNER_NUMBER`

Nomor owner, bila digunakan untuk privilege.

### `BOT_ALLOWED_NUMBERS`

Allowlist nomor.

Jika kosong, behavior tergantung contact policy implementation. Pastikan policy sesuai ekspektasi sebelum production.

### `BOT_DEFAULT_MODE`

Default: `command_only`

Nilai:

- `command_only`: hanya balas command.
- `auto_reply`: balas pesan normal.
- `silent`: tidak balas.

Contact setting per chat bisa override mode.

## Reply Batching

Env:

- `BOT_REPLY_BATCHING_ENABLED`
- `BOT_REPLY_MIN_QUIET_MS`
- `BOT_REPLY_FRAGMENT_QUIET_MS`
- `BOT_REPLY_LONG_TEXT_QUIET_MS`
- `BOT_REPLY_MAX_WAIT_MS`
- `BOT_REPLY_BATCH_MAX_MESSAGES`

Fungsi:

- Mencegah bot menjawab sebelum user selesai mengetik beberapa fragment.
- Menggabungkan bubble user menjadi satu turn.

Tradeoff:

- Quiet window rendah: bot terasa cepat, tapi bisa menjawab prematur.
- Quiet window tinggi: bot terasa sabar, tapi bisa lambat.
- Max wait terlalu tinggi: user merasa bot diam.

## LLM Provider Utama

### `LLM_PROVIDER`

Provider default global.

Contact setting bisa menyimpan provider/model per contact bila digunakan.

### `LLM_MAX_TOKENS`

Default: `1200`

Fallback max tokens global.

## Gemini

Env:

- `GEMINI_API_KEY`
- `GEMINI_BASE_URL`
- `GEMINI_MODEL`
- `GEMINI_TEMPERATURE`
- `GEMINI_TOP_P`
- `GEMINI_MAX_TOKENS`

Catatan:

- `GEMINI_API_KEY` boleh kosong di schema, tetapi request provider akan gagal jika provider Gemini dipakai tanpa key.
- Usage metadata digunakan untuk token counter jika provider mengembalikan usage.

## OpenAI-Compatible

Env:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_TEMPERATURE`
- `OPENAI_TOP_P`
- `OPENAI_MAX_TOKENS`
- `OPENAI_REASONING_EFFORT`

`OPENAI_REASONING_EFFORT`:

- `none`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`

Provider OpenAI-compatible bisa dipakai untuk OpenAI resmi atau endpoint kompatibel, tergantung base URL.

## DeepSeek-Compatible

Env:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_TEMPERATURE`
- `DEEPSEEK_TOP_P`
- `DEEPSEEK_MAX_TOKENS`
- `DEEPSEEK_REASONING_EFFORT`
- `DEEPSEEK_THINKING_TYPE`

Normalization:

- `DEEPSEEK_REASONING_EFFORT=low|medium` dinormalisasi ke `high`.
- `xhigh` dinormalisasi ke `max`.
- allowed: `high`, `max`.

`DEEPSEEK_THINKING_TYPE`:

- `enabled`
- `disabled`

Boolean-like string seperti `true`, `1`, `yes`, `on` menjadi `enabled`.

## Roleplay Character

### `ROLEPLAY_CHARACTER_NAME`

Default: `Alya`

Nama karakter yang muncul di prompt dan UI.

### `ROLEPLAY_CHARACTER_PROFILE`

Default berisi deskripsi karakter fiksi untuk chat santai.

Gunakan untuk persona baseline. Detail dinamis tetap sebaiknya masuk profile service, state, memory, dan prompt builder.

## Roleplay Context Limits

### `ROLEPLAY_RECENT_MESSAGE_LIMIT`

Default: `14`

Jumlah recent messages untuk context.

### `ROLEPLAY_MEMORY_LIMIT`

Default: `8`

Jumlah memory yang disuntikkan ke prompt.

Tradeoff:

- Limit tinggi meningkatkan continuity, tetapi token usage naik.
- Limit rendah lebih hemat, tetapi recall melemah.

## Quote Engine

Env:

- `ROLEPLAY_QUOTE_ENGINE_ENABLED`
- `ROLEPLAY_QUOTE_CANDIDATE_LIMIT`
- `ROLEPLAY_QUOTE_MIN_CONFIDENCE`
- `ROLEPLAY_QUOTE_PROVIDER`
- `ROLEPLAY_QUOTE_MODEL`

Fungsi:

- Mengambil kandidat pesan sebelumnya.
- Menentukan apakah reply harus quote/mengacu ke pesan tertentu.

Quote engine berperan besar untuk continuity dan mengurangi jawaban yang terasa lupa konteks.

## Router

Env:

- `ROLEPLAY_ROUTER_ENABLED`
- `ROLEPLAY_ROUTER_PROVIDER`
- `ROLEPLAY_ROUTER_MODEL`
- `ROLEPLAY_ROUTER_MIN_CONFIDENCE`

Router bisa rule-based atau LLM-assisted tergantung env. Jika LLM router disabled, route fallback ditentukan oleh logic lokal.

## Debug dan Multi-Bubble

### `ROLEPLAY_DEBUG_LOG_ENABLED`

Default: `false`

Jika true, roleplay trace dilog. Berguna untuk debug route, state, presence, address plan, dan response plan.

### `ROLEPLAY_MULTI_BUBBLE_ENABLED`

Default: `true`

Mengizinkan post-processor membagi reply menjadi beberapa bubble.

### `ROLEPLAY_MULTI_BUBBLE_MAX_PARTS`

Default: `3`

Hard cap 1 sampai 3.

## Emotion Classifier

Env:

- `ROLEPLAY_EMOTION_CLASSIFIER_ENABLED`
- `ROLEPLAY_EMOTION_CLASSIFIER_PROVIDER`
- `ROLEPLAY_EMOTION_CLASSIFIER_MODEL`

Classifier memberi analisis nuance emosi user dan delta state. Jika gagal, runtime harus fallback ke analysis lokal.

## Memory Extractor

Env:

- `ROLEPLAY_MEMORY_EXTRACTOR_ENABLED`
- `ROLEPLAY_MEMORY_EXTRACTOR_PROVIDER`
- `ROLEPLAY_MEMORY_EXTRACTOR_MODEL`
- `ROLEPLAY_MEMORY_EXTRACTOR_MIN_CONFIDENCE`
- `ROLEPLAY_MEMORY_EXTRACTOR_MAX_MEMORIES`

Fungsi:

- Mengekstrak fakta user, relationship info, boundary, preference, episode, atau goal.

Risiko:

- Terlalu agresif menyimpan memory noise.
- Terlalu rendah confidence threshold membuat prompt tercemar.

## Presence Agent

Env:

- `ROLEPLAY_PRESENCE_AGENT_ENABLED`
- `ROLEPLAY_PRESENCE_AGENT_PROVIDER`
- `ROLEPLAY_PRESENCE_AGENT_MODEL`
- `ROLEPLAY_PRESENCE_AGENT_TEMPERATURE`
- `ROLEPLAY_PRESENCE_AGENT_MAX_TOKENS`
- `ROLEPLAY_PRESENCE_AGENT_TIMEOUT_MS`

Jika provider/model kosong, implementation fallback ke provider/model utama.

Fungsi:

- Mengubah baseline off-chat activity menjadi status yang lebih natural.
- Output strict JSON.
- Fallback ke baseline jika timeout/error.

## Proactive Messaging

Env:

- `PROACTIVE_ENABLED`
- `PROACTIVE_CHECK_INTERVAL_MINS`
- `PROACTIVE_INACTIVITY_HOURS`

Fungsi:

- Scheduler mengevaluasi apakah perlu mengirim pesan proaktif.
- Hanya efektif jika WhatsApp client `READY`.

## Mode Konfigurasi Rekomendasi

### Development UI/Sandbox Cepat

Tujuan: buka dashboard/sandbox, test prompt, tidak peduli WA.

Rekomendasi masa depan:

```env
DASHBOARD_ENABLED=true
PROACTIVE_ENABLED=false
WHATSAPP_AUTO_START=false
```

Catatan: `WHATSAPP_AUTO_START` belum ada saat dokumen ini dibuat, tetapi disarankan untuk improvement boot speed.

### Development Real WA

```env
DASHBOARD_ENABLED=true
PROACTIVE_ENABLED=false
WHATSAPP_HEADLESS=true
BOT_DEFAULT_MODE=command_only
```

Gunakan `command_only` agar bot tidak auto-reply ke semua pesan saat eksperimen.

### Personal Bot Aktif

```env
DASHBOARD_ENABLED=true
PROACTIVE_ENABLED=true
WHATSAPP_HEADLESS=true
BOT_DEFAULT_MODE=command_only
```

Aktifkan `auto_reply` per contact dari dashboard, bukan global, agar lebih aman.

### Troubleshooting WA Browser

```env
WHATSAPP_HEADLESS=false
PROACTIVE_ENABLED=false
```

Gunakan untuk melihat Chromium langsung.
