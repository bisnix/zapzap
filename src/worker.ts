import { Hono } from 'hono'
import { sendPushNotification } from '@mmmike/web-push/send'

type Env = {
  Bindings: {
    DB: D1Database
    BUCKET: R2Bucket
    ASSETS: Fetcher
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    GOOGLE_REDIRECT_URI: string
    ALLOWED_EMAIL: string
    APP_ORIGIN: string
    VAPID_PUBLIC_KEY: string
    VAPID_PRIVATE_KEY: string
    VAPID_SUBJECT: string
  }
  Variables: {
    user: User
    device: Device | null
  }
}

type User = { id: string; email: string; google_subject: string }
type Device = { id: string; user_id: string; name: string; type: string }

const app = new Hono<Env>()
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_ATTACHMENTS = 10
const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024
const MAX_TEXT_LENGTH = 10_000
const MAX_URL_LENGTH = 2_048

app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/auth/')) c.header('Cache-Control', 'no-store')
})

function now() { return new Date().toISOString() }
function cookieValue(request: Request, name: string) {
  return request.headers.get('Cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1)
}
function cookie(name: string, value: string, maxAge: number, extra = '') {
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax${extra}`
}
async function digest(value: string) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function id() { return crypto.randomUUID() }
function randomCode() { return String(Math.floor(100000 + Math.random() * 900000)) }

async function auth(request: Request, env: Env['Bindings']) {
  const raw = cookieValue(request, 'zap_session') || request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!raw) return null
  const tokenHash = await digest(raw)
  const result = await env.DB.prepare(
    `SELECT u.id, u.email, u.google_subject FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
  ).bind(tokenHash).first<User>()
  if (!result) return null
  await env.DB.prepare(`UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`).bind(now(), tokenHash).run()
  return result
}

async function deviceFromRequest(request: Request, env: Env['Bindings'], userId?: string) {
  const raw = request.headers.get('X-Device-Token')
  if (!raw) return null
  const device = await env.DB.prepare(
    `SELECT id, user_id, name, type FROM devices WHERE token_hash = ? AND revoked_at IS NULL`
  ).bind(await digest(raw)).first<Device>()
  if (device && (!userId || device.user_id === userId)) {
    await env.DB.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).bind(now(), device.id).run()
    return device
  }
  return null
}

async function notifyUser(env: Env['Bindings'], userId: string, message: { id: string; type: string; text?: string | null; url?: string | null }) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return
  const rows = await env.DB.prepare(`SELECT endpoint, subscription_json FROM push_subscriptions WHERE user_id = ?`).bind(userId).all()
  await Promise.all((rows.results as unknown as Array<{ endpoint: string; subscription_json: string }>).map(async row => {
    try {
      const delivered = await sendPushNotification(JSON.parse(row.subscription_json), {
        title: 'Zapzap',
        body: message.type === 'link' ? (message.url || 'Link baru') : message.text || 'Gambar baru',
        url: '/',
        tag: `message-${message.id}`,
      }, { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }, { ttl: 86400 })
      if (!delivered) await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(row.endpoint).run()
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && ((error as { statusCode: number }).statusCode === 404 || (error as { statusCode: number }).statusCode === 410)) {
        await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(row.endpoint).run()
      }
    }
  }))
}

app.get('/auth/google', (c) => {
  const state = id()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', c.env.GOOGLE_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Set-Cookie': cookie('zap_oauth_state', state, 600) } })
})

app.get('/auth/google/callback', async (c) => {
  const state = c.req.query('state')
  const code = c.req.query('code')
  if (!state || state !== cookieValue(c.req.raw, 'zap_oauth_state') || !code) return c.text('OAuth state invalid.', 400)
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.env.GOOGLE_CLIENT_ID, client_secret: c.env.GOOGLE_CLIENT_SECRET, redirect_uri: c.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }),
  })
  if (!tokenResponse.ok) return c.text('Google OAuth token exchange failed.', 502)
  const tokens = await tokenResponse.json() as { access_token?: string }
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  if (!profileResponse.ok) return c.text('Google profile lookup failed.', 502)
  const profile = await profileResponse.json() as { sub: string; email: string; email_verified?: boolean }
  if (!profile.email_verified || profile.email !== c.env.ALLOWED_EMAIL) return c.text('Akun Google ini belum diizinkan.', 403)
  const timestamp = now()
  let user = await c.env.DB.prepare(`SELECT id, email, google_subject FROM users WHERE google_subject = ?`).bind(profile.sub).first<User>()
  if (!user) {
    user = { id: id(), email: profile.email, google_subject: profile.sub }
    await c.env.DB.prepare(`INSERT INTO users (id, google_subject, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(user.id, user.google_subject, user.email, timestamp, timestamp).run()
  }
  const rawSession = id() + id()
  await c.env.DB.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, datetime('now', '+30 days'), ?, ?)`)
    .bind(id(), user.id, await digest(rawSession), timestamp, timestamp).run()
  const headers = new Headers({ Location: c.env.APP_ORIGIN || new URL(c.req.url).origin })
  headers.append('Set-Cookie', cookie('zap_session', rawSession, 60 * 60 * 24 * 30))
  headers.append('Set-Cookie', cookie('zap_oauth_state', '', 0))
  return new Response(null, { status: 302, headers })
})

