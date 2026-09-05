import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

export type ProductCenterSourceCitationVerification = {
  kind: 'prd-explicit' | 'business-rule-explicit' | 'business-rule-statement' | 'xmind-existing';
  citation: string;
  verified: true;
  matchedLocation: string;
  matchedText: string;
};

export type ProductCenterPrdCitationBinding = {
  citation: string;
  sectionHeading: string;
  itemNumber: number;
  itemIndent: number;
  expectedText: string;
};

export type ProductCenterXmindCitationBinding = {
  citation: string;
  expectedPath: string[];
};

export type ProductCenterBusinessRuleCitationBinding = {
  citation: string;
  sectionHeading: string;
  ruleId: string;
  expectedText: string;
};

export type ProductCenterBusinessRuleStatementBinding = {
  citation: string;
  sectionHeading: string;
  expectedText: string;
};

type XmindTopic = {
  title?: string;
  children?: Record<string, XmindTopic[] | undefined>;
};

type XmindSheet = {
  rootTopic?: XmindTopic;
};

type XmindXmlNode = {
  topic?: XmindXmlNode | XmindXmlNode[];
  title?: string | { '#text'?: string };
  children?: XmindXmlNode | XmindXmlNode[];
  topics?: XmindXmlNode | XmindXmlNode[];
  sheet?: XmindXmlNode | XmindXmlNode[];
  'xmap-content'?: XmindXmlNode;
};

