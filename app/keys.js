// Correspondance clavier du navigateur -> numéros de touches du CPC (matrice firmware).
// On utilise e.code (position physique) : sur un Mac AZERTY, la touche marquée « W » est
// à la place du Z du clavier anglais, comme sur un CPC 6128 français.
(function (root) {
  'use strict';
  const CODE_TO_CPC = {
    ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, F9: 3, F6: 4, F3: 5, NumpadEnter: 6, NumpadDecimal: 7,
    ArrowLeft: 8, AltLeft: 9, F7: 10, F8: 11, F5: 12, F1: 13, F2: 14, F10: 15,
    Delete: 16, BracketLeft: 17, Enter: 18, BracketRight: 19, F4: 20, ShiftLeft: 21, ShiftRight: 21, Backslash: 22,
    ControlLeft: 23, ControlRight: 23,
    Equal: 24, Minus: 25, IntlBackslash: 26, KeyP: 27, Semicolon: 28, Quote: 29, Slash: 30, Period: 31,
    Digit0: 32, Digit9: 33, KeyO: 34, KeyI: 35, KeyL: 36, KeyK: 37, KeyM: 38, Comma: 39,
    Digit8: 40, Digit7: 41, KeyU: 42, KeyY: 43, KeyH: 44, KeyJ: 45, KeyN: 46, Space: 47,
    Digit6: 48, Digit5: 49, KeyR: 50, KeyT: 51, KeyG: 52, KeyF: 53, KeyB: 54, KeyV: 55,
    Digit4: 56, Digit3: 57, KeyE: 58, KeyW: 59, KeyS: 60, KeyD: 61, KeyC: 62, KeyX: 63,
    Digit1: 64, Digit2: 65, Escape: 66, KeyQ: 67, Tab: 68, KeyA: 69, CapsLock: 70, KeyZ: 71,
    Backspace: 79,
    Numpad0: 15, Numpad1: 13, Numpad2: 14, Numpad3: 5, Numpad4: 20, Numpad5: 12, Numpad6: 4, Numpad7: 10, Numpad8: 11, Numpad9: 3,
  };
  // En mode « flèches = joystick »
  const JOY = { ArrowUp: 72, ArrowDown: 73, ArrowLeft: 74, ArrowRight: 75, AltLeft: 76, AltRight: 76, ShiftRight: 76 };

  // Caractère CPC produit par une touche (KM READ CHAR)
  function charOf(e) {
    switch (e.key) {
      case 'Enter': return 13;
      case 'Backspace': return 0x7F;
      case 'Delete': return 0x10;
      case 'Escape': return 0xFC;
      case 'Tab': return 9;
      case 'ArrowUp': return 0xF0;
      case 'ArrowDown': return 0xF1;
      case 'ArrowLeft': return 0xF2;
      case 'ArrowRight': return 0xF3;
      default:
        if (e.key.length === 1) {
          const c = e.key.normalize('NFD').replace(/[̀-ͯ]/g, '').charCodeAt(0);
          return c < 128 ? c : null;
        }
        return null;
    }
  }

  root.CPCKeys = { CODE_TO_CPC, JOY, charOf };
})(window);
