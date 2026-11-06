cat > README.md <<'EOF'
# Wordly Dictionary

A single page app for looking up English words. Search a word to see its pronunciation, audio, definitions, examples, synonyms and source links.

## Run it
Open `index.html` in a browser. No build step is needed.

## Features
- Search form with validation (empty input, invalid characters)
- Fetches data from the Free Dictionary API (https://dictionaryapi.dev)
- Error messages for words not found, network failures, server errors and timeouts
- Audio playback and fallback messages when audio or synonyms are missing
- Clickable synonyms, saved words (kept in localStorage) and a dark theme toggle

## Files
- `index.html` - page structure
- `style.css` - layout and themes
- `script.js` - fetching, rendering and events
EOF
git add README.md
git commit -m "Add README"
git push
