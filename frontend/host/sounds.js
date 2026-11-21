const sounds = (() => {
  let audio;
  let noiseBuffer;
  let muted = sessionStorage.getItem("sky-muted") === "true";
  const tunes = {
    join: [[660, .08]], beep: [[430, .12]], go: [[850, .25]],
    drum: [[100, .05], [100, .05], [115, .05], [130, .09]],
    podium: [[440, .1], [554, .16]],
    podium2: [[523, .1], [659, .18]],
    drumroll: [
      [110, .06], [115, .06], [120, .06], [128, .06],
      [136, .05], [145, .05], [156, .05], [168, .05],
      [182, .05], [198, .05], [216, .05], [240, .08]
    ],
    win: [[523, .13], [659, .13], [784, .13], [1047, .4]],
    fanfare: [[523, .11], [659, .11], [784, .11], [1047, .16], [784, .09], [1047, .5]],
    tick: [[760, .06]],
    buzzer: [[240, .15], [175, .24]]
  };

  function unlock() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();
    audio.resume().catch(() => {});
  }

  function getNoiseBuffer() {
    if (!audio) return null;
    if (noiseBuffer) return noiseBuffer;
    const len = Math.floor(audio.sampleRate * 0.25);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
    return buf;
  }

  function tone(freq, start, dur, type = "triangle", peak = 0.06, endFreq = null) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq != null) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.014, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + dur + 0.01);
  }

  function snareHit(start, peak = 0.055, filterHz = 1150, dur = 0.055) {
    const buf = getNoiseBuffer();
    if (!buf) return;
    const src = audio.createBufferSource();
    src.buffer = buf;
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(filterHz, start);
    filter.Q.value = 1.4;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start(start);
    src.stop(start + dur + 0.01);
  }

  function playPodiumRise(tier) {
    const now = audio.currentTime;
    // Stage thump + ascending synth chime, higher for 2nd than 3rd.
    if (tier === 3) {
      tone(130, now, 0.22, "triangle", 0.09, 64);
      tone(392, now + 0.02, 0.14, "triangle", 0.07);
      tone(493.88, now + 0.14, 0.24, "square", 0.045);
      tone(587.33, now + 0.26, 0.34, "triangle", 0.07);
    } else {
      tone(148, now, 0.24, "triangle", 0.095, 72);
      tone(440, now + 0.02, 0.13, "triangle", 0.075);
      tone(554.37, now + 0.13, 0.14, "square", 0.05);
      tone(659.25, now + 0.25, 0.38, "triangle", 0.08);
      tone(880, now + 0.27, 0.32, "sine", 0.045);
    }
  }

  function playLongDrumroll() {
    const now = audio.currentTime;
    const totalDur = 2.18;
    let t = 0;
    let step = 0;
    while (t < totalDur) {
      const p = t / totalDur;
      const gap = 0.092 - p * 0.052;
      const snarePeak = 0.022 + p * 0.075;
      const filterHz = 920 + p * 950;
      snareHit(now + t, snarePeak, filterHz, 0.052);
      // Alternating timpani undertone rising in pitch with tension.
      const timpHz = 105 + p * 145 + (step % 2 ? 12 : 0);
      tone(timpHz, now + t, 0.06, "triangle", 0.028 + p * 0.045);
      t += gap;
      step++;
    }
    // Crisp cutoff accent right before the silent suspense pause.
    snareHit(now + totalDur, 0.11, 1850, 0.09);
    tone(265, now + totalDur, 0.11, "triangle", 0.075, 190);
  }

  function playChampionFanfare() {
    const now = audio.currentTime;
    // Warm filtered brassy voices + bright melody flourish (original SkySketch theme).
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.connect(audio.destination);

    const brassNote = (freq, start, dur, peak = 0.055) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.018);
      gain.gain.setValueAtTime(peak * 0.85, start + Math.max(0.03, dur * 0.7));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(filter);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    // Bass impact & celebratory cymbal shimmer
    tone(130.81, now, 0.45, "triangle", 0.11, 65.41);
    snareHit(now, 0.09, 3400, 0.22);

    // Rising fanfare motif
    const melody = [
      [523.25, 0.00, 0.14],
      [659.25, 0.13, 0.14],
      [783.99, 0.26, 0.15],
      [1046.5, 0.41, 0.30],
      [783.99, 0.72, 0.12],
      [987.77, 0.84, 0.12],
      [1046.5, 0.97, 0.92]
    ];
    for (const [f, off, d] of melody) {
      brassNote(f, now + off, d, 0.052);
      tone(f, now + off, d, "triangle", 0.048);
    }

    // Lush final C-major chord bed + sparkle octave
    for (const f of [261.63, 329.63, 392.00, 523.25, 659.25]) {
      brassNote(f, now + 0.97, 0.98, 0.026);
    }
    tone(1567.98, now + 1.05, 0.55, "sine", 0.03);
    tone(2093.00, now + 1.16, 0.65, "sine", 0.028);
  }

  function play(key) {
    if (muted || audio?.state !== "running") return;
    if (key === "podium3") return playPodiumRise(3);
    if (key === "podium2") return playPodiumRise(2);
    if (key === "longDrumroll") return playLongDrumroll();
    if (key === "championFanfare") return playChampionFanfare();
    const notes = tunes[key];
    if (!notes) return;
    let at = audio.currentTime;
    for (const [frequency, duration] of notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = key === "drum" || key === "drumroll" ? "triangle" : "square";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(.055, at + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + duration);
      at += duration + (key === "drumroll" ? .02 : .025);
    }
  }
  const toggle = document.getElementById("mute");
  function reflect() {
    toggle.textContent = muted ? "Unmute" : "Mute";
    toggle.setAttribute("aria-pressed", String(muted));
  }
  toggle.onclick = () => {
    unlock();
    muted = !muted;
    sessionStorage.setItem("sky-muted", muted);
    reflect();
  };
  reflect();
  return { unlock, play };
})();
