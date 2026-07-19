# Flashcard Forge

A single-file flashcard app. Generate cards on any topic with Claude, sort them into
**Unsure / Nearly / Learned** piles, and revise by category.

**Live:** https://hcjconquest-hue.github.io/flashcard-forge/

## Using it

1. Open the live link on any device.
2. Go to **Settings** and paste an Anthropic API key (`sk-ant-…`).
3. Add a topic, pick a card count, and forge.

## Where your data lives

- **Cards** are stored in your browser's `localStorage`, per device. Your phone and your
  laptop each keep a separate bank — they do not sync.
- To move a bank between devices, use **Export bank (JSON)** on one and **Import** on the other.
- **Your API key** is also stored only in your own browser's `localStorage`. It is never
  committed to this repo and never sent anywhere except `api.anthropic.com`.

Clearing site data, or using a private/incognito window, wipes the bank. Export regularly if
you care about a deck.

## Development

The whole app is `index.html` — no build step, no dependencies, no server. Open the file
directly in a browser to work on it, then commit; GitHub Pages redeploys on push to `main`.
