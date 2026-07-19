// POST /api/login  { password } -> sets the session cookie.
// DELETE /api/login -> signs out.

const {
  SITE_PASSWORD, MAX_AGE_S, COOKIE_NAME,
  configError, safeEqual, makeToken, setSessionCookie, readJsonBody,
} = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'DELETE') {
    setSessionCookie(res, '', 0);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const err = configError();
  if (err) return res.status(503).json({ error: err });

  const body = await readJsonBody(req);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) return res.status(400).json({ error: 'Enter the password.' });

  if (!safeEqual(password, SITE_PASSWORD)) {
    // Small delay to blunt trivial online guessing.
    await new Promise(r => setTimeout(r, 400));
    return res.status(401).json({ error: 'Wrong password.' });
  }

  setSessionCookie(res, makeToken(), MAX_AGE_S);
  return res.status(200).json({ ok: true });
};
