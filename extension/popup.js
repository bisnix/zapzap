const app = document.querySelector('#app')
const DEFAULT_API = 'https://zapzap.bisnix.workers.dev'

async function load() {
  const { token, apiOrigin = DEFAULT_API } = await chrome.storage.local.get(['token', 'apiOrigin'])
  if (!token) {
    app.innerHTML = '<p class="status">Extension belum dipasangkan.</p><button id="setup">Buka setup</button>'
    document.querySelector('#setup').onclick = () => chrome.runtime.openOptionsPage()
    return
  }
  app.innerHTML = '<textarea id="text" placeholder="Kirim catatan, link, atau teks…"></textarea><label class="file">Tambah gambar <input id="file" type="file" accept="image/*"></label><div class="row"><span id="status" class="status"></span><button id="send">Kirim</button></div><button id="tab" class="secondary">Kirim tab aktif</button>'
  const send = async (payload) => {
    const response = await fetch(`${apiOrigin}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': token }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error('Gagal mengirim')
  }
  const upload = async file => {
    if (file.size > 20 * 1024 * 1024) throw new Error('Gambar maksimal 20 MB')
    const response = await fetch(`${apiOrigin}/api/uploads`, { method: 'POST', headers: { 'Content-Type': file.type, 'X-Device-Token': token }, body: file })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Upload gagal')
    return result.key
  }
  const makeThumbnail = async file => {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height))
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)))
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: .78 })
    return new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' })
  }
  document.querySelector('#send').onclick = async () => { const text = document.querySelector('#text').value.trim(); if (!text) return; try { await send({ type: text.startsWith('http') ? 'link' : 'text', text, url: text.startsWith('http') ? text : undefined }); document.querySelector('#text').value = ''; document.querySelector('#status').textContent = 'Terkirim'; } catch (e) { document.querySelector('#status').textContent = e.message } }
  const sendImage = async (file, label) => { const key = await upload(file); const thumbnail = await makeThumbnail(file); const thumbnailKey = await upload(thumbnail); await send({ type: 'image', attachmentKey: key, thumbnailKey }); document.querySelector('#status').textContent = label }
  document.querySelector('#file').onchange = async event => { const file = event.target.files?.[0]; if (!file) return; try { await sendImage(file, 'Gambar terkirim'); event.target.value = ''; } catch (e) { document.querySelector('#status').textContent = e.message } }
  document.querySelector('#text').onpaste = async event => { const file = [...(event.clipboardData?.files || [])].find(item => item.type.startsWith('image/')); if (!file) return; event.preventDefault(); try { await sendImage(file, 'Gambar dari clipboard terkirim') } catch (e) { document.querySelector('#status').textContent = e.message } }
  document.querySelector('#tab').onclick = async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab.url) return; try { await send({ type: 'link', url: tab.url, text: tab.title || tab.url }); document.querySelector('#status').textContent = 'Tab terkirim'; } catch (e) { document.querySelector('#status').textContent = e.message } }
}
load()