app.post('/share-target/', async (c) => {
  const user = await auth(c.req.raw, c.env)
  if (!user) return Response.redirect(`${c.env.APP_ORIGIN || new URL(c.req.url).origin}/?share=login`, 303)
  const form = await c.req.formData()
  const text = String(form.get('text') || form.get('title') || '').trim()
  const url = String(form.get('url') || '').trim()
  const uploaded = form.get('files')
  let attachmentKey: string | null = null
  let type = url ? 'link' : 'text'
  if (uploaded instanceof File && uploaded.size > 0) {
    if (uploaded.size > MAX_IMAGE_BYTES || !uploaded.type.startsWith('image/')) return c.text('Gambar harus berformat image dan maksimal 20 MB.', 400)
    attachmentKey = `${user.id}/${id()}`
    await c.env.BUCKET.put(attachmentKey, uploaded.stream(), { httpMetadata: { contentType: uploaded.type } })
    type = 'image'
  }
  const messageId = id()
  await c.env.DB.prepare(`INSERT INTO messages (id, user_id, type, text_content, url, attachment_key, thumbnail_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(messageId, user.id, type, text || null, url || null, attachmentKey, null, now()).run()
  const targets = await c.env.DB.prepare(`SELECT id FROM devices WHERE user_id = ? AND revoked_at IS NULL`).bind(user.id).all()
  const targetIds = targets.results as unknown as Array<{ id: string }>
  if (targetIds.length) await c.env.DB.batch(targetIds.map(target => c.env.DB.prepare(`INSERT INTO message_recipients (message_id, device_id) VALUES (?, ?)`).bind(messageId, target.id)))
  c.executionCtx.waitUntil(notifyUser(c.env, user.id, { id: messageId, type, text, url }))
  return Response.redirect(`${c.env.APP_ORIGIN || new URL(c.req.url).origin}/?shared=1`, 303)
})

app.post('/auth/logout', async (c) => {
  const raw = cookieValue(c.req.raw, 'zap_session')
  if (raw) await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await digest(raw)).run()
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie('zap_session', '', 0) } })
})

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/devices/pair/claim') return next()
  let user = await auth(c.req.raw, c.env)
  let device = null
  if (!user) {
    device = await deviceFromRequest(c.req.raw, c.env)
    if (device) user = await c.env.DB.prepare(`SELECT id, email, google_subject FROM users WHERE id = ?`).bind(device.user_id).first<User>()
  } else {
    device = await deviceFromRequest(c.req.raw, c.env, user.id)
  }
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  c.set('device', device)
  await next()
})

app.get('/api/me', (c) => c.json({ user: c.var.user }))

app.get('/api/push/public-key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null }))

app.post('/api/push/subscribe', async (c) => {
  const subscription = await c.req.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>()
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys.auth || !subscription.endpoint.startsWith('https://')) return c.json({ error: 'invalid_subscription' }, 400)
  const timestamp = now()
  await c.env.DB.prepare(`INSERT INTO push_subscriptions (endpoint, user_id, device_id, subscription_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, device_id = excluded.device_id, subscription_json = excluded.subscription_json, updated_at = excluded.updated_at`)
    .bind(subscription.endpoint, c.var.user.id, c.var.device?.id || null, JSON.stringify(subscription), timestamp, timestamp).run()
  return c.json({ ok: true })
})

app.delete('/api/push/subscribe', async (c) => {
  const body = await c.req.json<{ endpoint?: string }>()
  if (body.endpoint) await c.env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`).bind(body.endpoint, c.var.user.id).run()
  return c.body(null, 204)
})

app.get('/api/messages', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 50), 100)
  const query = (c.req.query('q') || '').trim()
  const search = `%${query}%`
  const rows = await c.env.DB.prepare(
    `SELECT m.id, m.type, m.text_content, m.url, m.attachment_key, m.thumbnail_key, m.created_at, m.sender_device_id,
            COALESCE(mr.read_at, m.read_at) AS read_at, d.name AS sender_name
     FROM messages m LEFT JOIN message_recipients mr ON mr.message_id = m.id
       AND mr.device_id = ? LEFT JOIN devices d ON d.id = m.sender_device_id
     WHERE m.user_id = ? AND m.deleted_at IS NULL
       AND (? = '' OR m.text_content LIKE ? OR m.url LIKE ?)
     ORDER BY m.created_at DESC LIMIT ?`
  ).bind(c.var.device?.id || 'web', c.var.user.id, query, search, search, limit).all()
  const messages = rows.results as unknown as Array<{ id: string }>
  let attachments: Array<Record<string, unknown>> = []
  if (messages.length) {
    const placeholders = messages.map(() => '?').join(',')
    const attachmentRows = await c.env.DB.prepare(`SELECT message_id, attachment_key, thumbnail_key, content_type, sort_order FROM message_attachments WHERE message_id IN (${placeholders}) ORDER BY sort_order`).bind(...messages.map(message => message.id)).all()
    attachments = attachmentRows.results as unknown as Array<Record<string, unknown>>
  }
  const grouped = new Map<string, Array<Record<string, unknown>>>()
  for (const attachment of attachments) {
    const list = grouped.get(String(attachment.message_id)) || []
    list.push({ attachment_key: attachment.attachment_key, thumbnail_key: attachment.thumbnail_key, content_type: attachment.content_type })
    grouped.set(String(attachment.message_id), list)
  }
  return c.json({ messages: messages.map(message => ({ ...message, attachments: grouped.get(message.id) || [] })) })
})

