# Bot Agent Map

Dokumen ini memetakan agent utama, sub-agent, dan alur runtime bot di project ini.

## Gambaran Umum

Project ini belum memakai multi-agent framework formal. Arsitekturnya adalah:

- `BotOrchestratorService` sebagai orchestrator global inbound message.
- `RoleplayChatService` sebagai agent percakapan utama.
- Sejumlah sub-agent/domain services yang menangani analisis, state, memory, routing, prompt, dan post-processing.
- Satu flow terpisah untuk proactive messaging.

## Agent Utama

### 1. Global Orchestrator

- `BotOrchestratorService`
- File: `src/bot/bot-orchestrator.service.ts`
- Tanggung jawab:
  - Menerima inbound message.
  - Menjalankan deduplication.
  - Mengecek temporary greeting.
  - Mengecek contact policy.
  - Mencatat inbound conversation.
  - Menentukan apakah pesan masuk ke command flow atau roleplay flow.
  - Mencatat outbound reply setelah pesan benar-benar terkirim.

### 2. Roleplay Main Agent

- `RoleplayChatService`
- File: `src/roleplay/roleplay-chat.service.ts`
- Tanggung jawab:
  - Menjadi conductor untuk seluruh pipeline roleplay.
  - Mengambil state, context, memory, quote candidates.
  - Memanggil pre-analyzer.
  - Meng-update state emosi.
  - Menyusun conversation plan, address plan, response plan, dan prosody plan.
  - Meng-compile prompt final.
  - Memanggil `LlmService`.
  - Menjalankan post-processing reply.

## Sub-Agent Roleplay

### A. Context dan Identity

- `RecentMessageContextService`
  - File: `src/roleplay/context/recent-message-context.service.ts`
  - Membangun recent chat context untuk reasoning.

- `TimeContextService`
  - File: `src/roleplay/context/time-context.service.ts`
  - Menyediakan konteks waktu untuk prompt.

- `CharacterProfileService`
  - File: `src/roleplay/identity/character-profile.service.ts`
  - Mengambil profil karakter aktif.

- `RoleplayIdentityQuestionDetectorService`
  - File: `src/roleplay/identity/roleplay-identity-question-detector.service.ts`
  - Mendeteksi pertanyaan tentang identitas karakter.

### B. Analysis dan Routing

- `RoleplayPreAnalyzerService`
  - File: `src/roleplay/analyzer/roleplay-pre-analyzer.service.ts`
  - Sub-agent analisis awal berbasis LLM.
  - Menghasilkan:
    - `analysis` emosi
    - `quoteDecision`
    - `routeDecision`

- `EmotionClassifierService`
  - File: `src/roleplay/emotion/emotion-classifier.service.ts`
  - Classifier emosi berbasis LLM untuk flow/kompatibilitas lama.

- `EmotionEngineService`
  - File: `src/roleplay/emotion/emotion-engine.service.ts`
  - Engine heuristik lokal untuk menghitung perubahan state emosi.
  - State yang dipengaruhi saat ini:
    - `mood`
    - `affection`
    - `trust`
    - `energy`
    - `tension`
    - `intimacy`
    - `shyness`
    - `curiosity`

- `RoleplayRouterService`
  - File: `src/roleplay/response/roleplay-router.service.ts`
  - Route classifier untuk menentukan jenis tindakan percakapan.

### C. Memory dan Quote

- `RoleplayMemoryService`
  - File: `src/roleplay/memory/roleplay-memory.service.ts`
  - Facade untuk capture dan retrieval memory.

- `RoleplayMemoryExtractorService`
  - File: `src/roleplay/memory/roleplay-memory-extractor.service.ts`
  - Mengekstrak memory candidate dari percakapan.

- `RoleplayMemoryTriggerService`
  - File: `src/roleplay/memory/roleplay-memory-trigger.service.ts`
  - Menentukan kapan memory layak dicatat.

