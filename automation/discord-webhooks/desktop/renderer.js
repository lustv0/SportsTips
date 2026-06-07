const elements = {
  toggleButton: document.getElementById('toggle-button'),
  daemonState: document.getElementById('daemon-state'),
  daemonMeta: document.getElementById('daemon-meta'),
  creditsValue: document.getElementById('credits-value'),
  watchedPicks: document.getElementById('watched-picks'),
  watchedPicksMeta: document.getElementById('watched-picks-meta'),
  activePicksPanel: document.getElementById('active-picks-panel'),
  activePicksDetails: document.getElementById('active-picks-details'),
  activePicksList: document.getElementById('active-picks-list'),
  timezoneValue: document.getElementById('timezone-value'),
  dryRunValue: document.getElementById('dry-run-value'),
  trackerUnitsValue: document.getElementById('tracker-units-value'),
  trackerUnitsMeta: document.getElementById('tracker-units-meta'),
  trackerSportBreakdown: document.getElementById('tracker-sport-breakdown'),
  webhookSlates: document.getElementById('webhook-slates'),
  webhookPicks: document.getElementById('webhook-picks'),
  webhookPicksNba: document.getElementById('webhook-picks-nba'),
  webhookPicksMlb: document.getElementById('webhook-picks-mlb'),
  webhookPicksAfl: document.getElementById('webhook-picks-afl'),
  webhookPicksNrl: document.getElementById('webhook-picks-nrl'),
  webhookPicksNfl: document.getElementById('webhook-picks-nfl'),
  webhookPicksEpl: document.getElementById('webhook-picks-epl'),
  webhookPicksOther: document.getElementById('webhook-picks-other'),
  webhookReferralsNew: document.getElementById('webhook-referrals-new'),
  webhookReferralsUpdatedTerms: document.getElementById('webhook-referrals-updated-terms'),
  webhookReferralsCancelled: document.getElementById('webhook-referrals-cancelled'),
  webhookReferralsMasterlist: document.getElementById('webhook-referrals-masterlist'),
  quickWebhookReferralsNew: document.getElementById('quick-webhook-referrals-new'),
  quickWebhookReferralsUpdatedTerms: document.getElementById('quick-webhook-referrals-updated-terms'),
  quickWebhookReferralsCancelled: document.getElementById('quick-webhook-referrals-cancelled'),
  quickWebhookReferralsMasterlist: document.getElementById('quick-webhook-referrals-masterlist'),
  saveReferralWebhooks: document.getElementById('save-referral-webhooks'),
  referralWebhookFeedback: document.getElementById('referral-webhook-feedback'),
  webhookUnitTracking: document.getElementById('webhook-unit-tracking'),
  webhookUnitReport: document.getElementById('webhook-unit-report'),
  referralReviewSummary: document.getElementById('referral-review-summary'),
  referralReviewList: document.getElementById('referral-review-list'),
  referralReviewFeedback: document.getElementById('referral-review-feedback'),
  referralPlanSummary: document.getElementById('referral-plan-summary'),
  referralPlanSteps: document.getElementById('referral-plan-steps'),
  referralPlanDeferredSummary: document.getElementById('referral-plan-deferred-summary'),
  referralPlanDeferred: document.getElementById('referral-plan-deferred'),
  forceDailyCheck: document.getElementById('force-daily-check'),
  forcePostSlates: document.getElementById('force-post-slates'),
  forcePostPicks: document.getElementById('force-post-picks'),
  runReferralsNow: document.getElementById('run-referrals-now'),
  reviewResults: document.getElementById('review-results'),
  quickActionsFeedback: document.getElementById('quick-actions-feedback'),
  configPath: document.getElementById('config-path'),
  saveSettings: document.getElementById('save-settings'),
  settingsFeedback: document.getElementById('settings-feedback'),
  settingDryRun: document.getElementById('setting-dry-run'),
  settingAnalysisEngine: document.getElementById('setting-analysis-engine'),
  settingWebhookSlates: document.getElementById('setting-webhook-slates'),
  settingWebhookPicks: document.getElementById('setting-webhook-picks'),
  settingWebhookPicksNba: document.getElementById('setting-webhook-picks-nba'),
  settingWebhookPicksMlb: document.getElementById('setting-webhook-picks-mlb'),
  settingWebhookPicksAfl: document.getElementById('setting-webhook-picks-afl'),
  settingWebhookPicksNrl: document.getElementById('setting-webhook-picks-nrl'),
  settingWebhookPicksNfl: document.getElementById('setting-webhook-picks-nfl'),
  settingWebhookPicksEpl: document.getElementById('setting-webhook-picks-epl'),
  settingWebhookPicksOther: document.getElementById('setting-webhook-picks-other'),
  settingWebhookReferralsNew: document.getElementById('setting-webhook-referrals-new'),
  settingWebhookReferralsUpdatedTerms: document.getElementById('setting-webhook-referrals-updated-terms'),
  settingWebhookReferralsCancelled: document.getElementById('setting-webhook-referrals-cancelled'),
  settingWebhookReferralsMasterlist: document.getElementById('setting-webhook-referrals-masterlist'),
  settingWebhookUnitTracking: document.getElementById('setting-webhook-unit-tracking'),
  settingWebhookUnitReport: document.getElementById('setting-webhook-unit-report'),
  settingRoleEnabled: document.getElementById('setting-role-enabled'),
  settingRoleText: document.getElementById('setting-role-text'),
  settingRoleSlates: document.getElementById('setting-role-slates'),
  settingRolePicksNba: document.getElementById('setting-role-picks-nba'),
  settingRolePicksMlb: document.getElementById('setting-role-picks-mlb'),
  settingRolePicksAfl: document.getElementById('setting-role-picks-afl'),
  settingRolePicksNrl: document.getElementById('setting-role-picks-nrl'),
  settingRolePicksNfl: document.getElementById('setting-role-picks-nfl'),
  settingRolePicksEpl: document.getElementById('setting-role-picks-epl'),
  settingRolePicksOther: document.getElementById('setting-role-picks-other'),
  openConfig: document.getElementById('open-config'),
  openFolder: document.getElementById('open-folder'),
  reloadPicksFeed: document.getElementById('reload-picks-feed'),
  generateReplacements: document.getElementById('generate-replacements'),
  saveReplacement: document.getElementById('save-replacement'),
  replacementPickSelect: document.getElementById('replacement-pick-select'),
  replacementPickMeta: document.getElementById('replacement-pick-meta'),
  picksFeedPath: document.getElementById('picks-feed-path'),
  replacementStatus: document.getElementById('replacement-status'),
  replacementReason: document.getElementById('replacement-reason'),
  replacementMaxOptions: document.getElementById('replacement-max-options'),
  currentLegsList: document.getElementById('current-legs-list'),
  candidateLegsList: document.getElementById('candidate-legs-list'),
  replacementOptionsList: document.getElementById('replacement-options-list'),
  addCurrentLeg: document.getElementById('add-current-leg'),
  addCandidateLeg: document.getElementById('add-candidate-leg'),
  addReplacementOption: document.getElementById('add-replacement-option'),
  replacementFeedback: document.getElementById('replacement-feedback')
};

let busy = false;
let settingsDirty = false;
let settingsLoaded = false;
let refreshTimer = null;
let picksFeedState = null;
let selectedPickId = '';
let replacementDirty = false;
let currentStatus = null;
let activePicksExpanded = false;

