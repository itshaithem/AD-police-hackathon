document.getElementById('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  chrome.runtime.sendMessage({ type: 'GET_TAB_FLAGS', tabId: tab.id }, (resp) => {
    const list = document.getElementById('list');
    const flagged = resp?.flagged || [];
    if (!flagged.length) {
      list.textContent = 'No suspicious links found yet.';
      return;
    }
    list.classList.remove('empty');
    list.textContent = '';
    for (const f of flagged) {
      const row = document.createElement('div');
      row.className = 'item';
      const score = document.createElement('div');
      score.className = 'score';
      score.style.color = LEVEL_COLOR[levelOf(f.score)];
      score.textContent = `${f.hostname} — ${f.score}/100 (${f.verdict})`;
      row.appendChild(score);
      const reason = f.reasons?.[0]?.reason_en;
      if (reason) {
        const r = document.createElement('div');
        r.className = 'reason';
        r.textContent = reason;
        row.appendChild(r);
      }
      list.appendChild(row);
    }
  });
});
