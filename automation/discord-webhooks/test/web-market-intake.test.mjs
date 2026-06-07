import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSnapshotEvents, parseFeaturedMarketsFromText, parseSportsbetEventPageHtml, parseSportsbetLeagueHtml, refreshScrapedSnapshot } from '../src/web-market-intake.mjs';

test('parseFeaturedMarketsFromText normalizes featured AFL markets into snapshot quotes', () => {
  const quotes = parseFeaturedMarketsFromText({
    sportKey: 'afl',
    displayName: 'Hawthorn v Adelaide Crows',
    startTime: '2026-05-21T09:30:00.000Z',
    sourceUrl: 'https://www.sportsbet.com.au/betting/australian-rules/afl/hawthorn-v-adelaide-crows-10491697',
    fetchedAt: '2026-05-18T06:00:00.000Z',
    text: 'Hawthorn Adelaide Crows Head to Head 1.40 3.00 Line (-15.5) 1.89 (+15.5) 1.91 Total Match Points Over (O 168.5) 1.90 Under (U 168.5) 1.90'
  });

  assert.equal(quotes.length, 6);
  assert.deepEqual(
    [...new Set(quotes.map((quote) => quote.market))].sort(),
    ['h2h', 'spreads', 'totals']
  );
  assert.equal(quotes.find((quote) => quote.market === 'h2h' && quote.outcomeName === 'Hawthorn')?.prices?.[0]?.price, 1.4);
  assert.equal(quotes.find((quote) => quote.market === 'spreads' && quote.outcomeName === 'Adelaide Crows')?.point, 15.5);
  assert.equal(quotes.find((quote) => quote.market === 'totals' && quote.outcomeName === 'Over')?.point, 168.5);
  assert.equal(quotes[0].source, 'web-scrape');
});

test('parseFeaturedMarketsFromText preserves away at home naming for MLB moneyline cards', () => {
  const quotes = parseFeaturedMarketsFromText({
    sportKey: 'mlb',
    displayName: 'Cleveland Guardians at Detroit Tigers',
    startTime: '2026-05-19T05:10:00.000Z',
    sourceUrl: 'https://www.sportsbet.com.au/betting/baseball/major-league-baseball/cleveland-guardians-at-detroit-tigers-10495061',
    fetchedAt: '2026-05-18T06:00:00.000Z',
    text: 'Cleveland Guardians Detroit Tigers Money Line 1.63 2.25 Run Line (+1.5) 1.31 (-1.5) 3.45 Total Runs Over (O 7.5) 1.95 Under (U 7.5) 1.85'
  });

  assert.equal(quotes.length, 6);
  assert.equal(quotes.find((quote) => quote.market === 'h2h' && quote.outcomeName === 'Cleveland Guardians')?.homeTeam, 'Detroit Tigers');
  assert.equal(quotes.find((quote) => quote.market === 'spreads' && quote.outcomeName === 'Detroit Tigers')?.point, -1.5);
  assert.equal(quotes.find((quote) => quote.market === 'totals' && quote.outcomeName === 'Under')?.prices?.[0]?.price, 1.85);
});

test('parseSportsbetEventPageHtml extracts supported player props from embedded markets and outcomes', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/baseball/major-league-baseball/cleveland-guardians-s-cecconi-at-detroit-tigers-f-valdez--10495061';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://www.sportsbet.com.au"}]}</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Cleveland Guardians vs Detroit Tigers","startDate":"2026-05-21T07:30:43.000Z","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "243611458":{"id":243611458,"eventId":10495061,"name":"To Record 2+ Hits","displayed":true,"active":true,"sort":79,"outcomeIds":[1205417746,1205417748]},
          "243611379":{"id":243611379,"eventId":10495061,"name":"Tarik Skubal - Alt Strikeouts","displayed":true,"active":true,"sort":87,"outcomeIds":[1205417163,1205417164]},
          "243611999":{"id":243611999,"eventId":10495061,"name":"To Record A Run","displayed":true,"active":true,"sort":90,"outcomeIds":[1205417999]}
        },
        "outcomes":{
          "1205417746":{"displayed":true,"id":1205417746,"marketId":243611458,"name":"Steven Kwan","active":true,"sort":10,"winPrice":{"num":2300,"den":1000}},
          "1205417748":{"displayed":true,"id":1205417748,"marketId":243611458,"name":"Jose Ramirez","active":true,"sort":30,"winPrice":{"num":1600,"den":1000}},
          "1205417163":{"displayed":true,"id":1205417163,"marketId":243611379,"name":"Tarik Skubal 3+ Strikeouts","active":true,"sort":1040,"winPrice":{"num":100,"den":1000}},
          "1205417164":{"displayed":true,"id":1205417164,"marketId":243611379,"name":"Tarik Skubal 4+ Strikeouts","active":true,"sort":1050,"winPrice":{"num":300,"den":1000}},
          "1205417999":{"displayed":true,"id":1205417999,"marketId":243611999,"name":"Jose Ramirez","active":true,"sort":10,"winPrice":{"num":980,"den":1000}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'mlb', marketKey: 'mlb' }, '2026-05-18T06:00:00.000Z', eventUrl, {
    propMarketPriority: ['batter_hits', 'pitcher_strikeouts'],
    maxPropMarketsPerEvent: 6
  });

  assert.equal(quotes.length, 4);
  assert.deepEqual(
    [...new Set(quotes.map((quote) => quote.market))].sort(),
    ['batter_hits', 'pitcher_strikeouts']
  );
  assert.equal(quotes.find((quote) => quote.description === 'Steven Kwan')?.outcomeName, '2+ Hits');
  assert.equal(quotes.find((quote) => quote.description === 'Steven Kwan')?.prices?.[0]?.price, 3.3);
  assert.equal(quotes.find((quote) => quote.description === 'Tarik Skubal' && quote.outcomeName === '3+ Strikeouts')?.prices?.[0]?.price, 1.1);
  assert.ok(quotes.every((quote) => quote.sourceUrl === eventUrl));
});

