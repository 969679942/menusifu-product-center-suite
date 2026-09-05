import decisions from '../reviews/human-review-decisions.json';
import { compileHumanReviewDecisions, type HumanReviewDecisionDocument } from '../../../utils/human-review-decision-compiler';

export const humanReviewDecisionsCuration = compileHumanReviewDecisions(
  decisions as HumanReviewDecisionDocument,
);
