# Dashboard and Sandbox

Dokumen ini menjelaskan fungsi Dashboard dan Sandbox, endpoint, batasan, serta cara memakainya untuk debugging.

## Dashboard

URL:

```text
http://localhost:3000/Dashboard
```

Fungsi utama:

- Melihat status WhatsApp.
- Menampilkan QR login.
- Restart session WhatsApp.
- Melihat contact aktif.
- Mengubah mode bot per contact.
- Melihat dan mengubah roleplay state.
- Melihat presence per contact.
- Mengelola memory.

## WhatsApp Panel

Status yang mungkin:

- `DISCONNECTED`
- `SCAN_QR`
- `AUTHENTICATING`
- `LOADING`
- `READY`

Saat `SCAN_QR`, dashboard menampilkan QR.

Fitur QR:

- QR kecil tampil di panel.
- Klik QR membuka lightbox/maximize.
- Jika QR code diperbarui saat lightbox terbuka, QR besar ikut terupdate.
- Dark mode memakai warna low-glare agar lebih mudah discan dari layar.

## Restart Sesi

Tombol `Restart Sesi` memanggil:

```text
POST /api/dashboard/wa/restart
```

Efek:

- Force restart WhatsApp client.
- Destroy client lama.
- Hapus LocalAuth session.
- Init client baru.
- QR baru muncul.

Gunakan saat:

- Linked device diputus dari HP.
- QR stuck.
- WA auth stuck.
- Browser session invalid.

## Contacts Table

Endpoint:

```text
GET /api/dashboard/contacts
```

Menampilkan:

- Contact/chatId.
- Mode bot.
- Relationship state summary.
- Presence activity.
- Mood.
- Action inspect.

Mode bot:

- `silent`
- `command_only`
- `auto_reply`

## Contact Inspect Drawer

Ketika contact dipilih, dashboard menampilkan:

- Roleplay state sliders.
- Drive params.
- Summary.
- Presence snapshot.
- Memory list.
- Form tambah memory.

Endpoint terkait:

```text
GET /api/dashboard/contacts/:chatId/memory
POST /api/dashboard/contacts/:chatId/memory
DELETE /api/dashboard/memory/:id
POST /api/dashboard/contacts/:chatId/mode
POST /api/dashboard/contacts/:chatId/state
```

## Sandbox

URL:

```text
http://localhost:3000/Sandbox
```

Sandbox adalah ruang test chat yang memakai engine roleplay yang sama, tetapi database berbeda.

Database:

- Real runtime: `prisma/dev.db`
- Sandbox: `prisma/sandbox.db`

Sandbox request dibungkus `prismaStorage.run(this.sandboxPrisma, ...)`, sehingga service yang sama menulis ke DB sandbox.

## Sandbox Chat

Endpoint:

```text
POST /api/sandbox/chat
```

Flow:

1. Ensure sandbox contact.
2. Record inbound.
3. Jalankan `RoleplayChatService.generateReply()`.
4. Akumulasi token usage via `LlmService.runWithUsage()`.
5. Resolve reply parts.
6. Record outbound.
7. Return reply, parts, usage.

## Token Usage

Sandbox menampilkan token usage akumulatif per chat/browser session.

Usage mencakup:

- Prompt tokens.
- Completion/output tokens.
- Total tokens.

Jika sub-agent LLM dipanggil dalam request yang sama dan provider mengembalikan usage, usage ikut terakumulasi lewat AsyncLocalStorage di `LlmService`.

Limitasi:

- Provider yang tidak mengembalikan usage tidak bisa dihitung akurat.
- Jika LLM call terjadi di background di luar request context, usage tidak masuk akumulasi Sandbox turn.

## Cheat Roleplay State

Sandbox bisa mengubah:

- mood
- affection
- trust
- energy
- tension
- intimacy
- shyness
- curiosity
- volatility
- desire
- inhibition
- comfort
- compliance
- summary

Gunakan untuk menguji branching prompt tanpa menunggu state berkembang natural.

## Cheat Presence Activity

Sandbox bisa memaksa:

- Activity type.
- Duration.
- Status text.
- Location.
- Social context.
- Interruptibility.
- Source.
- Priority.
- Reason tag.

Gunakan untuk menguji:

- "lagi apa"
- "di mana"
- "kenapa lama"
- continuity scene
- manual override scheduler

## Memory Sandbox

Sandbox bisa menambah dan menghapus memory manual.

Memory kind:

- `user_fact`
- `relationship`
- `episode`
- `preference`
- `boundary`
- `goal`

Gunakan untuk test:

- callback
- preferred nickname
- affectionate alias
- boundary
- preference recall

## Reset Sandbox

Reset dapat mencakup:

- Obrolan.
- State.
- Presence.
- Memory.

Pastikan scope reset sesuai tujuan test. Jika presence tidak ikut reset, cheat form "Isi Dari Presence Sekarang" tetap dapat mengambil presence lama.

## Perbedaan Sandbox dan Real WA

Sandbox:

- Tidak memakai WhatsApp transport.
- Tidak memakai typing simulator.
- Tidak memakai WA quote object asli.
- Memakai `sandbox.db`.
- Cocok untuk prompt/state debugging.

Real WA:

- Memakai reply batching.
- Memakai typing simulator.
- Punya chat state dan message id WA.
- Memakai `dev.db`.
- Cocok untuk end-to-end validation.

## UI Pitfalls

- Light/dark mode harus diuji karena CSS dashboard pernah punya bug contrast.
- Chat bubble height harus auto, bukan fixed besar.
- QR lightbox harus update jika QR berubah.
- Drawer dashboard harus tetap scrollable.
- Sandbox three-column layout harus tetap usable di desktop.

## Debug Checklist Dashboard

Jika QR tidak muncul:

1. Cek status API `/api/dashboard/status`.
2. Cek `whatsapp.hasQr`.
3. Cek log WA client.
4. Cek apakah client `READY`, `AUTHENTICATING`, atau stuck.

Jika contact tidak muncul:

1. Cek `ContactSetting`.
2. Cek mode bot.
3. Cek apakah chatId berbeda alias.

Jika state tidak tersimpan:

1. Cek validation request.
2. Cek `ensureContactSetting`.
3. Cek Prisma error.

Jika Sandbox reply beda ekspektasi:

1. Reset chatId.
2. Cek state.
3. Cek presence.
4. Cek memory.
5. Cek token usage/sub-agent.
