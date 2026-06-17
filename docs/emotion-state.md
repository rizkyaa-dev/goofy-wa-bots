# Emotion and Roleplay State

Dokumen ini menjelaskan state emosional dan relational yang dipakai roleplay runtime, termasuk mood enum, numeric parameters, drive state, trigger umum, dan dampaknya ke prompt.

## Data Model

State disimpan di `RoleplayState`.

Field:

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

Nilai numeric umumnya 0 sampai 100.

## Mood Enum

Mood saat ini:

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

Mood adalah label diskrit. Numeric state menjelaskan intensitas dan nuance.

## Parameter Relational

### `affection`

Menggambarkan kehangatan emosional terhadap user.

Tinggi:

- Lebih lembut.
- Lebih mudah memakai panggilan hangat.
- Lebih responsif secara personal.

Rendah:

- Lebih datar.
- Lebih menjaga jarak.

### `trust`

Menggambarkan rasa aman terhadap user.

Tinggi:

- Lebih terbuka.
- Lebih mudah menerima konteks personal/intim.

Rendah:

- Lebih defensif.
- Lebih mudah menolak tekanan.

### `intimacy`

Menggambarkan kedekatan romantik/fisik/privat.

Tinggi:

- Membuka affectionate nickname.
- Mengizinkan sensual/adult tone jika policy juga mengizinkan.

Rendah:

- Tetap friendly, tidak terlalu mesra.

## Parameter Energy dan Tension

### `energy`

Mengatur vitalitas.

Tinggi:

- Reply lebih aktif, playful, responsif.

Rendah:

- Reply pendek, sleepy, lebih slow.

### `tension`

Mengatur konflik/tekanan.

Tinggi:

- Bot lebih hati-hati.
- Bisa annoyed, guarded, atau boundary.
- Explicit/sensual policy bisa turun.

Rendah:

- Lebih santai.

## Parameter Social Texture

### `shyness`

Tinggi:

- Lebih malu-malu.
- Flirt lebih indirect.
- Bisa menghindar saat terlalu direct.

Rendah:

- Lebih blak-blakan.

### `curiosity`

Tinggi:

- Lebih mudah bertanya balik.
- Lebih tertarik pada detail user.

Rendah:

- Lebih pasif.

Harus tetap dikontrol oleh follow-up policy agar bot tidak terlalu banyak bertanya.

## Drive Parameters

### `volatility`

Mengatur emotional swing.

Tinggi:

- Mood lebih mudah berubah.
- Reaksi bisa lebih tajam.
- Cocok untuk mood `swing`.

Rendah:

- Stabil.

### `desire`

Mengatur ketertarikan/charged energy.

Tinggi:

- Mendukung mood `sensual`, `flirty`, `aroused`.
- Meningkatkan charged undertone jika policy mengizinkan.

Rendah:

- Flirt tetap ringan.

### `inhibition`

Mengatur rem/reservedness.

Tinggi:

- Lebih menahan diri.
- Direct adult tone sulit muncul.
- Shy/guarded behavior lebih kuat.

Rendah:

- Lebih direct dan berani.

### `comfort`

Mengatur rasa nyaman.

Tinggi:

- Lebih natural, relaxed, affectionate.

Rendah:

- Lebih kaku atau waspada.

### `compliance`

Mengatur kecenderungan mengikuti request user.

Tinggi:

- Lebih mudah menuruti request ringan.
- Bisa lebih accommodating.

Rendah:

- Lebih independen.
- Lebih mudah menolak atau menggoda balik.

Catatan: compliance bukan izin untuk unsafe behavior. Policy tetap menang.

## Mood dan Trigger Umum

### `annoyed`

Biasanya muncul dari:

- User menekan.
- User kasar.
- User menyindir berulang.
- Tension naik.
- Trust turun.
- Conversation route conflict/boundary.

Jika annoyed terus:

- Cek recent messages.
- Cek tension tinggi.
- Cek memory boundary.
- Cek emotion classifier output.
- Cek apakah sandbox state belum direset.

### `warm`

Muncul saat:

- Affection naik.
- User friendly.
- Conversation emotional care.
- Trust cukup.

### `playful`

Muncul saat:

- User teasing.
- User greeting playful.
- State energy cukup.
- Tension rendah.

### `sleepy`

Muncul saat:

- Energy rendah.
- Time context malam.
- Presence sleeping/relaxing.

### `jealous`

Muncul saat:

- User memancing jealousy.
- Affection/intimacy cukup.
- Volatility tidak rendah.

### `worried`

Muncul saat:

- User vulnerable.
- User menyebut kondisi buruk.
- Trust/affection cukup untuk care.

### `swing`

Muncul saat:

- Volatility tinggi.
- Mixed signal.
- Tension dan affection sama-sama aktif.

### `sensual`, `flirty`, `aroused`

Muncul saat:

- Desire tinggi.
- Comfort cukup.
- Inhibition turun.
- Intimacy cukup.
- User membuka konteks flirt/sensual.
- Intimacy policy tidak memblokir.

### `needy`

Muncul saat:

- Affection tinggi.
- Trust cukup.
- Energy mungkin rendah.
- User menjauh atau cue kangen.

## Explicitness Bukan Hanya Mood

Mood `aroused` tidak otomatis membuat bot membahas seks secara eksplisit.

Faktor lain:

- `intimacy`
- `desire`
- `inhibition`
- `comfort`
- `trust`
- `tension`
- `conversationScope`
- latest user message
- intimacy policy explicitness
- safety/boundary checks

Jadi jika mood aroused tetapi bot tetap tidak explicit, kemungkinan policy belum naik ke explicit level.

## Update State Flow

1. Runtime mengambil previous state.
2. Emotion engine mengevaluasi inbound message.
3. Pre-analyzer/classifier memberi delta tambahan.
4. `RoleplayChatService.applyAnalysis()` menjumlahkan patch.
5. Nilai diclamp ke range valid.
6. State disimpan.
7. Prompt builder membaca state terbaru.

## Dashboard dan Sandbox

Dashboard bisa melihat dan mengubah:

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

Sandbox cheat berguna untuk:

- Memaksa mood tertentu.
- Menguji route adult/sensual.
- Menurunkan inhibition.
- Menaikkan desire.
- Menurunkan tension.
- Menguji prompt behavior tanpa menunggu state berkembang natural.

## Debug Checklist

Jika bot terlalu dingin:

1. Cek `affection`, `trust`, `comfort`.
2. Cek `tension`.
3. Cek address plan.
4. Cek conversation topic.

Jika bot terlalu mesra:

1. Cek `intimacy`, `affection`, `desire`.
2. Cek memory affectionate alias.
3. Cek latest user message mengandung flirt.
4. Cek prompt builder address/intimacy.

Jika bot terlalu banyak bertanya:

1. Cek `curiosity`.
2. Cek follow-up policy.
3. Cek response plan questionAllowed.

Jika bot explicit tidak muncul:

1. Cek intimacy policy.
2. Cek `inhibition`, `comfort`, `desire`, `tension`.
3. Cek user message apakah benar membuka konteks.
4. Cek conversation scope.

## Anti-Pattern

- Menggunakan mood sebagai satu-satunya sumber behavior.
- Menaikkan desire tanpa menurunkan inhibition/meningkatkan comfort.
- Menurunkan tension hanya lewat prompt, bukan state.
- Menyuruh model menyebut angka state.
- Menyimpan mood permanen tanpa decay/transition.
