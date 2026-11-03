/*
 * sensor.js - a SIMULATED rear parking sensor
 * ===========================================
 *
 * What this is for
 * ----------------
 * In a real car, the rear parking sensor streams a new distance reading to the
 * infotainment screen several times a second. You don't have a car in class,
 * so this file stands in for that stream.
 *
 * It is only a simulation. It replays one recorded parking run, stored in
 * data.js, at the same pace it was recorded: five readings a second. Your page
 * receives the readings exactly as if a real sensor were sending them live.
 * Nothing here talks to real hardware or to the internet.
 *
 * How it works
 * ------------
 * 1. data.js holds the recorded run as CSV text, one line per reading, in the
 *    same format the Arduino sketch from the hardware part prints.
 * 2. When you call sensor.start(), this file goes through the readings in
 *    order. It waits until each reading's time_ms has passed, then sends it.
 * 3. Every function you gave to sensor.onReading() is called with each reading
 *    the moment it's sent.
 *
 * How to use it
 * -------------
 * Load data.js first, then sensor.js, then your own code:
 *
 *   <script src="data.js"></script>
 *   <script src="sensor.js"></script>
 *   <script>
 *     sensor.onReading(function (reading) {
 *       console.log(reading.distance_cm);
 *     });
 *     sensor.start();
 *   </script>
 *
 * What each reading looks like
 * ----------------------------
 *   time_ms        milliseconds since the run started
 *   distance_cm    distance to the obstacle in centimetres, or NaN if the
 *                  sensor missed
 *   missed         true when the sensor got no echo, so there's no distance
 *   echo_us        how long the sound took to come back, in microseconds
 *                  (NaN if missed)
 *   warning_level  the Arduino's own zone, using its cutoffs: 0 safe (over
 *                  100 cm), 1 caution (30 to 100 cm), 2 danger (under 30 cm),
 *                  -1 missed. Your screen can use its own zones instead.
 *   servo_angle    where the Arduino's gauge needle points, 0 to 180
 *   sentAt         when this reading was sent, as performance.now(). Compare
 *                  it with performance.now() when your screen updates to
 *                  measure your own delay.
 *
 * Everything you can call
 * -----------------------
 *   sensor.onReading(fn)  call fn(reading) for every reading
 *   sensor.onEnd(fn)      call fn() each time the run reaches its last reading
 *   sensor.start()        start the stream and play the run once
 *   sensor.start({ loop: true })  play the run over and over
 *   sensor.stop()         stop the stream
 *   sensor.durationMs     how long one run lasts, in milliseconds
 *   sensor.readingCount   how many readings are in one run
 *
 * Swapping in a real sensor later
 * -------------------------------
 * Keep your screen getting its data only through sensor.onReading. Then this
 * file could be replaced by one that reads a real Arduino, for example over
 * USB with the browser's Web Serial feature, and your screen code wouldn't
 * need to change.
 */
(function () {
  "use strict";

  if (typeof window.SENSOR_DATA_CSV !== "string") {
    throw new Error("sensor.js: no recorded run found. Load data.js before sensor.js.");
  }

  const rows = parseCsv(window.SENSOR_DATA_CSV);
  // The recording has a reading every 200 ms, so one run lasts until 200 ms
  // after its last reading. Looping waits that long before starting again.
  const periodMs = rows.length > 1 ? rows[1].time_ms - rows[0].time_ms : 200;
  const durationMs = rows[rows.length - 1].time_ms + periodMs;

  const readingListeners = [];
  const endListeners = [];
  let timer = null;
  let running = false;
  let looping = false;

  // Turn the CSV text into one object per reading. Number("NaN") is NaN,
  // which is how a missed reading comes through.
  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    lines.shift(); // the header line
    return lines
      .filter(function (line) { return line.trim() !== "" && line[0] !== "#"; })
      .map(function (line) {
        const v = line.split(",");
        return {
          time_ms: Number(v[0]),
          distance_cm: Number(v[1]),
          echo_us: Number(v[2]),
          warning_level: Number(v[3]),
          servo_angle: Number(v[4]),
        };
      });
  }

  function send(row) {
    const reading = {
      time_ms: row.time_ms,
      distance_cm: row.distance_cm,
      missed: Number.isNaN(row.distance_cm),
      echo_us: row.echo_us,
      warning_level: row.warning_level,
      servo_angle: row.servo_angle,
      sentAt: performance.now(),
    };
    readingListeners.forEach(function (fn) {
      // One broken listener shouldn't stop the stream for the others.
      try { fn(reading); } catch (err) { console.error("sensor.js: an onReading function threw an error", err); }
    });
  }

  // Each reading is due at runStart + its time_ms. Waiting for that exact
  // moment, rather than a fixed 200 ms after the last one, stops small timer
  // delays from adding up, so a 40 second run really takes 40 seconds.
  function playFrom(index, runStart) {
    if (!running) return;
    if (index >= rows.length) {
      endListeners.forEach(function (fn) {
        try { fn(); } catch (err) { console.error("sensor.js: an onEnd function threw an error", err); }
      });
      if (looping) {
        playFrom(0, runStart + durationMs);
      } else {
        running = false;
      }
      return;
    }
    const row = rows[index];
    const wait = Math.max(0, runStart + row.time_ms - performance.now());
    timer = setTimeout(function () {
      send(row);
      playFrom(index + 1, runStart);
    }, wait);
  }

  window.sensor = {
    onReading: function (fn) { readingListeners.push(fn); },
    onEnd: function (fn) { endListeners.push(fn); },
    start: function (options) {
      if (running) return;
      running = true;
      looping = Boolean(options && options.loop);
      playFrom(0, performance.now());
    },
    stop: function () {
      running = false;
      clearTimeout(timer);
    },
    durationMs: durationMs,
    readingCount: rows.length,
  };
})();