const referralWebhookInputPairs = [
  ['settingWebhookReferralsNew', 'quickWebhookReferralsNew'],
  ['settingWebhookReferralsUpdatedTerms', 'quickWebhookReferralsUpdatedTerms'],
  ['settingWebhookReferralsCancelled', 'quickWebhookReferralsCancelled'],
  ['settingWebhookReferralsMasterlist', 'quickWebhookReferralsMasterlist']
];

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatDate(value) {
  if (!value) {
    return 'Never';
  }

  return new Date(value).toLocaleString();
}

function formatUnits(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}u` : '0.00u';
}

function formatAudAmount(value) {
  return Number.isFinite(Number(value))
    ? `$${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2)} AUD`
    : 'Unknown';
}

function formatAudGain(value) {
  return Number.isFinite(Number(value))
    ? `+$${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2)} AUD`
    : 'Unknown';
}

function formatSignedUnits(value) {
  return Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}u` : '0.00u';
}

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : 'N/A';
}

function formatSportPerformanceLines(summary) {
  if (!Array.isArray(summary?.sportTotals) || !summary.sportTotals.length) {
    return [];
  }

  return summary.sportTotals
    .filter((item) => Number(item?.wins || 0) + Number(item?.losses || 0) + Number(item?.returns || 0) > 0 || Number(item?.totalNetUnits || 0) !== 0)
    .map((item) => {
      const record = `${Number(item.wins || 0)}W / ${Number(item.losses || 0)}L${Number(item.returns || 0) > 0 ? ` / ${Number(item.returns || 0)}R` : ''}`;
      return `${item.sport}: ${formatSignedUnits(item.totalNetUnits)} | ${record} | ${formatPercent(item.winLossPercent)}`;
    });
}

function formatTrackerBreakdown(summary) {
  const record = summary?.rollingRecord || {};
  const wins = Number(record.wins || 0);
  const losses = Number(record.losses || 0);
  const returns = Number(record.returns || 0);
  const sportLines = formatSportPerformanceLines(summary);
  const overallLine = `Record ${wins}W / ${losses}L / ${returns}R | Hit Rate ${formatPercent(summary?.rollingHitRatePercent)} | Day ${summary?.trackerDayNumber || 1}`;

  return sportLines.length ? [overallLine, ...sportLines].join('\n') : overallLine;
}

function markSettingsDirty(referralOnly = false) {
  settingsDirty = true;
  elements.settingsFeedback.textContent = 'Unsaved changes.';

  if (referralOnly) {
    elements.referralWebhookFeedback.textContent = 'Unsaved referral webhook changes.';
  }
}

function setInputValue(element, value) {
  if (element) {
    element.value = value;
  }
}

function bindMirroredInputs(settingKey, quickKey) {
  const settingInput = elements[settingKey];
  const quickInput = elements[quickKey];

  if (!settingInput || !quickInput) {
    return;
  }

  const syncInputs = (source, target) => {
    if (target.value !== source.value) {
      target.value = source.value;
    }

    markSettingsDirty(true);
  };

  settingInput.addEventListener('input', () => syncInputs(settingInput, quickInput));
  settingInput.addEventListener('change', () => syncInputs(settingInput, quickInput));
  quickInput.addEventListener('input', () => syncInputs(quickInput, settingInput));
  quickInput.addEventListener('change', () => syncInputs(quickInput, settingInput));
}

function setWebhookState(element, configured) {
  element.textContent = configured ? 'Configured' : 'Missing';
  element.className = configured ? 'state-ok' : 'state-danger';
}

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function appendMetaMessage(container, message) {
  const paragraph = document.createElement('p');
  paragraph.className = 'meta';
  paragraph.textContent = message;
  container.append(paragraph);
}

function formatDecimalOdds(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : null;
}

function getStatusToneClass(status) {
  const normalized = String(status || '').toLowerCase();

  if (['active', 'ok', 'posted_waiting_for_pregame_recheck', 'pregame_recheck_passed'].includes(normalized)) {
    return 'state-ok';
  }

  if (['replacement_posted', 'watching', 'pending'].includes(normalized)) {
    return 'state-warn';
  }

  if (['cancelled', 'canceled', 'blocked', 'failed'].includes(normalized)) {
    return 'state-danger';
  }

  return '';
}

function hasRenderableActivePicks() {
  return Array.isArray(currentStatus?.activePicks) && currentStatus.activePicks.length > 0;
}

function setActivePicksExpanded(nextExpanded) {
  const expanded = Boolean(nextExpanded) && hasRenderableActivePicks();

  activePicksExpanded = expanded;
  elements.activePicksDetails.hidden = !expanded;
  elements.activePicksPanel.setAttribute('aria-expanded', String(expanded));
  elements.activePicksPanel.tabIndex = hasRenderableActivePicks() ? 0 : -1;
  elements.activePicksPanel.classList.toggle('is-open', expanded);
  elements.activePicksPanel.classList.toggle('is-disabled', !hasRenderableActivePicks());
}

function toggleActivePicks() {
  if (!hasRenderableActivePicks()) {
    return;
  }

  setActivePicksExpanded(!activePicksExpanded);
}

function createStatusBadge(text, toneClass) {
  const badge = document.createElement('span');
  badge.className = `tracked-pick-badge${toneClass ? ` ${toneClass}` : ''}`;
  badge.textContent = text;
  return badge;
}

function createActivePickCard(pick) {
  const card = document.createElement('article');
  card.className = 'tracked-pick-card';

  const header = document.createElement('div');
  header.className = 'tracked-pick-header';

  const heading = document.createElement('div');

  const title = document.createElement('h3');
  title.textContent = pick.event || 'Unknown event';
  heading.append(title);

  const summary = document.createElement('p');
  summary.className = 'tracked-pick-summary';
  summary.textContent = pick.summary || 'No slip summary available.';
  heading.append(summary);

  const badges = document.createElement('div');
  badges.className = 'tracked-pick-badges';
  badges.append(createStatusBadge(pick.sportLabel || 'Pick', ''));
  badges.append(createStatusBadge(formatStatusLabel(pick.status || 'watching'), getStatusToneClass(pick.status)));

  if (pick.isReplacement) {
    badges.append(createStatusBadge('Replacement Live', 'state-warn'));
  }

  header.append(heading, badges);
  card.append(header);

  const primaryMetaParts = [
    pick.betType ? String(pick.betType).toUpperCase() : '',
    Number.isFinite(Number(pick.stakeUnits)) ? `Stake ${Number(pick.stakeUnits).toFixed(2)}u` : '',
    formatDecimalOdds(pick.priceDecimal) ? `Odds ${formatDecimalOdds(pick.priceDecimal)}` : '',
    pick.confidenceTier ? `${formatStatusLabel(pick.confidenceTier)} confidence` : '',
    pick.supportProjection ? `${formatStatusLabel(pick.supportProjection)} support` : ''
  ].filter(Boolean);

  if (primaryMetaParts.length) {
    const primaryMeta = document.createElement('p');
    primaryMeta.className = 'tracked-pick-meta';
    primaryMeta.textContent = primaryMetaParts.join(' | ');
    card.append(primaryMeta);
  }

  const secondaryMetaParts = [
    pick.postedAt ? `Posted ${formatDate(pick.postedAt)}` : '',
    pick.nextCheckAt ? `Next check ${formatDate(pick.nextCheckAt)}` : '',
    pick.lastCheckedAt ? `Last checked ${formatDate(pick.lastCheckedAt)}` : ''
  ].filter(Boolean);

  if (secondaryMetaParts.length) {
    const secondaryMeta = document.createElement('p');
    secondaryMeta.className = 'tracked-pick-meta';
    secondaryMeta.textContent = secondaryMetaParts.join(' | ');
    card.append(secondaryMeta);
  }

  if (pick.lastDecision || pick.lastValidationStatus) {
    const decisionMeta = document.createElement('p');
    decisionMeta.className = 'tracked-pick-meta';
    decisionMeta.textContent = [
      pick.lastDecision ? `Last decision ${formatStatusLabel(pick.lastDecision)}` : '',
      pick.lastValidationStatus ? `Validation ${formatStatusLabel(pick.lastValidationStatus)}` : ''
    ].filter(Boolean).join(' | ');
    card.append(decisionMeta);
  }

  if (Array.isArray(pick.legs) && pick.legs.length) {
    const legs = document.createElement('div');
    legs.className = 'tracked-pick-legs';

    for (const leg of pick.legs) {
      const legRow = document.createElement('div');
      legRow.className = 'tracked-pick-leg';

      const legLabel = document.createElement('span');
      legLabel.className = 'tracked-pick-leg-label';
      legLabel.textContent = leg.label || 'Unnamed leg';
      legRow.append(legLabel);

      if (leg.status) {
        const legStatus = document.createElement('span');
        legStatus.className = `tracked-pick-leg-status${getStatusToneClass(leg.status) ? ` ${getStatusToneClass(leg.status)}` : ''}`;
        legStatus.textContent = formatStatusLabel(leg.status);
        legRow.append(legStatus);
      }

      legs.append(legRow);
    }

    card.append(legs);
  } else {
    appendMetaMessage(card, 'Structured leg details are unavailable for this tracked slip.');
  }

  return card;
}

