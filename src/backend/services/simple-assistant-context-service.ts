import fs from 'node:fs/promises'
import path from 'node:path'
import type { SimpleAssistantScenarioId } from '../../shared/app-types'
import {
  getSimpleAssistantProfilePath,
  getSimpleAssistantFranceInterviewPath,
  getSimpleAssistantScenariosDirectory
} from './app-state'

const defaultProfile = `# CoqPi Simple Assistant Profile

## Short identity
Add a short, verified professional identity.

## Current direction
Add the roles, partnerships or conversations you are preparing for.

## Communication style
Add preferred languages, tone and answer length.

## Facts to use
Add verified CV and interview facts here.

## Do not invent
Employers, titles, dates, degrees, clients, revenue, metrics, legal status or commitments.
`

const fallbackScenario = (
  scenarioId: SimpleAssistantScenarioId
) => `# ${scenarioId}

## Purpose
Use this scenario for focused practice and short answers.

## What I want to communicate
Add the verified message for this scenario.

## What to avoid
Do not invent facts or make unsupported claims.

## Short answer style
One or two natural sentences. Clear, calm and easy to say.
`

const ensureFile = async (filePath: string, fallback: string) => {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, fallback, 'utf8')
    return fallback
  }
}

export const getSimpleAssistantContext = async (
  scenarioId: SimpleAssistantScenarioId
) => {
  const profileMarkdown = await ensureFile(
    getSimpleAssistantProfilePath(),
    defaultProfile
  )
  const scenarioMarkdown = await ensureFile(
    scenarioId === 'france-job-interview'
      ? getSimpleAssistantFranceInterviewPath()
      : path.join(getSimpleAssistantScenariosDirectory(), `${scenarioId}.md`),
    fallbackScenario(scenarioId)
  )

  return { profileMarkdown, scenarioMarkdown, scenarioId }
}
