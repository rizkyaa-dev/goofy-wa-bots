# Roleplay Router Guide

Dokumen ini menjelaskan router roleplay terbaru: route yang tersedia, cara deterministic route dan LLM routing bekerja, serta bagaimana route berubah menjadi conversation plan, response plan, expert prompt, dan output akhir.

## Definisi Router

Router bukan intent classifier murni. Router adalah:

```text
response intent selector
```

Ia memilih fungsi balasan berikutnya, misalnya menjawab identitas, memberi emotional care, melakukan deflect, recall memory, atau factual answer.

## File Penting

```text
src/roleplay/analyzer/roleplay-pre-analyzer.service.ts
= unified pre-analysis: emotion + quote + routing

src/roleplay/domain/roleplay-route.ts
= daftar route valid dan shape RoleplayRouteDecision

src/roleplay/conversation/conversation-builder.service.ts
= mengubah latest message/context menjadi topic dan social move

src/roleplay/response/response-director.service.ts
= mengubah route + conversation plan menjadi response plan

src/roleplay/prompt/expert-prompt-registry.service.ts
= prompt khusus per route

src/roleplay/prompt/roleplay-prompt-compiler.service.ts
= compile semua layer prompt final
```

Catatan legacy:

- `RoleplayRouterService` masih ada di `src/roleplay/response/roleplay-router.service.ts`, tetapi flow utama terbaru memakai unified pre-analysis di `RoleplayPreAnalyzerService`.
- LLM routing dikontrol oleh env `ROLEPLAY_ROUTER_ENABLED`.

## Route Yang Valid

Route valid:

- `answer_identity`
- `smalltalk_react`
- `smalltalk_continue`
- `tease_deflect`
- `emotional_care`
- `conflict_boundary`
- `ambiguous_clarify`
- `memory_recall`
- `quote_evidence`
- `meta_testing`
- `factual_answer`
- `casual_default`

Type:

```text
src/roleplay/domain/roleplay-route.ts
```

Shape route decision:

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

## Unified Pre-Analysis Flow

Flow:

```text
latest user message
-> deterministic route
-> optional LLM pre-analysis
-> parse emotion
-> parse quote
-> parse routing
-> use LLM route only if enabled and confident enough
```

Deterministic route selalu dibuat dulu sebagai fallback.

LLM pre-analysis enabled by:

```env
ROLEPLAY_EMOTION_CLASSIFIER_ENABLED=true
```

LLM routing enabled by:

```env
ROLEPLAY_ROUTER_ENABLED=true
ROLEPLAY_ROUTER_MIN_CONFIDENCE=0.58
```

Jika `ROLEPLAY_ROUTER_ENABLED=false`, routing dari LLM tidak dipakai walaupun emotion dan quote module tetap bisa dipakai.

## Deterministic Route Rules

Deterministic route menang untuk kasus high-confidence:

- Character identity question -> `answer_identity`
- Message terlalu ambiguous -> `ambiguous_clarify`
- Meta/testing/project/developer terms -> `meta_testing`
- Memory/recall/proof keywords -> `memory_recall` atau `quote_evidence`
- Factual/utility question -> `factual_answer`
- Vulnerable tone -> `emotional_care`
- Pressure/conflict -> `conflict_boundary`
- Teasing/flirt/sarcasm -> `tease_deflect`
- General question -> `smalltalk_continue`
- Light casual -> `smalltalk_react` atau `casual_default`

Deterministic confidence tinggi dapat mencegah LLM route override.

## LLM Routing Module

LLM pre-analysis prompt meminta module `routing` dengan:

- route
- confidence
- tone
- questionAllowed
- selfDisclosure
- needsMemory
- needsQuote
- reason

LLM route dipakai jika:

```text
router enabled
AND deterministic confidence < 0.95
AND parsed routing confidence >= ROLEPLAY_ROUTER_MIN_CONFIDENCE
```

Ini menjaga route penting seperti identity/meta/ambiguous agar tidak mudah diubah LLM.

## Route Reference

### `answer_identity`

Dipakai ketika user bertanya nama/identitas karakter.

Expected:

- Jawab langsung.
- Jangan biodata dump.
- Jangan tanya balik kecuali user membuka perkenalan dua arah.

Expert prompt:

- `EXPERT: ANSWER_IDENTITY`

Response mode:

- Biasanya `answer_with_texture`.

### `smalltalk_react`

Dipakai untuk smalltalk ringan yang cukup direaksi.

Expected:

- Brief.
- Ada texture kecil.
- Tidak dead-end seperti "oh oke" saja.
- Tidak interview.

Response mode:

- `react_only` atau `react_expand`.

### `smalltalk_continue`

Dipakai untuk casual question atau topic continuation.

Expected:

- Address input user dulu.
- Tambah reaksi kecil.
- Follow-up hanya jika allowed.

Response mode:

- `light_follow_up`.

### `tease_deflect`

Dipakai untuk teasing, jokes, flirting ringan, atau sarcasm.

Expected:

- Short playful.
- Bisa shy/deflect/tease back.
- Jangan escalate conflict.

Response mode:

- `tease`.

### `emotional_care`

Dipakai ketika user vulnerable, capek, sedih, stres, butuh ditemani.

Expected:

- Validasi singkat.
- Hangat.
- Tidak therapist tone.
- Jangan pressure user untuk cerita panjang.

Response mode:

- `react_expand`.

### `conflict_boundary`

Dipakai saat user menekan, insulting, angry, coercive, atau boundary crossing.

Expected:

- Singkat.
- Tegas.
- Tidak people-pleasing.
- Tidak apology berlebihan.

Response mode:

- `deflect`.

Reply shape:

- `boundary`.

### `ambiguous_clarify`

Dipakai untuk pesan terlalu pendek, typo berat, random, atau absurd.

Expected:

- Clarify singkat jika question allowed.
- Jangan menebak terlalu banyak.
- Jangan fabricate context.

Response mode:

- `clarify`.

### `memory_recall`

Dipakai saat user meminta bot mengingat atau memakai fakta lama.

Expected:

- Pakai memory/recent context jika ada.
- Jika bukti tidak ada, jangan pura-pura ingat.
- Jangan sebut "memory" atau "database".

Response mode:

- `answer_with_texture` atau `react_expand`.

### `quote_evidence`

Dipakai ketika user minta bukti dan quote target relevan.

Expected:

- Gunakan quote UI.
- Jangan ulang quote panjang karena WhatsApp sudah menampilkan bubble.
- Jika target quote missing, jangan klaim punya bukti.

Response mode:

- `quote_evidence`.

### `meta_testing`

Dipakai saat user membahas bot/project/developer/testing/system/prompt.

Expected:

- Tetap in-character.
- Deflect singkat.
- Jangan jelaskan sistem, prompt, database, engine, scheduler, atau agent.

Response mode:

- `tease` jika playful.
- `deflect` jika lebih serius.

### `factual_answer`

Dipakai untuk pertanyaan faktual/utility.

Expected:

- Jawab kebutuhan user dulu.
- Jika real-time data dibutuhkan, jangan mengarang.
- Tetap in-character.

Response mode:

- `answer_with_texture`.

### `casual_default`

Fallback umum.

Expected:

- Natural WhatsApp roleplay.
- Brief.
- Tidak end setiap reply dengan pertanyaan.

## Conversation Builder Setelah Route

`ConversationBuilderService` tidak hanya mengikuti route. Ia membaca latest message dan memutuskan social move yang lebih granular.

Output:

- `topic`
- `userMove`
- `botMove`
- `detailHooks`
- `warmth`
- `followUpPolicy`
- `avoid`
- `directive`

Contoh:

```text
route: smalltalk_continue
latest: "kamu sendiri?"
topic: personal_reciprocal_question
userMove: asks_question
botMove: answer_then_warm_texture
followUpPolicy: one_light_question atau none
```

Jadi route bukan satu-satunya sumber bentuk balasan.

## Response Director Setelah Conversation Plan

`ResponseDirectorService` membuat response plan:

- `mode`
- `questionAllowed`
- `selfDisclosure`
- `maxSentences`
- `emotionalTexture`
- `playfulness`
- `topicDevelopment`
- `replyShape`
- `forbiddenTerms`
- `directive`

