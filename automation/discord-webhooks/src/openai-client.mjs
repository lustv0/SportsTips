function buildBaseUrl(baseUrl) {
  return String(baseUrl || 'https://api.openai.com/v1').endsWith('/')
    ? String(baseUrl || 'https://api.openai.com/v1')
    : `${String(baseUrl || 'https://api.openai.com/v1')}/`;
}

function extractRefusal(response) {
  for (const outputItem of response.output || []) {
    for (const contentItem of outputItem.content || []) {
      if (contentItem.type === 'refusal' && contentItem.refusal) {
        return contentItem.refusal;
      }
    }
  }

  return null;
}

function extractOutputText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  const chunks = [];

  for (const outputItem of response.output || []) {
    for (const contentItem of outputItem.content || []) {
      if (contentItem.type === 'output_text' && contentItem.text) {
        chunks.push(contentItem.text);
      }
    }
  }

  return chunks.join('').trim();
}

export async function createStructuredOpenAiResponse(openaiConfig, request) {
  if (!openaiConfig?.enabled) {
    throw new Error('OpenAI integration is disabled in config.openai.enabled.');
  }

  if (!openaiConfig.apiKey) {
    throw new Error(`Missing ${openaiConfig.apiKeyEnv}.`);
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(request.timeoutMs || openaiConfig.timeoutMs || 90000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const model = request.model || openaiConfig.model;

  try {
    const payload = {
      model,
      instructions: request.instructions,
      input: request.input,
      max_output_tokens: Number(request.maxOutputTokens || openaiConfig.maxOutputTokens || 5000),
      prompt_cache_key: request.promptCacheKey,
      metadata: request.metadata,
      reasoning: openaiConfig.reasoningEffort
        ? { effort: openaiConfig.reasoningEffort }
        : undefined,
      text: {
        format: {
          type: 'json_schema',
          name: request.schemaName,
          strict: true,
          schema: request.schema
        },
        verbosity: 'low'
      }
    };

    if (!/^gpt-5(?:[.-]|$)/iu.test(String(model || ''))) {
      const temperature = request.temperature ?? openaiConfig.temperature;
      if (temperature !== undefined && temperature !== null) {
        payload.temperature = Number(temperature);
      }
    }

    const response = await fetch(new URL('responses', buildBaseUrl(openaiConfig.baseUrl)), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI response failed (${response.status}): ${await response.text()}`);
    }

    const responsePayload = await response.json();

    if (responsePayload.error?.message) {
      throw new Error(responsePayload.error.message);
    }

    const refusal = extractRefusal(responsePayload);

    if (refusal) {
      return {
        refusal,
        parsed: null,
        response: responsePayload,
        usage: responsePayload.usage || null
      };
    }

    const outputText = extractOutputText(responsePayload);

    if (!outputText) {
      throw new Error('OpenAI returned no structured output text.');
    }

    return {
      refusal: null,
      parsed: JSON.parse(outputText),
        response: responsePayload,
        usage: responsePayload.usage || null
    };
  } finally {
    clearTimeout(timeout);
  }
}