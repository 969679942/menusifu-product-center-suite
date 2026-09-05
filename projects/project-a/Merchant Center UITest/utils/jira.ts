type JiraIssueKey = `MC-${number}` | `POS-${number}`;

const jiraIssueBaseUrl = 'https://devtickets.atlassian.net/browse';

export function jiraIssueUrl(issueKey: JiraIssueKey): string {
  return `${jiraIssueBaseUrl}/${issueKey}`;
}

export function jiraIssueAnnotation(issueKey: JiraIssueKey): {
  type: 'issue';
  description: string;
} {
  return {
    type: 'issue',
    description: jiraIssueUrl(issueKey),
  };
}

export function jiraIssueAnnotations(issueKeys: readonly JiraIssueKey[]): Array<{
  type: 'issue';
  description: string;
}> {
  return issueKeys.map((issueKey) => jiraIssueAnnotation(issueKey));
}