export function verifyProductCenterPrdCitation(
  markdown: string,
  binding: ProductCenterPrdCitationBinding,
): ProductCenterSourceCitationVerification {
  if (!binding.citation.trim()) throw new Error('PRD 引用不能为空');
  if (!Number.isInteger(binding.itemNumber) || binding.itemNumber < 1) {
    throw new Error(`PRD 引用序号无效：${binding.itemNumber}`);
  }
  if (!Number.isInteger(binding.itemIndent) || binding.itemIndent < 0) {
    throw new Error(`PRD 引用缩进无效：${binding.itemIndent}`);
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const heading = findHeading(lines, binding.sectionHeading);
  const sectionLines = lines.slice(heading.index + 1, findSectionEnd(lines, heading));
  const items = sectionLines.flatMap((line) => {
    const matched = line.match(/^(\s*)-\s+(.+?)\s*$/);
    if (!matched || indentationWidth(matched[1]) !== binding.itemIndent) return [];
    return [matched[2].trim()];
  });
  const actualText = items[binding.itemNumber - 1];
  if (!actualText) {
    throw new Error(
      `PRD 引用序号不存在：${binding.sectionHeading}#${binding.itemNumber}`,
    );
  }
  if (normalizeText(actualText) !== normalizeText(binding.expectedText)) {
    throw new Error(
      `PRD 引用原句不一致：${binding.sectionHeading}#${binding.itemNumber}`,
    );
  }

  return {
    kind: 'prd-explicit',
    citation: binding.citation,
    verified: true,
    matchedLocation: `${binding.sectionHeading}#${binding.itemNumber}`,
    matchedText: actualText,
  };
}

export function verifyProductCenterXmindCitation(
  content: Buffer,
  binding: ProductCenterXmindCitationBinding,
): ProductCenterSourceCitationVerification {
  if (!binding.citation.trim()) throw new Error('XMind 引用不能为空');
  if (binding.expectedPath.length === 0 || binding.expectedPath.some((item) => !item.trim())) {
    throw new Error('XMind 引用节点路径不能为空');
  }

  const paths = readXmindTopicPaths(content);
  const expected = binding.expectedPath.map(normalizeText);
  const matches = paths.filter((topicPath) => pathEndsWith(
    topicPath.map(normalizeText),
    expected,
  ));
  if (matches.length === 0) {
    throw new Error(`XMind 引用节点路径不存在：${binding.expectedPath.join(' / ')}`);
  }
  if (matches.length > 1) {
    throw new Error(`XMind 引用节点路径不唯一：${binding.expectedPath.join(' / ')}`);
  }
  const matchedPath = matches[0];

  return {
    kind: 'xmind-existing',
    citation: binding.citation,
    verified: true,
    matchedLocation: matchedPath.join(' / '),
    matchedText: matchedPath.at(-1) ?? '',
  };
}

export function verifyProductCenterBusinessRuleCitation(
  markdown: string,
  binding: ProductCenterBusinessRuleCitationBinding,
): ProductCenterSourceCitationVerification {
  if (!binding.citation.trim()) throw new Error('BR 引用不能为空');
  if (!/^BR-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/.test(binding.ruleId)) {
    throw new Error(`BR 引用规则 ID 无效：${binding.ruleId}`);
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const heading = findHeading(lines, binding.sectionHeading, 'BR');
  const sectionLines = lines.slice(heading.index + 1, findSectionEnd(lines, heading));
  let historicalSection = false;
  const rules = sectionLines.flatMap((line) => {
    const sectionHeading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (sectionHeading && /历史/.test(normalizeText(sectionHeading[1]))) {
      historicalSection = true;
      return [];
    }
    const matched = line.match(/^\s*\*\*(BR-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3})\*\*\s+(.+?)\s*$/);
    return matched ? [{ ruleId: matched[1], text: matched[2].trim(), historical: historicalSection }] : [];
  });
  const matches = rules.filter((rule) => rule.ruleId === binding.ruleId);
  if (matches.length === 0) {
    throw new Error(`BR 引用规则不存在：${binding.sectionHeading}#${binding.ruleId}`);
  }
  // A current rule and its historical snapshot may share an ID; the current entry is authoritative.
  const currentMatches = matches.filter((rule) => !rule.historical);
  const selectedMatches = currentMatches.length > 0 ? currentMatches : matches;
  if (selectedMatches.length > 1) {
    throw new Error(`BR 引用规则不唯一：${binding.sectionHeading}#${binding.ruleId}`);
  }
  const actualText = selectedMatches[0].text;
  if (normalizeText(actualText) !== normalizeText(binding.expectedText)) {
    throw new Error(`BR 引用原句不一致：${binding.sectionHeading}#${binding.ruleId}`);
  }

  return {
    kind: 'business-rule-explicit',
    citation: binding.citation,
    verified: true,
    matchedLocation: `${binding.sectionHeading}#${binding.ruleId}`,
    matchedText: actualText,
  };
}

export function verifyProductCenterBusinessRuleStatement(
  markdown: string,
  binding: ProductCenterBusinessRuleStatementBinding,
): ProductCenterSourceCitationVerification {
  if (!binding.citation.trim()) throw new Error('业务规则语句引用不能为空');
  if (!binding.expectedText.trim()) throw new Error('业务规则语句原文不能为空');

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const heading = findHeading(lines, binding.sectionHeading, '业务规则');
  const sectionLines = lines.slice(heading.index + 1, findSectionEnd(lines, heading));
  const statements = sectionLines.flatMap((line) => {
    const matched = line.match(/^\s*-\s+(.+?)\s*$/);
    return matched ? [matched[1].trim()] : [];
  });
  const matches = statements.filter((statement) =>
    normalizeText(statement) === normalizeText(binding.expectedText));
  if (matches.length === 0) {
    throw new Error(`业务规则语句不存在：${binding.sectionHeading}#${binding.citation}`);
  }
  if (matches.length > 1) {
    throw new Error(`业务规则语句不唯一：${binding.sectionHeading}#${binding.citation}`);
  }

  return {
    kind: 'business-rule-statement',
    citation: binding.citation,
    verified: true,
    matchedLocation: binding.sectionHeading,
    matchedText: matches[0],
  };
}

function findHeading(
  lines: readonly string[],
  expectedHeading: string,
  sourceLabel = 'PRD',
): { index: number; level: number } {
  const matches = lines.flatMap((line, index) => {
    const matched = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!matched || normalizeText(matched[2]) !== normalizeText(expectedHeading)) return [];
    return [{ index, level: matched[1].length }];
  });
  if (matches.length === 0) throw new Error(`${sourceLabel} 引用章节不存在：${expectedHeading}`);
  if (matches.length > 1) throw new Error(`${sourceLabel} 引用章节不唯一：${expectedHeading}`);
  return matches[0];
}

