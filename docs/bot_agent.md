# Bot Agent Map

Dokumen ini memetakan agent utama, sub-agent, dan orchestration flow terbaru di project ini. Project ini belum memakai multi-agent framework formal. Bentuknya lebih tepat disebut:

```text
orchestrated single-agent runtime with specialized sub-agents
```

Artinya, hanya ada satu conversational agent utama yang menjawab user, tetapi ia dibantu banyak service kecil yang bertindak seperti sub-agent domain: analysis, memory, routing, quote, presence, prompt, response shaping, dan post-processing.

## Ringkasan Agent

| Layer | Agent/Service | Peran |
| --- | --- | --- |
| Transport | `WhatsappWebClientService` | Adapter WhatsApp Web, QR, reconnect, receive/send message |
| Global orchestration | `BotOrchestratorService` | Gatekeeping, contact mode, command/roleplay routing, conversation logging |
| Main conversational agent | `RoleplayChatService` | Conductor pipeline roleplay |
| Pre-analysis sub-agent | `RoleplayPreAnalyzerService` | Unified emotion, quote, dan routing pre-analysis |
| Emotion/state | `EmotionEngineService` | Heuristic state patch dari inbound message |
| Memory | `RoleplayMemoryService` + extractor | Capture, retrieve, fallback memory extraction |
| Quote | `QuoteCandidateRetrieverService` + `QuotePolicyService` | Candidate retrieval dan policy quote reply |
| Presence | `RoleplayPresenceService` + director + agent | Off-chat activity continuity |
| Conversation planning | `ConversationBuilderService` | Topic, user move, bot move, warmth, follow-up policy |
| Address planning | `RoleplayAddressPlannerService` | Nickname, preferred name, affectionate alias |
| Intimacy policy | `RoleplayIntimacyPolicyService` | Explicitness/tone gate untuk konteks sensual/adult |
| Response shaping | `ResponseDirectorService` | Reply mode, shape, max sentences, question policy |
| Prosody | `ConversationalProsodyPlannerService` | Bubble count, delimiter, rhythm, delay |
| Prompt compilation | `RoleplayPromptCompilerService` | Menggabungkan prompt builders menjadi system prompt final |
| Post-processing | `RoleplayReplyPostProcessorService` | Bersihkan, split bubble, quote id, usage passthrough |
| Proactive flow | `ProactiveSchedulerService` | Pesan proaktif berdasarkan jadwal/inaktivitas |
| Dashboard/Sandbox | `DashboardService`, `SandboxController` | Observability, tuning, testing terisolasi |

## Agent Utama

### 1. Transport Agent: `WhatsappWebClientService`

File:

```text
src/wa/whatsapp-web-client.service.ts
```

Tanggung jawab:

- Membuat dan mengelola `whatsapp-web.js` client.
- Mengelola QR, LocalAuth, Chromium/Puppeteer, dan status koneksi.
- Menangani event `qr`, `authenticated`, `ready`, `loading_screen`, `change_state`, `auth_failure`, `disconnected`, `message`, dan `chat_state_change`.
- Menormalisasi lifecycle reconnect/restart agar tidak race.
- Mengirim reply ke WhatsApp dengan typing simulation.

Catatan terbaru:

- Manual restart dashboard, scheduled reconnect, dan module init harus serialized lewat lifecycle operation queue.
- Disconnect reason `LOGOUT` dan `UNPAIRED*` harus membersihkan LocalAuth session.
- Service ini tidak boleh berisi prompt logic.

### 2. Global Orchestrator: `BotOrchestratorService`

File:

```text
src/bot/bot-orchestrator.service.ts
```

Tanggung jawab:

- Menerima `IncomingMessage`.
- Deduplicate message.
- Mengecek temporary reply atau command.
- Mengecek contact policy.
- Mengambil atau membuat `ContactSetting`.
- Menghormati mode `silent`, `command_only`, dan `auto_reply`.
- Mencatat inbound/outbound conversation.
- Memanggil `RoleplayChatService` untuk roleplay reply.

Boundary:

- Boleh tahu contact mode.
- Tidak boleh tahu detail prompt, emotion state, atau presence logic.

### 3. Main Conversational Agent: `RoleplayChatService`

File:

```text
src/roleplay/roleplay-chat.service.ts
```

Peran:

`RoleplayChatService` adalah conductor utama. Ia bukan sub-agent khusus, tetapi runtime coordinator yang mengatur urutan semua sub-agent.

Flow ringkas:

```text
get previous state
-> build recent messages
-> capture and retrieve memory
-> retrieve quote candidates
-> pre-analysis: emotion + quote + route
-> update emotion state
-> create intimacy policy
-> sync off-chat presence
-> apply quote policy
-> build conversation plan
-> build address plan
-> build response plan
-> build prosody plan
-> load character profile
-> compile prompt
-> call LLM
-> post-process reply
```

Risiko arsitektural:

- Service ini mudah menjadi god-service.
- Penambahan logic baru sebaiknya dimasukkan ke service domain baru, bukan menambah method panjang di sini.

## Sub-Agent Roleplay

### A. Context and Identity

#### `RecentMessageContextService`

File:

```text
src/roleplay/context/recent-message-context.service.ts
```

Peran:

- Mengambil recent conversation dari DB.
- Mengubahnya menjadi `LlmMessage[]`.
- Dipakai untuk continuity dan prompt final.

#### `TimeContextService`

File:

```text
src/roleplay/context/time-context.service.ts
```

Peran:

- Membuat time context lokal.
- Membantu morning/night tone dan continuity `lastInteractionAt`.

#### `CharacterProfileService`

File:

```text
src/roleplay/identity/character-profile.service.ts
```

Peran:

- Menentukan profile/persona aktif.
- Mengambil nama karakter dan character profile.

#### `RoleplayIdentityQuestionDetectorService`

File:

```text
src/roleplay/identity/roleplay-identity-question-detector.service.ts
```

Peran:

- Mendeteksi pertanyaan identitas/nama karakter.
- Dipakai pre-analyzer dan response director agar route `answer_identity` kuat dan tidak salah.

### B. Unified Pre-Analysis Agent

#### `RoleplayPreAnalyzerService`

File:

```text
src/roleplay/analyzer/roleplay-pre-analyzer.service.ts
```

Ini sub-agent paling strategis karena menghasilkan tiga modul sekaligus:

- `emotion`
- `quote`
- `routing`

Jika `ROLEPLAY_EMOTION_CLASSIFIER_ENABLED=true`, service memanggil LLM kecil dengan output strict JSON. Jika gagal, fallback deterministic tetap tersedia.

Emotion module menghasilkan:

- `userTone`
- `userIntent`
- `affectionDelta`
- `trustDelta`
- `tensionDelta`
- `energyDelta`
- `intimacyDelta`
- `shynessDelta`
- `curiosityDelta`
- `volatilityDelta`
- `desireDelta`
- `inhibitionDelta`
- `comfortDelta`
- `complianceDelta`
- `avoidQuestion`
- `replyDirective`

Quote module menghasilkan:

- `action`: `none` atau `quote_reply`
- `targetMessageId`
- `intent`
- `instruction`
- `confidence`

Routing module menghasilkan:

- `route`
- `confidence`
- `tone`
- `questionAllowed`
- `selfDisclosure`
- `needsMemory`
- `needsQuote`
- `reason`

LLM routing hanya dipakai jika:

- `ROLEPLAY_ROUTER_ENABLED=true`
- deterministic route confidence tidak absolute tinggi
- confidence LLM melewati `ROLEPLAY_ROUTER_MIN_CONFIDENCE`

### C. Emotion and State Sub-Agent

#### `EmotionEngineService`

File:

```text
src/roleplay/emotion/emotion-engine.service.ts
```

Peran:

- Heuristic local evaluator.
- Memberi patch state awal dari inbound message.
- Lalu patch digabung dengan delta dari pre-analysis.

State terbaru:

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

Mood terbaru:

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

### D. Memory Sub-Agent

#### `RoleplayMemoryService`

File:

```text
src/roleplay/memory/roleplay-memory.service.ts
```

