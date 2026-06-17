# Off-Chat Presence

Off-Chat Presence adalah layer yang membuat karakter tetap memiliki aktivitas di luar percakapan WhatsApp. Layer ini menjawab kebutuhan seperti "lagi apa", "di mana", atau "kenapa lama balas" tanpa membuat bot terasa seperti sistem yang hanya hidup saat user chat.

## Tujuan

Presence bukan sekadar flavor text. Tujuannya:

- Memberi continuity ketika user menanyakan aktivitas.
- Membuat karakter terasa punya kehidupan ringan di luar chat.
- Menjelaskan delay atau availability secara natural.
- Menjadi context halus dalam prompt, bukan script yang selalu disebut.

## Komponen

### `RoleplayPresenceState`

DB model di Prisma.

Field:

- `chatId`
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

### `RoleplayPresenceService`

Orchestrator.

Tugas:

- Ensure current presence ada.
- Sync presence saat conversation turn.
- Memilih apakah keep, adjust, atau replace.
- Memanggil presence agent untuk refinement.
- Save ke repository.

### `RoleplayPresenceDirectorService`

Rule-based director.

Tugas:

- Membuat scheduled baseline berdasarkan daypart dan state.
- Bereaksi terhadap user message, misalnya reminder makan/tidur/kerja.
- Menentukan apakah current presence perlu expose, soften, atau transition.

### `RoleplayPresenceAgentService`

LLM refinement agent.

Tugas:

- Mengambil baseline director.
- Menghasilkan JSON refinement.
- Membuat `statusText` lebih natural.
- Tidak mengubah continuity secara ekstrem.

Jika agent gagal, baseline director tetap dipakai.

### `RoleplayPresenceStateRepository`

Persistence layer.

Tugas:

- `findByChatId`
- `save` via upsert.

### `PresenceContextPromptBuilder`

Prompt injection layer.

Tugas:

- Mengubah DB presence menjadi prompt context.
- Menginstruksikan model untuk memakai presence secara natural.
- Melarang implementation terms.

### `RoleplayPresenceSchedulerService`

Background refresh.

Tugas:

- Menjalankan refresh berkala untuk contact yang punya state atau auto-reply.
- Skip sandbox contacts.
- Memastikan presence tidak stale.

## Source Presence

`source` menjelaskan asal snapshot:

- `scheduled`: dibuat scheduler/daypart.
- `conversation`: berubah karena pesan user.
- `manual`: di-set dari cheat console.
- `external`: reserved untuk integrasi eksternal.

## Priority

`priority` membantu memutuskan apakah snapshot boleh diganti.

Prinsip:

- Manual/external dengan expiry aktif sebaiknya tidak dioverride scheduler.
- Conversation dapat menaikkan priority sementara saat user emotional/urgent.
- Scheduled adalah baseline paling mudah diganti.

## Activity Type

Activity type adalah label mesin. Contoh:

- `working`
- `studying`
- `eating`
- `sleeping`
- `relaxing`
- `watching`
- `gaming`
- `commuting`
- `going_out`
- `self_care`
- `waking_up`
- `chatting_offline`
- `idle`

Jangan jadikan activity type sebagai teks langsung ke user. User-facing text adalah `statusText`.

## Status Text

`statusText` adalah teks pendek natural.

Contoh:

```text
lagi ngerjain sesuatu bentar
lagi sarapan santai dulu
lagi rebahan santai sambil scroll-scroll
```

Rule:

- Bahasa Indonesia natural.
- Pendek.
- Lowercase.
- Tidak menyebut scheduler/agent/model/database.
- Tidak over-dramatic.
- Tidak mengandung aktivitas unsafe/sexual/illegal/medical/crisis.

## Scheduled Presence Flow

1. Scheduler atau `ensureCurrentPresence()` memanggil director.
2. Director menentukan daypart dari waktu Jakarta.
3. Director memilih candidate blueprint berdasarkan hash chatId, slot, mood, dan energy.
4. Director memilih duration dan status option.
5. Draft dikirim ke presence agent jika enabled.
6. Agent memperbaiki wording.
7. Draft disanitasi.
8. Repository save.

