# Roleplay Runtime Schema

Dokumen ini menjelaskan flow lengkap runtime roleplay untuk mode `auto_reply`.
Runtime ini bukan satu prompt tunggal. Ia adalah pipeline multi-step yang memakai
state, memory, route planning, quote decision, prompt compiler, dan output guard.

## Entry Point

Roleplay hanya berjalan untuk pesan biasa, bukan command, ketika setting chat adalah
`auto_reply`.

Flow awal:

```txt
WhatsApp message
-> WhatsappWebClientService.handleMessage()
-> normalize menjadi IncomingMessage
-> command langsung ke BotOrchestratorService.handle()
-> non-command masuk WhatsappReplyBatcherService
-> BotOrchestratorService.handleBatch()
-> RoleplayChatService.generateReply()
```

Command dikenali dari prefix `/` atau `!`. Command membatalkan batch yang sedang
menunggu supaya pesan command tidak tercampur dengan percakapan roleplay.

## Batching

Pesan non-command masuk ke `WhatsappReplyBatcherService`.

Tujuan batching:

- Menggabungkan beberapa bubble pendek dari user menjadi satu turn.
- Menghindari bot menjawab terlalu cepat sebelum user selesai mengetik.
- Membatalkan jawaban lama kalau ada pesan baru saat typing delay.

Env yang mempengaruhi:

```env
BOT_REPLY_BATCHING_ENABLED=true
BOT_REPLY_MIN_QUIET_MS=2800
BOT_REPLY_FRAGMENT_QUIET_MS=8000
BOT_REPLY_LONG_TEXT_QUIET_MS=12000
BOT_REPLY_MAX_WAIT_MS=25000
BOT_REPLY_BATCH_MAX_MESSAGES=8
```

Delay dipilih dengan aturan:

```txt
message terlihat incomplete -> BOT_REPLY_FRAGMENT_QUIET_MS
message panjang atau batch >= 3 -> BOT_REPLY_LONG_TEXT_QUIET_MS
lainnya -> BOT_REPLY_MIN_QUIET_MS
tidak boleh melebihi BOT_REPLY_MAX_WAIT_MS
```

Jika ada banyak pesan dalam satu batch, `BotOrchestratorService` membuat satu
`IncomingMessage` sintetis dengan body gabungan:

```txt
pesan pertama
pesan kedua
pesan ketiga
```

## Bot Orchestrator

`BotOrchestratorService` melakukan gatekeeping sebelum roleplay:

```txt
dedupe message id
-> temporary greeting reply check
-> allowlist check
-> record inbound message
-> get/create ContactSetting
-> stop kalau mode silent atau command_only
-> generate roleplay reply
-> record outbound reply
```

Mode yang tersedia:

```txt
command_only: hanya command yang dibalas
auto_reply: pesan biasa dibalas oleh roleplay runtime
silent: pesan biasa diam
```

Allowlist memakai:

```env
BOT_OWNER_NUMBER=
BOT_ALLOWED_NUMBERS=
BOT_DEFAULT_MODE=command_only
```

Catatan: `TEMP_HAI_REPLY_ENABLED=true` akan membalas pesan persis `hai` sebelum
allowlist check. Untuk deployment normal, nilai aman adalah `false`.

## RoleplayChatService Pipeline

`RoleplayChatService.generateReply()` adalah use-case utama.

Urutan aktual:

```txt
1. Ambil previous RoleplayState
2. Ambil recent conversation context
3. Analyze emotion dengan EmotionClassifierService
4. Hitung state patch rule-based dengan EmotionEngineService
5. Gabungkan delta classifier ke state patch
6. Simpan state baru
7. Capture memory dari inbound message
8. Retrieve memory relevan
9. Retrieve quote candidates dari recent inbound messages
10. Decide quote action dengan QuoteDecisionService
11. Filter quote decision dengan QuotePolicyService
12. Tentukan conversation scope: personal_chat atau group_chat
13. Route turn dengan RoleplayRouterService
14. Buat response plan dengan ResponseDirectorService
15. Ambil character profile
16. Compile final prompt
17. Generate reply memakai LlmService
18. Clean raw reply
19. Apply ContinuityGuardService
20. Apply ResponseValidatorService
21. Return BotReply
```

Output akhir:

```ts
type BotReply = {
  text: string;
  quoteMessageId?: string;
};
```

Jika quote decision valid, `quoteMessageId` diisi dan WhatsApp mengirim reply
dengan quoted bubble.

## Conversation Context

