import { auth } from './firebase';
import { AISettings, loadAISettings } from './aiSettings';

export async function buildAIRequestHeaders(settings: AISettings): Promise<Record<string, string>> {
  if (!settings.apiKey.trim()) {
    throw new Error('No AI API key is configured. Open Settings → AI / BYOK first.');
  }
  if (!settings.model.trim()) {
    throw new Error('An AI model name is required.');
  }
  if (settings.provider === 'custom' && !settings.baseUrl.trim()) {
    throw new Error('A base URL is required for a custom AI provider.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Your session expired. Sign in again.');
  }

  const idToken = await currentUser.getIdToken();

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
    'X-ThinkTime-AI-Provider': settings.provider,
    'X-ThinkTime-AI-Key': settings.apiKey.trim(),
    'X-ThinkTime-AI-Model': settings.model.trim(),
    ...(settings.baseUrl.trim() ? { 'X-ThinkTime-AI-Base-Url': settings.baseUrl.trim() } : {}),
  };
}

export async function getSavedAIRequestHeaders(userId: string): Promise<Record<string, string>> {
  return buildAIRequestHeaders(loadAISettings(userId));
}
