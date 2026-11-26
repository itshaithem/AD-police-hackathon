// Mirrors backend/app/pipeline/scoring.py:9,39 and frontend/src/data.ts:296-313.
// Keep all three in sync if thresholds or colors change.
const SCAM_AT = 70;
const SUSPICIOUS_AT = 40;

const LEVEL_COLOR = { scam: '#C8442F', sus: '#C99A2E', safe: '#6B8E5A' };

function levelOf(score) {
  return score >= SCAM_AT ? 'scam' : score >= SUSPICIOUS_AT ? 'sus' : 'safe';
}