Recent context dibangun oleh `RecentMessageContextService`.

Sumber data:

```txt
ConversationMessage table
-> filter command noise
-> map inbound menjadi user
-> map outbound menjadi assistant
-> coalesce consecutive messages dengan role sama
```

Env:

```env
ROLEPLAY_RECENT_MESSAGE_LIMIT=14
```

Command noise dibuang supaya prompt roleplay tidak tercemar output seperti:

```txt
Mode diubah...
Provider chat...
Memory roleplay...
Command tersedia...
```

## Emotion Layer

Ada dua sumber emotion:

1. `EmotionEngineService`: rule-based.
2. `EmotionClassifierService`: LLM JSON classifier, optional.

### Rule-Based Emotion Engine

Engine membaca kata-kata seperti:

```txt
positive: makasih, thanks, wkwk, sayang, kangen
negative: bodoh, benci, diam, goblok
pressure: harus, cepet, sekarang juga, wajib
vulnerable: capek, sedih, takut, sendiri
meta: bot, project, developer, testing, kode
teasing: genit, modus, gombal, bawel
```

Lalu menghitung:

```txt
mood
affection
trust
energy
tension
```

Nilai state di-clamp ke `0..100`.

### LLM Emotion Classifier

Env:

```env
ROLEPLAY_EMOTION_CLASSIFIER_ENABLED=true
ROLEPLAY_EMOTION_CLASSIFIER_PROVIDER=deepseek
ROLEPLAY_EMOTION_CLASSIFIER_MODEL=deepseek-v4-flash
```

Input classifier:

```json
{
  "recentContext": "...",
  "latestUserMessage": "...",
  "schema": {
    "userTone": "neutral|warm|playful|teasing|vulnerable|annoyed|pressuring|awkward",
    "userIntent": "short_snake_case",
    "affectionDelta": "integer -5..5",
    "trustDelta": "integer -5..5",
    "tensionDelta": "integer -5..5",
    "energyDelta": "integer -5..5",
    "avoidQuestion": "boolean",
    "replyDirective": "short instruction for the reply generator"
  }
}
```

Classifier wajib membalas strict JSON. Kalau gagal, fallback:

```txt
userTone: neutral
userIntent: continue_conversation
all deltas: 0
avoidQuestion: false
replyDirective: Read the user literally and respond naturally.
```

## Memory Layer

Memory dikelola oleh `RoleplayMemoryService`.

Jenis memory:

```txt
user_fact
relationship
episode
preference
boundary
goal
```

Capture flow:

```txt
skip kalau user sedang minta bukti/memory meta
-> rule-based fallback extraction
-> kalau extractor enabled dan trigger cocok: panggil LLM extractor
-> merge fallback + LLM extraction
-> validate confidence, limit, length, ttl
-> cari memory mirip
-> update existing atau create baru
```

Env:

```env
ROLEPLAY_MEMORY_LIMIT=8
ROLEPLAY_MEMORY_EXTRACTOR_ENABLED=true
ROLEPLAY_MEMORY_EXTRACTOR_PROVIDER=deepseek
ROLEPLAY_MEMORY_EXTRACTOR_MODEL=deepseek-v4-flash
ROLEPLAY_MEMORY_EXTRACTOR_MIN_CONFIDENCE=0.65
ROLEPLAY_MEMORY_EXTRACTOR_MAX_MEMORIES=3
```

Trigger extractor:

```txt
namaku
nama aku
panggil aku
aku suka
aku gak suka
ingat
jangan lupa
besok
nanti
biasanya
aku lagi
aku punya
aku kerja
aku kuliah
project
proyek
jangan panggil
jangan bahas
aku mau
aku pengen
```

Fallback rule-based menangkap:

```txt
nama/panggilan -> user_fact
jangan panggil / jangan bahas -> boundary
aku suka / aku tidak suka -> preference
project / aku mau / aku pengen -> goal
ingat / jangan lupa -> episode
```

TTL:

```txt
session -> 1 hari
short_term -> 14 hari
long_term -> tidak expire
```

Retrieve memory mengambil memory belum expired, diurutkan:

```txt
importance desc
updatedAt desc
limit ROLEPLAY_MEMORY_LIMIT
```

## Quote Layer

Quote layer menentukan apakah reply perlu mengutip pesan user sebelumnya.

Flow:

```txt
QuoteCandidateRetrieverService
-> ambil recent messages
-> filter command noise
-> ambil inbound message yang punya messageId
-> QuoteDecisionService minta keputusan LLM
-> QuotePolicyService validasi action, confidence, target, safety
```

