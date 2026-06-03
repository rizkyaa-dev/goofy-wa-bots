# Bot WA Personal

Bot WhatsApp personal berbasis TypeScript, NestJS, Prisma SQLite, dan `whatsapp-web.js`.

Arsitektur dibuat sebagai modular monolith dengan batas yang jelas:

- `wa`: adapter untuk `whatsapp-web.js`.
- `bot`: orchestration, command registry, dan command handlers.
- `contacts`: allowlist dan setting per chat.
- `conversations`: penyimpanan history pesan.
- `messages`: domain pesan dan dedupe.
- `infra/prisma`: akses database.

## Setup

Install dependency:

```bash
npm install
```

Project ini sengaja diinstall dengan browser lokal Chrome/Edge, bukan download Chromium besar dari Puppeteer. Kalau bot gagal menemukan browser, isi `.env`:

```env
WHATSAPP_BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Siapkan database SQLite:

```bash
npm run db:reset
```

Jalankan mode development:

```bash
npm run start:dev
```

Saat QR muncul di terminal, scan memakai WhatsApp di nomor yang mau dipakai sebagai akun bot.

## Typing Presence

Bot menampilkan status mengetik sebelum mengirim balasan. Atur dari `.env`:

```env
WHATSAPP_TYPING_ENABLED=true
WHATSAPP_TYPING_MIN_MS=900
WHATSAPP_TYPING_MAX_MS=6500
WHATSAPP_TYPING_CHARS_PER_SECOND=22
```

Matikan dengan:

```env
WHATSAPP_TYPING_ENABLED=false
```

## Konfigurasi Penting

Isi `.env` sesuai kebutuhan:

```env
BOT_OWNER_NUMBER=6281234567890@c.us
BOT_ALLOWED_NUMBERS=6281234567890@c.us,6289876543210@c.us
BOT_DEFAULT_MODE=command_only
```

Aturan allowlist:

- Kalau `BOT_ALLOWED_NUMBERS` diisi, hanya chat itu yang dibalas.
- Kalau `BOT_ALLOWED_NUMBERS` kosong tapi `BOT_OWNER_NUMBER` diisi, hanya owner yang dibalas.
- Kalau keduanya kosong, semua chat boleh dibalas.

## Command Awal

- `/ping`: cek bot aktif.
- `/help`: daftar command.
- `/mode`: lihat mode chat.
- `/mode command_only`: hanya balas command.
- `/mode auto_reply`: balas pesan biasa dengan respons sederhana.
- `/mode silent`: diam untuk pesan biasa.
- `/catat isi catatan`: simpan catatan.
- `/notes`: lihat 5 catatan terakhir.
- `/persona teks`: set persona chat.
- `/persona reset`: hapus persona.
- `/ai pertanyaan`: tanya AI dengan provider aktif.
- `/provider`: lihat provider AI chat ini.
- `/provider gemini`: set provider AI chat ini.
- `/provider default`: reset ke provider default `.env`.
- `/model`: lihat model AI chat ini.
- `/model nama-model`: set model AI chat ini.
- `/model default`: reset ke model default provider.

## LLM Providers

Provider AI bisa diset global dari `.env`:

```env
LLM_PROVIDER=gemini
LLM_MAX_TOKENS=1200

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
GEMINI_TEMPERATURE=
GEMINI_TOP_P=
GEMINI_MAX_TOKENS=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_TEMPERATURE=
OPENAI_TOP_P=
OPENAI_MAX_TOKENS=
OPENAI_REASONING_EFFORT=high

DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_TEMPERATURE=
DEEPSEEK_TOP_P=
DEEPSEEK_MAX_TOKENS=
DEEPSEEK_REASONING_EFFORT=
DEEPSEEK_THINKING_TYPE=enabled
```

Provider yang tersedia:

- `gemini`: Google Gemini API.
- `openai`: OpenAI Chat Completions API.
- `deepseek`: DeepSeek API yang kompatibel OpenAI.

Contoh pemakaian via WhatsApp:

```txt
/provider gemini
/model gemini-3.5-flash
/ai rangkumkan ide bot personal yang bagus
```

Contoh DeepSeek:

```txt
/provider deepseek
/model deepseek-v4-pro
/ai buatkan jawaban singkat untuk customer
```

## Temporary Reply

Selama `TEMP_HAI_REPLY_ENABLED=true`, chat dari nomor apa pun yang mengirim pesan persis:

```txt
hai
```

akan dibalas:

```txt
iya ada yg bisa saya bantu.
```

Matikan dengan:

```env
TEMP_HAI_REPLY_ENABLED=false
```

## Catatan Pengembangan

Tambahkan fitur baru sebagai command handler di `src/bot/commands`, lalu daftarkan provider-nya di `src/bot/bot.module.ts`.

Untuk fitur yang bukan command sederhana, buat module baru di `src/features` atau package domain baru yang cohesive, lalu panggil dari command/orchestrator. Jaga adapter WhatsApp tetap tipis agar core bot tidak tergantung langsung ke `whatsapp-web.js`.

## Verifikasi

```bash
npm run typecheck
npm run build
```
"# goofy-wa-bots" 
