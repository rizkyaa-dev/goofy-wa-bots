# Documentation Index

Dokumentasi di folder ini memisahkan pengetahuan project berdasarkan concern operasional dan arsitektural. Root `README.md` tetap menjadi entrypoint singkat repo, sedangkan folder ini menjadi rujukan mendalam untuk maintenance, debugging, dan pengembangan fitur.

## Peta Dokumen

- [architecture.md](./architecture.md): struktur module, dependency utama, data model, dan alur pesan dari WhatsApp sampai LLM.
- [runtime-lifecycle.md](./runtime-lifecycle.md): boot Nest, lifecycle WhatsApp client, reconnect, restart dashboard, scheduler, dan shutdown.
- [env.md](./env.md): arti environment variable, default penting, dan konfigurasi per mode kerja.
- [operations.md](./operations.md): cara start, stop, restart, handle port bentrok, clear session WA, build, migration, dan checklist insiden.
- [prompting.md](./prompting.md): pipeline prompt roleplay, prompt builder, anti-leakage, LLM sub-agent, dan prinsip modifikasi prompt.
- [presence.md](./presence.md): Off-Chat Presence, scheduler, director, LLM presence agent, DB state, cheat console, dan reset behavior.
- [emotion-state.md](./emotion-state.md): mood, numeric emotion parameters, drive state, trigger umum, dan dampaknya ke prompt.
- [dashboard-sandbox.md](./dashboard-sandbox.md): fitur Dashboard dan Sandbox, cheat state, token usage, QR flow, dan batasan testing.
- [security-and-safety.md](./security-and-safety.md): prompt leakage, dashboard surface, secret handling, DB, input validation, dan safe failure mode.
- [testing.md](./testing.md): strategi testing manual, regresi utama, skenario roleplay, dan kandidat automated tests.

## Dokumen Historis Yang Sudah Ada

- [bot_agent.md](./bot_agent.md): peta agent/sub-agent yang sudah dibuat sebelumnya.
- [roleplay.md](./roleplay.md): catatan roleplay runtime yang lebih naratif.
- [router.md](./router.md): catatan routing dan pre-analysis.
- [bot-test-scenarios.md](./bot-test-scenarios.md): kumpulan skenario percakapan manual.

## Prinsip Maintenance Docs

- Update docs bersamaan dengan perubahan behavior runtime, bukan setelah bug muncul.
- Jika menambah env baru, update [env.md](./env.md) dan [operations.md](./operations.md) bila berdampak ke cara run.
- Jika mengubah prompt builder, update [prompting.md](./prompting.md).
- Jika mengubah state schema, update [architecture.md](./architecture.md), [emotion-state.md](./emotion-state.md), atau [presence.md](./presence.md) sesuai domain.
- Jika mengubah Dashboard/Sandbox endpoint atau UI, update [dashboard-sandbox.md](./dashboard-sandbox.md).
