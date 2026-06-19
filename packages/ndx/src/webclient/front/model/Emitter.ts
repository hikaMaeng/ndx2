export type Unsubscribe = () => void;

export class Emitter {
  #version = 0;
  #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.#version;

  protected emit(): void {
    this.#version += 1;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
