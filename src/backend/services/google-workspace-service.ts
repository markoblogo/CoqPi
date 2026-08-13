import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { shell } from 'electron'
import { google } from 'googleapis'
import {
  isBatchSendApprovalValid,
  extractCalendarSuggestion,
  getRemainingDailySendAllowance,
  type CalendarProposal,
  type CommunicationThreadSummary,
  type GoogleConnectionStatus,
  type MailDraftRecord
} from '../../shared/opportunity-contracts'
import { runGovernedProviderAction } from './governance-service'
import {
  deleteEncryptedSecret,
  resolveEncryptedSecret,
  saveEncryptedSecret
} from './secret-storage-service'
import {
  consumeBatchApproval,
  getOpportunityStore,
  persistMailDraftRecord,
  saveCalendarProposal,
  saveCommunicationThreadSummary
} from './opportunity-service'
import { setFinderOutreachDraftStatus } from './finder-search-service'

const MAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly'
]
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events']
const GOOGLE_TOKEN_SECRET = 'google-oauth-token'
const DAILY_SEND_LIMIT = 20

interface GoogleTokenRecord {
  refresh_token?: string
  access_token?: string
  expiry_date?: number
  scope?: string
  token_type?: string
}

interface GoogleWorkspaceGateway {
  createDraft(raw: string, threadId?: string): Promise<{ draftId: string; messageId?: string; threadId?: string }>
  sendDraft(draftId: string): Promise<{ messageId: string; threadId: string }>
  getThread(threadId: string): Promise<{ id: string; messages: Array<{ id: string; internalDate?: string; snippet?: string; from?: string }> }>
  createCalendarEvent(proposal: CalendarProposal): Promise<{ eventId: string }>
}

let gatewayOverride: GoogleWorkspaceGateway | null = null

export const setGoogleWorkspaceGatewayForTests = (
  gateway: GoogleWorkspaceGateway | null
) => {
  gatewayOverride = gateway
}

const oauthConfig = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || ''
})

const readToken = async (): Promise<GoogleTokenRecord | null> => {
  const raw = await resolveEncryptedSecret(GOOGLE_TOKEN_SECRET)
  if (!raw) return null
  try {
    return JSON.parse(raw) as GoogleTokenRecord
  } catch {
    return null
  }
}

export const getGoogleConnectionStatus = async (): Promise<GoogleConnectionStatus> => {
  const config = oauthConfig()
  const token = await readToken()
  const scopes = new Set((token?.scope ?? '').split(/\s+/).filter(Boolean))
  return {
    configured: Boolean(config.clientId && config.clientSecret),
    connected: Boolean(token?.refresh_token || token?.access_token),
    mailAuthorized: MAIL_SCOPES.every((scope) => scopes.has(scope)),
    calendarAuthorized: CALENDAR_SCOPES.every((scope) => scopes.has(scope))
  }
}

const createAuthorizedClient = async () => {
  const config = oauthConfig()
  if (!config.clientId || !config.clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured.')
  }
  const token = await readToken()
  if (!token) throw new Error('Google Workspace is not connected.')
  const client = new google.auth.OAuth2(config.clientId, config.clientSecret)
  client.setCredentials(token)
  client.on('tokens', async (tokens) => {
    const next = { ...token, ...tokens }
    await saveEncryptedSecret(GOOGLE_TOKEN_SECRET, JSON.stringify(next))
  })
  return client
}

