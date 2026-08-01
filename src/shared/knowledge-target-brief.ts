import type {
  CounterpartyContextPack,
  LocalMemoryAssistantRecord,
  LocalMemoryState
} from './app-types'

export type KnowledgeToFinderTargetInput = Pick<
  CounterpartyContextPack,
  'kind' | 'partnerName' | 'title' | 'summary' | 'context' | 'links'
>

export type KnowledgeToFinderBriefFact = {
  text: string
  reason: string
  evidenceRefs: string[]
}

export type KnowledgeToFinderTargetBrief = {
  version: 1
  targetLabel: string
  targetKind: CounterpartyContextPack['kind'] | 'none'
  level: 'strong' | 'usable' | 'weak'
  useFacts: KnowledgeToFinderBriefFact[]
  avoidFacts: KnowledgeToFinderBriefFact[]
  questionsToPrepare: string[]
  answerAngles: string[]
  abstainReason?: string
}

const stopWords = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'from',
  'into',
  'your',
  'you',
  'are',
  'role',
  'lead',
  'target',
  'context',
  'owner',
  'selected',
  'current',
  'session',
  'should',
  'focus'
])

const sanitizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

const tokenize = (value: string) =>
  sanitizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9à-öø-ÿ]+/iu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token))

const unique = <T>(values: T[]) =>
  values.filter((value, index, list) => list.indexOf(value) === index)

const getTargetText = (packs: KnowledgeToFinderTargetInput[]) =>
  packs
    .map((pack) =>
      [
        pack.kind,
        pack.partnerName,
        pack.title,
        pack.summary,
        pack.context,
        pack.links.join(' ')
      ].join(' ')
    )
    .join('\n')

const isOwnerFactRecord = (entry: LocalMemoryAssistantRecord) =>
  entry.status === 'included' &&
  entry.record.sourceType === 'context_source' &&
  entry.record.kind === 'fact' &&
  entry.record.content.trim().length > 0

const scoreFactForTarget = (fact: string, targetTerms: Set<string>) => {
  const factTerms = unique(tokenize(fact))
  const matches = factTerms.filter((term) => targetTerms.has(term))

  return {
    score: matches.length,
    matches
  }
}

const questionByKind: Record<CounterpartyContextPack['kind'], string[]> = {
  job: [
    'Which 90-day outcome matters most for this role?',
    'Which product or AI workflow problem should be solved first?',
    'What evidence of fit should be explained in one short story?'
  ],
  partner: [
    'Who is the decision maker for a pilot conversation?',
    'Which operational workflow should the first pilot prove?',
    'What partner constraint or timeline should be clarified?'
  ],
  investor: [
    'Which thesis point should be tested first?',
    'What traction or pilot evidence should be explained carefully?',
    'Which ticket, stage, or follow-up expectation is still unknown?'
  ],
  accelerator: [
    'Which program outcome should the project fit into?',
    'What pilot or mentor support should be requested?',
    'Which deadline, cohort, or selection criterion should be verified?'
  ],
  other: [
    'What is the immediate goal of this conversation?',
    'Which fact about the owner is safe and relevant to use?',
    'What should be clarified before making a strong claim?'
  ]
}

const answerAnglesByKind: Record<CounterpartyContextPack['kind'], string[]> = {
  job: [
    'Connect owner experience to the target role, not to the whole biography.',
    'Use one concrete product/discovery/delivery example if selected evidence supports it.',
    'Keep the answer in 1-2 spoken sentences.'
  ],
  partner: [
    'Connect owner experience to a practical pilot or workflow.',
    'Emphasize collaboration only when the selected target context supports it.',
    'Ask for the next operational constraint if evidence is thin.'
  ],
  investor: [
    'Connect owner experience to market insight and execution discipline.',
    'Avoid claiming traction, revenue, or commitments without selected evidence.',
    'Ask which proof point the investor wants first.'
  ],
  accelerator: [
    'Connect owner experience to pilot readiness and coachability.',
    'Avoid broad project storytelling when a focused program fit is enough.',
    'Ask which program criterion matters most.'
  ],
  other: [
    'Stay scoped to selected evidence.',
    'Use a clarifying question when fit is unclear.',
    'Avoid unrelated owner facts.'
  ]
}

