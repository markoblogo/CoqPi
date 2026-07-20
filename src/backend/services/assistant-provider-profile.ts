import {
  PatterLikeAssistantProfile,
  PatterLikeProviderKind,
  PatterLikeProviderProfile
} from '../../shared/app-types'

const DEFAULT_PROFILE_ORDER = `${PatterLikeProviderKind.OpenAI}:0,${PatterLikeProviderKind.Ollama}:50`
const DEFAULT_FALLBACK_MODE = 'ordered'

const normalize = (value: string | undefined): string =>
  (value || '').trim().toLowerCase()

const parseProfileToken = (
  token: string,
  index: number
): PatterLikeProviderProfile => {
  const [kindRaw, priorityRaw] = token.split(':')
  if (!kindRaw) {
    return {
      provider: PatterLikeProviderKind.OpenAI,
      priority: index * 10,
      model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || 'gpt-4o-mini',
      enabled: false,
      isTextOnly: true,
      failoverEnabled: true
    }
  }

  const provider = normalize(kindRaw)
  const priority = Number.parseInt(priorityRaw || `${index * 10}`, 10)
  const safePriority = Number.isFinite(priority) ? priority : index * 10

  if (provider === PatterLikeProviderKind.OpenAI) {
    return {
      provider: PatterLikeProviderKind.OpenAI,
      priority: safePriority,
      model:
        process.env.OPENAI_ASSISTANT_MODEL?.trim() ||
        process.env.OPENAI_ASSISTANT_MODEL_BALANCED?.trim() ||
        'gpt-4o-mini',
      enabled: true,
      isTextOnly: true,
      failoverEnabled: true
    }
  }

  if (provider === PatterLikeProviderKind.Ollama) {
    return {
      provider: PatterLikeProviderKind.Ollama,
      priority: safePriority,
      model: process.env.OLLAMA_ASSISTANT_MODEL?.trim() || 'llama3.1',
      baseUrl: process.env.OLLAMA_BASE_URL?.trim(),
      enabled: !!(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_BASE_URL.trim()),
      isTextOnly: true,
      failoverEnabled: true
    }
  }

  return {
    provider: PatterLikeProviderKind.OpenAI,
    priority: safePriority,
    model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || 'gpt-4o-mini',
    enabled: false,
    isTextOnly: true,
    failoverEnabled: true
  }
}

export const resolveAssistantProviderProfile = (): PatterLikeAssistantProfile => {
  const raw =
    process.env.COQPI_ASSISTANT_PROVIDER_PROFILE?.trim() || DEFAULT_PROFILE_ORDER

  const profiles = raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token, index) => parseProfileToken(token, index))
    .sort((a, b) => a.priority - b.priority)

  return {
    profiles,
    fallbackMode:
      process.env.COQPI_ASSISTANT_FAILOVER_MODE === 'none'
        ? 'none'
        : DEFAULT_FALLBACK_MODE
  }
}

export const getOrderedEnabledProviderProfiles = (): PatterLikeProviderProfile[] => {
  const profile = resolveAssistantProviderProfile()

  const enabled = profile.profiles.filter(
    (entry) => entry.failoverEnabled && entry.enabled
  )

  if (enabled.length > 0) {
    return profile.fallbackMode === 'none' ? [enabled[0]] : enabled
  }

  return profile.fallbackMode === 'none'
    ? [
        {
          provider: PatterLikeProviderKind.OpenAI,
          priority: 0,
          model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || 'gpt-4o-mini',
          enabled: true,
          isTextOnly: true,
          failoverEnabled: true
        }
      ]
    : [
        {
          provider: PatterLikeProviderKind.OpenAI,
          priority: 0,
          model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || 'gpt-4o-mini',
          enabled: true,
          isTextOnly: true,
          failoverEnabled: true
        },
        {
          provider: PatterLikeProviderKind.Ollama,
          priority: 50,
          model: process.env.OLLAMA_ASSISTANT_MODEL?.trim() || 'llama3.1',
          baseUrl: process.env.OLLAMA_BASE_URL?.trim(),
          enabled: !!(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_BASE_URL.trim()),
          isTextOnly: true,
          failoverEnabled: true
        }
      ]
}

export const getPrimaryOpenAIProviderProfile = (): PatterLikeProviderProfile => {
  const profile = resolveAssistantProviderProfile()
  const openAIProfile = profile.profiles.find((entry) => entry.provider === PatterLikeProviderKind.OpenAI)

  return (
    openAIProfile ||
    profile.profiles[0] || {
      provider: PatterLikeProviderKind.OpenAI,
      priority: 0,
      model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || 'gpt-4o-mini',
      enabled: true,
      isTextOnly: true,
      failoverEnabled: true
    }
  )
}
