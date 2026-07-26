import test from 'node:test';
import assert from 'node:assert/strict';

import { selectLatestQuarterlyFilings } from '../src/services/nseShareService.js';

test('selectLatestQuarterlyFilings keeps the latest four filings by report date', () => {
  const filings = [
    { symbol: 'RELIANCE', date: '30-09-2024' },
    { symbol: 'RELIANCE', date: '31-12-2024' },
    { symbol: 'RELIANCE', date: '31-03-2025' },
    { symbol: 'RELIANCE', date: '30-06-2025' },
    { symbol: 'RELIANCE', date: '30-09-2025' }
  ];

  const result = selectLatestQuarterlyFilings(filings, 4);

  assert.equal(result.length, 4);
  assert.deepEqual(result.map((item) => item.date), ['2025-09-30', '2025-06-30', '2025-03-31', '2024-12-31']);
});

test('selectLatestQuarterlyFilings falls back to the available filings when fewer than the limit exist', () => {
  const filings = [
    { symbol: 'TCS', date: '31-03-2025' },
    { symbol: 'TCS', date: '30-06-2025' }
  ];

  const result = selectLatestQuarterlyFilings(filings, 4);

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.date), ['2025-06-30', '2025-03-31']);
});
