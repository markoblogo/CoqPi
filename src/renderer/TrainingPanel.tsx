import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Volume2 } from 'lucide-react'
import { RealtimeTranscriptionClient } from './realtime/realtime-transcription-client'
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

export const TrainingPanel = ({ initialMode = 'coach' }: { initialMode?: 'coach' | 'rehearsal' }) => {
  const [scenarioId, setScenarioId] =
    useState<SimpleAssistantScenarioId>('france-job-interview')
  const [language, setLanguage] = useState<AssistantAnswerLanguage>('fr')
  const [practiceMode, setPracticeMode] = useState<'coach' | 'rehearsal'>(initialMode)
  const [question, setQuestion] = useState('Parlez-moi de votre parcours professionnel.')
  const [listening, setListening] = useState(false)
  const voice = useRef<RealtimeTranscriptionClient | null>(null)
  const analyzedInput = useRef('')
  const resultId = useRef('')
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

  useEffect(() => () => { void voice.current?.stop(); window.speechSynthesis?.cancel() }, [])

  const toggleVoice = async () => {
    if (listening) { await voice.current?.stop(); setListening(false); return }
    voice.current ??= new RealtimeTranscriptionClient()
    setListening(true)
    try {
      await voice.current.start({
        selectedAudioDeviceId: '', callLanguage: language,
        onStatusChange: status => { if (status === 'error' || status === 'stopped') setListening(false) },
        onEvent: event => { if (event.type === 'conversation.item.input_audio_transcription.completed' && typeof event.transcript === 'string') setTranscriptText(current => `${current} ${event.transcript}`.trim()) },
        onError: message => setError(message), onDebugEventType: () => {}, onLifecycleLog: () => {},
        onPeerConnectionStateChange: () => {}, onIceConnectionStateChange: () => {}, onIceGatheringStateChange: () => {}, onDataChannelStateChange: () => {}
      })
    } catch (cause) { setListening(false); setError(String(cause)) }
  }

  const speakQuestion = () => {
    const utterance = new SpeechSynthesisUtterance(question)
    utterance.lang = language === 'fr' ? 'fr-FR' : 'en-GB'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const analyze = async () => {
    if (!transcriptText.trim() || isAnalyzing) {
      return
    }

    setIsAnalyzing(true)
    setError(null)

    try {
      analyzedInput.current = transcriptText.trim()
      resultId.current = makeId()
      const history = sessions.filter(entry => entry.scenarioId === scenarioId && entry.language === language).slice(0, 6)
      const response = await window.coqpi.assistant.analyzeRecentTranscript({
        transcriptText: practiceMode === 'coach' ? [
          `Practice question: ${question}`, `Learner answer: ${transcriptText.trim()}`,
          `Confirmed successful exercises: ${history.filter(entry => entry.feedback === 'true').length}.`,
          'Recent corrections to revisit:', ...history.map(entry => entry.answerMeaningRu.slice(0, 300))
        ].join('\n') : transcriptText.trim(),
        responseStyle: practiceMode === 'coach' ? 'coaching' : 'brief',
        callLanguage: language,
        answerLanguage: language,
        mode: 'full',
        includeProfileContext: practiceMode !== 'coach',
        recentWindowLabel: 'full',
        costMode: 'balanced',
        assistantContextMode: 'legacy',
        scenarioId
      })

      if (!response.ok) {
        throw new Error(response.error.message)
      }

      setResult(response.data)
      const entry: TrainingSessionEntry = {
        id: resultId.current, sessionId, createdAt: new Date().toISOString(), scenarioId, language,
        transcriptText: analyzedInput.current, source: 'manual', speaker: 'other',
        answerText: response.data.suggestedAnswers[0]?.text ?? '',
        answerMeaningRu: practiceMode === 'coach' ? response.data.meaningRu : response.data.suggestedAnswers[0]?.answerMeaningRu ?? '',
        feedback: null, mode: 'legacy', model: response.data.model, latencyMs: response.data.latencyMs
      }
      const saved = await window.coqpi.trainingSessions.save(entry)
      setSessions(saved.sessions)
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
      id: resultId.current,
      sessionId,
      createdAt: new Date().toISOString(),
      scenarioId,
      language,
      transcriptText: analyzedInput.current,
      source: 'manual',
      speaker: 'other',
      answerText: answer.text,
      answerMeaningRu: practiceMode === 'coach' ? result?.meaningRu ?? '' : answer.answerMeaningRu,
      feedback,
      mode: 'legacy',
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
            <h1>Conversation practice</h1>
          </div>
          <select aria-label="Practice mode" value={practiceMode} onChange={event => setPracticeMode(event.target.value as 'coach' | 'rehearsal')}><option value="coach">Language lesson</option><option value="rehearsal">Interview rehearsal</option></select>
        </div>
      </section>

      <section className="panel training-input-panel">
        {practiceMode === 'coach' && <div className="lesson-question"><p>{question}</p><button title="Read question aloud" aria-label="Read question aloud" disabled={listening} onClick={speakQuestion}><Volume2 size={18} /></button></div>}
        <label className="field-label" htmlFor="training-scenario">
          Scenario
        </label>
        <select
          id="training-scenario"
          disabled={isAnalyzing || listening}
          value={scenarioId}
          onChange={(event) =>
            (() => {
              const nextScenario = event.target.value as SimpleAssistantScenarioId
              setResult(null)
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
          disabled={isAnalyzing || listening}
          value={language}
          onChange={(event) => { setResult(null); setLanguage(event.target.value as AssistantAnswerLanguage); setQuestion(event.target.value === 'fr' ? 'Parlez-moi de votre parcours professionnel.' : 'Tell me about your professional background.') }}
        >
          <option value="en">English</option>
          <option value="fr">French</option>
        </select>
        <label className="field-label" htmlFor="training-transcript">
          {practiceMode === 'coach' ? 'Your answer' : 'Interview question'}
        </label>
        <textarea
          id="training-transcript"
          value={transcriptText}
          onChange={(event) => setTranscriptText(event.target.value)}
          placeholder="Tell me about your experience with AI products."
          rows={5}
        />
        <button aria-label={listening ? 'Stop voice input' : 'Start voice input'} title={listening ? 'Stop voice input' : 'Start voice input'} onClick={() => void toggleVoice()}>{listening ? <Square size={18} /> : <Mic size={18} />}</button>
        <button
          className="primary-button"
          disabled={!transcriptText.trim() || isAnalyzing}
          onClick={() => void analyze()}
          type="button"
        >
          {isAnalyzing ? 'Thinking...' : practiceMode === 'coach' ? 'Review my answer' : 'Suggest one answer'}
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
            <p className="muted-text">{practiceMode === 'coach' ? result?.meaningRu : answer.answerMeaningRu}</p>
            {practiceMode === 'coach' && result?.detectedQuestion && <button onClick={() => { setQuestion(result.detectedQuestion); setTranscriptText(''); setResult(null) }}>Next question</button>}
            <div className="training-feedback-actions">
              <button
                className="primary-button"
                onClick={() => void saveFeedback('true')}
                type="button"
              >
                {practiceMode === 'coach' ? 'Practiced correctly' : 'Useful answer'}
              </button>
              <button onClick={() => void saveFeedback('false')} type="button">
                {practiceMode === 'coach' ? 'Needs practice' : 'Needs a change'}
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
