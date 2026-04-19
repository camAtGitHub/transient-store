// js/perf.js
// Session-level performance tiering based on bookmark count.

export class PerfTier {
  constructor(itemCount) {
    const safeCount = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;
    this._count = safeCount;
    this._tier = safeCount <= 150 ? 'full' : (safeCount <= 350 ? 'reduced' : 'minimal');
    this._useWebGL = this._detectWebGL2();
  }

  get tier() { return this._tier; }
  get count() { return this._count; }
  get useWebGL() { return this._useWebGL; }

  get particleBudget() {
    if (this._tier === 'full') return 60;
    if (this._tier === 'reduced') return 30;
    return 15;
  }

  get ripplesEnabled() {
    return this._tier !== 'minimal';
  }

  get itemFiltersEnabled() {
    return this._tier === 'full';
  }

  get dustEnabled() {
    return this._tier === 'full';
  }

  _detectWebGL2() {
    try {
      return typeof WebGL2RenderingContext !== 'undefined';
    } catch {
      return false;
    }
  }
}
