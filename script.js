"use strict";

const API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const WORD_PATTERN = /^[A-Za-z][A-Za-z' -]*$/;
const SAVED_KEY = "wordly:saved";
const THEME_KEY = "wordly:theme";
const REQUEST_TIMEOUT_MS = 10000;

const form = document.getElementById("search-form");
const input = document.getElementById("word-input");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const savedList = document.getElementById("saved-list");
const themeToggle = document.getElementById("theme-toggle");
const submitBtn = form.querySelector("button[type=submit]");

const cache = new Map();
let controller = null;
let savedWords = loadJSON(SAVED_KEY, []);

class LookupError extends Error {}


function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const unique = (list) => [...new Set(list.filter(Boolean))];
const isSaved = (word) => savedWords.includes(word.toLowerCase());

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = message ? `status status--${type}` : "status";
}


async function fetchEntries(word, signal) {
  const key = word.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const notFound = new LookupError(`No definitions found for “${word}”. Check the spelling or try another word.`);
  let response;
  try {
    response = await fetch(API_URL + encodeURIComponent(key), { signal });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new LookupError("Could not reach the dictionary. Check your connection and try again.");
  }
  if (response.status === 404) throw notFound;
  if (!response.ok) throw new LookupError(`The dictionary service returned an error (${response.status}). Try again in a moment.`);

  let data;
  try {
    data = await response.json();
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new LookupError("The dictionary sent an unreadable response.");
  }
  if (!Array.isArray(data) || data.length === 0) throw notFound;

  cache.set(key, data);
  return data;
}


