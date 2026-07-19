// GET  /api/bank -> { cards, updatedAt }
// PUT  /api/bank  { cards } -> { updatedAt }
//
// One shared bank for the whole site (single-user, many devices). Writes are
// last-write-wins; the client is responsible for not PUTting a stale bank
// before it has completed its first GET.

const { requireAuth, loadBank, saveBank, readJsonBody } = require('./_lib');

const MAX_CARDS = 5000;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const bank = await loadBank();
      return res.status(200).json(bank);
    }

    if (req.method === 'PUT') {
      const body = await readJsonBody(req);
      if (!body || !Array.isArray(body.cards)) {
        return res.status(400).json({ error: 'Expected { cards: [...] }.' });
      }
      if (body.cards.length > MAX_CARDS) {
        return res.status(413).json({ error: `Too many cards (limit ${MAX_CARDS}).` });
      }
      const saved = await saveBank({ cards: body.cards });
      return res.status(200).json({ updatedAt: saved.updatedAt, count: saved.cards.length });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    console.error('bank error:', e);
    return res.status(500).json({ error: 'Storage error. Try again.' });
  }
};
