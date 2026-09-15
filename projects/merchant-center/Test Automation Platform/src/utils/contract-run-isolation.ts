export interface ContractRunIsolationInput {
  argv: readonly string[];
  contractProjectNames: readonly string[];
  isolationRequested: boolean;
}

/** Only explicit, literal contract-project selections may bypass business hooks. */
export function resolveContractRunIsolation(input: ContractRunIsolationInput): {
  isolated: boolean;
  selectedProjects: string[];
} {
  const selectedProjects: string[] = [];
  for (let index = 0; index < input.argv.length; index += 1) {
    const argument = input.argv[index];
    if (argument === '--') break;
    if (argument === '--project' || argument === '-p') {
      const values: string[] = [];
      while (index + 1 < input.argv.length && !input.argv[index + 1].startsWith('-')) {
        values.push(input.argv[++index]);
      }
      if (!values.length) throw new Error('CONTRACT_ISOLATION_PROJECT_ARGUMENT_INVALID');
      selectedProjects.push(...values.flatMap((value) => value.split(',')));
    } else if (argument.startsWith('--project=') || argument.startsWith('-p=')) {
      selectedProjects.push(...argument.slice(argument.indexOf('=') + 1).split(','));
      while (index + 1 < input.argv.length && !input.argv[index + 1].startsWith('-')) {
        selectedProjects.push(...input.argv[++index].split(','));
      }
    }
  }
  if (selectedProjects.some((name) => !name.trim())) {
    throw new Error('CONTRACT_ISOLATION_PROJECT_ARGUMENT_INVALID');
  }
  const isolated = selectedProjects.length > 0
    && selectedProjects.every((name) => input.contractProjectNames.includes(name));
  if (input.isolationRequested && !isolated) {
    throw new Error('CONTRACT_ISOLATION_SELECTION_MISMATCH');
  }
  return { isolated, selectedProjects: [...new Set(selectedProjects)] };
}
