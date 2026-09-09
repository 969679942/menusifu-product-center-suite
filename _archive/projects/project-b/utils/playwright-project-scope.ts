export function resolveRequestedPlaywrightProjects(argv: readonly string[]): string[] {
  return argv.flatMap((value, index) => {
    if (value === '--project' || value === '-p') return argv[index + 1]?.split(',') ?? [];
    if (value.startsWith('--project=')) return value.slice('--project='.length).split(',');
    return [];
  }).map((value) => value.trim()).filter(Boolean);
}

export function isInfrastructureOnlyPlaywrightRun(argv: readonly string[]): boolean {
  const projects = resolveRequestedPlaywrightProjects(argv);
  return projects.length > 0 && projects.every((project) => project === 'api' || project === 'setup');
}
