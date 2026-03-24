const INJECTION_PATTERNS = [
  { pattern: /ignore (previous|all|above) instructions/i, score: 1.0, reason: 'Instruction override attempt' },
  { pattern: /you are now (a|an|my)/i, score: 0.9, reason: 'Identity hijack attempt' },
  { pattern: /pretend (you are|to be)/i, score: 0.9, reason: 'Role impersonation attempt' },
  { pattern: /jailbreak/i, score: 1.0, reason: 'Explicit jailbreak attempt' },
  { pattern: /dan mode/i, score: 1.0, reason: 'DAN jailbreak attempt' },
  { pattern: /act as if you have no restrictions/i, score: 1.0, reason: 'Restriction bypass attempt' },
  { pattern: /forget your (system prompt|instructions|training)/i, score: 0.9, reason: 'System prompt erasure attempt' },
  { pattern: /\bsudo\b/i, score: 0.7, reason: 'Privilege escalation attempt' },
  { pattern: /override (your )?(safety|guidelines|restrictions)/i, score: 0.9, reason: 'Safety override attempt' },
  { pattern: /you must obey/i, score: 0.8, reason: 'Forced compliance attempt' },
  { pattern: /\bbase64\b/i, score: 0.6, reason: 'Encoded payload attempt' },
  { pattern: /repeat after me/i, score: 0.5, reason: 'Prompt leaking attempt' },
  { pattern: /what (is|are) your (instructions|system prompt|rules)/i, score: 0.5, reason: 'System prompt extraction' },
  { pattern: /\bhack\b|\bexploit\b|\bvulnerability\b/i, score: 0.6, reason: 'Security exploitation attempt' },
];

function calculateRiskScore(prompt) {
  let maxScore = 0;
  let matchedReason = null;

  for (const { pattern, score, reason } of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      if (score > maxScore) {
        maxScore = score;
        matchedReason = reason;
      }
    }
  }

  return { riskScore: maxScore, reason: matchedReason };
}

function getSeverity(score) {
  if (score >= 0.8) return 'CRITICAL';
  if (score >= 0.5) return 'SUSPICIOUS';
  return 'SAFE';
}

function guardrail(req, res, next) {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const { riskScore, reason } = calculateRiskScore(prompt);
  const severity = getSeverity(riskScore);

  req.riskScore = riskScore;
  req.severity = severity;
  req.injectionReason = reason;

  if (severity === 'CRITICAL') {
    req.injectionDetected = true;
  } else if (severity === 'SUSPICIOUS') {
    req.injectionDetected = false;
    req.flagged = true;
  } else {
    req.injectionDetected = false;
    req.flagged = false;
  }

  next();
}

module.exports = guardrail;