// Name sanitising and the blocklist (obscenity package + blocklist.txt).
const fs = require('fs');
const path = require('path');
const { RegExpMatcher, englishDataset, englishRecommendedTransformers } = require('obscenity');

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

let extra = [];
try {
  extra = fs.readFileSync(path.join(__dirname, 'blocklist.txt'), 'utf8').split('\n')
    .map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#'));
} catch (_) { /* optional */ }

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const words = (t) => t.toLowerCase().split(/[\s._\-,;:/|+]+/)
  .map((w) => w.replace(/[013457@$!]/g, (c) => LEET[c]).replace(/[^a-z]/g, '')).filter(Boolean);

// extra words match the start of a word, so "nazis" is blocked but "grape" and "torpedo" are fine
function isBlocked(text) {
  if (!text) return false;
  if (matcher.hasMatch(text)) return true;
  const ws = words(text);
  const joined = ws.join('');
  return extra.some((w) => joined === w || ws.some((x) => x.startsWith(w)));
}

const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]', 'g');

// -> { ok: true, name } | { ok: false, error: 'NAME_INVALID' | 'NAME_BLOCKED' }
function cleanName(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'NAME_INVALID' };
  const name = raw
    .replace(/<[^>]*>/g, '') // HTML tags
    .replace(/[<>&"'`]/g, '')
    .replace(CONTROL, '') // control and direction chars
    .replace(/\s+/g, ' ')
    .trim();
  const n = [...name].length;
  if (n < 1 || n > 16) return { ok: false, error: 'NAME_INVALID' };
  if (isBlocked(name)) return { ok: false, error: 'NAME_BLOCKED' };
  return { ok: true, name };
}

// AI comment -> safe text, or null (caller uses a canned line)
function cleanComment(text) {
  if (typeof text !== 'string') return null;
  let t = text.replace(/["“”‘’`]/g, '').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.length > 120) t = t.slice(0, 117).replace(/\s+\S*$/, '') + '...';
  return isBlocked(t) ? null : t;
}

module.exports = { cleanName, cleanComment, isBlocked };
