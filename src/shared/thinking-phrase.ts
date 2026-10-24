const phrases: Record<string, readonly string[]> = {
  en: ['Let me think for a moment.', 'Give me a second to consider that.', 'Let me take a moment to answer.'],
  fr: ['Laissez-moi un instant pour y réfléchir.', 'Un instant, je réfléchis.', 'Laissez-moi réfléchir un moment.']
}

export const thinkingPhrase = (language: string, index: number): string => {
  const choices = phrases[language]
  return choices ? choices[Math.max(0, Math.floor(index)) % choices.length] : ''
}
