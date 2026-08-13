import { useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Mail,
  Play,
  RefreshCw,
  Send,
  ShieldCheck
} from 'lucide-react'
import type {
  GoogleConnectionStatus,
  OpportunityStoreV2,
  SearchProviderId
} from '@shared/opportunity-contracts'

const splitLines = (value: string) =>
  value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)

const emptyGoogleStatus: GoogleConnectionStatus = {
  configured: false,
  connected: false,
  mailAuthorized: false,
  calendarAuthorized: false
}

export function OpportunityWorkflowPanel() {
  const [store, setStore] = useState<OpportunityStoreV2 | null>(null)
  const [googleStatus, setGoogleStatus] = useState(emptyGoogleStatus)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [ownerFacts, setOwnerFacts] = useState('')
  const [avoidFacts, setAvoidFacts] = useState('')
  const [greenhouseTargets, setGreenhouseTargets] = useState('')
  const [leverTargets, setLeverTargets] = useState('')
  const [geography, setGeography] = useState('')
  const [languages, setLanguages] = useState('en, fr')
  const [inclusionTerms, setInclusionTerms] = useState('')
  const [exclusionTerms, setExclusionTerms] = useState('')
  const [recencyDays, setRecencyDays] = useState(30)
  const [dailyEnabled, setDailyEnabled] = useState(false)
  const [enabledProviders, setEnabledProviders] = useState<SearchProviderId[]>(['brave_web'])
  const [materialIds, setMaterialIds] = useState('')
  const [attachmentPaths, setAttachmentPaths] = useState('')
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [selectedMailDraftIds, setSelectedMailDraftIds] = useState<string[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState('')
  const [callStartAt, setCallStartAt] = useState('')
  const [callEndAt, setCallEndAt] = useState('')
  const [callTimezone, setCallTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [callAttendees, setCallAttendees] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [postCallSummary, setPostCallSummary] = useState('')
  const [confirmedOutcomes, setConfirmedOutcomes] = useState('')
  const [followUps, setFollowUps] = useState('')
  const [savedSessionSummaryId, setSavedSessionSummaryId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const [nextStore, nextGoogle] = await Promise.all([
      window.coqpi.opportunities.get(),
      window.coqpi.opportunities.getGoogleStatus()
    ])
    setStore(nextStore)
    setGoogleStatus(nextGoogle)
    setSelectedJobId((current) => current || nextStore.jobs[0]?.id || '')
  }

  useEffect(() => {
    void refresh().catch((caught) =>
      setError(caught instanceof Error ? caught.message : 'Unable to load opportunity workflow.')
    )
  }, [])

  const selectedJob = store?.jobs.find((job) => job.id === selectedJobId)
  const candidates = useMemo(
    () => store?.results.filter((item) => item.jobId === selectedJobId) ?? [],
    [store, selectedJobId]
  )
  const selectedCandidate = candidates.find((item) => item.id === selectedCandidateId)
  const selectedPack = store?.applicationPacks.find(
    (item) => item.candidateId === selectedCandidateId
  )
  const latestRun = store?.runs.find((run) => run.jobId === selectedJobId)

  useEffect(() => {
    if (!selectedJob) return
    setGeography(selectedJob.geography.join(', '))
    setLanguages(selectedJob.languages.join(', '))
    setInclusionTerms(selectedJob.inclusionTerms.join(', '))
    setExclusionTerms(selectedJob.exclusionTerms.join(', '))
    setRecencyDays(selectedJob.recencyDays)
    setDailyEnabled(selectedJob.schedule.enabled)
    setEnabledProviders(selectedJob.sourceAdapters)
    setGreenhouseTargets(
      selectedJob.providerTargets.filter((item) => item.provider === 'greenhouse').map((item) => item.target).join(', ')
    )
    setLeverTargets(
      selectedJob.providerTargets.filter((item) => item.provider === 'lever').map((item) => item.target).join(', ')
    )
  }, [selectedJob])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await refresh()
      setNotice(success)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Opportunity action failed.')
    } finally {
      setBusy(false)
    }
  }

  const configureAndRun = () => {
    if (!selectedJob) return
    const providerTargets = [
      ...splitLines(greenhouseTargets).map((target) => ({ provider: 'greenhouse' as const, target })),
      ...splitLines(leverTargets).map((target) => ({ provider: 'lever' as const, target }))
    ]
    void run(async () => {
      await window.coqpi.opportunities.configureJob(selectedJob.id, {
        sourceAdapters: enabledProviders,
        providerTargets,
        geography: splitLines(geography),
        languages: splitLines(languages),
        inclusionTerms: splitLines(inclusionTerms),
        exclusionTerms: splitLines(exclusionTerms),
        recencyDays,
        schedule: {
          ...selectedJob.schedule,
          enabled: dailyEnabled,
          cadence: dailyEnabled ? 'daily' : 'manual'
        }
      })
      await window.coqpi.opportunities.runDiscovery(selectedJob.id)
    }, 'Discovery completed. Review new candidates below.')
  }

  const assemble = () => {
    if (!selectedCandidate) return
    void run(async () => {
      const pack = await window.coqpi.opportunities.assemblePack({
        candidateId: selectedCandidate.id,
        ownerFactsToUse: splitLines(ownerFacts),
        ownerFactsToAvoid: splitLines(avoidFacts),
        materialIds: splitLines(materialIds)
      })
      setSubject(`${selectedCandidate.title} — ${selectedCandidate.partnerName}`)
      setMailBody(pack.motivationLetter)
    }, 'Application pack assembled. Review its readiness and message.')
  }

  const saveDraft = () => {
    if (!selectedPack) return
    void run(
      () => window.coqpi.opportunities.saveMailDraft({
        applicationPackId: selectedPack.id,
        recipient,
        subject,
        body: mailBody,
        attachmentPaths: splitLines(attachmentPaths)
      }),
      'Local mail draft saved. Create a Gmail draft only after reviewing it.'
    )
  }

  const useInSession = () => {
    if (!selectedCandidate || !selectedPack) return
    void run(async () => {
      if (selectedPack.status !== 'ready') {
        throw new Error('Application pack needs review before it can enter Live.')
      }
      const manifest = await window.coqpi.contextPacks.add([{
        sourceId: selectedCandidate.sourceId,
        kind: selectedCandidate.kind,
        partnerName: selectedCandidate.partnerName,
        title: selectedCandidate.title,
        summary: selectedCandidate.summary,
        context: selectedCandidate.context,
        links: selectedCandidate.links,
        selected: true
      }])
      const pack = manifest.manifest.counterpartyPacks?.find(
        (item) => item.sourceId === selectedCandidate.sourceId
      )
      if (!pack) throw new Error('Session context pack was not created.')
      const current = await window.coqpi.session.getContext()
      await window.coqpi.session.saveContext({
        ...current.context,
        company: selectedCandidate.partnerName,
        role: selectedCandidate.title,
        goal: selectedJob?.goal || current.context.goal,
        selectedCounterpartyPackIds: Array.from(new Set([
          ...current.context.selectedCounterpartyPackIds,
          pack.id
        ])),
        selectedOpportunityApplicationPackId: selectedPack.id
      })
    }, 'Selected target and application pack are attached to Prepare and Live.')
  }

  const attachCommunicationToSession = (
    threadSummaryId: string,
    calendarProposalId = ''
  ) => run(async () => {
    const current = await window.coqpi.session.getContext()
    await window.coqpi.session.saveContext({
      ...current.context,
      selectedCommunicationThreadSummaryId: threadSummaryId,
      selectedCalendarProposalId: calendarProposalId || current.context.selectedCalendarProposalId
    })
  }, 'Communication history is attached to the current Prepare and Live session.')

  const createProposal = () => {
    if (!selectedThreadId || !callStartAt || !callEndAt) return
    void run(
      () => window.coqpi.opportunities.createCalendarProposal({
        threadSummaryId: selectedThreadId,
        title: selectedCandidate
          ? `${selectedCandidate.partnerName} — ${selectedCandidate.title}`
          : 'CoqPi opportunity call',
        startAt: new Date(callStartAt).toISOString(),
        endAt: new Date(callEndAt).toISOString(),
        timezone: callTimezone,
        attendees: splitLines(callAttendees),
        ...(meetingUrl.trim() ? { meetingUrl: meetingUrl.trim() } : {})
      }),
      'Calendar proposal saved locally. Review it before creating the event.'
    )
  }

  const savePostCallRecap = () => {
    if (!selectedCandidate) return
    void run(async () => {
      const summary = await window.coqpi.sessionSummaries.save({
        sourceId: selectedCandidate.sourceId,
        partnerName: selectedCandidate.partnerName,
        title: `${selectedCandidate.title} call`,
        summary: postCallSummary,
        confirmedOutcomes: splitLines(confirmedOutcomes),
        followUps: splitLines(followUps),
        sessionLabel: `${selectedCandidate.partnerName} — ${selectedCandidate.title}`
      })
      setSavedSessionSummaryId(summary.id)
    }, 'Owner-confirmed call recap saved to relationship memory.')
  }

  const preparePostCallFollowUp = () => {
    if (!savedSessionSummaryId || !selectedPack) return
    void run(
      () => window.coqpi.opportunities.createPostCallFollowUp({
        sessionSummaryId: savedSessionSummaryId,
        applicationPackId: selectedPack.id,
        recipient
      }),
      'Local post-call follow-up draft prepared. Review and approve it before sending.'
    )
  }

  if (!store) {
    return <article className="panel-card opportunity-panel">Loading opportunity workflow…</article>
  }

  return (
    <article className="panel-card opportunity-panel">
      <div className="panel-header">
        <div>
          <h2>Opportunity to call</h2>
          <p>Discover, prepare, contact, and hand off one reviewed target at a time.</p>
        </div>
        <button className="icon-button" onClick={() => void refresh()} title="Refresh opportunity data" type="button">
          <RefreshCw size={17} />
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {notice ? <div className="info-box">{notice}</div> : null}

      <div className="opportunity-metrics">
        <span><strong>{store.results.length}</strong> found</span>
        <span><strong>{store.applicationPacks.length}</strong> prepared</span>
        <span><strong>{store.mailDrafts.filter((item) => item.status === 'sent').length}</strong> sent</span>
        <span><strong>{store.threadSummaries.length}</strong> replies</span>
        <span><strong>{store.calendarProposals.filter((item) => item.status === 'created').length}</strong> calls</span>
      </div>

      <div className="opportunity-workflow-grid">
        <section className="opportunity-step">
          <div className="opportunity-step-title"><Play size={17} /><strong>1. Discover</strong></div>
          <label>
            Search job
            <select value={selectedJobId} onChange={(event) => {
              setSelectedJobId(event.target.value)
              setSelectedCandidateId('')
            }}>
              <option value="">Select a Finder job</option>
              {store.jobs.map((job) => <option key={job.id} value={job.id}>{job.label}</option>)}
            </select>
          </label>
          {selectedJob?.scenario === 'job' ? (
            <div className="opportunity-inline-fields">
              <input value={greenhouseTargets} onChange={(event) => setGreenhouseTargets(event.target.value)} placeholder="Greenhouse board slugs" />
              <input value={leverTargets} onChange={(event) => setLeverTargets(event.target.value)} placeholder="Lever site slugs" />
            </div>
          ) : null}
          <div className="opportunity-provider-row">
            {(['brave_web', 'greenhouse', 'lever', 'jobspy_optional'] as const).map((provider) => (
              <label key={provider}>
                <input checked={enabledProviders.includes(provider)} onChange={(event) => setEnabledProviders((current) => event.target.checked ? Array.from(new Set([...current, provider])) : current.filter((item) => item !== provider))} type="checkbox" />
                {provider}
              </label>
            ))}
          </div>
          <div className="opportunity-inline-fields">
            <input onChange={(event) => setGeography(event.target.value)} placeholder="Geography" value={geography} />
            <input onChange={(event) => setLanguages(event.target.value)} placeholder="Languages" value={languages} />
            <input onChange={(event) => setInclusionTerms(event.target.value)} placeholder="Include terms" value={inclusionTerms} />
            <input onChange={(event) => setExclusionTerms(event.target.value)} placeholder="Exclude terms" value={exclusionTerms} />
          </div>
          <div className="opportunity-run-controls">
            <label>Recency <input min={1} max={365} onChange={(event) => setRecencyDays(Number(event.target.value))} type="number" value={recencyDays} /></label>
            <label><input checked={dailyEnabled} onChange={(event) => setDailyEnabled(event.target.checked)} type="checkbox" /> Daily while open</label>
          </div>
          <button disabled={!selectedJob || !enabledProviders.length || busy} onClick={configureAndRun} type="button">
            <Play size={16} /> Run real discovery
          </button>
          {!enabledProviders.length ? <span className="opportunity-hint">Select at least one search provider.</span> : null}
          <span className="opportunity-hint">Brave requires a backend-only API key. Jobs can also use public Greenhouse/Lever slugs.</span>
          {latestRun ? (
            <div className="opportunity-run-summary">
              <strong>{latestRun.status}</strong>
              <span>{latestRun.newCount} new · {latestRun.changedCount} changed · {latestRun.unchangedCount} unchanged</span>
              {latestRun.errors.map((item) => <small key={`${item.provider}-${item.code}`}>{item.provider}: {item.message}</small>)}
            </div>
          ) : null}
        </section>

        <section className="opportunity-step">
          <div className="opportunity-step-title"><CheckCircle2 size={17} /><strong>2. Review & prepare</strong></div>
          <div className="opportunity-candidate-list">
            {candidates.length ? candidates.map((candidate) => (
              <button className={candidate.id === selectedCandidateId ? 'opportunity-candidate selected' : 'opportunity-candidate'} key={candidate.id} onClick={() => setSelectedCandidateId(candidate.id)} type="button">
                <strong>{candidate.partnerName}</strong>
                <span>{candidate.title}</span>
                <small>{candidate.provider} · {Math.round(candidate.sourceConfidence * 100)}% source confidence</small>
                <small>{candidate.summary}</small>
                {candidate.canonicalUrl ? <small>{candidate.canonicalUrl}</small> : null}
              </button>
            )) : <span className="opportunity-hint">No discovered candidates for this job.</span>}
          </div>
          {selectedCandidate ? (
            <>
              <textarea rows={3} value={ownerFacts} onChange={(event) => setOwnerFacts(event.target.value)} placeholder="Verified owner facts to use, one per line" />
              <textarea rows={2} value={avoidFacts} onChange={(event) => setAvoidFacts(event.target.value)} placeholder="Facts or topics to avoid" />
              <input value={materialIds} onChange={(event) => setMaterialIds(event.target.value)} placeholder="Reviewed CV/deck version IDs" />
              <button disabled={busy} onClick={assemble} type="button">Assemble reviewed pack</button>
              {selectedPack ? (
                <div className={`opportunity-readiness ${selectedPack.status}`}>
                  <strong>{selectedPack.status === 'ready' ? 'Ready' : 'Needs review'}</strong>
                  <span>{Math.round(selectedPack.confidence * 100)}% confidence</span>
                  {selectedPack.missingInformation.map((item) => <small key={item}>{item}</small>)}
                </div>
              ) : null}
              <button disabled={!selectedPack || selectedPack.status !== 'ready' || busy} onClick={useInSession} type="button">
                Use in Prepare & Live
              </button>
            </>
          ) : null}
        </section>

        <section className="opportunity-step">
          <div className="opportunity-step-title"><Mail size={17} /><strong>3. Draft & approve</strong></div>
          <div className="opportunity-google-status">
            <span>{googleStatus.connected ? 'Google connected' : googleStatus.configured ? 'Google ready to connect' : 'Google OAuth not configured'}</span>
            <button disabled={!googleStatus.configured || busy} onClick={() => void run(() => window.coqpi.opportunities.connectGoogle('mail'), 'Gmail connected.')} type="button">Connect Gmail</button>
          </div>
          <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient email" />
          <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" />
          <textarea rows={7} value={mailBody} onChange={(event) => setMailBody(event.target.value)} placeholder="Reviewed message" />
          <textarea rows={2} value={attachmentPaths} onChange={(event) => setAttachmentPaths(event.target.value)} placeholder="Verified local attachment paths, one per line" />
          <button disabled={!selectedPack || !recipient || !subject || !mailBody || busy} onClick={saveDraft} type="button">Save local draft</button>
          <div className="opportunity-mail-list">
            {store.mailDrafts.map((draft) => (
              <label className="opportunity-mail-row" key={draft.id}>
                <input checked={selectedMailDraftIds.includes(draft.id)} onChange={(event) => setSelectedMailDraftIds((current) => event.target.checked ? [...current, draft.id] : current.filter((id) => id !== draft.id))} type="checkbox" />
                <span><strong>{draft.subject}</strong><small>{draft.recipient} · {draft.status}</small></span>
                {draft.status === 'local_draft' ? <button disabled={busy} onClick={() => void run(() => window.coqpi.opportunities.createGmailDraft(draft.id), 'Reviewed Gmail draft created.')} type="button">Create Gmail draft</button> : null}
              </label>
            ))}
          </div>
          <button disabled={!selectedMailDraftIds.length || busy} onClick={() => void run(() => window.coqpi.opportunities.approveMailBatch(selectedMailDraftIds), 'Exact message hashes approved for one send attempt.')} type="button">
            <ShieldCheck size={16} /> Approve selected
          </button>
          {store.sendApprovals.filter((item) => !item.consumedAt).map((approval) => (
            <button className="danger-action" disabled={busy} key={approval.id} onClick={() => void run(() => window.coqpi.opportunities.sendApprovedBatch(approval.id), 'Approved batch processed. Check per-message status.')} type="button">
              <Send size={16} /> Send approved batch ({approval.messageHashes.length})
            </button>
          ))}
        </section>

        <section className="opportunity-step">
          <div className="opportunity-step-title"><CalendarPlus size={17} /><strong>4. Replies & calls</strong></div>
          <button disabled={!googleStatus.connected || busy} onClick={() => void run(() => window.coqpi.opportunities.syncReplies(), 'Linked Gmail threads synchronized.')} type="button">Check linked replies</button>
          {store.threadSummaries.length ? store.threadSummaries.map((summary) => (
            <button className={selectedThreadId === summary.id ? 'opportunity-thread selected' : 'opportunity-thread'} key={summary.id} onClick={() => setSelectedThreadId(summary.id)} type="button">
              <strong>{summary.classification}</strong>
              <span>{summary.compactSummary}</span>
              <small>{summary.occurredAt}</small>
            </button>
          )) : <span className="opportunity-hint">Only replies in CoqPi-linked Gmail threads will appear here.</span>}
          {selectedThreadId ? (
            <>
              <button disabled={busy} onClick={() => void attachCommunicationToSession(selectedThreadId)} type="button">Use reply context in session</button>
              <button disabled={busy} onClick={() => void run(() => window.coqpi.opportunities.createReplyDraft({ threadSummaryId: selectedThreadId }), 'Local reply draft created. Review and approve it before sending.')} type="button">Prepare reply draft</button>
              <div className="opportunity-inline-fields">
                <input onChange={(event) => setCallStartAt(event.target.value)} type="datetime-local" value={callStartAt} />
                <input onChange={(event) => setCallEndAt(event.target.value)} type="datetime-local" value={callEndAt} />
              </div>
              <input onChange={(event) => setCallTimezone(event.target.value)} placeholder="Timezone" value={callTimezone} />
              <input onChange={(event) => setCallAttendees(event.target.value)} placeholder="Attendee emails" value={callAttendees} />
              <input onChange={(event) => setMeetingUrl(event.target.value)} placeholder="Meeting link" value={meetingUrl} />
              <button disabled={!callStartAt || !callEndAt || busy} onClick={createProposal} type="button">Save Calendar proposal</button>
            </>
          ) : null}
          {!googleStatus.calendarAuthorized ? (
            <button disabled={!googleStatus.configured || busy} onClick={() => void run(() => window.coqpi.opportunities.connectGoogle('calendar'), 'Google Calendar connected.')} type="button">Connect Calendar</button>
          ) : null}
          {store.calendarProposals.map((proposal) => (
            <div className="opportunity-calendar-proposal" key={proposal.id}>
              <span><strong>{proposal.title}</strong><small>{proposal.startAt} · {proposal.status}</small></span>
              {proposal.status === 'draft' ? (
                <button disabled={!googleStatus.calendarAuthorized || busy} onClick={() => void run(async () => {
                  await window.coqpi.opportunities.createCalendarEvent(proposal.id, proposal.contentHash)
                  const current = await window.coqpi.session.getContext()
                  await window.coqpi.session.saveContext({
                    ...current.context,
                    selectedCommunicationThreadSummaryId: proposal.threadSummaryId,
                    selectedCalendarProposalId: proposal.id
                  })
                }, 'Calendar event created and attached to the session.')} type="button">Confirm & create event</button>
              ) : null}
            </div>
          ))}
          <span className="opportunity-hint">No Calendar event is created until Confirm & create event is pressed.</span>
        </section>

        <section className="opportunity-step">
          <div className="opportunity-step-title"><ClipboardCheck size={17} /><strong>5. Post-call</strong></div>
          <span className="opportunity-hint">Record only facts and outcomes you confirm after the call.</span>
          <textarea rows={3} value={postCallSummary} onChange={(event) => {
            setPostCallSummary(event.target.value)
            setSavedSessionSummaryId('')
          }} placeholder="Confirmed call summary" />
          <textarea rows={2} value={confirmedOutcomes} onChange={(event) => {
            setConfirmedOutcomes(event.target.value)
            setSavedSessionSummaryId('')
          }} placeholder="Confirmed outcomes, one per line" />
          <textarea rows={2} value={followUps} onChange={(event) => {
            setFollowUps(event.target.value)
            setSavedSessionSummaryId('')
          }} placeholder="Follow-ups, one per line" />
          <button disabled={!selectedCandidate || (!postCallSummary.trim() && !confirmedOutcomes.trim() && !followUps.trim()) || busy} onClick={savePostCallRecap} type="button">
            Save confirmed recap
          </button>
          <button disabled={!savedSessionSummaryId || !selectedPack || !recipient.trim() || busy} onClick={preparePostCallFollowUp} type="button">
            Prepare local follow-up draft
          </button>
          <span className="opportunity-hint">Preparing a draft does not send mail. The normal exact-hash approval remains required.</span>
        </section>
      </div>
    </article>
  )
}