- `RoleplayMemoryValidatorService`
  - File: `src/roleplay/memory/roleplay-memory-validator.service.ts`
  - Menjaga kualitas memory sebelum disimpan.

- `QuoteCandidateRetrieverService`
  - File: `src/roleplay/quote/quote-candidate-retriever.service.ts`
  - Mengambil kandidat pesan lama yang layak di-quote.

- `QuoteDecisionService`
  - File: `src/roleplay/quote/quote-decision.service.ts`
  - Decision engine untuk memilih apakah quote-reply diperlukan.

- `QuotePolicyService`
  - File: `src/roleplay/quote/quote-policy.service.ts`
  - Menyaring dan memvalidasi hasil keputusan quote.

### D. Planning

- `ConversationBuilderService`
  - File: `src/roleplay/conversation/conversation-builder.service.ts`
  - Menentukan social move turn saat ini.
  - Output contoh:
    - topic
    - user move
    - bot move
    - follow-up policy

- `RoleplayAddressPlannerService`
  - File: `src/roleplay/address/roleplay-address-planner.service.ts`
  - Menentukan cara karakter memanggil user.

- `ResponseDirectorService`
  - File: `src/roleplay/response/response-director.service.ts`
  - Menentukan arah jawaban:
    - response mode
    - reply shape
    - emotional texture
    - playfulness
    - topic development

- `ConversationalProsodyPlannerService`
  - File: `src/roleplay/prosody/conversational-prosody-planner.service.ts`
  - Menentukan ritme chat:
    - jumlah bubble
    - delimiter
    - pace
    - inter-bubble delay

### E. Prompting

- `RoleplayPromptCompilerService`
  - File: `src/roleplay/prompt/roleplay-prompt-compiler.service.ts`
  - Facade penyusun prompt final untuk generation.

- Prompt builders:
  - `CharacterFoundationPromptBuilder`
    - File: `src/roleplay/prompt/builders/character-foundation-prompt.builder.ts`
  - `ConversationContextPromptBuilder`
    - File: `src/roleplay/prompt/builders/conversation-context-prompt.builder.ts`
  - `EmotionStatePromptBuilder`
    - File: `src/roleplay/prompt/builders/emotion-state-prompt.builder.ts`
  - `MemoryQuoteOutputPromptBuilder`
    - File: `src/roleplay/prompt/builders/memory-quote-output-prompt.builder.ts`
  - `ResponseStylePromptBuilder`
    - File: `src/roleplay/prompt/builders/response-style-prompt.builder.ts`
  - `TimeContextPromptBuilder`
    - File: `src/roleplay/prompt/builders/time-context-prompt.builder.ts`

- `ExpertPromptRegistryService`
  - File: `src/roleplay/prompt/expert-prompt-registry.service.ts`
  - Menyediakan prompt spesifik per route.

### F. Validation dan Post-Processing

- `RoleplayReplyPostProcessorService`
  - File: `src/roleplay/response/roleplay-reply-post-processor.service.ts`
  - Membersihkan dan membentuk hasil final reply:
    - split bubble
    - fallback split
    - continuity cleanup
    - validation
    - quote attachment

- `ContinuityGuardService`
  - File: `src/roleplay/validation/continuity-guard.service.ts`
  - Menjaga kontinuitas dan mengurangi phrasing yang aneh atau keluar karakter.

- `ResponseValidatorService`
  - File: `src/roleplay/validation/response-validator.service.ts`
  - Menjaga output tetap valid dan usable untuk dikirim.

### G. State Persistence

- `RoleplayStateRepository`
  - File: `src/roleplay/state/roleplay-state.repository.ts`
  - Menyimpan dan mengambil `RoleplayState`.

- `RoleplayResetService`
  - File: `src/roleplay/state/roleplay-reset.service.ts`
  - Reset state, memory, dan data roleplay saat diperlukan.

