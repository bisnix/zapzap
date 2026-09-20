const DEFAULT_API = 'https://zapzap.bisnix.workers.dev'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'zapzap-link', title: 'Send link to Zapzap', contexts: ['link'] })
  chrome.contextMenus.create({ id: 'zapzap-selection', title: 'Send selection to Zapzap', contexts: ['selection'] })
})

async function sendActiveTab() {
  const { token, apiOrigin = DEFAULT_API } = await chrome.storage.local.get(['token', 'apiOrigin'])
  if (!token) return chrome.runtime.openOptionsPage()
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return
  await fetch(`${apiOrigin}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': token }, body: JSON.stringify({ type: 'link', url: tab.url, text: tab.title || tab.url }) })
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { token, apiOrigin = DEFAULT_API } = await chrome.storage.local.get(['token', 'apiOrigin'])
  if (!token) return chrome.runtime.openOptionsPage()
  const content = info.selectionText || info.linkUrl || tab?.url || ''
  await fetch(`${apiOrigin}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': token }, body: JSON.stringify({ type: content.startsWith('http') ? 'link' : 'text', text: content, url: content.startsWith('http') ? content : undefined }) })
})

chrome.commands.onCommand.addListener(command => {
  if (command === 'send-active-tab') sendActiveTab()
})
