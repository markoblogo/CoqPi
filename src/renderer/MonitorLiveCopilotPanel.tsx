import { RefreshCw, Save } from 'lucide-react'
import type { MonitorLiveCopilotResponse } from '@shared/app-types'
import { getMonitorLiveHintPreferenceFit } from '@shared/monitor-live-copilot'

type Props = {
  enabled: boolean
  status: 'idle' | 'waiting' | 'loading' | 'ready' | 'error' | 'saving'
  result: MonitorLiveCopilotResponse | null
  error: string | null
  notice: string | null
  onRefresh: () => void
  onSave: () => void
  onOpenSettings: () => void
}

export const MonitorLiveCopilotPanel = ({
  enabled,
  status,
  result,
  error,
  notice,
  onRefresh,
  onSave,
  onOpenSettings
}: Props) => (
  <article className="panel-card compact-panel monitor-live-copilot">
    <div className="panel-header">
      <div>
        <h2>Monitor Live</h2>
        <p className="panel-kicker">Client request → market options</p>
      </div>
      {enabled ? (
        <div className="button-row button-row-inline">
          <button
            aria-label="Refresh Monitor live preview"
            className="icon-command-button"
            disabled={status === 'loading' || status === 'saving'}
            onClick={onRefresh}
            title="Refresh from the latest client speech"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={14} />
          </button>
          <button
            aria-label="Save to Monitor Draft Inbox"
            className="icon-command-button"
            disabled={!result?.draft || status === 'saving'}
            onClick={onSave}
            title="Save client speech to Monitor Draft Inbox for review"
            type="button"
          >
            <Save aria-hidden="true" size={14} />
          </button>
        </div>
      ) : null}
    </div>

    {!enabled ? (
      <div className="empty-state monitor-live-empty">
        <p>Connect Monitor in Settings to see live BID/OFFER drafts.</p>
        <button onClick={onOpenSettings} type="button">Open settings</button>
      </div>
    ) : (
      <>
        <div className={`monitor-live-status monitor-live-status-${status}`}>
          {status === 'waiting' ? 'Listening for a commercial request…' : null}
          {status === 'loading' ? 'Updating draft and market options…' : null}
          {status === 'saving' ? 'Saving to Draft Inbox…' : null}
          {status === 'idle' ? 'Waiting for finalized client speech.' : null}
          {status === 'ready' ? 'Live preview · not saved' : null}
          {status === 'error' ? 'Monitor connection needs attention.' : null}
        </div>
        {error ? <div className="error-box">{error}</div> : null}
        {notice ? <div className="info-box">{notice}</div> : null}
        {result?.draft ? (
          <section className="monitor-live-draft">
            <span className={`monitor-request-kind monitor-request-kind-${result.draft.kind}`}>
              Client {result.draft.kind.toUpperCase()}
            </span>
            <strong>{result.draft.title}</strong>
            <p>{result.draft.body}</p>
            <small>{result.draft.provider === 'openai' ? 'AI extraction' : 'Fast local extraction'} · review only</small>
          </section>
        ) : status === 'ready' ? (
          <div className="empty-state monitor-live-empty">No clear BID or OFFER yet.</div>
        ) : null}
        {result?.hints.length ? (
          <section>
            <div className="monitor-live-hints-title">Possible counteroffers</div>
            <div className="monitor-live-hints" aria-label="Monitor market options">
              {result.hints.map(hint => {
                const preferenceFit = getMonitorLiveHintPreferenceFit(hint.reasons)
                return (
                  <article className="monitor-live-hint" key={hint.entryId}>
                    <div className="monitor-live-hint-head">
                      <strong>{hint.type.toUpperCase()} {hint.publicSerial ? `#${hint.publicSerial}` : ''}</strong>
                      <span>{hint.price}</span>
                    </div>
                    <span
                      className={`monitor-live-hint-fit monitor-live-hint-fit-${preferenceFit.kind}`}
                      title={preferenceFit.title}
                    >
                      {preferenceFit.label}
                    </span>
                    <p>{hint.commodity} · {hint.quantity}</p>
                    <p>{hint.basis} {hint.destination}</p>
                    <p>{hint.deliveryPeriod}</p>
                    <small>{hint.brokerName || hint.brokerCode} · {hint.reasons.join(', ')}</small>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}
        {result?.warnings.map(warning => (
          <div className="info-box" key={warning}>{warning}</div>
        ))}
      </>
    )}
  </article>
)
