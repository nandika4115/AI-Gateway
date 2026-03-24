const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  timestamp: { type: Date, default: Date.now },

  // Request info
  userIp: String,
  prompt: String,
  promptTokens: Number,

  // Gateway decisions
  rateLimited: { type: Boolean, default: false },
  injectionDetected: { type: Boolean, default: false },
  injectionReason: String,
  riskScore: { type: Number, default: 0 },
  severity: { type: String, enum: ['SAFE', 'SUSPICIOUS', 'CRITICAL'], default: 'SAFE' },
  flagged: { type: Boolean, default: false },

  modelSelected: String,   // 'claude-haiku' or 'claude-sonnet'
  routingReason: String,

  // Response info
  response: String,
  completionTokens: Number,
  totalTokens: Number,
  latencyMs: Number,
  usedFallback: { type: Boolean, default: false },
  blocked: { type: Boolean, default: false },

  // Cost estimate (USD)
  estimatedCost: Number
  
});

module.exports = mongoose.model('Log', LogSchema);