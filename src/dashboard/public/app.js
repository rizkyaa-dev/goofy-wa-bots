// Global States
let selectedChatId = null;
let currentContacts = [];
let currentQrCode = null;
let pollingInterval = null;

// DOM Elements
const elCharacterName = document.getElementById('character-name');
const elLlmProvider = document.getElementById('llm-provider');
const elTotalContacts = document.getElementById('total-contacts');
const elAutoReplyCount = document.getElementById('auto-reply-count');
const elConnStatusBadge = document.getElementById('conn-status-badge');
const elConnStatusText = document.getElementById('conn-status-text');

const elStatusVisual = document.getElementById('status-visual');
const elStatusDesc = document.getElementById('status-desc');
const elQrPanel = document.getElementById('qr-panel');
const elBtnRestartWa = document.getElementById('btn-restart-wa');

const elContactsListTbody = document.getElementById('contacts-list-tbody');
const elDetailsCard = document.getElementById('details-card');
const elDetailsPlaceholder = document.getElementById('details-placeholder-card');
const elCurrentContactName = document.getElementById('current-contact-name');

// Tuner Elements
const elTunerChatId = document.getElementById('tuner-chat-id');
const elTunerMood = document.getElementById('tuner-mood');
const elTunerAffection = document.getElementById('tuner-affection');
const elTunerTrust = document.getElementById('tuner-trust');
const elTunerEnergy = document.getElementById('tuner-energy');
const elTunerTension = document.getElementById('tuner-tension');
const elTunerIntimacy = document.getElementById('tuner-intimacy');
const elTunerShyness = document.getElementById('tuner-shyness');
const elTunerCuriosity = document.getElementById('tuner-curiosity');
const elTunerVolatility = document.getElementById('tuner-volatility');
const elTunerDesire = document.getElementById('tuner-desire');
const elTunerInhibition = document.getElementById('tuner-inhibition');
const elTunerComfort = document.getElementById('tuner-comfort');
const elTunerCompliance = document.getElementById('tuner-compliance');
const elTunerSummary = document.getElementById('tuner-summary');
const elValAffection = document.getElementById('val-affection');
const elValTrust = document.getElementById('val-trust');
const elValEnergy = document.getElementById('val-energy');
const elValTension = document.getElementById('val-tension');
const elValIntimacy = document.getElementById('val-intimacy');
const elValShyness = document.getElementById('val-shyness');
const elValCuriosity = document.getElementById('val-curiosity');
const elValVolatility = document.getElementById('val-volatility');
const elValDesire = document.getElementById('val-desire');
const elValInhibition = document.getElementById('val-inhibition');
const elValComfort = document.getElementById('val-comfort');
const elValCompliance = document.getElementById('val-compliance');
const elStateTunerForm = document.getElementById('state-tuner-form');

const elPresenceStatusText = document.getElementById('presence-status-text');
const elPresenceSourceText = document.getElementById('presence-source-text');
const elPresenceActivityType = document.getElementById('presence-activity-type');
const elPresenceLocation = document.getElementById('presence-location');
const elPresenceSocial = document.getElementById('presence-social');
const elPresenceInterruptibility = document.getElementById('presence-interruptibility');
const elPresenceExpires = document.getElementById('presence-expires');

// Memory Elements
const elBtnToggleAddMemory = document.getElementById('btn-toggle-add-memory');
const elAddMemoryForm = document.getElementById('add-memory-form');
const elBtnCancelMemory = document.getElementById('btn-cancel-memory');
const elMemoryItemsContainer = document.getElementById('memory-items-container');
const elBtnCloseDetails = document.getElementById('btn-close-details');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchStatus();
  fetchContacts();
  
  // Polling status WhatsApp setiap 3 detik
  pollingInterval = setInterval(fetchStatus, 3000);
});