Env:

```env
ROLEPLAY_QUOTE_ENGINE_ENABLED=true
ROLEPLAY_QUOTE_CANDIDATE_LIMIT=40
ROLEPLAY_QUOTE_MIN_CONFIDENCE=0.74
```

Intent quote:

```txt
none
clarify
evidence
tease
callback
contradiction
boundary
emotional_recall
```

Quote ditolak kalau:

- Engine disabled.
- Action bukan `quote_reply`.
- Confidence di bawah threshold.
- Target message tidak ada di candidate.
- Target adalah command.
- Target mengandung secret/sensitive data seperti API key, password, token, OTP, PIN, rekening, kartu kredit, CVV.
- Quote mencoba memakai latest message sebagai evidence/callback/contradiction yang tidak valid.

## Routing Layer

Router memilih fungsi respons turn ini.

Routes:

```txt
answer_identity
smalltalk_react
smalltalk_continue
tease_deflect
emotional_care
conflict_boundary
ambiguous_clarify
memory_recall
quote_evidence
meta_testing
casual_default
```

Flow router:

```txt
deterministic route
-> kalau ROLEPLAY_ROUTER_ENABLED=false: pakai deterministic
-> kalau deterministic confidence >= 0.95: pakai deterministic
-> kalau enabled: panggil LLM router
-> pakai LLM route kalau confidence >= ROLEPLAY_ROUTER_MIN_CONFIDENCE
-> kalau LLM gagal atau confidence rendah: fallback deterministic
```

Env:

```env
ROLEPLAY_ROUTER_ENABLED=true
ROLEPLAY_ROUTER_PROVIDER=deepseek
ROLEPLAY_ROUTER_MODEL=deepseek-v4-flash
ROLEPLAY_ROUTER_MIN_CONFIDENCE=0.58
```

Deterministic rules:

```txt
quoteIntent evidence -> quote_evidence
pertanyaan nama/identity -> answer_identity
pesan terlalu pendek/ambigu -> ambiguous_clarify
bot/project/developer/testing/kode -> meta_testing
ingat/bukti/pernah/quote/panggil/namaku -> memory_recall
konflik/pressure/annoyed -> conflict_boundary
capek/sedih/takut/stress/down -> emotional_care
teasing/gombal/wkwk/haha -> tease_deflect
diakhiri tanda tanya -> smalltalk_continue
default -> smalltalk_react
```

LLM router diminta membalas JSON:

```json
{
  "route": "answer_identity|smalltalk_react|...",
  "confidence": 0.0,
  "tone": "short tone label",
  "questionAllowed": true,
  "selfDisclosure": "none|small|normal",
  "needsMemory": true,
  "needsQuote": false,
  "reason": "short reason"
}
```

## Response Director

`ResponseDirectorService` mengubah route dan analysis menjadi response plan.

Output:

```ts
type RoleplayResponsePlan = {
  route: RoleplayRoute;
  routeConfidence: number;
  mode: RoleplayReplyMode;
  questionAllowed: boolean;
  selfDisclosure: 'none' | 'small' | 'normal';
  maxSentences: number;
  forbiddenTerms: string[];
  routeReason: string;
  directive: string;
};
```

Modes:

```txt
answer_only
react_only
light_follow_up
clarify
tease
deflect
quote_evidence
```

Question policy:

```txt
avoidQuestion dari classifier -> no question
recent assistant questions >= 2 -> no question
user tanya nama karakter -> no question
user baru menjawab pertanyaan bot -> no question kalau sebelumnya bot sudah bertanya
latest user message adalah pertanyaan -> no question
otherwise ikuti routeDecision.questionAllowed
```

Max sentence:

```txt
questionAllowed=true -> max 2 sentences
questionAllowed=false -> max 1 sentence
```

Personal chat forbidden terms:

```txt
pada
kalian
guys
semua
```

## Character Profile

Profile disusun oleh `CharacterProfileService`.

Sumber:

```txt
ROLEPLAY_CHARACTER_NAME
ROLEPLAY_CHARACTER_PROFILE
defaultRoleplayCharacter.style
defaultRoleplayCharacter.languageRegister
defaultRoleplayCharacter.linguisticProfile
defaultRoleplayCharacter.boundaries
persona override dari /persona
```

Env:

```env
ROLEPLAY_CHARACTER_NAME=Alya
ROLEPLAY_CHARACTER_PROFILE=...
```

