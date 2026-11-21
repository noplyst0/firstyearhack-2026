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
    const drawMs = 2500;
    const step = drawMs + 1000;
    const began = performance.now();
    let shown = -1, active = [], rolling = false, celebrated = false;
    function frame(now) {
      const elapsed = now - began;
      const index = Math.min(groups.length-1, Math.floor(elapsed/step));
      while (shown < index) {
        for (const { line, label } of active) {
          line.style.strokeDashoffset = "0";
          line.style.opacity = ".35";
          label?.remove();
        }
        const group = groups[++shown];
        const solo = group.length === 1 ? group[0] : null;
        const won = solo && solo.playerId === data.winner?.playerId;
        active = [];
        for (const p of group) {
          const colour = p.playerId === data.winner?.playerId ? gold : colours[(p.rank || 0)%colours.length];
          const strokes = p.pathStrokes || [];
          const line = path(strokes, colour, won ? 5 : 3);
          line.style.strokeDasharray = "1";
          const end = strokes.at(-1)?.at(-1);
          let label;
          if (end) {
            const x = Math.max(-220, Math.min(220, end[0]*100));
            const y = Math.max(-205, Math.min(220, end[1]*100-9));
            label = element("text", { x, y, fill:colour, "text-anchor":x>0?"end":"start" });
            label.textContent = p.name + " · " + p.score.toFixed(1) + "%";
            svg.append(label);
            // Keep a long name inside even the narrowest square board.
            const width = label.getComputedTextLength();
            if (width > 470) {
              label.setAttribute("textLength",470);
              label.setAttribute("lengthAdjust","spacingAndGlyphs");
            }
            const fitted = Math.min(470,width);
            label.setAttribute("x", x>0 ? Math.max(x,fitted-242) : Math.min(x,242-fitted));
          }
          active.push({ line, label, player:p });
        }
        focus(solo, group.length, false);
      }
      const progress = Math.min(1, (elapsed - index*step)/drawMs);
      for (const {line} of active) line.style.strokeDashoffset = reduced ? "0" : String(1-progress);
      const solo = groups[index]?.length === 1 && groups[index][0];
      if (solo?.valid && active[0]?.label && !reduced) {
        active[0].label.textContent = solo.name + " · " + (solo.score*progress).toFixed(1) + "%";
      }
      const winnerOnBoard = solo && data.winner && solo.playerId === data.winner.playerId;
      if (winnerOnBoard && !rolling && progress >= .8) {
        rolling = true;
        sounds.play("drum");
      }
      if (winnerOnBoard && !celebrated && progress === 1) {
        celebrated = true;
        sounds.play("win");
        celebrate();
        focus(solo,1,true);
      }
      if (elapsed >= groups.length*step) finish();
      else animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
  }
  return { start, stop() { cancelAnimationFrame(animation); } };
})();