// Event Listeners Setup
function setupEventListeners() {
  // Theme Toggle
  const elThemeToggle = document.getElementById('btn-theme-toggle');
  const elThemeIcon = document.getElementById('theme-toggle-icon');
  
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    elThemeIcon.className = 'fa-solid fa-sun';
  } else {
    document.body.classList.remove('light-theme');
    elThemeIcon.className = 'fa-solid fa-moon';
  }

  elThemeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    elThemeIcon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });

  // Restart WA
  elBtnRestartWa.addEventListener('click', restartWaClient);

  // Close Details Panel
  elBtnCloseDetails.addEventListener('click', closeDetailsPanel);

  // Sync Slider value displays
  elTunerAffection.addEventListener('input', (e) => elValAffection.textContent = e.target.value);
  elTunerTrust.addEventListener('input', (e) => elValTrust.textContent = e.target.value);
  elTunerEnergy.addEventListener('input', (e) => elValEnergy.textContent = e.target.value);
  elTunerTension.addEventListener('input', (e) => elValTension.textContent = e.target.value);
  elTunerIntimacy.addEventListener('input', (e) => elValIntimacy.textContent = e.target.value);
  elTunerShyness.addEventListener('input', (e) => elValShyness.textContent = e.target.value);
  elTunerCuriosity.addEventListener('input', (e) => elValCuriosity.textContent = e.target.value);
  elTunerVolatility.addEventListener('input', (e) => elValVolatility.textContent = e.target.value);
  elTunerDesire.addEventListener('input', (e) => elValDesire.textContent = e.target.value);
  elTunerInhibition.addEventListener('input', (e) => elValInhibition.textContent = e.target.value);
  elTunerComfort.addEventListener('input', (e) => elValComfort.textContent = e.target.value);
  elTunerCompliance.addEventListener('input', (e) => elValCompliance.textContent = e.target.value);

  // State Tuner Form Submit
  elStateTunerForm.addEventListener('submit', handleTunerSubmit);

  // Memory Form Toggles
  elBtnToggleAddMemory.addEventListener('click', () => elAddMemoryForm.classList.toggle('hidden'));
  elBtnCancelMemory.addEventListener('click', () => {
    elAddMemoryForm.classList.add('hidden');
    elAddMemoryForm.reset();
  });

  // Add Memory Form Submit
  elAddMemoryForm.addEventListener('submit', handleAddMemorySubmit);
}

// Fetch WhatsApp and General Bot Status
async function fetchStatus() {
  try {
    const res = await fetch('/api/dashboard/status');
    if (!res.ok) throw new Error('Failed to fetch status');
    
    const data = await res.json();
    
    // Update Character & System Info
    elCharacterName.textContent = data.bot.characterName;
    elLlmProvider.textContent = data.bot.llmProvider;
    elTotalContacts.textContent = data.stats.totalContacts;
    elAutoReplyCount.textContent = `${data.stats.autoReplyContacts} Auto-Reply`;
    
    // Update Connection Badge UI
    const status = data.whatsapp.status;
    elConnStatusText.textContent = status;
    
    // Reset classes
    elConnStatusBadge.className = 'connection-badge';
    elStatusVisual.className = 'status-visual';
    
    if (status === 'READY') {
      elConnStatusBadge.classList.add('connected');
      elStatusVisual.classList.add('ready');
      elStatusVisual.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i>';
      elStatusDesc.innerHTML = '<span class="text-success font-semibold">Bot Aktif & Siap Menerima Pesan</span>';
      elQrPanel.classList.add('hidden');
      currentQrCode = null;
    } else if (status === 'SCAN_QR') {
      elConnStatusBadge.classList.add('connecting');
      elStatusVisual.classList.add('loading');
      elStatusVisual.innerHTML = '<i class="fa-solid fa-qrcode"></i>';
      elStatusDesc.textContent = 'Menunggu Pemindaian QR Code...';
      
      // Update QR Code jika berubah
      if (data.whatsapp.qrCode && data.whatsapp.qrCode !== currentQrCode) {
        currentQrCode = data.whatsapp.qrCode;
        elQrPanel.classList.remove('hidden');
        renderQrCode(currentQrCode);
      }
    } else if (status === 'AUTHENTICATING' || status === 'LOADING') {
      elConnStatusBadge.classList.add('connecting');
      elStatusVisual.classList.add('loading');
      elStatusVisual.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      elStatusDesc.textContent = status === 'LOADING' ? 'Menyiapkan Data WhatsApp Web...' : 'Sedang Mengautentikasi Sesi...';
      elQrPanel.classList.add('hidden');
      currentQrCode = null;
    } else {
      // DISCONNECTED
      elStatusVisual.classList.add('disconnected');
      elStatusVisual.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
      elStatusDesc.textContent = 'WhatsApp Terputus.';
      elQrPanel.classList.add('hidden');
      currentQrCode = null;
    }

  } catch (error) {
    console.error('Error fetching system status:', error);
    elConnStatusText.textContent = 'OFFLINE';
    elConnStatusBadge.className = 'connection-badge';
  }
}

