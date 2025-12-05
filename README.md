# RubikVault Landing Page

Static landing page for **rubikvault.com**, deployed via Cloudflare Pages.

- Dark themed, responsive layout
- Embedded TradingView widgets (ticker tape, mini chart, crypto heatmap, economic calendar)
- Daily narrative section ("RubikVault’s Daily Market Decode")
- Additional structure blocks:
  - "What you get here every day"
  - Market sentiment explainer
  - "How to use this dashboard"
  - Roadmap and social links (YouTube, X, TikTok, Instagram)
- Legal pages: Imprint, Privacy, Disclaimer
- No build step required (pure HTML + CSS + a tiny bit of JS)

## Structure

- `index.html` – main page layout
- `style.css` – styling for all sections and legal pages
- `script.js` – small helper script (footer year + smooth scrolling)
- `imprint.html` – minimal imprint / operator info
- `privacy.html` – compact privacy notice
- `disclaimer.html` – educational / no-advice disclaimer

## Development

The page is intentionally kept lightweight:

- No framework, no bundler
- All TradingView widgets are embedded via their official snippets
- No tracking libraries included by default

To work locally:

```bash
# simple example using Python
python -m http.server 8000
# then open http://localhost:8000 in your browser
