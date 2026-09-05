/** 同页动作：点击、填写、切换，不保证离开当前页。 */
export type SamePageAction = Promise<void>;

/** 跨页动作：保证返回目标页面对象实例。 */
export type CrossPageAction<TPage> = Promise<TPage>;

/** 页面读取动作：返回明确的数据模型，而非 Locator。 */
export type PageReadAction<TData> = Promise<TData>;
