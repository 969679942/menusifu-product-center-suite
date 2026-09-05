const fs = require('node:fs');

// Discovery and AI review are independent from successful artifact collection.
function planBuildReviews({ firstBuildNumber, builds, analyses = {}, reviews = {} }) {
  if (!Number.isInteger(firstBuildNumber) || firstBuildNumber < 1 || !Array.isArray(builds)) {
    throw new Error('invalid-build-watch-input');
  }
  const seen = new Set();
  return [...builds].sort((a, b) => a.buildNumber - b.buildNumber).map(build => {
    const n = build.buildNumber;
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) throw new Error('invalid-or-duplicate-build-number');
    seen.add(n);
    if (n < firstBuildNumber) return null;
    const validIdentity = /^[0-9a-f]{40}$/.test(build.gitSha ?? '') && /^[a-zA-Z0-9-]{1,80}$/.test(build.requestId ?? '');
    const matches = receipt => receipt && receipt.buildNumber === n && receipt.gitSha === build.gitSha && receipt.requestId === build.requestId;
    const review = reviews[n];
    let action;
    if (build.building) action = 'wait';
    else if (!validIdentity) action = 'diagnose-identity';
    else if (matches(review) && review.status === 'complete' && review.actionRequired === 'none' &&
      typeof review.conclusion === 'string' && review.conclusion.trim() && Array.isArray(review.evidence) && review.evidence.length) action = 'done';
    else if (matches(analyses[n])) action = 'review';
    else action = 'collect';
    return { buildNumber: n, action };
  }).filter(Boolean);
}
module.exports = { planBuildReviews };
if (require.main === module) process.stdout.write(JSON.stringify(planBuildReviews(JSON.parse(fs.readFileSync(0, 'utf8')))));
