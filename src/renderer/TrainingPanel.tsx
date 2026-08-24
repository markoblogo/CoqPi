import { useEffect, useState } from 'react'
import {
  simpleAssistantScenarioIds,
  type AssistantAnswerLanguage,
  type AssistantAnalysisResult,
  type SimpleAssistantScenarioId,
  type TrainingSessionEntry
} from '@shared/app-types'

const scenarioLabels: Record<SimpleAssistantScenarioId, string> = {
  'free-mode': 'Free mode',
  'france-job-interview': 'France / French job interview',
  'international-job-interview': 'International / English job interview',
  'ai-product-role': 'AI product / growth / operations',
  'agro-business': 'Agro / commodities / investor or partner',
  'client-consulting': 'Client / consulting',
  networking: 'Networking',
  art: 'Art / Nantes art ecosystem'
}

const defaultScenarioLanguages: Partial<
  Record<SimpleAssistantScenarioId, AssistantAnswerLanguage>
> = {
  'france-job-interview': 'fr',
  art: 'fr'
}

const makeId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `training-${Date.now()}`

export const TrainingPanel = () => {
  const [scenarioId, setScenarioId] =
    useState<SimpleAssistantScenarioId>('france-job-interview')
  const [language, setLanguage] = useState<AssistantAnswerLanguage>('en')
  const [sessionId] = useState(makeId)
  const [transcriptText, setTranscriptText] = useState('')
  const [result, setResult] = useState<AssistantAnalysisResult | null>(null)
  const [sessions, setSessions] = useState<TrainingSessionEntry[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.coqpi.trainingSessions
      .get()
      .then((payload) => setSessions(payload.sessions))
      .catch(() => setError('Unable to load training history.'))
  }, [])

  const analyze = async () => {
    if (!transcriptText.trim() || isAnalyzing) {
      return
    }

    setIsAnalyzing(true)
    setError(null)

    try {
      const response = await window.coqpi.assistant.analyzeRecentTranscript({
        transcriptText: transcriptText.trim(),
        callLanguage: language,
        answerLanguage: language,
        mode: 'full',
        includeProfileContext: true,
        recentWindowLabel: 'full',
        costMode: 'balanced',
        assistantContextMode: 'simple',
        scenarioId
      })

      if (!response.ok) {
        throw new Error(response.error.message)
      }

      setResult(response.data)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Training analysis failed.'
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const saveFeedback = async (feedback: 'true' | 'false') => {
    const answer = result?.suggestedAnswers[0]
    if (!answer) {
      return
    }

    const entry: TrainingSessionEntry = {
      id: makeId(),
      sessionId,
      createdAt: new Date().toISOString(),
      scenarioId,
      language,
      transcriptText: transcriptText.trim(),
      source: 'manual',
      speaker: 'other',
      answerText: answer.text,
      answerMeaningRu: answer.answerMeaningRu,
      feedback,
      mode: 'simple',
      latencyMs: result?.latencyMs,
      model: result?.model,
      promptVersion: result?.promptVersion,
      requestStartedAt: result?.requestStartedAt,
      responseCompletedAt: result?.responseCompletedAt
    }

    try {
      const payload = await window.coqpi.trainingSessions.save(entry)
      setSessions(payload.sessions)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save feedback.'
      )
    }
  }

  const exportSession = () => {
    const sessionEntries = sessions.filter((entry) => entry.sessionId === sessionId)
    const lines = [
      '# CoqPi Training Session',
      '',
      `Session ID: ${sessionId}`,
      `Exported: ${new Date().toISOString()}`,
      '',
      ...sessionEntries.flatMap((entry) => [
        `## ${entry.createdAt} / ${entry.feedback === 'true' ? 'GOOD' : 'BAD'}`,
        `Scenario: ${scenarioLabels[entry.scenarioId]}`,
        `Language: ${entry.language ?? 'en'}`,
        `Model: ${entry.model ?? 'unknown'}`,
        `Latency: ${entry.latencyMs ?? 'unknown'} ms`,
        '',
        `Interlocutor: ${entry.transcriptText}`,
        `Suggested response: ${entry.answerText}`,
        `Meaning: ${entry.answerMeaningRu}`,
        ''
      ])
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `coqpi-training-${sessionId}.md`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const answer = result?.suggestedAnswers[0]

  return (
    <main className="training-layout">
      <section className="panel training-intro">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Training lab</p>
            <h1>Practice one answer at a time</h1>
          </div>
          <span className="status-chip">Simple markdown mode</span>
        </div>
        <p>
          Paste one interviewer question or statement. CoqPi uses only the
          shared profile and the selected scenario.
        </p>
      </section>

      <section className="panel training-input-panel">
        <label className="field-label" htmlFor="training-scenario">
          Scenario
        </label>
        <select
          id="training-scenario"
          value={scenarioId}
          onChange={(event) =>
            (() => {
              const nextScenario = event.target.value as SimpleAssistantScenarioId
              setScenarioId(nextScenario)
              const defaultLanguage = defaultScenarioLanguages[nextScenario]
              if (defaultLanguage) {
                setLanguage(defaultLanguage)
              }
            })()
          }
        >
          {simpleAssistantScenarioIds.map((id) => (
            <option key={id} value={id}>
              {scenarioLabels[id]}
            </option>
          ))}
        </select>
        <label className="field-label" htmlFor="training-language">
          Working language
        </label>
        <select
          id="training-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value as AssistantAnswerLanguage)}
        >
          <option value="en">English</option>
          <option value="fr">French</option>
        </select>
        <label className="field-label" htmlFor="training-transcript">
          Question or transcript line
        </label>
        <textarea
          id="training-transcript"
          value={transcriptText}
          onChange={(event) => setTranscriptText(event.target.value)}
          placeholder="Tell me about your experience with AI products."
          rows={5}
        />
        <button
          className="primary-button"
          disabled={!transcriptText.trim() || isAnalyzing}
          onClick={() => void analyze()}
          type="button"
        >
          {isAnalyzing ? 'Thinking...' : 'Suggest one answer'}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel training-result-panel" aria-live="polite">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Suggested response</p>
            <h2>{answer ? 'Say this' : 'No answer yet'}</h2>
          </div>
          <span className="status-chip">
            {result?.latencyMs !== undefined ? `${result.latencyMs} ms` : 'Ready'}
          </span>
        </div>
        {answer ? (
          <>
            <blockquote>{answer.text}</blockquote>
            <p className="muted-text">{answer.answerMeaningRu}</p>
            <div className="training-feedback-actions">
              <button
                className="primary-button"
                onClick={() => void saveFeedback('true')}
                type="button"
              >
                True: useful
              </button>
              <button onClick={() => void saveFeedback('false')} type="button">
                False: change it
              </button>
            </div>
          </>
        ) : (
          <p className="muted-text">
            Run a practice question to see the first short answer.
          </p>
        )}
      </section>

      <section className="panel training-history-panel">
        <div className="panel-heading">
          <h2>Recent practice</h2>
          <div>
            <span className="status-chip">{sessions.length}</span>
            <button onClick={exportSession} type="button">Export session</button>
          </div>
        </div>
        {sessions.length === 0 ? (
          <p className="muted-text">
            Feedback will appear here for later review.
          </p>
        ) : (
          sessions.slice(0, 8).map((session) => (
            <article className="training-history-item" key={session.id}>
              <div>
                <strong>{scenarioLabels[session.scenarioId]}</strong>
                <span className="muted-text">
                  {' '}
                  {session.feedback === 'true' ? 'True' : 'False'}
                </span>
              </div>
              <p>{session.transcriptText}</p>
              <blockquote>{session.answerText}</blockquote>
            </article>
          ))
        )}
      </section>
    </main>
  )
}
