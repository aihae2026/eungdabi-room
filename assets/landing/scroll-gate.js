/* A wheel event is a sample, not a gesture. Consume a continuous burst once. */
(function (root) {
  'use strict';
  class ScrollGestureGate {
    constructor({ quietMs = 100, threshold = 32 } = {}) {
      this.quietMs = quietMs;
      this.threshold = threshold;
      this.lastEvent = -Infinity;
      this.lastMagnitude = 0;
      this.mode = 'pending';
      this.direction = 0;
      this.reversal = 0;
      this.total = 0;
      this.allowNativeScroll = false;
    }
    sample(delta, now, { nativeScroll = false } = {}) {
      this.allowNativeScroll = false;
      if (!Number.isFinite(delta) || !Number.isFinite(now) || delta === 0) return 0;
      const direction = Math.sign(delta);
      // Reading a tall mobile page keeps a little more separation at its edge.
      const quietMs = this.mode === 'native' ? Math.max(160, this.quietMs) : this.quietMs;
      const gap = now - this.lastEvent;
      // Sparse, shrinking samples are still the tail of the consumed gesture.
      const decayingTail = this.mode === 'stage' && direction === this.direction &&
        Math.abs(delta) < this.lastMagnitude && gap < 300;
      if (gap >= quietMs && !decayingTail) {
        this.mode = 'pending';
        this.direction = direction;
        this.reversal = 0;
        this.total = 0;
      }
      this.lastEvent = now;
      this.lastMagnitude = Math.abs(delta);
      if (!this.direction || this.mode === 'pending') {
        if (this.direction !== direction) this.total = 0;
        this.direction = direction;
      } else if (direction !== this.direction) {
        // A deliberate reversal is fresh intent. Tiny trackpad bounce is not.
        this.reversal += delta;
        if (Math.abs(this.reversal) < this.threshold) {
          this.allowNativeScroll = this.mode === 'native' && nativeScroll;
          return 0;
        }
        this.total = this.reversal - delta;
        this.reversal = 0;
        this.direction = direction;
        this.mode = 'pending';
      } else {
        this.reversal = 0;
      }
      // A stage owns its entire burst, even after entering an overflowing page.
      if (this.mode === 'stage') return 0;
      if (nativeScroll) {
        this.mode = 'native';
        this.allowNativeScroll = true;
        return 0;
      }
      // Reading to an edge must not also advance a stage in the same burst.
      if (this.mode === 'native') return 0;
      this.total += delta;
      if (Math.abs(this.total) < this.threshold) return 0;
      this.mode = 'stage';
      return direction;
    }
    block(now) {
      this.mode = now - this.lastEvent < this.quietMs ? 'stage' : 'pending';
      this.allowNativeScroll = false;
      this.total = 0;
      this.reversal = 0;
    }
    static normalize(delta, mode, pageHeight) {
      return delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = ScrollGestureGate;
  else root.ScrollGestureGate = ScrollGestureGate;
})(typeof window !== 'undefined' ? window : globalThis);
