export class TimelineController {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.percent = 100;
    this.playing = false;
    this.speed = 0.4;
    this.#tick();
  }
  setPercent(v) { this.percent = Math.max(0, Math.min(100, Number(v))); this.onUpdate(this.percent); }
  play() { this.playing = true; }
  pause() { this.playing = false; }
  rewind() { this.percent = 0; this.onUpdate(this.percent); }
  #tick = () => {
    requestAnimationFrame(this.#tick);
    if (!this.playing) return;
    this.percent = Math.min(100, this.percent + this.speed);
    this.onUpdate(this.percent);
    if (this.percent >= 100) this.playing = false;
  }
}
