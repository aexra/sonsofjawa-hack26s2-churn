import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeEventSource } from '@/test/fake-event-source';

import { OFFLINE_AFTER_MS, createLiveConnection, RECONNECT_RETRY_MS } from './events';

describe('createLiveConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a single credentialed stream', () => {
    createLiveConnection('http://api.test/api/v1/events').connect();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.current.url).toBe('http://api.test/api/v1/events');
    expect(FakeEventSource.current.withCredentials).toBe(true);
  });

  it('does not touch the network until connected and can be connected again after close', () => {
    const connection = createLiveConnection('/events');
    expect(FakeEventSource.instances).toHaveLength(0);

    connection.connect();
    connection.close();
    connection.connect();

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0]?.readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.current.readyState).toBe(FakeEventSource.CONNECTING);
  });

  it('delivers parsed events to listeners of that type only', () => {
    const connection = createLiveConnection('/events');
    connection.connect();
    const completed = vi.fn();
    const started = vi.fn();
    connection.subscribe('recalc.completed', completed);
    connection.subscribe('recalc.started', started);

    FakeEventSource.current.emit('recalc.completed', {
      runId: 7,
      trigger: 'manual',
      finishedAt: '2026-10-24T12:04:00Z',
    });

    expect(completed).toHaveBeenCalledExactlyOnceWith({
      type: 'recalc.completed',
      runId: 7,
      trigger: 'manual',
      finishedAt: '2026-10-24T12:04:00Z',
    });
    expect(started).not.toHaveBeenCalled();
  });

  it('still delivers an event whose payload is malformed', () => {
    const connection = createLiveConnection('/events');
    connection.connect();
    const listener = vi.fn();
    connection.subscribe('model.updated', listener);

    FakeEventSource.current.emitRaw('model.updated', 'not json');
    FakeEventSource.current.emit('model.updated', { modelVersion: 'x' });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith({ type: 'model.updated' });
  });

  it('stops delivering after unsubscribe', () => {
    const connection = createLiveConnection('/events');
    connection.connect();
    const listener = vi.fn();
    const off = connection.subscribe('ingest.completed', listener);

    off();
    FakeEventSource.current.emit('ingest.completed', { entity: 'customers' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('goes offline only after the error lasts ten seconds', () => {
    const connection = createLiveConnection('/events');
    connection.connect();
    FakeEventSource.current.open();
    expect(connection.getStatus()).toBe('open');

    FakeEventSource.current.fail();
    vi.advanceTimersByTime(OFFLINE_AFTER_MS - 1);
    expect(connection.getStatus()).toBe('open');

    vi.advanceTimersByTime(1);
    expect(connection.getStatus()).toBe('offline');
  });

  it('notifies status listeners on every change', () => {
    const connection = createLiveConnection('/events');
    connection.connect();
    const listener = vi.fn();
    connection.onStatus(listener);

    FakeEventSource.current.open();
    FakeEventSource.current.fail();
    vi.advanceTimersByTime(OFFLINE_AFTER_MS);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('asks for a resync when the stream recovers after an error', () => {
    const connection = createLiveConnection('/events');
    connection.connect();
    const resync = vi.fn();
    connection.onReconnect(resync);
    FakeEventSource.current.open();
    expect(resync).not.toHaveBeenCalled();

    FakeEventSource.current.fail();
    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    FakeEventSource.current.open();

    expect(connection.getStatus()).toBe('open');
    expect(resync).toHaveBeenCalledOnce();

    FakeEventSource.current.open();
    expect(resync).toHaveBeenCalledOnce();
  });

  it('reopens a stream the browser gave up on', () => {
    createLiveConnection('/events').connect();
    const first = FakeEventSource.current;

    first.fail({ closed: true });
    expect(FakeEventSource.instances).toHaveLength(1);

    vi.advanceTimersByTime(RECONNECT_RETRY_MS);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.current).not.toBe(first);
  });

  it('closes the stream and stops retrying after close', () => {
    const connection = createLiveConnection('/events');
    connection.connect();
    const first = FakeEventSource.current;
    first.fail({ closed: true });

    connection.close();
    vi.advanceTimersByTime(RECONNECT_RETRY_MS + OFFLINE_AFTER_MS);

    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(connection.getStatus()).toBe('connecting');
  });
});