function findSectionEnd(
  lines: readonly string[],
  heading: { index: number; level: number },
): number {
  const relativeIndex = lines.slice(heading.index + 1).findIndex((line) => {
    const matched = line.match(/^(#{1,6})\s+/);
    return Boolean(matched && matched[1].length <= heading.level);
  });
  return relativeIndex < 0 ? lines.length : heading.index + 1 + relativeIndex;
}

function readXmindTopicPaths(content: Buffer): string[][] {
  const archive = new AdmZip(content);
  const jsonEntry = archive.getEntry('content.json');
  if (jsonEntry) return readJsonXmindTopicPaths(jsonEntry.getData());
  const xmlEntry = archive.getEntry('content.xml');
  if (xmlEntry) return readXmlXmindTopicPaths(xmlEntry.getData());
  throw new Error('XMind 缺少 content.json 或 content.xml');
}

function readJsonXmindTopicPaths(content: Buffer): string[][] {
  let sheets: unknown;
  try {
    sheets = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error('XMind content.json 格式无效');
  }
  if (!Array.isArray(sheets)) throw new Error('XMind content.json 根节点必须是数组');

  const paths: string[][] = [];
  for (const sheet of sheets as XmindSheet[]) {
    if (sheet.rootTopic) collectTopicPaths(sheet.rootTopic, [], paths);
  }
  return paths;
}

function readXmlXmindTopicPaths(content: Buffer): string[][] {
  let document: XmindXmlNode;
  try {
    document = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      processEntities: true,
      trimValues: false,
    }).parse(content.toString('utf8')) as XmindXmlNode;
  } catch {
    throw new Error('XMind content.xml 格式无效');
  }

  const paths: string[][] = [];
  for (const sheet of asArray(document['xmap-content']?.sheet)) {
    for (const topic of asArray(sheet.topic)) collectXmlTopicPaths(topic, [], paths);
  }
  if (paths.length === 0) throw new Error('XMind content.xml 缺少 topic 节点');
  return paths;
}

function collectXmlTopicPaths(
  topic: XmindXmlNode,
  parentPath: readonly string[],
  paths: string[][],
): void {
  const title = readXmlTitle(topic.title).trim();
  const currentPath = title ? [...parentPath, title] : [...parentPath];
  if (title) paths.push(currentPath);
  for (const children of asArray(topic.children)) {
    for (const topics of asArray(children.topics)) {
      for (const child of asArray(topics.topic)) collectXmlTopicPaths(child, currentPath, paths);
    }
  }
}

function readXmlTitle(title: XmindXmlNode['title']): string {
  if (typeof title === 'string') return title;
  return typeof title?.['#text'] === 'string' ? title['#text'] : '';
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function collectTopicPaths(
  topic: XmindTopic,
  parentPath: readonly string[],
  paths: string[][],
): void {
  const title = typeof topic.title === 'string' ? topic.title.trim() : '';
  const currentPath = title ? [...parentPath, title] : [...parentPath];
  if (title) paths.push(currentPath);
  for (const group of Object.values(topic.children ?? {})) {
    for (const child of group ?? []) collectTopicPaths(child, currentPath, paths);
  }
}

function pathEndsWith(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length < expected.length) return false;
  return expected.every((segment, index) =>
    actual[actual.length - expected.length + index] === segment);
}

function indentationWidth(value: string): number {
  return [...value].reduce((width, character) => width + (character === '\t' ? 2 : 1), 0);
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}
