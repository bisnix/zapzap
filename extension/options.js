const $ = id => document.querySelector(id)
chrome.storage.local.get(['apiOrigin'], value => { if (value.apiOrigin) $('#origin').value = value.apiOrigin })
$('#save').onclick = async () => {
  const apiOrigin = $('#origin').value.trim().replace(/\/$/, '')
  const code = $('#code').value.trim()
  const name = $('#name').value.trim() || 'Chrome Extension'
  $('#status').textContent = 'Memasangkan…'
  try {
    const response = await fetch(`${apiOrigin}/api/devices/pair/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name, type: 'extension' }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Pairing gagal')
    await chrome.storage.local.set({ token: result.token, apiOrigin })
    $('#status').textContent = 'Berhasil. Kamu bisa menutup halaman ini.'
  } catch (error) { $('#status').textContent = error.message }
}
