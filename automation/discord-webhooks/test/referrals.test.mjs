import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReferralCapitalPlan,
  buildReferralMasterlistMessage,
  buildReferralScores,
  diffReferralOffers,
  extractCoinSpotOfferFromPages,
  extractRaizOfferFromPages,
  extractStakeOffersFromPages,
  extractSwyftxOfferFromPages,
  extractUpOfferFromPages
} from '../src/jobs/referrals.mjs';

test('extractUpOfferFromPages captures reward, window, and risky shareability rules', () => {
  const [offer] = extractUpOfferFromPages({
    pages: {
      offer: {
        text: `You’ll both score $15 when they join. Hook Up a Mate is designed so that Upsiders can spread the word about Up. It’s not for spamming strangers, mass-sharing invite codes, or using Up as a side hustle. Invites expire automatically if the invitee hasn’t signed up and passed ID verification (KYC) within 14 days. Last updated 25 May 2026.`
      },
      promotions: {
        text: 'Promotions and Competitions Hook Up A Mate'
      },
      terms: {
        text: 'Terms and Conditions Last modified 29 January 2026'
      }
    },
    nowIso: '2026-05-27T00:00:00.000Z'
  });

  assert.equal(offer.id, 'up-hook-up-a-mate');
  assert.equal(offer.status, 'active');
  assert.equal(offer.rewardValueReferrerAud, 15);
  assert.equal(offer.rewardValueRefereeAud, 15);
  assert.equal(offer.qualificationWindowDays, 14);
  assert.equal(offer.publicShareability, 'risky');
  assert.equal(offer.termsLastUpdatedText, '25 May 2026');
  assert.match(offer.shareabilityNote, /spamming strangers/i);
});

test('extractStakeOffersFromPages returns separate AUS and Wall St offers', () => {
  const offers = extractStakeOffersFromPages({
    pages: {
      landing: {
        text: 'Enter the Stake referral code. If you add funds to your Stake account within 24 hours of joining you\'ll unlock a bonus Nike, Dropbox or GoPro stock (Stake Wall St) and/or A$10 of buying power (Stake AUS).'
      },
      support: {
        text: 'Referring someone to Stake AUS gives you discounted ASX brokerage. For each referral who signs up and funds their Stake AUS account, you\'ll get $1 off brokerage for a year. When someone signs up using your referral code and funds their Stake Wall St account, you\'ll receive a free U.S. stock.'
      },
      ausTerms: {
        text: 'Last updated 13 August 2024. The AUS Funding Reward is AUD$10 to be credited by Stake to the Referred Person’s Stake AUS account. A Qualified Funding must be at least $50 AUD. Stake may suspend or terminate in whole or part the Stake Rewards program or a user\'s ability to participate at any time.'
      },
      wallTerms: {
        text: 'Last updated 9 December 2025. Most people receive a stock that has a value of less than $10 USD. A Qualified Funding is a deposit of at least $50 AUD by the Referred Person.'
      }
    },
    nowIso: '2026-05-27T00:00:00.000Z'
  });

  assert.equal(offers.length, 2);
  const ausOffer = offers.find((offer) => offer.id === 'stake-aus-referral');
  const wallOffer = offers.find((offer) => offer.id === 'stake-wall-st-referral');

  assert.ok(ausOffer);
  assert.ok(wallOffer);
  assert.equal(ausOffer.status, 'active');
  assert.equal(ausOffer.rewardValueRefereeAud, 10);
  assert.equal(ausOffer.minDepositAud, 50);
  assert.match(ausOffer.rewardSummary, /buying power/i);
  assert.equal(wallOffer.status, 'active');
  assert.match(wallOffer.rewardSummary, /less than \$10 USD/i);
  assert.equal(wallOffer.minDepositAud, 50);
});

