// js/fuzzy.js
// Self-contained fuzzy matcher with proximity scoring.
// Scores each item against a query. Returns 0 when no match at all.
// Field weights: name > tags > group > description.

// ─── Tuning ──────────────────────────────────────────────────────────────────

// Field weights — relative importance when combining scores
const WEIGHT_NAME  = 1.00;
const WEIGHT_TAGS  = 0.70;
const WEIGHT_GROUP = 0.60;
const WEIGHT_DESC  = 0.40;
const WEIGHT_URL   = 0.35;

// Exact substring scoring
const EXACT_BASE         = 1000; // base score for any exact substring hit
const EXACT_PREFIX_BONUS =  400; // added when match starts at position 0
const EXACT_WORDSTART_BONUS = 200; // added when match starts after a word boundary
// position penalty is -idx (1 pt per character of offset), always applied

// Subsequence scoring
const SEQ_GAP_BASE      = 20;  // score for a zero-gap character match
const SEQ_GAP_PENALTY   =  2;  // subtracted per gap character (score = max(SEQ_MIN, SEQ_GAP_BASE - gap * SEQ_GAP_PENALTY))
const SEQ_MIN           =  1;  // floor score for any matched character
const SEQ_WORDSTART_BONUS = 40; // bonus when matched char sits on a word boundary
const SEQ_RUN_MULTIPLIER =  3;  // consecutive-run bonus = run_length * this
const MAX_SPAN_RATIO = 8; // reject subsequence matches that span > N× the query length

// ─────────────────────────────────────────────────────────────────────────────

const WORD_BOUNDARY = /[\s,.\-_/|]/;

function scoreField(query, text) {
  if (!text || !query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring — best case
  const idx = t.indexOf(q);
  if (idx !== -1) {
    const isPrefix    = idx === 0;
    const isWordStart = idx > 0 && WORD_BOUNDARY.test(t[idx - 1]);
    return EXACT_BASE
      + (isPrefix    ? EXACT_PREFIX_BONUS    : 0)
      + (isWordStart ? EXACT_WORDSTART_BONUS : 0)
      - idx;
  }

// Subsequence with proximity bonus
  let qi = 0, score = 0, lastIdx = -1, firstMatchIdx = -1, runs = 0, inRun = false;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      const gap = lastIdx === -1 ? 0 : ti - lastIdx - 1;
      const wordStartBonus = (ti === 0 || WORD_BOUNDARY.test(t[ti - 1])) ? SEQ_WORDSTART_BONUS : 0;
      score += Math.max(SEQ_MIN, SEQ_GAP_BASE - gap * SEQ_GAP_PENALTY) + wordStartBonus;
      if (gap === 0 && inRun) runs += 1; else runs = 1;
      score += runs * SEQ_RUN_MULTIPLIER;
      inRun = true;
      if (firstMatchIdx === -1) firstMatchIdx = ti;
      lastIdx = ti;
      qi++;
    } else {
      inRun = false;
    }
  }
  if (qi !== q.length) return 0;
  const spanLength = lastIdx - firstMatchIdx + 1;
  if (spanLength > q.length * MAX_SPAN_RATIO) return 0;
  return score;
}

export function fuzzyScore(query, item) {
  if (!query) return 1;
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const sName  = scoreField(q, item.name        || '') * WEIGHT_NAME;
  const sTags  = scoreField(q, item.tags        || '') * WEIGHT_TAGS;
  const sGroup = scoreField(q, item.group       || '') * WEIGHT_GROUP;
  const sDesc  = scoreField(q, item.description || '') * WEIGHT_DESC;
  const sUrl   = scoreField(q, item.url         || '') * WEIGHT_URL;

  return sName + sTags + sGroup + sDesc + sUrl;
}