function renderActivePicks(picks) {
  clearNode(elements.activePicksList);

  if (!Array.isArray(picks) || !picks.length) {
    appendMetaMessage(elements.activePicksList, 'No picks currently under watch.');
    return;
  }

  for (const pick of picks) {
    elements.activePicksList.append(createActivePickCard(pick));
  }
}

function createPlanItem(title, badgeText, metaText, noteText) {
  const card = document.createElement('article');
  card.className = 'plan-item';

  const header = document.createElement('div');
  header.className = 'plan-item-header';

  const titleElement = document.createElement('strong');
  titleElement.textContent = title;
  header.append(titleElement);

  if (badgeText) {
    const badge = document.createElement('span');
    badge.className = 'plan-badge';
    badge.textContent = badgeText;
    header.append(badge);
  }

  const meta = document.createElement('p');
  meta.className = 'plan-item-meta';
  meta.textContent = metaText;

  card.append(header, meta);

  if (noteText) {
    const note = document.createElement('p');
    note.className = 'plan-item-note';
    note.textContent = noteText;
    card.append(note);
  }

  return card;
}

function renderReferralPlan(plan) {
  clearNode(elements.referralPlanSteps);
  clearNode(elements.referralPlanDeferred);

  if (!plan?.steps?.length) {
    elements.referralPlanSummary.textContent = 'Run the referrals job once to build the current ladder.';
    elements.referralPlanDeferredSummary.textContent = 'Offers land here when value is unclear, capital is still too high, or the public-sharing policy is restrictive.';
    appendMetaMessage(elements.referralPlanSteps, 'No referral capital plan available yet.');
    appendMetaMessage(elements.referralPlanDeferred, 'No deferred offers yet.');
    return;
  }

  const trackedOffers = Number(plan.trackedOffers || 0);
  const fetchFailures = Number(plan.fetchFailures || 0);
  elements.referralPlanSummary.textContent = `Start ${formatAudAmount(plan.startingCapitalAud)} | Est. finish ${formatAudAmount(plan.projectedEndingCapitalAud)} | ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'} | ~${Number(plan.totalEstimatedDays || 0).toFixed(Number(plan.totalEstimatedDays || 0) % 1 === 0 ? 0 : 1)} day${Number(plan.totalEstimatedDays || 0) === 1 ? '' : 's'}${trackedOffers > 0 ? ` | ${trackedOffers} tracked offer${trackedOffers === 1 ? '' : 's'}` : ''}${plan.updatedAt ? ` | Synced ${formatDate(plan.updatedAt)}` : ''}`;
  elements.referralPlanDeferredSummary.textContent = fetchFailures > 0
    ? `${fetchFailures} referral source${fetchFailures === 1 ? '' : 's'} failed on the last sync, so stale entries may remain in the deferred list.`
    : 'Offers land here when value is unclear, capital is still too high, or the public-sharing policy is restrictive.';

  for (const step of plan.steps) {
    elements.referralPlanSteps.append(createPlanItem(
      `${step.order}. ${step.brand} - ${step.title}`,
      formatAudGain(step.combinedAdvertisedValueAud),
      `Bank ${formatAudAmount(step.startingCapitalAud)} -> ${formatAudAmount(step.projectedEndingCapitalAud)} | Need ${formatAudAmount(step.activationCapitalAud)} working capital | Payout ~${Number(step.estimatedPayoutDays || 0).toFixed(Number(step.estimatedPayoutDays || 0) % 1 === 0 ? 0 : 1)} day${Number(step.estimatedPayoutDays || 0) === 1 ? '' : 's'}`,
      step.rationale || ''
    ));
  }

  if (Array.isArray(plan.deferred) && plan.deferred.length) {
    for (const item of plan.deferred) {
      elements.referralPlanDeferred.append(createPlanItem(
        `${item.brand} - ${item.title}`,
        item.combinedAdvertisedValueAud ? formatAudGain(item.combinedAdvertisedValueAud) : formatStatusLabel(item.status || 'review_required'),
        `Capital gate ${formatAudAmount(item.activationCapitalAud)} | Status ${formatStatusLabel(item.status || 'review_required')}`,
        item.reason || ''
      ));
    }
  } else {
    appendMetaMessage(elements.referralPlanDeferred, 'No deferred offers yet.');
  }
}

function createReferralReviewItem(item) {
  const card = document.createElement('article');
  card.className = 'plan-item';

  const header = document.createElement('div');
  header.className = 'plan-item-header';

  const title = document.createElement('strong');
  title.textContent = `${item.brand} - ${item.title}`;
  header.append(title);

  const badge = document.createElement('span');
  badge.className = 'plan-badge';
  badge.textContent = Number.isFinite(Number(item.score)) ? `${Number(item.score)}/100` : formatStatusLabel(item.confidence || 'medium');
  header.append(badge);

  const meta = document.createElement('p');
  meta.className = 'plan-item-meta';
  meta.textContent = `${item.rewardSummary} | ${item.requirementSummary}`;

  const note = document.createElement('p');
  note.className = 'plan-item-note';
  note.textContent = `${formatStatusLabel(item.status)} | ${formatStatusLabel(item.confidence)} confidence | ${formatStatusLabel(item.discoverySource)} | Last checked ${item.lastSuccessfulSyncAt ? formatDate(item.lastSuccessfulSyncAt) : 'Never'}`;

  card.append(header, meta, note);

  const sourceUrls = [item.officialOfferUrl, item.officialTermsUrl].filter(Boolean);

  if (sourceUrls.length) {
    const sources = document.createElement('p');
    sources.className = 'plan-item-meta';

    for (const [index, sourceUrl] of sourceUrls.entries()) {
      const link = document.createElement('a');
      link.className = 'referral-review-link';
      link.href = sourceUrl;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = index === 0 ? 'Offer page' : 'Terms page';
      sources.append(link);

      if (index < sourceUrls.length - 1) {
        sources.append(document.createTextNode(' | '));
      }
    }

    card.append(sources);
  }

  const actions = document.createElement('div');
  actions.className = 'referral-review-actions';

  const verifyButton = document.createElement('button');
  verifyButton.type = 'button';
  verifyButton.className = 'secondary-button compact-action';
  verifyButton.textContent = 'Verify';
  verifyButton.dataset.referralVerify = item.id;
  actions.append(verifyButton);

  card.append(actions);
  return card;
}