## Proactive Agent Flow

### 1. Proactive Scheduler

- `ProactiveSchedulerService`
- File: `src/proactive/proactive-scheduler.service.ts`
- Tanggung jawab:
  - Men-scan contact aktif.
  - Mengecek trigger proaktif.
  - Menjalankan cycle pengiriman proaktif.
  - Mencatat outbound proactive message ke conversation log.

### 2. Proactive Prompt Compiler

- `ProactivePromptCompilerService`
- File: `src/proactive/proactive-prompt-compiler.service.ts`
- Tanggung jawab:
  - Menyusun prompt khusus untuk proactive greeting atau inactivity ping.

## Runtime Flow

### Inbound Normal Flow

1. WhatsApp inbound masuk ke `BotOrchestratorService`.
2. Dedup check.
3. Temporary greeting check.
4. Contact policy check.
5. Inbound dicatat ke conversation history.
6. Command detection:
   - Jika command, teruskan ke `CommandRegistryService`.
   - Jika bukan command, lanjut ke roleplay flow.
7. `RoleplayChatService` mengambil:
   - previous state
   - recent messages
   - relevant memories
   - quote candidates
8. `RoleplayPreAnalyzerService` menghasilkan:
   - emotion analysis
   - quote decision
   - routing decision
9. `EmotionEngineService` menghitung baseline state patch.
10. `RoleplayChatService` menggabungkan baseline dengan delta analyzer.
11. `RoleplayStateRepository` menyimpan state baru.
12. `ConversationBuilderService` membuat conversation plan.
13. `RoleplayAddressPlannerService` membuat address plan.
14. `ResponseDirectorService` membuat response plan.
15. `ConversationalProsodyPlannerService` membuat prosody plan.
16. `CharacterProfileService`, `TimeContextService`, `ExpertPromptRegistryService`, dan `RoleplayPromptCompilerService` menyusun prompt final.
17. `LlmService` menghasilkan draft reply.
18. `RoleplayReplyPostProcessorService` memproses hasil akhir.
19. Reply dikirim.
20. Outbound reply dicatat kembali oleh orchestrator/conversation layer.

### Command Flow

1. Inbound masuk ke `BotOrchestratorService`.
2. Jika `CommandRegistryService` mendeteksi command, flow roleplay dilewati.
3. Command handler menghasilkan reply.

### Silent Flow

1. Inbound tetap bisa dicatat.
2. Jika mode contact adalah `silent` atau `command_only`, roleplay reply tidak dijalankan.

### Proactive Flow

1. `ProactiveSchedulerService` menjalankan cycle.
2. Contact eligible dipilih.
3. State dan memory diambil.
4. `ProactivePromptCompilerService` menyusun prompt.
5. `LlmService` menghasilkan proactive message.
6. Pesan dikirim.
7. Outbound proactive message dicatat ke conversation history.

## Dependency Ringkas

- `BotOrchestratorService`
  - bergantung pada contact policy, command registry, conversation logging, dan `RoleplayChatService`

- `RoleplayChatService`
  - bergantung pada hampir seluruh sub-agent roleplay
  - menjadi titik orkestrasi terpenting di domain roleplay

- `LlmService`
  - shared runtime dependency untuk:
    - pre-analysis
    - emotion classification lama
    - memory extraction
    - quote decision
    - final reply generation
    - proactive generation

## Catatan Arsitektural

- Project ini lebih tepat disebut `orchestrated single-agent architecture` daripada true multi-agent system.
- `RoleplayChatService` adalah conductor utama.
- `RoleplayPreAnalyzerService` adalah sub-agent paling strategis karena mengeluarkan tiga keputusan sekaligus.
- `RoleplayPromptCompilerService` sekarang sudah lebih modular karena penyusunan prompt dipisah ke builders.
- Flow proactive adalah jalur agent terpisah, tetapi masih memakai sebagian domain state dan memory yang sama.
