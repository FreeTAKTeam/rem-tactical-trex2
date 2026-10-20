import { wrap360 } from "./geometry.js";

/** Legacy compass lifecycle; geographic reference deliberately remains unverified. */
export function createWristCompass({ sensorApi, emit, now = Date.now, bindings = new Map(), onDiagnostic = () => {} }) {
  let sensor = null;
  let binding = null;
  let listener = null;
  let active = false;
  let generation = 0;
  let lastAt = null;
  let lastReadingAt = null;
  let lastValue = null;
  let lastStatus = null;
  function stop() {
    active = false;
    generation++;
    if (binding && binding.listener === listener) binding.release();
    sensor = null;
    binding = null;
    listener = null;
    lastAt = null;
    lastReadingAt = null;
    lastValue = null;
    lastStatus = null;
  }
  function start() {
    if (active) return;
    stop();
    if (!sensorApi || !sensorApi.id || sensorApi.id.COMPASS === undefined ||
        !sensorApi.event || sensorApi.event.CHANGE === undefined || typeof sensorApi.createSensor !== "function") {
      onDiagnostic("API_UNAVAILABLE");
      emit({ type: "HEADING", status: "unavailable" });
      return;
    }
    const current = generation;
    try {
      binding = bindings.get(sensorApi.id.COMPASS) || null;
      sensor = binding ? binding.sensor : sensorApi.createSensor(sensorApi.id.COMPASS);
      if (!sensor || typeof sensor.start !== "function" || typeof sensor.stop !== "function" ||
          typeof sensor.addEventListener !== "function") throw new Error("Unavailable");
      if (!binding) {
        // Both firmware shapes share an App-owned sensor lease. An old page's
        // teardown must not stop a sensor already acquired by its replacement.
        binding = { sensor, listener: null, started: false, registered: false,
          removable: typeof sensor.removeEventListener === "function", epoch: 0, forward: null,
          release() {
            this.listener = null;
            if (this.removable && this.forward) {
              this.epoch++;
              this.registered = false;
              const forward = this.forward;
              this.forward = null;
              try { this.sensor.removeEventListener(sensorApi.event.CHANGE, forward); } catch { /* Firmware cleanup. */ }
            }
            if (this.started) { this.started = false; try { this.sensor.stop(); } catch { /* Firmware cleanup. */ } }
          }
        };
        bindings.set(sensorApi.id.COMPASS, binding);
      }
      active = true;
      listener = (value) => {
        if (!active || current !== generation) return;
        const reading = value && value.calibration_status !== undefined ? value : sensor;
        const raw = reading.direction_angle;
        // The working face normalizes native numeric strings as well as numbers.
        const numeric = typeof raw === "number" || typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
        const heading = reading.calibration_status ? wrap360(numeric) : null;
        const status = !reading.calibration_status ? "calibration" : heading === null ? "unavailable" : "valid";
        if (status !== lastStatus) { lastStatus = status; onDiagnostic(status === "valid" ? "READING_VALID" : status === "calibration" ? "CALIBRATION_REQUIRED" : "READING_UNAVAILABLE"); }
        const time = now();
        const reset = lastReadingAt === null || !Number.isFinite(lastReadingAt) || !Number.isFinite(time) || time < lastReadingAt || time - lastReadingAt > 2000;
        lastReadingAt = time;
        const signature = status === "valid" ? `${status}:${Math.round(heading)}` : status;
        // Calibration changes are immediate; valid heading updates are capped at 5 Hz.
        if (!reset && (signature === lastValue || (status === "valid" && lastValue && lastValue.startsWith("valid:") && time - lastAt < 200))) return;
        lastAt = time;
        lastValue = signature;
        emit({ type: "HEADING", status, value: heading, reference: "unverified", reset });
      };
      // Match the working legacy face: activate the sensor before subscribing.
      binding.listener = listener;
      if (!binding.started) { binding.started = true; sensor.start(); }
      if (!binding.registered) {
        const record = binding;
        const epoch = ++record.epoch;
        record.forward = (value) => {
          if (record.epoch !== epoch || !record.listener) return;
          // Without unsubscribe, queued events can belong to an old page.
          record.listener(record.removable ? value : record.sensor);
        };
        sensor.addEventListener(sensorApi.event.CHANGE, record.forward);
        record.registered = true;
        if (!record.removable) onDiagnostic("LEGACY_LISTENER_REUSED");
      }
      listener(sensor);
    } catch {
      stop();
      onDiagnostic("START_FAILED");
      emit({ type: "HEADING", status: "unavailable" });
    }
  }
  return { start, stop };
}
