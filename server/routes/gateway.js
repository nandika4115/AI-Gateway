const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { v4: uuidv4 } = require('uuid');
const Log = require('../models/Log');
const guardrail = require('../middleware/guardrail');
const modelRouter = require('../middleware/modelRouter');
const policy = require('../policy.json');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Cost per 1M tokens (for savings calculation)
const MODEL_COSTS = {
  'llama-3.1-8b-instant':   { input: 0.05, output: 0.08 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 }
};

router.post('/chat', guardrail, modelRouter, async (req, res) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  const { prompt } = req.body;

  console.log(`\n[${new Date().toLocaleTimeString()}] ─────────────────────────`);
  console.log(`→ Prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);
  console.log(`→ Risk Score: ${req.riskScore} | Severity: ${req.severity}`);

  // Block CRITICAL injections
  if (req.injectionDetected) {
    console.log(`🚫 BLOCKED — ${req.injectionReason}`);
    await Log.create({
      requestId, userIp: req.ip, prompt,
      injectionDetected: true,
      injectionReason: req.injectionReason,
      riskScore: req.riskScore,
      severity: req.severity,
      blocked: true,
      modelSelected: req.selectedModel,
      latencyMs: Date.now() - startTime
    });
    return res.status(403).json({
      blocked: true,
      reason: 'Prompt injection detected. Request blocked.',
      riskScore: req.riskScore,
      severity: req.severity,
      requestId
    });
  }

  // Block policy-violating topics
  const blockedTopic = policy.blocked_topics.find(topic =>
    prompt.toLowerCase().includes(topic)
  );
  if (blockedTopic) {
    console.log(`🚫 BLOCKED — Policy violation: "${blockedTopic}"`);
    await Log.create({
      requestId, userIp: req.ip, prompt,
      injectionDetected: false,
      injectionReason: `Policy violation: ${blockedTopic}`,
      riskScore: 1.0,
      severity: 'CRITICAL',
      blocked: true,
      modelSelected: req.selectedModel,
      latencyMs: Date.now() - startTime
    });
    return res.status(403).json({
      blocked: true,
      reason: `Request blocked by policy: topic "${blockedTopic}" is not allowed.`,
      requestId
    });
  }

  // Flag suspicious but allow through
  if (req.flagged) {
    console.log(`⚠️  FLAGGED — Risk score ${req.riskScore} (suspicious but allowed)`);
  }

  console.log(`→ Model: ${req.selectedModel}`);
  console.log(`→ Routing: ${req.routingReason}`);

  let response, usedFallback = false;
  let promptTokens = 0, completionTokens = 0;

  try {
    const completion = await groq.chat.completions.create({
      model: req.selectedModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: policy.max_tokens
    });

    response = completion.choices[0].message.content;
    promptTokens = completion.usage.prompt_tokens;
    completionTokens = completion.usage.completion_tokens;
    console.log(`✅ OK — ${Date.now() - startTime}ms | Tokens: ${promptTokens + completionTokens}`);

  } catch (err) {
    console.log(`⚠️  FALLBACK — Groq failed: ${err.message}`);
    response = `[FALLBACK] I cannot process that request right now. Please try again later.`;
    usedFallback = true;
  }

  const latencyMs = Date.now() - startTime;
  const totalTokens = promptTokens + completionTokens;

  // Cost savings calculation
  const actualCost = MODEL_COSTS[req.selectedModel]
    ? ((promptTokens / 1_000_000) * MODEL_COSTS[req.selectedModel].input) +
      ((completionTokens / 1_000_000) * MODEL_COSTS[req.selectedModel].output)
    : 0;
  const naiveCost = MODEL_COSTS['llama-3.3-70b-versatile']
    ? ((promptTokens / 1_000_000) * MODEL_COSTS['llama-3.3-70b-versatile'].input) +
      ((completionTokens / 1_000_000) * MODEL_COSTS['llama-3.3-70b-versatile'].output)
    : 0;
  const costSaved = naiveCost - actualCost;

  await Log.create({
    requestId, userIp: req.ip, prompt,
    promptTokens, completionTokens, totalTokens,
    modelSelected: req.selectedModel,
    routingReason: req.routingReason,
    riskScore: req.riskScore,
    severity: req.severity,
    flagged: req.flagged || false,
    response, latencyMs, usedFallback,
    estimatedCost: actualCost,
    blocked: false,
    injectionDetected: false
  });

  res.json({
    requestId,
    model: req.selectedModel,
    routingReason: req.routingReason,
    riskScore: req.riskScore,
    severity: req.severity,
    flagged: req.flagged || false,
    response,
    usage: { promptTokens, completionTokens, totalTokens },
    costSaved: `$${costSaved.toFixed(6)}`,
    latencyMs,
    usedFallback
  });
});

// GET /api/logs
router.get('/logs', async (req, res) => {
  const logs = await Log.find().sort({ timestamp: -1 }).limit(50);
  res.json(logs);
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  const [total, blocked, fallbacks, flagged, tokenAgg, costAgg] = await Promise.all([
    Log.countDocuments(),
    Log.countDocuments({ blocked: true }),
    Log.countDocuments({ usedFallback: true }),
    Log.countDocuments({ flagged: true }),
    Log.aggregate([{
      $group: {
        _id: null,
        totalTokens: { $sum: '$totalTokens' },
        avgLatency: { $avg: '$latencyMs' }
      }
    }]),
    Log.aggregate([{
      $group: {
        _id: '$modelSelected',
        count: { $sum: 1 },
        totalTokens: { $sum: '$totalTokens' }
      }
    }])
  ]);

  const agg = tokenAgg[0] || { totalTokens: 0, avgLatency: 0 };

  // Calculate total cost saved
  const haiku = costAgg.find(m => m._id === 'llama-3.1-8b-instant');
  const sonnet = costAgg.find(m => m._id === 'llama-3.3-70b-versatile');
  const haikusTokens = haiku?.totalTokens || 0;
  const costIfAllLarge = (haikusTokens / 1_000_000) * 0.79;
  const costIfSmall = (haikusTokens / 1_000_000) * 0.08;
  const totalSaved = costIfAllLarge - costIfSmall;

  res.json({
    totalRequests: total,
    blockedRequests: blocked,
    flaggedRequests: flagged,
    fallbacksUsed: fallbacks,
    totalTokens: agg.totalTokens,
    avgLatencyMs: Math.round(agg.avgLatency),
    totalCostSaved: `$${totalSaved.toFixed(4)}`,
    modelDistribution: costAgg
  });
});

module.exports = router;
