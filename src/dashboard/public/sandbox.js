document.addEventListener('DOMContentLoaded', () => {
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

  const chatIdSelect = document.getElementById('chatIdSelect');
  const chatViewport = document.getElementById('chatViewport');
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  const btnSend = document.getElementById('btnSend');
  
  // Metrics
  const affectionVal = document.getElementById('affectionVal');
  const affectionBar = document.getElementById('affectionBar');
  const trustVal = document.getElementById('trustVal');
  const trustBar = document.getElementById('trustBar');
  const energyVal = document.getElementById('energyVal');
  const energyBar = document.getElementById('energyBar');
  const tensionVal = document.getElementById('tensionVal');
  const tensionBar = document.getElementById('tensionBar');
  const intimacyVal = document.getElementById('intimacyVal');
  const intimacyBar = document.getElementById('intimacyBar');
  const shynessVal = document.getElementById('shynessVal');
  const shynessBar = document.getElementById('shynessBar');
  const curiosityVal = document.getElementById('curiosityVal');
  const curiosityBar = document.getElementById('curiosityBar');
  const moodBadge = document.getElementById('moodBadge');
  const memoryList = document.getElementById('memoryList');
  
  // Actions
  const btnResetSandbox = document.getElementById('btnResetSandbox');

  let activeChatId = chatIdSelect.value;

  // Load state and messages on start
  loadSandboxState(activeChatId);

  // Switch chat ID
  chatIdSelect.addEventListener('change', (e) => {
    activeChatId = e.target.value;
    chatViewport.innerHTML = '<div class="no-memories" style="margin: auto; text-align: center;"><p style="color: #94a3b8; font-weight: 500; font-size: 14px;">Memuat riwayat chat...</p></div>';
    loadSandboxState(activeChatId);
  });

  // Submit message
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    // Disable inputs
    messageInput.disabled = true;
    btnSend.disabled = true;
    const originalSendText = btnSend.innerHTML;
    btnSend.innerHTML = '<span>Berpikir...</span>';

    // Append user message immediately
    appendMessage(text, 'inbound');
    messageInput.value = '';

    try {
      const response = await fetch('/api/sandbox/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeChatId, text })
      });

      if (!response.ok) {
        throw new Error('Gagal mengirim pesan');
      }

      const result = await response.json();
      
      // Append bot replies
      appendMessage(result.reply, 'outbound');
      
      // Refresh metric states & memories
      await loadSandboxState(activeChatId, false);
    } catch (err) {
      console.error(err);
      appendMessage('Maaf, terjadi kesalahan saat menghubungi Alya Sandbox engine.', 'outbound');
    } finally {
      messageInput.disabled = false;
      btnSend.disabled = false;
      btnSend.innerHTML = originalSendText;
      messageInput.focus();
    }
  });

  // Reset sandbox chat
  btnResetSandbox.addEventListener('click', async () => {
    if (!confirm('Apakah Anda yakin ingin mereset seluruh riwayat chat, emosi, dan memori untuk user sandbox ini?')) {
      return;
    }

    try {
      const response = await fetch(`/api/sandbox/reset/${activeChatId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Gagal mereset sandbox');
      }

      chatViewport.innerHTML = `
        <div class="no-memories" style="margin: auto; text-align: center;">
          <p style="color: #94a3b8; font-weight: 500; font-size: 14px;">Sandbox berhasil direset!</p>
          <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Kirimkan pesan untuk memulai obrolan baru.</p>
        </div>
      `;
      
      await loadSandboxState(activeChatId, false);
    } catch (err) {
      alert('Gagal mereset: ' + err.message);
    }
  });

  // Fetch state & messages
  async function loadSandboxState(chatId, renderHistory = true) {
    try {
      const res = await fetch(`/api/sandbox/state/${chatId}`);
      if (!res.ok) throw new Error('Gagal memuat status sandbox');
      const data = await res.json();

      // Render metrics
      renderMetrics(data.state);

      // Render memories
      renderMemories(data.memories);

      // Render history
      if (renderHistory) {
        renderChatHistory(data.messages);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function renderMetrics(state) {
    // Affection
    affectionVal.innerText = `${state.affection}/100`;
    affectionBar.style.width = `${state.affection}%`;

    // Trust
    trustVal.innerText = `${state.trust}/100`;
    trustBar.style.width = `${state.trust}%`;

    // Energy
    energyVal.innerText = `${state.energy}/100`;
    energyBar.style.width = `${state.energy}%`;

    // Tension
    tensionVal.innerText = `${state.tension}/100`;
    tensionBar.style.width = `${state.tension}%`;

    // Intimacy
    intimacyVal.innerText = `${state.intimacy ?? 10}/100`;
    intimacyBar.style.width = `${state.intimacy ?? 10}%`;

    // Shyness
    shynessVal.innerText = `${state.shyness ?? 15}/100`;
    shynessBar.style.width = `${state.shyness ?? 15}%`;

    // Curiosity
    curiosityVal.innerText = `${state.curiosity ?? 55}/100`;
    curiosityBar.style.width = `${state.curiosity ?? 55}%`;

    // Mood badge class
    moodBadge.innerText = state.mood;
    moodBadge.className = `mood-badge mood-${state.mood.toLowerCase()}`;
  }

  function renderMemories(memories) {
    if (!memories || memories.length === 0) {
      memoryList.innerHTML = '<div class="no-memories">Belum ada memori terdeteksi.</div>';
      return;
    }

    memoryList.innerHTML = memories.map(m => `
      <div class="memory-item">
        <div class="memory-kind">${m.kind}</div>
        <div>${m.content}</div>
      </div>
    `).join('');
  }

  function renderChatHistory(messages) {
    chatViewport.innerHTML = '';
    
    // If no messages, render instructions
    const normalMessages = messages.filter(m => !m.body.startsWith('[Proactive:'));
    if (!normalMessages || normalMessages.length === 0) {
      chatViewport.innerHTML = `
        <div class="no-memories" style="margin: auto; text-align: center;">
          <p style="color: #94a3b8; font-weight: 500; font-size: 14px;">Mulai percakapan dengan Alya di sini.</p>
          <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Log tidak akan mengotori chat WhatsApp produksi Anda.</p>
        </div>
      `;
      return;
    }

    messages.forEach(m => {
      // Skip systemic proactive markers if needed or format them nicely
      const isOutbound = m.direction === 'outbound';
      const text = m.body;
      const responseText = m.responseText || text;
      
      appendMessage(isOutbound ? responseText : text, isOutbound ? 'outbound' : 'inbound', new Date(m.createdAt));
    });
  }

  function appendMessage(text, direction, time = new Date()) {
    // Check and remove placeholder instructions
    const noMsgPlaceholder = chatViewport.querySelector('.no-memories');
    if (noMsgPlaceholder) {
      noMsgPlaceholder.remove();
    }

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${direction === 'inbound' ? 'inbound' : 'outbound'}`;
    
    const timeStr = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    bubble.innerHTML = `
      <div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>
      <div class="msg-time">${timeStr}</div>
    `;

    chatViewport.appendChild(bubble);
    chatViewport.scrollTop = chatViewport.scrollHeight;
  }

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
