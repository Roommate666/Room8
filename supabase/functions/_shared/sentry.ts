// Minimaler Sentry-Wrapper fuer Supabase Edge Functions (Deno).
//
// Zweck: Errors aus send-push / send-email landen automatisch in Sentry,
// zusaetzlich zur notification_logs DB-Tabelle.
//
// Implementation: Direkt POST an Sentry's Envelope-Endpoint.
// Kein npm-Dependency, kein external SDK — robust gegen Sentry-Outages.
// Capture ist always best-effort (try/catch), darf NIE Send-Pfad blockieren.
//
// Setup:
//   Supabase Dashboard → Project Settings → Edge Functions → Secrets
//   SENTRY_DSN=https://<key>@o<id>.ingest.de.sentry.io/<project>

const SDK_NAME = 'room8-edge'
const SDK_VERSION = '1.0.0'

type CaptureContext = {
    function?: string                    // Welche Edge Function ('send-push', 'send-email')
    user_id?: string | null              // Supabase user uuid
    tags?: Record<string, string>        // Custom tags
    extra?: Record<string, unknown>      // Zusatzkontext
    level?: 'fatal' | 'error' | 'warning' | 'info'
}

type ParsedDsn = {
    publicKey: string
    projectId: string
    host: string
    envelopeUrl: string
    auth: string
}

let cachedDsn: ParsedDsn | null = null

function parseDsn(): ParsedDsn | null {
    if (cachedDsn) return cachedDsn
    const dsn = Deno.env.get('SENTRY_DSN')
    if (!dsn) return null
    try {
        const u = new URL(dsn)
        const publicKey = u.username
        const projectId = u.pathname.replace(/^\//, '')
        if (!publicKey || !projectId) return null

        cachedDsn = {
            publicKey,
            projectId,
            host: u.host,
            envelopeUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
            auth: `Sentry sentry_version=7, sentry_client=${SDK_NAME}/${SDK_VERSION}, sentry_key=${publicKey}`,
        }
        return cachedDsn
    } catch (_e) {
        return null
    }
}

// PII-Filter: Email/Tokens aus Strings entfernen
function scrubPII(s: string): string {
    return s
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
        .replace(/access_token=[^&\s"']+/gi, 'access_token=<redacted>')
        .replace(/refresh_token=[^&\s"']+/gi, 'refresh_token=<redacted>')
        .replace(/Bearer\s+[\w.-]+/gi, 'Bearer <redacted>')
}

function uuidNoDashes(): string {
    return crypto.randomUUID().replace(/-/g, '')
}

function buildEvent(
    err: Error | string,
    ctx: CaptureContext
): Record<string, unknown> {
    const eventId = uuidNoDashes()
    const isError = err instanceof Error
    const message = isError ? err.message : String(err)
    const scrubbed = scrubPII(message)

    const tags: Record<string, string> = {
        runtime: 'deno',
        ...(ctx.function ? { function: ctx.function } : {}),
        ...(ctx.tags || {}),
    }

    // Extra-Felder ebenfalls scrubben (oberflaechlich)
    const extra: Record<string, unknown> = {}
    if (ctx.extra) {
        for (const [k, v] of Object.entries(ctx.extra)) {
            extra[k] = typeof v === 'string' ? scrubPII(v) : v
        }
    }

    const event: Record<string, unknown> = {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        platform: 'javascript',
        level: ctx.level || 'error',
        environment: Deno.env.get('SENTRY_ENV') || 'production',
        release: `${SDK_NAME}@${SDK_VERSION}`,
        server_name: ctx.function || 'edge-function',
        tags,
        extra,
        sdk: { name: 'sentry.javascript.deno-edge', version: SDK_VERSION },
    }

    if (ctx.user_id) {
        event.user = { id: ctx.user_id }   // KEINE Email — DSGVO
    }

    if (isError) {
        const e = err as Error
        event.exception = {
            values: [{
                type: e.name || 'Error',
                value: scrubbed,
                stacktrace: e.stack ? {
                    frames: parseStack(e.stack),
                } : undefined,
            }],
        }
    } else {
        event.message = { formatted: scrubbed }
    }

    return event
}

// Sehr simple Stack-Parser — Sentry erwartet { filename, function, lineno }
function parseStack(stack: string): Array<Record<string, unknown>> {
    const lines = stack.split('\n').slice(1).reverse() // Sentry: aelteste Frame zuerst
    const frames: Array<Record<string, unknown>> = []
    for (const line of lines) {
        const m = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/)
              || line.match(/at\s+(.+?):(\d+):(\d+)/)
        if (m) {
            if (m.length === 5) {
                frames.push({
                    function: m[1],
                    filename: m[2],
                    lineno: parseInt(m[3], 10),
                    colno: parseInt(m[4], 10),
                    in_app: !m[2].includes('node_modules') && !m[2].includes('deno.land'),
                })
            } else {
                frames.push({
                    filename: m[1],
                    lineno: parseInt(m[2], 10),
                    colno: parseInt(m[3], 10),
                    in_app: true,
                })
            }
        }
    }
    return frames
}

/**
 * Sendet einen Error/Message an Sentry. Best-effort: schluckt eigene Fehler.
 */
export async function captureException(
    err: Error | string,
    ctx: CaptureContext = {}
): Promise<void> {
    const dsn = parseDsn()
    if (!dsn) return // SENTRY_DSN nicht gesetzt — silent skip

    try {
        const event = buildEvent(err, ctx)
        const envelopeHeader = JSON.stringify({
            event_id: event.event_id,
            sent_at: new Date().toISOString(),
            dsn: Deno.env.get('SENTRY_DSN'),
        })
        const itemHeader = JSON.stringify({ type: 'event' })
        const itemPayload = JSON.stringify(event)
        const envelope = `${envelopeHeader}\n${itemHeader}\n${itemPayload}`

        // Timeout schuetzt vor haengenden Requests
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 3000)

        await fetch(dsn.envelopeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-sentry-envelope',
                'X-Sentry-Auth': dsn.auth,
            },
            body: envelope,
            signal: ctrl.signal,
        })

        clearTimeout(timer)
    } catch (e) {
        console.error('Sentry capture failed (non-fatal):', (e as Error).message)
    }
}

export const captureMessage = (
    message: string,
    ctx: CaptureContext = {}
): Promise<void> => captureException(message, { ...ctx, level: ctx.level || 'info' })
