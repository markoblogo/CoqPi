// Conservative boundaries for high-risk questions. Do not infer legal/personal facts.
const rules = [
  { id: 'fabrication', test: /(?:ignore.*rules|ignorez.*regles|even if untrue|meme si.*faux)/i,
    en: 'I would rather describe my actual experience accurately.', fr: 'Je préfère présenter mon expérience réelle avec précision.' },
  { id: 'authorization', test: /work (?:authorization|permit)|right to work|autorisation de travail|droit de travailler|visa status|statut.*visa/i,
    en: 'Let me verify the exact requirements before confirming my situation.', fr: 'Laissez-moi vérifier les exigences exactes avant de confirmer ma situation.' },
  { id: 'availability', test: /(?:can|could|will) you start|(?:pouvez|pourriez)[- ]vous commencer|available.*(?:monday|next week)|disponible.*(?:lundi|semaine prochaine)/i,
    en: 'I need to check before confirming a start date. Is that date flexible?', fr: 'Je dois vérifier avant de confirmer une date de début. Cette date est-elle flexible ?' },
  { id: 'relocation', test: /relocat.*(?:expense|agree|will)|will you relocate|demena.*(?:frais|acceptez)|acceptez.*demena/i,
    en: 'Could we clarify the relocation conditions and support before I make a decision?', fr: 'Pouvons-nous préciser les conditions et les aides à la mobilité avant que je prenne une décision ?' },
  { id: 'salary-agreement', test: /(?:agree|accept).*(?:gross|net|salary|annually)|(?:convenir|acceptez|accord).*(?:brut|net|salaire|annuel)/i,
    en: 'Before agreeing, could we clarify the full compensation package and the conditions?', fr: 'Avant de donner mon accord, pouvons-nous préciser la rémunération complète et les conditions ?' },
  { id: 'fluency', test: /native.*(?:speaker|french)|(?:francais|anglais).*(?:langue maternelle)|(?:francophone|anglophone) natif/i,
    en: 'I would prefer to describe my language level accurately rather than overstate it.', fr: 'Je préfère préciser mon niveau de langue plutôt que de le surestimer.' },
  { id: 'guarantee', test: /guarantee.*(?:delivery|deliver|friday|deadline)|garantiss.*(?:livraison|vendredi|delai)/i,
    en: 'I need to assess feasibility before making a commitment, while preserving all the stated requirements.', fr: 'Je dois vérifier la faisabilité avant de m’engager, en respectant toutes les exigences indiquées.' },
  { id: 'asserted-metric', test: /(?:how did you|comment avez[- ]vous).*(?:\d+\s*(?:percent|pour cent|%)|revenue|chiffre d affaires)/i,
    en: 'Which project and verified result are you referring to?', fr: 'À quel projet et à quel résultat vérifié faites-vous référence ?' },
  { id: 'asserted-employer', test: /(?:you (?:managed|worked|led)|vous avez (?:dirige|travaille)).*(?:correct|exact|right|n.est.ce pas)/i,
    en: 'Could you clarify which experience you are referring to?', fr: 'Pourriez-vous préciser à quelle expérience vous faites référence ?' },
  { id: 'behavioral-example', test: /tell me about a time|(?:racontez|decrivez).*(?:situation|fois)|give.*example.*(?:saved|rescued|failed)/i,
    en: 'Would you prefer an example about delivery, teamwork or decision-making?', fr: 'Préférez-vous un exemple lié à la livraison, au travail en équipe ou à la prise de décision ?' }
]

export const getInterviewSafetyReply = (question: string, language: string) => {
  if (language !== 'en' && language !== 'fr') return null
  const normalized = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ')
  const rule = rules.find(item => item.test.test(normalized))
  return rule ? { reason: rule.id, answer: rule[language] } : null
}
