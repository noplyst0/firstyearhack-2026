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
    const clean = (strokes || []).filter(s => Array.isArray(s) && s.length);
    const d = clean.map(s => s.map(([x,y], i) => (i ? "L" : "M") + (100*x) + " " + (100*y)).join(" ")).join(" ");
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
    const targetStrokes = Array.isArray(data.targetNormStrokes) && data.targetNormStrokes.length
      ? data.targetNormStrokes
      : data.targetNorm ? [data.targetNorm] : [];
    path(targetStrokes, "#aaa3b4", 5);
    const ghosts = data.results.filter(p => p.isBot);
    for (const p of ghosts) path(p.pathStrokes || [], "rgba(255,255,255,.2)", 2);
    const real = data.results.filter(p => !p.isBot).reverse();
    // The bottom three, one group for the middle, then the three podium places.
    const groups = real.length <= 8 ? real.map(p => [p]) :
      [...real.slice(0,3).map(p => [p]), real.slice(3,-3), ...real.slice(-3).map(p => [p])];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const drawMs = 2500;
    const step = drawMs + 1000;
    const winnerHoldMs = 6000;
    const totalMs = groups.length
      ? (groups.length - 1) * step + drawMs + (data.winner ? winnerHoldMs : 1000)
      : 0;
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
      if (elapsed >= totalMs) finish();
      else animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
  }
  function heatColour(h) {
    const clamped = Math.max(0, Math.min(1, Number(h) || 0));
    return "hsl(" + Math.round((1 - clamped) * 130) + ", 95%, 58%)";
  }
  function splitJumps(pts, maxJump = 0.45) {
    if (!Array.isArray(pts) || !pts.length) return [];
    const strokes = [[pts[0]]];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], cur = pts[i];
      if (!cur || !prev) continue;
      if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > maxJump) strokes.push([cur]);
      else strokes[strokes.length - 1].push(cur);
    }
    return strokes;
  }
  function renderRoomView(targetSvg, resultData, viewData) {
    if (!targetSvg || !resultData) return;
    targetSvg.replaceChildren();
    const targetStrokes = Array.isArray(resultData.targetNormStrokes) && resultData.targetNormStrokes.length
      ? resultData.targetNormStrokes.filter(s => Array.isArray(s) && s.length > 1)
      : resultData.targetNorm ? splitJumps(resultData.targetNorm, 0.45) : [];
    const heat = Array.isArray(viewData?.heat) ? viewData.heat : null;
    const crowdPts = Array.isArray(viewData?.crowd?.path) && viewData.crowd.path.length > 1 ? viewData.crowd.path : null;
    const crowdStrokes = crowdPts ? splitJumps(crowdPts, 0.4) : [];

    // Tightly frame the target + crowd consensus so the shape fills the full screen.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const includePts = pts => {
      for (const pt of pts) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const x = 100 * pt[0], y = 100 * pt[1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    };
    for (const s of targetStrokes) includePts(s);
    for (const s of crowdStrokes) includePts(s);
    if (!Number.isFinite(minX)) { minX = -120; maxX = 120; minY = -120; maxY = 120; }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const span = Math.max(140, maxX - minX, maxY - minY);
    const pad = span * 0.14;
    const boxSize = span + pad * 2;
    targetSvg.setAttribute("viewBox", `${(cx - boxSize / 2).toFixed(1)} ${(cy - boxSize / 2).toFixed(1)} ${boxSize.toFixed(1)} ${boxSize.toFixed(1)}`);

    const heatWidth = Math.max(12, boxSize * 0.058);
    const heatHaloWidth = heatWidth + Math.max(6, boxSize * 0.026);
    const crowdHaloWidth = Math.max(11, boxSize * 0.046);
    const crowdWidth = Math.max(6.5, boxSize * 0.027);

    if (heat && heat.length && targetStrokes.length) {
      const haloD = targetStrokes.map(s => s.map(([x,y], i) => (i ? "L" : "M") + (100*x) + " " + (100*y)).join(" ")).join(" ");
      targetSvg.append(element("path", {
        d: haloD,
        stroke: "#12081c",
        "stroke-width": heatHaloWidth,
        fill: "none",
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      }));
      const totalSegs = targetStrokes.reduce((sum, s) => sum + Math.max(0, s.length - 1), 0) || 1;
      let segIdx = 0;
      for (const stroke of targetStrokes) {
        for (let i = 1; i < stroke.length; i++) {
          const frac = totalSegs === 1 ? 0 : segIdx / (totalSegs - 1);
          const hIdx = Math.min(heat.length - 1, Math.round(frac * (heat.length - 1)));
          const seg = element("line", {
            x1: 100 * stroke[i - 1][0],
            y1: 100 * stroke[i - 1][1],
            x2: 100 * stroke[i][0],
            y2: 100 * stroke[i][1],
            stroke: heatColour(heat[hIdx]),
            "stroke-width": heatWidth,
            "stroke-linecap": "round"
          });
          targetSvg.append(seg);
          segIdx++;
        }
      }
    } else if (targetStrokes.length) {
      const d = targetStrokes.map(s => s.map(([x,y], i) => (i ? "L" : "M") + (100*x) + " " + (100*y)).join(" ")).join(" ");
      targetSvg.append(element("path", { d, stroke:"#aaa3b4", "stroke-width":heatWidth * 0.8, fill:"none", "stroke-linejoin":"round", "stroke-linecap":"round" }));
    }

    if (crowdStrokes.length) {
      const d = crowdStrokes.map(s => s.map(([x,y], i) => (i ? "L" : "M") + (100*x) + " " + (100*y)).join(" ")).join(" ");
      targetSvg.append(element("path", { d, stroke:"#12081c", "stroke-width":crowdHaloWidth, fill:"none", "stroke-linejoin":"round", "stroke-linecap":"round", opacity:"0.9" }));
      targetSvg.append(element("path", { d, stroke:"#ffffff", "stroke-width":crowdWidth, fill:"none", "stroke-linejoin":"round", "stroke-linecap":"round" }));
    }
  }
  return { start, renderRoomView, stop() { cancelAnimationFrame(animation); } };
})();