Peran:

- Capture memory dari inbound message.
- Retrieve memory relevan untuk prompt.
- Fallback extraction untuk identity, nickname, affectionate alias, boundary, preference.

Memory kind:

- `user_fact`
- `relationship`
- `episode`
- `preference`
- `boundary`
- `goal`

#### `RoleplayMemoryExtractorService`

File:

```text
src/roleplay/memory/roleplay-memory-extractor.service.ts
```

Peran:

- LLM extractor jika enabled.
- Harus output structured memory.
- Confidence threshold dikontrol env.

Risiko:

- Terlalu agresif menyimpan memory noise.
- Affectionate alias tersimpan tanpa permission jelas.
- Boundary user tertimpa memory mesra.

### E. Quote Sub-Agent

#### `QuoteCandidateRetrieverService`

File:

```text
src/roleplay/quote/quote-candidate-retriever.service.ts
```

Peran:

- Mengambil kandidat pesan lama yang bisa dijadikan quote/callback/evidence.

#### `QuotePolicyService`

File:

```text
src/roleplay/quote/quote-policy.service.ts
```

Peran:

- Validasi quote decision dari pre-analysis.
- Memastikan target quote valid dan bukan latest user message.
- Menghindari quote saat tidak perlu.

### F. Presence Sub-Agent

#### `RoleplayPresenceService`

File:

```text
src/roleplay/presence/roleplay-presence.service.ts
```

Peran:

- Orchestrator presence.
- Ensure current presence.
- Sync presence per conversation.
- Save snapshot ke DB.

#### `RoleplayPresenceDirectorService`

File:

```text
src/roleplay/presence/roleplay-presence-director.service.ts
```

Peran:

- Rule-based baseline.
- Scheduled activity berdasarkan daypart.
- Conversation reaction untuk "lagi apa", "kenapa lama", reminder makan/tidur/kerja, dan emotional urgency.

#### `RoleplayPresenceAgentService`

File:

```text
src/roleplay/presence/roleplay-presence-agent.service.ts
```

Peran:

- LLM refinement agent.
- Input baseline, current presence, latest user message, recent messages, dan roleplay state.
- Output strict JSON.
- Membuat `statusText` natural.
- Tidak boleh menyebut AI, bot, model, prompt, system, database, scheduler.

Fallback:

- Jika timeout/error/invalid JSON, gunakan baseline director.

#### `RoleplayPresenceSchedulerService`

File:

```text
src/roleplay/presence/roleplay-presence-scheduler.service.ts
```

Peran:

- Refresh presence berkala.
- Skip sandbox contacts.
- Guard overlap cycle.

### G. Planning Sub-Agents

#### `ConversationBuilderService`

File:

```text
src/roleplay/conversation/conversation-builder.service.ts
```

Peran:

- Menentukan `topic`, `userMove`, `botMove`, `detailHooks`, `warmth`, `followUpPolicy`, `avoid`, dan `directive`.
- Mengubah route mentah menjadi social move yang lebih manusiawi.

#### `RoleplayAddressPlannerService`

File:

```text
src/roleplay/address/roleplay-address-planner.service.ts
```

Peran:

- Menentukan apakah user boleh dipanggil dengan name, nickname, atau affectionate alias.
- Menghindari weird hybrid nickname.

Known behavior:

- `sayang`, `syg`, `ayang`, `ay` dianggap affectionate alias.
- Perlu hati-hati agar `ay` tidak otomatis membuat bot terlalu sering memakai "sayang".

#### `RoleplayIntimacyPolicyService`

File:

```text
src/roleplay/intimacy/roleplay-intimacy-policy.service.ts
```

Peran:

- Menentukan `explicitness` dan `tone`.
- Menggabungkan state, latest message, route, conversation scope, pressure/tension, dan safety signals.
- Mood `aroused` saja tidak cukup untuk explicit output.

#### `ResponseDirectorService`

File:

```text
src/roleplay/response/response-director.service.ts
```

Peran:

- Menentukan response plan:
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

#### `ConversationalProsodyPlannerService`

File:

