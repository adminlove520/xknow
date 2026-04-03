// lib/llm.js - Multi-Provider LLM API Wrapper

import { resolveLLMConfig } from './config.js';

/**
 * Call LLM via generic REST API
 * @param {Array} messages - Message list
 * @param {Object} options - Options including model, temperature, max_tokens, and LLM config overrides
 */
export async function callLLM(messages, options = {}) {
  // Pass overrides if they exist in options
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

    const response = await fetch(`${baseURL.replace(/\/+$/, '')}/messages`, {
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

    const response = await fetch(`${baseURL.replace(/\/+$/, '')}/chat/completions`, {
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
