import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProfileContextResult } from '../../shared/app-types'
import { getProfileContextPath } from './app-state'

const profileTemplate = `# CoqPi Profile Context

## Personal Summary
I am a senior product, marketing, growth and AI transformation professional based in France.

## Target CDI Roles
- AI Product Manager
- Digital Transformation Lead
- Product Owner B2B SaaS
- Product-Growth Lead
- GTM / Product Marketing Lead
- AI Workflow Automation Lead

## Current Situation in France
I am based in France and looking for a stable CDI role in France or the EU, preferably remote or hybrid.

## Language Situation
My written English is strong. My spoken English and French are less fluent under stress. I understand more than I can express orally. I prefer prepared video calls, written follow-ups and live captions/translation support.

## Communication Constraints
Unplanned phone calls are difficult. Planned video calls with written context are better. The tool should help me understand questions, remember facts, and answer calmly.

## Key Professional Experience
Add details here later.

## Agro-Commodity / Brokerage Projects
Add details about MN7R, Monitor-like tools, market intelligence, broker workspaces, validation-gated workflows and AI-assisted commodity workflows here later.

## MN7R-Safe Wording
I have hands-on experience building AI-assisted product systems for agro-commodity brokerage workflows. I am not proposing to transfer proprietary product logic or client-specific systems. I am interested in building compliant, market-specific internal tools and digital workflows for the French / European context.

## Salary Expectations
Minimum useful CDI salary target: around 3k EUR net/month.
Preferred long-term target: 5k+ EUR net/month.

## Interview Answer Facts
Add reusable facts here later.

## Things Not To Invent
Do not invent employers, titles, dates, degrees, client names, revenue, product metrics or legal status details.
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
