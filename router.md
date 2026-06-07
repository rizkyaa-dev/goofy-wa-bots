# Roleplay Router Guide

Dokumen ini menjelaskan cara kerja router roleplay: file mana yang berisi prompt,
route apa saja yang tersedia, dan bagaimana keputusan router berubah menjadi
prompt final untuk balasan WhatsApp.

## Gambaran Cepat

Roleplay runtime tidak langsung bertanya ke LLM: "balas pesan ini".

Ia melakukan beberapa tahap kecil dulu:

```txt
pesan user
-> emotion classifier membaca tone/intent
-> memory dan quote layer menyiapkan konteks
-> router memilih route respons
-> conversation builder menentukan topik dan conversational move
-> response director mengubah route menjadi plan
-> expert prompt dipilih berdasarkan route
-> prompt compiler menyusun prompt final
-> LLM final membuat balasan WhatsApp
```

Router di sini bukan intent classifier user murni. Lebih tepatnya:

```txt
router = response intent selector
```

Artinya router memilih fungsi balasan: jawab identitas, lanjut smalltalk,
menenangkan, deflect konflik, recall memory, dan seterusnya.

## Peta File

File penting:

```txt
src/roleplay/roleplay-chat.service.ts
= sutradara pipeline. Manggil classifier, memory, quote, router, director, prompt compiler.

src/roleplay/roleplay-router.service.ts
= memilih route. Di sini ada deterministic rules dan optional LLM router prompt.

src/roleplay/domain/roleplay-route.ts
= daftar route yang valid dan shape RoleplayRouteDecision.

src/roleplay/response-director.service.ts
= mengubah route menjadi response plan: mode, boleh tanya, self-disclosure, max sentences.

src/roleplay/conversation/conversation-builder.service.ts
= menentukan topic, userMove, botMove, detailHooks, warmth, dan followUpPolicy agar balasan tidak terasa mati.

src/roleplay/domain/roleplay-conversation-plan.ts
= type untuk conversation plan.

src/roleplay/domain/roleplay-response-plan.ts
= type untuk response plan.

src/roleplay/prompt/expert-prompt-registry.service.ts
= prompt khusus untuk setiap route.

src/roleplay/prompt/roleplay-prompt-compiler.service.ts
= prompt final besar. Menggabungkan character, state, memory, quote, route, expert prompt, dan output contract.

src/roleplay/emotion-classifier.service.ts
= prompt kecil untuk membaca tone dan userIntent.

src/roleplay/memory/roleplay-memory-extractor.service.ts
= prompt kecil untuk ekstrak memory.

src/roleplay/quote/quote-decision.service.ts
= prompt kecil untuk memutuskan quote-reply.
```

Kalau ingin mengubah gaya respons per route, titik edit paling enak adalah:

```txt
src/roleplay/prompt/expert-prompt-registry.service.ts
```

Kalau ingin mengubah cara route dipilih, edit:

```txt
src/roleplay/roleplay-router.service.ts
```

Kalau ingin mengubah aturan global semua balasan, edit:

```txt
src/roleplay/prompt/roleplay-prompt-compiler.service.ts
```

## Daftar Route

Route yang valid:

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

Definisinya:

```txt
answer_identity
= user tanya nama atau identitas karakter.

smalltalk_react
= obrolan ringan yang cukup diberi reaksi.

smalltalk_continue
= pertanyaan santai atau topik casual yang perlu dijawab/dilanjutkan sedikit.

tease_deflect
= godaan, canda, flirting ringan, atau sindiran playful.

emotional_care
= user terdengar capek, sedih, rentan, stress, atau butuh ditemani.

conflict_boundary
= user menekan, marah, menghina, atau melewati batas.

ambiguous_clarify
= pesan terlalu pendek, absurd, typo berat, atau tidak jelas.

memory_recall
= user minta ingat, bukti, nama/panggilan, atau konteks lama.

quote_evidence
= user butuh bukti/callback dan quote target relevan.

meta_testing
= user membahas bot, project, developer, testing, kode, atau hal teknis meta.

casual_default
= fallback umum kalau tidak cocok dengan route lain.
```

## Route Decision Shape

Router menghasilkan:

```ts
type RoleplayRouteDecision = {
  route: RoleplayRoute;
  confidence: number;
  tone: string;
  questionAllowed?: boolean;
  selfDisclosure?: 'none' | 'small' | 'normal';
  needsMemory: boolean;
  needsQuote: boolean;
  reason: string;
};
```

Contoh debug trace:

```json
{
  "route": "smalltalk_continue",
  "routeConfidence": 0.85,
  "responseMode": "light_follow_up",
  "questionAllowed": true,
  "selfDisclosure": "small"
}
```

Maknanya:

```txt
route = fungsi respons yang dipilih
confidence = seberapa yakin router
questionAllowed = boleh tambah satu pertanyaan follow-up atau tidak
selfDisclosure = seberapa boleh karakter menyisipkan reaksi/pengalaman diri
reason = alasan route, masuk ke response director section
```

## Cara Router Memilih Route

`RoleplayRouterService.route()` selalu mulai dari deterministic route.

Flow:

```txt
routeDeterministically()
-> kalau ROLEPLAY_ROUTER_ENABLED=false, pakai deterministic
-> kalau confidence deterministic >= 0.95, pakai deterministic
-> kalau router enabled dan confidence belum final, panggil LLM router
-> kalau LLM route confidence >= ROLEPLAY_ROUTER_MIN_CONFIDENCE, pakai LLM
-> kalau LLM gagal/confidence rendah, fallback deterministic
```

Env:

```env
ROLEPLAY_ROUTER_ENABLED=true
ROLEPLAY_ROUTER_PROVIDER=deepseek
ROLEPLAY_ROUTER_MODEL=deepseek-v4-flash
ROLEPLAY_ROUTER_MIN_CONFIDENCE=0.58
```

## Deterministic Rules

Urutan rules penting karena match pertama menang.

```txt
quoteIntent === evidence
-> quote_evidence

user tanya nama/identitas karakter
-> answer_identity

pesan terlalu pendek atau simbol ambigu
-> ambiguous_clarify

user menyebut bot/project/proyek/developer/develop/testing/tes/kode/program
-> meta_testing

user minta ingat/bukti/pernah/quote/reply/panggil/namaku
-> memory_recall

user konflik/menekan atau classifier tone pressuring/annoyed
-> conflict_boundary

user capek/sedih/takut/cemas/stress/down atau classifier tone vulnerable
-> emotional_care

user menggoda atau classifier tone teasing
-> tease_deflect

pesan diakhiri tanda tanya
-> smalltalk_continue

default
-> smalltalk_react
```

Keyword yang dipakai deterministic rules ada di:

```txt
isCharacterNameQuestion()
isAmbiguous()
isMetaTesting()
isMemoryRecall()
isConflict()
isEmotional()
isTeasing()
```

Semua ada di:

```txt
src/roleplay/roleplay-router.service.ts
```

## LLM Router Prompt

LLM router hanya aktif kalau:

```env
ROLEPLAY_ROUTER_ENABLED=true
```

Prompt LLM router ada di:

```txt
src/roleplay/roleplay-router.service.ts
```

System prompt-nya:

```txt
You are a cheap route classifier for a WhatsApp roleplay chatbot.
Choose the response route that best describes what the next assistant reply should do.
Route by response function, not by vague genre.
Return strict JSON only. No markdown.
```

User payload berisi:

```json
{
  "latestUserMessage": "...",
  "conversationScope": "personal_chat",
  "recentContext": "...",
  "memories": [],
  "classifier": {
    "userTone": "neutral",
    "userIntent": "asking_suggestion",
    "replyDirective": "...",
    "avoidQuestion": false
  },
  "fallback": {
    "route": "smalltalk_continue",
    "confidence": 0.68
  },
  "routes": ["answer_identity", "..."],
  "routeDefinitions": {
    "answer_identity": "User asks the character name/identity. Reply directly.",
    "smalltalk_react": "Light smalltalk where a reaction is enough.",
    "smalltalk_continue": "Casual question or topic continuation.",
    "tease_deflect": "Teasing, playful jab, flirting, or light sarcasm.",
    "emotional_care": "User is tired, sad, vulnerable, stressed, or needs warmth.",
    "conflict_boundary": "User is pressuring, angry, insulting, or pushing boundaries.",
    "ambiguous_clarify": "User message is unclear, too short, absurd, or typo-heavy.",
    "memory_recall": "User asks to remember, prove, recall, or use prior known facts.",
    "quote_evidence": "User asks for proof and quote target/evidence is relevant.",
    "meta_testing": "User mentions bot/project/developer/testing/technical meta.",
    "casual_default": "General fallback."
  },
  "outputSchema": {
    "route": "answer_identity|smalltalk_react|...",
    "confidence": "number 0..1",
    "tone": "short tone label",
    "questionAllowed": "boolean",
    "selfDisclosure": "none|small|normal",
    "needsMemory": "boolean",
    "needsQuote": "boolean",
    "reason": "short reason"
  }
}
```

LLM router tidak boleh membuat chat reply. Ia hanya memilih route.

## Router Prompt vs Expert Prompt vs Final Prompt

Ini bagian yang paling sering bikin bingung.

### Router Prompt

Lokasi:

```txt
src/roleplay/roleplay-router.service.ts
```

Tugas:

