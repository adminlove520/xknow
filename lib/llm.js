// lib/llm.js - Multi-Provider LLM API Wrapper

import { getOpenClawConfig, getOpenClawModel, getOpenClawProvider } from './config.js';

/**
 * Determine API type and configuration dynamically from OpenClaw settings
 */
function resolveOpenClawLLM() {
  const config = getOpenClawConfig();
  if (!config) return null;

  const defaultModel = getOpenClawModel();
  if (!defaultModel) return null;

  // Split "provider/model" format (e.g., "anthropic/claude-3-5-sonnet")
  const parts = defaultModel.split('/');
  const providerName = parts.length > 1 ? parts[0] : 'openai';
  const modelId = parts.length > 1 ? parts[1] : parts[0];

  // Get Provider Settings from OpenClaw
  const providerSettings = getOpenClawProvider(providerName);
  
  // Get API Key for this specific provider if possible, otherwise use any active key
  let apiKey = null;
  if (config.auth?.profiles) {
    // Try finding profile by provider name first
    for (const profile of Object.values(config.auth.profiles)) {
      if (profile.provider === providerName && profile.apiKey) {
        apiKey = profile.apiKey;
        break;
      }
    }
    // Fallback: Use the first available API key
    if (!apiKey) {
      for (const profile of Object.values(config.auth.profiles)) {
        if (profile.apiKey) {
          apiKey = profile.apiKey;
          break;
        }
      }
    }
  }

  if (!apiKey) return null;

  // Resolve API type and base URL
  let apiType = 'openai'; // default
  let baseURL = providerSettings?.baseURL || 'https://api.openai.com/v1';

  if (providerName === 'anthropic' || providerName.includes('claude')) {
    apiType = 'anthropic';
    baseURL = providerSettings?.baseURL || 'https://api.anthropic.com/v1';
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
 * Call LLM via generic REST API
 */
export async function callLLM(messages, options = {}) {
  const llm = resolveOpenClawLLM();
  
  // Local environment variables override OpenClaw
  const apiKey = process.env.OPENAI_API_KEY || llm?.apiKey;
  const baseURL = process.env.OPENAI_BASE_URL || llm?.baseURL || 'https://api.openai.com/v1';
  const apiType = llm?.apiType || 'openai';
  const model = options.model || llm?.modelId || 'gpt-4o';

  if (!apiKey) {
    throw new Error('API Key not found. Please ensure OpenClaw is configured or set OPENAI_API_KEY.');
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiType === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01'; // Common for Anthropic
    
    // Convert OpenAI-style system role to Anthropic top-level system parameter
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages.filter(m => m.role !== 'system');

    const body = {
      model,
      system: systemMessage,
      messages: chatMessages,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature ?? 0.7
    };

    const response = await fetch(`${baseURL}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.content[0].text;

  } else {
    // OpenAI-compatible Chat Completions
    headers['Authorization'] = `Bearer ${apiKey}`;

    const body = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens
    };

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

/**
 * System Prompt Templates
 */
export const PROMPTS = {
  COMPILE_REFERENCE: `You are a Librarian. Your goal is to create a "Reference" article for a specific source.
1. Provide a concise executive summary.
2. Extract key facts, definitions, and data.
3. List all significant entities (people, tools, concepts).
4. Create [[Wikilinks]] for any concept that deserves its own article.
Output ONLY markdown.`,

  COMPILE_CONCEPT: `You are a Knowledge Architect. Your goal is to synthesize multiple sources into a "Concept" article.
1. Explain the concept's core theory and significance.
2. Synthesize insights from the provided source snippets.
3. Compare different viewpoints if they exist.
4. Use Mermaid diagrams for architecture or workflows if appropriate.
5. Provide a "See Also" section with [[Wikilinks]].
Output ONLY markdown.`,

  QUERY: `You are an expert for the Xknow Knowledge Base. 
Answer the user's question based on the provided wiki content.
Formatting rules:
- Default: Use standard Markdown.
- If requested 'slides': Use Marp (Markdown Presentation Ecosystem) format with '---' separators.
- If requested 'mermaid': Focus on generating a Mermaid diagram.
- Always cite the source files using [Source: filename.md].
Be insightful and professional.`,

  LINT: `You are a Knowledge Librarian. Analyze the provided Wiki Index and content snippets.
Identify:
1. Gaps: What related topics are missing? (Suggest specific web search queries).
2. Redundancy: Which articles should be merged into a "Concept" article?
3. Dead ends: Articles without outgoing [[Wikilinks]].
4. Suggest 3 specific "Next Steps" for the user to improve the KB.
Output in structured Markdown.`
};
