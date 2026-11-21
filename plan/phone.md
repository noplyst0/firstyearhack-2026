# SEAT: PHONE · Argon · folder frontend/phone/ (served at /) · branch argon-phone
Read plan/SHARED.md first. Mobile first, one thumb, dark theme, text at least 18 px, buttons at least 56 px tall, no scrolling.

## Files
index.html, phone.css, phone.js (screens + socket), pointer.js (motion maths + recording), names.js (name generator).
socket.io client from /socket.io/socket.io.js: io({ transports: ['websocket'] }).

## Screens
1. Join
   - Code box: filled from ?code= and hidden when the link has one.
   - Name box: starts empty, placeholder "Your name".
   - 🎲 Generate button: fills in a random "Adjective Animal" (at most 16 characters) from these lists:
     - Wobbly Sneaky Turbo Sleepy Wonky Spicy Fuzzy Cosmic Jolly Zippy Grumpy Bouncy
     - Penguin Llama Otter Badger Pigeon Walrus Noodle Toaster Panda Goose Hamster Squid
   - JOIN handler: its first line, before any await, is `const motionP = askMotion();`. Then emit player:join, then await motionP.
   - Errors:
     - ROOM_NOT_FOUND "No room with that code"
     - ROOM_STARTED "Game already started, watch the big screen"
     - ROOM_FULL
     - NAME_TAKEN: if the name was generated, generate a new one and retry once
     - NAME_BLOCKED "Pick another name"
     - NAME_INVALID
   - Save { code, playerId, name } in sessionStorage. On load with the same code, re-join silently with that playerId.
2. Lobby
   - "You're in, {name}".
   - Test box with a dot driven by the pointer ("Wave your phone: the dot should follow") and a Re-centre button.
   - No orientation event within 1.5 s: "Your phone isn't sending motion. You can still watch the big screen."
   - Motion denied: "Motion is blocked. Reload and tap Allow. If it doesn't ask again, check Safari's Motion & Orientation setting."
3. Get ready (on round:start)
   - Shape thumbnail drawn from targetStrokes. Memory round: "MEMORY ROUND: remember it, it vanishes at GO", and the thumbnail is hidden at GO.
   - Three lines: "Hold your phone up like a camera." "Point it at the screen." "Hold your thumb down to draw. Lift it to move without drawing."
   - Countdown from countdownMs. Calibrate on the last 500 ms.
4. Draw
   - The whole screen is the pen button ("HOLD TO DRAW") and glows while held.
   - Progress ring for durationMs. navigator.vibrate?.(30) on pen down.
   - Wake lock on, re-requested on visibilitychange.
   - At the end of durationMs: emit player:submit { code, playerId, round, strokes, points: strokes.flat() } and show "Drawing sent".
5. Judging (on round:judging): "Snowflake is judging..." plus "{distanceChecks} distance checks".
6. Results (your entry in round:results, then round:extras)
   - Huge score % and "3rd of 8" ("No drawing" if invalid).
   - Two bars: "Stayed on the line" (onLine) and "Covered the shape" (coverage).
   - Guess line: "Snowflake recognised your star" if guess.shapeId equals shapeId, otherwise "Snowflake thinks you drew {guess.label}".
   - Percentile line when present: "Better than {beatPct}% of today's {shapeName}s ({pool} drawn)".
   - Comment, with the placeholder "Snowflake is writing a joke..." until round:extras arrives.
   - "+{roundPoints} · total {totalPoints}".
7. Final (on game:end): your total, your rank out of N, the top 3 names.
8. Kicked (on player:kicked): "The host removed you." plus a Join again button.
9. Connection lost: "Reconnecting..." banner, then auto re-join with playerId.

## Motion and recording (pointer.js)
```js
function askMotion() {              // call inside the JOIN tap, before any await (iPhone needs the tap)
  const asks = [];
  for (const E of [window.DeviceOrientationEvent, window.DeviceMotionEvent])
    if (E && typeof E.requestPermission === 'function') asks.push(E.requestPermission().catch(() => 'denied'));
  return Promise.all(asks).then(r => r.every(x => x === 'granted'));   // Android: no prompt, resolves true
}
const d2r = Math.PI / 180;
function aimDirection(alpha, beta, gamma) {   // direction the BACK of the phone faces (W3C Z-X'-Y'')
  const a = alpha * d2r, b = beta * d2r, g = gamma * d2r;
  return { x: -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g),
           y: -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g),
           z: -Math.cos(b) * Math.cos(g) };
}
function yawPitch(alpha, beta, gamma) {
  const v = aimDirection(alpha, beta, gamma);
  return { yaw: Math.atan2(v.x, v.y) / d2r, pitch: Math.asin(Math.max(-1, Math.min(1, v.z))) / d2r };
}
const wrap180 = a => ((a + 540) % 360) - 180;
const round3 = v => Math.round(v * 1000) / 1000;
let SIGN_X = 1, SIGN_Y = 1;   // re-derived on paper: turning left moves the dot left, tilting the top away moves it down. Confirm with ?debug=1.
// NO clamp: scoring ignores position and size
function toCanvas(yaw, pitch, yaw0, pitch0, fov) {
  return [0.5 + SIGN_X * wrap180(yaw - yaw0) / fov, 0.5 - SIGN_Y * (pitch - pitch0) / fov];
}
```
- Smooth on every deviceorientation event, even while the pen is up: sx += smoothing * (x - sx), and the same for y.
- Pen: pointerdown anywhere on the pad starts a new stroke, but only during the draw phase. A finger already down at GO starts a stroke at GO. pointerup or pointercancel ends it. Count active pointers so a second finger doesn't split a stroke.
- Every 33 ms while the pen is down, push [round3(sx), round3(sy)] to the current stroke. Drop samples where |x| or |y| > 5 (sensor glitch). Stop at 2000 points or 20 strokes.
- Calibration: yaw0 = first yaw + the average of wrap180(yaw - first yaw) over the last 500 ms of the countdown. pitch0 = average pitch over the same window. Only the debug view and the lobby dot really need it.
- Fallback if the angles jump while the phone is upright: add up the turning speed instead.
```js
// rotationRate is in degrees per second. Upright portrait: gamma = turning left/right, beta = tilting up/down.
let last = null;
addEventListener('devicemotion', e => {
  const r = e.rotationRate, now = performance.now();
  if (!r || r.beta == null) return;
  if (last !== null) { const dt = (now - last) / 1000;
    x += SIGN_X * -r.gamma * dt / fov; y += SIGN_Y * -r.beta * dt / fov; }
  last = now;
});
```

## Modes
- ?debug=1: shows the live line plus raw yaw, pitch, x and y.
- ?mouse=1: the mouse or touch position replaces motion (press = pen down), for laptop tests.

## CSS
On the draw screen: touch-action: none; overscroll-behavior: none; user-select: none; -webkit-touch-callout: none. Show a "turn your phone upright" hint in landscape.

## Done when
On one iPhone (Safari) and one Android phone (Chrome) over the HTTPS URL:
- Join takes one tap, including the motion prompt.
- The lobby dot follows the phone in the right direction.
- A circle drawn with ?debug=1 looks like a circle.
- Lifting the thumb splits the stroke.
- The page never scrolls, and the screen stays awake for the whole round.
