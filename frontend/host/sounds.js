const sounds = (() => {
  let audio;
  let muted = sessionStorage.getItem("sky-muted") === "true";
  const tunes = {
    join: [[660, .08]], beep: [[430, .12]], go: [[850, .25]],
    drum: [[100, .05], [100, .05], [115, .05], [130, .09]],
    win: [[523, .13], [659, .13], [784, .13], [1047, .4]]
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
      osc.type = key === "drum" ? "triangle" : "square";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(.055, at + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + duration);
      at += duration + .025;
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
