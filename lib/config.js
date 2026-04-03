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
 * Get the current LLM API key used by OpenClaw
 */
export function getOpenClawApiKey() {
  const profile = getActiveOpenClawProfile();
  return profile ? profile.apiKey : null;
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
