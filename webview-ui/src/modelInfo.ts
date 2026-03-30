const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-opus-4-6": 200000,
  "claude-sonnet-4-6": 200000,
  "claude-haiku-4-5": 200000,
  "gpt-5.4": 200000,
  "gpt-5.4-mini": 200000,
  "gpt-5.3": 200000,
  "gpt-5.3-mini": 200000,
  "default": 200000,
}

export function getContextLimit(model?: string): number {
  if (!model) return MODEL_CONTEXT_LIMITS.default

  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (key !== 'default' && model.includes(key)) {
      return limit
    }
  }

  return MODEL_CONTEXT_LIMITS.default
}

export function getModelShortName(model?: string): string | null {
  if (!model) return null

  const normalized = model.toLowerCase()
  if (normalized.includes('opus')) return 'opus'
  if (normalized.includes('sonnet')) return 'sonnet'
  if (normalized.includes('haiku')) return 'haiku'

  const gptMatch = normalized.match(/gpt-\d+(?:\.\d+)?(?:-mini)?/)
  if (gptMatch) return gptMatch[0]

  const oSeriesMatch = normalized.match(/\bo\d(?:-mini)?\b/)
  if (oSeriesMatch) return oSeriesMatch[0]

  return normalized.slice(0, 10)
}
