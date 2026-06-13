import test from 'node:test';
import assert from 'node:assert/strict';

import { mapSupportedPropMarketKey } from '../src/web-market-intake.mjs';
import { __testables } from '../src/ai-pick-generator.mjs';

const { getNbaPropSubtype } = __testables;
const subtype = (market) => getNbaPropSubtype({ family: 'prop', market, label: '', description: '', outcomeName: '' });

test('mapSupportedPropMarketKey recognises NBA combo markets before individual stats', () => {
  assert.equal(mapSupportedPropMarketKey('Points, Rebounds and Assists'), 'player_points_rebounds_assists');
  assert.equal(mapSupportedPropMarketKey('Pts + Reb + Ast'), 'player_points_rebounds_assists');
  assert.equal(mapSupportedPropMarketKey('Points and Assists'), 'player_points_assists');
  assert.equal(mapSupportedPropMarketKey('Points and Rebounds'), 'player_points_rebounds');
  assert.equal(mapSupportedPropMarketKey('Rebounds and Assists'), 'player_rebounds_assists');
  // Single-stat markets stay individual.
  assert.equal(mapSupportedPropMarketKey('Points'), 'player_points');
  assert.equal(mapSupportedPropMarketKey('Rebounds'), 'player_rebounds');
  assert.equal(mapSupportedPropMarketKey('Assists'), 'player_assists');
});

test('mapSupportedPropMarketKey drops novelty time-window points markets', () => {
  assert.equal(mapSupportedPropMarketKey('Points in the First 3 Minutes'), null);
  assert.equal(mapSupportedPropMarketKey('First Basket'), null);
  // Standard points board is still captured.
  assert.equal(mapSupportedPropMarketKey('Points Scored'), 'player_points');
});

test('getNbaPropSubtype classifies combo market keys as combo, singles as themselves', () => {
  assert.equal(subtype('player_points_rebounds_assists'), 'combo');
  assert.equal(subtype('player_points_assists'), 'combo');
  assert.equal(subtype('player_points_rebounds'), 'combo');
  assert.equal(subtype('player_rebounds_assists'), 'combo');
  assert.equal(subtype('player_points'), 'points');
  assert.equal(subtype('player_rebounds'), 'rebound');
  assert.equal(subtype('player_assists'), 'assist');
});
