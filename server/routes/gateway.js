const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { v4: uuidv4 } = require('uuid');
const Log = require('../models/Log');
const guardrail = require('../middleware/guardrail');
const modelRouter = require('../middleware/modelRouter');
const policy = require('../policy.json');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Cost per 1M tokens
const MODEL_COSTS = {
  'llama-3.1-8b-instant':   { input: 0.05, output: 0.08 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 }
};

router.post('/chat', guardrail, modelRouter, async (req, res) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  const { prompt } = req.body;

  let response, usedFallback = false;
  let promptTokens = 0, completionTokens = 0;

  // 🚫 Block injection
  if (req.injectionDetected) {
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
      reason: 'Prompt injection detected',
      requestId
    });
  }

  // 🚫 Policy block
  const blockedTopic = policy.blocked_topics.find(topic =>
    prompt.toLowerCase().includes(topic)
  );

  if (blockedTopic) {
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

  try {
    const completion = await groq.chat.completions.create({
      model: req.selectedModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: policy.max_tokens
    });

    response = completion.choices[0].message.content;
    promptTokens = completion.usage.prompt_tokens;
    completionTokens = completion.usage.completion_tokens;

  } catch (err) {
    response = `[FALLBACK] Try again later`;
    usedFallback = true;
  }

  const latencyMs = Date.now() - startTime;
  const totalTokens = promptTokens + completionTokens;

  // ✅ COST CALCULATION
  const pricing = MODEL_COSTS[req.selectedModel] || { input: 0, output: 0 };

  const actualCost =
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output;

  const naivePricing = MODEL_COSTS['llama-3.3-70b-versatile'];

  const naiveCost =
    (promptTokens / 1_000_000) * naivePricing.input +
    (completionTokens / 1_000_000) * naivePricing.output;

  const costSaved = naiveCost - actualCost;

  const costReductionPercent =
    naiveCost > 0 ? ((costSaved / naiveCost) * 100) : 0;

  // ✅ SAVE LOG
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
    blocked: false
  });

  // ✅ RESPONSE (FIXED)
  res.json({
    requestId,
    model: req.selectedModel,
    routingReason: req.routingReason,
    response,
    usage: { promptTokens, completionTokens, totalTokens },

    actualCost: `$${actualCost.toFixed(9)}`,
    naiveCost: `$${naiveCost.toFixed(9)}`,
    costSaved: `$${costSaved.toFixed(9)}`,
    costReduction: `${costReductionPercent.toFixed(2)}%`,

    latencyMs,
    usedFallback
  });
});


router.get('/logs', async (req, res) => {
  const logs = await Log.find()
    .sort({ timestamp: -1 })
    .limit(50)
    .lean();

  res.json(logs);
});


// 📊 FIXED STATS API
router.get('/stats', async (req, res) => {
  const [summary, costs, modelDist] = await Promise.all([

    Log.aggregate([
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          totalTokens: { $sum: '$totalTokens' },
          avgLatency: { $avg: '$latencyMs' },
          blocked: {
            $sum: { $cond: ['$blocked', 1, 0] }
          },
          flagged: {
            $sum: { $cond: ['$flagged', 1, 0] }
          }
        }
      }
    ]),

    Log.aggregate([
      {
        $group: {
          _id: null,
          totalCost: { $sum: '$estimatedCost' },
          totalPromptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
          totalCompletionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } }
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

  const stats = summary[0] || {};
  const totalCost = costs[0]?.totalCost || 0;
  const totalPromptTokens = costs[0]?.totalPromptTokens || 0;
  const totalCompletionTokens = costs[0]?.totalCompletionTokens || 0;
  const naivePricing = MODEL_COSTS['llama-3.3-70b-versatile'];
  const totalNaiveCost =
    (totalPromptTokens / 1_000_000) * naivePricing.input +
    (totalCompletionTokens / 1_000_000) * naivePricing.output;
  const totalCostSaved = Math.max(totalNaiveCost - totalCost, 0);

  res.json({
    totalRequests: stats.totalRequests || 0,
    blockedRequests: stats.blocked || 0,
    flaggedRequests: stats.flagged || 0,
    totalTokens: stats.totalTokens || 0,
    avgLatencyMs: Math.round(stats.avgLatency || 0),

    totalActualCost: `$${totalCost.toFixed(6)}`,
    totalCostSaved: `$${totalCostSaved.toFixed(6)}`,
    modelDistribution: modelDist
  });
});

module.exports = router;