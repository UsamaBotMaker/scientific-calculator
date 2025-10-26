(() => {
  const display = document.getElementById('display');
  const historyLine = document.getElementById('historyLine');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const degToggle = document.getElementById('degToggle');
  const angleLabel = document.getElementById('angleLabel');

  let angleMode = 'RAD'; // 'RAD' | 'DEG'
  let lastAnswer = 0;
  let memoryVal = 0;
  let history = [];

  // Utilities
  const clampStr = (s, max=2000) => (s.length > max ? s.slice(0, max) : s);

  function toRad(x) { return x * Math.PI / 180; }
  function toDeg(x) { return x * 180 / Math.PI; }

  function fact(n) {
    if (!isFinite(n)) return NaN;
    if (n < 0) return NaN;
    if (Math.abs(n - Math.round(n)) > 1e-12) return NaN;
    n = Math.round(n);
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  }

  function buildScope() {
    const trigIn = angleMode === 'DEG'
      ? (f) => (x) => f(toRad(x))
      : (f) => (x) => f(x);
    const atrigOut = angleMode === 'DEG'
      ? (f) => (x) => toDeg(f(x))
      : (f) => (x) => f(x);
    return {
      pi: Math.PI,
      e: Math.E,
      Ans: lastAnswer,
      rand: () => Math.random(),
      abs: Math.abs,
      sqrt: Math.sqrt,
      exp: Math.exp,
      ln: Math.log,
      log: (x) => Math.log10(x),
      sin: trigIn(Math.sin),
      cos: trigIn(Math.cos),
      tan: trigIn(Math.tan),
      asin: atrigOut(Math.asin),
      acos: atrigOut(Math.acos),
      atan: atrigOut(Math.atan),
      pow: (a, b) => Math.pow(a, b),
      fact: (x) => fact(x),
      // aliases that might appear
      PI: Math.PI,
      E: Math.E,
    };
  }

  function replaceFactorials(expr) {
    // Replace occurrences of X! with fact(X) where X can be a number or parenthesized expression
    // We'll iterate to handle multiple factorials
    let s = expr;
    while (s.includes('!')) {
      let i = s.indexOf('!');
      // find the start of the operand to the left
      let start = i - 1;
      if (start < 0) return s; // malformed
      if (s[start] === ')') {
        // find matching '('
        let depth = 1;
        start--;
        while (start >= 0) {
          if (s[start] === ')') depth++;
          else if (s[start] === '(') { depth--; if (depth === 0) break; }
          start--;
        }
        if (start < 0) break; // unmatched
        const inside = s.slice(start, i); // includes '(...'
        s = s.slice(0, start) + `fact${inside}` + s.slice(i + 1);
      } else {
        // consume numeric or identifier to the left
        let j = start;
        while (j >= 0 && /[\w\.]/.test(s[j])) j--;
        const token = s.slice(j + 1, i);
        if (!token) break;
        s = s.slice(0, j + 1) + `fact(${token})` + s.slice(i + 1);
      }
    }
    return s;
  }

  function insertImplicitMultiplication(expr) {
    // Insert * between: number/)/constant and ( or identifier, and between ) and number
    // Examples: 2pi -> 2*pi, (3)4 -> (3)*4, 2(3) -> 2*(3)
    let s = expr;
    s = s.replace(/(\d|\.|\)|pi|e)(\s*)(\(|[a-zA-Z_])/g, '$1*$3');
    s = s.replace(/(\))(\s*)(\d|\.)/g, '$1*$3');
    return s;
  }

  function preprocess(input) {
    let expr = input.trim();
    if (!expr) return '';
    expr = expr.replace(/π/g, 'pi');
    expr = expr.replace(/√/g, 'sqrt');
    expr = expr.replace(/\^/g, '**');
    expr = replaceFactorials(expr);
    expr = insertImplicitMultiplication(expr);
    // Allow only whitelisted characters to prevent code injection
    const allowed = /^[0-9+\-*/%^().,\sA-Za-z_]*\**$/; // note: ** already in string; regex is lenient
    if (!/^[0-9+\-*/%().,\sA-Za-z_\*]*$/.test(expr)) {
      throw new Error('Invalid characters in expression');
    }
    return expr;
  }

  function evaluateExpression(input) {
    const expr = preprocess(input);
    const scope = buildScope();
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('scope', `
        with (scope) {
          const result = (${expr});
          if (typeof result === 'number' && !isFinite(result)) { return NaN; }
          return result;
        }
      `);
      const val = fn(scope);
      if (typeof val !== 'number') throw new Error('Expression did not evaluate to a number');
      return val;
    } catch (e) {
      throw new Error('Invalid expression');
    }
  }

  function renderHistory() {
    historyList.innerHTML = '';
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      const li = document.createElement('li');
      const exp = document.createElement('div'); exp.className = 'history-exp'; exp.textContent = item.exp;
      const res = document.createElement('div'); res.className = 'history-res'; res.textContent = item.res;
      li.appendChild(exp); li.appendChild(res);
      li.addEventListener('click', () => {
        display.value = item.res;
        historyLine.textContent = item.exp + ' =';
      });
      historyList.appendChild(li);
    }
  }

  function pushHistory(exp, res) {
    history.push({ exp, res });
    if (history.length > 100) history.shift();
    renderHistory();
  }

  function updateAngleLabel() {
    angleLabel.textContent = angleMode;
  }

  function handleEquals() {
    const expr = display.value || String(lastAnswer);
    try {
      const val = evaluateExpression(expr);
      const resStr = String(+parseFloat(val.toPrecision(14))); // trim floating noise
      historyLine.textContent = clampStr(expr) + ' =';
      display.value = resStr;
      lastAnswer = val;
      pushHistory(expr, resStr);
    } catch (e) {
      historyLine.textContent = 'Error';
    }
  }

  // Button interactions
  function onButtonClick(e) {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const insert = t.getAttribute('data-insert');
    const action = t.getAttribute('data-action');
    const fn = t.getAttribute('data-fn');
    if (insert !== null) {
      insertAtCursor(insert);
      return;
    }
    if (fn) {
      if (fn === 'pow') insertAtCursor('pow(');
      else if (fn === 'sqrt') insertAtCursor('sqrt(');
      else if (fn === 'fact') insertAtCursor('!');
      else insertAtCursor(fn + '(');
      return;
    }
    if (action) {
      switch (action) {
        case 'equals': handleEquals(); break;
        case 'clear': display.value = ''; historyLine.textContent = ''; break;
        case 'allclear': display.value = ''; historyLine.textContent = ''; lastAnswer = 0; break;
        case 'backspace':
          display.value = display.value.slice(0, -1);
          break;
        case 'mc': memoryVal = 0; break;
        case 'mr': insertAtCursor(String(memoryVal)); break;
        case 'mplus':
          try { memoryVal += evaluateExpression(display.value || String(lastAnswer)); } catch {}
          break;
        case 'mminus':
          try { memoryVal -= evaluateExpression(display.value || String(lastAnswer)); } catch {}
          break;
      }
      return;
    }
  }

  function insertAtCursor(text) {
    const el = display;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    el.value = before + text + after;
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.focus();
  }

  // Keyboard support
  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleEquals(); return; }
    if (e.key === 'Backspace') return; // default
    // Map common keys
    if (e.key === '^') { e.preventDefault(); insertAtCursor('^'); return; }
  }

  // Toggle deg/rad
  degToggle.addEventListener('change', () => {
    angleMode = degToggle.checked ? 'DEG' : 'RAD';
    updateAngleLabel();
  });
  updateAngleLabel();

  // Wire up buttons
  document.querySelectorAll('.keys .btn, .topbar .btn').forEach(btn => {
    btn.addEventListener('click', onButtonClick);
  });
  clearHistoryBtn.addEventListener('click', () => { history = []; renderHistory(); });
  document.addEventListener('keydown', onKeyDown);

  // Focus display initially
  display.focus();
})();