function renderReferralReview(review) {
  clearNode(elements.referralReviewList);

  const counts = review?.counts || {};
  elements.referralReviewSummary.textContent = `${Number(counts.pendingActive || 0)} pending active | ${Number(counts.verifiedActive || 0)} verified | ${Number(counts.inactive || 0)} inactive`;

  if (!Array.isArray(review?.items) || !review.items.length) {
    appendMetaMessage(elements.referralReviewList, 'No pending referrals right now.');
    return;
  }

  for (const item of review.items) {
    elements.referralReviewList.append(createReferralReviewItem(item));
  }
}

function formatStatusLabel(value) {
  return String(value || 'review_required')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatSlateSourceLabel(source) {
  if (source === 'sports-game-odds-fallback') {
    return 'SportsGameOdds fallback';
  }

  if (source === 'market-scrape') {
    return 'market scrape';
  }

  return source || 'manual run';
}

function formatForcedPickList(picks) {
  if (!Array.isArray(picks) || !picks.length) {
    return '';
  }

  const labels = picks.slice(0, 3).map((pick) => {
    const event = pick?.event || 'Unknown event';
    const legCount = Number(pick?.legCount || 0);
    return legCount > 0 ? `${event} (${legCount} legs)` : event;
  });

  if (picks.length > 3) {
    labels.push(`+${picks.length - 3} more`);
  }

  return labels.join(' | ');
}

function renderSettings(settings) {
  if (!settings) {
    return;
  }
  const pickRoles = settings.roleMentions?.picks || {};

  elements.settingDryRun.checked = Boolean(settings.dryRun);
  elements.settingAnalysisEngine.value = settings.analysis?.engine || 'rules';
  elements.settingWebhookSlates.value = settings.webhooks?.slates || '';
  elements.settingWebhookPicks.value = settings.webhooks?.picks || '';
  elements.settingWebhookPicksNba.value = settings.webhooks?.picksNba || '';
  elements.settingWebhookPicksMlb.value = settings.webhooks?.picksMlb || '';
  elements.settingWebhookPicksAfl.value = settings.webhooks?.picksAfl || '';
  elements.settingWebhookPicksNrl.value = settings.webhooks?.picksNrl || '';
  elements.settingWebhookPicksNfl.value = settings.webhooks?.picksNfl || '';
  elements.settingWebhookPicksEpl.value = settings.webhooks?.picksEpl || '';
  elements.settingWebhookPicksOther.value = settings.webhooks?.picksOther || '';
  elements.settingWebhookReferralsNew.value = settings.webhooks?.referralsNew || '';
  elements.settingWebhookReferralsUpdatedTerms.value = settings.webhooks?.referralsUpdatedTerms || '';
  elements.settingWebhookReferralsCancelled.value = settings.webhooks?.referralsCancelled || '';
  elements.settingWebhookReferralsMasterlist.value = settings.webhooks?.referralsMasterlist || '';
  setInputValue(elements.quickWebhookReferralsNew, settings.webhooks?.referralsNew || '');
  setInputValue(elements.quickWebhookReferralsUpdatedTerms, settings.webhooks?.referralsUpdatedTerms || '');
  setInputValue(elements.quickWebhookReferralsCancelled, settings.webhooks?.referralsCancelled || '');
  setInputValue(elements.quickWebhookReferralsMasterlist, settings.webhooks?.referralsMasterlist || '');
  elements.settingWebhookUnitTracking.value = settings.webhooks?.unitTracking || '';
  elements.settingWebhookUnitReport.value = settings.webhooks?.unitReport || '';
  elements.settingRoleEnabled.checked = Boolean(settings.roleMentions?.enabled);
  elements.settingRoleText.value = settings.roleMentions?.slates || '';
  elements.settingRoleSlates.value = pickRoles.shared || '';
  elements.settingRolePicksNba.value = pickRoles.nba || '';
  elements.settingRolePicksMlb.value = pickRoles.mlb || '';
  elements.settingRolePicksAfl.value = pickRoles.afl || '';
  elements.settingRolePicksNrl.value = pickRoles.nrl || '';
  elements.settingRolePicksNfl.value = pickRoles.nfl || '';
  elements.settingRolePicksEpl.value = pickRoles.epl || '';
  elements.settingRolePicksOther.value = pickRoles.other || '';
  settingsLoaded = true;
}

function createRowButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createCurrentLegRow(leg = {}) {
  const row = document.createElement('div');
  row.className = 'editable-row';
  row.innerHTML = `
    <div class="row-grid row-grid-legs">
      <label class="field compact"><span>Label</span><input data-field="label" type="text" /></label>
      <label class="field compact"><span>Model Prob.</span><input data-field="modelProbability" type="number" min="0" max="1" step="0.001" /></label>
      <label class="field compact"><span>Support /10</span><input data-field="supportScore" type="number" min="0" max="10" step="0.1" /></label>
      <label class="field compact"><span>Confidence</span>
        <select data-field="confidenceTier" class="select-input compact-select">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label class="field compact"><span>Status</span>
        <select data-field="status" class="select-input compact-select">
          <option value="active">Active</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
          <option value="canceled">Canceled</option>
          <option value="voided">Voided</option>
        </select>
      </label>
      <label class="field compact toggle-inline"><span>Locked</span><input data-field="locked" type="checkbox" /></label>
      <label class="field compact option-span"><span>Rationale</span><textarea data-field="rationale" rows="2"></textarea></label>
    </div>
  `;

  row.querySelector('[data-field="label"]').value = leg.label || '';
  row.querySelector('[data-field="modelProbability"]').value = leg.modelProbability ?? '';
  row.querySelector('[data-field="supportScore"]').value = leg.supportScore ?? '';
  row.querySelector('[data-field="confidenceTier"]').value = leg.confidenceTier || 'medium';
  row.querySelector('[data-field="status"]').value = leg.status || 'active';
  row.querySelector('[data-field="locked"]').checked = Boolean(leg.locked);
  row.querySelector('[data-field="rationale"]').value = leg.rationale || '';
  row.append(createRowButton('Remove', () => {
    row.remove();
    markReplacementDirty();
  }));
  wireDirtyInputs(row);
  return row;
}

function createCandidateLegRow(leg = {}) {
  const row = document.createElement('div');
  row.className = 'editable-row';
  row.innerHTML = `
    <div class="row-grid row-grid-legs">
      <label class="field compact"><span>Label</span><input data-field="label" type="text" /></label>
      <label class="field compact"><span>Model Prob.</span><input data-field="modelProbability" type="number" min="0" max="1" step="0.001" /></label>
      <label class="field compact"><span>Support /10</span><input data-field="supportScore" type="number" min="0" max="10" step="0.1" /></label>
      <label class="field compact"><span>Confidence</span>
        <select data-field="confidenceTier" class="select-input compact-select">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label class="field compact toggle-inline"><span>Locked</span><input data-field="locked" type="checkbox" /></label>
      <label class="field compact option-span"><span>Rationale</span><textarea data-field="rationale" rows="2"></textarea></label>
    </div>
  `;

  row.querySelector('[data-field="label"]').value = leg.label || '';
  row.querySelector('[data-field="modelProbability"]').value = leg.modelProbability ?? '';
  row.querySelector('[data-field="supportScore"]').value = leg.supportScore ?? '';
  row.querySelector('[data-field="confidenceTier"]').value = leg.confidenceTier || 'medium';
  row.querySelector('[data-field="locked"]').checked = Boolean(leg.locked);
  row.querySelector('[data-field="rationale"]').value = leg.rationale || '';
  row.append(createRowButton('Remove', () => {
    row.remove();
    markReplacementDirty();
  }));
  wireDirtyInputs(row);
  return row;
}

function createReplacementOptionRow(option = {}) {
  const row = document.createElement('div');
  row.className = 'editable-row';
  row.dataset.optionLegs = JSON.stringify(Array.isArray(option.legs) ? option.legs : []);
  row.dataset.generatedFromTemplate = option.generatedFromTemplate ? 'true' : 'false';
  row.innerHTML = `
    <div class="row-grid row-grid-options">
      <label class="field compact option-span"><span>Summary</span><input data-field="summary" type="text" /></label>
      <label class="field compact"><span>Bet Type</span>
        <select data-field="betType" class="select-input compact-select">
          <option value="sgm">SGM</option>
          <option value="single">Single</option>
        </select>
      </label>
      <label class="field compact"><span>Model Prob.</span><input data-field="modelProbability" type="number" min="0" max="1" step="0.001" /></label>
      <label class="field compact"><span>Support /10</span><input data-field="supportScore" type="number" min="0" max="10" step="0.1" /></label>
      <label class="field compact"><span>Projection</span>
        <select data-field="supportProjection" class="select-input compact-select">
          <option value="cautious">Cautious</option>
          <option value="moderate">Moderate</option>
          <option value="strong">Strong</option>
        </select>
      </label>
      <label class="field compact"><span>Confidence</span>
        <select data-field="confidenceTier" class="select-input compact-select">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label class="field compact"><span>Data Confidence</span>
        <select data-field="dataConfidence" class="select-input compact-select">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label class="field compact option-span"><span>Rationale</span><textarea data-field="rationale" rows="2"></textarea></label>
    </div>
  `;

  row.querySelector('[data-field="summary"]').value = option.summary || '';
  row.querySelector('[data-field="betType"]').value = option.betType || 'sgm';
  row.querySelector('[data-field="modelProbability"]').value = option.modelProbability ?? '';
  row.querySelector('[data-field="supportScore"]').value = option.supportScore ?? '';
  row.querySelector('[data-field="supportProjection"]').value = option.supportProjection || 'moderate';
  row.querySelector('[data-field="confidenceTier"]').value = option.confidenceTier || 'medium';
  row.querySelector('[data-field="dataConfidence"]').value = option.dataConfidence || 'medium';
  row.querySelector('[data-field="rationale"]').value = option.rationale || '';
  row.append(createRowButton('Remove', () => {
    row.remove();
    markReplacementDirty();
  }));
  wireDirtyInputs(row);
  return row;
}

function wireDirtyInputs(container) {
  for (const input of container.querySelectorAll('input, textarea, select')) {
    input.addEventListener('input', markReplacementDirty);
    input.addEventListener('change', markReplacementDirty);
  }
}

function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function markReplacementDirty() {
  replacementDirty = true;
  elements.replacementFeedback.textContent = 'Unsaved replacement changes.';
}

function parseNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readLegRows(container, includeStatus = false) {
  return [...container.querySelectorAll('.editable-row')].map((row, index) => {
    const leg = {
      id: `ui-${index + 1}`,
      label: row.querySelector('[data-field="label"]').value.trim(),
      modelProbability: parseNumber(row.querySelector('[data-field="modelProbability"]').value),
      supportScore: parseNumber(row.querySelector('[data-field="supportScore"]').value),
      confidenceTier: row.querySelector('[data-field="confidenceTier"]').value,
      rationale: row.querySelector('[data-field="rationale"]').value.trim(),
      locked: row.querySelector('[data-field="locked"]').checked
    };

    if (includeStatus) {
      leg.status = row.querySelector('[data-field="status"]').value;
    }

    return leg;
  }).filter((leg) => leg.label);
}

function readReplacementOptions() {
  return [...elements.replacementOptionsList.querySelectorAll('.editable-row')].map((row, index) => ({
    variantId: `ui-option-${index + 1}`,
    summary: row.querySelector('[data-field="summary"]').value.trim(),
    betType: row.querySelector('[data-field="betType"]').value,
    modelProbability: parseNumber(row.querySelector('[data-field="modelProbability"]').value),
    supportScore: parseNumber(row.querySelector('[data-field="supportScore"]').value),
    supportProjection: row.querySelector('[data-field="supportProjection"]').value,
    confidenceTier: row.querySelector('[data-field="confidenceTier"]').value,
    dataConfidence: row.querySelector('[data-field="dataConfidence"]').value,
    rationale: row.querySelector('[data-field="rationale"]').value.trim(),
    generatedFromTemplate: row.dataset.generatedFromTemplate === 'true',
    legs: parseJson(row.dataset.optionLegs || '[]', [])
  })).filter((option) => option.summary);
}

function renderPickSelect() {
  clearChildren(elements.replacementPickSelect);

  const picks = picksFeedState?.picks || [];

  if (!picks.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No picks in feed';
    elements.replacementPickSelect.append(option);
    selectedPickId = '';
    return;
  }

  if (!selectedPickId || !picks.some((pick) => pick.id === selectedPickId)) {
    selectedPickId = picks[0].id;
  }

  for (const pick of picks) {
    const option = document.createElement('option');
    option.value = pick.id;
    option.textContent = `${pick.id} | ${pick.summary || pick.event || 'Untitled pick'}`;
    option.selected = pick.id === selectedPickId;
    elements.replacementPickSelect.append(option);
  }
}

function renderReplacementEditor() {
  const pick = picksFeedState?.picks?.find((candidate) => candidate.id === selectedPickId);

  elements.picksFeedPath.textContent = picksFeedState?.picksFeedPath || '';

  clearChildren(elements.currentLegsList);
  clearChildren(elements.candidateLegsList);
  clearChildren(elements.replacementOptionsList);

  if (!pick) {
    elements.replacementPickMeta.textContent = 'Load a pick from the feed to edit its replacement setup.';
    elements.replacementStatus.value = '';
    elements.replacementReason.value = '';
    elements.replacementMaxOptions.value = 1;
    return;
  }

  elements.replacementPickMeta.textContent = `${pick.summary || pick.event || 'Untitled pick'} | ${pick.sport || 'Unknown sport'} | Starts ${formatDate(pick.startTime)}`;
  elements.replacementStatus.value = pick.replacementStatus || '';
  elements.replacementReason.value = pick.replacementReason || '';
  elements.replacementMaxOptions.value = pick.replacementTemplate?.maxOptions || 1;

  const currentLegs = Array.isArray(pick.legs) && pick.legs.length
    ? pick.legs
    : [];

  const candidateLegs = Array.isArray(pick.replacementTemplate?.candidateLegs) && pick.replacementTemplate.candidateLegs.length
    ? pick.replacementTemplate.candidateLegs
    : [];

  const replacementOptions = Array.isArray(pick.replacementOptions) && pick.replacementOptions.length
    ? pick.replacementOptions
    : (Array.isArray(pick.generatedReplacementOptions) ? pick.generatedReplacementOptions : []);

  if (!currentLegs.length) {
    elements.currentLegsList.append(createCurrentLegRow());
  } else {
    for (const leg of currentLegs) {
      elements.currentLegsList.append(createCurrentLegRow(leg));
    }
  }

  if (!candidateLegs.length) {
    elements.candidateLegsList.append(createCandidateLegRow());
  } else {
    for (const leg of candidateLegs) {
      elements.candidateLegsList.append(createCandidateLegRow(leg));
    }
  }

  if (!replacementOptions.length) {
    elements.replacementOptionsList.append(createReplacementOptionRow());
  } else {
    for (const option of replacementOptions) {
      elements.replacementOptionsList.append(createReplacementOptionRow(option));
    }
  }

  replacementDirty = false;
  elements.replacementFeedback.textContent = 'Replacement setup loaded from picks-feed.json.';
}

function collectReplacementDraft() {
  return {
    pickId: selectedPickId,
    replacementStatus: elements.replacementStatus.value,
    replacementReason: elements.replacementReason.value.trim(),
    maxOptions: parseNumber(elements.replacementMaxOptions.value) || 5,
    legs: readLegRows(elements.currentLegsList, true),
    candidateLegs: readLegRows(elements.candidateLegsList, false),
    replacementOptions: readReplacementOptions()
  };
}

async function loadPicksFeed(pickId = selectedPickId) {
  picksFeedState = await window.sportsTipsDesktop.getPicksFeed();
  selectedPickId = pickId || picksFeedState.picks?.[0]?.id || '';
  renderPickSelect();
  renderReplacementEditor();
}

function collectSettings() {
  return {
    dryRun: elements.settingDryRun.checked,
    analysis: {
      engine: elements.settingAnalysisEngine.value
    },
    webhooks: {
      slates: elements.settingWebhookSlates.value.trim(),
      picks: elements.settingWebhookPicks.value.trim(),
      picksNba: elements.settingWebhookPicksNba.value.trim(),
      picksMlb: elements.settingWebhookPicksMlb.value.trim(),
      picksAfl: elements.settingWebhookPicksAfl.value.trim(),
      picksNrl: elements.settingWebhookPicksNrl.value.trim(),
      picksNfl: elements.settingWebhookPicksNfl.value.trim(),
      picksEpl: elements.settingWebhookPicksEpl.value.trim(),
      picksOther: elements.settingWebhookPicksOther.value.trim(),
      referralsNew: elements.settingWebhookReferralsNew.value.trim(),
      referralsUpdatedTerms: elements.settingWebhookReferralsUpdatedTerms.value.trim(),
      referralsCancelled: elements.settingWebhookReferralsCancelled.value.trim(),
      referralsMasterlist: elements.settingWebhookReferralsMasterlist.value.trim(),
      unitTracking: elements.settingWebhookUnitTracking.value.trim(),
      unitReport: elements.settingWebhookUnitReport.value.trim()
    },
    roleMentions: {
      enabled: elements.settingRoleEnabled.checked,
      slates: elements.settingRoleText.value.trim(),
      picks: {
        shared: elements.settingRoleSlates.value.trim(),
        nba: elements.settingRolePicksNba.value.trim(),
        mlb: elements.settingRolePicksMlb.value.trim(),
        afl: elements.settingRolePicksAfl.value.trim(),
        nrl: elements.settingRolePicksNrl.value.trim(),
        nfl: elements.settingRolePicksNfl.value.trim(),
        epl: elements.settingRolePicksEpl.value.trim(),
        other: elements.settingRolePicksOther.value.trim()
      }
    }
  };
}

function render(status) {
  currentStatus = status;
  const running = Boolean(status.running);
  elements.toggleButton.textContent = running ? 'Turn Off' : 'Turn On';
  elements.toggleButton.classList.toggle('is-running', running);
  elements.toggleButton.disabled = busy;

  elements.daemonState.textContent = running ? 'Running' : 'Stopped';
  elements.daemonState.className = running ? 'value state-ok' : 'value state-danger';
  elements.daemonMeta.textContent = running
    ? `PID ${status.pid} | Heartbeat ${formatDate(status.heartbeatAt)}`
    : `Last stop reason: ${status.stopReason || 'Not recorded'}`;

  elements.creditsValue.textContent = status.lastMarketQuoteCount === null ? 'Unknown' : String(status.lastMarketQuoteCount);
  elements.watchedPicks.textContent = String(status.watchedPicks || 0);
  elements.watchedPicksMeta.textContent = Number(status.watchedPicks || 0) > 0
    ? `${Number(status.watchedPicks || 0)} tracked slip${Number(status.watchedPicks || 0) === 1 ? '' : 's'} currently under watch. Click to ${activePicksExpanded ? 'hide' : 'show'} the games and legs.`
    : 'No picks are currently under watch.';
  elements.timezoneValue.textContent = status.timezone || '-';
  elements.dryRunValue.textContent = `${status.running ? 'Daemon' : 'Saved config'} ${status.dryRun ? 'dry run is ON' : 'dry run is OFF'}${status.settingsApplyRequiresRestart ? ' | Restart needed to apply saved webhook/live-mode changes' : ''} | Analysis ${String(status.analysisEngine || 'rules').toUpperCase()}${status.lastMarketRefreshAt ? ` | Scrape ${formatDate(status.lastMarketRefreshAt)}` : ''}`;
  renderActivePicks(status.activePicks || []);
  setActivePicksExpanded(activePicksExpanded);

  if (status.trackerSummary) {
    elements.trackerUnitsValue.textContent = `Bankroll ${formatUnits(status.trackerSummary.currentUnits)}`;
    elements.trackerUnitsMeta.textContent = `Start ${formatUnits(status.trackerSummary.startingBankrollUnits)} | Net ${formatSignedUnits(status.trackerSummary.totalNetUnits)} | Open ${formatUnits(status.trackerSummary.openExposureUnits)} | 30 Day ROI ${formatPercent(status.trackerSummary.rollingBankrollRoiPercent)}`;
    elements.trackerSportBreakdown.textContent = formatTrackerBreakdown(status.trackerSummary);
  } else {
    elements.trackerUnitsValue.textContent = '0.00u';
    elements.trackerUnitsMeta.textContent = 'Current bankroll, open exposure, and 30-day ROI from the bankroll tracker.';
    elements.trackerSportBreakdown.textContent = 'No tracked bankroll performance yet.';
  }

  setWebhookState(elements.webhookSlates, status.webhookConfigured?.slates);
  setWebhookState(elements.webhookPicks, status.webhookConfigured?.picks);
  setWebhookState(elements.webhookPicksNba, status.webhookConfigured?.picksNba);
  setWebhookState(elements.webhookPicksMlb, status.webhookConfigured?.picksMlb);
  setWebhookState(elements.webhookPicksAfl, status.webhookConfigured?.picksAfl);
  setWebhookState(elements.webhookPicksNrl, status.webhookConfigured?.picksNrl);
  setWebhookState(elements.webhookPicksNfl, status.webhookConfigured?.picksNfl);
  setWebhookState(elements.webhookPicksEpl, status.webhookConfigured?.picksEpl);
  setWebhookState(elements.webhookPicksOther, status.webhookConfigured?.picksOther);
  setWebhookState(elements.webhookReferralsNew, status.webhookConfigured?.referralsNew);
  setWebhookState(elements.webhookReferralsUpdatedTerms, status.webhookConfigured?.referralsUpdatedTerms);
  setWebhookState(elements.webhookReferralsCancelled, status.webhookConfigured?.referralsCancelled);
  setWebhookState(elements.webhookReferralsMasterlist, status.webhookConfigured?.referralsMasterlist);
  setWebhookState(elements.webhookUnitTracking, status.webhookConfigured?.unitTracking);
  setWebhookState(elements.webhookUnitReport, status.webhookConfigured?.unitReport);
  renderReferralReview(status.referralReview);
  renderReferralPlan(status.referralPlan);

  elements.configPath.textContent = status.configPath || '';

  if (!settingsLoaded || !settingsDirty) {
    renderSettings(status.settings);
  }

  if (!settingsDirty) {
    elements.settingsFeedback.textContent = status.settingsApplyRequiresRestart
      ? 'Daemon is running on older settings. Restart it to apply saved webhook/live-mode changes.'
      : status.running
        ? 'Daemon is using the current saved settings.'
        : 'Settings are loaded from config.json.';

    elements.referralWebhookFeedback.textContent = status.settingsApplyRequiresRestart
      ? 'Saved referral webhook changes need a daemon restart to go live.'
      : 'Paste matching referral webhook URLs here and save.';
  }
}

async function refresh() {
  const status = await window.sportsTipsDesktop.getStatus();
  render(status);
  return status;
}

async function toggleDaemon() {
  busy = true;
  elements.toggleButton.disabled = true;

  try {
    const status = await window.sportsTipsDesktop.getStatus();

    if (status.running) {
      render(await window.sportsTipsDesktop.stopDaemon());
    } else {
      render(await window.sportsTipsDesktop.startDaemon());
    }
  } finally {
    busy = false;
    await refresh();
  }
}

async function saveSettings(feedbackTargets = [elements.settingsFeedback]) {
  const targets = [...new Set(feedbackTargets.filter(Boolean))];

  elements.saveSettings.disabled = true;
  elements.saveReferralWebhooks.disabled = true;

  for (const target of targets) {
    target.textContent = 'Saving settings...';
  }

  try {
    const status = await window.sportsTipsDesktop.saveSettings(collectSettings());
    settingsDirty = false;
    render(status);
    const successMessage = status.settingsApplyRequiresRestart
      ? 'Saved. Restart the daemon to use the new settings.'
      : 'Saved.';

    for (const target of targets) {
      target.textContent = successMessage;
    }
  } catch (error) {
    for (const target of targets) {
      target.textContent = error.message;
    }
  } finally {
    elements.saveSettings.disabled = false;
    elements.saveReferralWebhooks.disabled = false;
  }
}

async function forcePostSlates() {
  elements.forcePostSlates.disabled = true;
  elements.quickActionsFeedback.textContent = 'Refreshing today\'s slate and posting now...';

  try {
    const result = await window.sportsTipsDesktop.forcePostSlates();

    if (result.dryRun) {
      elements.quickActionsFeedback.textContent = result.posted > 0
        ? `Slate run completed in dry-run mode for ${result.targetDateKey || 'the next actionable slate'}. ${result.posted} message${result.posted === 1 ? '' : 's'} prepared, nothing posted.`
        : 'No slate messages were posted. No actionable slate was found in the current lookahead window.';
    } else {
      elements.quickActionsFeedback.textContent = result.posted > 0
        ? `Posted ${result.posted} slate message${result.posted === 1 ? '' : 's'} for ${result.targetDateKey || 'the next actionable slate'} from ${formatSlateSourceLabel(result.source)}.`
        : 'No slate messages were posted. No actionable slate was found in the current lookahead window.';
    }

    await refresh();
  } catch (error) {
    elements.quickActionsFeedback.textContent = error.message;
  } finally {
    elements.forcePostSlates.disabled = false;
  }
}

async function forceDailyCheck() {
  elements.forceDailyCheck.disabled = true;
  elements.quickActionsFeedback.textContent = 'Resetting today\'s generated state, refreshing the market snapshot, and running slates, analysis, and picks...';

  try {
    const result = await window.sportsTipsDesktop.forceDailyCheck();
    const postedPickList = formatForcedPickList(result.picks?.picks);
    const pickSummary = result.picks?.posted > 0
      ? `${result.dryRun ? 'Prepared' : 'Posted'} ${result.picks.posted} pick${result.picks.posted === 1 ? '' : 's'}${postedPickList ? `: ${postedPickList}` : '.'}`
      : `Posted 0 picks${result.picks?.watched ? `, ${result.picks.watched} watched` : ''}.`;

    elements.quickActionsFeedback.textContent = `${result.dryRun ? 'Dry-run daily check completed.' : 'Force daily check completed.'} Cleared ${result.prepare.removedGeneratedFeedPicks} generated feed picks, ${result.prepare.removedPostedPickIds} posted pick ids, and ${result.prepare.removedTrackingPickIds} tracked generated entries. Slate messages: ${result.slates.posted}. Analysis generated ${result.analysis.generated} from ${result.analysis.considered} events. ${pickSummary}`;

    await refresh();
    await loadPicksFeed();
  } catch (error) {
    elements.quickActionsFeedback.textContent = error.message;
  } finally {
    elements.forceDailyCheck.disabled = false;
  }
}

async function reviewResults() {
  elements.reviewResults.disabled = true;
  elements.quickActionsFeedback.textContent = 'Reviewing open bets, settling anything final, refreshing tracked units, and posting the current unit report...';

  try {
    const result = await window.sportsTipsDesktop.reviewResults();
    const trackerSummary = result.trackerSummary;
    const dayLabel = trackerSummary?.trackerDayNumber ? `Day ${trackerSummary.trackerDayNumber}` : 'the current tracker day';
    const bankrollSummary = trackerSummary
      ? `${formatSignedUnits(trackerSummary.totalNetUnits)} total | Bankroll ${formatUnits(trackerSummary.currentUnits)}`
      : 'Tracker summary unavailable.';

    elements.quickActionsFeedback.textContent = `${result.dryRun ? 'Dry-run results review complete.' : 'Results review complete.'} Settlements posted: ${result.settlementsPosted}. Auto-settled: ${result.autoSettled}. Pending review: ${result.pendingReview}. ${result.dryRun ? 'Prepared' : 'Posted'} ${result.unitReportPosted} unit report message${result.unitReportPosted === 1 ? '' : 's'} for ${dayLabel}. ${bankrollSummary}`;

    await refresh();
    await loadPicksFeed();
  } catch (error) {
    elements.quickActionsFeedback.textContent = error.message;
  } finally {
    elements.reviewResults.disabled = false;
  }
}

async function forcePostPicks() {
  elements.forcePostPicks.disabled = true;
  elements.quickActionsFeedback.textContent = 'Posting currently approved picks now...';

  try {
    const result = await window.sportsTipsDesktop.forcePostPicks();
    const pickList = formatForcedPickList(result.picks);

    elements.quickActionsFeedback.textContent = result.posted > 0
      ? `${result.dryRun ? 'Prepared' : 'Posted'} ${result.posted} approved pick${result.posted === 1 ? '' : 's'}${pickList ? `: ${pickList}` : '.'}${result.dryRun ? ' Dry-run mode kept Discord unchanged.' : ''}`
      : `No current approved picks were ready to force post.${result.watched ? ` ${result.watched} watched pick${result.watched === 1 ? '' : 's'} remain under the normal scheduler.` : ''}`;

    await refresh();
  } catch (error) {
    elements.quickActionsFeedback.textContent = error.message;
  } finally {
    elements.forcePostPicks.disabled = false;
  }
}

async function runReferralsNow() {
  elements.runReferralsNow.disabled = true;
  elements.quickActionsFeedback.textContent = 'Running the referrals monitor now, refreshing the ladder, and publishing any referral changes...';

  try {
    const result = await window.sportsTipsDesktop.runReferralsNow();
    const changeSummary = `${result.newCount} new, ${result.updatedCount} updated, ${result.cancelledCount} cancelled`;
    const fetchFailureSummary = result.fetchFailureCount > 0
      ? ` ${result.fetchFailureCount} fetch failure${result.fetchFailureCount === 1 ? '' : 's'} need review.`
      : '';

    elements.quickActionsFeedback.textContent = result.changes > 0
      ? `${result.dryRun ? 'Prepared' : 'Processed'} ${result.changes} referral change${result.changes === 1 ? '' : 's'} across ${result.offers} tracked offer${result.offers === 1 ? '' : 's'} (${changeSummary}). ${result.dryRun ? 'Dry-run kept Discord unchanged.' : `Posted ${result.posted} referral webhook message${result.posted === 1 ? '' : 's'} and refreshed the masterlist.`}${fetchFailureSummary}`
      : `${result.dryRun ? 'Dry-run' : 'Referrals run'} completed. No referral changes were detected across ${result.offers} tracked offer${result.offers === 1 ? '' : 's'}; the masterlist was refreshed.${fetchFailureSummary}`;

    await refresh();
  } catch (error) {
    elements.quickActionsFeedback.textContent = error.message;
  } finally {
    elements.runReferralsNow.disabled = false;
  }
}

async function verifyReferral(offerId) {
  if (!offerId) {
    return;
  }

  elements.referralReviewFeedback.textContent = 'Verifying referral, removing it from New Referrals, and refreshing the masterlist...';

  try {
    const result = await window.sportsTipsDesktop.verifyReferral({ offerId });
    elements.referralReviewFeedback.textContent = result.dryRun
      ? 'Dry-run verification completed. Discord was not changed.'
      : 'Referral verified and promoted into the masterlist.';
    await refresh();
  } catch (error) {
    elements.referralReviewFeedback.textContent = error.message;
  }
}

async function generateReplacements() {
  elements.generateReplacements.disabled = true;
  elements.replacementFeedback.textContent = 'Generating replacement candidates...';

  try {
    const preview = await window.sportsTipsDesktop.generateReplacementPreview(collectReplacementDraft());
    clearChildren(elements.replacementOptionsList);

    const options = Array.isArray(preview.options) ? preview.options : [];

    if (!options.length) {
      elements.replacementOptionsList.append(createReplacementOptionRow());
      elements.replacementFeedback.textContent = 'No generated replacements. Add candidate legs or mark a leg as refunded/cancelled.';
    } else {
      for (const option of options) {
        elements.replacementOptionsList.append(createReplacementOptionRow(option));
      }

      replacementDirty = true;
      elements.replacementFeedback.textContent = `Generated ${options.length} candidate replacement ${options.length === 1 ? 'option' : 'options'}. Save to write them into the feed.`;
    }
  } catch (error) {
    elements.replacementFeedback.textContent = error.message;
  } finally {
    elements.generateReplacements.disabled = false;
  }
}

async function saveReplacementSetup() {
  elements.saveReplacement.disabled = true;
  elements.replacementFeedback.textContent = 'Saving replacement setup...';

  try {
    picksFeedState = await window.sportsTipsDesktop.savePickReplacement(collectReplacementDraft());
    renderPickSelect();
    renderReplacementEditor();
    elements.replacementFeedback.textContent = 'Replacement setup saved to picks-feed.json.';
  } catch (error) {
    elements.replacementFeedback.textContent = error.message;
  } finally {
    elements.saveReplacement.disabled = false;
  }
}

for (const input of [
  elements.settingDryRun,
  elements.settingAnalysisEngine,
  elements.settingWebhookSlates,
  elements.settingWebhookPicks,
  elements.settingWebhookPicksNba,
  elements.settingWebhookPicksMlb,
  elements.settingWebhookPicksAfl,
  elements.settingWebhookPicksNrl,
  elements.settingWebhookPicksNfl,
  elements.settingWebhookPicksEpl,
  elements.settingWebhookPicksOther,
  elements.settingWebhookUnitTracking,
  elements.settingWebhookUnitReport,
  elements.settingRoleEnabled,
  elements.settingRoleText,
  elements.settingRoleSlates,
  elements.settingRolePicksNba,
  elements.settingRolePicksMlb,
  elements.settingRolePicksAfl,
  elements.settingRolePicksNrl,
  elements.settingRolePicksNfl,
  elements.settingRolePicksEpl,
  elements.settingRolePicksOther
]) {
  input.addEventListener('input', () => {
    markSettingsDirty();
  });
  input.addEventListener('change', () => {
    markSettingsDirty();
  });
}

for (const [settingKey, quickKey] of referralWebhookInputPairs) {
  bindMirroredInputs(settingKey, quickKey);
}

elements.toggleButton.addEventListener('click', () => {
  toggleDaemon().catch((error) => {
    elements.daemonMeta.textContent = error.message;
    busy = false;
    elements.toggleButton.disabled = false;
  });
});

elements.activePicksPanel.addEventListener('click', () => {
  toggleActivePicks();
});

elements.activePicksPanel.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleActivePicks();
  }
});

