export type AllureResultFile = {
  relativePath: string;
  modifiedAt: Date;
  sizeBytes: number;
};

export type AllureRetentionPolicy = {
  retainDays: number;
  maxFiles: number;
  maxBytes: number;
};

export type AllureResultRetentionPlan = {
  policy: AllureRetentionPolicy;
  totalFiles: number;
  totalBytes: number;
  deleteFiles: Array<AllureResultFile & { day: string }>;
  keepFiles: Array<AllureResultFile & { day: string }>;
  deleteDays: string[];
  deleteBytes: number;
  remainingFiles: number;
  remainingBytes: number;
  limitSatisfied: boolean;
};

const defaultPolicy: AllureRetentionPolicy = {
  retainDays: 2,
  maxFiles: 10_000,
  maxBytes: 250 * 1024 * 1024,
};

export function planAllureResultRetention(
  files: readonly AllureResultFile[],
  now = new Date(),
  policyOverrides: Partial<AllureRetentionPolicy> = {},
): AllureResultRetentionPlan {
  const policy = { ...defaultPolicy, ...policyOverrides };
  validatePolicy(policy);

  const datedFiles = files.map((file) => ({ ...file, day: localDay(file.modifiedAt) }));
  const groups = new Map<string, typeof datedFiles>();
  for (const file of datedFiles) {
    const group = groups.get(file.day) ?? [];
    group.push(file);
    groups.set(file.day, group);
  }

  const today = localDay(now);
  const todayNumber = calendarDayNumber(now);
  const orderedDays = [...groups.keys()].sort();
  const deleteDays = new Set<string>();

  for (const day of orderedDays) {
    if (day === today) continue;
    const groupDate = groups.get(day)?.[0]?.modifiedAt;
    if (!groupDate) continue;
    const ageDays = todayNumber - calendarDayNumber(groupDate);
    if (ageDays >= policy.retainDays) deleteDays.add(day);
  }

  let remainingFiles = datedFiles.filter((file) => !deleteDays.has(file.day)).length;
  let remainingBytes = sumBytes(datedFiles.filter((file) => !deleteDays.has(file.day)));
  for (const day of orderedDays) {
    if (remainingFiles <= policy.maxFiles && remainingBytes <= policy.maxBytes) break;
    if (day === today || deleteDays.has(day)) continue;
    const group = groups.get(day) ?? [];
    deleteDays.add(day);
    remainingFiles -= group.length;
    remainingBytes -= sumBytes(group);
  }

  const deletePaths = new Set<string>();
  const remainingCandidates = datedFiles
    .filter((file) => !deleteDays.has(file.day))
    .sort(compareFiles);
  for (const file of remainingCandidates) {
    if (remainingFiles <= policy.maxFiles && remainingBytes <= policy.maxBytes) break;
    if (remainingFiles <= 1) break;
    deletePaths.add(file.relativePath);
    remainingFiles -= 1;
    remainingBytes -= file.sizeBytes;
  }

  const deleteFiles = datedFiles
    .filter((file) => deleteDays.has(file.day) || deletePaths.has(file.relativePath))
    .sort(compareFiles);
  const keepFiles = datedFiles
    .filter((file) => !deleteDays.has(file.day) && !deletePaths.has(file.relativePath))
    .sort(compareFiles);

  return {
    policy,
    totalFiles: datedFiles.length,
    totalBytes: sumBytes(datedFiles),
    deleteFiles,
    keepFiles,
    deleteDays: [...deleteDays].sort(),
    deleteBytes: sumBytes(deleteFiles),
    remainingFiles: keepFiles.length,
    remainingBytes: sumBytes(keepFiles),
    limitSatisfied: keepFiles.length <= policy.maxFiles && sumBytes(keepFiles) <= policy.maxBytes,
  };
}

function validatePolicy(policy: AllureRetentionPolicy): void {
  if (!Number.isInteger(policy.retainDays) || policy.retainDays < 1) {
    throw new Error(`Allure 保留天数无效：${policy.retainDays}`);
  }
  if (!Number.isInteger(policy.maxFiles) || policy.maxFiles < 1) {
    throw new Error(`Allure 文件上限无效：${policy.maxFiles}`);
  }
  if (!Number.isFinite(policy.maxBytes) || policy.maxBytes < 1) {
    throw new Error(`Allure 容量上限无效：${policy.maxBytes}`);
  }
}

function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

function sumBytes(files: readonly { sizeBytes: number }[]): number {
  return files.reduce((sum, file) => sum + file.sizeBytes, 0);
}

function compareFiles(
  left: AllureResultFile & { day: string },
  right: AllureResultFile & { day: string },
): number {
  return left.modifiedAt.getTime() - right.modifiedAt.getTime()
    || left.relativePath.localeCompare(right.relativePath);
}