test('diffReferralOffers classifies new, updated, and cancelled changes', () => {
  const previousOffers = [{
    id: 'coinspot-referrals',
    brand: 'CoinSpot',
    title: 'Referral Program',
    status: 'active',
    rewardSummary: 'Both parties receive $10 AUD worth of BTC after the referred friend completes their first AUD deposit.',
    rewardValueReferrerAud: 10,
    rewardValueRefereeAud: 10,
    qualificationWindowDays: null,
    minDepositAud: null,
    requiresKyc: true,
    requiresDeposit: true,
    requiresTrade: false,
    requiresPurchase: false,
    publicShareability: 'allowed',
    shareabilityNote: 'Allowed',
    termsLastUpdatedText: '',
    offerFingerprint: 'same',
    termsFingerprint: 'coinspot-v1',
    scores: { overall: 70 }
  }, {
    id: 'swyftx-refer-a-friend',
    brand: 'Swyftx',
    title: 'Refer a Friend',
    status: 'active',
    rewardSummary: 'Both parties receive $10 AUD worth of BTC after the referee verifies, deposits fiat, and trades.',
    rewardValueReferrerAud: 10,
    rewardValueRefereeAud: 10,
    qualificationWindowDays: 30,
    minDepositAud: null,
    requiresKyc: true,
    requiresDeposit: true,
    requiresTrade: true,
    requiresPurchase: false,
    publicShareability: 'caution',
    shareabilityNote: 'No spam',
    termsLastUpdatedText: '15 July 2025',
    offerFingerprint: 'swyftx-v1',
    termsFingerprint: 'swyftx-v1',
    scores: { overall: 66 }
  }];
  const currentOffers = [{
    id: 'up-hook-up-a-mate',
    brand: 'Up',
    title: 'Hook Up a Mate',
    status: 'active',
    rewardSummary: 'Both parties receive $15 AUD when the invitee joins.',
    rewardValueReferrerAud: 15,
    rewardValueRefereeAud: 15,
    qualificationWindowDays: 14,
    minDepositAud: 0,
    requiresKyc: true,
    requiresDeposit: false,
    requiresTrade: false,
    requiresPurchase: false,
    publicShareability: 'risky',
    shareabilityNote: 'No public blasting',
    termsLastUpdatedText: '25 May 2026',
    offerFingerprint: 'up-v1',
    termsFingerprint: 'up-v1',
    scores: { overall: 74 }
  }, {
    id: 'coinspot-referrals',
    brand: 'CoinSpot',
    title: 'Referral Program',
    status: 'active',
    rewardSummary: 'Both parties receive $15 AUD worth of BTC after the referred friend completes their first AUD deposit.',
    rewardValueReferrerAud: 15,
    rewardValueRefereeAud: 15,
    qualificationWindowDays: null,
    minDepositAud: null,
    requiresKyc: true,
    requiresDeposit: true,
    requiresTrade: false,
    requiresPurchase: false,
    publicShareability: 'allowed',
    shareabilityNote: 'Allowed',
    termsLastUpdatedText: '',
    offerFingerprint: 'coinspot-v2',
    termsFingerprint: 'coinspot-v2',
    scores: { overall: 76 }
  }, {
    id: 'swyftx-refer-a-friend',
    brand: 'Swyftx',
    title: 'Refer a Friend',
    status: 'inactive',
    rewardSummary: 'Referral program no longer available.',
    rewardValueReferrerAud: null,
    rewardValueRefereeAud: null,
    qualificationWindowDays: null,
    minDepositAud: null,
    requiresKyc: false,
    requiresDeposit: false,
    requiresTrade: false,
    requiresPurchase: false,
    publicShareability: 'blocked',
    shareabilityNote: 'No longer available',
    termsLastUpdatedText: '1 August 2026',
    offerFingerprint: 'swyftx-v2',
    termsFingerprint: 'swyftx-v2',
    scores: { overall: 10 }
  }];

  const diff = diffReferralOffers(previousOffers, currentOffers);

  assert.equal(diff.new.length, 1);
  assert.equal(diff.new[0].offer.id, 'up-hook-up-a-mate');
  assert.equal(diff.updated_terms.length, 1);
  assert.equal(diff.updated_terms[0].offer.id, 'coinspot-referrals');
  assert.match(diff.updated_terms[0].changes.join(' '), /Reward summary changed/i);
  assert.equal(diff.cancelled.length, 1);
  assert.equal(diff.cancelled[0].offer.id, 'swyftx-refer-a-friend');
});

test('buildReferralScores penalizes risky sharing and review-required status', () => {
  const activeOffer = {
    rewardSummary: 'Both parties receive $10 AUD.',
    rewardValueReferrerAud: 10,
    rewardValueRefereeAud: 10,
    requiresKyc: true,
    requiresDeposit: true,
    requiresTrade: false,
    requiresPurchase: false,
    publicShareability: 'allowed',
    abuseRisk: 'medium',
    confidence: 'high',
    officialOfferUrl: 'https://example.com',
    officialTermsUrl: 'https://example.com/terms',
    status: 'active',
    syncState: 'fresh',
    stabilityScoreOverride: 70
  };
  const reviewOffer = {
    ...activeOffer,
    status: 'review_required',
    publicShareability: 'risky',
    abuseRisk: 'high',
    confidence: 'low'
  };

  const activeScores = buildReferralScores(activeOffer);
  const reviewScores = buildReferralScores(reviewOffer);

  assert.ok(activeScores.overall > reviewScores.overall);
  assert.ok(activeScores.shareability > reviewScores.shareability);
});