export const connectGoogleWorkspace = async (
  capability: 'mail' | 'calendar'
) => {
  const config = oauthConfig()
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Google Workspace.')
  }
  const existing = await readToken()
  const requested = capability === 'mail' ? MAIL_SCOPES : CALENDAR_SCOPES
  const existingScopes = (existing?.scope ?? '').split(/\s+/).filter(Boolean)
  const scopes = Array.from(new Set([...existingScopes, ...requested]))

  return new Promise<GoogleConnectionStatus>((resolve, reject) => {
    const server = http.createServer()
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Google OAuth timed out.'))
    }, 180_000)

    server.on('request', async (request, response) => {
      try {
        const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`)
        const code = requestUrl.searchParams.get('code')
        if (!code) throw new Error(requestUrl.searchParams.get('error') || 'OAuth code is missing.')
        const address = server.address()
        if (!address || typeof address === 'string') throw new Error('OAuth listener is unavailable.')
        const client = new google.auth.OAuth2(
          config.clientId,
          config.clientSecret,
          `http://127.0.0.1:${address.port}/oauth2callback`
        )
        const { tokens } = await client.getToken(code)
        const merged = { ...existing, ...tokens, scope: scopes.join(' ') }
        await saveEncryptedSecret(GOOGLE_TOKEN_SECRET, JSON.stringify(merged))
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('CoqPi is connected. You can close this tab.')
        clearTimeout(timeout)
        server.close()
        resolve(await getGoogleConnectionStatus())
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Google connection failed. Return to CoqPi for details.')
        clearTimeout(timeout)
        server.close()
        reject(error)
      }
    })

    server.listen(0, '127.0.0.1', async () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('Unable to start OAuth listener.'))
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`
      const client = new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri)
      const url = client.generateAuthUrl({
        access_type: 'offline',
        prompt: existing?.refresh_token ? 'consent' : 'consent',
        include_granted_scopes: true,
        scope: scopes
      })
      await shell.openExternal(url)
    })
  })
}

export const disconnectGoogleWorkspace = async () => {
  await deleteEncryptedSecret(GOOGLE_TOKEN_SECRET)
  return getGoogleConnectionStatus()
}

const liveGateway = async (): Promise<GoogleWorkspaceGateway> => {
  const auth = await createAuthorizedClient()
  const gmail = google.gmail({ version: 'v1', auth })
  const calendar = google.calendar({ version: 'v3', auth })
  return {
    createDraft: async (raw, threadId) => {
      const response = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw, ...(threadId ? { threadId } : {}) } }
      })
      if (!response.data.id) throw new Error('Gmail did not return a draft ID.')
      return {
        draftId: response.data.id,
        ...(response.data.message?.id ? { messageId: response.data.message.id } : {}),
        ...(response.data.message?.threadId ? { threadId: response.data.message.threadId } : {})
      }
    },
    sendDraft: async (draftId) => {
      const response = await gmail.users.drafts.send({
        userId: 'me', requestBody: { id: draftId }
      })
      if (!response.data.id || !response.data.threadId) {
        throw new Error('Gmail did not return message and thread IDs.')
      }
      return { messageId: response.data.id, threadId: response.data.threadId }
    },
    getThread: async (threadId) => {
      const response = await gmail.users.threads.get({
        userId: 'me', id: threadId, format: 'metadata', metadataHeaders: ['From']
      })
      return {
        id: response.data.id || threadId,
        messages: (response.data.messages ?? []).map((message) => ({
          id: message.id || '',
          internalDate: message.internalDate || undefined,
          snippet: message.snippet || undefined,
          from: message.payload?.headers?.find((header) => header.name?.toLowerCase() === 'from')?.value || undefined
        }))
      }
    },
    createCalendarEvent: async (proposal) => {
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: proposal.title,
          start: { dateTime: proposal.startAt, timeZone: proposal.timezone },
          end: { dateTime: proposal.endAt, timeZone: proposal.timezone },
          attendees: proposal.attendees.map((email) => ({ email })),
          description: proposal.meetingUrl ? `Meeting link: ${proposal.meetingUrl}` : undefined
        }
      })
      if (!response.data.id) throw new Error('Calendar did not return an event ID.')
      return { eventId: response.data.id }
    }
  }
}

const getGateway = () => gatewayOverride ? Promise.resolve(gatewayOverride) : liveGateway()

const encodeHeader = (value: string) =>
  `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`

const buildRawMessage = async (draft: MailDraftRecord) => {
  const boundary = `coqpi-${draft.messageHash.slice(0, 16)}`
  const parts = [
    `To: ${draft.recipient}`,
    `Subject: ${encodeHeader(draft.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(draft.body, 'utf8').toString('base64')
  ]
  for (const attachmentPath of draft.attachmentPaths) {
    const stats = await fs.stat(attachmentPath)
    if (!stats.isFile() || stats.size > 10 * 1024 * 1024) {
      throw new Error(`Attachment is invalid or exceeds 10 MB: ${path.basename(attachmentPath)}`)
    }
    parts.push(
      `--${boundary}`,
      `Content-Type: application/octet-stream; name="${path.basename(attachmentPath)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${path.basename(attachmentPath)}"`,
      '',
      (await fs.readFile(attachmentPath)).toString('base64')
    )
  }
  parts.push(`--${boundary}--`)
  return Buffer.from(parts.join('\r\n'), 'utf8')
    .toString('base64url')
}

