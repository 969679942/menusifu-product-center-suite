import {
  createMerchantCenterAllurePlaywrightV3Options,
  MerchantCenterAllureReporter,
} from '../adapters/test-automation-platform/allure-reporting';

export default class ProductCenterSystemAllureReporter extends MerchantCenterAllureReporter {}

export const createProductCenterSystemAllureOptions = createMerchantCenterAllurePlaywrightV3Options;