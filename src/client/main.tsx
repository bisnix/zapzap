import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import './styles.css'

type Attachment = { attachment_key: string; thumbnail_key?: string; content_type?: string }
type Message = { id: string; type: string; text_content?: string; url?: string; attachment_key?: string; thumbnail_key?: string; attachments?: Attachment[]; created_at: string; read_at?: string; sender_name?: string }
type Device = { id: string; name: string; type: string; last_seen_at?: string; created_at: string }

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...options })
  if (response.status === 401) throw new Error('unauthorized')
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || 'request_failed')
  }
  return response.status === 204 ? {} as T : response.json()
}

function formatDate(value: string) { return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }

function Login() {
  return <main class="login-shell">
    <div class="brand-mark">↯</div>
    <p class="kicker">PERSONAL DEVICE INBOX</p>
    <h1>Kirim sekarang.<br /><span>Ambil nanti.</span></h1>
    <p class="lede">Tempat kecil untuk menyimpan teks, link, dan gambar yang ingin berpindah bersamamu.</p>
    <a class="button primary" href="/auth/google">Continue with Google</a>
    <p class="muted">Private by default. Dibangun untuk device milikmu.</p>
  </main>
}

function Compose({ onSent, initialText = '' }: { onSent: () => void; initialText?: string }) {
  const [text, setText] = useState(initialText)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function makeThumbnail(file: File) {
    const image = new Image()
    image.src = URL.createObjectURL(file)
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Gambar tidak dapat dibaca.')) })
    const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(image.src)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .78))
    return blob ? new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' }) : null
  }
  async function submit(event: Event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const uploadedAttachments: Array<{ key: string; thumbnailKey?: string }> = []
      if (files.length) {
        if (files.length > 10) throw new Error('Maksimal 10 gambar dalam satu kiriman.')
        if (files.reduce((total, item) => total + item.size, 0) > 50 * 1024 * 1024) throw new Error('Total ukuran gambar maksimal 50 MB.')
        for (const file of files) {
          if (file.size > 20 * 1024 * 1024) throw new Error('Ukuran setiap gambar maksimal 20 MB.')
          const key = (await api<{ key: string }>('/api/uploads', { method: 'POST', headers: { 'Content-Type': file.type }, body: file })).key
          const thumbnail = await makeThumbnail(file)
          const thumbnailKey = thumbnail ? (await api<{ key: string }>('/api/uploads', { method: 'POST', headers: { 'Content-Type': thumbnail.type }, body: thumbnail })).key : undefined
          uploadedAttachments.push({ key, thumbnailKey })
        }
      }
      await api('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: uploadedAttachments.length ? 'image' : 'text', text, attachments: uploadedAttachments }) })
      setText(''); setFiles([]); onSent()
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal mengirim pesan.') }
    finally { setBusy(false) }
  }
  return <form class="compose" onSubmit={submit}>
    <textarea value={text} onInput={e => setText((e.currentTarget as HTMLTextAreaElement).value)} placeholder="Tulis sesuatu untuk device-mu…" rows={4} />
    <div class="compose-foot">
      <label class="file-button">{files.length ? `${files.length} gambar dipilih` : 'Tambah gambar'}<input type="file" accept="image/*" multiple onChange={e => setFiles([...(e.currentTarget as HTMLInputElement).files || []])} /></label>
      <button class="button primary" disabled={busy || (!text.trim() && !files.length)}>{busy ? 'Mengirim…' : 'Kirim'}</button>
    </div>
    {error && <p class="error">{error}</p>}
  </form>
}

