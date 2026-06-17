# Operations Runbook

Dokumen ini adalah runbook praktis untuk menjalankan, menghentikan, merestart, dan mendiagnosis project.

## Command Utama

### Build

```powershell
npm.cmd run build
```

Gunakan `npm.cmd` di PowerShell karena `npm.ps1` bisa terblokir execution policy.

### Start Production Build

```powershell
npm.cmd start
```

Menjalankan `node dist/main.js`.

### Start Development

```powershell
npm.cmd run start:dev
```

Catatan:

- Lebih lambat dari `npm start`.
- Memakai `ts-node-dev`.
- Watcher mengabaikan `.wwebjs_auth`, `.wwebjs_cache`, dan `prisma`.

### Typecheck

```powershell
npm.cmd run typecheck
```

### Prisma Generate

```powershell
npm.cmd run prisma:generate
```

### Prisma Migrate Dev

```powershell
npm.cmd run prisma:migrate
```

### Prisma Push

```powershell
npm.cmd run prisma:push
```

## Stop Runtime Yang Sedang Berjalan

Jika port `3000` masih dipakai:

```powershell
$listenerPids = netstat -ano | Select-String ':3000' | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
foreach ($processId in $listenerPids) {
  if ($processId -match '^\d+$') {
    Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue
  }
}
```

Untuk stop node process project:

```powershell
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -match 'goofy-wa-bots|npm-cli\.js.*start|dist/main\.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
```

Jangan pakai `git reset --hard` atau command destructive untuk menyelesaikan runtime issue.

## Restart Runtime Aman

```powershell
$listenerPids = netstat -ano | Select-String ':3000' | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
foreach ($processId in $listenerPids) {
  if ($processId -match '^\d+$') {
    Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue
  }
}

Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -match 'goofy-wa-bots|npm-cli\.js.*start|dist/main\.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 1
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm start" -WorkingDirectory "c:\xampp2\htdocs\goofy-wa-bots" -WindowStyle Hidden
Start-Sleep -Seconds 6
```

## EADDRINUSE

Gejala:

```text
Error: listen EADDRINUSE: address already in use 127.0.0.1:3000
```

Arti:

- Ada process lain yang sudah listen di port `3000`.
- Bisa process project lama, bisa process lain.

Langkah:

1. Cek listener:

```powershell
netstat -ano | Select-String ':3000'
```

2. Stop PID terkait:

```powershell
Stop-Process -Id <PID> -Force
```

3. Start ulang.

## WhatsApp Session Stuck

Gejala umum:

- QR tidak muncul.
- Status stuck `AUTHENTICATING`.
- Log `UNPAIRED`.
- Log browser already running for `.wwebjs_auth/session-personal`.
- Reconnect terus.

Langkah aman:

1. Stop runtime project.
2. Pastikan tidak ada Chromium/Puppeteer lama yang memakai folder session.
3. Start runtime.
4. Jika masih stuck, gunakan tombol `Restart Sesi` di Dashboard.
5. Jika masih stuck, stop runtime lalu hapus folder session lokal:

```powershell
Remove-Item -LiteralPath ".wwebjs_auth\session-personal" -Recurse -Force
```

Pastikan path benar sebelum delete.

## Dashboard Restart Sesi

Tombol `Restart Sesi` melakukan hard reset session:

- clear reconnect timer
- destroy client
- delete LocalAuth session
- initialize client baru
- QR baru muncul

Gunakan saat:

- HP memutus linked device.
- QR lama invalid.
- WhatsApp Web stuck loading.
- Bot tidak reconnect setelah session invalid.

Jangan gunakan terlalu sering jika WA masih `READY`; ini memaksa scan ulang.

## QR Login Tips

Jika QR sulit discan:

- Gunakan maximize QR di dashboard.
- Kurangi brightness monitor.
- Hindari angle kamera yang memantulkan layar.
- Dark mode QR memakai low-glare color, tetapi glare fisik layar tetap bisa terjadi.
- Jika scan masih gagal, refresh/restart session agar QR baru dibuat.

## Prisma dan DB

Database utama:

- `prisma/dev.db`

Database sandbox:

- `prisma/sandbox.db`

Sandbox DB dibuat dengan copy dari `dev.db` jika belum ada.

Jangan campur debug manual real user dengan sandbox jika sedang menguji state/presence.

## Build Cache

File seperti:

- `tsconfig.tsbuildinfo`
- `tsconfig.build.tsbuildinfo`

adalah cache TypeScript. Jika berubah setelah build dan tidak ingin ikut commit:

```powershell
git restore -- tsconfig.tsbuildinfo tsconfig.build.tsbuildinfo
```

## Checklist Sebelum Commit

1. Jalankan build atau typecheck.
2. Pastikan tidak ada `.env`, session WA, cache, atau DB private yang tidak sengaja staged.
3. Cek `git status --short`.
4. Jika memindahkan docs, pastikan link internal masih benar.
5. Jika mengubah Prisma schema, pastikan migration ada atau keputusan `db push` jelas.
6. Jika mengubah prompt/state, update docs terkait.

## Insiden Umum

### Bot menjawab aneh setelah edit prompt

Langkah:

1. Test di Sandbox dengan chatId baru.
2. Reset Sandbox state/presence/memory.
3. Cek debug log bila `ROLEPLAY_DEBUG_LOG_ENABLED=true`.
4. Periksa prompt builder yang baru.
5. Periksa internal disclosure guard.

### Bot menyebut istilah internal

Langkah:

1. Cari apakah istilah itu ada di prompt builder.
2. Periksa `InternalDisclosureGuardService`.
3. Periksa presence/statusText atau memory yang tersimpan.
4. Jangan hanya menambahkan larangan prompt; sanitasi sumber data juga.

### Proactive message tidak terkirim

Langkah:

1. Pastikan `PROACTIVE_ENABLED=true`.
2. Pastikan WA status `READY`.
3. Cek contact mode `auto_reply`.
4. Cek `ProactiveLog` rate limit.
5. Cek cooldown recent messages.

### Sandbox beda dengan real WA

Kemungkinan:

- Sandbox memakai `sandbox.db`.
- WA real punya recent messages dan memory berbeda.
- Contact setting/provider berbeda.
- Presence manual sandbox tidak ada di real DB.
