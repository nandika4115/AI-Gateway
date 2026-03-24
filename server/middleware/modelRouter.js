const policy = require('../policy.json');

function modelRouter(req, res, next) {
  const { prompt, priority } = req.body;
  const words = prompt.trim().split(/\s+/).length;

  const hasCodeKeywords = /\b(code|function|algorithm|implement|debug|write a program)\b/i.test(prompt);
  const hasAnalysisKeywords = /\b(analyze|compare|explain in detail|summarize|research)\b/i.test(prompt);
  const isHighPriority = priority === 'high' ||
    policy.routing_rules.high_priority_keywords.some(k => prompt.toLowerCase().includes(k));
  const isComplex = words > policy.routing_rules.complex_word_threshold ||
    hasCodeKeywords || hasAnalysisKeywords;

  // Validate model is in allowed list
  const [simpleModel, complexModel] = policy.allowed_models;

  if (isHighPriority) {
    req.selectedModel = simpleModel;
    req.routingReason = 'High priority — routed to fast model';
  } else if (isComplex) {
    req.selectedModel = complexModel;
    req.routingReason = words > policy.routing_rules.complex_word_threshold
      ? 'Long prompt — routed to Llama 70B'
      : 'Complex task detected — routed to Llama 70B';
  } else {
    req.selectedModel = simpleModel;
    req.routingReason = 'Simple prompt — routed to Llama 8B';
  }

  next();
}

module.exports = modelRouter;