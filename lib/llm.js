// lib/llm.js - Multi-Provider LLM API Wrapper

import { resolveLLMConfig } from './config.js';

/**
 * Robustly extract content from various LLM response formats
 * @param {Object} data - The raw response data from the API
 * @param {string} apiType - 'openai' or 'anthropic'
 */
function robustExtractContent(data, apiType) {
  if (!data) return '';

  if (apiType === 'anthropic') {
    // Anthropic /messages format
    if (Array.isArray(data.content)) {
      return data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
    }
    // Fallback for unexpected shapes
    if (typeof data.content === 'string') return data.content;
    return data.content?.[0]?.text || '';
  } else {
    // OpenAI /chat/completions format
    const choice = data.choices?.[0];
    if (!choice) return '';

    // Standard content
    if (choice.message?.content) return choice.message.content;

    // Reasoning content (DeepSeek R1, MiniMax, etc.)
    if (choice.message?.reasoning_content) return choice.message.reasoning_content;
    
    // Some providers might nest it differently or use legacy fields
    if (typeof choice.text === 'string') return choice.text;

    return '';
  }
}

/**
 * Sleep helper for retries
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Call LLM via generic REST API with Retry Logic
 * @param {Array} messages - Message list
 * @param {Object} options - Options including model, temperature, max_tokens, and LLM config overrides
 */
export async function callLLM(messages, options = {}, retries = 3) {
  const llm = resolveLLMConfig({
    model: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    apiType: options.apiType
  });
  
  const apiKey = llm.apiKey;
  const baseURL = llm.baseURL;
  const apiType = llm.apiType;
  const model = llm.modelId;

  if (!apiKey) {
    throw new Error('API Key not found. Please ensure OpenClaw is configured or set OPENAI_API_KEY.');
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  const isAnthropic = apiType === 'anthropic';
  const endpoint = isAnthropic ? 'messages' : 'chat/completions';
  const url = `${baseURL.replace(/\/+$/, '')}/${endpoint}`;

  if (isAnthropic) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = isAnthropic ? {
    model,
    system: messages.find(m => m.role === 'system')?.content || '',
    messages: messages.filter(m => m.role !== 'system'),
    max_tokens: options.max_tokens || 4096,
    temperature: options.temperature ?? 0.7
  } : {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle Rate Limits (429) or Overloaded (503) with Retry
      if ((response.status === 429 || response.status === 503) && retries > 0) {
        const delay = (4 - retries) * 2000; // Exponential-ish backoff
        await sleep(delay);
        return callLLM(messages, options, retries - 1);
      }

      throw new Error(`${apiType.toUpperCase()} API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return robustExtractContent(data, apiType);

  } catch (error) {
    if (retries > 0 && (error.name === 'AbortError' || error.name === 'TypeError')) {
      await sleep(1000);
      return callLLM(messages, options, retries - 1);
    }
    throw error;
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
