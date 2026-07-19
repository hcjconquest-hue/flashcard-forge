// Probe endpoint. The frontend uses this to tell "running on Vercel with a
// backend" apart from "running on GitHub Pages", where /api/* does not exist.
// The `app` marker matters: a 404 page or an index.html fallback can still
// return 200, so the client checks content-type AND this string.

const { isAuthed, configError } = require('./_lib');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    app: 'flashcard-forge',
    api: 1,
    authed: isAuthed(req),
    configured: !configError(),
  });
};