Catatan: saat dokumen ini ditulis, `ROLEPLAY_CHARACTER_STYLE` dan
`ROLEPLAY_BOUNDARIES` di `.env.example` belum dipakai oleh `CharacterProfileService`.
Style dan boundaries masih datang dari `default-roleplay-character.ts`.

## Time Context

`TimeContextService` membuat konteks waktu Asia/Jakarta:

```txt
nowText
dateText
weekdayText
isWeekend
dayPeriod: morning|afternoon|evening|night
lastInteractionText
minutesSinceLastInteraction
```

Directive waktu:

```txt
interaksi awal -> jangan pura-pura punya sejarah
< 10 menit -> jangan menyapa ulang
> 12 jam -> boleh menyinggung jarak waktu halus
night -> nuansa lebih tenang/pelan/lelah
default -> jaga kesinambungan waktu
```

## Final Prompt Compiler

`RoleplayPromptCompilerService.compile()` menghasilkan:

```ts
[
  {
    role: 'system',
    content: createSystemPrompt(input),
  },
  ...recentMessages,
]
```

System prompt sections:

```txt
1. Runtime identity
2. CHARACTER
3. LANGUAGE REGISTER
4. LINGUISTIC PROFILE
5. ROLEPLAY PRINCIPLES
6. CURRENT EMOTION STATE
7. TIME CONTEXT
8. CONVERSATION SCOPE
9. RESPONSE DIRECTOR
10. ROUTE EXPERT PROMPT
11. CONVERSATION SUMMARY
12. RELEVANT MEMORY
13. QUOTE REPLY DIRECTIVE
14. WHATSAPP OUTPUT CONTRACT
```

### Runtime Identity

Mengarahkan model agar membalas sebagai karakter WhatsApp, bukan sebagai AI,
model bahasa, system, database, engine, state, atau memory internal.

### Character

Berisi:

```txt
Nama
Profil
Gaya bicara
Persona override chat
Batasan
```

### Language Register

Mengatur pilihan kata:

```txt
default aku/kamu
jangan gonta-ganti register
hindari gue/lo atau dialek kuat kecuali konteks mendukung
kalau ragu, santai netral
```

### Linguistic Profile

Mengatur tekstur bahasa:

```txt
slang hanya bumbu
jangan formal/EYD/customer-service
jangan recycle hehe/wkwk
sindiran harus ringan dan berbasis konteks
```

### Roleplay Principles

Prinsip utama:

```txt
karakter punya mood, agenda, rutinitas, batasan
tidak otomatis setuju atau patuh
boleh menolak, deflect, bercanda, diam, menjawab sebagian
jangan menjadi interviewer
jangan membaca pikiran user
jangan mengontrol tindakan/perasaan/ucapan user
chemistry berkembang pelan
jangan klaim continuity tanpa bukti
```

### Current Emotion State

Masuk ke prompt sebagai internal state:

```txt
Mood
Affection
Trust
Energy
Tension
Emotion directive
Classifier tone
Classifier intent
Classifier directive
```

Model dilarang menyebut state ini secara eksplisit di chat.

### Response Director

Bagian ini adalah instruksi turn-specific:

```txt
Mode
Route
Route confidence
Route reason
Question allowed
Self-disclosure
Max sentences
Forbidden terms
Directive
```

Prompt menyatakan bahwa response director lebih spesifik daripada aturan pacing
umum.

### Route Expert Prompt

Setiap route punya strategi khusus:

```txt
answer_identity -> jawab identitas langsung
smalltalk_react -> reaksi natural, bukan interview
smalltalk_continue -> jawab dulu bagian user
tease_deflect -> playful pendek
emotional_care -> validasi hangat, bukan konselor formal
conflict_boundary -> tegas, tidak people-pleasing
ambiguous_clarify -> minta maksud pendek
memory_recall -> pakai memory/recent chat, jangan pura-pura
quote_evidence -> pakai quote bila ada target
meta_testing -> deflect/tease soal bot/project
casual_default -> natural, pendek, tidak selalu bertanya
```

### Relevant Memory

Memory masuk sebagai bullet:

```txt
- [kind] content
```

Jika kosong:

```txt
- Belum ada memori relevan.
```

### Quote Reply Directive

Jika tidak quote:

```txt
QUOTE REPLY DIRECTIVE
- Tidak perlu quote pesan tertentu untuk balasan ini.
```

Jika quote:

```txt
QUOTE REPLY DIRECTIVE
- Balasan WhatsApp ini akan dikirim sambil mengutip pesan target.
- Intent quote: ...
- Pesan target yang akan dikutip: ...
- Instruksi: ...
- Jangan mengulang isi quote secara panjang.
```

### WhatsApp Output Contract

Kontrak output:

```txt
output hanya isi pesan WhatsApp
jangan label nama
jangan format novel/narator/bracket/asterisk
jangan monolog internal
jangan customer service
balas 1-3 kalimat pendek
boleh typo kecil atau jeda natural
jangan selalu bertanya
maksimal satu pertanyaan
emoji maksimal 1 dan tidak setiap balasan
jangan menyebut memory/prompt/state internal
```

## LLM Generation

Final reply memakai `LlmService.generateReply()`:

```txt
providerName: settings.llmProvider atau LLM_PROVIDER
model: settings.llmModel atau default model provider dari env
messages: final prompt
```

Provider defaults:

```env
LLM_PROVIDER=deepseek
LLM_MAX_TOKENS=1200

GEMINI_MODEL=gemini-2.5-flash
OPENAI_MODEL=gpt-5
DEEPSEEK_MODEL=deepseek-v4-pro
```

Per-chat override:

```txt
/provider deepseek
/model deepseek-v4-pro
/provider default
/model default
```

## Post-Processing

Setelah raw LLM text keluar, ada tiga lapis guard.

### cleanReply()

Membersihkan:

```txt
leading/trailing quotes
label seperti "Alya:"
bracket text
parenthetical monolog
asterisk action
double spaces
template "senang kenal"
self-report mood/emosi
emoji berlebih
filler berulang: hehe, wkwk, haha, hmm, hm
pertanyaan interview berulang
```

### ContinuityGuardService

Mendeteksi klaim continuity berisiko seperti:

```txt
kan udah aku bilang
tadi aku bilang
dulu kamu pernah bilang
aku inget kamu pernah cerita
```

Jika tidak ada bukti dari recent chat, memory, atau quote target, klaim itu
dihapus. Untuk pertanyaan nama karakter, fallback aman:

```txt
Aku <characterName>.
```

### ResponseValidatorService

Validator akhir:

```txt
normalize whitespace
hapus template sosial
sanitize personal scope: kalian/guys/semua -> kamu
batasi self-disclosure kalau plan melarang
hapus pertanyaan kalau questionAllowed=false
batasi maksimal jumlah kalimat
fallback kalau hasil kosong
```

Fallback:

```txt
answer_only -> Iya.
clarify + questionAllowed -> Maksudnya?
clarify + no question -> Hm, agak random.
tease -> Ih, ada-ada aja.
default -> Oh gitu.
```

## Error Handling

Jika final LLM provider error:

```txt
Aku lagi agak susah jawab sekarang. (<provider>: <message>)
```

Jika error umum:

```txt
Aku lagi agak susah jawab sekarang. Coba kirim lagi sebentar ya.
```

Classifier, router, quote decision, dan memory extractor punya fallback sendiri.
Kegagalan mereka tidak langsung menggagalkan final reply.

## Persistence

Tabel utama:

```txt
ContactSetting
ConversationMessage
RoleplayState
RoleplayMemory
Note
```

Inbound message disimpan sebelum roleplay generate.
Outbound reply disimpan setelah `BotReply` dibuat.

`RoleplayState.lastInteractionAt` diupdate saat inbound diproses. Time context
final memakai previous state, sehingga "last interaction" merepresentasikan jarak
dari interaksi sebelumnya, bukan pesan saat ini.

## Operational Notes

Untuk mengaktifkan roleplay di chat:

```txt
/mode auto_reply
```

Untuk reset:

```txt
/rp_reset
/rp_reset state
/rp_reset memory
/rp_reset history
```

Untuk cek memory:

```txt
/rp_memory
```

Untuk ganti karakter per chat:

```txt
/persona teks persona
/persona reset
```

Untuk ganti provider/model per chat:

```txt
/provider deepseek
/model deepseek-v4-pro
/provider default
/model default
```

## High-Level Mental Model

Runtime ini bisa dibaca sebagai:

```txt
input WhatsApp
-> batching
-> policy/mode gate
-> context builder
-> state analyzer
-> memory writer/reader
-> quote planner
-> route planner
-> response planner
-> prompt compiler
-> LLM generator
-> output guards
-> WhatsApp sender
```

Planner kecil boleh gagal dan fallback. Generator final tetap berusaha menjawab
dengan konteks terbaik yang tersedia.
