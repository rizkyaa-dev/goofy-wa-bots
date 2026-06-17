document.addEventListener('DOMContentLoaded', () => {
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

  const stateDefaults = {
    mood: 'neutral',
    affection: 50,
    trust: 50,
    energy: 70,
    tension: 0,
    intimacy: 10,
    shyness: 15,
    curiosity: 55,
    volatility: 15,
    desire: 20,
    inhibition: 55,
    comfort: 55,
    compliance: 40,
    summary: '',
  };

  const chatIdSelect = document.getElementById('chatIdSelect');
  const chatViewport = document.getElementById('chatViewport');
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  const btnSend = document.getElementById('btnSend');
  const btnResetSandbox = document.getElementById('btnResetSandbox');
  const statusToast = document.getElementById('statusToast');

  const stateCheatForm = document.getElementById('stateCheatForm');
  const presenceCheatForm = document.getElementById('presenceCheatForm');
  const memoryCheatForm = document.getElementById('memoryCheatForm');
  const btnFillPresenceFromCurrent = document.getElementById('btnFillPresenceFromCurrent');

  const moodBadge = document.getElementById('moodBadge');
  const memoryList = document.getElementById('memoryList');
  const sandboxTokenUsage = document.getElementById('sandboxTokenUsage');

  const metricRefs = {
    affection: createMetricRef('affectionVal', 'affectionBar'),
    trust: createMetricRef('trustVal', 'trustBar'),
    energy: createMetricRef('energyVal', 'energyBar'),
    tension: createMetricRef('tensionVal', 'tensionBar'),
    intimacy: createMetricRef('intimacyVal', 'intimacyBar'),
    shyness: createMetricRef('shynessVal', 'shynessBar'),
    curiosity: createMetricRef('curiosityVal', 'curiosityBar'),
    volatility: createMetricRef('volatilityVal', 'volatilityBar'),
    desire: createMetricRef('desireVal', 'desireBar'),
    inhibition: createMetricRef('inhibitionVal', 'inhibitionBar'),
    comfort: createMetricRef('comfortVal', 'comfortBar'),
    compliance: createMetricRef('complianceVal', 'complianceBar'),
  };

  const stateInputs = {
    mood: document.getElementById('cheatMood'),
    affection: createSliderRef('cheatAffection', 'cheatValAffection'),
    trust: createSliderRef('cheatTrust', 'cheatValTrust'),
    energy: createSliderRef('cheatEnergy', 'cheatValEnergy'),
    tension: createSliderRef('cheatTension', 'cheatValTension'),
    intimacy: createSliderRef('cheatIntimacy', 'cheatValIntimacy'),
    shyness: createSliderRef('cheatShyness', 'cheatValShyness'),
    curiosity: createSliderRef('cheatCuriosity', 'cheatValCuriosity'),
    volatility: createSliderRef('cheatVolatility', 'cheatValVolatility'),
    desire: createSliderRef('cheatDesire', 'cheatValDesire'),
    inhibition: createSliderRef('cheatInhibition', 'cheatValInhibition'),
    comfort: createSliderRef('cheatComfort', 'cheatValComfort'),
    compliance: createSliderRef('cheatCompliance', 'cheatValCompliance'),
    summary: document.getElementById('cheatSummary'),
  };

  const presenceRefs = {
    statusText: document.getElementById('presenceStatusText'),
    activityType: document.getElementById('presenceActivityType'),
    locationLabel: document.getElementById('presenceLocation'),
    socialContext: document.getElementById('presenceSocialContext'),
    interruptibility: document.getElementById('presenceInterruptibility'),
    source: document.getElementById('presenceSource'),
    expiresAt: document.getElementById('presenceExpiresAt'),
  };

  const presenceInputs = {
    activityType: document.getElementById('presenceActivityInput'),
    statusText: document.getElementById('presenceStatusInput'),
    locationLabel: document.getElementById('presenceLocationInput'),
    socialContext: document.getElementById('presenceSocialInput'),
    interruptibility: document.getElementById('presenceInterruptibilityInput'),
    source: document.getElementById('presenceSourceInput'),
    priority: document.getElementById('presencePriorityInput'),
    durationMinutes: document.getElementById('presenceDurationInput'),
    lastReason: document.getElementById('presenceReasonInput'),
  };

  const memoryInputs = {
    kind: document.getElementById('memoryKindInput'),
    content: document.getElementById('memoryContentInput'),
    importance: document.getElementById('memoryImportanceInput'),
  };

  let activeChatId = chatIdSelect.value;
  let currentPresence = null;
  let toastTimer = null;
  let cumulativeTokenUsage = createEmptyTokenUsage();

  Object.values(stateInputs)
    .filter((item) => item && item.input && item.value)
    .forEach((sliderRef) => {
      sliderRef.input.addEventListener('input', (event) => {
        sliderRef.value.textContent = event.target.value;
      });
    });

  loadSandboxState(activeChatId);

  chatIdSelect.addEventListener('change', (event) => {
    activeChatId = event.target.value;
    resetTokenUsage();
    chatViewport.innerHTML = '<div class="no-memories" style="margin: auto; text-align: center;"><p style="color: #94a3b8; font-weight: 500; font-size: 14px;">Memuat riwayat chat...</p></div>';
    loadSandboxState(activeChatId);
  });

  chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text) {
      return;
    }

    const originalSendText = btnSend.innerHTML;
    messageInput.disabled = true;
    btnSend.disabled = true;
    btnSend.innerHTML = '<span>Berpikir...</span>';

    appendMessage(text, 'inbound');
    messageInput.value = '';

    try {
      const response = await fetch('/api/sandbox/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeChatId, text }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Gagal mengirim pesan'));
      }

      const result = await response.json();
      addTokenUsage(result.usage);
      const replyBubbles = getReplyBubbles(result);

      for (const replyBubble of replyBubbles) {
        appendMessage(replyBubble, 'outbound');
      }

      await loadSandboxState(activeChatId, false);
    } catch (error) {
      console.error(error);
      appendMessage('Maaf, terjadi kesalahan saat menghubungi Alya Sandbox engine.', 'outbound');
      showToast(error.message || 'Gagal mengirim pesan sandbox.', 'error');
    } finally {
      messageInput.disabled = false;
      btnSend.disabled = false;
      btnSend.innerHTML = originalSendText;
      messageInput.focus();
    }
  });

  stateCheatForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      await postJson(`/api/sandbox/state/${activeChatId}`, {
        mood: stateInputs.mood.value,
        affection: Number(stateInputs.affection.input.value),
        trust: Number(stateInputs.trust.input.value),
        energy: Number(stateInputs.energy.input.value),
        tension: Number(stateInputs.tension.input.value),
        intimacy: Number(stateInputs.intimacy.input.value),
        shyness: Number(stateInputs.shyness.input.value),
        curiosity: Number(stateInputs.curiosity.input.value),
        volatility: Number(stateInputs.volatility.input.value),
        desire: Number(stateInputs.desire.input.value),
        inhibition: Number(stateInputs.inhibition.input.value),
        comfort: Number(stateInputs.comfort.input.value),
        compliance: Number(stateInputs.compliance.input.value),
        summary: stateInputs.summary.value,
      });

      showToast('Roleplay state sandbox diperbarui.', 'success');
      await loadSandboxState(activeChatId, false);
    } catch (error) {
      showToast(error.message || 'Gagal menyimpan state sandbox.', 'error');
    }
  });

  presenceCheatForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      await postJson(`/api/sandbox/presence/${activeChatId}`, {
        activityType: presenceInputs.activityType.value,
        statusText: presenceInputs.statusText.value.trim(),
        locationLabel: presenceInputs.locationLabel.value.trim(),
        socialContext: presenceInputs.socialContext.value,
        interruptibility: presenceInputs.interruptibility.value,
        source: presenceInputs.source.value,
        priority: Number(presenceInputs.priority.value),
        durationMinutes: Number(presenceInputs.durationMinutes.value),
        lastReason: presenceInputs.lastReason.value.trim(),
      });

      showToast('Presence sandbox diperbarui.', 'success');
      await loadSandboxState(activeChatId, false);
    } catch (error) {
      showToast(error.message || 'Gagal menyimpan presence sandbox.', 'error');
    }
  });

  btnFillPresenceFromCurrent.addEventListener('click', () => {
    if (!currentPresence) {
      showToast('Belum ada presence aktif untuk di-copy.', 'error');
      return;
    }

    fillPresenceForm(currentPresence);
    showToast('Presence saat ini sudah diisikan ke form cheat.', 'success');
  });

  memoryCheatForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      await postJson(`/api/sandbox/memory/${activeChatId}`, {
        kind: memoryInputs.kind.value,
        content: memoryInputs.content.value.trim(),
        importance: Number(memoryInputs.importance.value),
      });

      memoryInputs.content.value = '';
      showToast('Memory sandbox ditambahkan.', 'success');
      await loadSandboxState(activeChatId, false);
    } catch (error) {
      showToast(error.message || 'Gagal menambah memory sandbox.', 'error');
    }
  });

  btnResetSandbox.addEventListener('click', async () => {
    if (!confirm('Apakah Anda yakin ingin mereset seluruh riwayat chat, emosi, presence, dan memory untuk user sandbox ini?')) {
      return;
    }

    try {
      const response = await fetch(`/api/sandbox/reset/${activeChatId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Gagal mereset sandbox'));
      }

      chatViewport.innerHTML = `
        <div class="no-memories" style="margin: auto; text-align: center;">
          <p style="color: #94a3b8; font-weight: 500; font-size: 14px;">Sandbox berhasil direset.</p>
          <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Kirim pesan baru atau pakai cheat console untuk set kondisi awal.</p>
        </div>
      `;

      showToast('Sandbox berhasil direset.', 'success');
      resetTokenUsage();
      await loadSandboxState(activeChatId, false);
    } catch (error) {
      showToast(error.message || 'Gagal mereset sandbox.', 'error');
    }
  });

  async function loadSandboxState(chatId, renderHistory = true) {
    try {
      const response = await fetch(`/api/sandbox/state/${chatId}`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Gagal memuat status sandbox'));
      }

      const data = await response.json();
      renderMetrics(data.state || stateDefaults);
      fillStateForm(data.state || stateDefaults);
      renderPresence(data.presence || null);
      renderMemories(Array.isArray(data.memories) ? data.memories : []);

      if (renderHistory) {
        renderChatHistory(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Gagal memuat sandbox state.', 'error');
    }
  }

  function renderMetrics(state) {
    updateMetric(metricRefs.affection, state.affection ?? stateDefaults.affection);
    updateMetric(metricRefs.trust, state.trust ?? stateDefaults.trust);
    updateMetric(metricRefs.energy, state.energy ?? stateDefaults.energy);
    updateMetric(metricRefs.tension, state.tension ?? stateDefaults.tension);
    updateMetric(metricRefs.intimacy, state.intimacy ?? stateDefaults.intimacy);
    updateMetric(metricRefs.shyness, state.shyness ?? stateDefaults.shyness);
    updateMetric(metricRefs.curiosity, state.curiosity ?? stateDefaults.curiosity);
    updateMetric(metricRefs.volatility, state.volatility ?? stateDefaults.volatility);
    updateMetric(metricRefs.desire, state.desire ?? stateDefaults.desire);
    updateMetric(metricRefs.inhibition, state.inhibition ?? stateDefaults.inhibition);
    updateMetric(metricRefs.comfort, state.comfort ?? stateDefaults.comfort);
    updateMetric(metricRefs.compliance, state.compliance ?? stateDefaults.compliance);

    const mood = (state.mood || stateDefaults.mood).toLowerCase();
    moodBadge.innerText = mood;
    moodBadge.className = `mood-badge mood-${mood}`;
  }

  function renderPresence(presence) {
    currentPresence = presence;

    if (!presence) {
      presenceRefs.statusText.textContent = 'Belum ada aktivitas aktif. Presence akan dibuat otomatis saat chat atau rutinitas berjalan.';
      presenceRefs.activityType.textContent = '-';
      presenceRefs.locationLabel.textContent = '-';
      presenceRefs.socialContext.textContent = '-';
      presenceRefs.interruptibility.textContent = '-';
      presenceRefs.source.textContent = '-';
      presenceRefs.expiresAt.textContent = '-';
      resetPresenceForm();
      return;
    }

    presenceRefs.statusText.textContent = presence.statusText || '-';
    presenceRefs.activityType.textContent = presence.activityType || '-';
    presenceRefs.locationLabel.textContent = presence.locationLabel || '-';
    presenceRefs.socialContext.textContent = presence.socialContext || '-';
    presenceRefs.interruptibility.textContent = presence.interruptibility || '-';
    presenceRefs.source.textContent = `${presence.source || '-'} (p${presence.priority ?? '-'})`;
    presenceRefs.expiresAt.textContent = presence.expiresAt
      ? new Date(presence.expiresAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
      : '-';
  }

  function renderMemories(memories) {
    if (!memories.length) {
      memoryList.innerHTML = '<div class="no-memories">Belum ada memori terdeteksi.</div>';
      return;
    }

    memoryList.innerHTML = '';

    memories.forEach((memory) => {
      const item = document.createElement('div');
      item.className = 'memory-item';
      item.innerHTML = `
        <div class="memory-item-content">
          <span class="memory-kind-badge ${escapeHtml(memory.kind)}">${escapeHtml(memory.kind)}</span>
          <div class="memory-text">${escapeHtml(memory.content)}</div>
          <div class="memory-meta">
            <span>importance ${memory.importance}/100</span>
            <span>${new Date(memory.updatedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
        </div>
        <button class="btn-delete-memory" type="button" data-memory-id="${memory.id}" title="Hapus memory">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;

      item.querySelector('.btn-delete-memory').addEventListener('click', async () => {
        if (!confirm('Hapus memory ini dari sandbox?')) {
          return;
        }

        try {
          const response = await fetch(`/api/sandbox/memory/${memory.id}`, { method: 'DELETE' });
          if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Gagal menghapus memory sandbox'));
          }

          showToast('Memory sandbox dihapus.', 'success');
          await loadSandboxState(activeChatId, false);
        } catch (error) {
          showToast(error.message || 'Gagal menghapus memory sandbox.', 'error');
        }
      });

      memoryList.appendChild(item);
    });
  }

  function renderChatHistory(messages) {
    chatViewport.innerHTML = '';

    if (!messages.length) {
      renderChatPlaceholder();
      return;
    }

    messages.forEach((message) => {
      const isOutbound = message.direction === 'outbound';
      const text = message.responseText || message.body;
      const bubbles = isOutbound ? splitReplyBubbles(text) : [String(text || '').trim()].filter(Boolean);

      for (const bubbleText of bubbles) {
        appendMessage(bubbleText, isOutbound ? 'outbound' : 'inbound', new Date(message.createdAt));
      }
    });
  }

  function renderChatPlaceholder() {
    chatViewport.innerHTML = `
      <div class="no-memories" style="margin: auto; text-align: center;">
        <p style="color: #94a3b8; font-weight: 500; font-size: 14px;">Mulai percakapan dengan Alya di sini.</p>
        <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Log ini terpisah dari WhatsApp produksi dan aman buat eksperimen.</p>
      </div>
    `;
  }

  function appendMessage(text, direction, time = new Date()) {
    const noMsgPlaceholder = chatViewport.querySelector('.no-memories');
    if (noMsgPlaceholder) {
      noMsgPlaceholder.remove();
    }

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${direction === 'inbound' ? 'inbound' : 'outbound'}`;
    const timeStr = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    bubble.innerHTML = `
      <div class="msg-text">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
      <div class="msg-time">${timeStr}</div>
    `;

    chatViewport.appendChild(bubble);
    chatViewport.scrollTop = chatViewport.scrollHeight;
  }

  function getReplyBubbles(result) {
    const parts = Array.isArray(result.parts) ? result.parts : [];

    if (parts.length > 0) {
      return parts.flatMap((part) => splitReplyBubbles(part?.text));
    }

    return splitReplyBubbles(result.reply);
  }

  function splitReplyBubbles(text) {
    return String(text || '')
      .split(/\n+/u)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function addTokenUsage(usage) {
    const normalized = normalizeTokenUsage(usage);

    if (!normalized) {
      renderTokenUsage();
      return;
    }

    cumulativeTokenUsage.inputTokens += normalized.inputTokens;
    cumulativeTokenUsage.outputTokens += normalized.outputTokens;
    cumulativeTokenUsage.totalTokens += normalized.totalTokens || normalized.inputTokens + normalized.outputTokens;
    renderTokenUsage();
  }

  function resetTokenUsage() {
    cumulativeTokenUsage = createEmptyTokenUsage();
    renderTokenUsage();
  }

  function renderTokenUsage() {
    if (!sandboxTokenUsage) {
      return;
    }

    const inputTokens = formatTokenCount(cumulativeTokenUsage.inputTokens);
    const outputTokens = formatTokenCount(cumulativeTokenUsage.outputTokens);
    const totalTokens = formatTokenCount(cumulativeTokenUsage.totalTokens);
    sandboxTokenUsage.textContent = `tok total in: ${inputTokens} / out: ${outputTokens} / all: ${totalTokens}`;
  }

  function formatTokenCount(value) {
    return Number.isFinite(value) ? Number(value).toLocaleString('id-ID') : '-';
  }

  function normalizeTokenUsage(usage) {
    const inputTokens = normalizeTokenCount(usage?.inputTokens);
    const outputTokens = normalizeTokenCount(usage?.outputTokens);
    const totalTokens = normalizeTokenCount(usage?.totalTokens);

    if (inputTokens === null && outputTokens === null && totalTokens === null) {
      return null;
    }

    return {
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
    };
  }

  function normalizeTokenCount(value) {
    return Number.isFinite(value) ? Math.max(0, Math.round(Number(value))) : null;
  }

  function createEmptyTokenUsage() {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }

  function fillStateForm(state) {
    stateInputs.mood.value = state.mood || stateDefaults.mood;
    syncSlider(stateInputs.affection, state.affection ?? stateDefaults.affection);
    syncSlider(stateInputs.trust, state.trust ?? stateDefaults.trust);
    syncSlider(stateInputs.energy, state.energy ?? stateDefaults.energy);
    syncSlider(stateInputs.tension, state.tension ?? stateDefaults.tension);
    syncSlider(stateInputs.intimacy, state.intimacy ?? stateDefaults.intimacy);
    syncSlider(stateInputs.shyness, state.shyness ?? stateDefaults.shyness);
    syncSlider(stateInputs.curiosity, state.curiosity ?? stateDefaults.curiosity);
    syncSlider(stateInputs.volatility, state.volatility ?? stateDefaults.volatility);
    syncSlider(stateInputs.desire, state.desire ?? stateDefaults.desire);
    syncSlider(stateInputs.inhibition, state.inhibition ?? stateDefaults.inhibition);
    syncSlider(stateInputs.comfort, state.comfort ?? stateDefaults.comfort);
    syncSlider(stateInputs.compliance, state.compliance ?? stateDefaults.compliance);
    stateInputs.summary.value = state.summary || '';
  }

  function fillPresenceForm(presence) {
    if (!presence) {
      return;
    }

    presenceInputs.activityType.value = presence.activityType || 'relaxing';
    presenceInputs.statusText.value = presence.statusText || '';
    presenceInputs.locationLabel.value = presence.locationLabel || '';
    presenceInputs.socialContext.value = presence.socialContext || 'alone';
    presenceInputs.interruptibility.value = presence.interruptibility || 'medium';
    presenceInputs.source.value = presence.source || 'manual';
    presenceInputs.priority.value = String(presence.priority ?? 35);
    presenceInputs.lastReason.value = presence.lastReason || '';

    const minutesLeft = presence.expiresAt
      ? Math.max(5, Math.round((new Date(presence.expiresAt).getTime() - Date.now()) / 60000))
      : 60;
    presenceInputs.durationMinutes.value = String(minutesLeft);
  }

  function resetPresenceForm() {
    presenceInputs.activityType.value = 'relaxing';
    presenceInputs.durationMinutes.value = '60';
    presenceInputs.statusText.value = '';
    presenceInputs.locationLabel.value = '';
    presenceInputs.socialContext.value = 'alone';
    presenceInputs.interruptibility.value = 'medium';
    presenceInputs.source.value = 'manual';
    presenceInputs.priority.value = '35';
    presenceInputs.lastReason.value = '';
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Request sandbox gagal'));
    }

    return response.json().catch(() => ({}));
  }

  async function readErrorMessage(response, fallbackMessage) {
    try {
      const text = await response.text();
      return text || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }

  function showToast(message, type = 'success') {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }

    statusToast.textContent = message;
    statusToast.className = `status-toast show ${type}`;

    toastTimer = setTimeout(() => {
      statusToast.className = 'status-toast';
      statusToast.textContent = '';
    }, 2600);
  }

  function updateMetric(ref, value) {
    ref.value.innerText = `${value}/100`;
    ref.bar.style.width = `${value}%`;
  }

  function syncSlider(sliderRef, value) {
    sliderRef.input.value = String(value);
    sliderRef.value.textContent = String(value);
  }

  function createMetricRef(valueId, barId) {
    return {
      value: document.getElementById(valueId),
      bar: document.getElementById(barId),
    };
  }

  function createSliderRef(inputId, valueId) {
    return {
      input: document.getElementById(inputId),
      value: document.getElementById(valueId),
    };
  }

  function escapeHtml(unsafe) {
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