// Render QR Code using global qrcode.js CDN
function renderQrCode(qrText) {
  const qrcodeContainer = document.getElementById('qrcode');
  qrcodeContainer.innerHTML = ''; // Clear previous
  new QRCode(qrcodeContainer, {
    text: qrText,
    width: 220,
    height: 220,
    colorDark: '#080c14',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
}

// Fetch Contacts Table
async function fetchContacts() {
  try {
    const res = await fetch('/api/dashboard/contacts');
    if (!res.ok) throw new Error('Failed to fetch contacts');
    
    currentContacts = await res.json();
    renderContactsTable(currentContacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
  }
}

// Render Contacts in Table
function renderContactsTable(contacts) {
  if (contacts.length === 0) {
    elContactsListTbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted">Belum ada obrolan terdaftar. Kirim pesan ke bot untuk mendaftarkan kontak.</td>
      </tr>
    `;
    return;
  }

  elContactsListTbody.innerHTML = '';
  contacts.forEach(contact => {
    const row = document.createElement('tr');
    if (selectedChatId === contact.chatId) {
      row.classList.add('selected');
    }

    // Ambil Data State Relasi
    const state = withStateDefaults(contact.roleplayState);
    const presence = contact.roleplayPresenceState;
    
    // Format nomor HP
    const cleanNum = contact.chatId.replace('@c.us', '');
    const displayName = contact.persona || cleanNum;

    row.innerHTML = `
      <td>
        <div class="contact-name-cell">
          <span class="name">${displayName}</span>
          <span class="chat-id">${cleanNum}</span>
        </div>
      </td>
      <td>
        <select class="mode-select-pill ${contact.mode}" data-chat-id="${contact.chatId}">
          <option value="command_only" ${contact.mode === 'command_only' ? 'selected' : ''}>Command Only</option>
          <option value="auto_reply" ${contact.mode === 'auto_reply' ? 'selected' : ''}>Auto Reply</option>
          <option value="silent" ${contact.mode === 'silent' ? 'selected' : ''}>Silent (Mute)</option>
        </select>
      </td>
      <td>
        <div class="relation-metrics-cell">
          <span class="metric-pill affection" title="Affection"><i class="fa-solid fa-heart"></i> ${state.affection}</span>
          <span class="metric-pill trust" title="Trust"><i class="fa-solid fa-shield-halved"></i> ${state.trust}</span>
          <span class="metric-pill energy" title="Energy"><i class="fa-solid fa-bolt"></i> ${state.energy}</span>
          <span class="metric-pill drive" title="Desire / Comfort"><i class="fa-solid fa-fire"></i> ${state.desire}/${state.comfort}</span>
        </div>
      </td>
      <td>
        ${renderPresenceCell(presence)}
      </td>
      <td>
        <span class="mood-badge ${state.mood}">${state.mood}</span>
      </td>
      <td>
        <button class="btn btn-secondary btn-xs btn-inspect" data-chat-id="${contact.chatId}">
          <i class="fa-solid fa-magnifying-glass"></i> Inspeksi
        </button>
      </td>
    `;

    // Row Click (Inspect Contact)
    row.addEventListener('click', (e) => {
      // Jangan trigger inspeksi jika user mengubah mode dropdown
      if (e.target.tagName === 'SELECT') return;
      inspectContact(contact.chatId);
    });

    // Dropdown change listener
    const select = row.querySelector('.mode-select-pill');
    select.addEventListener('change', (e) => {
      updateContactMode(contact.chatId, e.target.value);
    });

    elContactsListTbody.appendChild(row);
  });
}

// Handle Inspection of Specific Contact
async function inspectContact(chatId) {
  selectedChatId = chatId;
  
  // Highlight row
  const rows = elContactsListTbody.querySelectorAll('tr');
  rows.forEach((r, idx) => {
    if (currentContacts[idx] && currentContacts[idx].chatId === chatId) {
      r.classList.add('selected');
    } else {
      r.classList.remove('selected');
    }
  });

  const contact = currentContacts.find(c => c.chatId === chatId);
  if (!contact) return;

  const state = withStateDefaults(contact.roleplayState);
  
  // Update Details Header
  const cleanNum = contact.chatId.replace('@c.us', '');
  elCurrentContactName.textContent = contact.persona || cleanNum;

  // Fill State Tuner Form
  elTunerChatId.value = contact.chatId;
  elTunerMood.value = state.mood;
  
  elTunerAffection.value = state.affection;
  elValAffection.textContent = state.affection;

  elTunerTrust.value = state.trust;
  elValTrust.textContent = state.trust;

  elTunerEnergy.value = state.energy;
  elValEnergy.textContent = state.energy;

  elTunerTension.value = state.tension ?? 0;
  elValTension.textContent = state.tension ?? 0;

  elTunerIntimacy.value = state.intimacy ?? 10;
  elValIntimacy.textContent = state.intimacy ?? 10;

  elTunerShyness.value = state.shyness ?? 15;
  elValShyness.textContent = state.shyness ?? 15;

  elTunerCuriosity.value = state.curiosity ?? 55;
  elValCuriosity.textContent = state.curiosity ?? 55;

  elTunerVolatility.value = state.volatility ?? 15;
  elValVolatility.textContent = state.volatility ?? 15;

  elTunerDesire.value = state.desire ?? 20;
  elValDesire.textContent = state.desire ?? 20;

  elTunerInhibition.value = state.inhibition ?? 55;
  elValInhibition.textContent = state.inhibition ?? 55;

  elTunerComfort.value = state.comfort ?? 55;
  elValComfort.textContent = state.comfort ?? 55;

  elTunerCompliance.value = state.compliance ?? 40;
  elValCompliance.textContent = state.compliance ?? 40;

  elTunerSummary.value = state.summary || '';
  renderPresenceSummary(contact.roleplayPresenceState);

  // Show details panel, hide placeholder
  elDetailsPlaceholder.classList.add('hidden');
  elDetailsCard.classList.remove('hidden');

  // Load Memories
  fetchContactMemory(chatId);
}

// Fetch memories for inspected contact
async function fetchContactMemory(chatId) {
  elMemoryItemsContainer.innerHTML = '<p class="text-muted text-center font-sm">Memuat data memori...</p>';
  try {
    const res = await fetch(`/api/dashboard/contacts/${chatId}/memory`);
    if (!res.ok) throw new Error('Failed to load memories');
    
    const memories = await res.json();
    renderMemories(memories);
  } catch (error) {
    elMemoryItemsContainer.innerHTML = '<p class="text-danger text-center font-sm">Gagal memuat memori.</p>';
  }
}

// Render memory list
function renderMemories(memories) {
  if (memories.length === 0) {
    elMemoryItemsContainer.innerHTML = `
      <p class="text-muted text-center font-sm padding-top-sm">Belum ada memori terdaftar. Memori akan dibuat otomatis saat mengobrol.</p>
    `;
    return;
  }

  elMemoryItemsContainer.innerHTML = '';
  memories.forEach(memory => {
    const card = document.createElement('div');
    card.className = 'memory-item';
    
    const dateFormatted = new Date(memory.createdAt).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    card.innerHTML = `
      <div class="memory-item-content">
        <span class="memory-kind-badge ${memory.kind}">${memory.kind.replace('_', ' ')}</span>
        <p class="memory-text">${escapeHTML(memory.content)}</p>
        <div class="memory-meta">
          <span><i class="fa-solid fa-star text-warning"></i> ${memory.importance}/100</span>
          <span><i class="fa-solid fa-clock"></i> ${dateFormatted}</span>
        </div>
      </div>
      <button class="btn-delete-memory" data-memory-id="${memory.id}" title="Hapus memori">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;

    // Delete Memory Handler
    card.querySelector('.btn-delete-memory').addEventListener('click', (e) => {
      const memoryId = e.currentTarget.getAttribute('data-memory-id');
      if (confirm('Apakah Anda yakin ingin menghapus memori ini secara permanen?')) {
        deleteMemory(memoryId);
      }
    });

    elMemoryItemsContainer.appendChild(card);
  });
}

// Close Details Panel
function closeDetailsPanel() {
  selectedChatId = null;
  elDetailsCard.classList.add('hidden');
  elDetailsPlaceholder.classList.remove('hidden');
  
  // Deselect row
  const rows = elContactsListTbody.querySelectorAll('tr');
  rows.forEach(r => r.classList.remove('selected'));
}

// Update Contact BotMode via API
async function updateContactMode(chatId, mode) {
  try {
    const res = await fetch(`/api/dashboard/contacts/${chatId}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    
    if (!res.ok) throw new Error('Failed to update mode');
    
    // Refresh data kontak
    await fetchContacts();
  } catch (error) {
    alert('Gagal memperbarui mode bot: ' + error.message);
  }
}

// Update State Variables via API (Tuning)
async function handleTunerSubmit(e) {
  e.preventDefault();
  const chatId = elTunerChatId.value;
  const btnSave = document.getElementById('btn-save-state');
  const originalHtml = btnSave.innerHTML;

  btnSave.disabled = true;
  btnSave.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menyimpan...';

  try {
    const res = await fetch(`/api/dashboard/contacts/${chatId}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: elTunerMood.value,
        affection: parseInt(elTunerAffection.value),
        trust: parseInt(elTunerTrust.value),
        energy: parseInt(elTunerEnergy.value),
        tension: parseInt(elTunerTension.value),
        intimacy: parseInt(elTunerIntimacy.value),
        shyness: parseInt(elTunerShyness.value),
        curiosity: parseInt(elTunerCuriosity.value),
        volatility: parseInt(elTunerVolatility.value),
        desire: parseInt(elTunerDesire.value),
        inhibition: parseInt(elTunerInhibition.value),
        comfort: parseInt(elTunerComfort.value),
        compliance: parseInt(elTunerCompliance.value),
        summary: elTunerSummary.value
      })
    });

    if (!res.ok) throw new Error('Failed to save state');
    
    // Success State
    btnSave.innerHTML = '<i class="fa-solid fa-circle-check"></i> Tersimpan!';
    btnSave.style.background = 'var(--success)';
    
    // Refresh list contacts
    await fetchContacts();
    
    setTimeout(() => {
      btnSave.disabled = false;
      btnSave.innerHTML = originalHtml;
      btnSave.style.background = '';
    }, 1500);

  } catch (error) {
    alert('Gagal menyimpan variabel hubungan: ' + error.message);
    btnSave.disabled = false;
    btnSave.innerHTML = originalHtml;
  }
}

