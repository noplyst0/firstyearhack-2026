// SVG meets its square viewBox inside the board: 100 units = min(width,height)/5.
const reveal = (() => {
  const colours = ["#6ef3ff","#ff9bbf","#acff83","#bba7ff","#ffab74","#92c8ff","#fa92fe","#75efbf","#f1f0a0","#ff9090"];
  const gold = "#ffd65b";
  const svg = document.getElementById("overlay");
  let animation;
  function element(tag, attributes) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
    return node;
  }
  function path(strokes, colour, width) {
    const d = strokes.map(s => s.map(([x,y], i) => (i ? "L" : "M") + (100*x) + " " + (100*y)).join(" ")).join(" ");
    const line = element("path", { d, stroke:colour, "stroke-width":width, fill:"none", "stroke-linejoin":"round", "stroke-linecap":"round", pathLength:1 });
    svg.append(line);
    return line;
  }
  function celebrate() {
    const container = document.getElementById("confetti");
    container.replaceChildren(...Array.from({length:36}, (_,i) => {
      const bit = document.createElement("i");
      bit.style.left = ((i*37)%100) + "%";
      bit.style.background = colours[i%colours.length];
      bit.style.animationDelay = (i%7)*.055 + "s";
      return bit;
    }));
  }
  function start(data, focus, finish) {
    cancelAnimationFrame(animation);
    svg.replaceChildren();
    document.getElementById("confetti").replaceChildren();
    path([data.targetNorm], "#aaa3b4", 5);
    const ghosts = data.results.filter(p => p.isBot);
    for (const p of ghosts) path(p.pathStrokes || [], "rgba(255,255,255,.2)", 2);
    const real = data.results.filter(p => !p.isBot).reverse();
    // The bottom three, one group for the middle, then the three podium places.
    const groups = real.length <= 8 ? real.map(p => [p]) :
      [...real.slice(0,3).map(p => [p]), real.slice(3,-3), ...real.slice(-3).map(p => [p])];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = reduced ? 150 : 1000;
    const began = performance.now();
    let shown = -1, active = [], rolling = false;
    function frame(now) {
      const elapsed = now - began;
      const index = Math.min(groups.length-1, Math.floor(elapsed/step));
      while (shown < index) {
        for (const line of active) line.style.strokeDashoffset = "0";
        const group = groups[++shown];
        const solo = group.length === 1 ? group[0] : null;
        const won = solo && solo.playerId === data.winner?.playerId;
        active = [];
        for (const p of group) {
          const colour = p.playerId === data.winner?.playerId ? gold : colours[(p.rank || 0)%colours.length];
          const strokes = p.pathStrokes || [];
          const line = path(strokes, colour, won ? 5 : 3);
          line.style.strokeDasharray = "1";
          active.push(line);
          const end = strokes.at(-1)?.at(-1);
          if (end) {
            const label = element("text", { x:end[0]*100, y:end[1]*100-5, fill:colour, "text-anchor":end[0]>0?"end":"start" });
            label.textContent = p.name;
            svg.append(label);
          }
        }
        if (won) { sounds.play("win"); celebrate(); }
        focus(solo, group.length, Boolean(won));
      }
      const progress = Math.min(1, (elapsed - index*step)/(step*.7));
      for (const line of active) line.style.strokeDashoffset = String(1-progress);
      const solo = groups[index]?.length === 1 && groups[index][0];
      if (solo?.valid) document.getElementById("score").textContent = (solo.score*progress).toFixed(1) + "%";
      if (!rolling && data.winner && elapsed >= (groups.length-1)*step-350) {
        rolling = true;
        if (solo?.playerId !== data.winner.playerId) sounds.play("drum");
      }
      if (elapsed >= groups.length*step) finish();
      else animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
  }
  return { start, stop() { cancelAnimationFrame(animation); } };
})();