function buildPronunciation(entries) {
  const phonetics = entries.flatMap((e) => e.phonetics || []);
  const text = entries.find((e) => e.phonetic)?.phonetic || phonetics.find((p) => p.text)?.text;
  const audioSrc = phonetics.map((p) => p.audio).find((a) => typeof a === "string" && a.trim());

  const box = el("div", "pron");
  box.append(el("span", "pron__text", text || "Pronunciation not available"));
  if (audioSrc) {
    const audio = el("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = audioSrc.startsWith("//") ? `https:${audioSrc}` : audioSrc;
    audio.setAttribute("aria-label", "Play pronunciation");
    box.append(audio);
  } else {
    box.append(el("span", "pron__none", "No audio available"));
  }
  return box;
}

function buildSynonyms(synonyms) {
  const list = el("ul", "syns");
  list.append(el("li", "syns__label", synonyms.length ? "Synonyms:" : "No synonyms listed."));
  synonyms.forEach((syn) => {
    const item = el("li");
    const chip = el("button", "chip", syn);
    chip.type = "button";
    chip.dataset.search = syn;
    item.append(chip);
    list.append(item);
  });
  return list;
}

function buildMeaning(meaning) {
  const section = el("section", "meaning");
  section.append(el("h3", "meaning__pos", meaning.partOfSpeech || "other"));

  const definitions = meaning.definitions || [];
  const list = el("ol", "defs");
  definitions.forEach((d) => {
    const item = el("li", "def");
    item.append(el("p", "def__text", d.definition));
    if (d.example) item.append(el("p", "def__example", `“${d.example}”`));
    list.append(item);
  });
  section.append(list);

  const synonyms = unique([...(meaning.synonyms || []), ...definitions.flatMap((d) => d.synonyms || [])]);
  section.append(buildSynonyms(synonyms.slice(0, 10)));
  return section;
}

function buildSources(entries) {
  const urls = unique(entries.flatMap((e) => e.sourceUrls || [])).filter((u) => /^https?:\/\//.test(u));
  const box = el("p", "sources");
  box.append("Source: ");
  if (!urls.length) { box.append("not provided"); return box; }
  urls.forEach((url, i) => {
    if (i) box.append(", ");
    const link = el("a", "", url);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    box.append(link);
  });
  return box;
}

function buildSaveButton(card, word) {
  const btn = el("button", "btn btn--ghost");
  btn.type = "button";
  const sync = () => {
    const saved = isSaved(word);
    btn.textContent = saved ? "Saved" : "Save word";
    btn.setAttribute("aria-pressed", String(saved));
    card.classList.toggle("is-saved", saved);
  };
  btn.addEventListener("click", () => {
    const key = word.toLowerCase();
    savedWords = isSaved(word) ? savedWords.filter((w) => w !== key) : [...savedWords, key];
    persist(SAVED_KEY, savedWords);
    sync();
    renderSaved();
  });
  sync();
  return btn;
}

function renderEntries(entries) {
  const word = entries[0].word;
  const card = el("article", "entry");
  const head = el("header", "entry__head");
  head.append(el("h2", "entry__word", word), buildSaveButton(card, word));
  card.append(head, buildPronunciation(entries));
  entries.flatMap((e) => e.meanings || []).forEach((m) => card.append(buildMeaning(m)));
  card.append(buildSources(entries));
  resultsEl.replaceChildren(card);
  resultsEl.hidden = false;
}

function renderSaved() {
  savedList.replaceChildren();
  if (!savedWords.length) {
    const empty = el("li", "saved__empty", "No saved words yet. Search a word and choose Save word.");
    savedList.append(empty);
    return;
  }
  savedWords.forEach((word) => {
    const item = el("li");
    const open = el("button", "word", word);
    open.type = "button";
    open.dataset.search = word;
    const remove = el("button", "remove", "×");
    remove.type = "button";
    remove.dataset.remove = word;
    remove.setAttribute("aria-label", `Remove ${word} from saved words`);
    item.append(open, remove);
    savedList.append(item);
  });
}


function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "Searching…" : "Search";
  resultsEl.setAttribute("aria-busy", String(isLoading));
}

async function search(rawWord) {
  const word = rawWord.trim().replace(/\s+/g, " ");
  if (!word) { setStatus("Enter a word to search.", "error"); input.focus(); return; }
  if (!WORD_PATTERN.test(word)) {
    setStatus("Use letters, hyphens and apostrophes only.", "error");
    input.focus();
    return;
  }

  if (controller) controller.abort();
  const current = new AbortController();
  controller = current;
  const { signal } = current;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; current.abort(); }, REQUEST_TIMEOUT_MS);
  input.value = word;
  setLoading(true);
  setStatus("Searching…");

  try {
    const entries = await fetchEntries(word, signal);
    renderEntries(entries);
    setStatus("");
  } catch (err) {
    if (err.name === "AbortError" && !timedOut) return; // replaced by a newer search
    resultsEl.replaceChildren();
    resultsEl.hidden = true;
    const message = timedOut
      ? "The dictionary is taking too long to respond. Try again in a moment."
      : err instanceof LookupError ? err.message : "Something went wrong. Try again.";
    setStatus(message, "error");
  } finally {
    clearTimeout(timer);
    if (!signal.aborted || timedOut) setLoading(false);
  }
}


function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
}


form.addEventListener("submit", (event) => {
  event.preventDefault();
  search(input.value);
});

input.addEventListener("input", () => {
  if (statusEl.classList.contains("status--error")) setStatus("");
});

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  persist(THEME_KEY, next);
});

document.addEventListener("click", (event) => {
  const searchBtn = event.target.closest("[data-search]");
  if (searchBtn) { search(searchBtn.dataset.search); return; }
  const removeBtn = event.target.closest("[data-remove]");
  if (removeBtn) {
    savedWords = savedWords.filter((w) => w !== removeBtn.dataset.remove);
    persist(SAVED_KEY, savedWords);
    renderSaved();
    const card = resultsEl.querySelector(".entry");
    const shown = card?.querySelector(".entry__word")?.textContent;
    if (shown && !isSaved(shown)) {
      card.classList.remove("is-saved");
      const toggle = card.querySelector("button[aria-pressed]");
      toggle.textContent = "Save word";
      toggle.setAttribute("aria-pressed", "false");
    }
  }
});


const storedTheme = loadJSON(THEME_KEY, null);
applyTheme(storedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
renderSaved();
