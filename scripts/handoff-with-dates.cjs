#!/usr/bin/env node

const fs = require('node:fs/promises')
const path = require('node:path')

const {
  parseArgs,
  stableJson,
  validateManifest,
  dumpManifestSnapshot
} = require('./dump-manifest.cjs')

const formatTimestampDir = (now = new Date()) =>
  now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')

const buildHandoffFolder = (now = new Date()) => {
  const timestamp = formatTimestampDir(now)
  const manifestDir = path.resolve(process.cwd(), 'handoff')

  return path.join(manifestDir, timestamp)
}

const run = async (options = {}) => {
  const args = options.args
    ? parseArgs(options.args)
    : parseArgs(process.argv.slice(2))
  const manifestDir = options.manifestDir || args['--manifest-dir']
  const now = options.now || new Date()

  const outputDir = options.outputDir || buildHandoffFolder(now)
  await fs.mkdir(outputDir, { recursive: true })

  const validationOutput = path.join(outputDir, 'handoff.validation.json')
  const snapshotOutput = path.join(outputDir, 'handoff.snapshot.json')

  const validation = await validateManifest({
    '--manifest-dir': manifestDir,
    '--reject-partial': args['--reject-partial'],
    '--sign': args['--sign']
  })

  await fs.writeFile(validationOutput, `${stableJson(validation)}\n`, 'utf8')

  if (!validation.valid) {
    console.error('handoff aborted: validation failed')
    for (const error of validation.errors) {
      console.error(` - ${error}`)
    }
    if (validation.rejectPartialEnabled && validation.warnings.length > 0) {
      console.error(' - blocking warnings enabled by --reject-partial')
      for (const warning of validation.warnings) {
        console.error(`   ! ${warning}`)
      }
    }
    return {
      outputDir,
      validationOutput,
      snapshotOutput,
      validation,
      snapshot: null,
      success: false
    }
  }

  const snapshot = await dumpManifestSnapshot({
    manifestDir,
    signEnabled: Boolean(args['--sign']),
    signingKey: args['--key'] || process.env.COQPI_CONTEXT_PACK_SIGNING_KEY,
    keyId: args['--key-id']
  })

  await fs.writeFile(snapshotOutput, `${stableJson(snapshot)}\n`, 'utf8')

  console.log(validationOutput)
  console.log(snapshotOutput)

  return {
    outputDir,
    validationOutput,
    snapshotOutput,
    validation,
    snapshot,
    success: true
  }
}

module.exports = {
  run,
  formatTimestampDir,
  buildHandoffFolder
}

if (require.main === module) {
  run()
    .then((result) => {
      if (result && result.success === false) {
        process.exitCode = 1
      }
    })
    .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
