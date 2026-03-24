const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { v4: uuidv4 } = require('uuid');
const Log = require('../models/Log');
const guardrail = require('../middleware/guardrail');
const modelRouter = require('../middleware/modelRouter');
const policy = require('../policy.json');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ======================= COST CONFIG =======================
const MODEL_COSTS = {
  'llama-3.1-8b-instant':   { input: 0.05, output: 0.08 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 }
};

// ======================= CHAT =======================
router.post('/chat', guardrail, modelRouter, async (req, res) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  const { prompt } = req.body;

  console.log(`\n[${new Date().toLocaleTimeString()}] ─────────────────────────`);
  console.log(`→ Prompt: "${prompt.substring(0, 60)}..."`);
  console.log(`→ Risk: ${req.riskScore} | Severity: ${req.severity}`);

  // 🚫 STRICT BLOCK
  if (req.severity === 'CRITICAL' || req.riskScore >= 0.7) {
    console.log(`🚫 BLOCKED — ${req.injectionReason}`);

    await Log.create({
      requestId,
      userIp: req.ip,
      prompt,
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
      reason: 'Prompt injection detected and blocked.',
      riskScore: req.riskScore,
      severity: req.severity,
      details: req.injectionReason,
      requestId
    });
  }

  // 🚫 POLICY BLOCK
  const blockedTopic = policy.blocked_topics.find(topic =>
    prompt.toLowerCase().includes(topic)
  );

  if (blockedTopic) {
    console.log(`🚫 POLICY BLOCK — ${blockedTopic}`);

    await Log.create({
      requestId,
      userIp: req.ip,
      prompt,
      blocked: true,
      injectionReason: `Policy violation: ${blockedTopic}`,
      riskScore: 1.0,
      severity: 'CRITICAL',
      modelSelected: req.selectedModel,
      latencyMs: Date.now() - startTime
    });

    return res.status(403).json({
      blocked: true,
      reason: `Blocked topic: ${blockedTopic}`,
      requestId
    });
  }

  if (req.flagged) {
    console.log(`⚠️ FLAGGED — Suspicious input`);
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

    console.log(`✅ Success — Tokens: ${promptTokens + completionTokens}`);

  } catch (err) {
    console.error(`⚠️ FALLBACK — ${err.message}`);
    response = `[FALLBACK] Service temporarily unavailable`;
    usedFallback = true;
  }

  const latencyMs = Date.now() - startTime;
  const totalTokens = promptTokens + completionTokens;

  // ======================= COST =======================
  const pricing = MODEL_COSTS[req.selectedModel] || { input: 0, output: 0 };

  const actualCost =
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output;

  const naivePricing = MODEL_COSTS['llama-3.3-70b-versatile'];

  const naiveCost =
    (promptTokens / 1_000_000) * naivePricing.input +
    (completionTokens / 1_000_000) * naivePricing.output;

  const costSaved = naiveCost - actualCost;

  console.log(`💰 Cost saved: $${costSaved.toFixed(9)}`);

  // ======================= LOG =======================
  await Log.create({
    requestId,
    userIp: req.ip,
    prompt,
    promptTokens,
    completionTokens,
    totalTokens,
    modelSelected: req.selectedModel,
    routingReason: req.routingReason,
    riskScore: req.riskScore,
    severity: req.severity,
    flagged: req.flagged || false,
    response,
    latencyMs,
    usedFallback,
    estimatedCost: actualCost,
    blocked: false,
    injectionDetected: false
  });

  res.json({
    requestId,
    model: req.selectedModel,
    routingReason: req.routingReason,
    response,
    usage: { promptTokens, completionTokens, totalTokens },
    costSaved: `$${costSaved.toFixed(9)}`,
    latencyMs,
    usedFallback
  });
});

// ======================= LOGS =======================
router.get('/logs', async (req, res) => {
  const logs = await Log.find().sort({ timestamp: -1 }).limit(50);
  res.json(logs);
});

// ======================= STATS =======================
router.get('/stats', async (req, res) => {
  const [total, blocked, fallbacks, flagged, tokenAgg, modelAgg] = await Promise.all([
    Log.countDocuments(),
    Log.countDocuments({ blocked: true }),
    Log.countDocuments({ usedFallback: true }),
    Log.countDocuments({ flagged: true }),
    Log.aggregate([
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$totalTokens' },
          avgLatency: { $avg: '$latencyMs' }
        }
      }
    ]),
    Log.aggregate([
      {
        $group: {
          _id: '$modelSelected',
          count: { $sum: 1 },
          tokens: { $sum: '$totalTokens' }
        }
      }
    ])
  ]);

  const agg = tokenAgg[0] || { totalTokens: 0, avgLatency: 0 };

  // 💰 TOTAL COST SAVED
  const totalCostAgg = await Log.aggregate([
    {
      $group: {
        _id: null,
        totalCost: { $sum: '$estimatedCost' }
      }
    }
  ]);

  const totalActualCost = totalCostAgg[0]?.totalCost || 0;

  res.json({
    totalRequests: total,
    blockedRequests: blocked,
    flaggedRequests: flagged,
    fallbacksUsed: fallbacks,
    totalTokens: agg.totalTokens,
    avgLatencyMs: Math.round(agg.avgLatency),
    totalCostSaved: `$${totalActualCost.toFixed(6)}`,
    modelDistribution: modelAgg
  });
});

module.exports = router;