```text
src/roleplay/prosody/conversational-prosody-planner.service.ts
```

Peran:

- Menentukan rhythm WhatsApp.
- Mengatur multi-bubble.
- Mengatur delimiter dan split behavior.

### H. Prompt Agent

#### `RoleplayPromptCompilerService`

File:

```text
src/roleplay/prompt/roleplay-prompt-compiler.service.ts
```

Prompt builder terbaru:

- `CharacterFoundationPromptBuilder`
- `EmotionStatePromptBuilder`
- `IntimacyPolicyPromptBuilder`
- `PresenceContextPromptBuilder`
- `TimeContextPromptBuilder`
- `ConversationContextPromptBuilder`
- `ResponseStylePromptBuilder`
- `MemoryQuoteOutputPromptBuilder`

Peran:

- Menggabungkan semua builder menjadi system prompt final.
- Menambahkan recent messages setelah system prompt.

### I. Output and Guard Sub-Agent

#### `RoleplayReplyPostProcessorService`

File:

```text
src/roleplay/response/roleplay-reply-post-processor.service.ts
```

Peran:

- Membersihkan output LLM.
- Split multi-bubble jika sesuai prosody.
- Menjaga quote target.
- Meneruskan token usage.

#### `InternalDisclosureGuardService`

File:

```text
src/roleplay/validation/internal-disclosure-guard.service.ts
```

Peran:

- Menjaga agar output/snippet tidak membocorkan istilah internal.
- Istilah sensitif meliputi scheduler, agent, state, rules, source, transition, route, memory, presence, priority, score, emotion, mood, affection, trust, curiosity, volatility, desire, inhibition, comfort, compliance, obedient/obedience.

## Proactive Agent Flow

### `ProactiveSchedulerService`

File:

```text
src/proactive/proactive-scheduler.service.ts
```

Peran:

- Mengevaluasi pesan proaktif berdasarkan morning/night/inactivity.
- Hanya berjalan jika `PROACTIVE_ENABLED=true`.
- Guard overlap dengan `isCheckingInitiatives`.
- Hanya mengirim jika WA status `READY`.
- Menggunakan proactive prompt compiler dan LLM.
- Mencatat `ProactiveLog` untuk rate limit.

### `ProactivePromptCompilerService`

File:

```text
src/proactive/proactive-prompt-compiler.service.ts
```

Peran:

- Menyusun prompt proaktif.
- Memasukkan character profile, memory, recent messages, dan presence.

## Dashboard and Sandbox Agents

### `DashboardService`

File:

```text
src/dashboard/dashboard.service.ts
```

Peran:

- Status WA.
- Contacts.
- Memory management.
- State mutation.
- Restart WhatsApp client.

### `SandboxController`

File:

```text
src/sandbox/sandbox.controller.ts
```

Peran:

- Menjalankan roleplay engine di database sandbox.
- Menyediakan cheat state, cheat presence, memory, reset, dan chat test.
- Mengakumulasi token usage per turn via `LlmService.runWithUsage()`.

## Agentic Flow: Behavior-Based atau Event-Based?

Project ini hybrid:

- Event-based di transport: message received, WA disconnected, QR received, scheduler timer.
- Behavior-based di roleplay: planner, state, memory, presence, response shape menentukan perilaku.
- State-based di persistence: mood, relationship, memory, presence mempengaruhi turn berikutnya.

## Kesimpulan Arsitektur

Project ini bukan "true multi-agent" dengan banyak autonomous agents yang saling chat. Ia adalah single conversational agent dengan banyak specialized sub-agent yang deterministic/LLM-assisted.

Pattern yang paling tepat:

```text
Transport Adapter
-> Global Orchestrator
-> Roleplay Main Agent
-> Specialized Domain Sub-Agents
-> Prompt Compiler
-> LLM
-> Post Processor
-> Transport Adapter
```

Dokumen terkait:

- [architecture.md](./architecture.md)
- [runtime-lifecycle.md](./runtime-lifecycle.md)
- [prompting.md](./prompting.md)
- [presence.md](./presence.md)
- [emotion-state.md](./emotion-state.md)