export const createGmailDraft = async (draftId: string) => {
  const store = await getOpportunityStore()
  const draft = store.mailDrafts.find((item) => item.id === draftId)
  if (!draft) throw new Error('Mail draft not found.')
  const raw = await buildRawMessage(draft)
  const gateway = await getGateway()
  const gmailDraft = await runGovernedProviderAction(
    { kind: 'tool_route', provider: 'gmail', external: true, toolRisk: 'external_write', approvalGranted: true, routeLabel: 'create reviewed Gmail draft' },
    () => gateway.createDraft(raw, draft.gmailThreadId)
  )
  return persistMailDraftRecord({
    ...draft,
    status: 'gmail_draft',
    gmailDraftId: gmailDraft.draftId,
    ...(gmailDraft.messageId ? { gmailMessageId: gmailDraft.messageId } : {}),
    ...(gmailDraft.threadId ? { gmailThreadId: gmailDraft.threadId } : {}),
    updatedAt: new Date().toISOString()
  })
}

export const sendApprovedMailBatch = async (approvalId: string) => {
  const store = await getOpportunityStore()
  const approval = store.sendApprovals.find((item) => item.id === approvalId)
  if (!approval) throw new Error('Batch send approval not found.')
  const drafts = store.mailDrafts.filter((draft) =>
    approval.messageHashes.includes(draft.messageHash)
  )
  if (!isBatchSendApprovalValid(approval, drafts.map((draft) => draft.messageHash))) {
    throw new Error('Batch approval is stale or does not match the current message hashes.')
  }
  const allowance = getRemainingDailySendAllowance(
    store.mailDrafts,
    new Date().toISOString(),
    DAILY_SEND_LIMIT
  )
  if (drafts.length > allowance) {
    throw new Error(`Daily send limit of ${DAILY_SEND_LIMIT} would be exceeded.`)
  }
  const gateway = await getGateway()
  const results: Array<{ draftId: string; ok: boolean; error?: string }> = []
  for (const draft of drafts) {
    if (!draft.gmailDraftId) {
      results.push({ draftId: draft.id, ok: false, error: 'Create Gmail draft first.' })
      continue
    }
    try {
      const sent = await runGovernedProviderAction(
        { kind: 'tool_route', provider: 'gmail', external: true, toolRisk: 'external_write', approvalGranted: true, routeLabel: 'send approved Gmail draft' },
        () => gateway.sendDraft(draft.gmailDraftId!)
      )
      await persistMailDraftRecord({
        ...draft,
        status: 'sent',
        gmailMessageId: sent.messageId,
        gmailThreadId: sent.threadId,
        updatedAt: new Date().toISOString()
      })
      const latestStore = await getOpportunityStore()
      const applicationPack = latestStore.applicationPacks.find(
        (item) => item.id === draft.applicationPackId
      )
      const outreachDraft = latestStore.outreachDrafts.find(
        (item) => item.candidateResultId === applicationPack?.candidateId
      )
      if (outreachDraft) {
        await setFinderOutreachDraftStatus(outreachDraft.id, 'contacted')
      }
      results.push({ draftId: draft.id, ok: true })
    } catch (error) {
      await persistMailDraftRecord({ ...draft, status: 'failed', updatedAt: new Date().toISOString() })
      results.push({ draftId: draft.id, ok: false, error: error instanceof Error ? error.message : 'Send failed.' })
    }
  }
  await consumeBatchApproval({ ...approval, consumedAt: new Date().toISOString() })
  return results
}

const classifyReply = (snippet: string): CommunicationThreadSummary['classification'] => {
  const text = snippet.toLowerCase()
  if (/reject|unfortunately|not proceed|not a fit/.test(text)) return 'rejection'
  if (/meet|call|calendar|schedule|zoom|teams/.test(text)) return 'call_proposed'
  if (/\?/.test(text)) return 'question'
  if (/interested|sounds good|glad|pleased/.test(text)) return 'positive'
  if (/closed|resolved/.test(text)) return 'closed'
  return 'reply'
}

