import { Surface } from '@webprodigies/flute'
import type { ComponentProps } from 'react'
import sceneText from './coqpi-cinematic.scene.json?raw'
const recipe = JSON.parse(sceneText) as { definition: { scene: { nodes: { id: string; transform?: ComponentProps<typeof Surface>['transform'] }[] } } }
const pose = (id: string) => recipe.definition.scene.nodes.find(node => node.id === id)?.transform
import { MeetingPreparationBrief } from '../../renderer/MeetingPreparationBrief'
import { TrainingPanel } from '../../renderer/TrainingPanel'
import { CallFocusPanel } from '../../renderer/CallFocusPanel'
import type { AssistantAnalysisResult, SessionContext } from '../../shared/app-types'
const logo = new URL('../../../assets/coqpi-logo-dark-theme.png', import.meta.url).href
const noop = () => undefined
const context: SessionContext = { company: 'Demo organisation', role: 'Product & operations',
  context: 'Synthetic interview rehearsal', goal: 'Explain your experience clearly', notes: 'Demonstration only',
  selectedCounterpartyPackIds: ['synthetic-demo'], selectedFinderOutreachDraftId: '' }
const answer: AssistantAnalysisResult = {
  meaningRu: 'Как вы помогаете командам превращать сложные задачи в работающие продукты?',
  detectedQuestion: 'How do you turn complex ideas into useful products?', intent: 'Explain experience',
  risk: 'Synthetic example, not an actual model response', keywordsToRemember: ['Clarity', 'Evidence', 'Delivery'],
  suggestedAnswers: [{ label: 'short', text: 'I connect the business context with practical execution. First, I clarify the problem. Then I build, test, and improve the result with the team.', answerMeaningRu: 'Демонстрационный ответ' }]
}
const position = { position: 'absolute' as const, left: 0, top: 0 }
export default function CoqPiCinematic() {
 return <>
  <Surface id="brand" transform={pose('brand')} style={{...position, width: 1400, height: 160}}>
    <div className="coqpi-film-leaf coqpi-film-title"><img src={logo} alt="CoqPi" /><div><h1>CoqPi</h1><p>Prepare. Practise. Speak.</p></div></div>
  </Surface>
  <Surface id="prepare" transform={pose('prepare')} style={{...position, width: 720, height: 330}}>
    <div className="coqpi-film-leaf coqpi-film-frame prepare-layout"><div className="coqpi-film-label">01 / PREPARE · DEMO</div>
      <MeetingPreparationBrief context={context} onPractice={noop} onSaved={noop} />
      <div className="coqpi-film-demo">DEMONSTRATION · SYNTHETIC CONTEXT</div>
    </div>
  </Surface>
  <Surface id="practice" transform={pose('practice')} style={{...position, width: 720, height: 780}}>
    <div className="coqpi-film-leaf coqpi-film-frame prepare-layout"><div className="coqpi-film-label">02 / PRACTISE · DEMO</div>
      <TrainingPanel initialMode="coach" />
      <div className="coqpi-film-demo">DEMONSTRATION · NO MICROPHONE OR AI CALLS</div>
    </div>
  </Surface>
  <Surface id="conversation" transform={pose('conversation')} style={{...position, width: 790, height: 500}}>
    <div className="coqpi-film-leaf coqpi-film-frame prepare-layout"><div className="coqpi-film-label">03 / SPEAK WITH CONTEXT · DEMO</div>
      <CallFocusPanel speaking={false} onToggleSpeaking={noop} result={answer} heard="How do you turn complex ideas into useful products?"
        stale={false} analyzing={false} status="listening" language="English" detectedLanguage="en" savedAt={null}
        error={null} saveError={null} canStart={false} canStop={false} expanded={false} onStart={noop} onStop={noop}
        onRetry={noop} onExpand={noop} onLanguage={noop} />
      <div className="coqpi-film-demo">DEMONSTRATION · SYNTHETIC QUESTION & ANSWER</div>
    </div>
  </Surface>
  <Surface id="footer" transform={pose('footer')} style={{...position, width: 1700, height: 90}}>
    <div className="coqpi-film-leaf coqpi-film-footer">Multilingual conversations. Human control.<br />github.com/markoblogo/CoqPi</div>
  </Surface>
 </>
}
