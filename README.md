# Bot WA Personal

Bot WhatsApp personal berbasis TypeScript, NestJS, Prisma SQLite, dan `whatsapp-web.js`.

Project ini adalah modular monolith. Adapter WhatsApp dibuat tipis, sedangkan logic bot, command, roleplay, memory, dan LLM dipisah per domain.

## Modul Utama

- `wa`: adapter `whatsapp-web.js`, QR/session, typing simulator, dan reply batching.
- `bot`: orchestration, command registry, dan command handlers.
- `contacts`: allowlist dan setting per chat.
- `conversations`: penyimpanan history pesan inbound/outbound.
- `messages`: normalisasi pesan dan dedupe.
- `llm`: provider Gemini, OpenAI, dan DeepSeek.
- `roleplay`: runtime karakter, router, prompt compiler, memory, quote, emotion, dan response guard.
- `infra/prisma`: Prisma client dan database SQLite.

## Setup

Install dependency:

```bash
npm install
```

Siapkan `.env` dari contoh:

```bash
copy .env.example .env
```

Isi API key dan model provider yang mau dipakai. Project ini memakai browser Chrome/Edge lokal untuk WhatsApp Web. Kalau browser tidak terdeteksi, isi:

```env
WHATSAPP_BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Generate Prisma client dan apply migration:

```bash
npm run prisma:generate
npx prisma migrate deploy
```

Untuk reset database penuh saat development:

```bash
npm run db:reset
```

Jalankan development server:

```bash
npm run start:dev
```

Saat QR muncul di terminal, scan memakai WhatsApp di nomor yang akan dipakai sebagai akun bot.

## Konfigurasi WhatsApp

```env
WHATSAPP_CLIENT_ID=personal
WHATSAPP_DATA_PATH=.wwebjs_auth
WHATSAPP_HEADLESS=true
WHATSAPP_SESSION_RM_MAX_RETRIES=20
```

Typing presence:

```env
WHATSAPP_TYPING_ENABLED=true
WHATSAPP_TYPING_MIN_MS=900
WHATSAPP_TYPING_MAX_MS=6500
WHATSAPP_TYPING_CHARS_PER_SECOND=22
```

Matikan typing simulator:

```env
WHATSAPP_TYPING_ENABLED=false
```

## Allowlist dan Mode Default

```env
BOT_OWNER_NUMBER=6281234567890@c.us
BOT_ALLOWED_NUMBERS=6281234567890@c.us,6289876543210@c.us
BOT_DEFAULT_MODE=command_only
```

Aturan allowlist:

- Kalau `BOT_ALLOWED_NUMBERS` diisi, hanya chat itu yang dibalas.
- Kalau `BOT_ALLOWED_NUMBERS` kosong tapi `BOT_OWNER_NUMBER` diisi, hanya owner yang dibalas.
- Kalau keduanya kosong, semua chat boleh dibalas.

Mode chat:

- `command_only`: hanya balas command.
- `auto_reply`: balas pesan biasa memakai roleplay runtime.
- `silent`: diam untuk pesan biasa.

## Command

- `/ping`: cek bot aktif.
- `/help`: daftar command.
- `/mode`: lihat mode chat.
- `/mode command_only`: hanya balas command.
- `/mode auto_reply`: aktifkan roleplay auto reply.
- `/mode silent`: diam untuk pesan biasa.
- `/catat isi catatan`: simpan catatan.
- `/notes`: lihat 5 catatan terakhir.
- `/persona teks`: set persona override untuk chat.
- `/persona reset`: hapus persona override.
- `/ai pertanyaan`: tanya AI dengan provider aktif.
- `/provider`: lihat provider AI chat ini.
- `/provider gemini|openai|deepseek`: set provider AI chat ini.
- `/provider default`: reset provider ke default `.env`.
- `/model`: lihat model AI chat ini.
- `/model nama-model`: set model AI chat ini.
- `/model default`: reset model ke default provider.
- `/rp_memory`: lihat memory roleplay chat ini.
- `/rp_reset`: reset state, memory, dan history roleplay chat ini.
- `/rp_reset state`: reset emosi/state roleplay.
- `/rp_reset memory`: reset memori roleplay.
- `/rp_reset history`: reset history chat.

Catatan: `/rp_reset` tanpa scope sama dengan `/rp_reset all`.

## LLM Providers

Provider global diset dari `.env`:

```env
LLM_PROVIDER=deepseek
LLM_MAX_TOKENS=1200

