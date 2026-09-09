import type { RecipeAction, RecipeCapabilityContract } from './automation-recipe';

export type RecipeCapabilityDefinition<Context> = RecipeCapabilityContract & {
  execute: (
    context: Context,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
};

export class CapabilityRegistry<Context> {
  private readonly definitions = new Map<string, RecipeCapabilityDefinition<Context>>();

  register(definition: RecipeCapabilityDefinition<Context>): void {
    if (this.definitions.has(definition.id)) throw new Error(`能力已注册：${definition.id}`);
    this.definitions.set(definition.id, definition);
  }

  contracts(): RecipeCapabilityContract[] {
    return [...this.definitions.values()].map(({ id, actions, requiredInputs }) => ({
      id, actions, requiredInputs,
    }));
  }

  async execute(
    id: string,
    action: RecipeAction,
    context: Context,
    input: Readonly<Record<string, unknown>> = {},
  ): Promise<unknown> {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`未知能力：${id}`);
    if (!definition.actions.includes(action)) throw new Error(`能力 ${id} 不支持动作 ${action}`);
    for (const requiredInput of definition.requiredInputs) {
      if (!(requiredInput in input)) throw new Error(`能力 ${id} 缺少输入 ${requiredInput}`);
    }
    return definition.execute(context, input);
  }
}
