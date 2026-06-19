import { Emitter } from "./Emitter.js";

export type ModelUpdate<T> = T | ((current: T) => T);

export class SliceModel<T> extends Emitter {
  constructor(public value: T) {
    super();
  }

  set(update: ModelUpdate<T>): void {
    const next = typeof update === "function" ? (update as (current: T) => T)(this.value) : update;
    if (Object.is(next, this.value)) return;
    this.value = next;
    this.emit();
  }

  mutate(update: (current: T) => void): void {
    update(this.value);
    this.emit();
  }
}
