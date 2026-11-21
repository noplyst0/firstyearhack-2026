const sounds = (() => {
  let audio;
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
  function play(key) {
    if (muted || audio?.state !== "running") return;
    let at = audio.currentTime;
    for (const [frequency, duration] of tunes[key]) {
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
