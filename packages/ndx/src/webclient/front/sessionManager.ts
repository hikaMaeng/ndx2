export type NDXWebClientSessionUiStateFactory<TState> = () => TState;

export class NDXWebClientSessionUiManager<TState> {
  readonly #createState: NDXWebClientSessionUiStateFactory<TState>;
  #activeKey: string | undefined;
  #states: Record<string, TState>;

  constructor(createState: NDXWebClientSessionUiStateFactory<TState>, initialStates: Record<string, TState> = {}) {
    this.#createState = createState;
    this.#states = initialStates;
  }

  get activeKey() {
    return this.#activeKey;
  }

  get snapshot() {
    return this.#states;
  }

  keys() {
    return Object.keys(this.#states);
  }

  get(key: string) {
    return this.#states[key];
  }

  ensure(key: string) {
    const existing = this.#states[key];
    if (existing) return existing;
    const state = this.#createState();
    this.#states = { ...this.#states, [key]: state };
    return state;
  }

  update(key: string, update: (current: TState) => TState) {
    const existing = this.#states[key] ?? this.#createState();
    const state = update(existing);
    this.#states = { ...this.#states, [key]: state };
    return state;
  }

  setActiveSession(sessionid: string) {
    this.#activeKey = sessionid;
    this.ensure(sessionid);
    return sessionid;
  }

  setActiveDraft(projectname: string) {
    const key = `draft:${projectname}`;
    this.#activeKey = key;
    this.ensure(key);
    return key;
  }

  clearActive() {
    this.#activeKey = undefined;
  }

  promoteToSession(sessionid: string, sourceKey = this.#activeKey) {
    const source = sourceKey ? this.#states[sourceKey] : undefined;
    this.#states = {
      ...this.#states,
      [sessionid]: source ?? this.#createState()
    };
    if (sourceKey?.startsWith("draft:")) {
      const next = { ...this.#states };
      delete next[sourceKey];
      this.#states = next;
    }
    this.#activeKey = sessionid;
    return this.#states[sessionid];
  }

  findKey(predicate: (state: TState, key: string) => boolean) {
    return Object.entries(this.#states).find(([key, state]) => predicate(state, key))?.[0];
  }

  delete(key: string) {
    if (!(key in this.#states)) return;
    const next = { ...this.#states };
    delete next[key];
    this.#states = next;
    if (this.#activeKey === key) {
      this.#activeKey = undefined;
    }
  }
}