test('parseSportsbetEventPageHtml skips MLB targetBet props by default when they cannot be event-validated', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/baseball/major-league-baseball/detroit-tigers-f-valdez-at-baltimore-orioles-b-young--10518400';
  const html = `
    <script>
      window.__TEST__ = {
        "events":{
          "10518400":{"id":10518400,"name":"Detroit Tigers (F Valdez) At Baltimore Orioles (B Young)","startTime":{"milliseconds":1779640560000}}
        },
        "markets":{
          "1":{"id":1,"eventId":10518400,"name":"Money Line","displayed":true,"active":true,"sort":10,"outcomeIds":[101,102]},
          "2":{"id":2,"eventId":10518400,"name":"Total Runs","displayed":true,"active":true,"sort":11,"outcomeIds":[201,202]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Baltimore Orioles","displayed":true,"active":true,"winPrice":{"num":55,"den":100}},
          "102":{"id":102,"marketId":1,"name":"Detroit Tigers","displayed":true,"active":true,"winPrice":{"num":140,"den":100}},
          "201":{"id":201,"marketId":2,"name":"Over","displayed":true,"active":true,"handicap":{"value":"8.5","display":"8.5"},"winPrice":{"num":95,"den":100}},
          "202":{"id":202,"marketId":2,"name":"Under","displayed":true,"active":true,"handicap":{"value":"8.5","display":"8.5"},"winPrice":{"num":87,"den":100}}
        }
      };
      window.__TEST_FACTS__ = {
        "facts":[
          {"tags":["Baltimore Orioles","Detroit Tigers","Strikeouts","Framber Valdez"],"targetBet":{"result":"Framber Valdez 6+","market":"Framber Valdez - Alt Strikeouts","marketId":244143258,"outcomeId":1208017705,"price":2.2}},
          {"tags":["Baltimore Orioles","Detroit Tigers","Hits 2+","Gunnar Henderson"],"targetBet":{"result":"Gunnar Henderson","market":"Gunnar Henderson To Record 2+ Hits","marketId":244143262,"outcomeId":1208017731,"price":3.25}},
          {"tags":["Baltimore Orioles","Detroit Tigers","RBI","Pete Alonso"],"targetBet":{"result":"Pete Alonso 1+","market":"Pete Alonso To Record 1+ RBIs","marketId":244143143,"outcomeId":1208016936,"price":2.3}},
          {"tags":["Baltimore Orioles","Detroit Tigers","Home Run","Pete Alonso"],"targetBet":{"result":"Pete Alonso","market":"To Hit A Home Run","marketId":244143277,"outcomeId":1208017824,"price":5.5}}
        ]
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'mlb', marketKey: 'mlb' }, '2026-05-24T18:48:16.441Z', eventUrl, {
    propMarketPriority: ['batter_hits', 'pitcher_strikeouts', 'batter_rbis'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.equal(quotes.length, 0);
  assert.ok(quotes.every((quote) => quote.market !== 'pitcher_strikeouts'));
  assert.ok(quotes.every((quote) => quote.market !== 'batter_hits'));
  assert.ok(quotes.every((quote) => quote.market !== 'batter_rbis'));
});

test('parseSportsbetEventPageHtml filters MLB markets that belong to a different event id', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/baseball/major-league-baseball/houston-astros-at-texas-rangers--10555555';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Houston Astros vs Texas Rangers","startDate":"2026-05-26T23:05:00.000Z","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"eventId":10555555,"name":"Christian Walker - Alt Hits","displayed":true,"active":true,"sort":10,"outcomeIds":[101]},
          "2":{"id":2,"eventId":10559999,"name":"Brandon Nimmo - Alt Hits","displayed":true,"active":true,"sort":11,"outcomeIds":[201]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Christian Walker 1+ Hit","displayed":true,"active":true,"winPrice":{"num":55,"den":100}},
          "201":{"id":201,"marketId":2,"name":"Brandon Nimmo 1+ Hit","displayed":true,"active":true,"winPrice":{"num":55,"den":100}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'mlb', marketKey: 'mlb' }, '2026-05-26T03:32:21.433Z', eventUrl, {
    propMarketPriority: ['batter_hits'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.deepEqual(quotes.map((quote) => quote.description), ['Christian Walker']);
  assert.ok(quotes.every((quote) => quote.description !== 'Brandon Nimmo'));
});

test('parseSportsbetEventPageHtml skips redirected league pages when canonical url does not match the requested event', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/baseball/major-league-baseball/sample-event-10518412';
  const html = `
    <link rel="canonical" href="https://www.sportsbet.com.au/betting/baseball/major-league-baseball" />
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"eventId":10518397,"name":"Washington Nationals To Record 1+ Hits","displayed":true,"active":true,"sort":10,"outcomeIds":[101]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"James Wood","displayed":true,"active":true,"winPrice":{"num":140,"den":100}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'mlb', marketKey: 'mlb' }, '2026-05-24T18:48:16.441Z', eventUrl, {
    propMarketPriority: ['batter_hits', 'pitcher_strikeouts', 'batter_rbis'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.equal(quotes.length, 0);
});