elements.saveSettings.addEventListener('click', () => {
  saveSettings([elements.settingsFeedback]);
});

elements.saveReferralWebhooks.addEventListener('click', () => {
  saveSettings([elements.settingsFeedback, elements.referralWebhookFeedback]);
});

elements.openConfig.addEventListener('click', () => {
  window.sportsTipsDesktop.openConfig();
});

elements.openFolder.addEventListener('click', () => {
  window.sportsTipsDesktop.openAutomationFolder();
});

elements.forceDailyCheck.addEventListener('click', () => {
  forceDailyCheck();
});

elements.forcePostSlates.addEventListener('click', () => {
  forcePostSlates();
});

elements.forcePostPicks.addEventListener('click', () => {
  forcePostPicks();
});

elements.runReferralsNow.addEventListener('click', () => {
  runReferralsNow();
});

elements.referralReviewList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-referral-verify]');

  if (!button) {
    return;
  }

  verifyReferral(button.dataset.referralVerify);
});

elements.reviewResults.addEventListener('click', () => {
  reviewResults();
});

elements.reloadPicksFeed.addEventListener('click', () => {
  loadPicksFeed().catch((error) => {
    elements.replacementFeedback.textContent = error.message;
  });
});

elements.generateReplacements.addEventListener('click', () => {
  generateReplacements();
});

