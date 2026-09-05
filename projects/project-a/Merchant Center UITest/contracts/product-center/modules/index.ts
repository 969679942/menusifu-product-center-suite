import { brandGroupModule } from './brand-group.module';
import { brandItemModule } from './brand-item.module';
import { brandMaterialRecipeModule } from './brand-material-recipe.module';
import { brandPrintModule } from './brand-print.module';
import { brandSeasoningModule } from './brand-seasoning.module';
import { brandTagModule } from './brand-tag.module';
import { humanReviewDecisionsCuration } from './human-review-decisions.curation';
import { menuModule } from './menu.module';
import { storeOperationsModule } from './store-operations.module';
import { storeProductModule } from './store-product.module';

export type { ProductCenterContractCurationSource, ProductCenterContractModule } from './product-center-module.types';

export const productCenterContractModules = [
  brandItemModule,
  brandGroupModule,
  brandSeasoningModule,
  brandTagModule,
  brandMaterialRecipeModule,
  brandPrintModule,
  menuModule,
  storeProductModule,
  storeOperationsModule,
] as const;

export const productCenterContractCurationSources = [
  ...productCenterContractModules,
  humanReviewDecisionsCuration,
] as const;
