import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProfileContextResult } from '../../shared/app-types'
import { getProfileContextPath } from './app-state'

const profileTemplate = `# CoqPi Profile Context

## Personal Summary
Add a short, verified professional summary.

## Current Goals
- Add the roles, conversations, or outcomes you are preparing for.

## Languages
- Add the languages you understand and the languages you want CoqPi to answer in.

## Communication Preferences
- Add useful constraints such as answer length, tone, or terminology.

## Verified Experience
- Add concise facts that may be used in answers.

## Current Projects
- Add only project facts that are safe and relevant for the intended conversation.

## Reusable Answer Facts
- Add facts that can be stated directly without inference.

## Things Not To Invent
Do not invent employers, titles, dates, degrees, clients, metrics, legal status, commitments, or personal details.
`

const ensureProfileContextFile = async (profilePath: string) => {
  try {
    await fs.access(profilePath)
  } catch {
    await fs.mkdir(path.dirname(profilePath), { recursive: true })
    await fs.writeFile(profilePath, profileTemplate, 'utf8')
  }
}

export const getProfileContext = async (): Promise<ProfileContextResult> => {
  const profilePath = getProfileContextPath()

  try {
    await ensureProfileContextFile(profilePath)
    const content = await fs.readFile(profilePath, 'utf8')

    return { content }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown profile context error'

    throw new Error(
      `Unable to load profile context from ${profilePath}: ${message}`
    )
  }
}