// Add Memory manually
async function handleAddMemorySubmit(e) {
  e.preventDefault();
  const chatId = selectedChatId;
  const kind = document.getElementById('mem-kind').value;
  const content = document.getElementById('mem-content').value;
  const importance = parseInt(document.getElementById('mem-importance').value);

  try {
    const res = await fetch(`/api/dashboard/contacts/${chatId}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, content, importance })
    });

    if (!res.ok) throw new Error('Failed to add memory');
    
    // Reset & Hide Form
    elAddMemoryForm.reset();
    elAddMemoryForm.classList.add('hidden');
    
    // Refresh memories
    await fetchContactMemory(chatId);

  } catch (error) {
    alert('Gagal menambah memori: ' + error.message);
  }
}

// Delete Memory manually
async function deleteMemory(memoryId) {
  try {
    const res = await fetch(`/api/dashboard/memory/${memoryId}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Failed to delete memory');
    
    // Refresh memories
    if (selectedChatId) {
      await fetchContactMemory(selectedChatId);
    }
  } catch (error) {
    alert('Gagal menghapus memori: ' + error.message);
  }
}

// Restart WhatsApp Client
async function restartWaClient() {
  if (!confirm('Apakah Anda yakin ingin mematikan WhatsApp Client dan me-restart ulang sesi?')) {
    return;
  }

  elBtnRestartWa.disabled = true;
  elBtnRestartWa.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Restarting...';
  
  elConnStatusText.textContent = 'RESTARTING';
  elConnStatusBadge.className = 'connection-badge connecting';
  elStatusVisual.className = 'status-visual loading';
  elStatusVisual.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i>';
  elStatusDesc.textContent = 'Memutus client saat ini dan mereset sesi local auth...';

  try {
    const res = await fetch('/api/dashboard/wa/restart', { method: 'POST' });
    if (!res.ok) throw new Error('Restart request failed');
    
    // Polling instan untuk update status
    setTimeout(fetchStatus, 1000);
  } catch (error) {
    alert('Gagal merestart WhatsApp Client: ' + error.message);
  } finally {
    setTimeout(() => {
      elBtnRestartWa.disabled = false;
      elBtnRestartWa.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Restart Sesi';
    }, 2000);
  }
}

// Utility: Escape HTML to prevent XSS
function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function withStateDefaults(state = {}) {
  return {
    mood: state.mood || 'neutral',
    affection: state.affection ?? 50,
    trust: state.trust ?? 50,
    energy: state.energy ?? 70,
    tension: state.tension ?? 0,
    intimacy: state.intimacy ?? 10,
    shyness: state.shyness ?? 15,
    curiosity: state.curiosity ?? 55,
    volatility: state.volatility ?? 15,
    desire: state.desire ?? 20,
    inhibition: state.inhibition ?? 55,
    comfort: state.comfort ?? 55,
    compliance: state.compliance ?? 40,
    summary: state.summary || '',
  };
}

function renderPresenceCell(presence) {
  if (!presence) {
    return '<span class="text-muted font-sm">-</span>';
  }

  return `
    <span class="metric-pill presence" title="${escapeHTML(presence.statusText)}">
      <i class="fa-solid fa-location-dot"></i> ${escapeHTML(presence.activityType)}
    </span>
  `;
}

function renderPresenceSummary(presence) {
  if (!presence) {
    elPresenceStatusText.textContent = 'Belum ada aktivitas aktif.';
    elPresenceSourceText.textContent = '-';
    elPresenceActivityType.textContent = '-';
    elPresenceLocation.textContent = '-';
    elPresenceSocial.textContent = '-';
    elPresenceInterruptibility.textContent = '-';
    elPresenceExpires.textContent = '-';
    return;
  }

  elPresenceStatusText.textContent = presence.statusText;
  elPresenceSourceText.textContent = presence.source || '-';
  elPresenceActivityType.textContent = presence.activityType || '-';
  elPresenceLocation.textContent = presence.locationLabel || '-';
  elPresenceSocial.textContent = presence.socialContext || '-';
  elPresenceInterruptibility.textContent = presence.interruptibility || '-';
  elPresenceExpires.textContent = presence.expiresAt ? new Date(presence.expiresAt).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }) : '-';
}