export const syncLinkedGmailThreads = async () => {
  const store = await getOpportunityStore()
  const gateway = await getGateway()
  const summaries: CommunicationThreadSummary[] = []
  for (const draft of store.mailDrafts.filter((item) => item.status === 'sent' && item.gmailThreadId)) {
    const thread = await runGovernedProviderAction(
      { kind: 'tool_route', provider: 'gmail', external: true, toolRisk: 'read_only', routeLabel: 'sync linked Gmail thread' },
      () => gateway.getThread(draft.gmailThreadId!)
    )
    const latest = thread.messages.at(-1)
    if (!latest || latest.id === draft.gmailMessageId) continue
    const snippet = (latest.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
    const summary: CommunicationThreadSummary = {
      version: 1,
      id: `${draft.id}:${latest.id}`,
      mailDraftId: draft.id,
      gmailThreadId: thread.id,
      classification: classifyReply(snippet),
      compactSummary: snippet || 'Reply received; open Gmail to review.',
      sender: (latest.from ?? 'unknown').slice(0, 240),
      occurredAt: latest.internalDate ? new Date(Number(latest.internalDate)).toISOString() : new Date().toISOString(),
      evidenceHash: createHash('sha256').update(`${thread.id}:${latest.id}:${snippet}`).digest('hex'),
      ...(extractCalendarSuggestion(snippet)
        ? { calendarSuggestion: extractCalendarSuggestion(snippet) }
        : {})
    }
    await saveCommunicationThreadSummary(summary)
    const applicationPack = store.applicationPacks.find(
      (item) => item.id === draft.applicationPackId
    )
    const outreachDraft = store.outreachDrafts.find(
      (item) => item.candidateResultId === applicationPack?.candidateId
    )
    if (outreachDraft) {
      await setFinderOutreachDraftStatus(
        outreachDraft.id,
        summary.classification === 'rejection' || summary.classification === 'closed'
          ? 'closed'
          : summary.classification === 'call_proposed'
            ? 'waiting'
            : 'follow_up'
      )
    }
    summaries.push(summary)
  }
  return summaries
}

export const getDueFollowUps = async (now = new Date(), afterDays = 5) => {
  const store = await getOpportunityStore()
  const repliedDraftIds = new Set(store.threadSummaries.map((item) => item.mailDraftId))
  const threshold = now.getTime() - afterDays * 24 * 60 * 60 * 1000
  return store.mailDrafts
    .filter(
      (draft) =>
        draft.status === 'sent' &&
        !repliedDraftIds.has(draft.id) &&
        new Date(draft.updatedAt).getTime() <= threshold
    )
    .map((draft) => ({
      mailDraftId: draft.id,
      gmailThreadId: draft.gmailThreadId,
      dueAt: new Date(new Date(draft.updatedAt).getTime() + afterDays * 24 * 60 * 60 * 1000).toISOString(),
      reason: 'No linked-thread reply has been recorded; prepare a reviewed follow-up draft.'
    }))
}

export const createCalendarProposalFromReply = async ({
  threadSummaryId,
  title,
  startAt,
  endAt,
  timezone,
  attendees,
  meetingUrl
}: Omit<CalendarProposal, 'version' | 'id' | 'status' | 'contentHash'>) => {
  const content = { threadSummaryId, title, startAt, endAt, timezone, attendees, meetingUrl }
  const proposal: CalendarProposal = {
    version: 1,
    id: randomUUID(),
    ...content,
    status: 'draft',
    contentHash: createHash('sha256').update(JSON.stringify(content)).digest('hex')
  }
  return saveCalendarProposal(proposal)
}

export const createApprovedCalendarEvent = async (
  proposalId: string,
  approvedContentHash: string
) => {
  const store = await getOpportunityStore()
  const proposal = store.calendarProposals.find((item) => item.id === proposalId)
  if (!proposal) throw new Error('Calendar proposal not found.')
  if (proposal.contentHash !== approvedContentHash) throw new Error('Calendar approval is stale.')
  const gateway = await getGateway()
  const created = await runGovernedProviderAction(
    { kind: 'tool_route', provider: 'google_calendar', external: true, toolRisk: 'external_write', approvalGranted: true, routeLabel: 'create approved calendar event' },
    () => gateway.createCalendarEvent(proposal)
  )
  return saveCalendarProposal({ ...proposal, status: 'created', googleEventId: created.eventId })
}