```txt
memilih route
return JSON
tidak membuat jawaban chat
```

Output contoh:

```json
{
  "route": "smalltalk_continue",
  "confidence": 0.85,
  "questionAllowed": true,
  "selfDisclosure": "small",
  "reason": "User asks a casual suggestion."
}
```

### Expert Prompt

Lokasi:

```txt
src/roleplay/prompt/expert-prompt-registry.service.ts
```

Tugas:

```txt
memberi strategi respons khusus berdasarkan route
```

Contoh route `smalltalk_continue`:

```txt
EXPERT: SMALLTALK_CONTINUE
- Tugas utama: melanjutkan obrolan santai tanpa mengubahnya jadi wawancara.
- Jawab dulu bagian yang ditanya user, lalu beri satu reaksi atau detail kecil jika natural.
- Jangan membuka biodata baru kecuali relevan dengan topik user.
```

Contoh route `conflict_boundary`:

```txt
EXPERT: CONFLICT_BOUNDARY
- Tugas utama: menjaga batasan karakter saat user menekan, menyindir keras, atau konflik.
- Boleh pendek, tegas, defensif tipis, atau menghindar.
- Jangan people-pleasing dan jangan meminta maaf berlebihan kalau karakter tidak perlu.
```

### Final Prompt

Lokasi:

```txt
src/roleplay/prompt/roleplay-prompt-compiler.service.ts
```

Tugas:

```txt
menggabungkan semua konteks menjadi prompt final untuk generator reply
```

Bagian final prompt:

```txt
CHARACTER
CURRENT EMOTION STATE
TIME CONTEXT
CONVERSATION SCOPE
LATEST USER TURN
CONVERSATION BUILDER
RESPONSE DIRECTOR
ROUTE EXPERT PROMPT
CONVERSATION SUMMARY
RELEVANT MEMORY
QUOTE REPLY DIRECTIVE
WHATSAPP OUTPUT CONTRACT
```

Jadi singkatnya:

```txt
Router prompt = milih jalur
Expert prompt = instruksi khusus jalur itu
Final prompt = bikin jawaban WhatsApp
```

## Expert Prompt Per Route

Prompt khusus per route ada di:

```txt
src/roleplay/prompt/expert-prompt-registry.service.ts
```

Mapping-nya:

```ts
const expertPrompts: Record<RoleplayRoute, string[]> = {
  answer_identity: [...],
  smalltalk_react: [...],
  smalltalk_continue: [...],
  tease_deflect: [...],
  emotional_care: [...],
  conflict_boundary: [...],
  ambiguous_clarify: [...],
  memory_recall: [...],
  quote_evidence: [...],
  meta_testing: [...],
  casual_default: [...],
};
```

Jika ingin bot lebih tegas di konflik, edit `conflict_boundary`.
Jika ingin bot lebih jarang nanya saat smalltalk, edit `smalltalk_continue`
atau logic `ResponseDirectorService`.
Jika ingin bot lebih lembut saat user capek, edit `emotional_care`.

## Conversation Builder

Conversation builder adalah layer universal setelah router. Ia tidak membuat
route baru untuk setiap topik kecil seperti paket, makan, tidur, kerja, atau
sapaan. Ia membaca pesan terbaru lalu memberi bahan conversational:

```ts
type RoleplayConversationPlan = {
  topic: string;
  userMove: RoleplayUserMove;
  botMove: RoleplayBotMove;
  detailHooks: string[];
  warmth: 'low' | 'normal' | 'playful' | 'tender';
  followUpPolicy: 'none' | 'only_if_needed' | 'one_light_question';
  avoid: string[];
  directive: string;
};
```

Contoh untuk koordinasi harian:

```json
{
  "topic": "everyday_coordination",
  "userMove": "asks_practical_instruction",
  "botMove": "answer_then_warm_texture",
  "detailHooks": ["paket", "teras", "ambil"],
  "warmth": "normal",
  "followUpPolicy": "only_if_needed",
  "avoid": ["customer service tone", "bare instruction only"],
  "directive": "Jawab kebutuhan praktisnya dengan jelas, lalu tambah satu sentuhan karakter kecil dari detail pesan agar obrolan tidak terasa mati."
}
```

Section ini masuk ke final prompt sebagai `CONVERSATION BUILDER`, sebelum
`RESPONSE DIRECTOR`. Fungsinya memberi warna dan topik hidup, sementara response
director tetap menjaga batas seperti panjang balasan dan kebijakan pertanyaan.

## Response Director

Setelah route dipilih, `ResponseDirectorService` membuat plan.

Lokasi:

```txt
src/roleplay/response-director.service.ts
```

Plan output:

