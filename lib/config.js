// lib/config.js - Configuration Management

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Read LLM API settings from OpenClaw configuration
 */
export function getOpenClawConfig() {
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config;
  } catch (e) {
    return null;
  }
}

/**
 * Get active profile from OpenClaw
 */
export function getActiveOpenClawProfile() {
  const config = getOpenClawConfig();
  if (!config || !config.auth?.profiles) return null;

  // Try to find the first profile with an API key
  for (const profile of Object.values(config.auth.profiles)) {
    if (profile.apiKey) return profile;
  }
  return null;
}

/**
 * Get provider settings from OpenClaw
 */
export function getOpenClawProvider(providerName) {
  const config = getOpenClawConfig();
  if (!config || !config.models?.providers) return null;
  return config.models.providers[providerName] || null;
}

/**
 * Get the current model used by OpenClaw
 */
export function getOpenClawModel() {
  const config = getOpenClawConfig();
  if (!config) return null;

  if (config.agents?.defaults?.model) {
    return config.agents.defaults.model;
  }

  return null;
}

/**
 * Get the current LLM API key used by OpenClaw
 */
export function getOpenClawApiKey() {
  const profile = getActiveOpenClawProfile();
  return profile ? profile.apiKey : null;
}

/**
 * Determine API type and configuration dynamically from Options, Environment, or OpenClaw
 * @param {Object} overrides - Direct overrides from CLI (--api-key, --base-url, etc.)
 */
export function resolveLLMConfig(overrides = {}) {
  const config = getOpenClawConfig();
  
  let defaultModel = getOpenClawModel();
  
  // Handle case where defaultModel is an object (with primary/fallbacks)
  if (defaultModel && typeof defaultModel === 'object' && defaultModel.primary) {
    defaultModel = defaultModel.primary;
  }

  // Priority 1: CLI Override | Priority 2: Env Var | Priority 3: OpenClaw Default
  const modelStr = overrides.model || process.env.OPENAI_MODEL || (typeof defaultModel === 'string' ? defaultModel : 'gpt-4o');

  // Split "provider/model" format (e.g., "anthropic/claude-3-5-sonnet")
  const parts = modelStr.split('/');
  const providerName = parts.length > 1 ? parts[0] : 'openai';
  const modelId = parts.length > 1 ? parts[1] : parts[0];

  // Get Provider Settings from OpenClaw
  const providerSettings = getOpenClawProvider(providerName);
  
  // Resolve API Key
  let apiKey = overrides.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey && config?.auth?.profiles) {
    // Try finding profile by provider name first
    for (const profile of Object.values(config.auth.profiles)) {
      if (profile.provider === providerName && profile.apiKey) {
        apiKey = profile.apiKey;
        break;
      }
    }
    // Fallback: Use any available key
    if (!apiKey) {
      for (const profile of Object.values(config.auth.profiles)) {
        if (profile.apiKey) {
          apiKey = profile.apiKey;
          break;
        }
      }
    }
  }

  // Resolve Base URL and API Type
  let apiType = overrides.apiType || process.env.OPENAI_API_TYPE || 'openai';
  let baseURL = overrides.baseUrl || process.env.OPENAI_BASE_URL || providerSettings?.baseURL || 'https://api.openai.com/v1';

  // Protocol logic
  if (apiType === 'openai' && (providerName === 'anthropic' || providerName.includes('claude') || providerName.includes('minimax'))) {
    apiType = 'anthropic';
  }
  
  // Anthropic Default URL if not provided
  if (!overrides.baseUrl && !process.env.OPENAI_BASE_URL && apiType === 'anthropic' && !providerSettings?.baseURL) {
    baseURL = 'https://api.anthropic.com/v1';
  }

  return {
    providerName,
    modelId,
    apiKey,
    baseURL,
    apiType
  };
}

/**
 * Expand ~ to home directory
 */
export function expandHome(p) {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export const DEFAULT_CONFIG = {
  wikiPath: '~/Obsidian/Xknow-Wiki',
  rawPath: '~/Obsidian/Xknow-Wiki/raw',
  llmProvider: 'auto',
  llmModel: 'auto'
};
