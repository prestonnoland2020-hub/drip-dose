// Guided brew timer engine. Wall-clock (Date.now) so a locked phone doesn't
// lose time; a visibilitychange re-sync is handled by the view.
export class Brew {
  constructor(steps, { onTick, onStage, onDone } = {}) {
    this.steps = steps; this.total = steps[steps.length - 1].t[1]
    this.onTick = onTick || (() => {}); this.onStage = onStage || (() => {}); this.onDone = onDone || (() => {})
    this.running = false; this.startedAt = 0; this.elapsed = 0; this.finished = false; this.lastStage = -1
    this.actual = []   // [{ step, at, grams }] what really happened
    this.skips = []
    this._iv = 0
  }
  now() { return Date.now() / 1000 }
  t() { return this.running ? this.now() - this.startedAt : this.elapsed }
  stageAt(t) { return this.steps.findIndex(s => t < s.t[1]) }   // -1 when past the end
  start() { if (this.finished) return; this.startedAt = this.now() - this.elapsed; this.running = true; this._iv = setInterval(() => this.tick(), 100); this.tick() }
  pause() { if (!this.running) return; this.elapsed = this.t(); this.running = false; clearInterval(this._iv); this.tick() }
  toggle() { this.running ? this.pause() : this.start() }
  skip() {   // jump to the start of the next step
    const i = this.stageAt(this.t()); if (i < 0 || i >= this.steps.length - 1) return this.end()
    this.skips.push({ from: i, at: Math.round(this.t()) })
    const to = this.steps[i + 1].t[0]
    if (this.running) this.startedAt = this.now() - to; else this.elapsed = to
    this.tick()
  }
  record(grams) { this.actual.push({ step: this.stageAt(this.t()), at: Math.round(this.t()), grams }) }
  end() { this.elapsed = this.t(); this.running = false; clearInterval(this._iv); this.finished = true; this.onDone(this) }
  tick() {
    const t = this.t(), i = this.stageAt(t)
    if (i !== this.lastStage) { this.onStage(i, this.lastStage, this); this.lastStage = i }
    this.onTick(t, i, this)
    // Past the target time we keep counting (brief: "continue past target time") but flag it.
  }
  destroy() { clearInterval(this._iv) }
}