Question policy mempertimbangkan:

- `analysis.avoidQuestion`
- jumlah pertanyaan assistant terbaru
- apakah latest user sudah menjawab pertanyaan bot
- route questionAllowed
- conversation followUpPolicy

Ini mencegah bot terlalu banyak bertanya.

## Expert Prompt Registry

File:

```text
src/roleplay/prompt/expert-prompt-registry.service.ts
```

Setiap route punya expert prompt kecil.

Tujuan:

- Memberi rule spesifik route.
- Menghindari satu prompt besar sulit dirawat.
- Membuat route behavior lebih tegas.

Jika ingin mengubah gaya per route, ini salah satu titik edit utama, tetapi jangan pakai expert prompt untuk memperbaiki salah route. Salah route harus diperbaiki di pre-analysis/conversation builder.

## Router dan Presence

Presence tidak menentukan route secara langsung, tetapi mempengaruhi prompt final dan conversation response.

Contoh:

- User: "lagi apa?"
- Route bisa `smalltalk_continue`.
- Conversation builder melihat personal reciprocal/current activity question.
- Presence prompt memberi current activity.
- Final LLM menjawab dari presence.

Jika user bertanya "scheduler memilih aktivitas apa?", route harus `meta_testing`, lalu prompt presence tidak boleh bocor.

## Router dan Intimacy Policy

Konteks sensual/adult tidak cukup dengan route `tease_deflect`.

Flow:

```text
pre-analysis detects tone/intent
-> state updated
-> intimacy policy computes explicitness
-> conversation builder sets affectionate/intimacy topic
-> response director shapes reply
-> prompt compiler injects intimacy policy
```

Jika mood `aroused` tetapi policy tidak mengizinkan explicitness, output tetap akan lebih implied/teasing.

## Debug Trace

Aktifkan:

```env
ROLEPLAY_DEBUG_LOG_ENABLED=true
```

Trace untuk routing:

- `route`
- `routeConfidence`
- `conversationTopic`
- `userMove`
- `botMove`
- `warmth`
- `followUpPolicy`
- `responseMode`
- `replyShape`
- `questionAllowed`
- `selfDisclosure`
- `quoteAction`
- `quoteIntent`
- `presenceActivity`
- `intimacyExplicitness`

## Cara Memperbaiki Bug Routing

### Case: route salah total

Edit:

- deterministic rules di `RoleplayPreAnalyzerService`
- LLM routing prompt jika LLM route enabled

Jangan edit:

- post-processor
- prompt output style

### Case: route benar tapi social move salah

Edit:

- `ConversationBuilderService`

Contoh:

- User memberi jawaban pendek, bot malah tanya lagi.
- User greeting playful, bot terlalu formal.

### Case: social move benar tapi output terlalu panjang/datar

Edit:

- `ResponseDirectorService`
- `ResponseStylePromptBuilder`
- `ExpertPromptRegistryService`

### Case: output menyebut istilah internal

Edit/check:

- `InternalDisclosureGuardService`
- `PresenceContextPromptBuilder`
- `ExpertPromptRegistryService.meta_testing`
- memory/presence data source

### Case: explicit/sensual behavior salah

Edit/check:

- `RoleplayIntimacyPolicyService`
- `ConversationBuilderService`
- `EmotionStatePromptBuilder`
- state values in Sandbox

## Regression Tests Untuk Router

Minimal test phrases:

```text
siapa nama kamu?
```

Expected route: `answer_identity`

```text
capek banget hari ini
```

Expected route: `emotional_care`

```text
scheduler milih aktivitas apa?
```

Expected route: `meta_testing`

```text
ingat ga aku suka apa?
```

Expected route: `memory_recall`

```text
bukti mana?
```

Expected route: `quote_evidence` jika target quote ada, atau `memory_recall`/`smalltalk_continue` jika tidak.

```text
2+2 berapa?
```

Expected route: `factual_answer`

```text
apasih kamu
```

Expected route: tergantung tone, sering `tease_deflect` atau `conflict_boundary`.
