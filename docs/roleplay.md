# Roleplay Runtime Schema

Dokumen ini menjelaskan flow runtime roleplay terbaru untuk bot WhatsApp ini. Runtime roleplay bukan satu prompt tunggal, melainkan pipeline bertahap yang menggabungkan state, memory, quote, route, presence, intimacy policy, conversation planning, response planning, prosody, prompt compiler, LLM, dan post-processing.

Untuk overview arsitektur global, lihat [architecture.md](./architecture.md). Untuk detail prompt layer, lihat [prompting.md](./prompting.md).

## Entry Point

Roleplay berjalan ketika:

- Pesan bukan command.
- Contact mode memungkinkan auto reply.
- Bot orchestrator memutuskan pesan perlu dijawab.

Flow real WhatsApp:

```text
WhatsApp message
-> WhatsappWebClientService.handleMessage()
-> WhatsappMessageNormalizerService.normalize()
-> WhatsappReplyBatcherService.enqueue()
-> BotOrchestratorService.handle()
-> RoleplayChatService.generateReply()
```

Command dikenali dari prefix:

```text
/
!
```

Command membypass reply batching agar tidak tercampur dengan percakapan roleplay.

## Reply Batching

Service:

```text
src/wa/whatsapp-reply-batcher.service.ts
```

Tujuan:

- Menggabungkan beberapa bubble pendek user menjadi satu turn.
- Mencegah bot menjawab terlalu cepat.
- Membatalkan flush lama jika user mengirim pesan baru.

Env terkait:

```env
BOT_REPLY_BATCHING_ENABLED=true
BOT_REPLY_MIN_QUIET_MS=2800
BOT_REPLY_FRAGMENT_QUIET_MS=8000
BOT_REPLY_LONG_TEXT_QUIET_MS=12000
BOT_REPLY_MAX_WAIT_MS=25000
BOT_REPLY_BATCH_MAX_MESSAGES=8
```

Jika batching aktif, pesan user bisa digabung seperti:

```text
pesan pertama
pesan kedua
pesan ketiga
```

Roleplay runtime melihat gabungan itu sebagai latest turn.

## Roleplay Main Pipeline

Service utama:

```text
src/roleplay/roleplay-chat.service.ts
```

Urutan terbaru:

```text
getOrCreate previous RoleplayState
-> build recentMessages
-> capture inbound memory
-> retrieve relevant memories
-> retrieve quote candidates
-> preAnalyzer.analyze()
-> emotionEngine.evaluateInbound()
-> apply analysis deltas
-> update state
-> intimacyPolicy.create()
-> presence.syncForConversation()
-> quotePolicy.apply()
-> conversationBuilder.create()
-> addressPlanner.create()
-> responseDirector.createPlan()
-> prosodyPlanner.create()
-> characterProfile.getProfile()
-> promptCompiler.compile()
-> llm.generateReply()
-> replyPostProcessor.process()
```

## Previous State

Repository:

```text
src/roleplay/state/roleplay-state.repository.ts
```

State disimpan per `chatId`.

Field utama:

- `mood`
- `affection`
- `trust`
- `energy`
- `tension`
- `intimacy`
- `shyness`
- `curiosity`
- `volatility`
- `desire`
- `inhibition`
- `comfort`
- `compliance`
- `summary`
- `lastInteractionAt`

State selalu diclamp agar tetap valid.

## Recent Context

Service:

```text
src/roleplay/context/recent-message-context.service.ts
```

Recent messages menjadi:

- Context bagi pre-analysis.
- Context bagi prompt final.
- Bahan conversation builder.
- Bahan presence agent.

Limit:

```env
ROLEPLAY_RECENT_MESSAGE_LIMIT=14
```

## Memory Layer

Service:

```text
src/roleplay/memory/roleplay-memory.service.ts
```

Flow:

```text
captureFromInbound()
-> retrieve()
-> inject selected memories into prompt
```

Memory kind:

- `user_fact`
- `relationship`
- `episode`
- `preference`
- `boundary`
- `goal`

Extractor LLM:

```env
ROLEPLAY_MEMORY_EXTRACTOR_ENABLED=true
ROLEPLAY_MEMORY_EXTRACTOR_PROVIDER=...
ROLEPLAY_MEMORY_EXTRACTOR_MODEL=...
ROLEPLAY_MEMORY_EXTRACTOR_MIN_CONFIDENCE=0.65
ROLEPLAY_MEMORY_EXTRACTOR_MAX_MEMORIES=3
```

Fallback extractor tetap menangani identity/nickname/affectionate alias/boundary sederhana.

## Quote Layer

Services:

```text
src/roleplay/quote/quote-candidate-retriever.service.ts
src/roleplay/quote/quote-policy.service.ts
```

Quote decision sekarang berasal dari unified pre-analysis, lalu dipolicy ulang.

Quote intent:

- `none`
- `clarify`
- `evidence`
- `tease`
- `callback`
- `contradiction`
- `boundary`
- `emotional_recall`

Quote reply hanya dipakai jika quote materially membantu. Latest user turn tidak boleh menjadi quote target.

## Unified Pre-Analysis

Service:

```text
src/roleplay/analyzer/roleplay-pre-analyzer.service.ts
```

Pre-analysis menghasilkan:

```text
emotion
quote
routing
```

Emotion module:

- user tone dan intent.
- delta untuk relationship/emotion/drive params.
- avoidQuestion.
- replyDirective.

Quote module:

- none atau quote_reply.
- target message.
- quote intent.
- instruction.

Routing module:

- route.
- confidence.
- questionAllowed.
- selfDisclosure.
- needsMemory.
- needsQuote.
- reason.

Jika LLM pre-analysis gagal, fallback deterministic tetap digunakan.

## Emotion State Update

Flow:

```text
EmotionEngineService.evaluateInbound(previousState, message)
-> RoleplayChatService.applyAnalysis()
-> RoleplayStateRepository.updateAfterInbound()
```

`applyAnalysis()` menjumlahkan delta dari pre-analysis:

- affection
- trust
- tension
- energy
- intimacy
- shyness
- curiosity
- volatility
- desire
- inhibition
- comfort
- compliance

Mood yang didukung:

- `neutral`
- `happy`
- `sad`
- `annoyed`
- `warm`
- `playful`
- `sleepy`
- `excited`
- `jealous`
- `worried`
- `swing`
- `sensual`
- `flirty`
- `aroused`
- `needy`

Catatan:

- Mood bukan satu-satunya sumber behavior.
- Mood `aroused` tidak otomatis berarti explicit sexual output.
- Intimacy policy tetap menentukan batas explicitness.

## Intimacy Policy

Service:

```text
src/roleplay/intimacy/roleplay-intimacy-policy.service.ts
```

Policy membaca:

- state terbaru
- latest user message
- analysis
- route decision
- conversation scope

Output:

- explicitness
- tone
- constraints

Tujuan:

- Menghasilkan adult/sensual behavior yang konsisten dengan state dan context.
- Menghindari refusal generic ketika context memang mendukung.
- Tetap menahan diri saat tension, pressure, unsafe context, atau mismatch.

## Off-Chat Presence

Services:

```text
src/roleplay/presence/roleplay-presence.service.ts
src/roleplay/presence/roleplay-presence-director.service.ts
src/roleplay/presence/roleplay-presence-agent.service.ts
src/roleplay/presence/roleplay-presence-scheduler.service.ts
```

Presence membuat karakter punya aktivitas di luar chat.

Flow saat conversation:

```text
ensure current presence
-> director decides keep/adjust/replace
-> optional LLM presence agent refines draft
-> repository saves RoleplayPresenceState
-> prompt compiler injects presence
```

Presence state:

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

LLM presence agent:

```env
ROLEPLAY_PRESENCE_AGENT_ENABLED=true
ROLEPLAY_PRESENCE_AGENT_PROVIDER=...
ROLEPLAY_PRESENCE_AGENT_MODEL=...
ROLEPLAY_PRESENCE_AGENT_TEMPERATURE=...
ROLEPLAY_PRESENCE_AGENT_MAX_TOKENS=700
ROLEPLAY_PRESENCE_AGENT_TIMEOUT_MS=6000
```

Jika gagal, baseline director dipakai.

## Conversation Plan

Service:

```text
src/roleplay/conversation/conversation-builder.service.ts
```

Output:

- `topic`
- `userMove`
- `botMove`
- `detailHooks`
- `warmth`
- `followUpPolicy`
- `avoid`
- `directive`

User move:

- `greeting`
- `asks_identity`
- `offers_identity`
- `asks_question`
- `gives_advice`
- `shares_update`
- `asks_practical_instruction`
- `corrects_clarifies`
- `asks_clarification_about_bot`
- `asks_to_complete_bot_fragment`
- `teases`
- `flirts`
- `requests_affection`
- `apologizes`
- `asks_factual`
- `vents`
- `pressures_or_conflicts`
- `meta`
- `continues_topic`

Bot move:

- `answer_directly`
- `react_then_continue`
- `answer_then_warm_texture`
- `acknowledge_then_deflect`
- `clarify_briefly`
- `comfort_briefly`
- `tease_lightly`
- `playful_affection`
- `soft_boundary_affection`
- `reassure_lightly`
- `explain_previous_casually`
- `complete_previous_fragment`

## Address Plan

Service:

```text
src/roleplay/address/roleplay-address-planner.service.ts
```

Output:

- `mode`: `none`, `nickname`, `affectionate`, `teasing_affectionate`
- `preferredName`
- `preferredNickname`
- `affectionateAlias`
- `shouldMirrorUserRegister`
- `avoidHybridNickname`
- `directive`

Known detail:

- `sayang`, `syg`, `ayang`, `ay` dianggap affectionate alias.
- Bot tidak seharusnya memakai alias di setiap reply.
- Boundary memory seperti "jangan panggil aku sayang" harus dihormati.

## Response Plan

Service:

```text
src/roleplay/response/response-director.service.ts
```

Output:

- `route`
- `routeConfidence`
- `mode`
- `questionAllowed`
- `selfDisclosure`
- `maxSentences`
- `emotionalTexture`
- `playfulness`
- `topicDevelopment`
- `replyShape`
- `forbiddenTerms`
- `routeReason`
- `directive`

Reply mode:

- `answer_only`
- `answer_with_texture`
- `react_only`
- `react_expand`
- `light_follow_up`
- `clarify`
- `tease`
- `deflect`
- `quote_evidence`

Reply shape:

- `answer_react`
- `answer_texture`
- `react_expand`
- `comfort_anchor`
- `tease_deflect`
- `reassure_repair`
- `explain_clarify`
- `clarify_briefly`
- `boundary`

## Prosody Plan

Service:

```text
src/roleplay/prosody/conversational-prosody-planner.service.ts
```

Prosody menentukan:

- rhythm
- max bubbles
- delimiter
- sentence fallback split
- inter-bubble delay

Env:

```env
ROLEPLAY_MULTI_BUBBLE_ENABLED=true
ROLEPLAY_MULTI_BUBBLE_MAX_PARTS=3
```

## Prompt Compilation

Service:

```text
src/roleplay/prompt/roleplay-prompt-compiler.service.ts
```

Builder order:

```text
CharacterFoundationPromptBuilder
EmotionStatePromptBuilder
IntimacyPolicyPromptBuilder
PresenceContextPromptBuilder
TimeContextPromptBuilder
ConversationContextPromptBuilder
ResponseStylePromptBuilder
MemoryQuoteOutputPromptBuilder
```

Prompt final:

```text
system prompt
-> recent messages
```

Latest user turn ada di system prompt sebagai authoritative latest turn. Recent messages hanya context.

## LLM Call

LLM dipanggil melalui:

```text
src/llm/llm.service.ts
```

Provider/model berasal dari contact settings:

- `settings.llmProvider`
- `settings.llmModel`

Token usage:

- Provider OpenAI-compatible dan Gemini dapat mengembalikan usage.
- Sandbox mengakumulasi usage seluruh LLM call dalam satu turn via `runWithUsage()`.

## Post-Processing

Service:

```text
src/roleplay/response/roleplay-reply-post-processor.service.ts
```

Tanggung jawab:

- Membersihkan output.
- Split multi-bubble.
- Apply quote target id.
- Menjaga max bubble.
- Menjaga usage metadata.

Fallback LLM error:

```text
Aku lagi agak susah jawab sekarang. Coba kirim lagi sebentar ya.
```

Jika error provider terdeteksi:

```text
Aku lagi agak susah jawab sekarang. (<provider>: <message>)
```

## Prompt Leakage Defense

Layer defense:

1. Conversation builder untuk meta route.
2. Expert prompt `meta_testing`.
3. Presence prompt melarang implementation words.
4. `InternalDisclosureGuardService`.
5. Post-processing dan memory hygiene.

Istilah internal yang tidak boleh keluar:

- scheduler
- prompt
- system
- model
- agent
- backend
- database
- state
- source
- route
- priority
- rules

## Sandbox Runtime

Sandbox memakai engine yang sama, tapi DB berbeda.

Flow:

```text
POST /api/sandbox/chat
-> prismaStorage.run(sandboxPrisma)
-> record inbound in sandbox.db
-> roleplayChat.generateReply()
-> record outbound in sandbox.db
-> return reply parts and token usage
```

Ini membuat Sandbox cocok untuk prompt/state testing tanpa mengotori `dev.db`.

## Debug Trace

Aktifkan:

```env
ROLEPLAY_DEBUG_LOG_ENABLED=true
```

Trace penting:

- tone
- userIntent
- route
- routeConfidence
- conversationTopic
- userMove
- botMove
- warmth
- followUpPolicy
- responseMode
- replyShape
- questionAllowed
- selfDisclosure
- prosodyRhythm
- maxBubbles
- presenceActivity
- presenceSource
- presenceStatus
- intimacyExplicitness
- intimacyTone
- memoryCount
- quoteAction
- quoteIntent

## Extension Rule

Jika ingin menambah behavior baru:

1. Tambahkan detection di pre-analysis atau conversation builder.
2. Tambahkan domain type jika output dipakai lintas service.
3. Tambahkan response plan rule jika bentuk reply berubah.
4. Tambahkan prompt builder rule hanya jika planner belum cukup.
5. Tambahkan post-processor rule hanya untuk output safety/format.
6. Tambahkan skenario di [bot-test-scenarios.md](./bot-test-scenarios.md).
