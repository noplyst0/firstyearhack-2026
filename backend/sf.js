// Bridge to ai/snowflake.js. Every call has a timeout and never throws past the caller's catch.
// SNOWFLAKE_ENABLED=0 forces local mode.
const path = require('path');

const enabled = process.env.SNOWFLAKE_ENABLED !== '0';
let mod = null;
let state = enabled ? 'down' : 'off';
let initing = null;
let lastError = null;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[snowflake]', ...a);

function withTimeout(p, ms, label) {
  let t;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out after ${ms} ms`)), ms); }),
  ]);
}

async function init() {
  if (!enabled) return false;
  if (initing) return initing;
  initing = (async () => {
    try {
      if (!mod) mod = require(process.env.SNOWFLAKE_MODULE || path.join(__dirname, '..', 'ai', 'snowflake.js'));
      await withTimeout(mod.init(), 15000, 'init');
      state = 'ok';
      log('connected');
      return true;
    } catch (e) {
      state = 'down';
      lastError = e.message;
      log('init failed:', e.message);
      return false;
    } finally {
      initing = null;
    }
  })();
  return initing;
}

// call('saveAndScoreRound', args, 4000). Rejects when off, not loaded, missing, slow or failing.
// A slow call keeps running in the background so its data still lands.
async function call(name, args, ms) {
  if (!enabled) throw new Error('snowflake off');
  if (!mod || state !== 'ok') throw new Error('snowflake down');
  if (typeof mod[name] !== 'function') throw new Error(`ai/snowflake.js has no ${name}()`);
  const p = Promise.resolve().then(() => mod[name](args));
  p.catch((e) => { state = 'down'; lastError = e.message; log(`${name} failed:`, e.message); });
  try {
    const r = await withTimeout(p, ms, name);
    state = 'ok';
    return r;
  } catch (e) {
    if (/timed out/.test(e.message)) log(e.message);
    throw e;
  }
}

// keep-warm and recovery: a failed state retries init
async function ping() {
  if (!enabled) return;
  if (!mod || state !== 'ok') { await init(); return; }
  try { await withTimeout(mod.ping(), 10000, 'ping'); state = 'ok'; } catch (e) { state = 'down'; lastError = e.message; log('ping failed:', e.message); }
}

module.exports = { enabled, init, call, ping, status: () => state, lastError: () => lastError };
