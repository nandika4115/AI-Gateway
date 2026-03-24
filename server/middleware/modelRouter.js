const policy = require('../policy.json');

function modelRouter(req, res, next) {
  const { prompt, priority } = req.body;

  const words = prompt.trim().split(/\s+/).length;

  const routingRules = policy.routing_rules || {};
  const keywords = routingRules.high_priority_keywords || [];
  const threshold = routingRules.complex_word_threshold || 50;

  const hasCodeKeywords = /\b(code|function|algorithm|implement|debug|write a program)\b/i.test(prompt);
  const hasAnalysisKeywords = /\b(analyze|compare|explain in detail|summarize|research)\b/i.test(prompt);

  const isHighPriority =
    priority === 'high' ||
    keywords.some(k => prompt.toLowerCase().includes(k));

  const isComplex =
    words > threshold ||
    hasCodeKeywords ||
    hasAnalysisKeywords;

  const simpleModel = policy.allowed_models?.[0] || 'llama-3.1-8b-instant';
  const complexModel = policy.allowed_models?.[1] || 'llama-3.3-70b-versatile';

  if (isHighPriority) {
    req.selectedModel = complexModel;
    req.routingReason = 'High priority — routed to high-capability model';
  } else if (isComplex) {
    req.selectedModel = complexModel;
    req.routingReason = 'Complex query detected — routed to high-capability model';
  } else {
    req.selectedModel = simpleModel;
    req.routingReason = 'Simple query — routed to fast model';
  }

  next();
}

module.exports = modelRouter;