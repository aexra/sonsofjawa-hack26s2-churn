type Listener = (event: Event) => void;

export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  static reset() {
    FakeEventSource.instances = [];
  }

  static get current(): FakeEventSource {
    const latest = FakeEventSource.instances.at(-1);
    if (!latest) throw new Error('no EventSource was created');
    return latest;
  }

  readonly url: string;
  readonly withCredentials: boolean;
  readyState: number = FakeEventSource.CONNECTING;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  open() {
    this.readyState = FakeEventSource.OPEN;
    this.dispatch(new Event('open'));
  }

  emit(type: string, data: unknown) {
    this.dispatch(new MessageEvent(type, { data: JSON.stringify(data) }));
  }

  emitRaw(type: string, data: string) {
    this.dispatch(new MessageEvent(type, { data }));
  }

  fail(options: { closed?: boolean } = {}) {
    this.readyState = options.closed ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
    this.dispatch(new Event('error'));
  }

  private dispatch(event: Event) {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
  }
}
