import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import {
  SeasoningBoundaryPage,
  type StoreIdentityExpectation,
  type StoreIdentityObservation,
} from '../../pages/product-center/seasoning-boundary.page';
import { step } from '../../utils/step';

type TemplateDistributionEvidence = Awaited<ReturnType<SeasoningBoundaryPage['distributeTemplate']>>;
type TemplateEditEvidence = Awaited<ReturnType<SeasoningBoundaryPage['editTemplateSeasoning']>>;

export type SeasoningTemplateRedeliveryInput = {
  templateId: number;
  templateName: string;
  editableOptionName: string;
  targetStore: StoreIdentityExpectation;
  waitForStoreTemplate: (templateName: string) => Promise<unknown>;
  readStoreSeasoning: () => Promise<unknown>;
};

export type SeasoningTemplateRedeliveryResult = {
  distributionBefore: TemplateDistributionEvidence;
  distributionAfter: TemplateDistributionEvidence;
  editResult: TemplateEditEvidence;
  templateAfterEdit: unknown;
  initialStoreContext: StoreIdentityObservation;
  beforeRedeliveryStoreContext: StoreIdentityObservation;
  afterRedeliveryStoreContext: StoreIdentityObservation;
  storeAfterInitial: unknown;
  storeBeforeRedelivery: unknown;
  storeAfterRedelivery: unknown;
  initialStorePageText: string;
  beforeRedeliveryStorePageText: string;
  afterRedeliveryStorePageText: string;
};

export class SeasoningTemplateRedeliveryFlow {
  constructor(
    private readonly seasoningPage: SeasoningBoundaryPage,
    private readonly productCenterApi: Pick<ProductCenterApi, 'seasoningTemplateDetail'>,
  ) {}

  @step((input: SeasoningTemplateRedeliveryInput) =>
    `验证模板“${input.templateName}”编辑前后对门店“${input.targetStore.storeName}”的再次下发规则`)
  async execute(input: SeasoningTemplateRedeliveryInput): Promise<SeasoningTemplateRedeliveryResult> {
    const distributionBefore = await this.seasoningPage.distributeTemplate(
      input.templateName,
      input.targetStore.storeId,
      input.targetStore.storeName,
    );
    await input.waitForStoreTemplate(input.templateName);
    const initialStoreContext = await this.seasoningPage.verifyCurrentStoreIdentity(input.targetStore);
    const storeAfterInitial = await input.readStoreSeasoning();
    const initialStorePageText = await this.seasoningPage.readStoreSeasoningVisibleText();

    await this.seasoningPage.ensureTemplateListOpen(input.templateName);
    const editResult = await this.seasoningPage.editTemplateSeasoning(input.templateName, input.editableOptionName, 'add');
    const templateAfterEdit = await this.productCenterApi.seasoningTemplateDetail(input.templateId);

    const beforeRedeliveryStoreContext = await this.seasoningPage.verifyCurrentStoreIdentity(input.targetStore);
    const storeBeforeRedelivery = await input.readStoreSeasoning();
    const beforeRedeliveryStorePageText = await this.seasoningPage.readStoreSeasoningVisibleText();

    const distributionAfter = await this.seasoningPage.distributeTemplate(
      input.templateName,
      input.targetStore.storeId,
      input.targetStore.storeName,
    );
    await input.waitForStoreTemplate(input.templateName);
    const afterRedeliveryStoreContext = await this.seasoningPage.verifyCurrentStoreIdentity(input.targetStore);
    const storeAfterRedelivery = await input.readStoreSeasoning();
    const afterRedeliveryStorePageText = await this.seasoningPage.readStoreSeasoningVisibleText();

    return {
      distributionBefore,
      distributionAfter,
      editResult,
      templateAfterEdit,
      initialStoreContext,
      beforeRedeliveryStoreContext,
      afterRedeliveryStoreContext,
      storeAfterInitial,
      storeBeforeRedelivery,
      storeAfterRedelivery,
      initialStorePageText,
      beforeRedeliveryStorePageText,
      afterRedeliveryStorePageText,
    };
  }
}
