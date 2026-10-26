// Latest-request-wins primitive. Pure and dependency-free so it can be tested
// in Node. Both the assistant answer chain and the location loader use this
// pattern (the location loader keeps its counter on `state.epoch`).
export function createRequestGuard() {
  let serial = 0;
  return {
    next() { return ++serial; },
    isCurrent(id) { return id === serial; },
    cancel() { return ++serial; },
    get current() { return serial; }
  };
}

/** True when a response belongs to a request that is still current AND the
 * location has not been changed by a newer request. */
export function isFresh({ id, guard, epochAtStart, currentEpoch, expectedEpoch, aborted = false }) {
  if (aborted || !guard.isCurrent(id)) return false;
  if (Number.isFinite(expectedEpoch)) return currentEpoch === expectedEpoch;
  return currentEpoch >= epochAtStart;
}

export default createRequestGuard;
