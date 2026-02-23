const axios = require('axios');
const { getDb } = require('../database');

function getSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  db.close();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

const SYSTEM_PROMPT = `You are the PSB Properties Maintenance Assistant, a helpful and professional AI that assists tenants in Durham with property maintenance issues.

ROLE:
- You help tenants identify, diagnose, and potentially fix common property maintenance issues
- You are warm, professional, and patient
- You represent PSB Properties (FFR Group) and 52 Old Elvet property management

GUIDELINES:
1. IDENTIFICATION: First establish who the tenant is, which property they live in, and their flat number if not already known.
2. DIAGNOSIS: Ask clear, targeted questions to understand the issue. If photos are provided, analyse them carefully.
3. TRIAGE: Categorise the issue (plumbing, electrical, heating, appliance, structural, pest, damp/mould, locks/security, other).
4. SOLUTIONS: Search for and suggest practical fixes the tenant can safely attempt themselves. Include step-by-step instructions.
5. SAFETY: NEVER suggest fixes for gas leaks, electrical hazards, structural damage, or anything that could endanger the tenant. For these, immediately escalate.
6. ESCALATION: If the issue cannot be resolved after 2-3 attempts at guidance, or if it requires professional intervention, let the tenant know you will escalate to the maintenance team.

TONE:
- Professional but friendly and approachable
- Clear and concise
- Patient with follow-up questions
- Never rude, dismissive, or condescending
- Never make up information or hallucinate fixes
- If unsure, say so honestly

RESPONSE FORMAT:
- Keep messages concise (WhatsApp-friendly, not essay-length)
- Use simple language
- Break complex instructions into numbered steps
- Suggest specific products, model numbers, or video guides when helpful

SAFETY GUARDRAILS:
- Never provide advice that could cause injury
- Never suggest tenants attempt gas, major electrical, or structural repairs
- Always recommend calling 999 for emergencies (fire, gas smell, flooding)
- Never share other tenants' information
- Never make promises about timescales for repairs
- Never provide legal advice about tenancy agreements`;

async function callLLM(messages, options = {}) {
  const settings = getSettings();
  const provider = settings.llm_provider || 'anthropic';

  if (provider === 'anthropic') {
    return callAnthropic(messages, settings, options);
  } else {
    return callOpenAI(messages, settings, options);
  }
}

async function callAnthropic(messages, settings, options = {}) {
  const apiKey = settings.anthropic_api_key;
  if (!apiKey) throw new Error('Anthropic API key not configured');

  const anthropicMessages = messages.map(m => ({
    role: m.role === 'system' ? 'user' : m.role,
    content: m.content
  })).filter(m => m.role !== 'system');

  const body = {
    model: options.model || 'claude-sonnet-4-20250514',
    max_tokens: options.maxTokens || 1024,
    system: SYSTEM_PROMPT + (options.additionalContext || ''),
    messages: anthropicMessages
  };

  const response = await axios.post('https://api.anthropic.com/v1/messages', body, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  });

  return response.data.content[0].text;
}

async function callOpenAI(messages, settings, options = {}) {
  const apiKey = settings.openai_api_key;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const openaiMessages = [
    { role: 'system', content: SYSTEM_PROMPT + (options.additionalContext || '') },
    ...messages
  ];

  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: options.model || 'gpt-4o',
    messages: openaiMessages,
    max_tokens: options.maxTokens || 1024,
    temperature: 0.7
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data.choices[0].message.content;
}

async function analyseImage(imageBase64, mimeType, context = '') {
  const settings = getSettings();
  const provider = settings.llm_provider || 'anthropic';

  const imagePrompt = `Analyse this image of a property maintenance issue. Describe what you see in detail, identify the likely problem, assess its severity (low/medium/high/urgent), and suggest a category (plumbing, electrical, heating, appliance, structural, pest, damp_mould, locks_security, other). ${context ? 'Additional context from tenant: ' + context : ''}

Respond in JSON format:
{
  "description": "what you see in the image",
  "likely_issue": "diagnosed problem",
  "severity": "low|medium|high|urgent",
  "category": "category",
  "immediate_action": "any immediate steps needed",
  "can_self_fix": true/false,
  "safety_concern": true/false
}`;

  if (provider === 'anthropic') {
    const apiKey = settings.anthropic_api_key;
    if (!apiKey) throw new Error('Anthropic API key not configured');

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: imagePrompt }
        ]
      }]
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    return response.data.content[0].text;
  } else {
    const apiKey = settings.openai_api_key;
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          { type: 'text', text: imagePrompt }
        ]
      }],
      max_tokens: 1024
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  }
}

async function searchForFixes(issueDescription, applianceModel = '') {
  // This uses the LLM to generate search-worthy queries and structured fix suggestions
  const settings = getSettings();
  const searchPrompt = `Based on this property maintenance issue, suggest practical fixes and resources:

Issue: ${issueDescription}
${applianceModel ? 'Appliance model: ' + applianceModel : ''}

Provide your response in JSON format:
{
  "suggested_fixes": [
    {
      "step": 1,
      "instruction": "clear step-by-step instruction",
      "difficulty": "easy|medium|hard",
      "tools_needed": ["list of tools"]
    }
  ],
  "youtube_search_query": "suggested YouTube search query for this fix",
  "safety_warnings": ["any safety warnings"],
  "when_to_call_professional": "guidance on when professional help is needed",
  "estimated_difficulty": "easy|medium|hard",
  "estimated_time": "time estimate"
}`;

  const result = await callLLM([
    { role: 'user', content: searchPrompt }
  ], { additionalContext: '\nRespond ONLY with valid JSON, no markdown formatting.' });

  return result;
}

module.exports = { callLLM, analyseImage, searchForFixes, getSettings, SYSTEM_PROMPT };
