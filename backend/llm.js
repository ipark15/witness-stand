import dotenv from 'dotenv';

dotenv.config();

const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

const config = {
  claude: {
    model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  gemini: {
    model: process.env.GEMINI_MODEL || 'gemma-4-26b-a4b-it',
    apiKey: process.env.GEMINI_API_KEY,
  },
};

let generateFn;

if (provider === 'claude') {
  if (!config.claude.apiKey) {
    throw new Error('ANTHROPIC_API_KEY must be set when LLM_PROVIDER=claude');
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.claude.apiKey });

  generateFn = async (prompt, { maxTokens = 300, temperature = 0.85 } = {}) => {
    const message = await client.messages.create({
      model: config.claude.model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });
    return message.content[0].text.trim();
  };
} else if (provider === 'gemini') {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY must be set when LLM_PROVIDER=gemini');
  }
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: config.gemini.apiKey });

  generateFn = async (prompt, { maxTokens = 300, temperature = 0.85 } = {}) => {
    const response = await client.models.generateContent({
      model: config.gemini.model,
      contents: prompt,
      config: { temperature, maxOutputTokens: maxTokens },
    });
    return (response.text || '').trim();
  };
} else {
  throw new Error(
    `Unsupported LLM_PROVIDER: "${provider}". Use "claude" or "gemini".`
  );
}

export const generate = generateFn;
export const providerName = provider;
export const modelName = config[provider].model;
