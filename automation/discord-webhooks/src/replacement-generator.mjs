function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeLeg(leg, index) {
  return {
    id: leg.id || `leg-${index + 1}`,
    label: String(leg.label || leg.summary || '').trim(),
    modelProbability: toNumber(leg.modelProbability),
    supportScore: toNumber(leg.supportScore),
    supportProjection: String(leg.supportProjection || '').toLowerCase() || null,
    confidenceTier: String(leg.confidenceTier || '').toLowerCase() || null,
    status: String(leg.status || 'active').toLowerCase(),
    locked: Boolean(leg.locked),
    rationale: String(leg.rationale || '').trim(),
    source: leg.source || null
  };
}

function isVoidLikeStatus(status) {
  return ['void', 'voided', 'refund', 'refunded', 'cancelled', 'canceled', 'removed'].includes(String(status || '').toLowerCase());
}

function summarizeLegs(legs) {
  return legs.map((leg) => leg.label).filter(Boolean).join(' + ');
}

function deriveBetType(legs, basePick) {
  if (legs.length <= 1) {
    return 'single';
  }

  return String(basePick.betType || 'sgm').toLowerCase();
}

function getTemplate(basePick) {
  return basePick.replacementTemplate && typeof basePick.replacementTemplate === 'object'
    ? basePick.replacementTemplate
    : {};
}

function getStructuredLegs(basePick) {
  if (!Array.isArray(basePick.legs)) {
    return [];
  }

  return basePick.legs
    .map(normalizeLeg)
    .filter((leg) => leg.label);
}

function getActiveLegs(basePick) {
  const template = getTemplate(basePick);
  const voidedLegIds = new Set(Array.isArray(template.voidedLegIds) ? template.voidedLegIds.map(String) : []);

  return getStructuredLegs(basePick).filter((leg) => !voidedLegIds.has(String(leg.id)) && !isVoidLikeStatus(leg.status));
}

function getCandidateLegs(basePick) {
  const template = getTemplate(basePick);

  if (!Array.isArray(template.candidateLegs)) {
    return [];
  }

  return template.candidateLegs
    .map(normalizeLeg)
    .filter((leg) => leg.label);
}

function estimateModelProbability(legs) {
  const probabilities = legs.map((leg) => toNumber(leg.modelProbability));

  if (probabilities.some((value) => value === null || value < 0)) {
    return null;
  }

  return probabilities.reduce((total, value) => total * value, 1);
}

function estimateSupportScore(basePick, legs) {
  const explicitScores = legs.map((leg) => toNumber(leg.supportScore)).filter((value) => value !== null);

  if (explicitScores.length) {
    return explicitScores.reduce((total, value) => total + value, 0) / explicitScores.length;
  }

  const probabilities = legs.map((leg) => toNumber(leg.modelProbability)).filter((value) => value !== null);

  if (probabilities.length) {
    const averageProbability = probabilities.reduce((total, value) => total + value, 0) / probabilities.length;
    return Math.max(0, Math.round((averageProbability - 0.5) * 20 * 10) / 10);
  }

  return toNumber(basePick.supportScore);
}

function deriveSupportProjection(basePick, supportScore) {
  if (supportScore !== null && supportScore >= 8) {
    return 'strong';
  }

  if (supportScore !== null && supportScore >= 5) {
    return 'moderate';
  }

  return String(basePick.supportProjection || '').toLowerCase() || 'cautious';
}

function buildGeneratedOption(basePick, legs, index, reason) {
  const summary = summarizeLegs(legs);

  if (!summary) {
    return null;
  }

  const modelProbability = estimateModelProbability(legs);
  const supportScore = estimateSupportScore(basePick, legs);

  return {
    variantId: `generated-${index + 1}`,
    summary,
    betType: deriveBetType(legs, basePick),
    modelProbability,
    supportScore,
    supportProjection: deriveSupportProjection(basePick, supportScore),
    confidenceTier: basePick.confidenceTier || 'medium',
    dataConfidence: basePick.dataConfidence || 'medium',
    rationale: `${reason}. Generated from the current same-event replacement template.`,
    generatedFromTemplate: true,
    legs
  };
}

function dedupeOptions(options) {
  const seen = new Set();
  const deduped = [];

  for (const option of options) {
    const key = JSON.stringify([option.summary, option.betType, option.legs.length]);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(option);
  }

  return deduped;
}

function compareNullableNumbers(left, right, direction = 'asc') {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === 'desc' ? right - left : left - right;
}

function rankGeneratedOptions(basePick, options) {
  const originalLegCount = getStructuredLegs(basePick).length || null;

  return [...options].sort((left, right) => {
    const leftLegGap = originalLegCount === null ? 0 : Math.abs(left.legs.length - originalLegCount);
    const rightLegGap = originalLegCount === null ? 0 : Math.abs(right.legs.length - originalLegCount);

    if (leftLegGap !== rightLegGap) {
      return leftLegGap - rightLegGap;
    }

    const supportComparison = compareNullableNumbers(left.supportScore, right.supportScore, 'desc');

    if (supportComparison !== 0) {
      return supportComparison;
    }

    const modelComparison = compareNullableNumbers(left.modelProbability, right.modelProbability, 'desc');

    if (modelComparison !== 0) {
      return modelComparison;
    }

    return left.summary.localeCompare(right.summary);
  });
}

export function generateReplacementOptionsFromTemplate(basePick) {
  const activeLegs = getActiveLegs(basePick);
  const candidateLegs = getCandidateLegs(basePick);
  const template = getTemplate(basePick);
  const maxOptions = Math.max(1, Number(template.maxOptions || 1));
  const options = [];
  const generatedCandidates = [];

  if (!activeLegs.length && !candidateLegs.length) {
    return [];
  }

  for (const candidate of candidateLegs) {
    const withCandidate = buildGeneratedOption(
      basePick,
      [...activeLegs, candidate],
      generatedCandidates.length,
      `Rebuilt the slip by swapping in ${candidate.label}`
    );

    if (withCandidate) {
      generatedCandidates.push(withCandidate);
    }
  }

  options.push(...rankGeneratedOptions(basePick, generatedCandidates));

  if (activeLegs.length) {
    const reduced = buildGeneratedOption(basePick, activeLegs, options.length, 'Removed the voided leg and kept the surviving legs');

    if (reduced) {
      options.push(reduced);
    }
  }

  return dedupeOptions(options).slice(0, maxOptions);
}