const apiBaseEl = document.getElementById('apiBase');
const statusEl = document.getElementById('status');

chrome.storage.local.get(['apiBase'], (v) => {
  apiBaseEl.value = v.apiBase || 'http://localhost:8000';
});

document.getElementById('save').addEventListener('click', () => {
  const apiBase = apiBaseEl.value.trim().replace(/\/$/, '');
  if (!apiBase) { statusEl.textContent = 'Backend URL is required.'; return; }

  chrome.storage.local.set({ apiBase }, () => {
    statusEl.textContent = 'Saved.';
  });
});