export const buildKnowledgeToFinderTargetBrief = ({
  memoryState,
  selectedPacks,
  maxFacts = 4
}: {
  memoryState: LocalMemoryState
  selectedPacks: KnowledgeToFinderTargetInput[]
  maxFacts?: number
}): KnowledgeToFinderTargetBrief => {
  const selected = selectedPacks[0] ?? null
  const targetLabel = selected
    ? `${selected.partnerName} · ${selected.title}`
    : 'No selected target'

  if (!selected) {
    return {
      version: 1,
      targetLabel,
      targetKind: 'none',
      level: 'weak',
      useFacts: [],
      avoidFacts: [],
      questionsToPrepare: questionByKind.other,
      answerAngles: answerAnglesByKind.other,
      abstainReason: 'No selected Finder/session target is available.'
    }
  }

  const targetTerms = new Set(tokenize(getTargetText(selectedPacks)))
  const ownerFacts = memoryState.assistantView.included
    .filter(isOwnerFactRecord)
    .map((entry) => {
      const text = sanitizeText(entry.record.content)
      const scored = scoreFactForTarget(text, targetTerms)

      return {
        entry,
        text,
        score: scored.score,
        matches: scored.matches
      }
    })
    .filter((fact) => fact.text)

  const useFacts = ownerFacts
    .filter((fact) => fact.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxFacts)
    .map((fact): KnowledgeToFinderBriefFact => ({
      text: fact.text,
      reason: `matches selected target terms: ${fact.matches.slice(0, 4).join(', ')}`,
      evidenceRefs: fact.entry.record.evidenceRefs.slice(0, 4)
    }))

  const avoidFacts = ownerFacts
    .filter((fact) => fact.score === 0)
    .slice(0, maxFacts)
    .map((fact): KnowledgeToFinderBriefFact => ({
      text: fact.text,
      reason: 'no direct match to selected target context',
      evidenceRefs: fact.entry.record.evidenceRefs.slice(0, 4)
    }))

  const totalUseScore = ownerFacts
    .filter((fact) => fact.score > 0)
    .reduce((sum, fact) => sum + fact.score, 0)
  const level =
    totalUseScore >= 3 ? 'strong' : useFacts.length > 0 ? 'usable' : 'weak'

  return {
    version: 1,
    targetLabel,
    targetKind: selected.kind,
    level,
    useFacts,
    avoidFacts,
    questionsToPrepare: questionByKind[selected.kind],
    answerAngles: answerAnglesByKind[selected.kind],
    abstainReason:
      level === 'weak'
        ? 'No strong owner facts matched the selected Finder target.'
        : undefined
  }
}

export const formatKnowledgeToFinderTargetBrief = (
  brief: KnowledgeToFinderTargetBrief,
  maxChars = 1600
) => {
  const lines = [
    `Knowledge-to-Finder relevance brief: ${brief.targetLabel}`,
    `Level: ${brief.level}`,
    brief.useFacts.length
      ? 'Use owner facts:'
      : 'Use owner facts: none matched strongly.',
    ...brief.useFacts.map((fact) => `- ${fact.text} (${fact.reason})`),
    brief.avoidFacts.length
      ? 'Avoid or downplay owner facts:'
      : 'Avoid or downplay owner facts: none flagged.',
    ...brief.avoidFacts.map((fact) => `- ${fact.text} (${fact.reason})`),
    'Questions to prepare:',
    ...brief.questionsToPrepare.map((question) => `- ${question}`),
    'Answer angles:',
    ...brief.answerAngles.map((angle) => `- ${angle}`),
    brief.abstainReason
      ? `Abstain rule: ${brief.abstainReason} Use a concise clarifying question instead of inventing owner-specific fit.`
      : ''
  ].filter(Boolean)

  return lines.join('\n').slice(0, maxChars)
}