function MessageCard({ message, refresh }: { message: Message; refresh: () => void }) {
  const [offset, setOffset] = useState(0)
  const [startX, setStartX] = useState<number | null>(null)
  const [startY, setStartY] = useState<number | null>(null)
  const [swiping, setSwiping] = useState(false)
  async function remove() { await api(`/api/messages/${message.id}`, { method: 'DELETE' }); refresh() }
  async function markRead() { await api(`/api/messages/${message.id}/read`, { method: 'PATCH' }); refresh() }
  function touchStart(event: TouchEvent) { setStartX(event.touches[0].clientX); setStartY(event.touches[0].clientY); setSwiping(false) }
  function touchMove(event: TouchEvent) {
    if (startX === null || startY === null) return
    const dx = event.touches[0].clientX - startX
    const dy = event.touches[0].clientY - startY
    if (!swiping) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) return
      if (Math.abs(dx) < 12) return
      setSwiping(true)
    }
    setOffset(Math.max(-110, Math.min(110, dx)))
  }
  function touchEnd() { if (swiping && offset < -70) remove(); else if (swiping && offset > 70) markRead(); setOffset(0); setStartX(null); setStartY(null); setSwiping(false) }
  return <article class={`message-swipe ${message.read_at ? '' : 'unread'}`} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}>
    <div class="swipe-action read-action">Baca</div><div class="swipe-action delete-action">Hapus</div>
    <div class="message-card" style={{ transform: `translateX(${offset}px)` }}>
    <div class="message-meta"><span>{message.type === 'link' ? 'LINK' : message.type === 'image' ? 'IMAGE' : 'NOTE'}</span><time>{formatDate(message.created_at)}</time></div>
    {(message.text_content || message.url) && <p>{linkify([message.text_content, message.url && !message.text_content?.includes(message.url) ? message.url : ''].filter(Boolean).join('\n'))}</p>}
    {(message.attachments?.length || message.attachment_key) && <div class="image-grid">{(message.attachments?.length ? message.attachments : [{ attachment_key: message.attachment_key!, thumbnail_key: message.thumbnail_key }]).map((attachment, index) => <a class="image-preview" key={attachment.attachment_key} href={`/api/uploads/${attachment.attachment_key}`} target="_blank" rel="noreferrer"><img loading="lazy" src={`/api/uploads/${attachment.thumbnail_key || attachment.attachment_key}`} alt={`Lampiran gambar ${index + 1}`} /></a>)}</div>}
    <div class="message-status">{message.read_at ? '✓ Dibaca' : 'Belum dibaca'}</div><div class="message-actions"><button class="action-icon" title="Hapus pesan" aria-label="Hapus pesan" onClick={remove}>×</button>{!message.read_at && <button class="action-icon" title="Tandai sudah dibaca" aria-label="Tandai sudah dibaca" onClick={markRead}>✓</button>}</div>
    </div>
  </article>
}

function linkify(value: string) {
  const parts = value.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, index) => part.match(/^https?:\/\//) ? <a key={index} class="message-link" href={part} target="_blank" rel="noreferrer">{part}</a> : <span key={index}>{part}</span>)
}

function Devices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [code, setCode] = useState('')
  async function load() { setDevices((await api<{ devices: Device[] }>('/api/devices')).devices) }
  useEffect(() => { load() }, [])
  async function createCode() { setCode((await api<{ code: string }>('/api/devices/pair/start', { method: 'POST' })).code) }
  async function revoke(id: string) { await api(`/api/devices/${id}`, { method: 'DELETE' }); load() }
  return <section class="side-panel"><div class="section-heading"><h2>Devices</h2><button class="text-button" onClick={createCode}>Pair new</button></div>
    {code && <div class="pair-code"><span>Masukkan code ini di extension</span><strong>{code}</strong><small>berlaku 10 menit</small></div>}
    {devices.length === 0 ? <p class="muted">Belum ada device terdaftar.</p> : devices.map(d => <div class="device-row" key={d.id}><span class="device-dot" /><div><strong>{d.name}</strong><small>{d.type}</small></div><button class="text-button" onClick={() => revoke(d.id)}>Cabut</button></div>)}
  </section>
}

function toBytes(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob((value + padding).replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
}

async function enableNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Browser ini belum mendukung notifikasi web.')
  const key = (await api<{ publicKey: string | null }>('/api/push/public-key')).publicKey
  if (!key) throw new Error('VAPID key belum dikonfigurasi.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Izin notifikasi tidak diberikan.')
  await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) })
  await api('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription) })
}

