function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeProbability(value) {
  const numeric = toNumber(value);

  if (numeric === null || numeric < 0) {
    return null;
  }

  return numeric > 1 ? numeric / 100 : numeric;
}

export function evaluatePickAgainstBenchmarks(pick, filters) {
  const reasons = [];
  const betType = String(pick.betType || (Number(pick.legs) > 1 ? 'sgm' : 'single')).toLowerCase();
  const modelProbability = normalizeProbability(pick.modelProbability);
  const supportScore = toNumber(pick.supportScore);
  const confidenceTier = String(pick.confidenceTier || '').toLowerCase();
  const supportProjection = String(pick.supportProjection || '').toLowerCase();
  const dataConfidence = String(pick.dataConfidence || '').toLowerCase();
  const correlationRisk = String(pick.correlationRisk || '').toLowerCase();
  const requireSupportData = Boolean(filters.requireSupportData);
  const significantSupportScore = toNumber(filters.significantSupportScore) ?? 5;
  const strongSupportThreshold = toNumber(filters.strongSupportScore) ?? 8;
  const exceptionalSupport = Boolean(pick.exceptionalSupport) || (supportScore !== null && supportScore >= significantSupportScore);
  const strongSupport = Boolean(pick.strongSupport) || (supportScore !== null && supportScore >= strongSupportThreshold);

  if (dataConfidence === 'low') {
    reasons.push('data confidence is too low');
  }

  if (requireSupportData && modelProbability === null && supportScore === null) {
    reasons.push('support data is missing');
  }

  if (supportScore !== null && supportScore <= 0 && !exceptionalSupport) {
    reasons.push('support score is not positive');
  }

  if (betType === 'single') {
    if (confidenceTier === 'low' && supportProjection === 'weak' && !strongSupport) {
      reasons.push('single lacks enough support for a standalone recommendation');
    }
  }

  if (correlationRisk === 'high' && !pick.correlationJustified) {
    reasons.push('high correlation is not justified by the support case');
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    betType,
    modelProbability,
    supportScore
  };
}