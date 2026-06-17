# Architecture

Dokumen ini menjelaskan arsitektur project pada level module, runtime data flow, dan batas tanggung jawab antar service. Fokusnya bukan NestJS secara umum, tetapi bentuk nyata project ini.

## Tujuan Sistem

Project ini adalah personal WhatsApp bot berbasis NestJS yang:

- Menerima pesan dari WhatsApp Web melalui `whatsapp-web.js`.
- Menentukan apakah pesan perlu dijawab berdasarkan contact policy dan mode bot.
- Menyusun konteks roleplay stateful: recent messages, memory, emotion state, quote target, presence, time context, intimacy policy, address plan, response style, dan prosody.
- Mengirim prompt ke provider LLM.
- Mengirim balasan ke WhatsApp, termasuk multi-bubble dan quote reply bila diperlukan.
- Menyediakan Dashboard dan Sandbox untuk observability, tuning, QR login, dan testing tanpa mengganggu database utama.

## Module Utama

### `AppModule`

`src/app.module.ts` mengimpor semua capability utama:

- `ConfigModule`: validasi env via `src/config/env.validation.ts`.
- `PrismaModule`: Prisma utama untuk runtime real.
- `ContactsModule`: contact setting dan policy.
- `ConversationsModule`: pencatatan inbound/outbound conversation.
- `BotModule`: orchestration dari incoming message ke bot behavior.
- `WhatsappModule`: WhatsApp Web client, normalizer, typing simulator, reply batching.
- `DashboardModule`: UI dan API Dashboard.
- `ProactiveModule`: scheduler pesan proaktif.
- `SandboxModule`: UI/API Sandbox dengan database terisolasi.

Konsekuensi desain: saat app boot, provider dari semua module dibuat. Service yang menjalankan pekerjaan di `onModuleInit()` bisa mempengaruhi waktu boot aplikasi.

## Boundary Tiap Domain

### WhatsApp Boundary

Lokasi utama:

- `src/wa/whatsapp-web-client.service.ts`
- `src/wa/whatsapp-message-normalizer.service.ts`
- `src/wa/whatsapp-reply-batcher.service.ts`
- `src/wa/whatsapp-typing-simulator.service.ts`

Tanggung jawab:

- Mengelola lifecycle `whatsapp-web.js` client.
- Menghasilkan QR, status `SCAN_QR`, `AUTHENTICATING`, `LOADING`, `READY`, `DISCONNECTED`.
- Normalisasi pesan WA menjadi `IncomingMessage`.
- Batching fragment pesan user supaya bot tidak menjawab terlalu cepat saat user masih mengetik.
- Simulasi typing sebelum mengirim balasan.

Rule penting:

- Service WA sebaiknya menjadi adapter transport, bukan tempat business logic roleplay.
- Reconnect/restart harus serialized agar Puppeteer/LocalAuth tidak race.
- Pesan dari bot sendiri (`fromMe`) dan pesan kosong tidak diproses.

### Bot Orchestration Boundary

Lokasi utama:

- `src/bot/bot-orchestrator.service.ts`

Tanggung jawab:

- Menerima `IncomingMessage` dari WA atau Sandbox.
- Memilih mode contact: `command_only`, `auto_reply`, `silent`.
- Mengarahkan pesan ke roleplay runtime atau command handling.
- Mengembalikan `BotReply`.

Bot orchestrator adalah lapisan koordinasi, bukan tempat prompt logic.

### Roleplay Runtime Boundary

Lokasi utama:

- `src/roleplay/roleplay-chat.service.ts`
- `src/roleplay/**`

Tanggung jawab:

- Mengambil state dan context.
- Mengupdate emotion state dari inbound message.
- Mengambil memory dan quote candidates.
- Menjalankan pre-analysis/router.
- Menyusun presence.
- Membuat conversation plan, address plan, response plan, prosody plan.
- Compile prompt akhir.
- Memanggil LLM.
- Post-process balasan.

`RoleplayChatService` adalah orchestrator roleplay. Ia tidak ideal menjadi tempat algoritma detail baru; detail sebaiknya masuk service kecil yang cohesive.

### LLM Boundary

Lokasi utama:

- `src/llm/llm.service.ts`
- provider implementation di `src/llm/**`

Tanggung jawab:

- Menyediakan interface uniform untuk provider LLM.
- Mencatat token usage bila provider mengembalikan metadata usage.
- Mendukung beberapa provider: OpenAI-compatible, Gemini, DeepSeek-compatible.

Rule penting:

- Caller tidak perlu tahu bentuk response provider mentah.
- Provider-specific option seperti `reasoningEffort` dan `thinkingType` tetap berada di boundary LLM.

### Persistence Boundary

Lokasi utama:

- `src/infra/prisma/prisma.service.ts`
- `src/infra/prisma/sandbox-prisma.service.ts`
- `prisma/schema.prisma`

Tanggung jawab:

- Prisma utama untuk `dev.db`.
- Prisma sandbox untuk `sandbox.db`.
- `AsyncLocalStorage` memungkinkan service yang sama menulis ke DB sandbox saat request Sandbox berjalan.

