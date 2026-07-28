import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const MARKITDOWN_TIMEOUT_MS = 60000

const supportedDocumentExtensions = new Set([
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.xls',
  '.html',
  '.htm'
])

type MarkItDownRunner = (filePath: string) => Promise<string>

const getBundledMarkItDownPython = () =>
  path.join(process.cwd(), 'data', 'tooling', 'markitdown-venv', 'bin', 'python')

const resolveMarkItDownPython = async () => {
  const envOverride = process.env.COQPI_MARKITDOWN_PYTHON?.trim()
  if (envOverride) {
    return envOverride
  }

  const bundled = getBundledMarkItDownPython()
  try {
    await fs.access(bundled)
    return bundled
  } catch {
    return 'python3'
  }
}

const defaultMarkItDownRunner: MarkItDownRunner = async (filePath) => {
  const python = await resolveMarkItDownPython()
  const scriptPath = path.join(process.cwd(), 'scripts', 'markitdown_adapter.py')
  const { stdout } = await execFileAsync(python, [scriptPath, filePath], {
    timeout: MARKITDOWN_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024
  })
  const parsed = JSON.parse(stdout) as { markdown?: string; error?: string }

  if (parsed.error) {
    throw new Error(parsed.error)
  }

  if (typeof parsed.markdown !== 'string') {
    throw new Error('markitdown returned no markdown output.')
  }

  return parsed.markdown
}

let markItDownRunner: MarkItDownRunner = defaultMarkItDownRunner

export const isMarkItDownSupportedLocation = (location: string) =>
  supportedDocumentExtensions.has(
    path.extname(location).toLowerCase()
  )

export const convertDocumentSourceToMarkdown = async (filePath: string) =>
  markItDownRunner(filePath)

export const setMarkItDownRunnerForTests = (runner: MarkItDownRunner | null) => {
  markItDownRunner = runner ?? defaultMarkItDownRunner
}
