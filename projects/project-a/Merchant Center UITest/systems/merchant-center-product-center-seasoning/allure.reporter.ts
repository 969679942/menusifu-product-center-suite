import {
  MerchantCenterAllureReporter,
  normalizeMerchantCenterAllureResults,
} from '../../adapters/test-automation-platform/allure-reporting';

export default class MerchantCenterSeasoningAllureReporter extends MerchantCenterAllureReporter {}

export const normalizeAllureResults = normalizeMerchantCenterAllureResults;