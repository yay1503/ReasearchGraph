export const LLM_STORAGE_KEY = 'rg_llm_config';

export const PROVIDERS = {
  ollama: {
    id: 'ollama',
    label: 'Local Llama',
    shortLabel: 'Local Llama',
    defaultModel: 'llama3.2',
    requiresKey: false,
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    defaultModel: 'gemini-2.5-flash',
    requiresKey: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    requiresKey: true,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    shortLabel: 'Anthropic',
    defaultModel: 'claude-3-5-sonnet-latest',
    requiresKey: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    shortLabel: 'OpenRouter',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    requiresKey: true,
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

export function getLLMConfig() {
  try {
    const raw = localStorage.getItem(LLM_STORAGE_KEY);
    if (!raw) {
      return {
        provider: 'ollama',
        model: PROVIDERS.ollama.defaultModel,
        apiKey: '',
      };
    }
    const parsed = JSON.parse(raw);
    const provider = parsed?.provider && PROVIDERS[parsed.provider] ? parsed.provider : 'ollama';
    const fallbackModel = PROVIDERS[provider].defaultModel;
    const model =
      typeof parsed?.model === 'string' && parsed.model.trim()
        ? parsed.model.trim()
        : fallbackModel;
    const apiKey =
      typeof parsed?.apiKey === 'string'
        ? parsed.apiKey
        : typeof parsed?.api_key === 'string'
          ? parsed.api_key
          : '';
    return { provider, model, apiKey };
  } catch {
    return {
      provider: 'ollama',
      model: PROVIDERS.ollama.defaultModel,
      apiKey: '',
    };
  }
}

export function saveLLMConfig(config) {
  const provider = config?.provider && PROVIDERS[config.provider] ? config.provider : 'ollama';
  const fallbackModel = PROVIDERS[provider].defaultModel;
  const model =
    typeof config?.model === 'string' && config.model.trim()
      ? config.model.trim()
      : fallbackModel;
  const apiKey = PROVIDERS[provider].requiresKey && typeof config?.apiKey === 'string'
    ? config.apiKey.trim()
    : '';

  const normalized = { provider, model, apiKey };
  try {
    localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage errors
  }
  return normalized;
}

export function getLLMHeaders() {
  const cfg = getLLMConfig();
  return {
    'X-LLM-Provider': cfg.provider,
    'X-LLM-Model': cfg.model,
    'X-LLM-API-Key': cfg.apiKey || '',
  };
}
