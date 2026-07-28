import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CRAWL4AI_TIMEOUT_MS = 90000

type Crawl4aiMarkdownEnrichmentRunner = (url: string) => Promise<string>

const getBundledCrawl4aiPython = () =>
  path.join(process.cwd(), 'data', 'tooling', 'crawl4ai-venv', 'bin', 'python')

const isTruthy = (value: string | undefined) =>
  typeof value === 'string' && /^(1|true|yes|on)$/i.test(value.trim())

const resolveCrawl4aiPython = async () => {
  const envOverride = process.env.COQPI_CRAWL4AI_PYTHON?.trim()
  if (envOverride) {
    return envOverride
  }

  const bundled = getBundledCrawl4aiPython()
  try {
    await fs.access(bundled)
    return bundled
  } catch {
    return null
  }
}

const defaultCrawl4aiRunner: Crawl4aiMarkdownEnrichmentRunner = async (url) => {
  const python = await resolveCrawl4aiPython()

  if (!python) {
    throw new Error('crawl4ai python runtime is not configured.')
  }

  const scriptPath = path.join(process.cwd(), 'scripts', 'crawl4ai_markdown_adapter.py')
  const { stdout } = await execFileAsync(python, [scriptPath, url], {
    timeout: CRAWL4AI_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024
  })
  const parsed = JSON.parse(stdout) as { markdown?: string; error?: string }

  if (parsed.error) {
    throw new Error(parsed.error)
  }

  if (typeof parsed.markdown !== 'string' || !parsed.markdown.trim()) {
    throw new Error('crawl4ai returned no markdown output.')
  }

  return parsed.markdown
}

let crawl4aiRunnerOverride: Crawl4aiMarkdownEnrichmentRunner | null = null
let crawl4aiRunnerOverrideSet = false

const hasBundledCrawl4aiRuntime = async () => {
  const bundled = getBundledCrawl4aiPython()

  try {
    await fs.access(bundled)
    return true
  } catch {
    return false
  }
}

export const getOptionalCrawl4aiMarkdownEnrichment = async (url: string) => {
  if (crawl4aiRunnerOverrideSet) {
    return crawl4aiRunnerOverride ? crawl4aiRunnerOverride(url) : null
  }

  const explicitlyEnabled =
    isTruthy(process.env.COQPI_ENABLE_CRAWL4AI_ENRICHMENT) ||
    Boolean(process.env.COQPI_CRAWL4AI_PYTHON?.trim())

  if (!explicitlyEnabled && !(await hasBundledCrawl4aiRuntime())) {
    return null
  }

  return defaultCrawl4aiRunner(url)
}

export const setCrawl4aiMarkdownEnrichmentRunnerForTests = (
  runner: Crawl4aiMarkdownEnrichmentRunner | null
) => {
  crawl4aiRunnerOverride = runner
  crawl4aiRunnerOverrideSet = runner !== null
}