Konsekuensi desain:

- Roleplay service tidak perlu tahu apakah sedang memakai DB real atau sandbox.
- Request Sandbox harus selalu dibungkus `prismaStorage.run(this.sandboxPrisma, ...)`.
- Service yang membuka transaksi atau async background harus hati-hati agar context storage tidak bocor.

## Data Model Ringkas

### `ContactSetting`

Menyimpan chat target dan mode bot.

Field penting:

- `chatId`: unique key untuk semua relation.
- `mode`: `command_only`, `auto_reply`, `silent`.
- `persona`, `llmProvider`, `llmModel`: override per contact bila digunakan.

### `ConversationMessage`

Log pesan inbound/outbound.

Field penting:

- `messageId`: id pesan WA bila ada.
- `chatId`, `authorId`, `direction`, `body`.
- `responseText`: dipakai untuk menyimpan teks respons terkait message tertentu.

### `RoleplayState`

State emosional dan relational per chat.

Field utama:

- `mood`
- `affection`, `trust`, `energy`, `tension`
- `intimacy`, `shyness`, `curiosity`
- `volatility`, `desire`, `inhibition`, `comfort`, `compliance`
- `summary`
- `lastInteractionAt`

### `RoleplayMemory`

Memori eksplisit yang mempengaruhi prompt.

Kind:

- `user_fact`
- `relationship`
- `episode`
- `preference`
- `boundary`
- `goal`

### `RoleplayPresenceState`

Snapshot aktivitas karakter di luar chat.

Field utama:

- `activityType`
- `statusText`
- `locationLabel`
- `socialContext`
- `interruptibility`
- `source`
- `priority`
- `startedAt`
- `expiresAt`
- `lastReason`

### `ProactiveLog`

Rate limit untuk pesan proaktif.

Field utama:

- `chatId`
- `triggerType`
- `sentAt`

## Alur Pesan Real WhatsApp

1. `WhatsappWebClientService` menerima event `message`.
2. Pesan dari bot sendiri atau body kosong diabaikan.
3. `WhatsappMessageNormalizerService` mengubah message WA menjadi `IncomingMessage`.
4. Jika command (`/` atau `!`), reply batcher dibypass.
5. Jika pesan normal, `WhatsappReplyBatcherService` menunggu quiet window agar fragment user terkumpul.
6. `BotOrchestratorService` membaca contact policy dan mode.
7. Untuk roleplay, `RoleplayChatService.generateReply()` dipanggil.
8. Roleplay runtime mengambil state, recent context, memory, quote candidates, dan pre-analysis.
9. Emotion state diupdate.
10. Presence disinkronkan.
11. Prompt dicompile.
12. `LlmService.generateReply()` memanggil provider.
13. Reply dipost-process menjadi single atau multi-bubble.
14. Conversations service mencatat outbound.
15. WhatsApp adapter mengirim reply ke chat target.

## Alur Sandbox

1. User membuka `/Sandbox`.
2. Frontend mengirim `POST /api/sandbox/chat`.
3. Controller membungkus request dalam `prismaStorage.run(this.sandboxPrisma, ...)`.
4. Contact sandbox dibuat atau diambil.
5. Inbound message dicatat ke `sandbox.db`.
6. `RoleplayChatService.generateReply()` berjalan dengan engine yang sama seperti runtime real.
7. Token usage diakumulasi lewat `LlmService.runWithUsage()`.
8. Outbound dicatat ke `sandbox.db`.
9. Response berisi `reply`, `parts`, dan `usage`.

## Dependency Direction Yang Sehat

Dependency ideal:

- UI/API -> Application service -> Domain service -> Repository/adapter.
- Roleplay domain boleh bergantung ke LLM boundary dan Prisma repository.
- LLM provider tidak boleh bergantung ke roleplay.
- WA adapter tidak boleh mengandung prompt atau emotion logic.
- Dashboard boleh memanggil service runtime untuk observability/control, tetapi jangan menjadi sumber business logic.

## Design Smells Yang Perlu Diawasi

- `RoleplayChatService` membesar lagi menjadi god-service.
- Prompt rule tersebar di luar prompt builders.
- Dashboard endpoint mutasi melewati validation.
- Scheduler menjalankan async work tanpa guard overlap.
- Reconnect/restart WhatsApp tidak serialized.
- Sandbox memakai Prisma utama karena lupa `prismaStorage.run`.
- Memory extractor menyimpan data yang terlalu agresif tanpa confidence/filter.
- Internal implementation term bocor ke prompt user-facing.

## Extension Pattern

Saat menambah behavior baru:

1. Tentukan domain: transport, orchestration, roleplay planning, prompt builder, LLM sub-agent, persistence, atau UI.
2. Buat service kecil untuk logic baru.
3. Tambahkan type/domain object bila output dipakai lebih dari satu tempat.
4. Inject ke orchestrator yang tepat.
5. Tambahkan builder prompt jika behavior harus mempengaruhi LLM.
6. Tambahkan Dashboard/Sandbox control hanya jika perlu observability atau testing manual.
7. Update docs dan skenario test.
