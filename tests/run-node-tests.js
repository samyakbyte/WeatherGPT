#!/usr/bin/env node
// WeatherGPT unified Node test runner.
//   npm test   (or: node tests/run-node-tests.js)
// Deterministic: frozen clock, synthetic forecast fixtures, no network.
// IMPORTANT: this runner sets a non-zero exit status when any check fails.
import { createRunner } from './harness.js';
import { legacySuite } from './legacy-suite.js';
import { bugSuite } from './regression-bugs.js';
import { interpretationSuite } from './regression-suite.js';
import { reliabilitySuite } from './reliability-suite.js';

const SUITES = [
  ['Legacy baseline (43 checks)', legacySuite],
  ['Phase 1.1 reported-bug regressions', bugSuite],
  ['Phase 1.4 interpretation table', interpretationSuite],
  ['Phase 1.3 reliability / time zone / races', reliabilitySuite]
];

// Agricultural intelligence suite covers deterministic screens and isolated demo scenarios.
try {
  const { advisorySuite } = await import('./advisory-suite.js');
  SUITES.push(['Phase 4 crop advisory', advisorySuite]);
} catch { /* optional suite not present yet */ }
try {
  const { farmsSuite } = await import('./farms-suite.js');
  SUITES.push(['Phase 2 farms / storage migration', farmsSuite]);
} catch { /* optional suite not present yet */ }
try {
  const { aciditySuite } = await import('./acidity-suite.js');
  SUITES.push(['Phase 3 rainwater acidity', aciditySuite]);
} catch { /* optional suite not present yet */ }
try {
  const { agricultureSuite } = await import('./agriculture-suite.js');
  SUITES.push(['Agricultural suitability, risk and demo isolation', agricultureSuite]);
} catch { /* optional suite not present yet */ }

const runner = createRunner('WeatherGPT');
let totalCases = 0;
for (const [name, suite] of SUITES) {
  const before = runner.result();
  const extra = suite(runner.check);
  const after = runner.result();
  const added = after.passed + after.failed - before.passed - before.failed;
  totalCases += typeof extra === 'number' ? extra : 0;
  console.log(`[suite] ${name}: ${added} checks`);
}
const { passed, failed, failures } = runner.result();
console.log(`\n=============================\nTOTAL: ${passed} passed, ${failed} failed${totalCases ? ` · ${totalCases} table phrasings` : ''}\n=============================`);
if (failures.length) console.error('Failures:\n - ' + failures.slice(0, 20).join('\n - '));
if (failed) process.exitCode = 1;