app.post('/api/messages', async (c) => {
  const body = await c.req.json<{ type?: string; text?: string; url?: string; attachmentKey?: string; thumbnailKey?: string; attachments?: Array<{ key?: string; thumbnailKey?: string }>; targetDeviceIds?: string[] }>()
  const type = body.type || (body.url ? 'link' : 'text')
  if (!['text', 'link', 'image'].includes(type)) return c.json({ error: 'invalid_type' }, 400)
  if (type === 'text' && !body.text?.trim()) return c.json({ error: 'text_required' }, 400)
  if ((body.text || '').length > MAX_TEXT_LENGTH) return c.json({ error: 'text_too_long' }, 413)
  if ((body.url || '').length > MAX_URL_LENGTH) return c.json({ error: 'url_too_long' }, 413)
  const attachments = body.attachments || (body.attachmentKey ? [{ key: body.attachmentKey, thumbnailKey: body.thumbnailKey }] : [])
  if (attachments.length > MAX_ATTACHMENTS) return c.json({ error: 'too_many_attachments' }, 413)
  if (attachments.some(attachment => !attachment.key || !attachment.key.startsWith(`${c.var.user.id}/`))) return c.json({ error: 'invalid_attachment' }, 400)
  const messageId = id()
  await c.env.DB.prepare(`INSERT INTO messages (id, user_id, sender_device_id, type, text_content, url, attachment_key, thumbnail_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(messageId, c.var.user.id, c.var.device?.id || null, type, body.text?.trim() || null, body.url || null, attachments[0]?.key || null, attachments[0]?.thumbnailKey || null, now()).run()
  if (attachments.length) await c.env.DB.batch(attachments.map((attachment, index) => c.env.DB.prepare(`INSERT INTO message_attachments (id, message_id, attachment_key, thumbnail_key, content_type, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id(), messageId, attachment.key, attachment.thumbnailKey || null, 'image/*', index, now())))
  const targets = body.targetDeviceIds?.length ? body.targetDeviceIds : (await c.env.DB.prepare(`SELECT id FROM devices WHERE user_id = ? AND revoked_at IS NULL AND id != ?`).bind(c.var.user.id, c.var.device?.id || '').all()).results
  if (targets.length) {
    const targetIds = targets as unknown as Array<{ id: string }>
    const statements = targetIds.map(target => c.env.DB.prepare(`INSERT INTO message_recipients (message_id, device_id) VALUES (?, ?)`).bind(messageId, target.id))
    await c.env.DB.batch(statements)
  }
  c.executionCtx.waitUntil(notifyUser(c.env, c.var.user.id, { id: messageId, type, text: body.text, url: body.url }))
  return c.json({ id: messageId }, 201)
})

