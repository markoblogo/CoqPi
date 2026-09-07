export type ConversationLanguage = 'en' | 'fr' | 'ru' | 'uk'

// Ambiguous short turns keep the previous language rather than switching guesses.
export const detectConversationLanguage = (
  text: string,
  previous: ConversationLanguage = 'en'
): ConversationLanguage => {
  if (/[іїєґ]/iu.test(text)) return 'uk'
  if (/[ыэёъ]/iu.test(text)) return 'ru'
  if (/[а-я]/iu.test(text)) return previous === 'uk' ? 'uk' : 'ru'
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? []
  const fr = new Set(['bonjour', 'vous', 'votre', 'vos', 'pourquoi', 'comment', 'pouvez', 'parcours', 'avec', 'dans', 'une', 'nous', 'est', 'je', 'pour', 'quelles', 'quels', 'sont', 'avez', 'merci', 'suis', 'notre', 'cette', 'travail', 'parlez'])
  const en = new Set(['hello', 'you', 'your', 'why', 'how', 'could', 'would', 'about', 'the', 'with', 'what', 'have', 'experience', 'tell', 'thanks', 'thank', 'are', 'our', 'this', 'please', 'can', 'explain', 'work', 'which'])
  const score = (markers: Set<string>) => words.filter(word => markers.has(word)).length
  const french = score(fr)
  const english = score(en)
  if (french >= 2 && french > english) return 'fr'
  if (english >= 2 && english > french) return 'en'
  return previous
}
