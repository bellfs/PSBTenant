const axios = require('axios');
const { getDb } = require('../database');

function getSettings() {
  try {
    const db = getDb(); const rows = db.prepare('SELECT key, value FROM settings').all(); db.close();
    const s = {}; for (const r of rows) s[r.key] = r.value; return s;
  } catch (err) { return {}; }
}

function resolveProvider(settings) {
  return process.env.LLM_PROVIDER || settings.llm_provider || 'openai';
}

function resolveApiKey(provider, settings) {
  if (provider === 'openai') {
    const k = process.env.OPENAI_API_KEY || settings.openai_api_key;
    return (k && k.length > 10) ? k : null;
  }
  const k = process.env.ANTHROPIC_API_KEY || settings.anthropic_api_key;
  return (k && k.length > 10) ? k : null;
}

function getProviderAndKey() {
  const settings = getSettings();
  let provider = resolveProvider(settings);
  let key = resolveApiKey(provider, settings);
  if (!key) {
    const fb = provider === 'openai' ? 'anthropic' : 'openai';
    const fk = resolveApiKey(fb, settings);
    if (fk) { provider = fb; key = fk; }
  }
  if (!key) throw new Error('No LLM API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in Railway env vars.');
  return { provider, key };
}

const SYSTEM_PROMPT = `You are the PSB Properties Maintenance Bot 🔧, a friendly and helpful AI assistant for student tenants in Durham.

YOUR AUDIENCE: 19-25 year old university students. Be warm, casual, and use emojis throughout your responses. Think of yourself as a knowledgeable mate who happens to know loads about property maintenance.

COMMUNICATION STYLE:
- Use emojis naturally throughout responses 🏠🔧💡🚿🔌
- Keep a friendly, approachable tone (not corporate or stiff)
- Use clear formatting with numbered steps
- Break down technical stuff into simple language
- Be encouraging ("you've totally got this!" / "easy fix!")
- Keep messages WhatsApp-friendly (concise, not essay-length)

CORE WORKFLOW:
1. IDENTIFY the issue clearly
2. DIAGNOSE using targeted questions
3. SUGGEST practical DIY fixes with step-by-step instructions
4. INCLUDE YouTube video search terms they can look up (format: "🎥 Search YouTube for: [specific search query]")
5. INCLUDE helpful tips from common forum solutions (format: "💬 Common fix from renters: [tip]")
6. ESTIMATE repair costs and time (format: "💰 Estimated cost: £X-£Y for materials" and "⏱️ Estimated time: X-Y hours")
7. ESCALATE if the fix is beyond DIY after 2-3 attempts

YOUTUBE & FORUM GUIDANCE:
- Always suggest specific YouTube search terms for the fix
- Reference common solutions from property/renter forums
- Mention specific product names or tools when relevant
- If it's a common student flat issue (mould, blocked drains, heating), mention this is super common

COST ESTIMATION:
- Always provide a rough cost estimate for materials if applicable
- Mention where to buy (B&Q, Screwfix, Amazon)
- If a professional is needed, estimate the callout cost range

STRUCTURED RESPONSE FORMAT (use for every diagnosis):
After identifying the issue, include this data in your response naturally:
- What the issue likely is
- Difficulty level (Easy/Medium/Hard)
- Estimated material cost in GBP
- Estimated repair time
- Whether it needs a professional

SAFETY GUARDRAILS:
- NEVER suggest fixes for gas leaks, electrical panel work, structural damage
- For these: immediately say "🚨 This needs a professional ASAP" and escalate
- Always recommend 999 for emergencies (fire, gas smell, flooding)
- Never share other tenants' info or make promises about timescales
- Never provide legal advice about tenancy agreements`;

async function callLLM(messages, options = {}) {
  const { provider, key } = getProviderAndKey();
  console.log(`[LLM] Using ${provider}`);
  return provider === 'anthropic' ? callAnthropic(messages, key, options) : callOpenAI(messages, key, options);
}

async function callAnthropic(messages, apiKey, options = {}) {
  const msgs = messages.map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })).filter(m => m.role !== 'system');
  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: options.model || 'claude-sonnet-4-20250514', max_tokens: options.maxTokens || 1024,
    system: SYSTEM_PROMPT + (options.additionalContext || ''), messages: msgs
  }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 30000 });
  return response.data.content[0].text;
}

async function callOpenAI(messages, apiKey, options = {}) {
  const sys = options.additionalContext ? SYSTEM_PROMPT + options.additionalContext : SYSTEM_PROMPT;
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: options.model || 'gpt-4o-mini', messages: [{ role: 'system', content: sys }, ...messages],
    max_tokens: options.maxTokens || 1024, temperature: 0.7
  }, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  return response.data.choices[0].message.content;
}

async function analyseImage(imageBase64, mimeType, context = '') {
  const { provider, key } = getProviderAndKey();
  const prompt = `Analyse this property maintenance image. ${context ? 'Tenant says: ' + context : ''}

Respond ONLY with JSON:
{"description":"what you see","likely_issue":"problem","severity":"low|medium|high|urgent","category":"plumbing|electrical|heating|appliance|structural|pest|damp_mould|locks_security|other","immediate_action":"steps needed","can_self_fix":true,"safety_concern":false,"estimated_cost_gbp":"10-30","estimated_hours":"0.5-1"}`;

  if (provider === 'anthropic') {
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514', max_tokens: 1024,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } }, { type: 'text', text: prompt }] }]
    }, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 30000 });
    return r.data.content[0].text;
  }
  const r = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini', max_tokens: 1024,
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }, { type: 'text', text: prompt }] }]
  }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  return r.data.choices[0].message.content;
}

async function estimateCosts(issueDescription, category) {
  const prompt = `You are a UK property maintenance cost estimator. Based on this issue, provide cost and time estimates.

Issue: ${issueDescription}
Category: ${category || 'unknown'}

Respond ONLY with JSON, no other text:
{"estimated_cost_min":0,"estimated_cost_max":0,"estimated_hours_min":0,"estimated_hours_max":0,"materials":["list","of","materials"],"needs_professional":false,"professional_cost_min":0,"professional_cost_max":0}

Use GBP. Be realistic for UK prices.`;

  try {
    const result = await callLLM([{ role: 'user', content: prompt }], { maxTokens: 300, additionalContext: '\nRespond ONLY with valid JSON.' });
    const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) return JSON.parse(cleaned.substring(start, end + 1));
  } catch (e) { console.error('[LLM] Cost estimation error:', e.message); }
  return null;
}

module.exports = { callLLM, analyseImage, estimateCosts, getSettings, SYSTEM_PROMPT };
