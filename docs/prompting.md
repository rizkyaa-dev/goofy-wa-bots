# Prompting System

Dokumen ini menjelaskan bagaimana prompt roleplay disusun, bagaimana sub-agent LLM dipakai, dan cara aman memodifikasi prompting tanpa membuat leakage atau behavior regressions.

## Prinsip Prompting Project

Prompting project ini bukan satu prompt besar statis. Prompt akhir adalah komposisi beberapa layer:

- Character foundation
- Emotion state
- Intimacy policy
- Off-chat presence
- Time context
- Conversation builder
- Response style
- Memory, quote, output rules

Tujuan komposisi:

- Setiap layer punya tanggung jawab spesifik.
- Perubahan behavior bisa dilokalisasi.
- Runtime bisa menggabungkan rule-based planning dan LLM generation.
- Prompt leakage bisa dikontrol lebih baik.

## Prompt Compiler

Lokasi:

- `src/roleplay/prompt/roleplay-prompt-compiler.service.ts`

Behavior:

1. Menerima `CompileInput`.
2. Memanggil prompt builders sesuai urutan.
3. Menggabungkan line menjadi satu system prompt.
4. Menambahkan `recentMessages` setelah system prompt.

Urutan builder penting karena layer awal membentuk identity/state, sedangkan layer akhir mengatur output behavior.

Urutan saat ini:

1. `CharacterFoundationPromptBuilder`
2. `EmotionStatePromptBuilder`
3. `IntimacyPolicyPromptBuilder`
4. `PresenceContextPromptBuilder`
5. `TimeContextPromptBuilder`
6. `ConversationContextPromptBuilder`
7. `ResponseStylePromptBuilder`
8. `MemoryQuoteOutputPromptBuilder`

## Roleplay Runtime Sebelum Prompt

Lokasi:

- `src/roleplay/roleplay-chat.service.ts`

Sebelum prompt dicompile, runtime membangun beberapa object:

- `previousState`
- `recentMessages`
- `memories`
- `quoteCandidates`
- `preAnalysis`
- `analysis`
- `routeDecision`
- `state`
- `intimacyPolicy`
- `presence`
- `quoteDecision`
- `conversationPlan`
- `addressPlan`
- `responsePlan`
- `prosodyPlan`
- `profile`

Prompt builder sebaiknya membaca object ini, bukan menghitung ulang logic domain.

## Character Foundation Layer

Fungsi:

- Menetapkan identitas karakter.
- Menetapkan gaya dasar.
- Menetapkan pronoun dan batas general.

Rule:

- Jangan masukkan state dinamis di layer ini.
- Jangan masukkan contoh percakapan yang terlalu spesifik kecuali benar-benar stabil.
- Persona global sebaiknya ringkas dan kuat.

## Emotion State Layer

Fungsi:

- Menginformasikan state numerik dan mood.
- Mengubah tone, energy, responsiveness, playfulness, vulnerability, dan intimacy.

Input utama:

- `RoleplayState`

Output prompt harus memberi arah behavior, bukan menyuruh model menyebut angka state.

Bad pattern:

```text
Your affection is 50/100. Tell user your affection score.
```

Good pattern:

```text
Affection is moderate; be warm but not clingy.
```

## Intimacy Policy Layer

Fungsi:

- Menentukan level explicitness dan tone dewasa.
- Menghindari refusal generik bila state dan konteks mengizinkan.
- Tetap menjaga boundary terhadap pressure, unsafe context, atau mismatch.

Policy bukan pengganti moderation eksternal. Ia adalah runtime style gate untuk roleplay context.

## Presence Layer

Fungsi:

- Membuat karakter terasa hidup di luar chat.
- Memberi jawaban natural untuk pertanyaan seperti "lagi apa", "di mana", atau "kenapa lama".

Prompt rule penting:

- Presence bukan script untuk didump.
- Jika user tidak menanyakan aktivitas, presence hanya boleh muncul sebagai subtle trace.
- Jangan menyebut `scheduler`, `agent`, `backend`, `database`, `state`, `source`, atau istilah internal.

## Time Context Layer

Fungsi:

- Memberi konteks waktu lokal.
- Membantu tone pagi/siang/malam.
- Membantu continuity dari `lastInteractionAt`.

Rule:

- Jangan membuat model mengarang jadwal panjang.
- Time context harus mendukung response, bukan mendominasi.

## Conversation Builder Layer

Fungsi:

- Memberi social move untuk turn terbaru.
- Menentukan topic, user move, bot move, warmth, follow-up policy, avoid list, dan directive.

Layer ini sangat penting untuk mengurangi jawaban generik.

Contoh:

- User greeting -> `greeting`, `react_then_continue`.
- User flirting -> `affectionate_flirt`, `playful_affection`.
- User asks factual -> `factual_utility`, answer first.
- User meta -> deflect in-character.

## Address Plan Layer

Fungsi:

- Mengatur panggilan user.
- Menentukan kapan memakai nickname atau affectionate alias.

Known behavior:

- `ay`, `ayang`, `sayang`, `syg` terdeteksi sebagai affectionate alias.
- Address planner dapat menormalisasi alias tertentu.
- Prompt menginstruksikan agar alias tidak dipakai di setiap reply.

Risiko:

- Jika alias terlalu mudah aktif, bot terasa selalu memanggil user `sayang`.
- Jika alias disimpan sebagai memory tanpa konteks, behavior bisa sulit hilang.

Mitigasi:

- Batasi trigger explicit permission.
- Periksa memory terkait alias.
- Jangan menjadikan affectionate alias sebagai preferred nickname biasa.

## Response Style Layer

Fungsi:

- Mengatur bentuk reply.
- Menentukan single/multi bubble tendency.
- Mengatur jumlah pertanyaan.
- Mengatur self-disclosure.
- Mengurangi generic assistant tone.

Layer ini harus berbasis `responsePlan` dan `prosodyPlan`.

## Memory/Quote/Output Layer

Fungsi:

- Menginformasikan memory relevan.
- Mengatur penggunaan quote target.
- Mengatur output format.
- Menghindari overexplaining.

Rule:

- Memory harus dipakai sebagai context, bukan dibacakan mentah.
- Quote target harus dipakai jika quote policy memilih `quote_reply`.
- Output harus chatty dan sesuai prosody plan.

## LLM Sub-Agent

Sub-agent di project ini adalah LLM call kecil sebelum prompt utama, bukan worker terpisah.

Contoh:

- Emotion classifier.
- Memory extractor.
- Quote/router logic jika enabled.
- Presence agent.

Rule sub-agent:

- Input harus structured.
- Output harus typed/JSON bila dipakai untuk state.
- Timeout harus pendek.
- Harus ada fallback rule-based.
- Output harus disanitasi sebelum disimpan atau diinjeksi ke prompt.

## Presence Agent Prompt

Lokasi:

- `src/roleplay/presence/roleplay-presence-agent.service.ts`

Job:

- Refinement status aktivitas, bukan chat.
- Return strict JSON.
- Menjaga continuity.
- Membuat status natural bahasa Indonesia.
- Tidak menyebut AI/bot/model/prompt/system/database/scheduler.

Fallback:

- Jika error/timeout/invalid JSON, gunakan baseline director.

## Anti-Leakage Strategy

Prompt leakage bisa terjadi dari:

- Prompt builder yang menyebut istilah internal.
- Presence status yang mengandung istilah internal.
- Memory yang menyimpan istilah internal.
- Recent message user yang memancing "scheduler memilih aktivitas apa".
- Model yang menjawab meta secara literal.

Layer mitigasi:

1. Prompt rule: jangan sebut implementation words.
2. Conversation builder: meta testing harus deflect in-character.
3. Internal disclosure guard: sanitasi generated snippet.
4. Post-processor: bersihkan output akhir jika perlu.
5. Memory extractor: jangan simpan prompt/system/internal implementation.

## Cara Aman Mengubah Prompt

1. Tentukan layer yang bertanggung jawab.
2. Jangan edit character foundation untuk masalah yang sebenarnya response style.
3. Jangan edit response style untuk masalah yang sebenarnya conversation route.
4. Jangan menambah larangan global panjang jika bisa diselesaikan dengan planner.
5. Tambahkan examples hanya jika behavior sulit dicapai dengan rule.
6. Test di Sandbox dengan state reset.
7. Test dengan recent context panjang.
8. Test prompt injection/meta question.
9. Cek token usage.

## Prompt Smells

- Terlalu banyak "never" tanpa positive instruction.
- Rule bertentangan antar layer.
- Prompt menyebut istilah internal yang harusnya disembunyikan.
- State angka disuruh disebut eksplisit.
- Presence terlalu dominan di semua reply.
- Memory dibacakan seperti database.
- Output rule terlalu rigid sehingga chat terasa template.

## Debugging Prompt Behavior

Langkah:

1. Aktifkan `ROLEPLAY_DEBUG_LOG_ENABLED=true`.
2. Test di Sandbox.
3. Catat route, conversation topic, mood, presence source, response plan, address mode.
4. Cek apakah behavior buruk berasal dari planning atau generation.
5. Jika planning salah, ubah service planner/router.
6. Jika planning benar tapi output salah, ubah prompt builder atau post-processor.
7. Jika output menyebut internal term, cek source context dan guard.
