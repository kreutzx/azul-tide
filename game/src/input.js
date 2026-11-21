// AZUL TIDE — input.js
// Keyboard + mouse input for Port Azul. One Input object owns every listener so
// the game loop only ever reads plain fields: a held-key set, an edge-triggered
// pressed set (consumed once per fixed step), a movement vector and a mouse aim.
//
// Controls:
//   WASD / Arrow keys  move / drive
//   E                  enter or exit the nearest car
//   Shift              sprint on foot
//   Space              handbrake while driving, action on foot
//   Esc / P            pause
//   Enter              confirm on title / game-over screens
//   R                  restart after game over

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.anyKey = false;

    window.addEventListener('keydown', (ev) => {
      if (!ev.repeat) {
        this.pressed.add(ev.code);
        this.anyKey = true;
      }
      this.keys.add(ev.code);
      if (ev.code.startsWith('Arrow') || ev.code === 'Space') ev.preventDefault();
    });
    window.addEventListener('keyup', (ev) => {
      this.keys.delete(ev.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ev.clientX - rect.left;
      this.mouseY = ev.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (ev) => {
      if (ev.button === 0) {
        this.mouseDown = true;
        this.pressed.add('MouseLeft');
        this.anyKey = true;
      }
    });
    window.addEventListener('mouseup', (ev) => {
      if (ev.button === 0) this.mouseDown = false;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  consumePressed() {
    this.pressed.clear();
    this.anyKey = false;
  }

  moveVector() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  throttle() {
    let t = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) t += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) t -= 1;
    return t;
  }

  steer() {
    let s = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) s -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) s += 1;
    return s;
  }

  get sprint() {
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }

  get handbrake() {
    return this.down('Space');
  }

  aimAngle(focusX, focusY, viewW, viewH) {
    const wx = focusX + (this.mouseX - viewW / 2);
    const wy = focusY + (this.mouseY - viewH / 2);
    return Math.atan2(wy - focusY, wx - focusX);
  }
}

export function createInput(canvas) {
  return new Input(canvas);
}
