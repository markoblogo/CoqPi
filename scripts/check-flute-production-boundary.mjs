import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { log } from 'node:console'
const forbidden = ['__FLUTE_CAPTURE__', 'data-flute-capture', 'coqpi-film-label', 'DEMONSTRATION · SYNTHETIC QUESTION']
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat()
}
const built = (await files('dist')).filter(file => /\.(js|css|html)$/.test(file))
if (!built.length) throw new Error('Build the renderer before checking the production boundary')
for (const file of built) {
  const source = await readFile(file, 'utf8')
  for (const marker of forbidden) if (source.includes(marker)) throw new Error(`Flute demo entered production bundle: ${file}: ${marker}`)
}
log(`Production boundary passed: ${built.length} built files contain no Flute capture runtime or demo UI`)
