const apiBaseEl = document.getElementById('apiBase');
const apiKeyEl = document.getElementById('apiKey');
const statusEl = document.getElementById('status');

chrome.storage.local.get(['apiBase', 'apiKey'], (v) => {
  apiBaseEl.value = v.apiBase || 'http://localhost:8000';
  apiKeyEl.value = v.apiKey || '';
});

document.getElementById('save').addEventListener('click', async () => {
  const apiBase = apiBaseEl.value.trim().replace(/\/$/, '');
  const apiKey = apiKeyEl.value.trim();
  if (!apiBase) { statusEl.textContent = 'Backend URL is required.'; return; }

  // content.js only runs on pages Chrome has granted a host permission for. The manifest's
  // content_scripts entry matches <all_urls>, so that's what has to be granted here — requesting
  // only the backend's own origin (as this used to) covers the background fetch but leaves the
  // content script inactive everywhere, i.e. the extension would badge nothing on any page.
  const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
  if (!granted) { statusEl.textContent = 'Permission denied — scanning will not work without it.'; return; }

  chrome.storage.local.set({ apiBase, apiKey }, () => {
    statusEl.textContent = 'Saved.';
  });
});
