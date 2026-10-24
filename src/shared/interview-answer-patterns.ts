// Strategies, not autobiographical answers. All personal claims still need evidence.
const patterns = [
  { id: 'introduction', match: /tell me about yourself|parlez[- ]moi de vous|presentez[- ]vous/i, guidance: 'Use one verified professional identity and one relevant strength. Do not recite the full CV.' },
  { id: 'motivation', match: /why.*(?:role|company|hire)|pourquoi.*(?:poste|entreprise|recruter)/i, guidance: 'Connect one supplied target fact to one verified owner fact. If target research is absent, ask about the priority of the role.' },
  { id: 'behavioral', match: /tell me about a time|give.*example|donnez.*exemple|racontez.*(?:fois|situation)/i, guidance: 'Use situation, own action and observed result only from a supplied example. Never invent a success story or metric.' },
  { id: 'weakness', match: /weakness|failure|mistake|point faible|echec|erreur/i, guidance: 'Use a verified example and lesson if available. Do not invent a flaw or an incident.' },
  { id: 'terms', match: /salary|start date|relocat|salaire|remuneration|disponibilite|demena|commencer/i, guidance: 'Clarify the concrete terms. Do not accept or supply an unsourced number, availability or personal constraint.' },
  { id: 'questions', match: /questions for us|questions pour nous/i, guidance: 'Ask one relevant question about priorities, success criteria or the next step. Do not assume an offer.' }
]

export const getInterviewAnswerPattern = (utterance: string): string => {
  const normalized = utterance.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const found = patterns.find(pattern => pattern.match.test(normalized))
  return found ? `Optional interview answer structure (${found.id}): ${found.guidance} The latest question and its constraints always take precedence.` : ''
}
