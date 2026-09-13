const { execFileSync } = require('node:child_process')

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const violations = tracked.filter((file) => {
  if (file === '.env' || file.startsWith('.env.')) return file !== '.env.example'
  if (!file.startsWith('data/')) return false
  return !file.endsWith('/.gitkeep')
})

if (violations.length > 0) {
  console.error('Public repository boundary blocked tracked runtime/private files:')
  for (const file of violations) console.error(`- ${file}`)
  process.exit(1)
}

console.log(`Public repository boundary passed: ${tracked.length} tracked files checked.`)