```ts
type RoleplayResponsePlan = {
  route: RoleplayRoute;
  routeConfidence: number;
  mode: RoleplayReplyMode;
  questionAllowed: boolean;
  selfDisclosure: RoleplaySelfDisclosure;
  maxSentences: number;
  forbiddenTerms: string[];
  routeReason: string;
  directive: string;
};
```

Mode yang tersedia:

```txt
answer_only
react_only
light_follow_up
clarify
tease
deflect
quote_evidence
```

Route ke mode:

```txt
answer_identity -> answer_only
quote_evidence -> quote_evidence
ambiguous_clarify -> clarify
tease_deflect -> tease
conflict_boundary -> deflect
meta_testing -> deflect
smalltalk_react -> react_only
emotional_care -> react_only
memory_recall -> react_only
smalltalk_continue -> light_follow_up
```

Question policy:

```txt
classifier avoidQuestion=true -> no question
recent assistant questions >= 2 -> no question
user tanya nama -> no question
user baru menjawab pertanyaan bot -> no question kalau bot sebelumnya bertanya
latest user message berupa pertanyaan -> no question
otherwise ikuti routeDecision.questionAllowed
```

Plan ini masuk ke final prompt sebagai section:

```txt
RESPONSE DIRECTOR
Mode: ...
Route: ...
Route confidence: ...
Question allowed: yes/no
Self-disclosure: ...
Max sentences: ...
Directive: ...
```

## Contoh End-to-End

User:

```txt
menurutmu aku harus gimana?
```

Kemungkinan flow:

```txt
1. Emotion classifier:
   tone = neutral
   intent = asking_suggestion
   avoidQuestion = false

2. Quote:
   quoteAction = none

3. Memory:
   memoryCount = 0

4. Deterministic route:
   pesan diakhiri "?" -> smalltalk_continue

5. LLM router, kalau aktif:
   bisa confirm smalltalk_continue dengan confidence lebih tinggi

6. Response director:
   mode = light_follow_up
   questionAllowed = true
   selfDisclosure = small
   maxSentences = 2

7. Expert prompt:
   ambil EXPERT: SMALLTALK_CONTINUE

8. Final prompt:
   CHARACTER
   CURRENT EMOTION STATE
   LATEST USER TURN
   RESPONSE DIRECTOR
   ROUTE EXPERT PROMPT
   RELEVANT MEMORY
   QUOTE REPLY DIRECTIVE
   WHATSAPP OUTPUT CONTRACT

9. LLM final:
   membuat balasan WhatsApp sebagai karakter.
```

Debug trace bisa terlihat seperti:

```json
{
  "tone": "neutral",
  "intent": "asking_suggestion",
  "memoryCount": 0,
  "quoteAction": "none",
  "route": "smalltalk_continue",
  "routeConfidence": 0.85,
  "responseMode": "light_follow_up",
  "questionAllowed": true,
  "selfDisclosure": "small"
}
```

## Cara Tuning Cepat

Kalau output terlalu sering bertanya:

```txt
edit src/roleplay/response-director.service.ts
atau perketat expert prompt smalltalk_continue
```

Kalau route sering salah:

```txt
edit deterministic keyword di roleplay-router.service.ts
atau perjelas routeDefinitions di LLM router prompt
```

Kalau jawaban tiap route kurang berkarakter:

```txt
edit expert-prompt-registry.service.ts
```

Kalau jawaban terlalu panjang/formal:

```txt
edit WHATSAPP OUTPUT CONTRACT di roleplay-prompt-compiler.service.ts
dan ResponseValidatorService
```

Kalau bot sering mengingat hal tidak relevan:

```txt
edit RoleplayMemoryService.retrieve()
atau naikkan ROLEPLAY_MEMORY_EXTRACTOR_MIN_CONFIDENCE
```

Kalau quote terlalu sering:

```txt
naikkan ROLEPLAY_QUOTE_MIN_CONFIDENCE
atau edit QuoteDecisionService prompt
```

## Mental Model

Bayangkan pipeline ini seperti ruang kecil sebelum karakter menjawab:

```txt
Emotion classifier: "nada user gimana?"
Memory layer: "ada informasi lama yang relevan?"
Quote layer: "perlu mengutip pesan lama?"
Router: "fungsi balasan apa yang cocok?"
Response director: "bentuk balasannya seberapa panjang, boleh tanya atau tidak?"
Expert prompt: "strategi khusus route ini apa?"
Prompt compiler: "oke, semua masuk ke prompt final."
Final LLM: "baru sekarang jawab sebagai karakter."
```

Kalau ingin debugging, aktifkan:

```env
ROLEPLAY_DEBUG_LOG_ENABLED=true
```

Lalu baca trace `RoleplayChatService`. Trace itu adalah ringkasan keputusan
pipeline, bukan prompt mentah, tapi sangat dekat dengan struktur prompt final.