app.patch('/api/messages/:id/read', async (c) => {
  const device = c.var.device
  await c.env.DB.prepare(`UPDATE messages SET read_at = ? WHERE id = ? AND user_id = ?`).bind(now(), c.req.param('id'), c.var.user.id).run()
  if (device) await c.env.DB.prepare(`UPDATE message_recipients SET read_at = ? WHERE message_id = ? AND device_id = ?`).bind(now(), c.req.param('id'), device.id).run()
  return c.json({ ok: true })
})

app.delete('/api/messages/:id', async (c) => {
  const message = await c.env.DB.prepare(`SELECT attachment_key, thumbnail_key FROM messages WHERE id = ? AND user_id = ?`).bind(c.req.param('id'), c.var.user.id).first<{ attachment_key?: string; thumbnail_key?: string }>()
  const attachmentRows = await c.env.DB.prepare(`SELECT attachment_key, thumbnail_key FROM message_attachments WHERE message_id = ?`).bind(c.req.param('id')).all()
  await c.env.DB.prepare(`UPDATE messages SET deleted_at = ? WHERE id = ? AND user_id = ?`).bind(now(), c.req.param('id'), c.var.user.id).run()
  if (message?.attachment_key) await c.env.BUCKET.delete(message.attachment_key)
  if (message?.thumbnail_key && message.thumbnail_key !== message.attachment_key) await c.env.BUCKET.delete(message.thumbnail_key)
  for (const attachment of attachmentRows.results as unknown as Array<{ attachment_key: string; thumbnail_key?: string }>) {
    await c.env.BUCKET.delete(attachment.attachment_key)
    if (attachment.thumbnail_key && attachment.thumbnail_key !== attachment.attachment_key) await c.env.BUCKET.delete(attachment.thumbnail_key)
  }
  return c.body(null, 204)
})

app.post('/api/uploads', async (c) => {
  const contentLength = Number(c.req.header('Content-Length') || 0)
  if (contentLength > MAX_IMAGE_BYTES) return c.json({ error: 'file_too_large' }, 413)
  const contentType = c.req.header('Content-Type') || ''
  if (!contentType.startsWith('image/')) return c.json({ error: 'image_only' }, 415)
  const key = `${c.var.user.id}/${id()}`
  await c.env.BUCKET.put(key, c.req.raw.body, { httpMetadata: { contentType } })
  return c.json({ key }, 201)
})

app.get('/api/uploads/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace('/api/uploads/', ''))
  if (!key.startsWith(`${c.var.user.id}/`)) return c.json({ error: 'not_found' }, 404)
  const object = await c.env.BUCKET.get(key)
  if (!object) return c.json({ error: 'not_found' }, 404)
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('Cache-Control', 'private, max-age=3600')
  return new Response(object.body, { headers })
})

app.get('/api/devices', async (c) => {
  const devices = await c.env.DB.prepare(`SELECT id, name, type, last_seen_at, created_at FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at`).bind(c.var.user.id).all()
  return c.json({ devices: devices.results })
})

app.post('/api/devices/pair/start', async (c) => {
  const code = randomCode()
  await c.env.DB.prepare(`INSERT INTO pairing_codes (code_hash, user_id, expires_at, created_at) VALUES (?, ?, datetime('now', '+10 minutes'), ?)`).bind(await digest(code), c.var.user.id, now()).run()
  return c.json({ code, expiresInSeconds: 600 })
})

app.post('/api/devices/pair/claim', async (c) => {
  const body = await c.req.json<{ code?: string; name?: string; type?: string }>()
  if (!body.code || !/^\d{6}$/.test(body.code)) return c.json({ error: 'invalid_code' }, 400)
  const record = await c.env.DB.prepare(`SELECT code_hash, user_id FROM pairing_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`).bind(await digest(body.code)).first<{ code_hash: string; user_id: string }>()
  if (!record) return c.json({ error: 'code_expired_or_invalid' }, 400)
  const deviceId = id(); const rawToken = id() + id()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE pairing_codes SET used_at = ? WHERE code_hash = ?`).bind(now(), record.code_hash),
    c.env.DB.prepare(`INSERT INTO devices (id, user_id, name, type, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(deviceId, record.user_id, body.name || 'Chrome Extension', body.type || 'extension', await digest(rawToken), now(), now()),
  ])
  return c.json({ deviceId, token: rawToken }, 201)
})

app.delete('/api/devices/:id', async (c) => {
  await c.env.DB.prepare(`UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ?`).bind(now(), c.req.param('id'), c.var.user.id).run()
  return c.body(null, 204)
})

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