test('parseSportsbetEventPageHtml supports direct player props and filters quarter novelty markets', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/basketball-us/nba/san-antonio-spurs-v-oklahoma-city-thunder-10504040';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"San Antonio Spurs vs Oklahoma City Thunder","startDate":"2026-05-21T10:30:00.000Z","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"name":"De'Aaron Fox - Rebounds","displayed":true,"active":true,"sort":10,"outcomeIds":[101,102]},
          "2":{"id":2,"name":"20+ Disposals","displayed":true,"active":true,"sort":20,"outcomeIds":[201,202]},
          "3":{"id":3,"name":"1st Quarter - To Score 10+ Points","displayed":true,"active":true,"sort":30,"outcomeIds":[301]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Over 7.5","displayed":true,"active":true,"winPrice":{"num":90,"den":100}},
          "102":{"id":102,"marketId":1,"name":"Under 7.5","displayed":true,"active":true,"winPrice":{"num":95,"den":100}},
          "201":{"id":201,"marketId":2,"name":"Karl Amon","displayed":true,"active":true,"winPrice":{"num":120,"den":100}},
          "202":{"id":202,"marketId":2,"name":"Josh Ward","displayed":true,"active":true,"winPrice":{"num":150,"den":100}},
          "301":{"id":301,"marketId":3,"name":"De'Aaron Fox","displayed":true,"active":true,"winPrice":{"num":100,"den":100}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'nba', marketKey: 'nba' }, '2026-05-18T06:00:00.000Z', eventUrl, {
    propMarketPriority: ['player_rebounds', 'player_disposals', 'player_points'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.equal(quotes.length, 4);
  assert.deepEqual(
    [...new Set(quotes.map((quote) => quote.market))].sort(),
    ['player_disposals', 'player_rebounds']
  );
  assert.equal(quotes.find((quote) => quote.description === "De'Aaron Fox" && quote.outcomeName === 'Over')?.point, 7.5);
  assert.equal(quotes.find((quote) => quote.description === "De'Aaron Fox" && quote.outcomeName === 'Under')?.point, 7.5);
  assert.equal(quotes.find((quote) => quote.description === 'Karl Amon')?.outcomeName, '20+ Disposals');
  assert.ok(quotes.every((quote) => quote.market !== 'player_points'));
});

test('parseSportsbetEventPageHtml diversifies AFL disposal ladders when lower lines dominate the market sort', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/australian-rules/afl/fremantle-v-st-kilda-10493662';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Fremantle v St Kilda","startDate":"2026-05-23T08:30:37.000Z","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"name":"15+ Disposals","displayed":true,"active":true,"sort":10,"outcomeIds":[101]},
          "2":{"id":2,"name":"15+ Disposals","displayed":true,"active":true,"sort":11,"outcomeIds":[201]},
          "3":{"id":3,"name":"15+ Disposals","displayed":true,"active":true,"sort":12,"outcomeIds":[301]},
          "4":{"id":4,"name":"15+ Disposals","displayed":true,"active":true,"sort":13,"outcomeIds":[401]},
          "5":{"id":5,"name":"15+ Disposals","displayed":true,"active":true,"sort":14,"outcomeIds":[501]},
          "6":{"id":6,"name":"15+ Disposals","displayed":true,"active":true,"sort":15,"outcomeIds":[601]},
          "7":{"id":7,"name":"20+ Disposals","displayed":true,"active":true,"sort":16,"outcomeIds":[701]},
          "8":{"id":8,"name":"25+ Disposals","displayed":true,"active":true,"sort":17,"outcomeIds":[801]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Jack Macrae","displayed":true,"active":true,"winPrice":{"num":35,"den":100}},
          "201":{"id":201,"marketId":2,"name":"James Worpel","displayed":true,"active":true,"winPrice":{"num":38,"den":100}},
          "301":{"id":301,"marketId":3,"name":"Jordan Clark","displayed":true,"active":true,"winPrice":{"num":42,"den":100}},
          "401":{"id":401,"marketId":4,"name":"Tom Stewart","displayed":true,"active":true,"winPrice":{"num":45,"den":100}},
          "501":{"id":501,"marketId":5,"name":"Massimo D'Ambrosio","displayed":true,"active":true,"winPrice":{"num":48,"den":100}},
          "601":{"id":601,"marketId":6,"name":"Liam Duggan","displayed":true,"active":true,"winPrice":{"num":50,"den":100}},
          "701":{"id":701,"marketId":7,"name":"Caleb Serong","displayed":true,"active":true,"winPrice":{"num":75,"den":100}},
          "801":{"id":801,"marketId":8,"name":"Andrew Brayshaw","displayed":true,"active":true,"winPrice":{"num":95,"den":100}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'afl', marketKey: 'afl' }, '2026-05-18T06:00:00.000Z', eventUrl, {
    propMarketPriority: ['player_disposals'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 6
  });

  const disposalQuotes = quotes.filter((quote) => quote.market === 'player_disposals');

  assert.equal(disposalQuotes.length, 6);
  assert.ok(disposalQuotes.some((quote) => quote.description === 'Caleb Serong' && quote.outcomeName === '20+ Disposals'));
  assert.ok(disposalQuotes.some((quote) => quote.description === 'Andrew Brayshaw' && quote.outcomeName === '25+ Disposals'));
  assert.ok(disposalQuotes.some((quote) => quote.description === 'Jack Macrae' && quote.outcomeName === '15+ Disposals'));
});

test('parseSportsbetEventPageHtml treats bare Sportsbet startDate values as UTC and preserves hyphenated player names', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/basketball-us/nba/oklahoma-city-thunder-at-san-antonio-spurs-10502538';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Oklahoma City Thunder At San Antonio Spurs","startDate":"23 May 2026 10:40:00","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"name":"Shai Gilgeous-Alexander - Assists","displayed":true,"active":true,"sort":10,"outcomeIds":[101,102]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Over 7.5","displayed":true,"active":true,"winPrice":{"num":90,"den":100}},
          "102":{"id":102,"marketId":1,"name":"Under 7.5","displayed":true,"active":true,"winPrice":{"num":95,"den":100}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'nba', marketKey: 'nba' }, '2026-05-18T06:00:00.000Z', eventUrl, {
    propMarketPriority: ['player_assists'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.equal(quotes.length, 2);
  assert.ok(quotes.every((quote) => quote.startTime === '2026-05-23T10:40:00.000Z'));
  assert.ok(quotes.every((quote) => quote.description === 'Shai Gilgeous-Alexander'));
  assert.equal(quotes.find((quote) => quote.outcomeName === 'Over')?.point, 7.5);
  assert.equal(quotes.find((quote) => quote.outcomeName === 'Under')?.point, 7.5);
});

test('parseSportsbetLeagueHtml prefers embedded event milliseconds for featured-market start times', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/australian-rules/afl/richmond-v-essendon-10493661';
  const html = `
    <a href="${eventUrl}">Richmond v Essendon</a>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Richmond v Essendon","startDate":"22 May 2026 07:45:07","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "events":{
          "10476143":{"id":10476143,"name":"Richmond v Essendon","startTime":{"milliseconds":1779443107000}}
        }
      };
    </script>
    Richmond Essendon Head to Head 1.40 3.00 Line (-15.5) 1.89 (+15.5) 1.91 Total Match Points Over (O 168.5) 1.90 Under (U 168.5) 1.90
  `;

  const quotes = parseSportsbetLeagueHtml(html, { key: 'afl', marketKey: 'afl' }, '2026-05-22T02:31:19.861Z');

  assert.equal(quotes.length, 6);
  assert.ok(quotes.every((quote) => quote.startTime === '2026-05-22T09:45:07.000Z'));
});

test('parseSportsbetLeagueHtml supports Sportsbet EPL united-kingdom event URLs', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/soccer/united-kingdom/english-premier-league/tottenham-v-everton-10498814';
  const html = `
    <a href="${eventUrl}">Tottenham v Everton</a>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Tottenham v Everton","startDate":"25 May 2026 02:00:00","url":"${eventUrl}"}</script>
    Tottenham Everton Head to Head 1.70 2.10 Total Goals Over (O 2.5) 1.90 Under (U 2.5) 1.90
  `;

  const quotes = parseSportsbetLeagueHtml(html, { key: 'soccer_epl', marketKey: 'soccer_epl' }, '2026-05-24T11:30:00.000Z');

  assert.equal(quotes.length, 2);
  assert.ok(quotes.every((quote) => quote.sourceUrl === eventUrl));
  assert.ok(quotes.every((quote) => quote.startTime === '2026-05-25T02:00:00.000Z'));
  assert.equal(quotes.find((quote) => quote.market === 'h2h' && quote.outcomeName === 'Tottenham')?.prices?.[0]?.price, 1.7);
  assert.equal(quotes.find((quote) => quote.market === 'h2h' && quote.outcomeName === 'Everton')?.prices?.[0]?.price, 2.1);
});

test('parseSportsbetLeagueHtml filters mixed tennis boards down to ATP events', () => {
  const mensEventUrl = 'https://www.sportsbet.com.au/betting/tennis/mens-french-open/hamad-medjedovic-v-yannick-hanfmann-10513089';
  const ladiesEventUrl = 'https://www.sportsbet.com.au/betting/tennis/ladies-french-open/sofia-kenin-v-peyton-stearns-10512307';
  const html = `
    <a href="${mensEventUrl}">Hamad Medjedovic v Yannick Hanfmann</a>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${mensEventUrl}","name":"Hamad Medjedovic v Yannick Hanfmann","startDate":"2026-05-25T01:45:00.000Z","url":"${mensEventUrl}"}</script>
    Mens French Open Hamad Medjedovic Yannick Hanfmann Head to Head 1.51 2.58
    <a href="${ladiesEventUrl}">Sofia Kenin v Peyton Stearns</a>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${ladiesEventUrl}","name":"Sofia Kenin v Peyton Stearns","startDate":"2026-05-25T01:42:00.000Z","url":"${ladiesEventUrl}"}</script>
    Ladies French Open Sofia Kenin Peyton Stearns Head to Head 2.74 1.45
  `;

  const quotes = parseSportsbetLeagueHtml(html, { key: 'tennis_atp', marketKey: 'tennis_atp' }, '2026-05-24T11:30:00.000Z');

  assert.equal(quotes.length, 2);
  assert.ok(quotes.every((quote) => quote.sourceUrl === mensEventUrl));
  assert.ok(quotes.every((quote) => quote.startTime === '2026-05-25T01:45:00.000Z'));
  assert.equal(quotes.find((quote) => quote.market === 'h2h' && quote.outcomeName === 'Hamad Medjedovic')?.prices?.[0]?.price, 1.51);
  assert.equal(quotes.find((quote) => quote.market === 'h2h' && quote.outcomeName === 'Yannick Hanfmann')?.prices?.[0]?.price, 2.58);
});

test('parseSportsbetEventPageHtml extracts EPL structured totals and handicap markets', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/soccer/united-kingdom/english-premier-league/liverpool-v-brentford-10498403';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Liverpool v Brentford","startDate":"2026-05-25T02:00:00.000Z","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"name":"Over/Under 2.5 Goals","displayed":true,"active":true,"sort":10,"outcomeIds":[101,102]},
          "2":{"id":2,"name":"1st Half Over/Under 2.5 Goals","displayed":true,"active":true,"sort":11,"outcomeIds":[201,202]},
          "3":{"id":3,"name":"Alternative Handicaps.","displayed":true,"active":true,"sort":12,"outcomeIds":[301,302,303]},
          "4":{"id":4,"name":"First Half Handicap","displayed":true,"active":true,"sort":13,"outcomeIds":[401,402,403]},
          "5":{"id":5,"name":"Both Teams To Score","displayed":true,"active":true,"sort":14,"outcomeIds":[501,502]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Over 2.5 Goals","displayed":true,"active":true,"winPrice":{"num":420,"den":1000}},
          "102":{"id":102,"marketId":1,"name":"Under 2.5 Goals","displayed":true,"active":true,"winPrice":{"num":1740,"den":1000}},
          "201":{"id":201,"marketId":2,"name":"1st Half Over 2.5 Goals","displayed":true,"active":true,"winPrice":{"num":3650,"den":1000}},
          "202":{"id":202,"marketId":2,"name":"1st Half Under 2.5 Goals","displayed":true,"active":true,"winPrice":{"num":170,"den":1000}},
          "301":{"id":301,"marketId":3,"name":"Liverpool","displayed":true,"active":true,"handicap":{"value":"1.0","display":"+1.0"},"winPrice":{"num":240,"den":1000}},
          "302":{"id":302,"marketId":3,"name":"Handicap Draw","displayed":true,"active":true,"handicap":{"value":"1.0","display":"+1.0"},"winPrice":{"num":4800,"den":1000}},
          "303":{"id":303,"marketId":3,"name":"Brentford","displayed":true,"active":true,"handicap":{"value":"1.0","display":"-1.0"},"winPrice":{"num":7000,"den":1000}},
          "401":{"id":401,"marketId":4,"name":"Liverpool","displayed":true,"active":true,"handicap":{"value":"-1.0","display":"-1.0"},"winPrice":{"num":5150,"den":1000}},
          "402":{"id":402,"marketId":4,"name":"Handicap Draw","displayed":true,"active":true,"handicap":{"value":"-1.0","display":"-1.0"},"winPrice":{"num":2380,"den":1000}},
          "403":{"id":403,"marketId":4,"name":"Brentford","displayed":true,"active":true,"handicap":{"value":"-1.0","display":"+1.0"},"winPrice":{"num":560,"den":1000}},
          "501":{"id":501,"marketId":5,"name":"Yes","displayed":true,"active":true,"winPrice":{"num":400,"den":1000}},
          "502":{"id":502,"marketId":5,"name":"No","displayed":true,"active":true,"winPrice":{"num":1750,"den":1000}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'soccer_epl', marketKey: 'soccer_epl' }, '2026-05-24T11:30:00.000Z', eventUrl, {
    propMarketPriority: ['player_goals'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.equal(quotes.length, 8);
  assert.ok(quotes.some((quote) => quote.market === 'totals' && quote.outcomeName === 'Over' && quote.point === 2.5));
  assert.ok(quotes.some((quote) => quote.market === 'totals' && quote.outcomeName === 'Under' && quote.point === 2.5));
  assert.ok(quotes.some((quote) => quote.market === 'first_half_totals' && quote.outcomeName === 'Under' && quote.point === 2.5));
  assert.ok(quotes.some((quote) => quote.market === 'spreads' && quote.outcomeName === 'Liverpool' && quote.point === 1));
  assert.ok(quotes.some((quote) => quote.market === 'spreads' && quote.outcomeName === 'Brentford' && quote.point === -1));
  assert.ok(quotes.some((quote) => quote.market === 'first_half_spreads' && quote.outcomeName === 'Brentford' && quote.point === 1));
  assert.ok(quotes.every((quote) => quote.outcomeName !== 'Handicap Draw'));
});

test('parseSportsbetEventPageHtml extracts structured soccer markets for non-EPL soccer keys', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/soccer/europe/champions-league/real-madrid-v-inter-milan-10499999';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Real Madrid v Inter Milan","startDate":"2026-05-25T02:00:00.000Z","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"name":"Over/Under 2.5 Goals","displayed":true,"active":true,"sort":10,"outcomeIds":[101,102]},
          "2":{"id":2,"name":"Alternative Handicaps","displayed":true,"active":true,"sort":12,"outcomeIds":[201,202,203]},
          "3":{"id":3,"name":"Over/Under 10.5 Corners","displayed":true,"active":true,"sort":14,"outcomeIds":[301,302]},
          "4":{"id":4,"name":"Over/Under 24.5 Total Shots","displayed":true,"active":true,"sort":16,"outcomeIds":[401,402]},
          "5":{"id":5,"name":"Double Chance","displayed":true,"active":true,"sort":18,"outcomeIds":[501,502]},
          "6":{"id":6,"name":"Kylian Mbappe - Alt Shots","displayed":true,"active":true,"sort":20,"outcomeIds":[601,602]},
          "7":{"id":7,"name":"Kylian Mbappe - Alt Shots on Target","displayed":true,"active":true,"sort":22,"outcomeIds":[701,702]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Over 2.5 Goals","displayed":true,"active":true,"winPrice":{"num":420,"den":1000}},
          "102":{"id":102,"marketId":1,"name":"Under 2.5 Goals","displayed":true,"active":true,"winPrice":{"num":1740,"den":1000}},
          "201":{"id":201,"marketId":2,"name":"Real Madrid","displayed":true,"active":true,"handicap":{"value":"-1.0","display":"-1.0"},"winPrice":{"num":240,"den":1000}},
          "202":{"id":202,"marketId":2,"name":"Handicap Draw","displayed":true,"active":true,"handicap":{"value":"-1.0","display":"-1.0"},"winPrice":{"num":4800,"den":1000}},
          "203":{"id":203,"marketId":2,"name":"Inter Milan","displayed":true,"active":true,"handicap":{"value":"-1.0","display":"+1.0"},"winPrice":{"num":7000,"den":1000}},
          "301":{"id":301,"marketId":3,"name":"Over 10.5 Corners","displayed":true,"active":true,"winPrice":{"num":950,"den":1000}},
          "302":{"id":302,"marketId":3,"name":"Under 10.5 Corners","displayed":true,"active":true,"winPrice":{"num":850,"den":1000}},
          "401":{"id":401,"marketId":4,"name":"Over 24.5 Total Shots","displayed":true,"active":true,"winPrice":{"num":900,"den":1000}},
          "402":{"id":402,"marketId":4,"name":"Under 24.5 Total Shots","displayed":true,"active":true,"winPrice":{"num":900,"den":1000}},
          "501":{"id":501,"marketId":5,"name":"Real Madrid/Draw","displayed":true,"active":true,"winPrice":{"num":400,"den":1000}},
          "502":{"id":502,"marketId":5,"name":"Inter Milan/Draw","displayed":true,"active":true,"winPrice":{"num":650,"den":1000}},
          "601":{"id":601,"marketId":6,"name":"Over 2.5","displayed":true,"active":true,"winPrice":{"num":1150,"den":1000}},
          "602":{"id":602,"marketId":6,"name":"Under 2.5","displayed":true,"active":true,"winPrice":{"num":650,"den":1000}},
          "701":{"id":701,"marketId":7,"name":"Over 1.5","displayed":true,"active":true,"winPrice":{"num":1200,"den":1000}},
          "702":{"id":702,"marketId":7,"name":"Under 1.5","displayed":true,"active":true,"winPrice":{"num":600,"den":1000}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'soccer_uefa_champs_league', marketKey: 'soccer_uefa_champs_league' }, '2026-05-24T11:30:00.000Z', eventUrl, {
    propMarketPriority: ['player_shots', 'player_shots_on_goal', 'player_goals'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.ok(quotes.some((quote) => quote.market === 'totals' && quote.outcomeName === 'Over' && quote.point === 2.5));
  assert.ok(quotes.some((quote) => quote.market === 'spreads' && quote.outcomeName === 'Real Madrid' && quote.point === -1));
  assert.ok(quotes.some((quote) => quote.market === 'spreads' && quote.outcomeName === 'Inter Milan' && quote.point === 1));
  assert.ok(quotes.some((quote) => quote.market === 'totals' && quote.outcomeName === 'Over' && quote.point === 10.5 && quote.description === 'Corners'));
  assert.ok(quotes.some((quote) => quote.market === 'totals' && quote.outcomeName === 'Under' && quote.point === 24.5 && quote.description === 'Shots'));
  assert.ok(quotes.some((quote) => quote.market === 'double_chance' && quote.outcomeName === 'Real Madrid/Draw'));
  assert.ok(quotes.some((quote) => quote.market === 'player_shots' && quote.description === 'Kylian Mbappe' && quote.outcomeName === 'Over' && quote.point === 2.5));
  assert.ok(quotes.some((quote) => quote.market === 'player_shots_on_goal' && quote.description === 'Kylian Mbappe' && quote.outcomeName === 'Over' && quote.point === 1.5));
  assert.ok(quotes.every((quote) => quote.outcomeName !== 'Handicap Draw'));
});

test('parseSportsbetEventPageHtml extracts NFL sides totals and moneyline from structured markets', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/american-football-us/nfl/kansas-city-chiefs-v-buffalo-bills-10599999';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Kansas City Chiefs v Buffalo Bills","startDate":"2026-09-11T00:20:00.000Z","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"name":"Match Betting","displayed":true,"active":true,"sort":10,"outcomeIds":[101,102]},
          "2":{"id":2,"name":"Handicap Betting","displayed":true,"active":true,"sort":11,"outcomeIds":[201,202]},
          "3":{"id":3,"name":"Total Points","displayed":true,"active":true,"sort":12,"outcomeIds":[301,302]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Kansas City Chiefs","displayed":true,"active":true,"winPrice":{"num":80,"den":100}},
          "102":{"id":102,"marketId":1,"name":"Buffalo Bills","displayed":true,"active":true,"winPrice":{"num":110,"den":100}},
          "201":{"id":201,"marketId":2,"name":"Kansas City Chiefs","displayed":true,"active":true,"handicap":{"value":"-2.5","display":"-2.5"},"winPrice":{"num":90,"den":100}},
          "202":{"id":202,"marketId":2,"name":"Buffalo Bills","displayed":true,"active":true,"handicap":{"value":"2.5","display":"+2.5"},"winPrice":{"num":90,"den":100}},
          "301":{"id":301,"marketId":3,"name":"Over","displayed":true,"active":true,"handicap":{"value":"48.5","display":"48.5"},"winPrice":{"num":90,"den":100}},
          "302":{"id":302,"marketId":3,"name":"Under","displayed":true,"active":true,"handicap":{"value":"48.5","display":"48.5"},"winPrice":{"num":90,"den":100}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'nfl', marketKey: 'nfl' }, '2026-09-10T10:30:00.000Z', eventUrl, {
    propMarketPriority: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.ok(quotes.some((quote) => quote.market === 'h2h' && quote.outcomeName === 'Kansas City Chiefs'));
  assert.ok(quotes.some((quote) => quote.market === 'h2h' && quote.outcomeName === 'Buffalo Bills'));
  assert.ok(quotes.some((quote) => quote.market === 'spreads' && quote.outcomeName === 'Kansas City Chiefs' && quote.point === -2.5));
  assert.ok(quotes.some((quote) => quote.market === 'spreads' && quote.outcomeName === 'Buffalo Bills' && quote.point === 2.5));
  assert.ok(quotes.some((quote) => quote.market === 'totals' && quote.outcomeName === 'Over' && quote.point === 48.5));
  assert.ok(quotes.some((quote) => quote.market === 'totals' && quote.outcomeName === 'Under' && quote.point === 48.5));
});

test('parseSportsbetEventPageHtml rejects team, combo, and threshold-less prop shapes', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/rugby-league/nrl/st-george-illawarra-dragons-v-new-zealand-warriors-10485032';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"St George Illawarra Dragons vs New Zealand Warriors","startDate":"23 May 2026 05:30:00","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"name":"1st Team To Score 25 Points","displayed":true,"active":true,"sort":10,"outcomeIds":[101]},
          "2":{"id":2,"name":"Head to Head / Total Points Double","displayed":true,"active":true,"sort":20,"outcomeIds":[201]},
          "3":{"id":3,"name":"St George Illawarra Dragons - Alt Total Match Points","displayed":true,"active":true,"sort":30,"outcomeIds":[301,302]},
          "4":{"id":4,"name":"Victor Wembanyama - Assists","displayed":true,"active":true,"sort":40,"outcomeIds":[401,402]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Yes","displayed":true,"active":true,"winPrice":{"num":110,"den":100}},
          "201":{"id":201,"marketId":2,"name":"Home / Over","displayed":true,"active":true,"winPrice":{"num":150,"den":100}},
          "301":{"id":301,"marketId":3,"name":"0 Points","displayed":true,"active":true,"winPrice":{"num":3300,"den":100}},
          "302":{"id":302,"marketId":3,"name":"31 Points or More","displayed":true,"active":true,"winPrice":{"num":550,"den":100}},
          "401":{"id":401,"marketId":4,"name":"Over","displayed":true,"active":true,"winPrice":{"num":108,"den":100}},
          "402":{"id":402,"marketId":4,"name":"Under","displayed":true,"active":true,"winPrice":{"num":108,"den":100}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'nrl', marketKey: 'nrl' }, '2026-05-18T06:00:00.000Z', eventUrl, {
    propMarketPriority: ['player_points', 'player_assists'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.equal(quotes.length, 0);
});

test('parseSportsbetEventPageHtml extracts NRL kicker points and first-half line or total while rejecting race markets', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/rugby-league/nrl/canterbury-bulldogs-v-melbourne-storm-10485031';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Canterbury Bulldogs vs Melbourne Storm","startDate":"23 May 2026 10:00:00","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"name":"10+ Points","displayed":true,"active":true,"sort":10,"outcomeIds":[101]},
          "2":{"id":2,"name":"Nick Meaney Points Scored","displayed":true,"active":true,"sort":20,"outcomeIds":[201,202]},
          "3":{"id":3,"name":"Matt Burton Points Scored","displayed":true,"active":true,"sort":21,"outcomeIds":[301,302]},
          "4":{"id":4,"name":"1st Half 2-Way Handicap","displayed":true,"active":true,"sort":30,"outcomeIds":[401,402]},
          "5":{"id":5,"name":"1st Half Points","displayed":true,"active":true,"sort":31,"outcomeIds":[501,502]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Race","displayed":true,"active":true,"winPrice":{"num":120,"den":100}},
          "201":{"id":201,"marketId":2,"name":"Nick Meaney to Score 4+ Points","displayed":true,"active":true,"winPrice":{"num":80,"den":1000}},
          "202":{"id":202,"marketId":2,"name":"Nick Meaney to Score 6+ Points","displayed":true,"active":true,"winPrice":{"num":330,"den":1000}},
          "301":{"id":301,"marketId":3,"name":"Matt Burton to Score 6+ Points","displayed":true,"active":true,"winPrice":{"num":240,"den":1000}},
          "302":{"id":302,"marketId":3,"name":"Matt Burton to Score 8+ Points","displayed":true,"active":true,"winPrice":{"num":640,"den":1000}},
          "401":{"id":401,"marketId":4,"name":"Canterbury Bulldogs","displayed":true,"active":true,"winPrice":{"num":870,"den":1000},"handicap":{"value":"-0.5","display":"-0.5"}},
          "402":{"id":402,"marketId":4,"name":"Melbourne Storm","displayed":true,"active":true,"winPrice":{"num":890,"den":1000},"handicap":{"value":"-0.5","display":"+0.5"}},
          "501":{"id":501,"marketId":5,"name":"Over","displayed":true,"active":true,"winPrice":{"num":840,"den":1000},"handicap":{"value":"23.5","display":"+23.5"}},
          "502":{"id":502,"marketId":5,"name":"Under","displayed":true,"active":true,"winPrice":{"num":920,"den":1000},"handicap":{"value":"23.5","display":"+23.5"}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'nrl', marketKey: 'nrl' }, '2026-05-18T06:00:00.000Z', eventUrl, {
    propMarketPriority: ['player_points'],
    maxPropMarketsPerEvent: 6,
    maxPropMarketsPerType: 2
  });

  assert.ok(quotes.some((quote) => quote.market === 'player_points' && quote.description === 'Nick Meaney' && quote.outcomeName === '6+ Points'));
  assert.ok(quotes.some((quote) => quote.market === 'player_points' && quote.description === 'Matt Burton' && quote.outcomeName === '6+ Points'));
  assert.ok(quotes.some((quote) => quote.market === 'first_half_spreads' && quote.outcomeName === 'Melbourne Storm' && quote.point === 0.5));
  assert.ok(quotes.some((quote) => quote.market === 'first_half_totals' && quote.outcomeName === 'Under' && quote.point === 23.5));
  assert.ok(quotes.every((quote) => quote.description !== 'Race'));
});

test('parseSportsbetEventPageHtml caps duplicate prop families so points ladders do not crowd out other stats', () => {
  const eventUrl = 'https://www.sportsbet.com.au/betting/basketball-us/nba/sample-event-1';
  const html = `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","@id":"${eventUrl}","name":"Sample Home vs Sample Away","startDate":"2026-05-21T10:30:00.000Z","url":"${eventUrl}"}</script>
    <script>
      window.__TEST__ = {
        "markets":{
          "1":{"id":1,"name":"To Score 20+ Points","displayed":true,"active":true,"sort":10,"outcomeIds":[101]},
          "2":{"id":2,"name":"To Score 25+ Points","displayed":true,"active":true,"sort":11,"outcomeIds":[201]},
          "3":{"id":3,"name":"To Record 8+ Rebounds","displayed":true,"active":true,"sort":12,"outcomeIds":[301]},
          "4":{"id":4,"name":"To Record 6+ Assists","displayed":true,"active":true,"sort":13,"outcomeIds":[401]}
        },
        "outcomes":{
          "101":{"id":101,"marketId":1,"name":"Player One","displayed":true,"active":true,"winPrice":{"num":100,"den":100}},
          "201":{"id":201,"marketId":2,"name":"Player Two","displayed":true,"active":true,"winPrice":{"num":110,"den":100}},
          "301":{"id":301,"marketId":3,"name":"Player Three","displayed":true,"active":true,"winPrice":{"num":120,"den":100}},
          "401":{"id":401,"marketId":4,"name":"Player Four","displayed":true,"active":true,"winPrice":{"num":130,"den":100}}
        }
      };
    </script>
  `;

  const quotes = parseSportsbetEventPageHtml(html, { key: 'nba', marketKey: 'nba' }, '2026-05-18T06:00:00.000Z', eventUrl, {
    propMarketPriority: ['player_points', 'player_rebounds', 'player_assists'],
    maxPropMarketsPerEvent: 3,
    maxPropMarketsPerType: 1
  });

  assert.equal(quotes.length, 3);
  assert.deepEqual(
    [...new Set(quotes.map((quote) => quote.market))].sort(),
    ['player_assists', 'player_points', 'player_rebounds']
  );
});

test('refreshScrapedSnapshot skips round pages when collecting Sportsbet event prop pages', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-web-market-intake-'));
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  const leagueUrl = 'https://www.sportsbet.com.au/betting/australian-rules/afl';
  const roundUrl = 'https://www.sportsbet.com.au/betting/australian-rules/afl/round-11';
  const eventUrl = 'https://www.sportsbet.com.au/betting/australian-rules/afl/richmond-v-essendon-10493661';
  const originalFetch = global.fetch;
  const fetchedUrls = [];

  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url) => {
    fetchedUrls.push(String(url));

    if (String(url) === leagueUrl) {
      return {
        ok: true,
        text: async () => `
          <a href="${roundUrl}">Round 11</a>
          <a href="${eventUrl}">Richmond v Essendon</a>
          <script>
            window.__TEST__ = {
              "events":{
                "10476143":{"id":10476143,"name":"Richmond v Essendon","startTime":{"milliseconds":1779443107000}}
              }
            };
          </script>
          Richmond Essendon Head to Head 1.40 3.00 Line (-15.5) 1.89 (+15.5) 1.91 Total Match Points Over (O 168.5) 1.90 Under (U 168.5) 1.90
        `
      };
    }

    if (String(url) === eventUrl) {
      return {
        ok: true,
        text: async () => '<script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","name":"Richmond v Essendon","startDate":"2026-05-22T09:45:07.000Z","url":"https://www.sportsbet.com.au/betting/australian-rules/afl/richmond-v-essendon-10493661"}</script>'
      };
    }

    if (String(url) === roundUrl) {
      return {
        ok: true,
        text: async () => '<html></html>'
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const config = {
    analysis: {
      includeProps: true,
      maxEventsPerSport: 8,
      maxPropMarketsPerEvent: 6,
      maxPropMarketsPerType: 2,
      propMarketPriority: ['player_disposals']
    },
    sports: [{
      key: 'afl',
      label: 'AFL',
      enabled: true,
      marketKey: 'afl'
    }],
    __paths: {
      snapshotFile: path.join(workspaceRoot, 'bookmaker-snapshots.json')
    }
  };
  const state = {};

  await refreshScrapedSnapshot({ config, state });

  assert.ok(fetchedUrls.includes(leagueUrl));
  assert.ok(fetchedUrls.includes(eventUrl));
  assert.ok(!fetchedUrls.includes(roundUrl));
});

test('refreshScrapedSnapshot keeps a wider AFL disposal pool from event pages', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-web-market-intake-afl-depth-'));
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  const leagueUrl = 'https://www.sportsbet.com.au/betting/australian-rules/afl';
  const eventUrl = 'https://www.sportsbet.com.au/betting/australian-rules/afl/fremantle-v-st-kilda-10493662';
  const originalFetch = global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url) => {
    if (String(url) === leagueUrl) {
      return {
        ok: true,
        text: async () => `
          <a href="${eventUrl}">Fremantle v St Kilda</a>
          <script>
            window.__TEST__ = {
              "events":{
                "10476144":{"id":10476144,"name":"Fremantle v St Kilda","startTime":{"milliseconds":1779525037000}}
              }
            };
          </script>
          Fremantle St Kilda Head to Head 1.50 2.60 Line (-12.5) 1.89 (+12.5) 1.91 Total Match Points Over (O 162.5) 1.90 Under (U 162.5) 1.90
        `
      };
    }

    if (String(url) === eventUrl) {
      return {
        ok: true,
        text: async () => `
          <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","name":"Fremantle v St Kilda","startDate":"2026-05-23T08:30:37.000Z","url":"${eventUrl}"}</script>
          <script>
            window.__TEST__ = {
              "markets":{
                "1":{"id":1,"name":"20+ Disposals","displayed":true,"active":true,"sort":10,"outcomeIds":[101]},
                "2":{"id":2,"name":"20+ Disposals","displayed":true,"active":true,"sort":11,"outcomeIds":[201]},
                "3":{"id":3,"name":"20+ Disposals","displayed":true,"active":true,"sort":12,"outcomeIds":[301]},
                "4":{"id":4,"name":"25+ Disposals","displayed":true,"active":true,"sort":13,"outcomeIds":[401]},
                "5":{"id":5,"name":"1+ Goal","displayed":true,"active":true,"sort":14,"outcomeIds":[501]}
              },
              "outcomes":{
                "101":{"id":101,"marketId":1,"name":"Andrew Brayshaw","displayed":true,"active":true,"winPrice":{"num":30,"den":100}},
                "201":{"id":201,"marketId":2,"name":"Luke Ryan","displayed":true,"active":true,"winPrice":{"num":35,"den":100}},
                "301":{"id":301,"marketId":3,"name":"Jack Sinclair","displayed":true,"active":true,"winPrice":{"num":45,"den":100}},
                "401":{"id":401,"marketId":4,"name":"Caleb Serong","displayed":true,"active":true,"winPrice":{"num":80,"den":100}},
                "501":{"id":501,"marketId":5,"name":"Jye Amiss","displayed":true,"active":true,"winPrice":{"num":60,"den":100}}
              }
            };
          </script>
        `
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const config = {
    analysis: {
      includeProps: true,
      maxEventsPerSport: 8,
      maxPropMarketsPerEvent: 6,
      maxPropMarketsPerType: 2,
      propMarketPriority: ['player_disposals', 'player_goals']
    },
    sports: [{
      key: 'afl',
      label: 'AFL',
      enabled: true,
      marketKey: 'afl'
    }],
    __paths: {
      snapshotFile: path.join(workspaceRoot, 'bookmaker-snapshots.json')
    }
  };

  const snapshot = await refreshScrapedSnapshot({ config, state: {} });
  const disposalQuotes = snapshot.quotes.filter((quote) => quote.market === 'player_disposals');

  assert.equal(disposalQuotes.length, 4);
  assert.deepEqual(
    disposalQuotes.map((quote) => quote.description).sort(),
    ['Andrew Brayshaw', 'Caleb Serong', 'Jack Sinclair', 'Luke Ryan']
  );
});

test('refreshScrapedSnapshot fetches every EPL event page when league featured quotes are unavailable and shared snapshot events keep full coverage', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-web-market-intake-epl-coverage-'));
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  const leagueUrl = 'https://www.sportsbet.com.au/betting/soccer/united-kingdom/english-premier-league';
  const eventUrlOne = 'https://www.sportsbet.com.au/betting/soccer/united-kingdom/english-premier-league/tottenham-v-everton-10498814';
  const eventUrlTwo = 'https://www.sportsbet.com.au/betting/soccer/united-kingdom/english-premier-league/west-ham-v-leeds-10498817';
  const originalFetch = global.fetch;
  const fetchedUrls = [];

  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url) => {
    fetchedUrls.push(String(url));

    if (String(url) === leagueUrl) {
      return {
        ok: true,
        text: async () => `
          <a href="${eventUrlOne}">Tottenham v Everton</a>
          <a href="${eventUrlTwo}">West Ham v Leeds</a>
          <script>
            window.__TEST__ = {
              "events":{
                "10498814":{"id":10498814,"name":"Tottenham v Everton","startTime":{"milliseconds":1779656400000}},
                "10498817":{"id":10498817,"name":"West Ham v Leeds","startTime":{"milliseconds":1779656400000}}
              }
            };
          </script>
          Tottenham 1.90 Draw 3.50 Everton 4.20
          West Ham 2.30 Draw 3.20 Leeds 3.10
        `
      };
    }

    if (String(url) === eventUrlOne) {
      return {
        ok: true,
        text: async () => `
          <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","name":"Tottenham v Everton","startDate":"2026-05-24T15:00:00.000Z","url":"${eventUrlOne}"}</script>
          <script>
            window.__TEST__ = {
              "markets":{
                "1":{"id":1,"name":"To Score 1+ Goals","displayed":true,"active":true,"sort":10,"outcomeIds":[101]}
              },
              "outcomes":{
                "101":{"id":101,"marketId":1,"name":"Son Heung-Min","displayed":true,"active":true,"winPrice":{"num":125,"den":100}}
              }
            };
          </script>
        `
      };
    }

    if (String(url) === eventUrlTwo) {
      return {
        ok: true,
        text: async () => `
          <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","name":"West Ham v Leeds","startDate":"2026-05-24T15:00:00.000Z","url":"${eventUrlTwo}"}</script>
          <script>
            window.__TEST__ = {
              "markets":{
                "1":{"id":1,"name":"To Score 1+ Goals","displayed":true,"active":true,"sort":10,"outcomeIds":[201]}
              },
              "outcomes":{
                "201":{"id":201,"marketId":1,"name":"Jarrod Bowen","displayed":true,"active":true,"winPrice":{"num":150,"den":100}}
              }
            };
          </script>
        `
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const config = {
    timezone: 'Australia/Sydney',
    analysis: {
      includeProps: true,
      maxEventsPerSport: 1,
      maxPropMarketsPerEvent: 6,
      maxPropMarketsPerType: 2,
      propMarketPriority: ['player_goals'],
      lookaheadHours: 36
    },
    marketScrape: {
      enabled: true,
      refreshIntervalMinutes: 60,
      maxSnapshotAgeMinutes: 180
    },
    bookmakerFallback: {
      maxSnapshotAgeMinutes: 180
    },
    sports: [{
      key: 'soccer_epl',
      label: 'Soccer / EPL',
      enabled: true,
      marketKey: 'soccer_epl',
      marketPageUrl: leagueUrl,
      eventPathPrefix: '/betting/soccer/united-kingdom/english-premier-league/'
    }],
    __paths: {
      snapshotFile: path.join(workspaceRoot, 'bookmaker-snapshots.json')
    }
  };

  const snapshot = await refreshScrapedSnapshot({ config, state: {} });
  const events = buildSnapshotEvents(snapshot, config, config.sports[0], new Date('2026-05-24T12:00:00.000Z'));

  assert.ok(fetchedUrls.includes(eventUrlOne));
  assert.ok(fetchedUrls.includes(eventUrlTwo));
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.displayName), ['Tottenham vs Everton', 'West Ham vs Leeds']);
});