export type AIProvider = 'gemini' | 'openai' | 'openrouter' | 'anthropic' | 'custom';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  rememberKey: boolean;
}

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  custom: 'Custom OpenAI-compatible',
};

export const AI_DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-5.6-luna',
  openrouter: 'google/gemini-3.8-flash',
  anthropic: 'claude-sonnet-5',
  custom: '',
};

const configKey = (userId: string) => `thinktime:ai-config:v1:${userId}`;
const sessionKey = (userId: string) => `thinktime:ai-session-key:v1:${userId}`;

export function getDefaultAISettings(): AISettings {
  return {
    provider: 'gemini',
    apiKey: '',
    model: AI_DEFAULT_MODELS.gemini,
    baseUrl: '',
    rememberKey: false,
  };
}

export function loadAISettings(userId: string): AISettings {
  const fallback = getDefaultAISettings();

  try {
    const stored = localStorage.getItem(configKey(userId));
    const parsed = stored ? JSON.parse(stored) as Partial<AISettings> : {};
    const provider = isAIProvider(parsed.provider) ? parsed.provider : fallback.provider;
    const rememberKey = parsed.rememberKey === true;
    const sessionApiKey = sessionStorage.getItem(sessionKey(userId)) || '';

    return {
      provider,
      apiKey: rememberKey ? String(parsed.apiKey || '') : sessionApiKey,
      model: String(parsed.model || AI_DEFAULT_MODELS[provider] || ''),
      baseUrl: String(parsed.baseUrl || ''),
      rememberKey,
    };
  } catch {
    return fallback;
  }
}

export function saveAISettings(userId: string, settings: AISettings) {
  const normalized: AISettings = {
    provider: settings.provider,
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
    baseUrl: settings.baseUrl.trim(),
    rememberKey: settings.rememberKey,
  };

  const persisted = {
    ...normalized,
    apiKey: normalized.rememberKey ? normalized.apiKey : '',
  };

  localStorage.setItem(configKey(userId), JSON.stringify(persisted));

  if (normalized.rememberKey) {
    sessionStorage.removeItem(sessionKey(userId));
  } else if (normalized.apiKey) {
    sessionStorage.setItem(sessionKey(userId), normalized.apiKey);
  } else {
    sessionStorage.removeItem(sessionKey(userId));
  }
}

export function clearAISettings(userId: string) {
  localStorage.removeItem(configKey(userId));
  sessionStorage.removeItem(sessionKey(userId));
}

export function isAIProvider(value: unknown): value is AIProvider {
  return value === 'gemini' || value === 'openai' || value === 'openrouter' || value === 'anthropic' || value === 'custom';
}