test('buildReferralCapitalPlan starts at $10 and defers variable-reward offers', () => {
  const [coinSpotOffer] = extractCoinSpotOfferFromPages({
    pages: {
      offer: {
        text: 'Share the love & get $10 free BTC. Both parties will receive $10 free BTC once an AUD deposit has been completed. You must hold a verified account to claim your reward.'
      },
      terms: {
        text: 'CoinSpot Terms of Use. We may amend these Terms of Use at our discretion.'
      }
    },
    nowIso: '2026-05-27T00:00:00.000Z'
  });
  const [swyftxOffer] = extractSwyftxOfferFromPages({
    pages: {
      offer: {
        text: 'Refer a friend and both score $10 AUD of Bitcoin. The referee must verify, deposit fiat, and trade within 30 days of sign up.'
      },
      terms: {
        text: 'Swyftx terms of use. Last updated 15 July 2025.'
      }
    },
    nowIso: '2026-05-27T00:00:00.000Z'
  });
  const [upOffer] = extractUpOfferFromPages({
    pages: {
      offer: {
        text: 'You\'ll both score $15 when they join. It\'s not for spamming strangers, mass-sharing invite codes, or using Up as a side hustle. Invites expire if the invitee has not signed up and passed ID verification within 14 days.'
      },
      promotions: {
        text: 'Promotions and Competitions Hook Up A Mate'
      },
      terms: {
        text: 'Terms and Conditions Last modified 29 January 2026'
      }
    },
    nowIso: '2026-05-27T00:00:00.000Z'
  });
  const stakeOffers = extractStakeOffersFromPages({
    pages: {
      landing: {
        text: 'Enter the Stake referral code. If you add funds to your Stake account within 24 hours of joining you\'ll unlock a bonus stock and/or A$10 of buying power.'
      },
      support: {
        text: 'Referring someone to Stake AUS gives you discounted ASX brokerage. When someone signs up using your referral code and funds their Stake Wall St account, you\'ll receive a free U.S. stock.'
      },
      ausTerms: {
        text: 'Last updated 13 August 2024. The AUS Funding Reward is AUD$10 to be credited by Stake to the Referred Person’s Stake AUS account. A Qualified Funding must be at least $50 AUD.'
      },
      wallTerms: {
        text: 'Last updated 9 December 2025. Most people receive a stock that has a value of less than $10 USD. A Qualified Funding is a deposit of at least $50 AUD by the Referred Person.'
      }
    },
    nowIso: '2026-05-27T00:00:00.000Z'
  });

  const plan = buildReferralCapitalPlan([coinSpotOffer, swyftxOffer, upOffer, ...stakeOffers], { startingCapitalAud: 10 });

  assert.equal(plan.startingCapitalAud, 10);
  assert.equal(plan.steps[0].offerId, 'coinspot-referrals');
  assert.ok(plan.steps.some((step) => step.offerId === 'stake-aus-referral'));
  assert.ok(plan.projectedEndingCapitalAud > plan.startingCapitalAud);
  assert.ok(plan.deferred.some((item) => item.offerId === 'stake-wall-st-referral'));
});

test('buildReferralMasterlistMessage only lists verified active offers as separate embeds', () => {
  const [coinSpotOffer] = extractCoinSpotOfferFromPages({
    pages: {
      offer: {
        text: 'Share the love & get $10 free BTC. Both parties will receive $10 free BTC once an AUD deposit has been completed. You must hold a verified account to claim your reward.'
      },
      terms: {
        text: 'CoinSpot Terms of Use. We may amend these Terms of Use at our discretion.'
      }
    },
    nowIso: '2026-05-27T00:00:00.000Z'
  });
  const [raizOffer] = extractRaizOfferFromPages({
    pages: {
      blog: {
        text: 'For each friend that you refer who starts investing with Raiz, we’ll pay you a referral bonus of $5 ($10 in September). Once they have made their first successful investment of $5 or more, you will both receive the referral bonus.'
      },
      terms: {
        text: 'The Responsible Entity may, in its absolute discretion, determine to pay a Referral Fee to investors from time to time. The Responsible Entity will post information on its Website and via the Raiz App to notify investors when the payment of a Referral Fee commences, the amount of the Referral Fee, and when the payment of a Referral Fee ends. Last updated: 14 May 2026'
      }
    },
    nowIso: '2026-05-27T00:00:00.000Z'
  });
  const message = buildReferralMasterlistMessage({
    updatedAt: '2026-05-27T00:00:00.000Z',
    offers: [
      raizOffer,
      {
        ...coinSpotOffer,
        verificationStatus: 'verified',
        verifiedAt: '2026-05-27T00:30:00.000Z'
      }
    ]
  });

  assert.equal(message.embeds.length, 1);
  assert.match(message.content, /1 verified/i);
  assert.match(message.content, /0 pending review/i);
  assert.match(message.embeds[0].title, /#1 CoinSpot \| Verified/);
  assert.match(message.embeds[0].fields[0].name, /Reward/);
});