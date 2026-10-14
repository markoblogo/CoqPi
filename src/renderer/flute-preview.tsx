import type { ComponentProps } from 'react'
import { ProjectPreview } from '@webprodigies/flute/preview'
import './flute-promo.css'

// This fixture contains no main-process bridge, accounts, audio or provider calls.
const unsupported = () => { throw new Error('External actions are disabled in the Flute demonstration') }
const denied = new Proxy(unsupported, { get: () => denied })
const bridge = new Proxy({ trainingSessions: { get: async () => ({ sessions: [] }) } }, {
  get: (target, key) => key === 'trainingSessions' ? target.trainingSessions : denied
})
Object.defineProperty(window, 'coqpi', { value: bridge as unknown as Window['coqpi'], configurable: true })

const sceneModules = import.meta.glob('/src/flute/scenes/*.{scene.json,tsx}')
export function CoqPiFlutePreview(props: Omit<ComponentProps<typeof ProjectPreview>, 'sceneModules' | 'projectId' | 'enabled' | 'active' | 'hot'>) {
  return <ProjectPreview {...props} projectId="b49722d7-0c33-415b-aa5d-fb327bec6837" enabled={import.meta.env.DEV}
    active sceneModules={sceneModules} hot={import.meta.hot} />
}
