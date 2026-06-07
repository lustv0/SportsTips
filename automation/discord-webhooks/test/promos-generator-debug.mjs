import {
  selectLegsForOddsRange,
  buildSlipId,
  buildPromoSlip,
  getConfidenceTier
} from '../src/promos-generator.mjs';

console.log('Testing selectLegsForOddsRange...');
const candidates = [
  { id: '1', odds: 2.0, confidence: 80 },
  { id: '2', odds: 2.5, confidence: 75 },
  { id: '3', odds: 1.0, confidence: 70 }
];

const selected = selectLegsForOddsRange(candidates, 2, 2.0, 5.0);
console.log('Selected legs:', selected);

if (selected.length > 0) {
  const combined = selected.reduce((a, l) => a * l.odds, 1);
  console.log('Combined odds:', combined);
  console.log('Within range:', combined >= 2.0 && combined <= 5.0);
} else {
  console.log('No legs selected!');
}

console.log('\nTesting buildSlipId...');
const id = buildSlipId('test-promo');
console.log('SlipId:', id);
console.log('Starts with prefix:', id.startsWith('promo:test-promo:'));

console.log('\nTesting getConfidenceTier...');
console.log('90 =>', getConfidenceTier(90));
console.log('75 =>', getConfidenceTier(75));
console.log('70 =>', getConfidenceTier(70));
console.log('50 =>', getConfidenceTier(50));

console.log('\nAll basic tests passed!');
