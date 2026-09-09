import fs from 'node:fs';
import path from 'node:path';
import { projectProductCenterPracticeCompatibility } from '../adapters/product-center/product-center-system-test-compatibility';
import {
  buildProductCenterItemPracticeContract,
  loadProductCenterItemPracticeContractInputs,
} from '../utils/product-center-item-practice-contract';

const rootDir = path.resolve(__dirname, '..');

export function buildProductCenterSystemTestCompatibility(
  outputPath = path.join(rootDir, 'output/system-test/product-center-compatibility.json'),
) {
  const built = buildProductCenterItemPracticeContract({
    ...loadProductCenterItemPracticeContractInputs(rootDir),
    rootDir,
  });
  if (built.errors.length > 0) throw new Error(built.errors.join('\n'));
  const projection = projectProductCenterPracticeCompatibility(built.contract);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
  return { outputPath, projection };
}

if (require.main === module) {
  const result = buildProductCenterSystemTestCompatibility();
  process.stdout.write(`商品中心兼容投影：${result.outputPath}\n`);
}
