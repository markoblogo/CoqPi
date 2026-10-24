import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { PersonalReply } from '../../shared/personal-reply-bank'
import { normalizeReplyQuestion } from '../../shared/personal-reply-bank'

export const replyHash = (entry: PersonalReply) => createHash('sha256').update(JSON.stringify({
  language: entry.language, questions: entry.questions, answer: entry.answer,
  evidence: entry.evidence, scopeHash: entry.scopeHash
})).digest('hex')

export const readReplyBank = async (directory: string): Promise<PersonalReply[]> => {
  try {
    const value = JSON.parse(await fs.readFile(path.join(directory, 'personal-replies.json'), 'utf8'))
    if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 100) throw new Error('Invalid personal reply bank')
    if (value.entries.some((entry: PersonalReply) => !entry || typeof entry.id !== 'string' ||
      !['en', 'fr'].includes(entry.language) || typeof entry.answer !== 'string' ||
      typeof entry.scopeHash !== 'string' || !Array.isArray(entry.questions) ||
      !entry.questions.length || entry.questions.some(q => typeof q !== 'string') ||
      !Array.isArray(entry.evidence) || entry.evidence.some(q => typeof q !== 'string') ||
      (entry.approvedHash !== null && typeof entry.approvedHash !== 'string'))) throw new Error('Invalid personal reply entry')
    return value.entries.map((entry: PersonalReply) => ({...entry,
      approvedHash: entry.approvedHash === replyHash(entry) ? entry.approvedHash : null}))
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
}

let writes: Promise<unknown> = Promise.resolve()
export const saveReply = (directory: string, entry: PersonalReply, scopeHash: string, facts: string, approve: boolean) => {
  const operation = writes.catch(() => undefined).then(async () => {
    if (entry.scopeHash !== scopeHash) throw new Error('Context changed. Reload and review the answer again.')
    if (!['en', 'fr'].includes(entry.language) || !Array.isArray(entry.questions) || !entry.questions.length || entry.questions.length > 10 ||
        entry.questions.some(q => typeof q !== 'string' || q.trim().length < 8 || q.length > 500) ||
        typeof entry.answer !== 'string' || !entry.answer.trim() || entry.answer.length > 1600 ||
        !Array.isArray(entry.evidence) || !entry.evidence.length || entry.evidence.length > 10 ||
        entry.evidence.some(q => typeof q !== 'string' || q.trim().length < 12 || !facts.includes(q.trim()))) {
      throw new Error('Answer needs EN/FR, a complete question and exact supporting quotes from the current profile.')
    }
    const entries = await readReplyBank(directory)
    const next: PersonalReply = { id: entry.id || randomUUID(), language: entry.language,
      questions: entry.questions.map(q => q.trim()), answer: entry.answer.trim(),
      evidence: entry.evidence.map(q => q.trim()), scopeHash, approvedHash: null }
    if (approve) next.approvedHash = replyHash(next)
    const index = entries.findIndex(item => item.id === next.id)
    if (index >= 0) entries[index] = next
    else { if (entries.length >= 100) throw new Error('Reply bank is full'); entries.push(next) }
    await fs.mkdir(directory, {recursive: true})
    const temporary = path.join(directory, `personal-replies.${randomUUID()}.tmp`)
    try {
      const file = await fs.open(temporary, 'wx', 0o600)
      try { await file.writeFile(JSON.stringify({version: 1, entries})); await file.sync() } finally { await file.close() }
      await fs.rename(temporary, path.join(directory, 'personal-replies.json'))
    } finally { await fs.rm(temporary, {force: true}) }
    return entries
  })
  writes = operation
  return operation
}

export const matchPersonalReply = (entries: PersonalReply[], question: string, language: string, scopeHash: string) => {
  const matches = entries.filter(entry => entry.language === language && entry.scopeHash === scopeHash &&
    entry.approvedHash && entry.approvedHash === replyHash(entry) &&
    entry.questions.some(alias => normalizeReplyQuestion(alias) === normalizeReplyQuestion(question)))
  // Conflicting approvals fail closed, rather than depending on array order.
  return matches.length === 1 ? matches[0] : null
}