function App() {
  const [user, setUser] = useState<{ email: string } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [syncError, setSyncError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const shareParams = new URLSearchParams(location.search)
  const sharedUrl = shareParams.get('url') || ''
  const sharedText = [shareParams.get('text') || shareParams.get('title') || '', sharedUrl].filter(Boolean).join('\n')
  const sharedSuccess = shareParams.get('shared') === '1'
  async function load(query = activeSearch) { const result = await api<{ messages: Message[] }>(`/api/messages${query ? `?q=${encodeURIComponent(query)}` : ''}`); setMessages(result.messages) }
  async function refreshInbox() { try { await load(); setLastUpdated(new Date()); setSyncError(false) } catch { setSyncError(true) } }
  function submitSearch(event: Event) { event.preventDefault(); setActiveSearch(search); window.setTimeout(() => refreshInbox(), 0) }
  useEffect(() => { api<{ user: { email: string } }>('/api/me').then(r => { setUser(r.user); return refreshInbox() }).catch(() => setUser(null)).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    if (!user) return
    const interval = window.setInterval(refreshInbox, 15000)
    window.addEventListener('focus', refreshInbox)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refreshInbox) }
  }, [user])
  if (loading) return <div class="loading">Memuat inbox…</div>
  if (!user) return <Login />
  return <div class="app-shell">
    <header class="topbar"><a class="wordmark" href="/">zapzap<span>↯</span></a><div class="account"><span>{user.email}</span><button class="text-button" onClick={() => fetch('/auth/logout', { method: 'POST' }).then(() => location.reload())}>Logout</button></div></header>
    <main class="dashboard">
      <section class="main-column"><div class="intro"><p class="kicker">YOUR QUIET CHANNEL</p><h1>Inbox yang<br /><em>ikut bergerak.</em></h1><p>Kirim sesuatu dari satu layar. Temukan lagi di layar yang lain.</p></div>{sharedSuccess && <div class="share-hint">Berhasil dibagikan ke semua device.</div>}{sharedText && <div class="share-hint">Dibagikan dari device lain. Tinggal cek lalu kirim.</div>}<Compose onSent={refreshInbox} initialText={sharedText} />{syncError && <div class="sync-warning">Inbox belum tersinkron. <button class="text-button" onClick={refreshInbox}>Coba lagi</button></div>}<form class="search-box" onSubmit={submitSearch}><input value={search} onInput={e => setSearch((e.currentTarget as HTMLInputElement).value)} placeholder="Cari teks atau link…" /><button class="search-button" type="submit">Cari</button>{activeSearch && <button class="clear-search" type="button" onClick={() => { setSearch(''); setActiveSearch(''); window.setTimeout(() => refreshInbox(), 0) }}>×</button>}</form><div class="section-heading history-heading"><h2>{activeSearch ? `Hasil untuk “${activeSearch}”` : 'Riwayat'}</h2><span>{messages.length} pesan{lastUpdated ? ` · ${lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>{messages.length === 0 ? <div class="empty-state"><strong>{activeSearch ? 'Tidak ada hasil.' : 'Belum ada apa-apa di sini.'}</strong><span>{activeSearch ? 'Coba kata kunci lain.' : 'Kirim link pertama dari Chrome atau tulis catatan kecil.'}</span></div> : messages.map(message => <MessageCard key={message.id} message={message} refresh={refreshInbox} />)}</section>
      <aside><Devices /><div class="aside-note"><strong>Notifikasi</strong><p>Aktifkan agar device ini diberi tahu saat ada kiriman baru.</p><button class="text-button" onClick={async () => { try { await enableNotifications(); alert('Notifikasi aktif di device ini.') } catch (error) { alert(error instanceof Error ? error.message : 'Gagal mengaktifkan notifikasi.') } }}>Aktifkan notifikasi</button></div><div class="aside-note"><strong>Tip kecil</strong><p>Tambahkan Zapzap ke Home Screen agar inbox terasa seperti aplikasi, tanpa aplikasi native.</p></div></aside>
    </main>
  </div>
}

render(<App />, document.getElementById('app')!)