GEMINI_API_KEY=
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TEMPERATURE=
GEMINI_TOP_P=
GEMINI_MAX_TOKENS=

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5
OPENAI_TEMPERATURE=
OPENAI_TOP_P=
OPENAI_MAX_TOKENS=
OPENAI_REASONING_EFFORT=high

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_TEMPERATURE=
DEEPSEEK_TOP_P=
DEEPSEEK_MAX_TOKENS=
DEEPSEEK_REASONING_EFFORT=
DEEPSEEK_THINKING_TYPE=enabled
```

Provider yang tersedia:

- `gemini`
- `openai`
- `deepseek`

Per chat, provider/model bisa diubah lewat `/provider` dan `/model`.

## Roleplay Runtime

Aktifkan roleplay untuk chat:

```txt
/mode auto_reply
```

Roleplay runtime menyusun balasan dari beberapa layer:

1. `RecentMessageContextService`: mengambil recent chat dan membuang command noise.
2. `EmotionClassifierService`: membaca tone, intent, delta affection/trust/tension/energy, dan avoid-question.
3. `EmotionEngineService`: update state relasi dan mood dari pesan terbaru.
4. `RoleplayMemoryService`: extract dan retrieve memory relevan.
5. `QuoteDecisionService`: menentukan apakah perlu quote reply.
6. `RoleplayRouterService`: memilih route seperti `smalltalk_continue`, `emotional_care`, `factual_answer`, `meta_testing`, dan lain-lain.
7. `ConversationBuilderService`: membuat social move turn ini, misalnya factual utility, apology repair, affection/flirt, atau clarification.
8. `RoleplayAddressPlannerService`: menentukan apakah boleh menyapa user dengan nickname atau alias mesra.
9. `ResponseDirectorService`: menentukan reply shape, max sentences, question policy, self-disclosure, texture, dan playfulness.
10. `RoleplayPromptCompilerService`: menyusun prompt final.
11. `ContinuityGuardService` dan `ResponseValidatorService`: membersihkan echo, pertanyaan terlarang, self-disclosure, punctuation, dan output yang tidak natural.

### Konfigurasi Roleplay

```env
ROLEPLAY_CHARACTER_NAME=Alya
ROLEPLAY_CHARACTER_PROFILE=Karakter fiksi untuk ngobrol santai di WhatsApp. Hangat, responsif, dan punya rasa ingin tahu.
ROLEPLAY_RECENT_MESSAGE_LIMIT=14
ROLEPLAY_MEMORY_LIMIT=8

ROLEPLAY_QUOTE_ENGINE_ENABLED=true
ROLEPLAY_QUOTE_CANDIDATE_LIMIT=40
ROLEPLAY_QUOTE_MIN_CONFIDENCE=0.74
ROLEPLAY_QUOTE_PROVIDER=deepseek
ROLEPLAY_QUOTE_MODEL=deepseek-v4-flash

ROLEPLAY_ROUTER_ENABLED=false
ROLEPLAY_ROUTER_PROVIDER=deepseek
ROLEPLAY_ROUTER_MODEL=deepseek-v4-flash
ROLEPLAY_ROUTER_MIN_CONFIDENCE=0.58

ROLEPLAY_DEBUG_LOG_ENABLED=false

ROLEPLAY_EMOTION_CLASSIFIER_ENABLED=true
ROLEPLAY_EMOTION_CLASSIFIER_PROVIDER=deepseek
ROLEPLAY_EMOTION_CLASSIFIER_MODEL=deepseek-v4-flash

ROLEPLAY_MEMORY_EXTRACTOR_ENABLED=true
ROLEPLAY_MEMORY_EXTRACTOR_PROVIDER=deepseek
ROLEPLAY_MEMORY_EXTRACTOR_MODEL=deepseek-v4-flash
ROLEPLAY_MEMORY_EXTRACTOR_MIN_CONFIDENCE=0.65
ROLEPLAY_MEMORY_EXTRACTOR_MAX_MEMORIES=3
```

`ROLEPLAY_CHARACTER_NAME` dan `ROLEPLAY_CHARACTER_PROFILE` benar-benar masuk ke prompt karakter. Style, language register, linguistic profile, dan boundaries dasar saat ini berasal dari `src/roleplay/domain/default-roleplay-character.ts`.

Contoh profile yang rapi:

```env
ROLEPLAY_CHARACTER_PROFILE=Seorang wanita yang berasal dari Bandung, sangat ramah, hangat, responsif, dan punya rasa ingin tahu tinggi.
```

### Memory

Memory extractor berjalan kalau pesan punya sinyal seperti:

- nama atau panggilan
- preferensi
- boundary
- project atau goal
- "ingat" atau "jangan lupa"

Memory yang tersimpan bisa dilihat dengan:

```txt
/rp_memory
```

Memory dan history bisa dibersihkan dengan:

```txt
/rp_reset
/rp_reset memory
/rp_reset history
```

### Address dan Panggilan

Bot tidak otomatis boleh memanggil user `sayang/syg` hanya karena user menyapa karakter dengan `ay`. Alias mesra seharusnya dipakai kalau user eksplisit mengizinkan, misalnya:

```txt
panggil aku sayang
```

Nickname normal juga disimpan dari pesan seperti:

```txt
nama ku Riski, dipanggil Ki
```

## Temporary Reply

Selama `TEMP_HAI_REPLY_ENABLED=true`, pesan persis:

```txt
hai
```

akan dibalas sebelum allowlist check:

```txt
iya ada yg bisa saya bantu.
```

Matikan dengan:

```env
TEMP_HAI_REPLY_ENABLED=false
```

## Pengembangan

Tambahkan command baru di `src/bot/commands`, lalu daftarkan provider-nya di `src/bot/bot.module.ts`.

Untuk fitur roleplay, pertahankan pemisahan tanggung jawab:

- Router memilih fungsi respons.
- Conversation builder memilih social move.
- Address planner memilih panggilan.
- Response director memilih bentuk balasan.
- Prompt compiler menyusun prompt, bukan menampung semua edge case.
- Validator membersihkan output mekanis.

## Verifikasi

```bash
npm run typecheck
npm run build
```