## Conversation Presence Flow

1. User mengirim pesan.
2. Roleplay runtime mengambil current presence atau membuat baru.
3. Director membaca latest message, recent messages, state, dan emotion analysis.
4. Director memilih action:
   - `keep`
   - `adjust`
   - `replace`
5. Jika action bukan keep, draft direfine agent.
6. Draft disimpan.
7. Prompt utama menerima updated presence.

## Presence Probe

Jika user bertanya:

- "lagi apa"
- "di mana"
- "kok lama"
- "ngapain"

Director cenderung keep current presence agar prompt menjawab dari snapshot yang ada, bukan membuat aktivitas baru setiap turn.

## Manual Cheat Console

Sandbox bisa mengubah presence manual.

Field cheat:

- Activity type
- Duration
- Status text
- Location
- Social context
- Interruptibility
- Source
- Priority
- Reason tag

Manual presence dipakai untuk mengetes:

- Pertanyaan aktivitas.
- Pertanyaan lokasi.
- Late reply.
- Continuity scene.
- Override scheduler.

## Reset Behavior

Reset roleplay harus jelas scope-nya:

- Reset conversation: hapus messages.
- Reset state: reset `RoleplayState`.
- Reset presence: hapus `RoleplayPresenceState`.
- Reset memory: hapus `RoleplayMemory`.

Jika reset hanya state/conversation tetapi presence tidak dihapus, tombol "Isi Dari Presence Sekarang" akan tetap mengambil snapshot lama. Ini expected jika reset tidak mencakup presence.

## Presence dan Prompt Leakage

Masalah yang pernah terlihat:

User: "scheduler memilih aktivitas apa?"

Bot menjawab tentang scheduler.

Penyebab potensial:

- Presence prompt menyebut implementation word.
- Model mengikuti kata user secara literal.
- Internal term tidak cukup dideflect oleh conversation plan.

Mitigasi:

- Presence prompt melarang implementation words.
- Conversation builder route meta harus deflect in-character.
- Internal disclosure guard membersihkan snippet.
- Output post-processing bisa menolak internal vocabulary jika dibutuhkan.

## Presence Agent Model

Env:

- `ROLEPLAY_PRESENCE_AGENT_ENABLED`
- `ROLEPLAY_PRESENCE_AGENT_PROVIDER`
- `ROLEPLAY_PRESENCE_AGENT_MODEL`
- `ROLEPLAY_PRESENCE_AGENT_TEMPERATURE`
- `ROLEPLAY_PRESENCE_AGENT_MAX_TOKENS`
- `ROLEPLAY_PRESENCE_AGENT_TIMEOUT_MS`

Jika provider/model kosong, service dapat fallback ke provider/model utama sesuai implementation resolver.

## Kapan Tidak Perlu LLM Agent

LLM agent tidak wajib jika:

- Ingin deterministic behavior.
- Cost harus ditekan.
- Latency presence harus minimal.
- Baseline status sudah cukup natural.

Gunakan LLM agent jika:

- Ingin status lebih variatif.
- Ingin aktivitas subtly merespons user turn.
- Ingin detail kecil yang tidak hardcoded.

## Anti-Pattern

- Presence berubah setiap user bertanya "lagi apa".
- Presence menyebut source internal.
- Presence terlalu teatrikal.
- Presence selalu dimasukkan ke semua reply.
- Scheduler override manual presence yang belum expired.
- LLM agent boleh mengubah time window sendiri.

## Debug Checklist

1. Cek Dashboard/Sandbox panel "Off-Chat Presence Saat Ini".
2. Cek `source`, `lastReason`, dan `expiresAt`.
3. Cek apakah presence manual masih aktif.
4. Cek apakah user message memicu reminder activity.
5. Cek apakah agent enabled.
6. Cek log fallback presence agent.
7. Test pertanyaan "lagi apa" dan "kenapa lama" di Sandbox.