elements.saveReplacement.addEventListener('click', () => {
  saveReplacementSetup();
});

elements.replacementPickSelect.addEventListener('change', () => {
  selectedPickId = elements.replacementPickSelect.value;
  renderReplacementEditor();
});

elements.addCurrentLeg.addEventListener('click', () => {
  elements.currentLegsList.append(createCurrentLegRow());
  markReplacementDirty();
});

elements.addCandidateLeg.addEventListener('click', () => {
  elements.candidateLegsList.append(createCandidateLegRow());
  markReplacementDirty();
});

elements.addReplacementOption.addEventListener('click', () => {
  elements.replacementOptionsList.append(createReplacementOptionRow());
  markReplacementDirty();
});

for (const input of [elements.replacementStatus, elements.replacementReason, elements.replacementMaxOptions]) {
  input.addEventListener('input', markReplacementDirty);
  input.addEventListener('change', markReplacementDirty);
}

refresh().catch((error) => {
  elements.daemonMeta.textContent = error.message;
});

loadPicksFeed().catch((error) => {
  elements.replacementFeedback.textContent = error.message;
});

async function runRefreshLoop() {
  try {
    await refresh();
  } catch (error) {
    elements.daemonMeta.textContent = error.message;
  } finally {
    refreshTimer = setTimeout(runRefreshLoop, 5000);
  }
}
runRefreshLoop();

window.addEventListener('beforeunload', () => {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
});
