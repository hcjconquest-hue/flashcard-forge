// POST /api/generate -> { category, flashcards: [{front, back}] }
//
// Server-side proxy to the Anthropic API so the key lives in an env var
// instead of every browser. Requires a signed-in session.

const { requireAuth, readJsonBody } = require('./_lib');

// Opus can take a while for 20 cards; the Hobby default of 10s is not enough.
module.exports.config = { maxDuration: 60 };

const ALLOWED_MODELS = new Set([
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5-20251001',
]);
const DEFAULT_MODEL = 'claude-opus-4-8';

const SYS = 'You are a study-aid generator. Create clear, accurate flashcards with a concise question on the '
  + 'front and a complete but focused answer on the back. Vary the angle across cards (definitions, causes, '
  + 'examples, comparisons, significance) so they cover the topic well. Also assign a "category": a broad '
  + 'subject area the topic belongs to (e.g. topic "Robert Nozick" -> category "Libertarianism"). Reuse an '
  + 'existing category name exactly when the topic fits one. Never duplicate or closely paraphrase questions '
  + 'the user says already exist.';

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['category', 'flashcards'],
  properties: {
    category: { type: 'string' },
    flashcards: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['front', 'back'],
        properties: { front: { type: 'string' }, back: { type: 'string' } },
      },
    },
  },
};

function buildUserMessage({ topic, count, forcedCategory, categories, existingFronts }) {
  let user = `Generate exactly ${count} flashcards about: ${topic}\n\n`;
  if (forcedCategory) {
    user += `These belong to the existing category "${forcedCategory}". Set "category" to exactly "${forcedCategory}".\n\n`;
  } else if (categories.length) {
    user += `Existing categories: ${categories.join(', ')}.\n`
      + `If this topic clearly fits one of them, set "category" to that exact name. Otherwise create a concise new broad category name.\n\n`;
  } else {
    user += `Set "category" to a concise broad subject area this topic belongs to.\n\n`;
  }
  if (existingFronts.length) {
    user += `Do NOT duplicate or closely paraphrase these existing questions:\n- ${existingFronts.join('\n- ')}\n`;
  }
  return user;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireAuth(req, res)) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' });

  const body = await readJsonBody(req);
  const topic = String(body.topic || '').trim();
  if (!topic) return res.status(400).json({ error: 'Enter a topic.' });
  if (topic.length > 300) return res.status(400).json({ error: 'That topic is too long.' });

  const count = Math.max(1, Math.min(20, parseInt(body.count, 10) || 5));
  const forcedCategory = body.forcedCategory ? String(body.forcedCategory) : null;
  const categories = Array.isArray(body.categories) ? body.categories.map(String).slice(0, 60) : [];
  const existingFronts = Array.isArray(body.existingFronts) ? body.existingFronts.map(String).slice(0, 60) : [];
  const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3200,
        system: SYS,
        messages: [{ role: 'user', content: buildUserMessage({ topic, count, forcedCategory, categories, existingFronts }) }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = (data.error && data.error.message) || ('Upstream HTTP ' + upstream.status);
      // Don't leak key/account details to the browser.
      console.error('anthropic error:', upstream.status, msg);
      const safe = upstream.status === 401 ? 'The server API key was rejected.'
        : upstream.status === 429 ? 'Rate limited — wait a moment and try again.'
        : 'Card generation failed. Try again.';
      return res.status(502).json({ error: safe });
    }
    if (data.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'The model declined this topic. Try another.' });
    }

    const tb = (data.content || []).find(b => b.type === 'text');
    if (!tb) return res.status(502).json({ error: 'No content returned.' });

    let parsed;
    try { parsed = JSON.parse(tb.text); }
    catch { return res.status(502).json({ error: 'Could not parse the generated cards.' }); }

    const flashcards = (parsed.flashcards || []).filter(c => c && c.front && c.back);
    if (!flashcards.length) return res.status(502).json({ error: 'No cards were produced.' });

    return res.status(200).json({ category: parsed.category || 'General', flashcards });
  } catch (e) {
    console.error('generate error:', e);
    return res.status(500).json({ error: 'Card generation failed. Try again.' });
  }
};
