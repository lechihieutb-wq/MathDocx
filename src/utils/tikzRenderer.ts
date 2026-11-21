export interface RenderedLatexFigure {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

interface Point2D {
  x: number;
  y: number;
}

interface CustomMathFunc {
  params: string[];
  bodyExpr: string;
}

interface DrawStyle {
  stroke: string;
  strokeWidth: number;
  dashArray?: string;
  fill: string;
  fillOpacity: number;
  strokeOpacity: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  pattern?: string;
  patternColor?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  align?: string;
  anchor?: string;
  anchorDist?: number;
  pos?: number;
  shiftX?: number;
  shiftY?: number;
  shiftXPx?: number;
  shiftYPx?: number;
  isClip?: boolean;
  hasDraw?: boolean;
  hasFill?: boolean;
  angleRadiusPx?: number;
  angleEccentricity?: number;
  picText?: string;
  picTextOpts?: string;
  circle?: boolean;
  innerSep?: number;
  roundedCorners?: number;
  customFuncs?: Record<string, CustomMathFunc>;
  trigRad?: boolean;
  basisX?: Point2D;
  basisY?: Point2D;
  basisZ?: Point2D;
  rotateAround?: { deg: number; center: Point2D };
  plotVar?: string;
  namePath?: string;
  nameIntersections?: {
    pathA: string;
    pathB: string;
    byNames: string[];
    prefixName?: string;
    totalVar?: string;
  };
  definedStyles?: Record<string, string>;
  useTdplotMainCoords?: boolean;
}

interface SvgItem {
  kind: 'path' | 'circle' | 'ellipse' | 'rect' | 'line' | 'text' | 'polyline' | 'polygon';
  svg: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  clipId?: string;
}

interface TikzScopeState {
  scaleX: number;
  scaleY: number;
  shiftX: number;
  shiftY: number;
  shiftXPx?: number;
  shiftYPx?: number;
  rotateDeg: number;
  rotateAround?: { deg: number; center: Point2D };
  color: string;
  lineWidth: number;
  dashArray?: string;
  fill: string;
  fillOpacity: number;
  fontSize?: number;
  fontWeight?: string;
  clipId?: string;
  clipBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  vars?: Record<string, number>;
  customFuncs?: Record<string, CustomMathFunc>;
  trigRad?: boolean;
  basisX?: Point2D;
  basisY?: Point2D;
  basisZ?: Point2D;
  customStyles?: Record<string, string>;
  tdplotTheta?: number;
  tdplotPhi?: number;
}

const COLOR_MAP: Record<string, string> = {
  black: '#0F172A',
  white: '#FFFFFF',
  red: '#DC2626',
  blue: '#2563EB',
  green: '#16A34A',
  darkgreen: '#15803D',
  forestgreen: '#15803D',
  orange: '#EA580C',
  purple: '#9333EA',
  violet: '#7C3AED',
  magenta: '#DB2777',
  cyan: '#0891B2',
  teal: '#0D9488',
  brown: '#92400E',
  gray: '#64748B',
  grey: '#64748B',
  darkgray: '#334155',
  lightgray: '#CBD5E1',
  navy: '#1E3A8A',
  maroon: '#991B1B',
  yellow: '#CA8A04',
  olive: '#65A30D',
  pink: '#EC4899',
  lime: '#84CC16',
};

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function readBalanced(
  src: string,
  openIdx: number,
  openCh: string,
  closeCh: string
): { content: string; endIdx: number } | null {
  if (src[openIdx] !== openCh) return null;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '\\' && i + 1 < src.length) {
      i++;
      continue;
    }
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) {
      depth--;
      if (depth === 0) {
        return { content: src.slice(openIdx + 1, i), endIdx: i };
      }
    }
  }
  return null;
}

function stripTikzComments(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') {
          i++;
          continue;
        }
        if (line[i] === '%') {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join('\n');
}

function readLeadingBracketOptions(
  src: string,
  startIdx: number
): { opts: string; nextIdx: number } {
  let p = startIdx;
  while (p < src.length && /\s/.test(src[p])) p++;
  if (src[p] === '[') {
    const brk = readBalanced(src, p, '[', ']');
    if (brk) {
      return { opts: brk.content, nextIdx: brk.endIdx + 1 };
    }
  }
  return { opts: '', nextIdx: startIdx };
}

function splitTopLevel(src: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let brace = 0;
  let bracket = 0;
  let paren = 0;
  let inMath = false;
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      cur += ch + src[i + 1];
      i++;
      continue;
    }
    if (ch === '"' && brace === 0) {
      inQuotes = !inQuotes;
    } else if (ch === '$') {
      inMath = !inMath;
    } else if (!inMath && !inQuotes) {
      if (ch === '{') brace++;
      else if (ch === '}') brace = Math.max(0, brace - 1);
      else if (ch === '[') bracket++;
      else if (ch === ']') bracket = Math.max(0, bracket - 1);
      else if (ch === '(') paren++;
      else if (ch === ')') paren = Math.max(0, paren - 1);
    }

    if (
      !inQuotes &&
      !inMath &&
      brace === 0 &&
      bracket === 0 &&
      paren === 0 &&
      src.slice(i, i + sep.length) === sep
    ) {
      parts.push(cur);
      cur = '';
      i += sep.length - 1;
      continue;
    }
    cur += ch;
  }
  if (cur.trim() || parts.length > 0) parts.push(cur);
  return parts;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')
  );
}

function resolveTikzColor(raw: string, customColors: Record<string, string>): string | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (s === 'none') return 'none';
  if (customColors[s]) return customColors[s];
  if (COLOR_MAP[s]) return COLOR_MAP[s];
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();

  // Support chained xcolor mixing like blue!30, red!50!yellow, or white!80!black!10
  if (s.includes('!')) {
    const parts = s.split('!').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return undefined;
    let acc = resolveTikzColor(parts[0], customColors);
    if (!acc || acc === 'none') return undefined;

    let idx = 1;
    while (idx < parts.length) {
      const pct = parseFloat(parts[idx]);
      if (!Number.isFinite(pct)) return acc;
      const w = Math.max(0, Math.min(100, pct)) / 100;
      const nextPart = parts[idx + 1];
      const nextIsNumber = nextPart !== undefined && Number.isFinite(Number(nextPart));
      let c2 = '#FFFFFF';
      if (nextPart && !nextIsNumber) {
        c2 = resolveTikzColor(nextPart, customColors) ?? '#FFFFFF';
        idx += 2;
      } else {
        idx += 1;
      }
      if (c2 === 'none') continue;
      const [r1, g1, b1] = hexToRgb(acc);
      const [r2, g2, b2] = hexToRgb(c2);
      acc = rgbToHex(r1 * w + r2 * (1 - w), g1 * w + g2 * (1 - w), b1 * w + b2 * (1 - w));
    }
    return acc;
  }
  return undefined;
}

function parseLengthToTikzUnits(raw: string, unitPx = 42): number | null {
  const s = raw.trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(cm|mm|pt|em|ex|in)?$/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (!unit) return val;
  const cmToUnits = 37.795 / unitPx;
  if (unit === 'cm') return val * cmToUnits;
  if (unit === 'mm') return (val / 10) * cmToUnits;
  if (unit === 'pt') return (val * 1.3333) / unitPx;
  if (unit === 'in') return val * 2.54 * cmToUnits;
  if (unit === 'em' || unit === 'ex') return (val * 10) / unitPx;
  return val;
}

function parseLengthToPx(raw: string, unitPx = 42): number | null {
  const s = raw.trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(cm|mm|pt|em|ex|in|px)?$/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (!unit) return val * unitPx;
  if (unit === 'px') return val;
  if (unit === 'cm') return val * 37.795;
  if (unit === 'mm') return val * 3.7795;
  if (unit === 'pt') return val * 1.3333;
  if (unit === 'in') return val * 96;
  if (unit === 'em' || unit === 'ex') return val * 12;
  return val * unitPx;
}

function replaceBalancedLatexMathOps(src: string): string {
  let out = src;
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;

    // \frac{a}{b}, \dfrac{a}{b}, \tfrac{a}{b} (supports nested braces or single tokens)
    const fracMatch = /\\(?:d|t)?frac(?![a-zA-Z])/.exec(out);
    if (fracMatch) {
      let p = fracMatch.index + fracMatch[0].length;
      const readTokenOrBrace = (): { val: string; nextIdx: number } | null => {
        while (p < out.length && /\s/.test(out[p])) p++;
        if (p >= out.length) return null;
        if (out[p] === '{') {
          const br = readBalanced(out, p, '{', '}');
          if (!br) return null;
          return { val: br.content, nextIdx: br.endIdx + 1 };
        }
        if (out[p] === '\\') {
          const cmd = out.slice(p).match(/^\\[a-zA-Z]+/);
          if (cmd) return { val: cmd[0], nextIdx: p + cmd[0].length };
        }
        return { val: out[p], nextIdx: p + 1 };
      };
      const num = readTokenOrBrace();
      if (num) {
        p = num.nextIdx;
        const den = readTokenOrBrace();
        if (den) {
          out =
            out.slice(0, fracMatch.index) +
            `((${num.val})/(${den.val}))` +
            out.slice(den.nextIdx);
          changed = true;
          continue;
        }
      }
    }

    // \sqrt[n]{a} or \sqrt{a}
    const sqrtMatch = /\\sqrt(?![a-zA-Z])/.exec(out);
    if (sqrtMatch) {
      let p = sqrtMatch.index + sqrtMatch[0].length;
      while (p < out.length && /\s/.test(out[p])) p++;
      let degStr: string | null = null;
      if (out[p] === '[') {
        const degBr = readBalanced(out, p, '[', ']');
        if (degBr) {
          degStr = degBr.content.trim();
          p = degBr.endIdx + 1;
          while (p < out.length && /\s/.test(out[p])) p++;
        }
      }
      let argVal: string | null = null;
      let nextIdx = p;
      if (out[p] === '{') {
        const br = readBalanced(out, p, '{', '}');
        if (br) {
          argVal = br.content;
          nextIdx = br.endIdx + 1;
        }
      } else if (out[p] === '\\') {
        const cmd = out.slice(p).match(/^\\[a-zA-Z]+/);
        if (cmd) {
          argVal = cmd[0];
          nextIdx = p + cmd[0].length;
        }
      } else if (p < out.length) {
        argVal = out[p];
        nextIdx = p + 1;
      }
      if (argVal !== null) {
        const repl = degStr ? `((${argVal})^(1/(${degStr})))` : `sqrt(${argVal})`;
        out = out.slice(0, sqrtMatch.index) + repl + out.slice(nextIdx);
        changed = true;
        continue;
      }
    }

    if (!changed) break;
  }
  return out;
}

function parseDeclareFunctionsSpec(
  spec: string,
  target: Record<string, CustomMathFunc>
): void {
  const statements = splitTopLevel(spec, ';');
  for (const raw of statements) {
    const st = raw.trim();
    if (!st) continue;
    const m = st.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*=\s*([\s\S]+)$/);
    if (!m) continue;
    const fnName = m[1].trim();
    const params = m[2]
      .split(',')
      .map((p) => p.trim().replace(/^\\/, ''))
      .filter(Boolean);
    const bodyExpr = m[3].trim();
    if (fnName && params.length > 0 && bodyExpr) {
      target[fnName] = { params, bodyExpr };
    }
  }
}

// Safe recursive-descent math expression evaluator
function evalMathExpr(
  rawExpr: string,
  vars: Record<string, number> = {},
  trigRadDefault = false,
  customFuncs: Record<string, CustomMathFunc> = {},
  evalDepth = 0
): number | null {
  if (evalDepth > 8) return null;
  let expr = rawExpr.trim();
  if (!expr) return null;

  // Replace common LaTeX math constructs inside expressions
  expr = replaceBalancedLatexMathOps(expr)
    .replace(/\*\*/g, '^')
    .replace(/\\left\s*\(/g, '(')
    .replace(/\\right\s*\)/g, ')')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pi(?![a-zA-Z])/g, 'pi')
    .replace(/\\arcsin(?![a-zA-Z])/g, 'asin')
    .replace(/\\arccos(?![a-zA-Z])/g, 'acos')
    .replace(/\\arctan(?![a-zA-Z])/g, 'atan')
    .replace(/\\sin(?![a-zA-Z])/g, 'sin')
    .replace(/\\cos(?![a-zA-Z])/g, 'cos')
    .replace(/\\tan(?![a-zA-Z])/g, 'tan')
    .replace(/\\cot(?![a-zA-Z])/g, 'cot')
    .replace(/\\sec(?![a-zA-Z])/g, 'sec')
    .replace(/\\csc(?![a-zA-Z])/g, 'csc')
    .replace(/\\sinh(?![a-zA-Z])/g, 'sinh')
    .replace(/\\cosh(?![a-zA-Z])/g, 'cosh')
    .replace(/\\tanh(?![a-zA-Z])/g, 'tanh')
    .replace(/\\ln(?![a-zA-Z])/g, 'ln')
    .replace(/\\log(?![a-zA-Z])/g, 'log10')
    .replace(/\\exp(?![a-zA-Z])/g, 'exp')
    .replace(/\\abs(?![a-zA-Z])/g, 'abs')
    .replace(/\\floor(?![a-zA-Z])/g, 'floor')
    .replace(/\\ceil(?![a-zA-Z])/g, 'ceil')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')');

  // Normalize \var style variable references to var (whether vars keys have leading \ or not)
  const varKeysSorted = Object.keys(vars)
    .map((k) => k.replace(/^\\/, ''))
    .filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k))
    .sort((a, b) => b.length - a.length);
  for (const cleanName of varKeysSorted) {
    expr = expr.replace(new RegExp(`\\\\${cleanName}(?![a-zA-Z0-9_])`, 'g'), cleanName);
  }
  // Also normalize any custom function calls written as \f(...) to f(...)
  for (const fnName of Object.keys(customFuncs)) {
    expr = expr.replace(new RegExp(`\\\\${fnName}(?![a-zA-Z])`, 'g'), fnName);
  }

  const cleanVars: Record<string, number> = { pi: Math.PI, e: Math.E };
  for (const [k, v] of Object.entries(vars)) {
    cleanVars[k.replace(/^\\/, '')] = v;
  }

  type Tok =
    | { type: 'num'; v: number }
    | { type: 'id'; v: string }
    | { type: 'op'; v: string }
    | { type: 'qmark' }
    | { type: 'colon' }
    | { type: 'lp' }
    | { type: 'rp' }
    | { type: 'comma' };

  const tokens: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      if (expr[j] === 'e' || expr[j] === 'E') {
        if (/[0-9+-]/.test(expr[j + 1] ?? '')) {
          j++;
          if (expr[j] === '+' || expr[j] === '-') j++;
          while (j < expr.length && /[0-9]/.test(expr[j])) j++;
        }
      }
      const num = parseFloat(expr.slice(i, j));
      if (!Number.isFinite(num)) return null;
      tokens.push({ type: 'num', v: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
      const id = expr.slice(i, j);
      // Radian postfix `r` after space e.g. `sin(x r)`
      if (id === 'r' && tokens.length > 0) {
        const prev = tokens[tokens.length - 1];
        if (prev.type === 'num' || prev.type === 'id' || prev.type === 'rp') {
          if (!trigRadDefault) {
            tokens.push({ type: 'op', v: '*' });
            tokens.push({ type: 'num', v: 180 / Math.PI });
          }
          i = j;
          continue;
        }
      }
      tokens.push({ type: 'id', v: id });
      i = j;
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
      tokens.push({ type: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^<>'.includes(ch)) {
      tokens.push({ type: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '?') {
      tokens.push({ type: 'qmark' });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: 'colon' });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lp' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rp' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }
    return null;
  }

  // Insert implicit multiplication (e.g. 2x -> 2*x, 2(x) -> 2*(x), )( -> )*( )
  const expanded: Tok[] = [];
  const fnNames = new Set([
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'asin', 'acos', 'atan', 'atan2',
    'sinh', 'cosh', 'tanh', 'exp', 'ln', 'log', 'log10', 'log2', 'sqrt', 'abs',
    'floor', 'ceil', 'round', 'min', 'max', 'pow', 'sign', 'mod', 'deg', 'rad',
    'veclen', 'int', 'real', 'ifthenelse',
    ...Object.keys(customFuncs),
  ]);
  for (let idx = 0; idx < tokens.length; idx++) {
    const cur = tokens[idx];
    const prev = expanded[expanded.length - 1];
    if (prev) {
      const prevVal = prev.type === 'num' || prev.type === 'rp' || (prev.type === 'id' && !fnNames.has(prev.v));
      const curVal = cur.type === 'num' || cur.type === 'lp' || cur.type === 'id';
      if (prevVal && curVal) {
        expanded.push({ type: 'op', v: '*' });
      }
    }
    expanded.push(cur);
  }

  let pos = 0;
  const peek = () => expanded[pos];
  const consume = () => expanded[pos++];

  const toRad = (degOrRad: number) => (trigRadDefault ? degOrRad : (degOrRad * Math.PI) / 180);
  const fromRad = (rad: number) => (trigRadDefault ? rad : (rad * 180) / Math.PI);

  function parseTernary(): number {
    const cond = parseCmp();
    if (peek()?.type === 'qmark') {
      consume();
      const thenVal = parseTernary();
      if (peek()?.type === 'colon') consume();
      const elseVal = parseTernary();
      return cond !== 0 ? thenVal : elseVal;
    }
    return cond;
  }

  function parseCmp(): number {
    let left = parseAdd();
    while (
      peek()?.type === 'op' &&
      (peek() as { type: 'op'; v: string }).v in { '<': 1, '<=': 1, '>': 1, '>=': 1, '==': 1, '!=': 1 }
    ) {
      const op = (consume() as { type: 'op'; v: string }).v;
      const right = parseAdd();
      if (op === '<') left = left < right ? 1 : 0;
      else if (op === '<=') left = left <= right ? 1 : 0;
      else if (op === '>') left = left > right ? 1 : 0;
      else if (op === '>=') left = left >= right ? 1 : 0;
      else if (op === '==') left = Math.abs(left - right) < 1e-12 ? 1 : 0;
      else left = Math.abs(left - right) >= 1e-12 ? 1 : 0;
    }
    return left;
  }

  function parseAdd(): number {
    let left = parseMul();
    while (peek()?.type === 'op' && (peek() as { type: 'op'; v: string }).v in { '+': 1, '-': 1 }) {
      const op = (consume() as { type: 'op'; v: string }).v;
      const right = parseMul();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMul(): number {
    let left = parseUnary();
    while (peek()?.type === 'op' && (peek() as { type: 'op'; v: string }).v in { '*': 1, '/': 1 }) {
      const op = (consume() as { type: 'op'; v: string }).v;
      const right = parseUnary();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseUnary(): number {
    const t = peek();
    if (t?.type === 'op' && (t.v === '+' || t.v === '-')) {
      consume();
      const val = parseUnary();
      return t.v === '-' ? -val : val;
    }
    return parsePow();
  }

  function parsePow(): number {
    const base = parsePrimary();
    if (peek()?.type === 'op' && (peek() as { type: 'op'; v: string }).v === '^') {
      consume();
      const exp = parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) return NaN;
    if (t.type === 'num') {
      consume();
      return t.v;
    }
    if (t.type === 'lp') {
      consume();
      const v = parseTernary();
      if (peek()?.type === 'rp') consume();
      return v;
    }
    if (t.type === 'id') {
      consume();
      const name = t.v;
      if (peek()?.type === 'lp') {
        consume();
        const args: number[] = [];
        if (peek()?.type !== 'rp') {
          args.push(parseTernary());
          while (peek()?.type === 'comma') {
            consume();
            args.push(parseTernary());
          }
        }
        if (peek()?.type === 'rp') consume();
        if (name in customFuncs) {
          const cf = customFuncs[name];
          const localVars: Record<string, number> = { ...cleanVars };
          cf.params.forEach((pName, idx) => {
            if (idx < args.length) localVars[pName] = args[idx];
          });
          const res = evalMathExpr(cf.bodyExpr, localVars, trigRadDefault, customFuncs, evalDepth + 1);
          return res === null ? NaN : res;
        }
        const a0 = args[0] ?? 0;
        const a1 = args[1] ?? 0;
        const a2 = args[2] ?? 0;
        switch (name) {
          case 'sin': return Math.sin(toRad(a0));
          case 'cos': return Math.cos(toRad(a0));
          case 'tan': return Math.tan(toRad(a0));
          case 'cot': return 1 / Math.tan(toRad(a0));
          case 'sec': return 1 / Math.cos(toRad(a0));
          case 'csc': return 1 / Math.sin(toRad(a0));
          case 'asin': return fromRad(Math.asin(a0));
          case 'acos': return fromRad(Math.acos(a0));
          case 'atan': return fromRad(Math.atan(a0));
          case 'atan2': return fromRad(Math.atan2(a0, a1));
          case 'sinh': return Math.sinh(a0);
          case 'cosh': return Math.cosh(a0);
          case 'tanh': return Math.tanh(a0);
          case 'exp': return Math.exp(a0);
          case 'ln': return Math.log(a0);
          case 'log': return Math.log(a0);
          case 'log10': return Math.log10(a0);
          case 'log2': return Math.log2(a0);
          case 'sqrt': return Math.sqrt(a0);
          case 'abs': return Math.abs(a0);
          case 'floor': return Math.floor(a0);
          case 'ceil': return Math.ceil(a0);
          case 'round': return Math.round(a0);
          case 'min': return Math.min(...args);
          case 'max': return Math.max(...args);
          case 'pow': return Math.pow(a0, a1);
          case 'sign': return Math.sign(a0);
          case 'mod': return a0 % a1;
          case 'deg': return (a0 * 180) / Math.PI;
          case 'rad': return (a0 * Math.PI) / 180;
          case 'veclen': return Math.hypot(a0, a1);
          case 'int': return Math.trunc(a0);
          case 'real': return a0;
          case 'ifthenelse': return a0 !== 0 ? a1 : a2;
          default: return NaN;
        }
      }
      if (name in cleanVars) return cleanVars[name];
      return NaN;
    }
    return NaN;
  }

  try {
    const out = parseTernary();
    if (pos !== expanded.length || !Number.isFinite(out)) return null;
    return out;
  } catch {
    return null;
  }
}

export function evaluateTikzMathExpr(
  rawExpr: string,
  vars: Record<string, number> = {},
  trigRadDefault = false
): number | null {
  return evalMathExpr(rawExpr, vars, trigRadDefault);
}

interface FormattedLabel {
  tspans: string;
  plainLength: number;
}

function replaceBalancedLabelAccents(src: string): string {
  let out = src;
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;

    const fracMatch = /\\(?:d|t)?frac(?![a-zA-Z])/.exec(out);
    if (fracMatch) {
      let p = fracMatch.index + fracMatch[0].length;
      const readArg = (): { val: string; nextIdx: number } | null => {
        while (p < out.length && /\s/.test(out[p])) p++;
        if (p >= out.length) return null;
        if (out[p] === '{') {
          const br = readBalanced(out, p, '{', '}');
          if (!br) return null;
          return { val: br.content.trim(), nextIdx: br.endIdx + 1 };
        }
        if (out[p] === '\\') {
          const cm = out.slice(p).match(/^\\[a-zA-Z]+/);
          if (cm) return { val: cm[0], nextIdx: p + cm[0].length };
        }
        return { val: out[p], nextIdx: p + 1 };
      };
      const num = readArg();
      if (num) {
        p = num.nextIdx;
        const den = readArg();
        if (den) {
          const sa = num.val.length > 2 && /[+-]/.test(num.val) ? `(${num.val})` : num.val;
          const sb = den.val.length > 2 && /[+-]/.test(den.val) ? `(${den.val})` : den.val;
          out = out.slice(0, fracMatch.index) + `${sa}/${sb}` + out.slice(den.nextIdx);
          changed = true;
          continue;
        }
      }
    }

    const sqrtMatch = /\\sqrt(?![a-zA-Z])/.exec(out);
    if (sqrtMatch) {
      let p = sqrtMatch.index + sqrtMatch[0].length;
      while (p < out.length && /\s/.test(out[p])) p++;
      let degStr = '';
      if (out[p] === '[') {
        const dBr = readBalanced(out, p, '[', ']');
        if (dBr) {
          degStr = dBr.content.trim();
          p = dBr.endIdx + 1;
          while (p < out.length && /\s/.test(out[p])) p++;
        }
      }
      let argVal: string | null = null;
      let hasBraces = false;
      let nextIdx = p;
      if (out[p] === '{') {
        const br = readBalanced(out, p, '{', '}');
        if (br) {
          argVal = br.content.trim();
          hasBraces = true;
          nextIdx = br.endIdx + 1;
        }
      } else if (p < out.length) {
        argVal = out[p];
        nextIdx = p + 1;
      }
      if (argVal !== null) {
        const rootSym = degStr === '3' ? '∛' : degStr ? `${degStr}√` : '√';
        const repl = hasBraces || argVal.length > 1 ? `${rootSym}(${argVal})` : `${rootSym}${argVal}`;
        out = out.slice(0, sqrtMatch.index) + repl + out.slice(nextIdx);
        changed = true;
        continue;
      }
    }

    const decMatch = /\\(overrightarrow|vec|widehat|overline)(?![a-zA-Z])\s*\{/.exec(out);
    if (decMatch) {
      const br = readBalanced(out, decMatch.index + decMatch[0].length - 1, '{', '}');
      if (br) {
        const comb =
          decMatch[1] === 'widehat' ? '\u0302' : decMatch[1] === 'overline' ? '\u0304' : '\u20D7';
        out = out.slice(0, decMatch.index) + `${br.content}${comb}` + out.slice(br.endIdx + 1);
        changed = true;
        continue;
      }
    }

    if (!changed) break;
  }
  return out;
}

function formatLatexPieceToTspans(
  raw: string,
  italicVars: boolean,
  baseFontSize: number
): FormattedLabel {
  // Replace simple style switches and symbol commands while keeping \text/\mathrm/\mathbf intact for upright styling
  let s = raw
    .replace(/(^|[^\\])~/g, '$1 ')
    .replace(
      /\\(?:displaystyle|textstyle|scriptstyle|tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge|bfseries|itshape|mdseries|upshape|centering|ensuremath)(?![a-zA-Z])/g,
      ''
    )
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)(?=[()[\]{}|.])/g, '')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\quad(?![a-zA-Z])/g, '  ')
    .replace(/\\qquad(?![a-zA-Z])/g, '    ')
    .replace(/\\infty(?![a-zA-Z])/g, '∞')
    .replace(/\\pm(?![a-zA-Z])/g, '±')
    .replace(/\\mp(?![a-zA-Z])/g, '∓')
    .replace(/\\times(?![a-zA-Z])/g, '×')
    .replace(/\\cdot(?![a-zA-Z])/g, '·')
    .replace(/\\div(?![a-zA-Z])/g, '÷')
    .replace(/\\leq?(?:slant)?(?![a-zA-Z])/g, '≤')
    .replace(/\\geq?(?:slant)?(?![a-zA-Z])/g, '≥')
    .replace(/\\neq?(?![a-zA-Z])/g, '≠')
    .replace(/\\approx(?![a-zA-Z])/g, '≈')
    .replace(/\\equiv(?![a-zA-Z])/g, '≡')
    .replace(/\\parallel(?![a-zA-Z])/g, '∥')
    .replace(/\\perp(?![a-zA-Z])/g, '⊥')
    .replace(/\\angle(?![a-zA-Z])/g, '∠')
    .replace(/\\triangle(?![a-zA-Z])/g, '△')
    .replace(/\\prime(?![a-zA-Z])/g, '′')
    .replace(/\\in(?![a-zA-Z])/g, '∈')
    .replace(/\\notin(?![a-zA-Z])/g, '∉')
    .replace(/\\subset(?![a-zA-Z])/g, '⊂')
    .replace(/\\cup(?![a-zA-Z])/g, '∪')
    .replace(/\\cap(?![a-zA-Z])/g, '∩')
    .replace(/\\emptyset(?![a-zA-Z])/g, '∅')
    .replace(/\\varnothing(?![a-zA-Z])/g, '∅')
    .replace(/\\forall(?![a-zA-Z])/g, '∀')
    .replace(/\\exists(?![a-zA-Z])/g, '∃')
    .replace(/\\rightarrow|\\to(?![a-zA-Z])/g, '→')
    .replace(/\\leftarrow(?![a-zA-Z])/g, '←')
    .replace(/\\Rightarrow(?![a-zA-Z])/g, '⇒')
    .replace(/\\Leftrightarrow(?![a-zA-Z])/g, '⇔')
    .replace(/\\degree(?![a-zA-Z])/g, '°')
    .replace(/\\circ(?![a-zA-Z])/g, '°')
    .replace(/\\alpha(?![a-zA-Z])/g, 'α')
    .replace(/\\beta(?![a-zA-Z])/g, 'β')
    .replace(/\\gamma(?![a-zA-Z])/g, 'γ')
    .replace(/\\delta(?![a-zA-Z])/g, 'δ')
    .replace(/\\Delta(?![a-zA-Z])/g, 'Δ')
    .replace(/\\varepsilon|\\epsilon(?![a-zA-Z])/g, 'ε')
    .replace(/\\theta(?![a-zA-Z])/g, 'θ')
    .replace(/\\lambda(?![a-zA-Z])/g, 'λ')
    .replace(/\\mu(?![a-zA-Z])/g, 'μ')
    .replace(/\\pi(?![a-zA-Z])/g, 'π')
    .replace(/\\rho(?![a-zA-Z])/g, 'ρ')
    .replace(/\\sigma(?![a-zA-Z])/g, 'σ')
    .replace(/\\varphi|\\phi(?![a-zA-Z])/g, 'φ')
    .replace(/\\omega(?![a-zA-Z])/g, 'ω')
    .replace(/\\Omega(?![a-zA-Z])/g, 'Ω')
    .replace(/\\mathbb\s*\{R\}/g, 'ℝ')
    .replace(/\\mathbb\s*\{N\}/g, 'ℕ')
    .replace(/\\mathbb\s*\{Z\}/g, 'ℤ')
    .replace(/\\mathbb\s*\{Q\}/g, 'ℚ')
    .replace(/\\mathbb\s*\{C\}/g, 'ℂ');

  s = replaceBalancedLabelAccents(s);

  const uprightCmds = new Set([
    'text',
    'mathrm',
    'textrm',
    'textup',
    'textnormal',
    'operatorname',
    'mbox',
    'hbox',
  ]);
  const boldCmds = new Set(['textbf', 'mathbf']);
  const italicCmds = new Set(['textit', 'mathit', 'emph']);
  const knownFuncs = new Set([
    'sin',
    'cos',
    'tan',
    'cot',
    'sec',
    'csc',
    'arcsin',
    'arccos',
    'arctan',
    'log',
    'ln',
    'lg',
    'exp',
    'lim',
    'max',
    'min',
    'sup',
    'inf',
    'det',
    'dim',
    'gcd',
    'deg',
  ]);

  let out = '';
  let plainLen = 0;
  let i = 0;
  const subSize = Math.round(baseFontSize * 0.72 * 10) / 10;

  while (i < s.length) {
    // Escaped punctuation/braces
    if (s[i] === '\\' && i + 1 < s.length && /[{}$%&_#\\]/.test(s[i + 1])) {
      out += escapeXmlAttr(s[i + 1]);
      plainLen += 1;
      i += 2;
      continue;
    }

    // Commands (\text{...}, \mathrm{...}, \mathbf{...}, etc.)
    if (s[i] === '\\') {
      const cmdM = s.slice(i).match(/^\\([a-zA-Z]+)\*?/);
      if (cmdM) {
        const cmdName = cmdM[1];
        let p = i + cmdM[0].length;
        while (p < s.length && /\s/.test(s[p])) p++;
        if (
          (uprightCmds.has(cmdName) || boldCmds.has(cmdName) || italicCmds.has(cmdName)) &&
          s[p] === '{'
        ) {
          const br = readBalanced(s, p, '{', '}');
          if (br) {
            const innerFormatted =
              br.content.includes('$') || br.content.includes('\\(')
                ? formatTikzLabelToSvg(br.content, baseFontSize)
                : formatLatexPieceToTspans(br.content, italicCmds.has(cmdName), baseFontSize);
            if (boldCmds.has(cmdName)) {
              out += `<tspan font-weight="bold" font-style="normal">${innerFormatted.tspans}</tspan>`;
            } else if (italicCmds.has(cmdName)) {
              out += `<tspan font-style="italic">${innerFormatted.tspans}</tspan>`;
            } else {
              out += `<tspan font-style="normal">${innerFormatted.tspans}</tspan>`;
            }
            plainLen += innerFormatted.plainLength;
            i = br.endIdx + 1;
            continue;
          }
        }
        // Fallback: emit command name (respecting known math functions as upright)
        if (italicVars && !knownFuncs.has(cmdName)) {
          out += `<tspan font-style="italic">${escapeXmlAttr(cmdName)}</tspan>`;
        } else {
          out += escapeXmlAttr(cmdName);
        }
        plainLen += cmdName.length;
        i += cmdM[0].length;
        continue;
      }
      i++;
      continue;
    }

    if ((s[i] === '^' || s[i] === '_') && i + 1 < s.length) {
      const isSup = s[i] === '^';
      let content = '';
      if (s[i + 1] === '{') {
        const br = readBalanced(s, i + 1, '{', '}');
        if (br) {
          content = br.content;
          i = br.endIdx + 1;
        } else {
          content = s[i + 1];
          i += 2;
        }
      } else {
        content = s[i + 1];
        i += 2;
      }
      const dy = isSup ? -Math.round(baseFontSize * 0.34) : Math.round(baseFontSize * 0.22);
      const resetDy = -dy;
      const subFormatted = formatLatexPieceToTspans(content, italicVars, subSize);
      out += `<tspan dy="${dy}" font-size="${subSize}">${subFormatted.tspans}</tspan><tspan dy="${resetDy}">&#8203;</tspan>`;
      plainLen += Math.max(0.6, subFormatted.plainLength * 0.7);
      continue;
    }

    if (s[i] === '{' || s[i] === '}') {
      i++;
      continue;
    }

    if (italicVars && s[i] === '-') {
      out += '−';
      plainLen += 1;
      i++;
      continue;
    }

    if (italicVars && /[a-zA-Z]/.test(s[i])) {
      let j = i;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      const word = s.slice(i, j);
      if (word.length === 1 || !knownFuncs.has(word)) {
        out += `<tspan font-style="italic">${escapeXmlAttr(word)}</tspan>`;
      } else {
        out += escapeXmlAttr(word);
      }
      plainLen += word.length;
      i = j;
      continue;
    }

    out += escapeXmlAttr(s[i]);
    plainLen += 1;
    i++;
  }

  return { tspans: out, plainLength: plainLen };
}

function formatTikzLabelToSvg(rawLabel: string, baseFontSize = 13): FormattedLabel {
  const s = rawLabel.trim();
  if (!s) return { tspans: '', plainLength: 0 };

  const findClosingDollar = (str: string, start: number): number => {
    for (let k = start; k < str.length; k++) {
      if (str[k] === '\\' && k + 1 < str.length) {
        k++;
        continue;
      }
      if (str[k] === '$') return k;
    }
    return -1;
  };

  // Split by $$...$$, $...$, \(...\), or \[...\]
  let out = '';
  let plainLen = 0;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && s[i + 1] === '$') {
      out += '$';
      plainLen += 1;
      i += 2;
      continue;
    }
    if (s[i] === '$' && s[i + 1] === '$') {
      const end = s.indexOf('$$', i + 2);
      if (end !== -1) {
        const inner = s.slice(i + 2, end);
        const f = formatLatexPieceToTspans(inner, true, baseFontSize);
        out += f.tspans;
        plainLen += f.plainLength;
        i = end + 2;
        continue;
      }
    }
    if (s[i] === '$') {
      const end = findClosingDollar(s, i + 1);
      if (end !== -1) {
        const inner = s.slice(i + 1, end);
        const f = formatLatexPieceToTspans(inner, true, baseFontSize);
        out += f.tspans;
        plainLen += f.plainLength;
        i = end + 1;
        continue;
      }
    }
    if (s[i] === '\\' && s[i + 1] === '(') {
      const end = s.indexOf('\\)', i + 2);
      if (end !== -1) {
        const inner = s.slice(i + 2, end);
        const f = formatLatexPieceToTspans(inner, true, baseFontSize);
        out += f.tspans;
        plainLen += f.plainLength;
        i = end + 2;
        continue;
      }
    }
    if (s[i] === '\\' && s[i + 1] === '[') {
      const end = s.indexOf('\\]', i + 2);
      if (end !== -1) {
        const inner = s.slice(i + 2, end);
        const f = formatLatexPieceToTspans(inner, true, baseFontSize);
        out += f.tspans;
        plainLen += f.plainLength;
        i = end + 2;
        continue;
      }
    }
    // Plain text until next math delimiter
    let j = i;
    while (j < s.length) {
      if (s[j] === '\\' && s[j + 1] === '$') {
        j += 2;
        continue;
      }
      if (s[j] === '$') break;
      if (s[j] === '\\' && (s[j + 1] === '(' || s[j + 1] === '[')) break;
      j++;
    }
    const chunk = s.slice(i, j);
    const f = formatLatexPieceToTspans(chunk, false, baseFontSize);
    out += f.tspans;
    plainLen += f.plainLength;
    i = j;
  }

  return { tspans: out, plainLength: plainLen };
}

function findForeachStatementEnd(src: string, startPos: number): number {
  let pos = startPos;
  let bDepth = 0;
  let pDepth = 0;
  let kDepth = 0;
  let inMath = false;
  let inQuotes = false;
  while (pos < src.length) {
    const c = src[pos];
    if (c === '\\' && pos + 1 < src.length) {
      pos += 2;
      continue;
    }
    if (c === '"' && bDepth === 0) inQuotes = !inQuotes;
    else if (c === '$') inMath = !inMath;
    else if (!inMath && !inQuotes) {
      if (c === '{') bDepth++;
      else if (c === '}') bDepth = Math.max(0, bDepth - 1);
      else if (c === '(') pDepth++;
      else if (c === ')') pDepth = Math.max(0, pDepth - 1);
      else if (c === '[') kDepth++;
      else if (c === ']') kDepth = Math.max(0, kDepth - 1);
      else if (c === ';' && bDepth === 0 && pDepth === 0 && kDepth === 0) {
        return pos + 1;
      }
    }
    pos++;
  }
  return src.length;
}

function expandForeachLoops(
  src: string,
  vars: Record<string, number> = {},
  customFuncs: Record<string, CustomMathFunc> = {}
): string {
  let out = src;
  const re = /\\foreach\s+(\\[a-zA-Z]+(?:\s*\/\s*\\[a-zA-Z]+)*)/;
  let safety = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(out)) !== null && safety < 120) {
    safety++;
    const varNames = m[1].split('/').map((v) => v.trim());
    let scan = m.index + m[0].length;
    const { opts: feOpts, nextIdx: afterOpts } = readLeadingBracketOptions(out, scan);
    scan = afterOpts;
    while (scan < out.length && /\s/.test(out[scan])) scan++;
    if (!out.startsWith('in', scan) || /[a-zA-Z]/.test(out[scan + 2] || '')) break;
    scan += 2;
    while (scan < out.length && /\s/.test(out[scan])) scan++;
    if (out[scan] !== '{') break;
    const listBr = readBalanced(out, scan, '{', '}');
    if (!listBr) break;

    let countVar: string | null = null;
    const evalClauses: Array<{ targetVar: string; expr: string }> = [];
    if (feOpts) {
      for (const optPart of splitTopLevel(feOpts, ',')) {
        const trimmed = optPart.trim();
        const cntM = trimmed.match(/^count\s*=\s*(\\[a-zA-Z]+)/);
        if (cntM) {
          countVar = cntM[1];
          continue;
        }
        const evM = trimmed.match(/^evaluate\s*=\s*(?:\\[a-zA-Z]+\s+as\s+)?(\\[a-zA-Z]+)\s+using\s+([\s\S]+)$/);
        if (evM) {
          evalClauses.push({ targetVar: evM[1], expr: evM[2].trim() });
        }
      }
    }

    let pos = listBr.endIdx + 1;
    while (pos < out.length && /\s/.test(out[pos])) pos++;
    let bodyStr = '';
    let endPos = pos;

    if (out[pos] === '{') {
      const bodyBr = readBalanced(out, pos, '{', '}');
      if (!bodyBr) break;
      bodyStr = bodyBr.content;
      endPos = bodyBr.endIdx + 1;
    } else {
      endPos = findForeachStatementEnd(out, pos);
      bodyStr = out.slice(pos, endPos);
    }

    const rawItems = splitTopLevel(listBr.content, ',').map((x) => x.trim()).filter(Boolean);
    const items: string[] = [];

    // Expand `a, b, ..., c` or `a, ..., c`
    for (let idx = 0; idx < rawItems.length; idx++) {
      if (rawItems[idx] === '...' && idx > 0 && idx + 1 < rawItems.length) {
        const endVal = evalMathExpr(rawItems[idx + 1], vars, false, customFuncs);
        const startVal = evalMathExpr(rawItems[idx - 1], vars, false, customFuncs);
        const prevVal = idx >= 2 ? evalMathExpr(rawItems[idx - 2], vars, false, customFuncs) : null;
        if (startVal !== null && endVal !== null) {
          const step =
            prevVal !== null && startVal !== prevVal
              ? startVal - prevVal
              : endVal >= startVal
              ? 1
              : -1;
          if (Math.abs(step) > 1e-6) {
            let cur = startVal + step;
            let guard = 0;
            while (
              guard < 200 &&
              (step > 0 ? cur <= endVal + 1e-6 : cur >= endVal - 1e-6)
            ) {
              items.push(String(Math.round(cur * 1e6) / 1e6));
              cur += step;
              guard++;
            }
          }
          idx++;
          continue;
        }
      }
      items.push(rawItems[idx]);
    }

    let expanded = '';
    items.forEach((item, itemIdx) => {
      const vals = splitTopLevel(item, '/').map((v) => v.trim());
      let rep = bodyStr;
      const iterNumVars: Record<string, number> = { ...vars };
      varNames.forEach((vn, vIdx) => {
        const val = vals[vIdx] ?? vals[0] ?? '';
        const numVal = evalMathExpr(val, iterNumVars, false, customFuncs);
        if (numVal !== null) iterNumVars[vn.replace(/^\\/, '')] = numVal;
        const escName = vn.replace('\\', '\\\\');
        rep = rep.replace(new RegExp(`${escName}(?![a-zA-Z])`, 'g'), () => val);
      });
      if (countVar) {
        iterNumVars[countVar.replace(/^\\/, '')] = itemIdx + 1;
        const escCount = countVar.replace('\\', '\\\\');
        const cntStr = String(itemIdx + 1);
        rep = rep.replace(new RegExp(`${escCount}(?![a-zA-Z])`, 'g'), () => cntStr);
      }
      for (const ev of evalClauses) {
        const evVal = evalMathExpr(ev.expr, iterNumVars, false, customFuncs);
        if (evVal !== null) {
          const rounded = Math.round(evVal * 1e6) / 1e6;
          iterNumVars[ev.targetVar.replace(/^\\/, '')] = rounded;
          const escEv = ev.targetVar.replace('\\', '\\\\');
          rep = rep.replace(new RegExp(`${escEv}(?![a-zA-Z])`, 'g'), () => String(rounded));
        }
      }
      expanded += `${rep}\n`;
    });

    out = out.slice(0, m.index) + expanded + out.slice(endPos);
  }

  return out;
}

function parseBasisVectorSpec(
  raw: string,
  unitPx: number,
  vars: Record<string, number>,
  customFuncs: Record<string, CustomMathFunc>
): Point2D | null {
  let s = raw.trim();
  if (s.startsWith('{') && s.endsWith('}')) s = s.slice(1, -1).trim();
  if (!s.startsWith('(') || !s.endsWith(')')) return null;
  const br = readBalanced(s, 0, '(', ')');
  if (!br || br.endIdx !== s.length - 1) return null;
  const inner = br.content.trim();
  const colonParts = splitTopLevel(inner, ':');
  if (colonParts.length === 2) {
    const ang = evalMathExpr(colonParts[0], vars, false, customFuncs);
    const rad =
      parseLengthToTikzUnits(colonParts[1], unitPx) ??
      evalMathExpr(colonParts[1], vars, false, customFuncs);
    if (ang !== null && rad !== null) {
      const r = (ang * Math.PI) / 180;
      return { x: rad * Math.cos(r), y: rad * Math.sin(r) };
    }
  }
  const xyParts = splitTopLevel(inner, ',');
  if (xyParts.length === 2) {
    const vx =
      parseLengthToTikzUnits(xyParts[0], unitPx) ??
      evalMathExpr(xyParts[0], vars, false, customFuncs);
    const vy =
      parseLengthToTikzUnits(xyParts[1], unitPx) ??
      evalMathExpr(xyParts[1], vars, false, customFuncs);
    if (vx !== null && vy !== null) return { x: vx, y: vy };
  }
  return null;
}

function computeTdplotBasis(thetaDeg: number, phiDeg: number): {
  basisX: Point2D;
  basisY: Point2D;
  basisZ: Point2D;
} {
  const th = (thetaDeg * Math.PI) / 180;
  const ph = (phiDeg * Math.PI) / 180;
  return {
    basisX: { x: Math.cos(ph), y: -Math.cos(th) * Math.sin(ph) },
    basisY: { x: Math.sin(ph), y: Math.cos(th) * Math.cos(ph) },
    basisZ: { x: 0, y: Math.sin(th) },
  };
}

function parseOptionsString(
  rawOpts: string,
  base: TikzScopeState,
  customColors: Record<string, string>,
  unitPx = 42,
  vars: Record<string, number> = {},
  customFuncs: Record<string, CustomMathFunc> = {},
  expandDepth = 0
): DrawStyle & {
  scaleX?: number;
  scaleY?: number;
  rotateDeg?: number;
  domain?: [number, number];
  samples?: number;
  step?: number;
  labelSpec?: string;
} {
  const parts = splitTopLevel(rawOpts, ',').map((p) => p.trim()).filter(Boolean);
  const style: DrawStyle & {
    scaleX?: number;
    scaleY?: number;
    rotateDeg?: number;
    domain?: [number, number];
    samples?: number;
    step?: number;
    labelSpec?: string;
  } = {
    stroke: base.color,
    strokeWidth: base.lineWidth,
    dashArray: base.dashArray,
    fill: base.fill,
    fillOpacity: base.fillOpacity,
    strokeOpacity: 1,
    fontSize: base.fontSize,
    fontWeight: base.fontWeight,
  };

  const applySubStyle = (subOptsRaw: string) => {
    if (expandDepth >= 4 || !subOptsRaw.trim()) return;
    const tempBase: TikzScopeState = {
      ...base,
      color: style.stroke,
      lineWidth: style.strokeWidth,
      dashArray: style.dashArray,
      fill: style.fill,
      fillOpacity: style.fillOpacity,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      customStyles: { ...(base.customStyles || {}), ...(style.definedStyles || {}) },
    };
    const sub = parseOptionsString(subOptsRaw, tempBase, customColors, unitPx, vars, customFuncs, expandDepth + 1);
    style.stroke = sub.stroke;
    style.strokeWidth = sub.strokeWidth;
    style.dashArray = sub.dashArray;
    style.fill = sub.fill;
    style.fillOpacity = sub.fillOpacity;
    style.strokeOpacity = sub.strokeOpacity;
    if (sub.arrowStart !== undefined) style.arrowStart = sub.arrowStart;
    if (sub.arrowEnd !== undefined) style.arrowEnd = sub.arrowEnd;
    if (sub.pattern !== undefined) style.pattern = sub.pattern;
    if (sub.patternColor !== undefined) style.patternColor = sub.patternColor;
    if (sub.fontSize !== undefined) style.fontSize = sub.fontSize;
    if (sub.fontWeight !== undefined) style.fontWeight = sub.fontWeight;
    if (sub.anchor !== undefined) style.anchor = sub.anchor;
    if (sub.anchorDist !== undefined) style.anchorDist = sub.anchorDist;
    if (sub.pos !== undefined) style.pos = sub.pos;
    if (sub.shiftX !== undefined) style.shiftX = (style.shiftX ?? 0) + sub.shiftX;
    if (sub.shiftY !== undefined) style.shiftY = (style.shiftY ?? 0) + sub.shiftY;
    if (sub.shiftXPx !== undefined) style.shiftXPx = (style.shiftXPx ?? 0) + sub.shiftXPx;
    if (sub.shiftYPx !== undefined) style.shiftYPx = (style.shiftYPx ?? 0) + sub.shiftYPx;
    if (sub.scaleX !== undefined) style.scaleX = (style.scaleX ?? 1) * sub.scaleX;
    if (sub.scaleY !== undefined) style.scaleY = (style.scaleY ?? 1) * sub.scaleY;
    if (sub.rotateDeg !== undefined) style.rotateDeg = (style.rotateDeg ?? 0) + sub.rotateDeg;
    if (sub.isClip !== undefined) style.isClip = sub.isClip;
    if (sub.hasDraw !== undefined) style.hasDraw = sub.hasDraw;
    if (sub.hasFill !== undefined) style.hasFill = sub.hasFill;
    if (sub.circle !== undefined) style.circle = sub.circle;
    if (sub.innerSep !== undefined) style.innerSep = sub.innerSep;
    if (sub.roundedCorners !== undefined) style.roundedCorners = sub.roundedCorners;
    if (sub.domain !== undefined) style.domain = sub.domain;
    if (sub.samples !== undefined) style.samples = sub.samples;
    if (sub.basisX !== undefined) style.basisX = sub.basisX;
    if (sub.basisY !== undefined) style.basisY = sub.basisY;
    if (sub.basisZ !== undefined) style.basisZ = sub.basisZ;
    if (sub.customFuncs) style.customFuncs = { ...(style.customFuncs || {}), ...sub.customFuncs };
    if (sub.trigRad !== undefined) style.trigRad = sub.trigRad;
  };

  for (const part of parts) {
    // Handle TikZ quotes syntax like `"$30^\circ$"` or `"$\alpha$"' {opts}`
    if (part.startsWith('"')) {
      const endQ = part.indexOf('"', 1);
      if (endQ !== -1) {
        style.picText = part.slice(1, endQ);
        const tail = part.slice(endQ + 1).trim();
        const braceIdx = tail.indexOf('{');
        if (braceIdx !== -1) {
          const br = readBalanced(tail, braceIdx, '{', '}');
          if (br) style.picTextOpts = br.content;
        }
        continue;
      }
    }

    const eqIdx = part.indexOf('=');
    const key = (eqIdx === -1 ? part : part.slice(0, eqIdx)).trim();
    const val = (eqIdx === -1 ? '' : part.slice(eqIdx + 1)).trim();
    const cleanVal = val.startsWith('{') && val.endsWith('}') ? val.slice(1, -1).trim() : val;

    // Style definition: foo/.style={...}, foo/.append style={...}, foo/.style 2 args={...}
    const styleDefM = key.match(/^(.+?)\/\.(?:append\s+|prefix\s+)?style(?:\s+\d+\s+args)?$/);
    if (styleDefM && cleanVal) {
      const sName = styleDefM[1].trim();
      if (!style.definedStyles) style.definedStyles = {};
      const existing = style.definedStyles[sName] ?? base.customStyles?.[sName];
      style.definedStyles[sName] =
        key.includes('append') && existing ? `${existing}, ${cleanVal}` : cleanVal;
      continue;
    }

    // Custom style expansion (defined in tikzset, tikzpicture, scope, or earlier in this option list)
    const customStyleDef = style.definedStyles?.[key] ?? base.customStyles?.[key];
    if (customStyleDef !== undefined && key !== 'every node' && key !== 'every path') {
      const expandedDef = cleanVal
        ? customStyleDef.replace(/#1/g, cleanVal)
        : customStyleDef;
      applySubStyle(expandedDef);
      continue;
    }

    if (
      key === '->' ||
      key === '-latex' ||
      key === '-stealth' ||
      key === '->>' ||
      key === '|->' ||
      /^-\{?(?:Stealth|Latex|Triangle|To)\b/.test(key)
    ) {
      style.arrowEnd = true;
    } else if (
      key === '<-' ||
      key === 'latex-' ||
      key === 'stealth-' ||
      /^\{?(?:Stealth|Latex|Triangle|To)\b[^-]*-$/.test(key)
    ) {
      style.arrowStart = true;
    } else if (
      key === '<->' ||
      key === 'latex-latex' ||
      key === 'stealth-stealth' ||
      /^\{?(?:Stealth|Latex|Triangle|To)\b[^-]*-\{?(?:Stealth|Latex|Triangle|To)\b/.test(key)
    ) {
      style.arrowStart = true;
      style.arrowEnd = true;
    } else if (key === 'clip') {
      style.isClip = true;
    } else if (key === 'tdplot_main_coords') {
      style.useTdplotMainCoords = true;
      const tb = computeTdplotBasis(base.tdplotTheta ?? 70, base.tdplotPhi ?? 110);
      style.basisX = tb.basisX;
      style.basisY = tb.basisY;
      style.basisZ = tb.basisZ;
    } else if (key === 'ultra thin') style.strokeWidth = 0.5;
    else if (key === 'very thin') style.strokeWidth = 0.7;
    else if (key === 'thin') style.strokeWidth = 1.0;
    else if (key === 'semithick') style.strokeWidth = 1.3;
    else if (key === 'thick') style.strokeWidth = 1.8;
    else if (key === 'very thick') style.strokeWidth = 2.4;
    else if (key === 'ultra thick') style.strokeWidth = 3.2;
    else if (key === 'line width' && cleanVal) {
      const px = parseLengthToPx(cleanVal);
      if (px !== null) style.strokeWidth = Math.max(0.4, px);
    } else if (key === 'dashed') style.dashArray = '6,4';
    else if (key === 'densely dashed') style.dashArray = '4,2.5';
    else if (key === 'loosely dashed') style.dashArray = '6,6';
    else if (key === 'dotted') style.dashArray = '1.8,3.2';
    else if (key === 'densely dotted') style.dashArray = '1.6,2';
    else if (key === 'loosely dotted') style.dashArray = '1.8,5.5';
    else if (key === 'dash pattern' && cleanVal) style.dashArray = '5,3';
    else if (key === 'solid') style.dashArray = undefined;
    else if (key === 'circle') style.circle = true;
    else if (key === 'declare function' && cleanVal) {
      if (!style.customFuncs) style.customFuncs = {};
      parseDeclareFunctionsSpec(cleanVal, style.customFuncs);
    } else if ((key === 'trig format' || key === 'trig format plots') && cleanVal === 'rad') {
      style.trigRad = true;
    } else if (key === 'variable' && cleanVal) {
      style.plotVar = cleanVal.trim();
    } else if ((key === 'name path' || key === 'name path global') && cleanVal) {
      style.namePath = cleanVal.trim();
    } else if (key === 'name intersections' && cleanVal) {
      let pathA = '';
      let pathB = '';
      let byNames: string[] = [];
      let prefixName: string | undefined;
      let totalVar: string | undefined;
      for (const ip of splitTopLevel(cleanVal, ',')) {
        const ieq = ip.indexOf('=');
        if (ieq === -1) continue;
        const ik = ip.slice(0, ieq).trim().toLowerCase();
        let iv = ip.slice(ieq + 1).trim();
        if (iv.startsWith('{') && iv.endsWith('}')) iv = iv.slice(1, -1).trim();
        if (ik === 'of') {
          const andM = iv.match(/^([\s\S]+?)\s+and\s+([\s\S]+)$/);
          if (andM) {
            pathA = andM[1].trim();
            pathB = andM[2].trim();
          }
        } else if (ik === 'by') {
          byNames = splitTopLevel(iv, ',')
            .map((b) => b.trim().replace(/^\[[^\]]*\]\s*/, '').trim())
            .filter(Boolean);
        } else if (ik === 'name') {
          prefixName = iv;
        } else if (ik === 'total') {
          totalVar = iv.replace(/^\\/, '').trim();
        }
      }
      if (pathA && pathB) {
        style.nameIntersections = { pathA, pathB, byNames, prefixName, totalVar };
      }
    } else if (key === 'color' && cleanVal) {
      const c = resolveTikzColor(cleanVal, customColors);
      if (c) style.stroke = c;
    } else if (key === 'draw') {
      if (cleanVal.toLowerCase() === 'none') {
        style.hasDraw = false;
        style.stroke = 'none';
      } else {
        style.hasDraw = true;
        if (cleanVal) {
          const c = resolveTikzColor(cleanVal, customColors);
          if (c) style.stroke = c;
        }
      }
    } else if (key === 'fill') {
      if (!cleanVal) {
        style.hasFill = true;
        style.fill = style.stroke;
      } else if (cleanVal.toLowerCase() === 'none') {
        style.hasFill = false;
        style.fill = 'none';
      } else {
        const c = resolveTikzColor(cleanVal, customColors);
        if (c) {
          style.hasFill = true;
          style.fill = c;
        }
      }
    } else if (key === 'fill opacity' && cleanVal) {
      const op = parseFloat(cleanVal);
      if (Number.isFinite(op)) style.fillOpacity = Math.max(0, Math.min(1, op));
    } else if (key === 'draw opacity' && cleanVal) {
      const op = parseFloat(cleanVal);
      if (Number.isFinite(op)) style.strokeOpacity = Math.max(0, Math.min(1, op));
    } else if (key === 'opacity' && cleanVal) {
      const op = parseFloat(cleanVal);
      if (Number.isFinite(op)) {
        style.fillOpacity = Math.max(0, Math.min(1, op));
        style.strokeOpacity = style.fillOpacity;
      }
    } else if (key === 'angle radius' && cleanVal) {
      const hasUnit = /[a-zA-Z]+$/.test(cleanVal);
      if (hasUnit) {
        const px = parseLengthToPx(cleanVal, unitPx);
        if (px !== null && px > 0) style.angleRadiusPx = px;
      } else {
        const v = evalMathExpr(cleanVal, vars, false, customFuncs);
        if (v !== null && v > 0) style.angleRadiusPx = v * unitPx * Math.abs(base.scaleX);
      }
    } else if (key === 'angle eccentricity' && cleanVal) {
      const ecc = evalMathExpr(cleanVal, vars, false, customFuncs);
      if (ecc !== null && Number.isFinite(ecc)) style.angleEccentricity = ecc;
    } else if (key === 'pic text' && cleanVal) {
      style.picText =
        cleanVal.startsWith('"') && cleanVal.endsWith('"') && cleanVal.length >= 2
          ? cleanVal.slice(1, -1)
          : cleanVal;
    } else if (key === 'pattern' && cleanVal) {
      style.pattern = cleanVal.toLowerCase();
    } else if (key === 'pattern color' && cleanVal) {
      const c = resolveTikzColor(cleanVal, customColors);
      if (c) style.patternColor = c;
    } else if (key === 'x' && cleanVal) {
      const vec = parseBasisVectorSpec(cleanVal, unitPx, vars, customFuncs);
      if (vec) {
        style.basisX = vec;
      } else {
        const u = parseLengthToTikzUnits(cleanVal, unitPx);
        if (u !== null && u > 0) style.scaleX = (style.scaleX ?? 1) * u;
      }
    } else if (key === 'y' && cleanVal) {
      const vec = parseBasisVectorSpec(cleanVal, unitPx, vars, customFuncs);
      if (vec) {
        style.basisY = vec;
      } else {
        const u = parseLengthToTikzUnits(cleanVal, unitPx);
        if (u !== null && u > 0) style.scaleY = (style.scaleY ?? 1) * u;
      }
    } else if (key === 'z' && cleanVal) {
      const vec = parseBasisVectorSpec(cleanVal, unitPx, vars, customFuncs);
      if (vec) {
        style.basisZ = vec;
      } else {
        const u = parseLengthToTikzUnits(cleanVal, unitPx);
        if (u !== null && u > 0) style.basisZ = { x: -0.385 * u, y: -0.385 * u };
      }
    } else if (key === 'scale' && cleanVal) {
      const sc = evalMathExpr(cleanVal, vars, false, customFuncs);
      if (sc !== null && Number.isFinite(sc)) {
        style.scaleX = (style.scaleX ?? 1) * sc;
        style.scaleY = (style.scaleY ?? 1) * sc;
      }
    } else if (key === 'xscale' && cleanVal) {
      const sc = evalMathExpr(cleanVal, vars, false, customFuncs);
      if (sc !== null && Number.isFinite(sc)) style.scaleX = (style.scaleX ?? 1) * sc;
    } else if (key === 'yscale' && cleanVal) {
      const sc = evalMathExpr(cleanVal, vars, false, customFuncs);
      if (sc !== null && Number.isFinite(sc)) style.scaleY = (style.scaleY ?? 1) * sc;
    } else if (key === 'rotate' && cleanVal) {
      const deg = evalMathExpr(cleanVal, vars, false, customFuncs);
      if (deg !== null && Number.isFinite(deg)) style.rotateDeg = (style.rotateDeg ?? 0) + deg;
    } else if (key === 'rotate around' && cleanVal) {
      const raParts = splitTopLevel(cleanVal, ':');
      if (raParts.length === 2) {
        const deg = evalMathExpr(raParts[0], vars, false, customFuncs);
        const center = parseBasisVectorSpec(raParts[1], unitPx, vars, customFuncs);
        if (deg !== null && center) {
          style.rotateAround = { deg, center };
        }
      }
    } else if (key === 'domain' && cleanVal) {
      const dParts = splitTopLevel(cleanVal, ':');
      if (dParts.length === 2) {
        const d0 = evalMathExpr(dParts[0], vars, false, customFuncs);
        const d1 = evalMathExpr(dParts[1], vars, false, customFuncs);
        if (d0 !== null && d1 !== null) style.domain = [d0, d1];
      }
    } else if (key === 'samples' && cleanVal) {
      const smp = parseInt(cleanVal, 10);
      if (Number.isFinite(smp) && smp >= 2) style.samples = Math.min(400, smp);
    } else if (key === 'step' && cleanVal) {
      const st = parseLengthToTikzUnits(cleanVal, unitPx);
      if (st !== null && st > 0) style.step = st;
    } else if (key === 'pos' && cleanVal) {
      const p = parseFloat(cleanVal);
      if (Number.isFinite(p)) style.pos = p;
    } else if (key === 'midway') style.pos = 0.5;
    else if (key === 'near start') style.pos = 0.25;
    else if (key === 'near end') style.pos = 0.75;
    else if (key === 'at start') style.pos = 0;
    else if (key === 'at end') style.pos = 1;
    else if (
      key === 'above' ||
      key === 'below' ||
      key === 'left' ||
      key === 'right' ||
      key === 'above left' ||
      key === 'above right' ||
      key === 'below left' ||
      key === 'below right'
    ) {
      style.anchor = key;
      if (cleanVal) {
        const dPx = parseLengthToPx(cleanVal, unitPx);
        if (dPx !== null && Number.isFinite(dPx)) style.anchorDist = dPx;
      }
    } else if (key === 'anchor' && cleanVal) {
      const anchorMap: Record<string, string> = {
        north: 'below',
        south: 'above',
        east: 'left',
        west: 'right',
        'north east': 'below left',
        'north west': 'below right',
        'south east': 'above left',
        'south west': 'above right',
        center: 'center',
      };
      if (anchorMap[cleanVal.toLowerCase()]) {
        style.anchor = anchorMap[cleanVal.toLowerCase()];
      }
    } else if (key === 'xshift' && cleanVal) {
      const px = parseLengthToPx(cleanVal, unitPx);
      if (px !== null) style.shiftXPx = (style.shiftXPx ?? 0) + px;
    } else if (key === 'yshift' && cleanVal) {
      const px = parseLengthToPx(cleanVal, unitPx);
      if (px !== null) style.shiftYPx = (style.shiftYPx ?? 0) - px;
    } else if (key === 'shift' && cleanVal) {
      if (cleanVal.startsWith('(') && cleanVal.endsWith(')')) {
        const innerShift = cleanVal.slice(1, -1).trim();
        const coords = splitTopLevel(innerShift, ',');
        if (coords.length === 2) {
          const sx = parseLengthToTikzUnits(coords[0], unitPx) ?? evalMathExpr(coords[0], vars, false, customFuncs);
          const sy = parseLengthToTikzUnits(coords[1], unitPx) ?? evalMathExpr(coords[1], vars, false, customFuncs);
          if (sx !== null && sy !== null) {
            style.shiftX = (style.shiftX ?? 0) + sx;
            style.shiftY = (style.shiftY ?? 0) + sy;
          }
        }
      }
    } else if (key === 'label' && cleanVal) {
      style.labelSpec = cleanVal;
    } else if (key === 'font' && cleanVal) {
      if (cleanVal.includes('bf') || cleanVal.includes('bold')) style.fontWeight = 'bold';
      if (cleanVal.includes('small') || cleanVal.includes('footnotesize')) style.fontSize = 11.5;
      if (cleanVal.includes('tiny') || cleanVal.includes('scriptsize')) style.fontSize = 10;
      if (cleanVal.includes('large') || cleanVal.includes('Large')) style.fontSize = 15;
    } else if (key === 'inner sep' && cleanVal) {
      const px = parseLengthToPx(cleanVal, unitPx);
      if (px !== null) style.innerSep = px;
    } else if (key === 'rounded corners') {
      style.roundedCorners = cleanVal ? parseLengthToPx(cleanVal, unitPx) ?? 4 : 4;
    } else if (eqIdx === -1) {
      const c = resolveTikzColor(key, customColors);
      if (c) style.stroke = c;
    }
  }

  return style;
}

type TikzBasis3D = { x?: Point2D; y?: Point2D; z?: Point2D };

function resolveCalcVectorTerm(
  termRaw: string,
  namedCoords: Record<string, Point2D>,
  prevPoint: Point2D,
  vars: Record<string, number>,
  customFuncs: Record<string, CustomMathFunc>,
  basis?: TikzBasis3D
): Point2D | null {
  let rest = termRaw.trim();
  if (!rest) return null;

  // Optional leading scalar multiplier like `0.5*(A)` or `{1/3}*(B)`
  let scalar = 1;
  if (!rest.startsWith('(')) {
    let brace = 0;
    let paren = 0;
    let mulPos = -1;
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (ch === '{') brace++;
      else if (ch === '}') brace = Math.max(0, brace - 1);
      else if (ch === '(') paren++;
      else if (ch === ')') paren = Math.max(0, paren - 1);
      else if (ch === '*' && brace === 0 && paren === 0) {
        mulPos = i;
        break;
      }
    }
    if (mulPos === -1) return null;
    const scVal = evalMathExpr(rest.slice(0, mulPos), vars, false, customFuncs);
    if (scVal === null) return null;
    scalar = scVal;
    rest = rest.slice(mulPos + 1).trim();
  }

  if (!rest.startsWith('(')) return null;
  const p1Br = readBalanced(rest, 0, '(', ')');
  if (!p1Br) return null;
  const p1 = resolveCoordinateExpr(p1Br.content, namedCoords, prevPoint, false, vars, customFuncs, basis);
  if (!p1) return null;

  const after1 = rest.slice(p1Br.endIdx + 1).trim();
  if (!after1) {
    return { x: scalar * p1.x, y: scalar * p1.y };
  }

  // Distance / projection / rotated modifier: !(...)! or !t! or !t!angle:
  if (!after1.startsWith('!')) return null;

  // Scan top-level `!` inside after1 (outside (), {})
  const readUntilBang = (str: string, fromIdx: number): { val: string; bangIdx: number } | null => {
    let b = 0;
    let p = 0;
    for (let i = fromIdx; i < str.length; i++) {
      if (str[i] === '{') b++;
      else if (str[i] === '}') b = Math.max(0, b - 1);
      else if (str[i] === '(') p++;
      else if (str[i] === ')') p = Math.max(0, p - 1);
      else if (str[i] === '!' && b === 0 && p === 0) {
        return { val: str.slice(fromIdx, i).trim(), bangIdx: i };
      }
    }
    return null;
  };

  const midPart = readUntilBang(after1, 1);
  if (!midPart) return null;
  const modStr = midPart.val;
  let tail = after1.slice(midPart.bangIdx + 1).trim();

  // Optional rotation `angle:(p2)`
  let rotAngleDeg = 0;
  if (!tail.startsWith('(')) {
    let b = 0;
    let p = 0;
    let colonPos = -1;
    for (let i = 0; i < tail.length; i++) {
      if (tail[i] === '{') b++;
      else if (tail[i] === '}') b = Math.max(0, b - 1);
      else if (tail[i] === '(') p++;
      else if (tail[i] === ')') p = Math.max(0, p - 1);
      else if (tail[i] === ':' && b === 0 && p === 0) {
        colonPos = i;
        break;
      }
    }
    if (colonPos === -1) return null;
    const ang = evalMathExpr(tail.slice(0, colonPos), vars, false, customFuncs);
    if (ang === null) return null;
    rotAngleDeg = ang;
    tail = tail.slice(colonPos + 1).trim();
  }

  if (!tail.startsWith('(')) return null;
  const p2Br = readBalanced(tail, 0, '(', ')');
  if (!p2Br || tail.slice(p2Br.endIdx + 1).trim() !== '') return null;
  const p2 = resolveCoordinateExpr(p2Br.content, namedCoords, prevPoint, false, vars, customFuncs, basis);
  if (!p2) return null;

  // Orthogonal projection $(A)!(P)!(B)$
  if (modStr.startsWith('(') && modStr.endsWith(')')) {
    const pProjBr = readBalanced(modStr, 0, '(', ')');
    if (pProjBr && pProjBr.endIdx === modStr.length - 1) {
      const pProj = resolveCoordinateExpr(pProjBr.content, namedCoords, prevPoint, false, vars, customFuncs, basis);
      if (!pProj) return null;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len2 = dx * dx + dy * dy;
      if (len2 > 1e-9) {
        const t = ((pProj.x - p1.x) * dx + (pProj.y - p1.y) * dy) / len2;
        return { x: scalar * (p1.x + t * dx), y: scalar * (p1.y + t * dy) };
      }
    }
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const segLen = Math.hypot(dx, dy);
  let t: number | null = null;
  if (/[a-zA-Z]+$/.test(modStr)) {
    const distUnits = parseLengthToTikzUnits(modStr);
    if (distUnits !== null) {
      t = segLen > 1e-9 ? distUnits / segLen : 0;
    }
  }
  if (t === null) {
    t = evalMathExpr(modStr, vars, false, customFuncs);
  }
  if (t === null) return null;

  let vx = dx * t;
  let vy = dy * t;
  if (Math.abs(rotAngleDeg) > 1e-9) {
    const rad = (rotAngleDeg * Math.PI) / 180;
    const rx = vx * Math.cos(rad) - vy * Math.sin(rad);
    const ry = vx * Math.sin(rad) + vy * Math.cos(rad);
    vx = rx;
    vy = ry;
  }

  return { x: scalar * (p1.x + vx), y: scalar * (p1.y + vy) };
}

function resolveCoordinateExpr(
  rawCoord: string,
  namedCoords: Record<string, Point2D>,
  prevPoint: Point2D,
  isRelativeMove: boolean,
  vars: Record<string, number>,
  customFuncs: Record<string, CustomMathFunc> = {},
  basis?: TikzBasis3D
): Point2D | null {
  let s = rawCoord.trim();
  if (!s) return null;
  if (s.startsWith('(') && s.endsWith(')')) {
    const br = readBalanced(s, 0, '(', ')');
    if (br && br.endIdx === s.length - 1) s = br.content.trim();
  }
  if (s.startsWith('axis cs:')) s = s.slice('axis cs:'.length).trim();
  if (s.startsWith('canvas cs:')) s = s.slice('canvas cs:'.length).trim();
  if (s.startsWith('xyz cs:')) s = s.slice('xyz cs:'.length).trim();

  // Named coordinate (direct or with node anchor suffix like A.center, A.north east, A.90)
  if (namedCoords[s]) {
    return { ...namedCoords[s] };
  }
  const dotIdx = s.indexOf('.');
  if (dotIdx > 0 && !s.includes(',') && !s.includes(':') && !s.startsWith('$')) {
    const baseName = s.slice(0, dotIdx).trim();
    if (namedCoords[baseName]) {
      return { ...namedCoords[baseName] };
    }
  }

  // Barycentric coordinate system: `barycentric cs: A=1, B=1, C=1`
  if (/^barycentric\s+cs\s*:/i.test(s)) {
    const body = s.replace(/^barycentric\s+cs\s*:/i, '').trim();
    let wx = 0;
    let wy = 0;
    let wSum = 0;
    for (const item of splitTopLevel(body, ',')) {
      const eq = item.indexOf('=');
      if (eq === -1) continue;
      const pName = item.slice(0, eq).trim();
      const wVal = evalMathExpr(item.slice(eq + 1).trim(), vars, false, customFuncs);
      const pt = namedCoords[pName];
      if (pt && wVal !== null) {
        wx += pt.x * wVal;
        wy += pt.y * wVal;
        wSum += wVal;
      }
    }
    if (Math.abs(wSum) > 1e-9) {
      return { x: wx / wSum, y: wy / wSum };
    }
  }

  // Canvas/xyz polar cs: `canvas polar cs: angle=30, radius=2cm`
  if (/^(?:canvas|xyz)\s+polar\s+cs\s*:/i.test(s)) {
    const body = s.replace(/^(?:canvas|xyz)\s+polar\s+cs\s*:/i, '').trim();
    let angDeg: number | null = null;
    let rx: number | null = null;
    let ry: number | null = null;
    for (const item of splitTopLevel(body, ',')) {
      const eq = item.indexOf('=');
      if (eq === -1) continue;
      const k = item.slice(0, eq).trim().toLowerCase();
      const v = item.slice(eq + 1).trim();
      if (k === 'angle') angDeg = evalMathExpr(v, vars, false, customFuncs);
      else if (k === 'radius') {
        const r = parseLengthToTikzUnits(v) ?? evalMathExpr(v, vars, false, customFuncs);
        if (r !== null) { rx = r; ry = r; }
      } else if (k === 'x radius') rx = parseLengthToTikzUnits(v) ?? evalMathExpr(v, vars, false, customFuncs);
      else if (k === 'y radius') ry = parseLengthToTikzUnits(v) ?? evalMathExpr(v, vars, false, customFuncs);
    }
    if (angDeg !== null && rx !== null && ry !== null) {
      const r = (angDeg * Math.PI) / 180;
      const pt = { x: rx * Math.cos(r), y: ry * Math.sin(r) };
      return isRelativeMove ? { x: prevPoint.x + pt.x, y: prevPoint.y + pt.y } : pt;
    }
  }

  // Intersection cs: `intersection cs: first line={(A)--(B)}, second line={(C)--(D)}`
  if (/^intersection\s+cs\s*:/i.test(s)) {
    const body = s.replace(/^intersection\s+cs\s*:/i, '').trim();
    let line1 = '';
    let line2 = '';
    for (const item of splitTopLevel(body, ',')) {
      const eq = item.indexOf('=');
      if (eq === -1) continue;
      const k = item.slice(0, eq).trim().toLowerCase();
      let v = item.slice(eq + 1).trim();
      if (v.startsWith('{') && v.endsWith('}')) v = v.slice(1, -1).trim();
      if (k === 'first line') line1 = v;
      else if (k === 'second line') line2 = v;
    }
    if (line1 && line2) {
      const seg1 = splitTopLevel(line1, '--');
      const seg2 = splitTopLevel(line2, '--');
      if (seg1.length === 2 && seg2.length === 2) {
        const a1 = resolveCoordinateExpr(seg1[0], namedCoords, prevPoint, false, vars, customFuncs, basis);
        const a2 = resolveCoordinateExpr(seg1[1], namedCoords, prevPoint, false, vars, customFuncs, basis);
        const b1 = resolveCoordinateExpr(seg2[0], namedCoords, prevPoint, false, vars, customFuncs, basis);
        const b2 = resolveCoordinateExpr(seg2[1], namedCoords, prevPoint, false, vars, customFuncs, basis);
        if (a1 && a2 && b1 && b2) {
          const d1x = a2.x - a1.x;
          const d1y = a2.y - a1.y;
          const d2x = b2.x - b1.x;
          const d2y = b2.y - b1.y;
          const det = d1x * d2y - d1y * d2x;
          if (Math.abs(det) > 1e-9) {
            const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / det;
            return { x: a1.x + t * d1x, y: a1.y + t * d1y };
          }
        }
      }
    }
  }

  // Intersection: `intersection of P1--P2 and P3--P4`
  if (/^intersection\s+of\s+/i.test(s)) {
    const body = s.replace(/^intersection\s+of\s+/i, '').trim();
    const andParts = body.split(/\s+and\s+/i);
    if (andParts.length === 2) {
      const seg1 = splitTopLevel(andParts[0], '--');
      const seg2 = splitTopLevel(andParts[1], '--');
      if (seg1.length === 2 && seg2.length === 2) {
        const a1 = resolveCoordinateExpr(seg1[0], namedCoords, prevPoint, false, vars, customFuncs, basis);
        const a2 = resolveCoordinateExpr(seg1[1], namedCoords, prevPoint, false, vars, customFuncs, basis);
        const b1 = resolveCoordinateExpr(seg2[0], namedCoords, prevPoint, false, vars, customFuncs, basis);
        const b2 = resolveCoordinateExpr(seg2[1], namedCoords, prevPoint, false, vars, customFuncs, basis);
        if (a1 && a2 && b1 && b2) {
          const d1x = a2.x - a1.x;
          const d1y = a2.y - a1.y;
          const d2x = b2.x - b1.x;
          const d2y = b2.y - b1.y;
          const det = d1x * d2y - d1y * d2x;
          if (Math.abs(det) > 1e-9) {
            const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / det;
            return { x: a1.x + t * d1x, y: a1.y + t * d1y };
          }
        }
      }
    }
  }

  // Orthogonal intersection: (A |- B) -> (A.x, B.y), (A -| B) -> (B.x, A.y)
  const orthoParts = splitTopLevel(s, '|-');
  if (orthoParts.length === 2) {
    const p1 = resolveCoordinateExpr(orthoParts[0], namedCoords, prevPoint, false, vars, customFuncs, basis);
    const p2 = resolveCoordinateExpr(orthoParts[1], namedCoords, prevPoint, false, vars, customFuncs, basis);
    if (p1 && p2) return { x: p1.x, y: p2.y };
  }
  const orthoParts2 = splitTopLevel(s, '-|');
  if (orthoParts2.length === 2) {
    const p1 = resolveCoordinateExpr(orthoParts2[0], namedCoords, prevPoint, false, vars, customFuncs, basis);
    const p2 = resolveCoordinateExpr(orthoParts2[1], namedCoords, prevPoint, false, vars, customFuncs, basis);
    if (p1 && p2) return { x: p2.x, y: p1.y };
  }

  // Calc syntax: $(A)!0.5!(B)$, $(A)!1.5cm!(B)$, $(A)!0.5!90:(B)$, $(A)!(P)!(B)$, $(A) + 2*(B) - (C)$
  if (s.startsWith('$') && s.endsWith('$')) {
    const inner = s.slice(1, -1).trim();
    const terms: Array<{ sign: number; raw: string }> = [];
    let brace = 0;
    let bracket = 0;
    let paren = 0;
    let curSign = 1;
    let termStart = 0;

    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '{') brace++;
      else if (ch === '}') brace = Math.max(0, brace - 1);
      else if (ch === '[') bracket++;
      else if (ch === ']') bracket = Math.max(0, bracket - 1);
      else if (ch === '(') paren++;
      else if (ch === ')') paren = Math.max(0, paren - 1);
      else if ((ch === '+' || ch === '-') && brace === 0 && bracket === 0 && paren === 0) {
        const prev = inner.slice(termStart, i).trim();
        if (prev) {
          terms.push({ sign: curSign, raw: prev });
          curSign = ch === '-' ? -1 : 1;
          termStart = i + 1;
        } else {
          curSign *= ch === '-' ? -1 : 1;
          termStart = i + 1;
        }
      }
    }
    const lastTerm = inner.slice(termStart).trim();
    if (lastTerm) terms.push({ sign: curSign, raw: lastTerm });

    if (terms.length > 0) {
      let sumX = 0;
      let sumY = 0;
      let allOk = true;
      for (const term of terms) {
        const pt = resolveCalcVectorTerm(term.raw, namedCoords, prevPoint, vars, customFuncs, basis);
        if (!pt) {
          allOk = false;
          break;
        }
        sumX += term.sign * pt.x;
        sumY += term.sign * pt.y;
      }
      if (allOk) return { x: sumX, y: sumY };
    }
  }

  // Polar: (angle:radius) or elliptical polar (angle:rx and ry)
  const colonParts = splitTopLevel(s, ':');
  if (colonParts.length === 2) {
    const angDeg = evalMathExpr(colonParts[0], vars, false, customFuncs);
    const radRaw = colonParts[1].trim();
    const andM = radRaw.match(/^([\s\S]+?)\s+and\s+([\s\S]+)$/i);
    if (angDeg !== null && andM) {
      const rx = parseLengthToTikzUnits(andM[1]) ?? evalMathExpr(andM[1], vars, false, customFuncs);
      const ry = parseLengthToTikzUnits(andM[2]) ?? evalMathExpr(andM[2], vars, false, customFuncs);
      if (rx !== null && ry !== null) {
        const radAngle = (angDeg * Math.PI) / 180;
        const pt = { x: rx * Math.cos(radAngle), y: ry * Math.sin(radAngle) };
        return isRelativeMove ? { x: prevPoint.x + pt.x, y: prevPoint.y + pt.y } : pt;
      }
    }
    const rad =
      parseLengthToTikzUnits(radRaw) ?? evalMathExpr(radRaw, vars, false, customFuncs);
    if (angDeg !== null && rad !== null) {
      const radAngle = (angDeg * Math.PI) / 180;
      const pt = { x: rad * Math.cos(radAngle), y: rad * Math.sin(radAngle) };
      return isRelativeMove ? { x: prevPoint.x + pt.x, y: prevPoint.y + pt.y } : pt;
    }
  }

  // Cartesian 2D `(x, y)` or 3D `(x, y, z)` (with optional `x=..., y=..., z=...`)
  const xyParts = splitTopLevel(s, ',');
  if (xyParts.length === 2) {
    const rawX = xyParts[0].replace(/^\s*x\s*=\s*/i, '');
    const rawY = xyParts[1].replace(/^\s*y\s*=\s*/i, '');
    const x = parseLengthToTikzUnits(rawX) ?? evalMathExpr(rawX, vars, false, customFuncs);
    const y = parseLengthToTikzUnits(rawY) ?? evalMathExpr(rawY, vars, false, customFuncs);
    if (x !== null && y !== null) {
      let pt: Point2D;
      if (basis && (basis.x || basis.y)) {
        const bx = basis.x ?? { x: 1, y: 0 };
        const by = basis.y ?? { x: 0, y: 1 };
        pt = { x: x * bx.x + y * by.x, y: x * bx.y + y * by.y };
      } else {
        pt = { x, y };
      }
      return isRelativeMove ? { x: prevPoint.x + pt.x, y: prevPoint.y + pt.y } : pt;
    }
  } else if (xyParts.length === 3) {
    const rawX = xyParts[0].replace(/^\s*x\s*=\s*/i, '');
    const rawY = xyParts[1].replace(/^\s*y\s*=\s*/i, '');
    const rawZ = xyParts[2].replace(/^\s*z\s*=\s*/i, '');
    const x = parseLengthToTikzUnits(rawX) ?? evalMathExpr(rawX, vars, false, customFuncs);
    const y = parseLengthToTikzUnits(rawY) ?? evalMathExpr(rawY, vars, false, customFuncs);
    const z = parseLengthToTikzUnits(rawZ) ?? evalMathExpr(rawZ, vars, false, customFuncs);
    if (x !== null && y !== null && z !== null) {
      const bx = basis?.x ?? { x: 1, y: 0 };
      const by = basis?.y ?? { x: 0, y: 1 };
      const bz = basis?.z ?? { x: -0.385, y: -0.385 };
      const pt = {
        x: x * bx.x + y * by.x + z * bz.x,
        y: x * bx.y + y * by.y + z * bz.y,
      };
      return isRelativeMove ? { x: prevPoint.x + pt.x, y: prevPoint.y + pt.y } : pt;
    }
  }

  return null;
}

function getAnchorOffsets(anchor: string | undefined, w: number, h: number, pad = 7): {
  dx: number;
  dy: number;
  textAnchor: 'start' | 'middle' | 'end';
} {
  switch (anchor) {
    case 'above':
      return { dx: 0, dy: -pad - 3, textAnchor: 'middle' };
    case 'below':
      return { dx: 0, dy: pad + h * 0.85, textAnchor: 'middle' };
    case 'left':
      return { dx: -pad, dy: h * 0.32, textAnchor: 'end' };
    case 'right':
      return { dx: pad, dy: h * 0.32, textAnchor: 'start' };
    case 'above left':
      return { dx: -pad * 0.85, dy: -pad * 0.8, textAnchor: 'end' };
    case 'above right':
      return { dx: pad * 0.85, dy: -pad * 0.8, textAnchor: 'start' };
    case 'below left':
      return { dx: -pad * 0.85, dy: pad + h * 0.75, textAnchor: 'end' };
    case 'below right':
      return { dx: pad * 0.85, dy: pad + h * 0.75, textAnchor: 'start' };
    default:
      return { dx: 0, dy: h * 0.32, textAnchor: 'middle' };
  }
}

function sampleFunctionPlotSegments(
  dmn: [number, number],
  initialSamples: number,
  evalPoint: (t: number) => { x: number; y: number; sp: Point2D } | null,
  yMinPx: number,
  yMaxPx: number,
  spanYPx: number
): Point2D[][] {
  const segs: Point2D[][] = [];
  let curSeg: Point2D[] = [];

  const flushSeg = () => {
    if (curSeg.length >= 2) segs.push(curSeg);
    curSeg = [];
  };

  const rawSamples: Array<{ t: number; pt: { x: number; y: number; sp: Point2D } | null }> = [];
  for (let k = 0; k <= initialSamples; k++) {
    const t = dmn[0] + ((dmn[1] - dmn[0]) * k) / initialSamples;
    rawSamples.push({ t, pt: evalPoint(t) });
  }

  // Adaptively subdivide any step where vertical SVG motion is steep or crosses clip edge / asymptote
  const refined: Array<{ t: number; pt: { x: number; y: number; sp: Point2D } | null }> = [];
  const subdivide = (
    a: { t: number; pt: { x: number; y: number; sp: Point2D } | null },
    b: { t: number; pt: { x: number; y: number; sp: Point2D } | null },
    depth: number
  ) => {
    if (depth < 4 && a.pt && b.pt) {
      const dyPx = Math.abs(b.pt.sp.y - a.pt.sp.y);
      const aIn = a.pt.sp.y >= yMinPx && a.pt.sp.y <= yMaxPx;
      const bIn = b.pt.sp.y >= yMinPx && b.pt.sp.y <= yMaxPx;
      if ((aIn || bIn) && (dyPx > 28 || aIn !== bIn)) {
        const midT = (a.t + b.t) * 0.5;
        const mid = { t: midT, pt: evalPoint(midT) };
        subdivide(a, mid, depth + 1);
        subdivide(mid, b, depth + 1);
        return;
      }
    }
    refined.push(a);
  };

  for (let k = 0; k < rawSamples.length - 1; k++) {
    subdivide(rawSamples[k], rawSamples[k + 1], 0);
  }
  if (rawSamples.length > 0) refined.push(rawSamples[rawSamples.length - 1]);

  let prevPt: { x: number; y: number; sp: Point2D } | null = null;
  for (const sample of refined) {
    const pt = sample.pt;
    if (!pt || Math.abs(pt.sp.y) > 50000 || Math.abs(pt.sp.x) > 50000) {
      flushSeg();
      prevPt = null;
      continue;
    }

    const dSvgY = prevPt ? Math.abs(pt.sp.y - prevPt.sp.y) : 0;
    const isAsymptoteJump =
      prevPt !== null &&
      ((prevPt.y * pt.y < 0 && dSvgY > spanYPx * 0.42) || dSvgY > spanYPx * 0.85);

    if (isAsymptoteJump) {
      flushSeg();
      prevPt = pt;
      const spInRange = pt.sp.y >= yMinPx && pt.sp.y <= yMaxPx;
      if (spInRange) curSeg.push(pt.sp);
      continue;
    }

    const spInRange = pt.sp.y >= yMinPx && pt.sp.y <= yMaxPx;
    if (!spInRange) {
      if (curSeg.length > 0 && prevPt && prevPt.sp.y >= yMinPx && prevPt.sp.y <= yMaxPx) {
        const edgeY = pt.sp.y < yMinPx ? yMinPx : yMaxPx;
        const denom = pt.sp.y - prevPt.sp.y;
        if (Math.abs(denom) > 1e-6) {
          const frac = (edgeY - prevPt.sp.y) / denom;
          curSeg.push({
            x: prevPt.sp.x + (pt.sp.x - prevPt.sp.x) * frac,
            y: edgeY,
          });
        }
      }
      flushSeg();
      prevPt = pt;
      continue;
    }

    if (curSeg.length === 0 && prevPt && (prevPt.sp.y < yMinPx || prevPt.sp.y > yMaxPx)) {
      const edgeY = prevPt.sp.y < yMinPx ? yMinPx : yMaxPx;
      const denom = pt.sp.y - prevPt.sp.y;
      if (Math.abs(denom) > 1e-6) {
        const frac = (edgeY - prevPt.sp.y) / denom;
        curSeg.push({
          x: prevPt.sp.x + (pt.sp.x - prevPt.sp.x) * frac,
          y: edgeY,
        });
      }
    }

    curSeg.push(pt.sp);
    prevPt = pt;
  }
  flushSeg();
  return segs;
}

function renderAxisEnvToItems(
  axisOptsRaw: string,
  axisBody: string,
  unitPx: number,
  customColors: Record<string, string>,
  items: SvgItem[],
  arrowMarkerIds: Map<string, string>,
  patternsUsed: Map<string, string>,
  parentVars: Record<string, number> = {},
  parentCustomFuncs: Record<string, CustomMathFunc> = {}
): void {
  const vars: Record<string, number> = { ...parentVars };
  const customFuncs: Record<string, CustomMathFunc> = { ...parentCustomFuncs };

  const opts: Record<string, string> = {};
  for (const part of splitTopLevel(axisOptsRaw, ',')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      if (part.trim()) opts[part.trim()] = 'true';
    } else {
      const k = part.slice(0, eq).trim();
      let v = part.slice(eq + 1).trim();
      if (v.startsWith('{') && v.endsWith('}')) v = v.slice(1, -1).trim();
      opts[k] = v;
    }
  }

  if (opts['declare function']) {
    parseDeclareFunctionsSpec(opts['declare function'], customFuncs);
  }

  let xmin = opts.xmin ? evalMathExpr(opts.xmin, vars, false, customFuncs) ?? -5 : -5;
  let xmax = opts.xmax ? evalMathExpr(opts.xmax, vars, false, customFuncs) ?? 5 : 5;
  let ymin = opts.ymin ? evalMathExpr(opts.ymin, vars, false, customFuncs) ?? -5 : -5;
  let ymax = opts.ymax ? evalMathExpr(opts.ymax, vars, false, customFuncs) ?? 5 : 5;
  if (xmax <= xmin) xmax = xmin + 10;
  if (ymax <= ymin) ymax = ymin + 10;

  const plotW = 300;
  const plotH = 240;
  const toSvgX = (x: number) => ((x - xmin) / (xmax - xmin)) * plotW;
  const toSvgY = (y: number) => plotH - ((y - ymin) / (ymax - ymin)) * plotH;

  const ensureArrow = (color: string) => {
    if (!arrowMarkerIds.has(color)) {
      arrowMarkerIds.set(color, `arr_${arrowMarkerIds.size + 1}`);
    }
    return arrowMarkerIds.get(color)!;
  };

  // Grid
  if (opts.grid === 'major' || opts.grid === 'both') {
    const xStep = Math.max(0.5, Math.pow(10, Math.floor(Math.log10((xmax - xmin) / 5))));
    const yStep = Math.max(0.5, Math.pow(10, Math.floor(Math.log10((ymax - ymin) / 5))));
    for (let x = Math.ceil(xmin / xStep) * xStep; x <= xmax + 1e-6; x += xStep) {
      const sx = toSvgX(x);
      items.push({
        kind: 'line',
        svg: `<line x1="${sx.toFixed(1)}" y1="0" x2="${sx.toFixed(1)}" y2="${plotH}" stroke="#E2E8F0" stroke-width="0.8"/>`,
        bounds: { minX: sx, minY: 0, maxX: sx, maxY: plotH },
      });
    }
    for (let y = Math.ceil(ymin / yStep) * yStep; y <= ymax + 1e-6; y += yStep) {
      const sy = toSvgY(y);
      items.push({
        kind: 'line',
        svg: `<line x1="0" y1="${sy.toFixed(1)}" x2="${plotW}" y2="${sy.toFixed(1)}" stroke="#E2E8F0" stroke-width="0.8"/>`,
        bounds: { minX: 0, minY: sy, maxX: plotW, maxY: sy },
      });
    }
  }

  const axisLines = opts['axis lines'] || opts['axis x line'] || 'box';
  const isMiddle = axisLines === 'middle' || axisLines === 'center';
  const axisX = isMiddle ? toSvgY(0) : plotH;
  const axisY = isMiddle ? toSvgX(0) : 0;
  const arrId = ensureArrow('#0F172A');

  if (isMiddle) {
    if (ymin <= 0 && ymax >= 0) {
      items.push({
        kind: 'line',
        svg: `<line x1="0" y1="${axisX.toFixed(1)}" x2="${plotW}" y2="${axisX.toFixed(1)}" stroke="#0F172A" stroke-width="1.2" marker-end="url(#${arrId})"/>`,
        bounds: { minX: 0, minY: axisX - 4, maxX: plotW + 6, maxY: axisX + 4 },
      });
    }
    if (xmin <= 0 && xmax >= 0) {
      items.push({
        kind: 'line',
        svg: `<line x1="${axisY.toFixed(1)}" y1="${plotH}" x2="${axisY.toFixed(1)}" y2="0" stroke="#0F172A" stroke-width="1.2" marker-end="url(#${arrId})"/>`,
        bounds: { minX: axisY - 4, minY: -6, maxX: axisY + 4, maxY: plotH },
      });
    }
    if (xmin <= 0 && xmax >= 0 && ymin <= 0 && ymax >= 0) {
      items.push({
        kind: 'text',
        svg: `<text x="${(axisY - 8).toFixed(1)}" y="${(axisX + 14).toFixed(1)}" font-size="12" font-family="Times New Roman, serif" font-style="italic" text-anchor="end" fill="#0F172A">O</text>`,
        bounds: { minX: axisY - 18, minY: axisX + 2, maxX: axisY - 4, maxY: axisX + 16 },
      });
    }
  } else {
    items.push({
      kind: 'rect',
      svg: `<rect x="0" y="0" width="${plotW}" height="${plotH}" fill="none" stroke="#0F172A" stroke-width="1.1"/>`,
      bounds: { minX: 0, minY: 0, maxX: plotW, maxY: plotH },
    });
  }

  // Ticks
  const parseTicks = (spec: string | undefined, minV: number, maxV: number): number[] => {
    if (spec === '' || spec === '\\empty' || spec === 'none') return [];
    if (spec && spec !== 'true') {
      const out: number[] = [];
      for (const tok of spec.split(',')) {
        const v = evalMathExpr(tok, vars, false, customFuncs);
        if (v !== null && v >= minV - 1e-6 && v <= maxV + 1e-6) out.push(v);
      }
      if (out.length > 0) return out;
    }
    const span = maxV - minV;
    const rawStep = span / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const step = (norm <= 1.5 ? 1 : norm <= 3.5 ? 2 : norm <= 7.5 ? 5 : 10) * mag;
    const ticks: number[] = [];
    for (let v = Math.ceil(minV / step) * step; v <= maxV + 1e-9; v += step) {
      const r = Math.round(v * 1e6) / 1e6;
      if (!isMiddle || Math.abs(r) > 1e-6) ticks.push(r);
    }
    return ticks;
  };

  const xTickLabels = opts.xticklabels ? splitTopLevel(opts.xticklabels, ',').map((s) => s.trim()) : null;
  const yTickLabels = opts.yticklabels ? splitTopLevel(opts.yticklabels, ',').map((s) => s.trim()) : null;

  parseTicks(opts.xtick, xmin, xmax).forEach((xv, idx) => {
    const sx = toSvgX(xv);
    const ty = isMiddle && ymin <= 0 && ymax >= 0 ? axisX : plotH;
    items.push({
      kind: 'line',
      svg: `<line x1="${sx.toFixed(1)}" y1="${(ty - 3).toFixed(1)}" x2="${sx.toFixed(1)}" y2="${(ty + 3).toFixed(1)}" stroke="#0F172A" stroke-width="0.9"/>`,
      bounds: { minX: sx, minY: ty - 3, maxX: sx, maxY: ty + 3 },
    });
    const customLbl = xTickLabels?.[idx];
    const lblTspans = customLbl
      ? formatTikzLabelToSvg(customLbl, 11).tspans
      : escapeXmlAttr(String(xv).replace('-', '−'));
    items.push({
      kind: 'text',
      svg: `<text x="${sx.toFixed(1)}" y="${(ty + 15).toFixed(1)}" font-size="11" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">${lblTspans}</text>`,
      bounds: { minX: sx - 12, minY: ty + 4, maxX: sx + 12, maxY: ty + 18 },
    });
  });

  parseTicks(opts.ytick, ymin, ymax).forEach((yv, idx) => {
    const sy = toSvgY(yv);
    const tx = isMiddle && xmin <= 0 && xmax >= 0 ? axisY : 0;
    items.push({
      kind: 'line',
      svg: `<line x1="${(tx - 3).toFixed(1)}" y1="${sy.toFixed(1)}" x2="${(tx + 3).toFixed(1)}" y2="${sy.toFixed(1)}" stroke="#0F172A" stroke-width="0.9"/>`,
      bounds: { minX: tx - 3, minY: sy, maxX: tx + 3, maxY: sy },
    });
    const customLbl = yTickLabels?.[idx];
    const lblTspans = customLbl
      ? formatTikzLabelToSvg(customLbl, 11).tspans
      : escapeXmlAttr(String(yv).replace('-', '−'));
    items.push({
      kind: 'text',
      svg: `<text x="${(tx - 7).toFixed(1)}" y="${(sy + 4).toFixed(1)}" font-size="11" font-family="Times New Roman, serif" text-anchor="end" fill="#0F172A">${lblTspans}</text>`,
      bounds: { minX: tx - 26, minY: sy - 7, maxX: tx - 4, maxY: sy + 6 },
    });
  });

  // Axis labels & title
  if (opts.xlabel) {
    const f = formatTikzLabelToSvg(opts.xlabel, 13);
    const lx = isMiddle ? plotW + 10 : plotW / 2;
    const ly = isMiddle ? axisX + 4 : plotH + 28;
    items.push({
      kind: 'text',
      svg: `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="13" font-family="Times New Roman, serif" text-anchor="${isMiddle ? 'start' : 'middle'}" fill="#0F172A">${f.tspans}</text>`,
      bounds: { minX: lx - 15, minY: ly - 12, maxX: lx + 25, maxY: ly + 6 },
    });
  }
  if (opts.ylabel) {
    const f = formatTikzLabelToSvg(opts.ylabel, 13);
    const lx = isMiddle ? axisY + 8 : -28;
    const ly = isMiddle ? -6 : plotH / 2;
    items.push({
      kind: 'text',
      svg: `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="13" font-family="Times New Roman, serif" text-anchor="${isMiddle ? 'start' : 'middle'}" fill="#0F172A">${f.tspans}</text>`,
      bounds: { minX: lx - 12, minY: ly - 14, maxX: lx + 22, maxY: ly + 4 },
    });
  }
  if (opts.title) {
    const f = formatTikzLabelToSvg(opts.title, 14);
    items.push({
      kind: 'text',
      svg: `<text x="${(plotW / 2).toFixed(1)}" y="-14" font-size="14" font-weight="bold" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">${f.tspans}</text>`,
      bounds: { minX: 20, minY: -30, maxX: plotW - 20, maxY: -8 },
    });
  }

  // Parse statements inside axis (\addplot, \draw, \fill, \coordinate, \node)
  const trigRad = opts['trig format plots'] === 'rad' || opts['trig format'] === 'rad';
  const defaultDomain: [number, number] = (() => {
    if (opts.domain) {
      const dp = opts.domain.split(':');
      if (dp.length === 2) {
        const a = evalMathExpr(dp[0], vars, false, customFuncs);
        const b = evalMathExpr(dp[1], vars, false, customFuncs);
        if (a !== null && b !== null) return [a, b];
      }
    }
    return [xmin, xmax];
  })();
  const defaultSamples = opts.samples ? Math.max(10, Math.min(300, parseInt(opts.samples, 10) || 140)) : 140;
  const palette = ['#2563EB', '#DC2626', '#16A34A', '#9333EA', '#EA580C'];
  let plotCount = 0;

  const stmts = splitTopLevel(expandForeachLoops(axisBody, vars, customFuncs), ';');
  const clipId = `axis_clip_${items.length + 1}`;
  let clipRegistered = false;
  const ensureClip = () => {
    if (!clipRegistered) {
      clipRegistered = true;
      items.push({
        kind: 'path',
        svg: `<defs><clipPath id="${clipId}"><rect x="0" y="0" width="${plotW}" height="${plotH}"/></clipPath></defs>`,
        bounds: { minX: 0, minY: 0, maxX: plotW, maxY: plotH },
      });
    }
    return clipId;
  };

  const nonPlotStmts: string[] = [];

  for (const rawStmt of stmts) {
    const stmt = rawStmt.trim();
    if (!stmt) continue;

    const addPlotM = stmt.match(/^\\addplot3?\+?(?![a-zA-Z])/);
    if (addPlotM) {
      const { opts: pOptsRaw, nextIdx: afterPlotOpts } = readLeadingBracketOptions(
        stmt,
        addPlotM[0].length
      );
      const pBody = stmt.slice(afterPlotOpts).trim();
      const baseState: TikzScopeState = {
        scaleX: 1,
        scaleY: 1,
        shiftX: 0,
        shiftY: 0,
        rotateDeg: 0,
        color: palette[plotCount % palette.length],
        lineWidth: 1.8,
        fill: 'none',
        fillOpacity: 1,
      };
      plotCount++;
      const pStyle = parseOptionsString(pOptsRaw, baseState, customColors, unitPx, vars, customFuncs);
      const dmn = pStyle.domain ?? defaultDomain;
      const smp = Math.max(40, pStyle.samples ?? defaultSamples);
      let ptsList: Point2D[][] = [];

      if (/^coordinates\s*\{/.test(pBody)) {
        const br = readBalanced(pBody, pBody.indexOf('{'), '{', '}');
        if (br) {
          const cur: Point2D[] = [];
          let ci = 0;
          while (ci < br.content.length) {
            if (br.content[ci] === '(') {
              const cPar = readBalanced(br.content, ci, '(', ')');
              if (cPar) {
                const xy = splitTopLevel(cPar.content, ',');
                if (xy.length === 2) {
                  const px = evalMathExpr(xy[0], vars, false, customFuncs);
                  const py = evalMathExpr(xy[1], vars, false, customFuncs);
                  if (px !== null && py !== null) cur.push({ x: toSvgX(px), y: toSvgY(py) });
                }
                ci = cPar.endIdx + 1;
                continue;
              }
            }
            ci++;
          }
          if (cur.length > 0) ptsList.push(cur);
        }
      } else {
        let exprStr = pBody.replace(/^(?:expression\s*)?/, '').trim();
        if (exprStr.startsWith('{') && exprStr.endsWith('}')) {
          exprStr = exprStr.slice(1, -1).trim();
        }
        ptsList = sampleFunctionPlotSegments(
          dmn,
          smp,
          (t) => {
            const y = evalMathExpr(exprStr, { ...vars, x: t, t }, trigRad || Boolean(pStyle.trigRad), customFuncs);
            if (y === null || !Number.isFinite(y)) return null;
            return { x: t, y, sp: { x: toSvgX(t), y: toSvgY(y) } };
          },
          -15,
          plotH + 15,
          plotH
        );
      }

      const cid = ensureClip();
      const dashAttr = pStyle.dashArray ? ` stroke-dasharray="${pStyle.dashArray}"` : '';
      for (const seg of ptsList) {
        const dStr = seg
          .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
          .join(' ');
        items.push({
          kind: 'path',
          svg: `<path d="${dStr}" fill="none" stroke="${pStyle.stroke}" stroke-width="${pStyle.strokeWidth}"${dashAttr} stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${cid})"/>`,
          bounds: { minX: 0, minY: 0, maxX: plotW, maxY: plotH },
        });
      }
      continue;
    }

    nonPlotStmts.push(`${stmt};`);
  }

  if (nonPlotStmts.length > 0) {
    const axScaleX = plotW / ((xmax - xmin) * unitPx);
    const axScaleY = plotH / ((ymax - ymin) * unitPx);
    const axisScope: TikzScopeState = {
      scaleX: axScaleX,
      scaleY: axScaleY,
      shiftX: -xmin * axScaleX,
      shiftY: -ymax * axScaleY,
      rotateDeg: 0,
      color: '#0F172A',
      lineWidth: 1.2,
      fill: 'none',
      fillOpacity: 1,
      vars,
      customFuncs,
      trigRad,
    };
    executeTikzStatements(
      nonPlotStmts.join('\n'),
      axisScope,
      {},
      customColors,
      items,
      arrowMarkerIds,
      patternsUsed,
      unitPx
    );
  }
}

function renderTkzTabToItems(
  body: string,
  items: SvgItem[],
  arrowMarkerIds: Map<string, string>
): boolean {
  if (!/\\tkzTab(?:Init|Line|Var|Ima)/.test(body)) return false;

  // Parse \tkzTabInit[...]{rows}{xCols}
  const initM = /\\tkzTabInit(?:\s*\[([^\]]*)\])?\s*\{/.exec(body);
  if (!initM) return false;
  const rowsBr = readBalanced(body, initM.index + initM[0].length - 1, '{', '}');
  if (!rowsBr) return false;
  let pos = rowsBr.endIdx + 1;
  while (pos < body.length && /\s/.test(body[pos])) pos++;
  const xColsBr = body[pos] === '{' ? readBalanced(body, pos, '{', '}') : null;
  if (!xColsBr) return false;

  const rowSpecs = splitTopLevel(rowsBr.content, ',').map((r) => {
    const slashIdx = r.lastIndexOf('/');
    if (slashIdx === -1) return { label: r.trim(), hFactor: 1 };
    return {
      label: r.slice(0, slashIdx).trim(),
      hFactor: Math.max(0.8, parseFloat(r.slice(slashIdx + 1).trim()) || 1),
    };
  });
  const xLabels = splitTopLevel(xColsBr.content, ',').map((x) => x.trim());
  const numCols = Math.max(2, xLabels.length);

  const labelColW = 72;
  const colStepW = Math.max(72, Math.min(115, 420 / numCols));
  const totalW = labelColW + (numCols - 1) * colStepW + 56;
  const headerH = Math.round(34 * (rowSpecs[0]?.hFactor ?? 1));

  // Column X positions inside table
  const colX = (idx: number) => labelColW + 28 + idx * colStepW;

  let curY = 0;

  // Header row (x values)
  const hY = curY;
  const xHeader = formatTikzLabelToSvg(rowSpecs[0]?.label || '$x$', 13);
  items.push({
    kind: 'rect',
    svg: `<rect x="0" y="${hY}" width="${totalW}" height="${headerH}" fill="none" stroke="#0F172A" stroke-width="1.1"/>`,
    bounds: { minX: 0, minY: hY, maxX: totalW, maxY: hY + headerH },
  });
  items.push({
    kind: 'line',
    svg: `<line x1="${labelColW}" y1="${hY}" x2="${labelColW}" y2="${hY + headerH}" stroke="#0F172A" stroke-width="1.1"/>`,
    bounds: { minX: labelColW, minY: hY, maxX: labelColW, maxY: hY + headerH },
  });
  items.push({
    kind: 'text',
    svg: `<text x="${(labelColW / 2).toFixed(1)}" y="${(hY + headerH / 2 + 5).toFixed(1)}" font-size="13" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">${xHeader.tspans}</text>`,
    bounds: { minX: 4, minY: hY, maxX: labelColW - 4, maxY: hY + headerH },
  });

  xLabels.forEach((xl, idx) => {
    const f = formatTikzLabelToSvg(xl, 13);
    items.push({
      kind: 'text',
      svg: `<text x="${colX(idx).toFixed(1)}" y="${(hY + headerH / 2 + 5).toFixed(1)}" font-size="13" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">${f.tspans}</text>`,
      bounds: { minX: colX(idx) - 24, minY: hY, maxX: colX(idx) + 24, maxY: hY + headerH },
    });
  });

  curY += headerH;

  // Extract \tkzTabLine and \tkzTabVar in document order
  const cmdRe = /\\tkzTab(Line|Var|Ima)(?:\s*\[([^\]]*)\])?\s*\{/g;
  let cm: RegExpExecArray | null;
  let rowSpecIdx = 1;
  let lastVarYTop = 0;
  let lastVarYBot = 0;
  let lastVarRowH = 0;
  let lastVarNodes: Array<{ col: number; level: 'top' | 'mid' | 'bot' }> = [];

  if (!arrowMarkerIds.has('#0F172A')) {
    arrowMarkerIds.set('#0F172A', `arr_${arrowMarkerIds.size + 1}`);
  }
  const arrId = arrowMarkerIds.get('#0F172A')!;

  while ((cm = cmdRe.exec(body)) !== null) {
    const kind = cm[1];
    const br = readBalanced(body, cm.index + cm[0].length - 1, '{', '}');
    if (!br) continue;

    if (kind === 'Line') {
      const spec = rowSpecs[rowSpecIdx] ?? { label: "$f'(x)$", hFactor: 1 };
      rowSpecIdx++;
      const rowH = Math.round(34 * spec.hFactor);
      const rY = curY;

      items.push({
        kind: 'rect',
        svg: `<rect x="0" y="${rY}" width="${totalW}" height="${rowH}" fill="none" stroke="#0F172A" stroke-width="1.1"/>`,
        bounds: { minX: 0, minY: rY, maxX: totalW, maxY: rY + rowH },
      });
      items.push({
        kind: 'line',
        svg: `<line x1="${labelColW}" y1="${rY}" x2="${labelColW}" y2="${rY + rowH}" stroke="#0F172A" stroke-width="1.1"/>`,
        bounds: { minX: labelColW, minY: rY, maxX: labelColW, maxY: rY + rowH },
      });

      const lblF = formatTikzLabelToSvg(spec.label, 13);
      items.push({
        kind: 'text',
        svg: `<text x="${(labelColW / 2).toFixed(1)}" y="${(rY + rowH / 2 + 5).toFixed(1)}" font-size="13" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">${lblF.tspans}</text>`,
        bounds: { minX: 4, minY: rY, maxX: labelColW - 4, maxY: rY + rowH },
      });

      const tokens = splitTopLevel(br.content, ',').map((t) => {
        const s = t.trim();
        return s.startsWith('{') && s.endsWith('}') ? s.slice(1, -1).trim() : s;
      });
      // tkzTabLine format: even indices (0, 2, 4, ...) sit at x_0, x_1, x_2, ...;
      // odd indices (1, 3, 5, ...) sit in the interval between x_k and x_{k+1}.
      tokens.forEach((tok, idx) => {
        if (!tok) return;
        const isAtNode = idx % 2 === 0;
        const k = Math.floor(idx / 2);
        if (k >= numCols || (!isAtNode && k + 1 >= numCols)) return;
        const cx = isAtNode ? colX(k) : (colX(k) + colX(k + 1)) / 2;

        if (tok === 'd' || tok === 'D' || tok === '||' || tok === '\\|\\|') {
          items.push({
            kind: 'line',
            svg: `<line x1="${(cx - 2).toFixed(1)}" y1="${rY}" x2="${(cx - 2).toFixed(1)}" y2="${rY + rowH}" stroke="#0F172A" stroke-width="1.1"/><line x1="${(cx + 2).toFixed(1)}" y1="${rY}" x2="${(cx + 2).toFixed(1)}" y2="${rY + rowH}" stroke="#0F172A" stroke-width="1.1"/>`,
            bounds: { minX: cx - 3, minY: rY, maxX: cx + 3, maxY: rY + rowH },
          });
        } else if (tok === 'z') {
          items.push({
            kind: 'line',
            svg: `<line x1="${cx.toFixed(1)}" y1="${rY}" x2="${cx.toFixed(1)}" y2="${rY + rowH}" stroke="#0F172A" stroke-width="0.9"/>`,
            bounds: { minX: cx, minY: rY, maxX: cx, maxY: rY + rowH },
          });
          items.push({
            kind: 'rect',
            svg: `<rect x="${(cx - 5.5).toFixed(1)}" y="${(rY + rowH / 2 - 7.5).toFixed(1)}" width="11" height="15" fill="#FFFFFF" stroke="none"/>`,
            bounds: { minX: cx - 5.5, minY: rY + rowH / 2 - 7.5, maxX: cx + 5.5, maxY: rY + rowH / 2 + 7.5 },
          });
          items.push({
            kind: 'text',
            svg: `<text x="${cx.toFixed(1)}" y="${(rY + rowH / 2 + 5).toFixed(1)}" font-size="13" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">0</text>`,
            bounds: { minX: cx - 6, minY: rY, maxX: cx + 6, maxY: rY + rowH },
          });
        } else if (tok === 't') {
          items.push({
            kind: 'line',
            svg: `<line x1="${cx.toFixed(1)}" y1="${rY}" x2="${cx.toFixed(1)}" y2="${rY + rowH}" stroke="#64748B" stroke-width="0.9" stroke-dasharray="3,3"/>`,
            bounds: { minX: cx, minY: rY, maxX: cx, maxY: rY + rowH },
          });
        } else if (tok === 'h') {
          const xStart = isAtNode
            ? k === 0
              ? labelColW
              : colX(k) - 6
            : k === 0 && !tokens[0]
            ? labelColW
            : colX(k);
          const xEnd = isAtNode
            ? k === numCols - 1
              ? totalW
              : colX(k) + 6
            : k === numCols - 2 && !tokens[2 * (numCols - 1)]
            ? totalW
            : colX(k + 1);
          items.push({
            kind: 'rect',
            svg: `<rect x="${xStart.toFixed(1)}" y="${rY}" width="${Math.max(10, xEnd - xStart).toFixed(1)}" height="${rowH}" fill="url(#pat_ne)" stroke="none"/>`,
            bounds: { minX: xStart, minY: rY, maxX: xEnd, maxY: rY + rowH },
          });
        } else {
          const tf = formatTikzLabelToSvg(tok === '+' || tok === '-' ? `$${tok}$` : tok, 14);
          items.push({
            kind: 'text',
            svg: `<text x="${cx.toFixed(1)}" y="${(rY + rowH / 2 + 5).toFixed(1)}" font-size="14" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">${tf.tspans}</text>`,
            bounds: { minX: cx - 10, minY: rY, maxX: cx + 10, maxY: rY + rowH },
          });
        }
      });

      curY += rowH;
    } else if (kind === 'Var') {
      const spec = rowSpecs[rowSpecIdx] ?? { label: '$f(x)$', hFactor: 2 };
      rowSpecIdx++;
      const rowH = Math.round(44 * Math.max(1.6, spec.hFactor));
      const rY = curY;
      const topY = rY + 18;
      const botY = rY + rowH - 12;
      const midY = (topY + botY) / 2;
      lastVarYTop = topY;
      lastVarYBot = botY;
      lastVarRowH = rowH;
      lastVarNodes = [];

      items.push({
        kind: 'rect',
        svg: `<rect x="0" y="${rY}" width="${totalW}" height="${rowH}" fill="none" stroke="#0F172A" stroke-width="1.1"/>`,
        bounds: { minX: 0, minY: rY, maxX: totalW, maxY: rY + rowH },
      });
      items.push({
        kind: 'line',
        svg: `<line x1="${labelColW}" y1="${rY}" x2="${labelColW}" y2="${rY + rowH}" stroke="#0F172A" stroke-width="1.1"/>`,
        bounds: { minX: labelColW, minY: rY, maxX: labelColW, maxY: rY + rowH },
      });

      const lblF = formatTikzLabelToSvg(spec.label, 13);
      items.push({
        kind: 'text',
        svg: `<text x="${(labelColW / 2).toFixed(1)}" y="${(rY + rowH / 2 + 5).toFixed(1)}" font-size="13" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">${lblF.tspans}</text>`,
        bounds: { minX: 4, minY: rY, maxX: labelColW - 4, maxY: rY + rowH },
      });

      const varEntries = splitTopLevel(br.content, ',').map((t) => t.trim());
      interface VarPoint {
        col: number;
        x: number;
        y: number;
        level: 'top' | 'mid' | 'bot';
        offset?: number;
        skipArrow?: boolean;
      }
      const leftPts: Array<VarPoint | null> = [];
      const rightPts: Array<VarPoint | null> = [];

      varEntries.forEach((entry, idx) => {
        if (!entry || idx >= numCols) {
          leftPts.push(null);
          rightPts.push(null);
          return;
        }
        const cx = colX(idx);
        const parts = splitTopLevel(entry, '/');
        const tag = (parts[0] || '').trim();
        const val1 = (parts[1] || '').trim();
        const val2 = (parts[2] || '').trim();

        const yForChar = (ch: string): { y: number; level: 'top' | 'mid' | 'bot' } =>
          ch === '+'
            ? { y: topY, level: 'top' }
            : ch === '-'
            ? { y: botY, level: 'bot' }
            : { y: midY, level: 'mid' };

        if (/[DdH]|\|\|/.test(tag)) {
          // Double vertical bar discontinuity
          items.push({
            kind: 'line',
            svg: `<line x1="${(cx - 2).toFixed(1)}" y1="${rY}" x2="${(cx - 2).toFixed(1)}" y2="${rY + rowH}" stroke="#0F172A" stroke-width="1.1"/><line x1="${(cx + 2).toFixed(1)}" y1="${rY}" x2="${(cx + 2).toFixed(1)}" y2="${rY + rowH}" stroke="#0F172A" stroke-width="1.1"/>`,
            bounds: { minX: cx - 3, minY: rY, maxX: cx + 3, maxY: rY + rowH },
          });
          const chars = tag.replace(/[^+-]/g, '');
          const lInfo = yForChar(chars[0] || '+');
          const rInfo = yForChar(chars[1] || chars[0] || '-');
          let lWidth = 10;
          if (val1) {
            const f1 = formatTikzLabelToSvg(val1, 12);
            lWidth = Math.max(10, Math.min(28, f1.plainLength * 7.2));
            items.push({
              kind: 'text',
              svg: `<text x="${(cx - 7).toFixed(1)}" y="${lInfo.y.toFixed(1)}" font-size="12" font-family="Times New Roman, serif" text-anchor="end" fill="#0F172A">${f1.tspans}</text>`,
              bounds: { minX: cx - 7 - lWidth, minY: rY, maxX: cx - 4, maxY: rY + rowH },
            });
          }
          const rightLabel = val2 || (/^[DdH]/.test(tag) ? val1 : '');
          let rWidth = 10;
          if (rightLabel) {
            const f2 = formatTikzLabelToSvg(rightLabel, 12);
            rWidth = Math.max(10, Math.min(28, f2.plainLength * 7.2));
            items.push({
              kind: 'text',
              svg: `<text x="${(cx + 7).toFixed(1)}" y="${rInfo.y.toFixed(1)}" font-size="12" font-family="Times New Roman, serif" text-anchor="start" fill="#0F172A">${f2.tspans}</text>`,
              bounds: { minX: cx + 4, minY: rY, maxX: cx + 7 + rWidth, maxY: rY + rowH },
            });
          }
          leftPts.push({ col: idx, x: cx - 9 - lWidth, y: lInfo.y - 4, level: lInfo.level, offset: 0 });
          rightPts.push({ col: idx, x: cx + 9 + rWidth, y: rInfo.y - 4, level: rInfo.level, offset: 0 });
          lastVarNodes.push({ col: idx, level: lInfo.level });
        } else if (tag === 'R' || tag.startsWith('R')) {
          leftPts.push(null);
          rightPts.push(null);
        } else {
          const posChar = tag[0] === '+' || tag[0] === '-' ? tag[0] : '0';
          const info = yForChar(posChar);
          let halfW = 14;
          if (val1) {
            const f1 = formatTikzLabelToSvg(val1, 13);
            halfW = Math.max(12, Math.min(24, f1.plainLength * 4.2));
            items.push({
              kind: 'text',
              svg: `<text x="${cx.toFixed(1)}" y="${info.y.toFixed(1)}" font-size="13" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">${f1.tspans}</text>`,
              bounds: { minX: cx - halfW - 4, minY: rY, maxX: cx + halfW + 4, maxY: rY + rowH },
            });
          }
          const pt: VarPoint = { col: idx, x: cx, y: info.y - 4, level: info.level, offset: halfW + 3 };
          leftPts.push(pt);
          rightPts.push(pt);
          lastVarNodes.push({ col: idx, level: info.level });
        }
      });

      // Connect arrows between valid consecutive var points
      for (let idx = 0; idx < numCols - 1; idx++) {
        const p1 = rightPts[idx];
        const p2 = leftPts[idx + 1];
        if (!p1 || !p2) continue;
        const x1 = p1.x + (p1.offset ?? 8);
        const x2 = p2.x - (p2.offset ?? 8);
        if (x2 <= x1 + 4) continue;
        items.push({
          kind: 'line',
          svg: `<line x1="${x1.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#0F172A" stroke-width="1.2" marker-end="url(#${arrId})"/>`,
          bounds: { minX: x1, minY: rY, maxX: x2, maxY: rY + rowH },
        });
      }

      curY += rowH;
    } else if (kind === 'Ima') {
      // \tkzTabIma{startCol}{endCol}{posCol}{label}
      const imaMatch = /\\tkzTabIma(?:\s*\[[^\]]*\])?\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}/.exec(
        body.slice(cm.index)
      );
      if (imaMatch && lastVarRowH > 0) {
        const cStart = Math.max(0, (parseInt(imaMatch[1], 10) || 1) - 1);
        const cEnd = Math.max(0, (parseInt(imaMatch[2], 10) || 2) - 1);
        const cPos = Math.max(0, (parseInt(imaMatch[3], 10) || 1) - 1);
        const frac = cEnd !== cStart ? (cPos - cStart) / (cEnd - cStart) : 0.5;
        const nStart = lastVarNodes.find((n) => n.col === cStart);
        const nEnd = lastVarNodes.find((n) => n.col === cEnd);
        const yS = nStart?.level === 'top' ? lastVarYTop : nStart?.level === 'bot' ? lastVarYBot : (lastVarYTop + lastVarYBot) / 2;
        const yE = nEnd?.level === 'top' ? lastVarYTop : nEnd?.level === 'bot' ? lastVarYBot : (lastVarYTop + lastVarYBot) / 2;
        const iy = yS + (yE - yS) * frac;
        const ix = colX(cPos);
        const f = formatTikzLabelToSvg(imaMatch[4], 12);
        items.push({
          kind: 'rect',
          svg: `<rect x="${(ix - 12).toFixed(1)}" y="${(iy - 11).toFixed(1)}" width="24" height="15" fill="#FFFFFF" stroke="none"/>`,
          bounds: { minX: ix - 12, minY: iy - 11, maxX: ix + 12, maxY: iy + 4 },
        });
        items.push({
          kind: 'text',
          svg: `<text x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" font-size="12" font-family="Times New Roman, serif" text-anchor="middle" fill="#0F172A">${f.tspans}</text>`,
          bounds: { minX: ix - 12, minY: iy - 11, maxX: ix + 12, maxY: iy + 4 },
        });
      }
    }
  }

  return items.length > 0;
}

interface TikzExecContext {
  namedPaths: Record<string, Point2D[][]>;
  lastTkzPoints: Point2D[];
  lastTkzLength: number | null;
  tkzBounds: { xmin: number; xmax: number; ymin: number; ymax: number };
}

function createTikzExecContext(): TikzExecContext {
  return {
    namedPaths: {},
    lastTkzPoints: [],
    lastTkzLength: null,
    tkzBounds: { xmin: -4, xmax: 4, ymin: -4, ymax: 4 },
  };
}

function computeLineLineIntersection(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D
): Point2D | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const det = d1x * d2y - d1y * d2x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / det;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

function computeLineCircleIntersections(
  a1: Point2D,
  a2: Point2D,
  center: Point2D,
  r: number
): Point2D[] {
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const fx = a1.x - center.x;
  const fy = a1.y - center.y;
  const A = dx * dx + dy * dy;
  if (A < 1e-9 || r <= 0) return [];
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  let disc = B * B - 4 * A * C;
  if (disc < -1e-6) return [];
  if (disc < 0) disc = 0;
  const sq = Math.sqrt(disc);
  const t1 = (-B - sq) / (2 * A);
  const t2 = (-B + sq) / (2 * A);
  const p1 = { x: a1.x + t1 * dx, y: a1.y + t1 * dy };
  const p2 = { x: a1.x + t2 * dx, y: a1.y + t2 * dy };
  return Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1e-5 ? [p1] : [p1, p2];
}

function computeCircleCircleIntersections(
  c1: Point2D,
  r1: number,
  c2: Point2D,
  r2: number
): Point2D[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > r1 + r2 + 1e-6 || d < Math.abs(r1 - r2) - 1e-6) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = Math.max(0, r1 * r1 - a * a);
  const h = Math.sqrt(h2);
  const xm = c1.x + (a * dx) / d;
  const ym = c1.y + (a * dy) / d;
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  const p1 = { x: xm + rx, y: ym + ry };
  const p2 = { x: xm - rx, y: ym - ry };
  return h < 1e-5 ? [p1] : [p1, p2];
}

function computePolylineIntersections(pathsA: Point2D[][], pathsB: Point2D[][]): Point2D[] {
  const found: Point2D[] = [];
  const addUnique = (pt: Point2D) => {
    for (const ex of found) {
      if (Math.hypot(ex.x - pt.x, ex.y - pt.y) < 1e-3) return;
    }
    found.push(pt);
  };
  for (const polyA of pathsA) {
    for (let i = 0; i < polyA.length - 1; i++) {
      const a1 = polyA[i];
      const a2 = polyA[i + 1];
      const d1x = a2.x - a1.x;
      const d1y = a2.y - a1.y;
      for (const polyB of pathsB) {
        for (let j = 0; j < polyB.length - 1; j++) {
          const b1 = polyB[j];
          const b2 = polyB[j + 1];
          const d2x = b2.x - b1.x;
          const d2y = b2.y - b1.y;
          const det = d1x * d2y - d1y * d2x;
          if (Math.abs(det) < 1e-9) continue;
          const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / det;
          const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / det;
          if (t >= -1e-5 && t <= 1 + 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) {
            addUnique({ x: a1.x + t * d1x, y: a1.y + t * d1y });
          }
        }
      }
    }
  }
  return found;
}

function parseTkzPointGroups(raw: string): string[][] {
  const norm = raw.replace(/\s*,\s*/g, ',').trim();
  if (!norm) return [];
  return norm
    .split(/\s+/)
    .map((grp) => grp.split(',').map((s) => s.trim()).filter(Boolean))
    .filter((g) => g.length > 0);
}

function tryExecuteTkzCommand(
  src: string,
  cursor: number,
  scope: TikzScopeState,
  namedCoords: Record<string, Point2D>,
  customColors: Record<string, string>,
  items: SvgItem[],
  arrowMarkerIds: Map<string, string>,
  patternsUsed: Map<string, string>,
  unitPx: number,
  execCtx: TikzExecContext
): { nextCursor: number; injected?: string } | null {
  const rest = src.slice(cursor);
  const cmdM = rest.match(/^\\(tkz[A-Za-z]+)(?![a-zA-Z])/);
  if (!cmdM) return null;
  const cmd = cmdM[1];
  const vars = scope.vars || {};
  const customFuncs = scope.customFuncs || {};
  const basis: TikzBasis3D | undefined =
    scope.basisX || scope.basisY || scope.basisZ
      ? { x: scope.basisX, y: scope.basisY, z: scope.basisZ }
      : undefined;

  let p = cursor + cmdM[0].length;
  const { opts: optsRaw, nextIdx: afterOpts } = readLeadingBracketOptions(src, p);
  p = afterOpts;
  const skipWs = () => {
    while (p < src.length && /\s/.test(src[p])) p++;
  };
  const readParen = (): string | null => {
    skipWs();
    if (src[p] !== '(') return null;
    const br = readBalanced(src, p, '(', ')');
    if (!br) return null;
    p = br.endIdx + 1;
    return br.content;
  };
  const readBrace = (): string | null => {
    skipWs();
    if (src[p] !== '{') return null;
    const br = readBalanced(src, p, '{', '}');
    if (!br) return null;
    p = br.endIdx + 1;
    return br.content;
  };
  const consumeTrailingSemi = () => {
    let q = p;
    while (q < src.length && (src[q] === ' ' || src[q] === '\t')) q++;
    if (src[q] === ';') p = q + 1;
  };
  const resolvePt = (nameOrExpr: string, relTo?: Point2D): Point2D | null =>
    resolveCoordinateExpr(
      nameOrExpr,
      namedCoords,
      relTo ?? { x: 0, y: 0 },
      Boolean(relTo),
      vars,
      customFuncs,
      basis
    );
  const cleanTkzStyleOpts = (raw: string, stripKeys: string[] = []): string => {
    if (!raw.trim()) return '';
    return splitTopLevel(raw, ',')
      .map((s) => s.trim())
      .filter((s) => {
        if (!s) return false;
        const k = (s.includes('=') ? s.slice(0, s.indexOf('=')) : s).trim().toLowerCase();
        return !stripKeys.includes(k);
      })
      .join(', ');
  };

  // Setup / no-op tkz commands
  if (
    /^tkzSetUp/.test(cmd) ||
    cmd === 'tkzShowBB' ||
    cmd === 'tkzCompass' ||
    cmd === 'tkzCompasss' ||
    cmd === 'tkzReset' ||
    cmd === 'tkzUseLua'
  ) {
    while (p < src.length) {
      skipWs();
      if (src[p] === '(') { if (readParen() === null) break; continue; }
      if (src[p] === '{') { if (readBrace() === null) break; continue; }
      break;
    }
    consumeTrailingSemi();
    return { nextCursor: p };
  }

  // \tkzDefPoint[opts](x,y){A} or polar (ang:r){A}
  if (cmd === 'tkzDefPoint') {
    const coordExpr = readParen();
    const name = readBrace();
    if (coordExpr !== null && name !== null) {
      let basePt: Point2D = { x: 0, y: 0 };
      let isRel = false;
      const shiftM = optsRaw.match(/shift\s*=\s*\{?\(([^)]+)\)\}?/);
      if (shiftM) {
        const sPt = resolvePt(shiftM[1]);
        if (sPt) { basePt = sPt; isRel = true; }
      }
      const pt = resolveCoordinateExpr(coordExpr, namedCoords, basePt, isRel, vars, customFuncs, basis);
      if (pt) namedCoords[name.trim()] = pt;
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDefPoints[opts]{0/0/A, 4/0/B}
  if (cmd === 'tkzDefPoints') {
    const listStr = readBrace();
    if (listStr !== null) {
      let shiftPt: Point2D = { x: 0, y: 0 };
      const shiftM = optsRaw.match(/shift\s*=\s*\{?\(([^)]+)\)\}?/);
      if (shiftM) {
        const sPt = resolvePt(shiftM[1]);
        if (sPt) shiftPt = sPt;
      }
      for (const item of splitTopLevel(listStr, ',')) {
        const parts = splitTopLevel(item.trim(), '/');
        if (parts.length >= 3) {
          const x = evalMathExpr(parts[0], vars, false, customFuncs);
          const y = evalMathExpr(parts[1], vars, false, customFuncs);
          const nm = parts[2].trim();
          if (x !== null && y !== null && nm) {
            namedCoords[nm] = { x: x + shiftPt.x, y: y + shiftPt.y };
          }
        }
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDefShiftPoint[A](dx,dy){B} or \tkzDefShiftPoint[A](ang:r){B}
  if (cmd === 'tkzDefShiftPoint' || cmd === 'tkzDefShiftPointCoord') {
    const deltaExpr = readParen();
    const name = readBrace();
    if (deltaExpr !== null && name !== null) {
      const basePt = optsRaw.trim() ? resolvePt(optsRaw.trim()) : { x: 0, y: 0 };
      if (basePt) {
        const pt = resolveCoordinateExpr(deltaExpr, namedCoords, basePt, true, vars, customFuncs, basis);
        if (pt) namedCoords[name.trim()] = pt;
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDefMidPoint(A,B)
  if (cmd === 'tkzDefMidPoint') {
    const arg = readParen();
    if (arg !== null) {
      const pts = splitTopLevel(arg, ',').map((s) => resolvePt(s));
      if (pts.length >= 2 && pts[0] && pts[1]) {
        execCtx.lastTkzPoints = [{ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }];
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDefPointBy[translation=from A to B|homothety=...|rotation=...|symmetry=...|reflection=...|projection=...|midpoint](P)
  if (cmd === 'tkzDefPointBy') {
    const arg = readParen();
    if (arg !== null) {
      const inPts = splitTopLevel(arg, ',').map((s) => resolvePt(s)).filter((x): x is Point2D => Boolean(x));
      const o = optsRaw.trim();
      const results: Point2D[] = [];
      let m: RegExpMatchArray | null;
      if ((m = o.match(/translation\s*=\s*from\s+([^\s,]+)\s+to\s+([^\s,]+)/i))) {
        const pFrom = resolvePt(m[1]);
        const pTo = resolvePt(m[2]);
        if (pFrom && pTo) {
          for (const pt of inPts) results.push({ x: pt.x + (pTo.x - pFrom.x), y: pt.y + (pTo.y - pFrom.y) });
        }
      } else if ((m = o.match(/homothety\s*=\s*center\s+([^\s,]+)\s+ratio\s+([^,]+)/i))) {
        const ctr = resolvePt(m[1]);
        const k = evalMathExpr(m[2], vars, false, customFuncs);
        if (ctr && k !== null) {
          for (const pt of inPts) results.push({ x: ctr.x + k * (pt.x - ctr.x), y: ctr.y + k * (pt.y - ctr.y) });
        }
      } else if ((m = o.match(/rotation(?:\s+in\s+rad)?\s*=\s*center\s+([^\s,]+)\s+angle\s+([^,]+)/i))) {
        const ctr = resolvePt(m[1]);
        const ang = evalMathExpr(m[2], vars, false, customFuncs);
        if (ctr && ang !== null) {
          const rad = /in\s+rad/i.test(m[0]) ? ang : (ang * Math.PI) / 180;
          const ca = Math.cos(rad);
          const sa = Math.sin(rad);
          for (const pt of inPts) {
            const dx = pt.x - ctr.x;
            const dy = pt.y - ctr.y;
            results.push({ x: ctr.x + dx * ca - dy * sa, y: ctr.y + dx * sa + dy * ca });
          }
        }
      } else if ((m = o.match(/symmetry\s*=\s*center\s+([^\s,]+)/i))) {
        const ctr = resolvePt(m[1]);
        if (ctr) {
          for (const pt of inPts) results.push({ x: 2 * ctr.x - pt.x, y: 2 * ctr.y - pt.y });
        }
      } else if ((m = o.match(/reflection\s*=\s*over\s+([^,-]+)--([^,\s]+)/i))) {
        const la = resolvePt(m[1]);
        const lb = resolvePt(m[2]);
        if (la && lb) {
          const dx = lb.x - la.x;
          const dy = lb.y - la.y;
          const l2 = dx * dx + dy * dy;
          if (l2 > 1e-9) {
            for (const pt of inPts) {
              const t = ((pt.x - la.x) * dx + (pt.y - la.y) * dy) / l2;
              const hx = la.x + t * dx;
              const hy = la.y + t * dy;
              results.push({ x: 2 * hx - pt.x, y: 2 * hy - pt.y });
            }
          }
        }
      } else if ((m = o.match(/projection\s*=\s*onto\s+([^,-]+)--([^,\s]+)/i))) {
        const la = resolvePt(m[1]);
        const lb = resolvePt(m[2]);
        if (la && lb) {
          const dx = lb.x - la.x;
          const dy = lb.y - la.y;
          const l2 = dx * dx + dy * dy;
          if (l2 > 1e-9) {
            for (const pt of inPts) {
              const t = ((pt.x - la.x) * dx + (pt.y - la.y) * dy) / l2;
              results.push({ x: la.x + t * dx, y: la.y + t * dy });
            }
          }
        }
      } else if (/midpoint/i.test(o) && inPts.length >= 2) {
        results.push({ x: (inPts[0].x + inPts[1].x) / 2, y: (inPts[0].y + inPts[1].y) / 2 });
      } else if ((m = o.match(/inversion\s*=\s*center\s+([^\s,]+)\s+through\s+([^\s,]+)/i))) {
        const ctr = resolvePt(m[1]);
        const thr = resolvePt(m[2]);
        if (ctr && thr) {
          const r2 = (thr.x - ctr.x) ** 2 + (thr.y - ctr.y) ** 2;
          for (const pt of inPts) {
            const d2 = (pt.x - ctr.x) ** 2 + (pt.y - ctr.y) ** 2;
            if (d2 > 1e-9) {
              const f = r2 / d2;
              results.push({ x: ctr.x + f * (pt.x - ctr.x), y: ctr.y + f * (pt.y - ctr.y) });
            }
          }
        }
      }
      if (results.length > 0) execCtx.lastTkzPoints = results;
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDefPointWith[linear|orthogonal|colinear=at C, K=...](A,B)
  if (cmd === 'tkzDefPointWith') {
    const arg = readParen();
    if (arg !== null) {
      const pts = splitTopLevel(arg, ',').map((s) => resolvePt(s));
      if (pts.length >= 2 && pts[0] && pts[1]) {
        const pa = pts[0];
        const pb = pts[1];
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const normed = /\bnormed\b/i.test(optsRaw);
        const kM = optsRaw.match(/\bK\s*=\s*([^,\]]+)/i);
        const isLinear = /\blinear\b/i.test(optsRaw);
        const K = kM ? (evalMathExpr(kM[1], vars, false, customFuncs) ?? (isLinear ? 0.5 : 1)) : (isLinear ? 0.5 : 1);
        const ux = normed ? dx / len : dx;
        const uy = normed ? dy / len : dy;
        const colM = optsRaw.match(/colinear(?:\s+normed)?\s*=\s*at\s+([^\s,\]]+)/i);
        if (colM) {
          const pc = resolvePt(colM[1]);
          if (pc) execCtx.lastTkzPoints = [{ x: pc.x + K * ux, y: pc.y + K * uy }];
        } else if (/\borthogonal\b/i.test(optsRaw)) {
          execCtx.lastTkzPoints = [{ x: pa.x - K * uy, y: pa.y + K * ux }];
        } else {
          execCtx.lastTkzPoints = [{ x: pa.x + K * ux, y: pa.y + K * uy }];
        }
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDefBarycentricPoint(A=1,B=2,C=1)
  if (cmd === 'tkzDefBarycentricPoint') {
    const arg = readParen();
    if (arg !== null) {
      const pt = resolvePt(`barycentric cs: ${arg}`);
      if (pt) execCtx.lastTkzPoints = [pt];
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDefTriangleCenter[centroid|circum|ortho|in](A,B,C)
  if (cmd === 'tkzDefTriangleCenter') {
    const arg = readParen();
    if (arg !== null) {
      const pts = splitTopLevel(arg, ',').map((s) => resolvePt(s));
      if (pts.length >= 3 && pts[0] && pts[1] && pts[2]) {
        const [A, B, C] = [pts[0], pts[1], pts[2]];
        const mode = optsRaw.trim().toLowerCase();
        if (mode.includes('circum')) {
          const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
          if (Math.abs(d) > 1e-9) {
            const a2 = A.x * A.x + A.y * A.y;
            const b2 = B.x * B.x + B.y * B.y;
            const c2 = C.x * C.x + C.y * C.y;
            execCtx.lastTkzPoints = [{
              x: (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / d,
              y: (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / d,
            }];
          }
        } else if (mode.includes('ortho')) {
          const p1 = { x: A.x - (C.y - B.y), y: A.y + (C.x - B.x) };
          const p2 = { x: B.x - (A.y - C.y), y: B.y + (A.x - C.x) };
          const h = computeLineLineIntersection(A, p1, B, p2);
          if (h) execCtx.lastTkzPoints = [h];
        } else if (mode.includes('in')) {
          const a = Math.hypot(B.x - C.x, B.y - C.y);
          const b = Math.hypot(A.x - C.x, A.y - C.y);
          const c = Math.hypot(A.x - B.x, A.y - B.y);
          const s = a + b + c;
          if (s > 1e-9) {
            execCtx.lastTkzPoints = [{ x: (a * A.x + b * B.x + c * C.x) / s, y: (a * A.y + b * B.y + c * C.y) / s }];
          }
        } else {
          execCtx.lastTkzPoints = [{ x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 }];
        }
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDefLine[mediator|bisector|altitude|parallel=through C|perpendicular=through C](A,B[,C])
  if (cmd === 'tkzDefLine') {
    const arg = readParen();
    if (arg !== null) {
      const pts = splitTopLevel(arg, ',').map((s) => resolvePt(s)).filter((x): x is Point2D => Boolean(x));
      const o = optsRaw.trim();
      let m: RegExpMatchArray | null;
      if ((m = o.match(/parallel\s*=\s*through\s+([^\s,\]]+)/i)) && pts.length >= 2) {
        const pc = resolvePt(m[1]);
        if (pc) execCtx.lastTkzPoints = [{ x: pc.x + (pts[1].x - pts[0].x), y: pc.y + (pts[1].y - pts[0].y) }];
      } else if ((m = o.match(/(?:perpendicular|orthogonal)\s*=\s*through\s+([^\s,\]]+)/i)) && pts.length >= 2) {
        const pc = resolvePt(m[1]);
        if (pc) execCtx.lastTkzPoints = [{ x: pc.x - (pts[1].y - pts[0].y), y: pc.y + (pts[1].x - pts[0].x) }];
      } else if (/mediator/i.test(o) && pts.length >= 2) {
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const p2 = { x: mid.x - (pts[1].y - pts[0].y) * 0.5, y: mid.y + (pts[1].x - pts[0].x) * 0.5 };
        execCtx.lastTkzPoints = [mid, p2];
      } else if (/bisector/i.test(o) && pts.length >= 3) {
        const [A, B, C] = pts;
        const l1 = Math.hypot(A.x - B.x, A.y - B.y) || 1;
        const l2 = Math.hypot(C.x - B.x, C.y - B.y) || 1;
        const ux = (A.x - B.x) / l1 + (C.x - B.x) / l2;
        const uy = (A.y - B.y) / l1 + (C.y - B.y) / l2;
        execCtx.lastTkzPoints = [{ x: B.x + ux, y: B.y + uy }];
      } else if (/altitude/i.test(o) && pts.length >= 3) {
        const [A, B, C] = pts;
        const dx = C.x - A.x;
        const dy = C.y - A.y;
        const l2 = dx * dx + dy * dy;
        if (l2 > 1e-9) {
          const t = ((B.x - A.x) * dx + (B.y - A.y) * dy) / l2;
          execCtx.lastTkzPoints = [{ x: A.x + t * dx, y: A.y + t * dy }];
        }
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDefCircle[circum|in|diameter|radius|R](...)
  if (cmd === 'tkzDefCircle') {
    const arg = readParen();
    if (arg !== null) {
      const rawParts = splitTopLevel(arg, ',').map((s) => s.trim());
      const mode = optsRaw.toLowerCase();
      if (mode.includes('circum') && rawParts.length >= 3) {
        const [A, B, C] = rawParts.map((s) => resolvePt(s));
        if (A && B && C) {
          const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
          if (Math.abs(d) > 1e-9) {
            const a2 = A.x * A.x + A.y * A.y;
            const b2 = B.x * B.x + B.y * B.y;
            const c2 = C.x * C.x + C.y * C.y;
            const O = {
              x: (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / d,
              y: (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / d,
            };
            execCtx.lastTkzPoints = [O];
            execCtx.lastTkzLength = Math.hypot(A.x - O.x, A.y - O.y);
          }
        }
      } else if (mode.includes('in') && rawParts.length >= 3) {
        const [A, B, C] = rawParts.map((s) => resolvePt(s));
        if (A && B && C) {
          const a = Math.hypot(B.x - C.x, B.y - C.y);
          const b = Math.hypot(A.x - C.x, A.y - C.y);
          const c = Math.hypot(A.x - B.x, A.y - B.y);
          const s = a + b + c;
          if (s > 1e-9) {
            const O = { x: (a * A.x + b * B.x + c * C.x) / s, y: (a * A.y + b * B.y + c * C.y) / s };
            const area2 = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y));
            execCtx.lastTkzPoints = [O];
            execCtx.lastTkzLength = area2 / s;
          }
        }
      } else if (mode.includes('diameter') && rawParts.length >= 2) {
        const [A, B] = rawParts.map((s) => resolvePt(s));
        if (A && B) {
          execCtx.lastTkzPoints = [{ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }];
          execCtx.lastTkzLength = Math.hypot(B.x - A.x, B.y - A.y) / 2;
        }
      } else if (rawParts.length >= 2) {
        const O = resolvePt(rawParts[0]);
        const A = resolvePt(rawParts[1]);
        if (O) {
          execCtx.lastTkzPoints = [O];
          execCtx.lastTkzLength = A
            ? Math.hypot(A.x - O.x, A.y - O.y)
            : (parseLengthToTikzUnits(rawParts[1], unitPx) ?? evalMathExpr(rawParts[1], vars, false, customFuncs));
        }
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzCalcLength(A,B)
  if (cmd === 'tkzCalcLength') {
    const arg = readParen();
    if (arg !== null) {
      const pts = splitTopLevel(arg, ',').map((s) => resolvePt(s));
      if (pts.length >= 2 && pts[0] && pts[1]) {
        execCtx.lastTkzLength = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzInterLL(A,B)(C,D)
  if (cmd === 'tkzInterLL') {
    const arg1 = readParen();
    const arg2 = readParen();
    if (arg1 !== null && arg2 !== null) {
      const l1 = splitTopLevel(arg1, ',').map((s) => resolvePt(s));
      const l2 = splitTopLevel(arg2, ',').map((s) => resolvePt(s));
      if (l1[0] && l1[1] && l2[0] && l2[1]) {
        const inter = computeLineLineIntersection(l1[0], l1[1], l2[0], l2[1]);
        if (inter) execCtx.lastTkzPoints = [inter];
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzInterLC[R](A,B)(O,C_or_r)
  if (cmd === 'tkzInterLC') {
    const arg1 = readParen();
    const arg2 = readParen();
    if (arg1 !== null && arg2 !== null) {
      const l1 = splitTopLevel(arg1, ',').map((s) => resolvePt(s));
      const cParts = splitTopLevel(arg2, ',').map((s) => s.trim());
      const O = cParts[0] ? resolvePt(cParts[0]) : null;
      let r: number | null = null;
      if (O && cParts[1]) {
        if (/\bR\b/.test(optsRaw)) {
          r = parseLengthToTikzUnits(cParts[1], unitPx) ?? evalMathExpr(cParts[1], vars, false, customFuncs);
        } else {
          const P = resolvePt(cParts[1]);
          if (P) r = Math.hypot(P.x - O.x, P.y - O.y);
        }
      }
      if (l1[0] && l1[1] && O && r !== null) {
        const pts = computeLineCircleIntersections(l1[0], l1[1], O, r);
        if (pts.length > 0) execCtx.lastTkzPoints = pts;
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzInterCC[R](O,s1)(P,s2)
  if (cmd === 'tkzInterCC') {
    const arg1 = readParen();
    const arg2 = readParen();
    if (arg1 !== null && arg2 !== null) {
      const isR = /\bR\b/.test(optsRaw);
      const parseCirc = (raw: string): { c: Point2D; r: number } | null => {
        const cp = splitTopLevel(raw, ',').map((s) => s.trim());
        const c = cp[0] ? resolvePt(cp[0]) : null;
        if (!c || !cp[1]) return null;
        const r = isR
          ? (parseLengthToTikzUnits(cp[1], unitPx) ?? evalMathExpr(cp[1], vars, false, customFuncs))
          : (() => {
              const q = resolvePt(cp[1]);
              return q ? Math.hypot(q.x - c.x, q.y - c.y) : null;
            })();
        return r !== null ? { c, r } : null;
      };
      const c1 = parseCirc(arg1);
      const c2 = parseCirc(arg2);
      if (c1 && c2) {
        const pts = computeCircleCircleIntersections(c1.c, c1.r, c2.c, c2.r);
        if (pts.length > 0) execCtx.lastTkzPoints = pts;
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzGetPoint{M}, \tkzGetFirstPoint{M}, \tkzGetSecondPoint{N}, \tkzGetPoints{M}{N}, \tkzGetLength{r}
  if (cmd === 'tkzGetPoint' || cmd === 'tkzGetFirstPoint') {
    const nm = readBrace();
    if (nm !== null) {
      if (execCtx.lastTkzPoints[0]) namedCoords[nm.trim()] = { ...execCtx.lastTkzPoints[0] };
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }
  if (cmd === 'tkzGetSecondPoint') {
    const nm = readBrace();
    if (nm !== null) {
      const pt = execCtx.lastTkzPoints[1] ?? execCtx.lastTkzPoints[0];
      if (pt) namedCoords[nm.trim()] = { ...pt };
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }
  if (cmd === 'tkzGetPoints') {
    const n1 = readBrace();
    const n2 = readBrace();
    if (n1 !== null && n2 !== null) {
      if (execCtx.lastTkzPoints[0]) namedCoords[n1.trim()] = { ...execCtx.lastTkzPoints[0] };
      if (execCtx.lastTkzPoints[1]) namedCoords[n2.trim()] = { ...execCtx.lastTkzPoints[1] };
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }
  if (cmd === 'tkzGetLength') {
    const nm = readBrace();
    if (nm !== null) {
      if (execCtx.lastTkzLength !== null && scope.vars) {
        scope.vars[nm.trim().replace(/^\\/, '')] = execCtx.lastTkzLength;
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDrawPolygon / \tkzDrawPolygons / \tkzFillPolygon / \tkzClipPolygon
  if (
    cmd === 'tkzDrawPolygon' ||
    cmd === 'tkzDrawPolygons' ||
    cmd === 'tkzFillPolygon' ||
    cmd === 'tkzClipPolygon'
  ) {
    const arg = readParen();
    if (arg !== null) {
      const groups = cmd === 'tkzDrawPolygons' ? parseTkzPointGroups(arg) : [splitTopLevel(arg, ',').map((s) => s.trim()).filter(Boolean)];
      const drawCmd = cmd === 'tkzFillPolygon' ? '\\fill' : cmd === 'tkzClipPolygon' ? '\\clip' : '\\draw';
      const optStr = optsRaw ? `[${optsRaw}]` : '';
      const injected = groups
        .filter((g) => g.length >= 2 && g.every((nm) => Boolean(resolvePt(nm))))
        .map((g) => `${drawCmd}${optStr} ${g.map((nm) => `(${nm})`).join(' -- ')} -- cycle;`)
        .join('\n');
      consumeTrailingSemi();
      return { nextCursor: p, injected };
    }
  }

  // \tkzDrawSegment / \tkzDrawSegments
  if (cmd === 'tkzDrawSegment' || cmd === 'tkzDrawSegments') {
    const arg = readParen();
    if (arg !== null) {
      const groups = cmd === 'tkzDrawSegments' ? parseTkzPointGroups(arg) : [splitTopLevel(arg, ',').map((s) => s.trim()).filter(Boolean)];
      const optStr = optsRaw ? `[${optsRaw}]` : '';
      const injected = groups
        .filter((g) => g.length >= 2 && resolvePt(g[0]) && resolvePt(g[1]))
        .map((g) => `\\draw${optStr} (${g[0]}) -- (${g[1]});`)
        .join('\n');
      consumeTrailingSemi();
      return { nextCursor: p, injected };
    }
  }

  // \tkzDrawLine / \tkzDrawLines (with optional add=l and r)
  if (cmd === 'tkzDrawLine' || cmd === 'tkzDrawLines') {
    const arg = readParen();
    if (arg !== null) {
      const groups = cmd === 'tkzDrawLines' ? parseTkzPointGroups(arg) : [splitTopLevel(arg, ',').map((s) => s.trim()).filter(Boolean)];
      let addL = 0.2;
      let addR = 0.2;
      const addM = optsRaw.match(/add\s*=\s*([^\s,]+)\s+and\s+([^\s,\]]+)/i);
      if (addM) {
        addL = evalMathExpr(addM[1], vars, false, customFuncs) ?? 0.2;
        addR = evalMathExpr(addM[2], vars, false, customFuncs) ?? 0.2;
      }
      const cleanOpts = cleanTkzStyleOpts(optsRaw, ['add']);
      const optStr = cleanOpts ? `[${cleanOpts}]` : '';
      const lines: string[] = [];
      for (const g of groups) {
        if (g.length < 2) continue;
        const pa = resolvePt(g[0]);
        const pb = resolvePt(g[1]);
        if (!pa || !pb) continue;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const s1 = { x: pa.x - addL * dx, y: pa.y - addL * dy };
        const s2 = { x: pb.x + addR * dx, y: pb.y + addR * dy };
        lines.push(`\\draw${optStr} (${s1.x.toFixed(4)},${s1.y.toFixed(4)}) -- (${s2.x.toFixed(4)},${s2.y.toFixed(4)});`);
      }
      consumeTrailingSemi();
      return { nextCursor: p, injected: lines.join('\n') };
    }
  }

  // \tkzDrawCircle / \tkzDrawCircles / \tkzFillCircle / \tkzClipCircle
  if (
    cmd === 'tkzDrawCircle' ||
    cmd === 'tkzDrawCircles' ||
    cmd === 'tkzFillCircle' ||
    cmd === 'tkzClipCircle'
  ) {
    const arg = readParen();
    if (arg !== null) {
      const groups = cmd === 'tkzDrawCircles' ? parseTkzPointGroups(arg) : [splitTopLevel(arg, ',').map((s) => s.trim()).filter(Boolean)];
      const isR = /\bR\b/.test(optsRaw) || /\bradius\b/i.test(optsRaw);
      const isDiam = /\bdiameter\b/i.test(optsRaw);
      const cleanOpts = cleanTkzStyleOpts(optsRaw, ['r', 'radius', 'diameter', 'circum', 'in']);
      const optStr = cleanOpts ? `[${cleanOpts}]` : '';
      const drawCmd = cmd === 'tkzFillCircle' ? '\\fill' : cmd === 'tkzClipCircle' ? '\\clip' : '\\draw';
      const cmds: string[] = [];
      for (const g of groups) {
        if (g.length < 2) continue;
        const p1 = resolvePt(g[0]);
        if (!p1) continue;
        if (isDiam) {
          const p2 = resolvePt(g[1]);
          if (p2) {
            const cx = (p1.x + p2.x) / 2;
            const cy = (p1.y + p2.y) / 2;
            const r = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
            cmds.push(`${drawCmd}${optStr} (${cx.toFixed(4)},${cy.toFixed(4)}) circle (${r.toFixed(4)});`);
          }
        } else if (isR) {
          cmds.push(`${drawCmd}${optStr} (${p1.x.toFixed(4)},${p1.y.toFixed(4)}) circle (${g[1]});`);
        } else {
          const p2 = resolvePt(g[1]);
          if (p2) {
            const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            cmds.push(`${drawCmd}${optStr} (${p1.x.toFixed(4)},${p1.y.toFixed(4)}) circle (${r.toFixed(4)});`);
          }
        }
      }
      consumeTrailingSemi();
      return { nextCursor: p, injected: cmds.join('\n') };
    }
  }

  // \tkzDrawSemiCircle[opts](O,A) or [diameter](A,B)
  if (cmd === 'tkzDrawSemiCircle') {
    const arg = readParen();
    if (arg !== null) {
      const g = splitTopLevel(arg, ',').map((s) => s.trim());
      const p1 = g[0] ? resolvePt(g[0]) : null;
      const p2 = g[1] ? resolvePt(g[1]) : null;
      if (p1 && p2) {
        const isDiam = /\bdiameter\b/i.test(optsRaw);
        const ctr = isDiam ? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } : p1;
        const startPt = isDiam ? p1 : p2;
        const r = Math.hypot(startPt.x - ctr.x, startPt.y - ctr.y);
        const a1 = (Math.atan2(startPt.y - ctr.y, startPt.x - ctr.x) * 180) / Math.PI;
        const cleanOpts = cleanTkzStyleOpts(optsRaw, ['diameter']);
        const optStr = cleanOpts ? `[${cleanOpts}]` : '';
        consumeTrailingSemi();
        return {
          nextCursor: p,
          injected: `\\draw${optStr} (${startPt.x.toFixed(4)},${startPt.y.toFixed(4)}) arc (${a1.toFixed(3)}:${(a1 + 180).toFixed(3)}:${r.toFixed(4)});`,
        };
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDrawArc[opts](O,A)(B) or [R](O,r)(a1,a2) or \tkzFillSector
  if (cmd === 'tkzDrawArc' || cmd === 'tkzFillSector') {
    const arg1 = readParen();
    const arg2 = readParen();
    if (arg1 !== null && arg2 !== null) {
      const g1 = splitTopLevel(arg1, ',').map((s) => s.trim());
      const g2 = splitTopLevel(arg2, ',').map((s) => s.trim());
      const O = g1[0] ? resolvePt(g1[0]) : null;
      if (O && g1[1]) {
        const isR = /\bR\b/.test(optsRaw);
        const isAngles = /\bangles\b/i.test(optsRaw);
        let r: number | null = null;
        let a1: number | null = null;
        let a2: number | null = null;
        if (isR) {
          r = parseLengthToTikzUnits(g1[1], unitPx) ?? evalMathExpr(g1[1], vars, false, customFuncs);
          a1 = g2[0] ? evalMathExpr(g2[0], vars, false, customFuncs) : null;
          a2 = g2[1] ? evalMathExpr(g2[1], vars, false, customFuncs) : null;
        } else {
          const A = resolvePt(g1[1]);
          if (A) {
            r = Math.hypot(A.x - O.x, A.y - O.y);
            if (isAngles && g2.length >= 2) {
              a1 = evalMathExpr(g2[0], vars, false, customFuncs);
              a2 = evalMathExpr(g2[1], vars, false, customFuncs);
            } else {
              const B = g2[0] ? resolvePt(g2[0]) : null;
              if (B) {
                a1 = (Math.atan2(A.y - O.y, A.x - O.x) * 180) / Math.PI;
                a2 = (Math.atan2(B.y - O.y, B.x - O.x) * 180) / Math.PI;
                if (a2 < a1) a2 += 360;
              }
            }
          }
        }
        if (r !== null && r > 0 && a1 !== null && a2 !== null) {
          const sx = O.x + r * Math.cos((a1 * Math.PI) / 180);
          const sy = O.y + r * Math.sin((a1 * Math.PI) / 180);
          const cleanOpts = cleanTkzStyleOpts(optsRaw, ['r', 'angles', 'towards', 'rotate', 'delta', 'color']);
          const optStr = cleanOpts ? `[${cleanOpts}]` : '';
          const injected =
            cmd === 'tkzFillSector'
              ? `\\fill${optStr} (${O.x.toFixed(4)},${O.y.toFixed(4)}) -- (${sx.toFixed(4)},${sy.toFixed(4)}) arc (${a1.toFixed(3)}:${a2.toFixed(3)}:${r.toFixed(4)}) -- cycle;`
              : `\\draw${optStr} (${sx.toFixed(4)},${sy.toFixed(4)}) arc (${a1.toFixed(3)}:${a2.toFixed(3)}:${r.toFixed(4)});`;
          consumeTrailingSemi();
          return { nextCursor: p, injected };
        }
      }
      consumeTrailingSemi();
      return { nextCursor: p };
    }
  }

  // \tkzDrawPoint / \tkzDrawPoints (ONLY emits for resolved points!)
  if (cmd === 'tkzDrawPoint' || cmd === 'tkzDrawPoints') {
    const arg = readParen();
    if (arg !== null) {
      const cleanOpts = cleanTkzStyleOpts(optsRaw, ['size', 'shape']);
      const optStr = cleanOpts ? `[${cleanOpts}]` : '';
      const injected = splitTopLevel(arg, ',')
        .map((s) => s.trim())
        .filter((nm) => Boolean(nm && resolvePt(nm)))
        .map((nm) => `\\fill${optStr} (${nm}) circle (2pt);`)
        .join('\n');
      consumeTrailingSemi();
      return { nextCursor: p, injected };
    }
  }

  // \tkzLabelPoint[opts](A){label}
  if (cmd === 'tkzLabelPoint') {
    const arg = readParen();
    const lbl = readBrace();
    if (arg !== null && lbl !== null) {
      const nm = arg.trim();
      const optStr = optsRaw ? `[${optsRaw}]` : '[below]';
      const injected = resolvePt(nm) ? `\\node${optStr} at (${nm}) {${lbl}};` : '';
      consumeTrailingSemi();
      return { nextCursor: p, injected };
    }
  }

  // \tkzLabelPoints[opts](A,B,C)
  if (cmd === 'tkzLabelPoints') {
    const arg = readParen();
    if (arg !== null) {
      const optStr = optsRaw ? `[${optsRaw}]` : '[below]';
      const injected = splitTopLevel(arg, ',')
        .map((s) => s.trim())
        .filter((nm) => Boolean(nm && resolvePt(nm)))
        .map((nm) => `\\node${optStr} at (${nm}) {$${nm}$};`)
        .join('\n');
      consumeTrailingSemi();
      return { nextCursor: p, injected };
    }
  }

  // \tkzLabelSegment / \tkzLabelSegments
  if (cmd === 'tkzLabelSegment' || cmd === 'tkzLabelSegments') {
    const arg = readParen();
    const lbl = readBrace();
    if (arg !== null && lbl !== null) {
      const groups = cmd === 'tkzLabelSegments' ? parseTkzPointGroups(arg) : [splitTopLevel(arg, ',').map((s) => s.trim()).filter(Boolean)];
      const optStr = optsRaw ? `[${optsRaw}]` : '[midway, above]';
      const injected = groups
        .filter((g) => g.length >= 2 && resolvePt(g[0]) && resolvePt(g[1]))
        .map((g) => `\\path (${g[0]}) -- node${optStr} {${lbl}} (${g[1]});`)
        .join('\n');
      consumeTrailingSemi();
      return { nextCursor: p, injected };
    }
  }

  // \tkzText[opts](x,y){text}
  if (cmd === 'tkzText') {
    const arg = readParen();
    const lbl = readBrace();
    if (arg !== null && lbl !== null) {
      const optStr = optsRaw ? `[${optsRaw}]` : '';
      consumeTrailingSemi();
      return { nextCursor: p, injected: `\\node${optStr} at (${arg}) {${lbl}};` };
    }
  }

  // \tkzMarkRightAngle / \tkzMarkRightAngles
  if (cmd === 'tkzMarkRightAngle' || cmd === 'tkzMarkRightAngles') {
    const arg = readParen();
    if (arg !== null) {
      const groups = cmd === 'tkzMarkRightAngles' ? parseTkzPointGroups(arg) : [splitTopLevel(arg, ',').map((s) => s.trim()).filter(Boolean)];
      const szM = optsRaw.match(/\bsize\s*=\s*([^,\]]+)/i);
      const sz = szM ? (evalMathExpr(szM[1], vars, false, customFuncs) ?? 0.25) : 0.25;
      const cleanOpts = cleanTkzStyleOpts(optsRaw, ['size', 'german']);
      const optPrefix = cleanOpts ? `draw, angle radius=${(sz * unitPx).toFixed(1)}px, ${cleanOpts}` : `draw, thin, angle radius=${(sz * unitPx).toFixed(1)}px`;
      const injected = groups
        .filter((g) => g.length >= 3 && resolvePt(g[0]) && resolvePt(g[1]) && resolvePt(g[2]))
        .map((g) => `\\pic[${optPrefix}] {right angle = ${g[0]}--${g[1]}--${g[2]}};`)
        .join('\n');
      consumeTrailingSemi();
      return { nextCursor: p, injected };
    }
  }

  // \tkzMarkAngle / \tkzMarkAngles
  if (cmd === 'tkzMarkAngle' || cmd === 'tkzMarkAngles') {
    const arg = readParen();
    if (arg !== null) {
      const groups = cmd === 'tkzMarkAngles' ? parseTkzPointGroups(arg) : [splitTopLevel(arg, ',').map((s) => s.trim()).filter(Boolean)];
      const szM = optsRaw.match(/\bsize\s*=\s*([^,\]]+)/i);
      const sz = szM ? (parseLengthToPx(szM[1], unitPx) ?? 20) : 20;
      const arcM = optsRaw.match(/\barc\s*=\s*(l+)/i);
      const arcCount = arcM ? Math.min(3, arcM[1].length) : 1;
      const cleanOpts = cleanTkzStyleOpts(optsRaw, ['size', 'arc', 'mksize', 'mkpos', 'mark']);
      const cmds: string[] = [];
      for (const g of groups) {
        if (g.length < 3 || !resolvePt(g[0]) || !resolvePt(g[1]) || !resolvePt(g[2])) continue;
        for (let k = 0; k < arcCount; k++) {
          const radPx = Math.max(8, sz - k * 4);
          const optPart = cleanOpts
            ? `draw, angle radius=${radPx.toFixed(1)}px, ${cleanOpts}`
            : `draw, thin, angle radius=${radPx.toFixed(1)}px`;
          cmds.push(`\\pic[${optPart}] {angle = ${g[0]}--${g[1]}--${g[2]}};`);
        }
      }
      consumeTrailingSemi();
      return { nextCursor: p, injected: cmds.join('\n') };
    }
  }

  // \tkzMarkSegment / \tkzMarkSegments
  if (cmd === 'tkzMarkSegment' || cmd === 'tkzMarkSegments') {
    const arg = readParen();
    if (arg !== null) {
      const groups = cmd === 'tkzMarkSegments' ? parseTkzPointGroups(arg) : [splitTopLevel(arg, ',').map((s) => s.trim()).filter(Boolean)];
      const tickM = optsRaw.match(/(?:mark|s)\s*=\s*(\|+)/i);
      const nTicks = tickM ? Math.min(3, tickM[1].length) : 1;
      const cmds: string[] = [];
      for (const g of groups) {
        if (g.length < 2) continue;
        const pa = resolvePt(g[0]);
        const pb = resolvePt(g[1]);
        if (!pa || !pb) continue;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy * 0.1;
        const ny = ux * 0.1;
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        for (let k = 0; k < nTicks; k++) {
          const off = (k - (nTicks - 1) / 2) * 0.08;
          const cx = mx + ux * off;
          const cy = my + uy * off;
          cmds.push(`\\draw[thin] (${(cx - nx).toFixed(4)},${(cy - ny).toFixed(4)}) -- (${(cx + nx).toFixed(4)},${(cy + ny).toFixed(4)});`);
        }
      }
      consumeTrailingSemi();
      return { nextCursor: p, injected: cmds.join('\n') };
    }
  }

  // tkz-fct commands: \tkzInit, \tkzClip, \tkzDrawX, \tkzDrawY, \tkzAxeXY, \tkzFct
  if (cmd === 'tkzInit') {
    if (optsRaw) {
      for (const part of splitTopLevel(optsRaw, ',')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const k = part.slice(0, eq).trim();
        const v = evalMathExpr(part.slice(eq + 1).trim(), vars, false, customFuncs);
        if (v !== null) {
          if (k === 'xmin') execCtx.tkzBounds.xmin = v;
          else if (k === 'xmax') execCtx.tkzBounds.xmax = v;
          else if (k === 'ymin') execCtx.tkzBounds.ymin = v;
          else if (k === 'ymax') execCtx.tkzBounds.ymax = v;
        }
      }
    }
    consumeTrailingSemi();
    return { nextCursor: p };
  }
  if (cmd === 'tkzClip') {
    const b = execCtx.tkzBounds;
    consumeTrailingSemi();
    return { nextCursor: p, injected: `\\clip (${b.xmin},${b.ymin}) rectangle (${b.xmax},${b.ymax});` };
  }
  if (cmd === 'tkzDrawX') {
    const b = execCtx.tkzBounds;
    consumeTrailingSemi();
    return { nextCursor: p, injected: `\\draw[->] (${b.xmin},0) -- (${b.xmax},0) node[above left]{$x$};` };
  }
  if (cmd === 'tkzDrawY') {
    const b = execCtx.tkzBounds;
    consumeTrailingSemi();
    return { nextCursor: p, injected: `\\draw[->] (0,${b.ymin}) -- (0,${b.ymax}) node[left]{$y$};` };
  }
  if (cmd === 'tkzAxeXY' || cmd === 'tkzDrawXY') {
    const b = execCtx.tkzBounds;
    consumeTrailingSemi();
    return {
      nextCursor: p,
      injected: [
        `\\draw[->] (${b.xmin},0) -- (${b.xmax},0) node[above left]{$x$};`,
        `\\draw[->] (0,${b.ymin}) -- (0,${b.ymax}) node[left]{$y$};`,
        `\\node[below left] at (0,0) {$O$};`,
      ].join('\n'),
    };
  }
  if (cmd === 'tkzFct') {
    const exprStr = readBrace();
    if (exprStr !== null) {
      const b = execCtx.tkzBounds;
      const hasExplicitDomain = /\bdomain\s*=/.test(optsRaw);
      const o = hasExplicitDomain
        ? optsRaw
        : optsRaw
        ? `${optsRaw},domain=${b.xmin}:${b.xmax}`
        : `domain=${b.xmin}:${b.xmax}`;
      const normExpr = exprStr.replace(/\\x\b/g, 'x').replace(/\bx\b/g, '\\x');
      consumeTrailingSemi();
      return { nextCursor: p, injected: `\\draw[${o}] plot(\\x, {${normExpr}});` };
    }
  }

  // Fallback for any other unknown \tkz... command so it never swallows subsequent statements
  while (p < src.length) {
    skipWs();
    if (src[p] === '(') { if (readParen() === null) break; continue; }
    if (src[p] === '{') { if (readBrace() === null) break; continue; }
    break;
  }
  consumeTrailingSemi();
  return { nextCursor: p };
}

function parseDefineColorValue(
  model: string,
  spec: string,
  customColors: Record<string, string>
): string | null {
  const m = model.trim();
  const s = spec.trim();
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (r: number, g: number, b: number) =>
    `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;

  if (m === 'rgb') {
    const parts = s.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      return toHex(parts[0] * 255, parts[1] * 255, parts[2] * 255);
    }
  } else if (m === 'RGB') {
    const parts = s.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      return toHex(parts[0], parts[1], parts[2]);
    }
  } else if (m.toLowerCase() === 'html') {
    const clean = s.replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(clean)) return `#${clean}`;
    if (/^[0-9a-fA-F]{3}$/.test(clean)) {
      return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
    }
  } else if (m.toLowerCase() === 'gray') {
    const v = parseFloat(s);
    if (Number.isFinite(v)) {
      const g = m === 'Gray' ? (v / 15) * 255 : v * 255;
      return toHex(g, g, g);
    }
  } else if (m.toLowerCase() === 'cmyk') {
    const parts = s.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [c, mg, y, k] = parts;
      return toHex(255 * (1 - c) * (1 - k), 255 * (1 - mg) * (1 - k), 255 * (1 - y) * (1 - k));
    }
  } else if (m === 'named') {
    return resolveTikzColor(s, customColors) ?? null;
  }
  return resolveTikzColor(s, customColors) ?? null;
}

function getScopeBasis(sc: TikzScopeState): TikzBasis3D | undefined {
  if (sc.basisX || sc.basisY || sc.basisZ) {
    return { x: sc.basisX, y: sc.basisY, z: sc.basisZ };
  }
  return undefined;
}

function executeTikzStatements(
  rawBody: string,
  scope: TikzScopeState,
  namedCoords: Record<string, Point2D>,
  customColors: Record<string, string>,
  items: SvgItem[],
  arrowMarkerIds: Map<string, string>,
  patternsUsed: Map<string, string>,
  unitPx: number,
  execCtx: TikzExecContext = createTikzExecContext()
): void {
  if (!scope.vars) scope.vars = {};
  if (!scope.customFuncs) scope.customFuncs = {};
  if (!scope.customStyles) scope.customStyles = {};

  const scopeToSvgPt = (pt: Point2D, sc: TikzScopeState): Point2D => {
    let x = pt.x;
    let y = pt.y;
    if (sc.rotateAround && sc.rotateAround.deg !== 0) {
      const r = (sc.rotateAround.deg * Math.PI) / 180;
      const dx = x - sc.rotateAround.center.x;
      const dy = y - sc.rotateAround.center.y;
      x = sc.rotateAround.center.x + dx * Math.cos(r) - dy * Math.sin(r);
      y = sc.rotateAround.center.y + dx * Math.sin(r) + dy * Math.cos(r);
    }
    x = x * sc.scaleX + sc.shiftX;
    y = y * sc.scaleY + sc.shiftY;
    if (sc.rotateDeg !== 0) {
      const r = (sc.rotateDeg * Math.PI) / 180;
      const rx = x * Math.cos(r) - y * Math.sin(r);
      const ry = x * Math.sin(r) + y * Math.cos(r);
      x = rx;
      y = ry;
    }
    return {
      x: x * unitPx + (sc.shiftXPx ?? 0),
      y: -y * unitPx + (sc.shiftYPx ?? 0),
    };
  };
  const toSvgPt = (pt: Point2D): Point2D => scopeToSvgPt(pt, scope);

  const ensureArrow = (color: string) => {
    if (!arrowMarkerIds.has(color)) {
      arrowMarkerIds.set(color, `arr_${arrowMarkerIds.size + 1}`);
    }
    return arrowMarkerIds.get(color)!;
  };

  const ensurePattern = (patName: string, color: string) => {
    const key = `${patName}::${color}`;
    if (!patternsUsed.has(key)) {
      patternsUsed.set(key, `pat_${patternsUsed.size + 1}`);
    }
    return patternsUsed.get(key)!;
  };

  const emitNodeItem = (
    rawContent: string,
    nStyle: ReturnType<typeof parseOptionsString>,
    anchorPt: Point2D,
    toSvg: (pt: Point2D) => Point2D,
    targetList: SvgItem[] = items
  ) => {
    const sp = toSvg(anchorPt);
    const hasNodeFill = Boolean(nStyle.fill && nStyle.fill !== 'none');
    const hasNodeDraw = Boolean(nStyle.hasDraw);
    const trimmedContent = rawContent.trim();

    if (!trimmedContent) {
      if (hasNodeFill || hasNodeDraw) {
        const cx = sp.x + (nStyle.shiftXPx ?? 0) + (nStyle.shiftX ?? 0) * unitPx;
        const cy = sp.y + (nStyle.shiftYPx ?? 0) - (nStyle.shiftY ?? 0) * unitPx;
        const rad = Math.max(1.5, nStyle.innerSep ?? 2);
        const fillAttr = hasNodeFill ? nStyle.fill : 'none';
        const strokeAttr = hasNodeDraw ? nStyle.stroke : 'none';
        const swAttr = hasNodeDraw ? ` stroke-width="${nStyle.strokeWidth}"` : '';
        const dashAttr = hasNodeDraw && nStyle.dashArray ? ` stroke-dasharray="${nStyle.dashArray}"` : '';
        if (nStyle.circle || !hasNodeDraw) {
          targetList.push({
            kind: 'circle',
            svg: `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="${fillAttr}" stroke="${strokeAttr}"${swAttr}${dashAttr}/>`,
            bounds: { minX: cx - rad, minY: cy - rad, maxX: cx + rad, maxY: cy + rad },
          });
        } else {
          targetList.push({
            kind: 'rect',
            svg: `<rect x="${(cx - rad).toFixed(1)}" y="${(cy - rad).toFixed(1)}" width="${(rad * 2).toFixed(1)}" height="${(rad * 2).toFixed(1)}" fill="${fillAttr}" stroke="${strokeAttr}"${swAttr}${dashAttr}/>`,
            bounds: { minX: cx - rad, minY: cy - rad, maxX: cx + rad, maxY: cy + rad },
          });
        }
      }
      return;
    }

    const fs = nStyle.fontSize ?? 13;
    const f = formatTikzLabelToSvg(rawContent, fs);
    const anchorPad =
      nStyle.anchorDist !== undefined ? 2 + nStyle.anchorDist + (nStyle.innerSep ?? 1.5) : 7;
    const off = getAnchorOffsets(nStyle.anchor, fs, fs, anchorPad);
    const tx = sp.x + off.dx + (nStyle.shiftXPx ?? 0) + (nStyle.shiftX ?? 0) * unitPx;
    const ty = sp.y + off.dy + (nStyle.shiftYPx ?? 0) - (nStyle.shiftY ?? 0) * unitPx;
    const fw = nStyle.fontWeight ? ` font-weight="${nStyle.fontWeight}"` : '';
    const textW = Math.max(8, f.plainLength * fs * 0.56);
    const minTextX =
      off.textAnchor === 'middle'
        ? tx - textW / 2
        : off.textAnchor === 'end'
        ? tx - textW
        : tx;
    const maxTextX = minTextX + textW;
    const minTextY = ty - fs * 0.85;
    const maxTextY = ty + fs * 0.25;

    if (hasNodeFill || hasNodeDraw) {
      const boxPad = nStyle.innerSep ?? 3;
      const rx = minTextX - boxPad;
      const ry = minTextY - boxPad;
      const rw = textW + boxPad * 2;
      const rh = maxTextY - minTextY + boxPad * 2;
      const fillAttr = hasNodeFill ? nStyle.fill : 'none';
      const strokeAttr = hasNodeDraw ? nStyle.stroke : 'none';
      const swAttr = hasNodeDraw ? ` stroke-width="${nStyle.strokeWidth}"` : '';
      const dashAttr = hasNodeDraw && nStyle.dashArray ? ` stroke-dasharray="${nStyle.dashArray}"` : '';
      if (nStyle.circle) {
        const cx = rx + rw / 2;
        const cy = ry + rh / 2;
        const rad = Math.max(rw, rh) / 2 + 1;
        targetList.push({
          kind: 'circle',
          svg: `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="${fillAttr}" stroke="${strokeAttr}"${swAttr}${dashAttr}/>`,
          bounds: { minX: cx - rad, minY: cy - rad, maxX: cx + rad, maxY: cy + rad },
        });
      } else {
        const rxAttr = nStyle.roundedCorners ? ` rx="${nStyle.roundedCorners.toFixed(1)}"` : '';
        targetList.push({
          kind: 'rect',
          svg: `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="${fillAttr}" stroke="${strokeAttr}"${swAttr}${dashAttr}${rxAttr}/>`,
          bounds: { minX: rx, minY: ry, maxX: rx + rw, maxY: ry + rh },
        });
      }
    }

    targetList.push({
      kind: 'text',
      svg: `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${fs}" font-family="Times New Roman, serif"${fw} text-anchor="${off.textAnchor}" fill="${nStyle.stroke}">${f.tspans}</text>`,
      bounds: {
        minX: minTextX,
        minY: minTextY - 1,
        maxX: maxTextX,
        maxY: maxTextY + 1,
      },
    });
  };

  const renderPicSpec = (
    optsRaw: string,
    bodyStr: string,
    picAtCoord: string | undefined,
    activeScope: TikzScopeState,
    activeNamedCoords: Record<string, Point2D>,
    toSvg: (pt: Point2D) => Point2D,
    targetList: SvgItem[] = items
  ) => {
    const picBase: TikzScopeState = { ...activeScope, fill: 'none', lineWidth: Math.min(activeScope.lineWidth, 1.1) };
    const st = parseOptionsString(
      optsRaw,
      picBase,
      customColors,
      unitPx,
      activeScope.vars,
      activeScope.customFuncs
    );
    const activeBasis = getScopeBasis(activeScope);
    const angM = bodyStr.trim().match(/^(right\s+angle|angle)\s*=\s*([\s\S]+)$/i);
    if (angM) {
      const isRightAngle = /^right/i.test(angM[1]);
      const ptsRaw = splitTopLevel(angM[2], '--').map((t) => t.trim()).filter(Boolean);
      if (ptsRaw.length === 3) {
        const p1 = resolveCoordinateExpr(ptsRaw[0], activeNamedCoords, { x: 0, y: 0 }, false, activeScope.vars || {}, activeScope.customFuncs, activeBasis);
        const p2 = resolveCoordinateExpr(ptsRaw[1], activeNamedCoords, { x: 0, y: 0 }, false, activeScope.vars || {}, activeScope.customFuncs, activeBasis);
        const p3 = resolveCoordinateExpr(ptsRaw[2], activeNamedCoords, { x: 0, y: 0 }, false, activeScope.vars || {}, activeScope.customFuncs, activeBasis);
        if (p1 && p2 && p3) {
          const s1 = toSvg(p1);
          const s2 = toSvg(p2);
          const s3 = toSvg(p3);
          const d1x = s1.x - s2.x;
          const d1y = s1.y - s2.y;
          const d2x = s3.x - s2.x;
          const d2y = s3.y - s2.y;
          const l1 = Math.hypot(d1x, d1y);
          const l2 = Math.hypot(d2x, d2y);

          if (l1 > 1e-6 && l2 > 1e-6) {
            const doFill = Boolean(st.hasFill) || st.fill !== 'none' || Boolean(st.pattern);
            const doStroke =
              st.hasDraw === false
                ? false
                : Boolean(st.hasDraw) ||
                  Boolean(st.arrowStart || st.arrowEnd) ||
                  (isRightAngle && !doFill);
            const clipAttr = activeScope.clipId ? ` clip-path="url(#${activeScope.clipId})"` : '';
            const dashAttr = st.dashArray ? ` stroke-dasharray="${st.dashArray}"` : '';
            const opAttr = st.strokeOpacity < 1 ? ` stroke-opacity="${st.strokeOpacity}"` : '';
            const fillOpAttr = st.fillOpacity < 1 ? ` fill-opacity="${st.fillOpacity}"` : '';

            if (isRightAngle) {
              const sz = st.angleRadiusPx ?? 13.5;
              const ux = d1x / l1;
              const uy = d1y / l1;
              const vx = d2x / l2;
              const vy = d2y / l2;
              const pu = { x: s2.x + ux * sz, y: s2.y + uy * sz };
              const pv = { x: s2.x + vx * sz, y: s2.y + vy * sz };
              const puv = { x: pu.x + vx * sz, y: pu.y + vy * sz };
              const bMinX = Math.min(s2.x, pu.x, pv.x, puv.x) - 2;
              const bMinY = Math.min(s2.y, pu.y, pv.y, puv.y) - 2;
              const bMaxX = Math.max(s2.x, pu.x, pv.x, puv.x) + 2;
              const bMaxY = Math.max(s2.y, pu.y, pv.y, puv.y) + 2;

              if (doFill) {
                const dFill = `M ${s2.x.toFixed(2)} ${s2.y.toFixed(2)} L ${pu.x.toFixed(2)} ${pu.y.toFixed(2)} L ${puv.x.toFixed(2)} ${puv.y.toFixed(2)} L ${pv.x.toFixed(2)} ${pv.y.toFixed(2)} Z`;
                targetList.push({
                  kind: 'path',
                  svg: `<path d="${dFill}" fill="${st.fill}"${fillOpAttr} stroke="none"${clipAttr}/>`,
                  bounds: { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY },
                });
              }
              if (doStroke) {
                const dStroke = `M ${pu.x.toFixed(2)} ${pu.y.toFixed(2)} L ${puv.x.toFixed(2)} ${puv.y.toFixed(2)} L ${pv.x.toFixed(2)} ${pv.y.toFixed(2)}`;
                targetList.push({
                  kind: 'path',
                  svg: `<path d="${dStroke}" fill="none" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"${dashAttr}${opAttr} stroke-linecap="round" stroke-linejoin="round"${clipAttr}/>`,
                  bounds: { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY },
                });
              }
              if (st.picText) {
                const bx = ux + vx;
                const by = uy + vy;
                const bl = Math.hypot(bx, by) || 1;
                const ecc = st.angleEccentricity ?? 0.65;
                const lx = s2.x + (bx / bl) * sz * ecc;
                const ly = s2.y + (by / bl) * sz * ecc;
                const fs = st.fontSize ?? 12;
                const f = formatTikzLabelToSvg(st.picText, fs);
                const textW = Math.max(8, f.plainLength * fs * 0.56);
                targetList.push({
                  kind: 'text',
                  svg: `<text x="${lx.toFixed(1)}" y="${(ly + fs * 0.34).toFixed(1)}" font-size="${fs}" font-family="Times New Roman, serif" text-anchor="middle" fill="${st.stroke}">${f.tspans}</text>`,
                  bounds: { minX: lx - textW / 2, minY: ly - fs * 0.6, maxX: lx + textW / 2, maxY: ly + fs * 0.6 },
                });
              }
            } else {
              const radius = st.angleRadiusPx ?? 19;
              const a1 = Math.atan2(-d1y, d1x);
              const a2 = Math.atan2(-d2y, d2x);
              let sweep = a2 - a1;
              while (sweep < 0) sweep += 2 * Math.PI;
              if (sweep > 2 * Math.PI - 1e-4) sweep = 2 * Math.PI;

              const pStart = {
                x: s2.x + radius * Math.cos(a1),
                y: s2.y - radius * Math.sin(a1),
              };
              const pEnd = {
                x: s2.x + radius * Math.cos(a1 + sweep),
                y: s2.y - radius * Math.sin(a1 + sweep),
              };

              let minAX = Math.min(pStart.x, pEnd.x);
              let minAY = Math.min(pStart.y, pEnd.y);
              let maxAX = Math.max(pStart.x, pEnd.x);
              let maxAY = Math.max(pStart.y, pEnd.y);
              if (doFill) {
                minAX = Math.min(minAX, s2.x);
                minAY = Math.min(minAY, s2.y);
                maxAX = Math.max(maxAX, s2.x);
                maxAY = Math.max(maxAY, s2.y);
              }
              for (let k = 1; k < 16; k++) {
                const ang = a1 + (sweep * k) / 16;
                const px = s2.x + radius * Math.cos(ang);
                const py = s2.y - radius * Math.sin(ang);
                if (px < minAX) minAX = px;
                if (py < minAY) minAY = py;
                if (px > maxAX) maxAX = px;
                if (py > maxAY) maxAY = py;
              }

              const largeArc = sweep > Math.PI ? 1 : 0;
              const arcSeg =
                sweep >= 2 * Math.PI - 1e-3
                  ? `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 1 0 ${(s2.x - radius * Math.cos(a1)).toFixed(2)} ${(s2.y + radius * Math.sin(a1)).toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 1 0 ${pStart.x.toFixed(2)} ${pStart.y.toFixed(2)}`
                  : `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} 0 ${pEnd.x.toFixed(2)} ${pEnd.y.toFixed(2)}`;

              if (doFill) {
                const dWedge = `M ${s2.x.toFixed(2)} ${s2.y.toFixed(2)} L ${pStart.x.toFixed(2)} ${pStart.y.toFixed(2)} ${arcSeg} Z`;
                targetList.push({
                  kind: 'path',
                  svg: `<path d="${dWedge}" fill="${st.fill}"${fillOpAttr} stroke="none"${clipAttr}/>`,
                  bounds: { minX: minAX - 2, minY: minAY - 2, maxX: maxAX + 2, maxY: maxAY + 2 },
                });
              }
              if (doStroke) {
                const mStart = st.arrowStart ? ` marker-start="url(#${ensureArrow(st.stroke)})"` : '';
                const mEnd = st.arrowEnd ? ` marker-end="url(#${ensureArrow(st.stroke)})"` : '';
                const dArc = `M ${pStart.x.toFixed(2)} ${pStart.y.toFixed(2)} ${arcSeg}`;
                targetList.push({
                  kind: 'path',
                  svg: `<path d="${dArc}" fill="none" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"${dashAttr}${opAttr} stroke-linecap="round"${mStart}${mEnd}${clipAttr}/>`,
                  bounds: { minX: minAX - 3, minY: minAY - 3, maxX: maxAX + 3, maxY: maxAY + 3 },
                });
              }
              if (st.picText) {
                const txtStyle = st.picTextOpts
                  ? parseOptionsString(st.picTextOpts, { ...activeScope, fill: 'none' }, customColors, unitPx, activeScope.vars, activeScope.customFuncs)
                  : st;
                const ecc = st.angleEccentricity ?? 0.6;
                const aMid = a1 + sweep / 2;
                const lr = radius * ecc;
                const lx = s2.x + lr * Math.cos(aMid);
                const ly = s2.y - lr * Math.sin(aMid);
                const fs = txtStyle.fontSize ?? st.fontSize ?? 13;
                const f = formatTikzLabelToSvg(st.picText, fs);
                const textW = Math.max(8, f.plainLength * fs * 0.56);
                targetList.push({
                  kind: 'text',
                  svg: `<text x="${lx.toFixed(1)}" y="${(ly + fs * 0.34).toFixed(1)}" font-size="${fs}" font-family="Times New Roman, serif" text-anchor="middle" fill="${txtStyle.stroke}">${f.tspans}</text>`,
                  bounds: {
                    minX: lx - textW / 2,
                    minY: ly - fs * 0.65,
                    maxX: lx + textW / 2,
                    maxY: ly + fs * 0.55,
                  },
                });
              }
            }
          }
        }
      }
    } else if (picAtCoord) {
      const pt = resolveCoordinateExpr(picAtCoord, activeNamedCoords, { x: 0, y: 0 }, false, activeScope.vars || {}, activeScope.customFuncs, activeBasis);
      if (pt && st.picText) {
        emitNodeItem(st.picText, st, pt, toSvg, targetList);
      }
    }
  };

  // Parse flexible TikZ node header: any order of [opts], (name), at (coord) before {text}
  const parseNodeHeader = (
    str: string,
    afterKeywordIdx: number
  ): { opts: string; name?: string; atCoord?: string; text: string; endIdx: number } | null => {
    let p = afterKeywordIdx;
    const optParts: string[] = [];
    let name: string | undefined;
    let atCoord: string | undefined;
    while (p < str.length) {
      while (p < str.length && /\s/.test(str[p])) p++;
      if (str[p] === '[') {
        const brk = readBalanced(str, p, '[', ']');
        if (!brk) return null;
        optParts.push(brk.content);
        p = brk.endIdx + 1;
        continue;
      }
      if (str.startsWith('at', p) && !/[a-zA-Z0-9_]/.test(str[p + 2] || '')) {
        let q = p + 2;
        while (q < str.length && /\s/.test(str[q])) q++;
        if (str[q] === '(') {
          const par = readBalanced(str, q, '(', ')');
          if (!par) return null;
          atCoord = par.content;
          p = par.endIdx + 1;
          continue;
        }
      }
      if (str[p] === '(') {
        const par = readBalanced(str, p, '(', ')');
        if (!par) return null;
        name = par.content.trim();
        p = par.endIdx + 1;
        continue;
      }
      break;
    }
    while (p < str.length && /\s/.test(str[p])) p++;
    if (str[p] !== '{') return null;
    const textBr = readBalanced(str, p, '{', '}');
    if (!textBr) return null;
    return {
      opts: optParts.join(', '),
      name,
      atCoord,
      text: textBr.content,
      endIdx: textBr.endIdx,
    };
  };

  // Sequential source-order execution over blocks (axis, scope, font/layer envs, {...}), loops (\foreach),
  // tkz-euclide/tkz-fct commands, local definitions (\def, \pgfmathsetmacro, \tikzset, \tikzstyle, \definecolor),
  // and `;`-terminated statements.
  let src = rawBody;
  let cursor = 0;
  let loopSafety = 0;

  while (cursor < src.length && loopSafety < 4000) {
    loopSafety++;
    while (cursor < src.length && (/\s/.test(src[cursor]) || src[cursor] === ';')) cursor++;
    if (cursor >= src.length) break;

    const rest = src.slice(cursor);

    // 1. \begin{axis}[opts] ... \end{axis}
    const axisM = rest.match(/^\\begin\{axis\}/);
    if (axisM) {
      const { opts: axisOptsRaw, nextIdx: startInner } = readLeadingBracketOptions(
        src,
        cursor + axisM[0].length
      );
      const endIdx = src.indexOf('\\end{axis}', startInner);
      if (endIdx !== -1) {
        renderAxisEnvToItems(
          axisOptsRaw,
          src.slice(startInner, endIdx),
          unitPx,
          customColors,
          items,
          arrowMarkerIds,
          patternsUsed,
          scope.vars,
          scope.customFuncs
        );
        cursor = endIdx + '\\end{axis}'.length;
        continue;
      }
    }

    // 2. \begin{scope}[opts] ... \end{scope}
    const scopeM = rest.match(/^\\begin\{scope\}/);
    if (scopeM) {
      const { opts: scopeOptsRaw, nextIdx: startInner } = readLeadingBracketOptions(
        src,
        cursor + scopeM[0].length
      );
      let depth = 1;
      let scan = startInner;
      let foundEnd = -1;
      while (scan < src.length) {
        if (src.startsWith('\\begin{scope}', scan)) {
          depth++;
          scan += 13;
          continue;
        }
        if (src.startsWith('\\end{scope}', scan)) {
          depth--;
          if (depth === 0) {
            foundEnd = scan;
            break;
          }
          scan += 11;
          continue;
        }
        scan++;
      }
      if (foundEnd !== -1) {
        const st = parseOptionsString(scopeOptsRaw, scope, customColors, unitPx, scope.vars, scope.customFuncs);
        const childCustomFuncs = {
          ...(scope.customFuncs || {}),
          ...(st.customFuncs || {}),
        };
        const childCustomStyles = {
          ...(scope.customStyles || {}),
          ...(st.definedStyles || {}),
        };
        let basisX = st.basisX ?? scope.basisX;
        let basisY = st.basisY ?? scope.basisY;
        let basisZ = st.basisZ ?? scope.basisZ;
        if (st.useTdplotMainCoords && scope.tdplotTheta !== undefined && scope.tdplotPhi !== undefined) {
          const td = computeTdplotBasis(scope.tdplotTheta, scope.tdplotPhi);
          basisX = td.basisX;
          basisY = td.basisY;
          basisZ = td.basisZ;
        }
        const childScope: TikzScopeState = {
          ...scope,
          scaleX: scope.scaleX * (st.scaleX ?? 1),
          scaleY: scope.scaleY * (st.scaleY ?? 1),
          shiftX: scope.shiftX + (st.shiftX ?? 0),
          shiftY: scope.shiftY + (st.shiftY ?? 0),
          shiftXPx: (scope.shiftXPx ?? 0) + (st.shiftXPx ?? 0),
          shiftYPx: (scope.shiftYPx ?? 0) + (st.shiftYPx ?? 0),
          rotateDeg: scope.rotateDeg + (st.rotateDeg ?? 0),
          rotateAround: st.rotateAround ?? scope.rotateAround,
          color: st.stroke,
          lineWidth: st.strokeWidth,
          dashArray: st.dashArray,
          fill: st.fill,
          fillOpacity: st.fillOpacity,
          fontSize: st.fontSize ?? scope.fontSize,
          fontWeight: st.fontWeight ?? scope.fontWeight,
          vars: { ...(scope.vars || {}) },
          customFuncs: childCustomFuncs,
          customStyles: childCustomStyles,
          trigRad: st.trigRad ?? scope.trigRad,
          basisX,
          basisY,
          basisZ,
        };
        executeTikzStatements(
          src.slice(startInner, foundEnd),
          childScope,
          namedCoords,
          customColors,
          items,
          arrowMarkerIds,
          patternsUsed,
          unitPx,
          execCtx
        );
        cursor = foundEnd + '\\end{scope}'.length;
        continue;
      }
    }

    // 2b. Font-size or pgfonlayer environments inside tikzpicture (common in GeoGebra exports)
    const wrapperEnvM = rest.match(
      /^\\begin\{(scriptsize|footnotesize|small|tiny|normalsize|large|Large|LARGE|huge|pgfonlayer)\}/
    );
    if (wrapperEnvM) {
      const envName = wrapperEnvM[1];
      let startInner = cursor + wrapperEnvM[0].length;
      if (envName === 'pgfonlayer') {
        while (startInner < src.length && /\s/.test(src[startInner])) startInner++;
        if (src[startInner] === '{') {
          const layBr = readBalanced(src, startInner, '{', '}');
          if (layBr) startInner = layBr.endIdx + 1;
        }
      }
      const beginTok = `\\begin{${envName}}`;
      const endTok = `\\end{${envName}}`;
      let depth = 1;
      let scan = startInner;
      let foundEnd = -1;
      while (scan < src.length) {
        if (src.startsWith(beginTok, scan)) {
          depth++;
          scan += beginTok.length;
          continue;
        }
        if (src.startsWith(endTok, scan)) {
          depth--;
          if (depth === 0) {
            foundEnd = scan;
            break;
          }
          scan += endTok.length;
          continue;
        }
        scan++;
      }
      if (foundEnd !== -1) {
        const envFontMap: Record<string, number> = {
          tiny: 9,
          scriptsize: 10,
          footnotesize: 11,
          small: 12,
          normalsize: 13,
          large: 14,
          Large: 16,
          LARGE: 18,
          huge: 20,
        };
        const childScope: TikzScopeState = {
          ...scope,
          fontSize: envFontMap[envName] ?? scope.fontSize,
          vars: { ...(scope.vars || {}) },
          customFuncs: { ...(scope.customFuncs || {}) },
          customStyles: { ...(scope.customStyles || {}) },
        };
        executeTikzStatements(
          src.slice(startInner, foundEnd),
          childScope,
          namedCoords,
          customColors,
          items,
          arrowMarkerIds,
          patternsUsed,
          unitPx,
          execCtx
        );
        cursor = foundEnd + endTok.length;
        continue;
      }
    }

    // 3. Bare `{ ... }` grouping block
    if (src[cursor] === '{') {
      const grp = readBalanced(src, cursor, '{', '}');
      if (grp) {
        const childScope: TikzScopeState = {
          ...scope,
          vars: { ...(scope.vars || {}) },
          customFuncs: { ...(scope.customFuncs || {}) },
          customStyles: { ...(scope.customStyles || {}) },
        };
        executeTikzStatements(
          grp.content,
          childScope,
          namedCoords,
          customColors,
          items,
          arrowMarkerIds,
          patternsUsed,
          unitPx,
          execCtx
        );
        cursor = grp.endIdx + 1;
        continue;
      }
    }

    // 4. \foreach loop (expand in place using active scope vars, then continue executing)
    const foreachM = rest.match(/^\\foreach\s+(\\[a-zA-Z]+(?:\s*\/\s*\\[a-zA-Z]+)*)/);
    if (foreachM) {
      let feScan = cursor + foreachM[0].length;
      const { nextIdx: afterFeOpts } = readLeadingBracketOptions(src, feScan);
      feScan = afterFeOpts;
      while (feScan < src.length && /\s/.test(src[feScan])) feScan++;
      if (src.startsWith('in', feScan) && !/[a-zA-Z]/.test(src[feScan + 2] || '')) {
        feScan += 2;
        while (feScan < src.length && /\s/.test(src[feScan])) feScan++;
        if (src[feScan] === '{') {
          const listBr = readBalanced(src, feScan, '{', '}');
          if (listBr) {
            let endLoopPos = listBr.endIdx + 1;
            while (endLoopPos < src.length && /\s/.test(src[endLoopPos])) endLoopPos++;
            if (src[endLoopPos] === '{') {
              const bBr = readBalanced(src, endLoopPos, '{', '}');
              if (bBr) endLoopPos = bBr.endIdx + 1;
            } else {
              endLoopPos = findForeachStatementEnd(src, endLoopPos);
            }
            const chunkToExpand = src.slice(cursor, endLoopPos);
            const expandedChunk = expandForeachLoops(chunkToExpand, scope.vars, scope.customFuncs);
            src = src.slice(0, cursor) + expandedChunk + src.slice(endLoopPos);
            continue;
          }
        }
      }
    }

    // 4b. tkz-euclide / tkz-fct commands (executed in exact source order)
    if (rest.startsWith('\\tkz')) {
      const tkzRes = tryExecuteTkzCommand(
        src,
        cursor,
        scope,
        namedCoords,
        customColors,
        items,
        arrowMarkerIds,
        patternsUsed,
        unitPx,
        execCtx
      );
      if (tkzRes) {
        cursor = tkzRes.nextCursor;
        if (tkzRes.injected) {
          src = src.slice(0, cursor) + '\n' + tkzRes.injected + '\n' + src.slice(cursor);
        }
        continue;
      }
    }

    // 5. Local function / variable / style / color definitions (semicolon-less commands)
    const defFnM = rest.match(/^\\(?:g|e|x)?def\s*\\([a-zA-Z]+)\s*\(([^)]*)\)\s*\{/);
    if (defFnM) {
      const fnBr = readBalanced(src, cursor + defFnM[0].length - 1, '{', '}');
      if (fnBr) {
        const rawParams = defFnM[2]
          .split(',')
          .map((p) => p.trim().replace(/^#/, 'p'))
          .filter(Boolean);
        let bodyExpr = fnBr.content.trim();
        defFnM[2]
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .forEach((rawP, idx) => {
            const paramName = rawParams[idx];
            if (rawP.startsWith('#')) {
              bodyExpr = bodyExpr.replace(new RegExp(rawP.replace('#', '#'), 'g'), paramName);
            }
          });
        scope.customFuncs[defFnM[1]] = { params: rawParams, bodyExpr };
        cursor = fnBr.endIdx + 1;
        continue;
      }
    }

    const pgfMacroM = rest.match(
      /^\\pgfmath(set|truncate|setlength)macro\s*(?:\{\\([a-zA-Z]+)\}|\\([a-zA-Z]+))\s*\{/
    );
    if (pgfMacroM) {
      const valBr = readBalanced(src, cursor + pgfMacroM[0].length - 1, '{', '}');
      if (valBr) {
        const varName = pgfMacroM[2] || pgfMacroM[3];
        let val =
          pgfMacroM[1] === 'setlength'
            ? parseLengthToTikzUnits(valBr.content, unitPx) ??
              evalMathExpr(valBr.content, scope.vars, Boolean(scope.trigRad), scope.customFuncs)
            : evalMathExpr(valBr.content, scope.vars, Boolean(scope.trigRad), scope.customFuncs);
        if (val !== null) {
          if (pgfMacroM[1] === 'truncate') val = Math.trunc(val);
          scope.vars[varName] = val;
        }
        cursor = valBr.endIdx + 1;
        continue;
      }
    }

    const pgfParseM = rest.match(/^\\pgfmathparse\s*\{/);
    if (pgfParseM) {
      const valBr = readBalanced(src, cursor + pgfParseM[0].length - 1, '{', '}');
      if (valBr) {
        const val = evalMathExpr(valBr.content, scope.vars, Boolean(scope.trigRad), scope.customFuncs);
        if (val !== null) scope.vars['pgfmathresult'] = val;
        cursor = valBr.endIdx + 1;
        continue;
      }
    }

    const pgfDeclM = rest.match(/^\\pgfmathdeclarefunction\s*\{([^}]+)\}\s*\{(\d+)\}\s*\{/);
    if (pgfDeclM) {
      const bodyBr = readBalanced(src, cursor + pgfDeclM[0].length - 1, '{', '}');
      if (bodyBr) {
        const nArgs = Math.max(1, Math.min(4, parseInt(pgfDeclM[2], 10) || 1));
        const params = Array.from({ length: nArgs }, (_, idx) => `p${idx + 1}`);
        let bodyExpr = bodyBr.content.trim().replace(/\\pgfmathparse\s*\{([\s\S]*)\}$/, '$1');
        for (let k = 1; k <= nArgs; k++) {
          bodyExpr = bodyExpr.replace(new RegExp(`#${k}`, 'g'), `p${k}`);
        }
        scope.customFuncs[pgfDeclM[1].trim()] = { params, bodyExpr };
        cursor = bodyBr.endIdx + 1;
        continue;
      }
    }

    const defVarM = rest.match(/^\\(?:g|e|x)?def\s*\\([a-zA-Z]+)\s*\{/);
    if (defVarM) {
      const valBr = readBalanced(src, cursor + defVarM[0].length - 1, '{', '}');
      if (valBr) {
        const val = evalMathExpr(valBr.content, scope.vars, Boolean(scope.trigRad), scope.customFuncs);
        if (val !== null) scope.vars[defVarM[1]] = val;
        cursor = valBr.endIdx + 1;
        continue;
      }
    }

    const newCmdM = rest.match(/^\\(?:re|provide)?newcommand\*?\s*(?:\{\\([a-zA-Z]+)\}|\\([a-zA-Z]+))/);
    if (newCmdM) {
      let nc = cursor + newCmdM[0].length;
      while (nc < src.length && /\s/.test(src[nc])) nc++;
      let hasArgs = false;
      if (src[nc] === '[') {
        const argBr = readBalanced(src, nc, '[', ']');
        if (argBr) {
          hasArgs = true;
          nc = argBr.endIdx + 1;
          while (nc < src.length && /\s/.test(src[nc])) nc++;
          if (src[nc] === '[') {
            const defArgBr = readBalanced(src, nc, '[', ']');
            if (defArgBr) nc = defArgBr.endIdx + 1;
          }
        }
      }
      while (nc < src.length && /\s/.test(src[nc])) nc++;
      if (src[nc] === '{') {
        const bodyBr = readBalanced(src, nc, '{', '}');
        if (bodyBr) {
          if (!hasArgs) {
            const varName = newCmdM[1] || newCmdM[2];
            const val = evalMathExpr(bodyBr.content, scope.vars, Boolean(scope.trigRad), scope.customFuncs);
            if (val !== null && varName) scope.vars[varName] = val;
          }
          cursor = bodyBr.endIdx + 1;
          continue;
        }
      }
    }

    const tikzStyleM = rest.match(/^\\tikzstyle\s*\{([^}]+)\}\s*=\s*\[/);
    if (tikzStyleM) {
      const brk = readBalanced(src, cursor + tikzStyleM[0].length - 1, '[', ']');
      if (brk) {
        scope.customStyles[tikzStyleM[1].trim().toLowerCase()] = brk.content.trim();
        cursor = brk.endIdx + 1;
        continue;
      }
    }

    const tikzSetM = rest.match(/^\\tikzset\s*\{/);
    if (tikzSetM) {
      const tsBr = readBalanced(src, cursor + tikzSetM[0].length - 1, '{', '}');
      if (tsBr) {
        const st = parseOptionsString(tsBr.content, scope, customColors, unitPx, scope.vars, scope.customFuncs);
        if (st.customFuncs) Object.assign(scope.customFuncs, st.customFuncs);
        if (st.definedStyles) Object.assign(scope.customStyles, st.definedStyles);
        if (st.trigRad !== undefined) scope.trigRad = st.trigRad;
        if (st.basisX) scope.basisX = st.basisX;
        if (st.basisY) scope.basisY = st.basisY;
        if (st.basisZ) scope.basisZ = st.basisZ;
        if (st.rotateAround) scope.rotateAround = st.rotateAround;
        if (st.useTdplotMainCoords && scope.tdplotTheta !== undefined && scope.tdplotPhi !== undefined) {
          const td = computeTdplotBasis(scope.tdplotTheta, scope.tdplotPhi);
          scope.basisX = td.basisX;
          scope.basisY = td.basisY;
          scope.basisZ = td.basisZ;
        }
        cursor = tsBr.endIdx + 1;
        continue;
      }
    }

    const defColorM = rest.match(/^\\(?:define|provide|xdefine)color\s*\{([^}]+)\}\s*\{([^}]+)\}\s*\{/);
    if (defColorM) {
      const specBr = readBalanced(src, cursor + defColorM[0].length - 1, '{', '}');
      if (specBr) {
        const hex = parseDefineColorValue(defColorM[2], specBr.content, customColors);
        if (hex) {
          customColors[defColorM[1].trim()] = hex;
          customColors[defColorM[1].trim().toLowerCase()] = hex;
        }
        cursor = specBr.endIdx + 1;
        continue;
      }
    }

    const colorLetM = rest.match(/^\\colorlet\s*\{([^}]+)\}\s*\{/);
    if (colorLetM) {
      const specBr = readBalanced(src, cursor + colorLetM[0].length - 1, '{', '}');
      if (specBr) {
        const hex = resolveTikzColor(specBr.content.trim(), customColors);
        if (hex) {
          customColors[colorLetM[1].trim()] = hex;
          customColors[colorLetM[1].trim().toLowerCase()] = hex;
        }
        cursor = specBr.endIdx + 1;
        continue;
      }
    }

    const tdplotMainM = rest.match(/^\\tdplotsetmaincoords\s*\{([^}]+)\}\s*\{([^}]+)\}/);
    if (tdplotMainM) {
      const th = evalMathExpr(tdplotMainM[1], scope.vars, false, scope.customFuncs);
      const ph = evalMathExpr(tdplotMainM[2], scope.vars, false, scope.customFuncs);
      if (th !== null && ph !== null) {
        scope.tdplotTheta = th;
        scope.tdplotPhi = ph;
      }
      cursor += tdplotMainM[0].length;
      continue;
    }

    const tdplotRotM = rest.match(/^\\tdplotsetrotatedcoords\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^}]*\}/);
    if (tdplotRotM) {
      cursor += tdplotRotM[0].length;
      continue;
    }

    const skipOneArgM = rest.match(
      /^\\(?:usetikzlibrary|usepgfplotslibrary|pgfplotsset|pgfdeclarelayer|pgfsetlayers|color|lineWidth|tikz@|tdplotsetthetaplanecoords)(?![a-zA-Z])\s*\{/
    );
    if (skipOneArgM) {
      const br = readBalanced(src, cursor + skipOneArgM[0].length - 1, '{', '}');
      if (br) {
        if (/^\\color(?![a-zA-Z])/.test(skipOneArgM[0])) {
          const c = resolveTikzColor(br.content.trim(), customColors);
          if (c) scope.color = c;
        }
        cursor = br.endIdx + 1;
        continue;
      }
    }

    const skipTwoArgM = rest.match(/^\\(?:setlength|addtolength|setcounter|addtocounter|pgfmathsetseed)(?![a-zA-Z])\s*\{/);
    if (skipTwoArgM) {
      const br1 = readBalanced(src, cursor + skipTwoArgM[0].length - 1, '{', '}');
      if (br1) {
        let nc = br1.endIdx + 1;
        while (nc < src.length && /\s/.test(src[nc])) nc++;
        if (src[nc] === '{') {
          const br2 = readBalanced(src, nc, '{', '}');
          if (br2) {
            cursor = br2.endIdx + 1;
            continue;
          }
        }
        cursor = nc;
        continue;
      }
    }

    const fontSwitchM = rest.match(
      /^\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|bfseries|itshape|mdseries|upshape|rmfamily|sffamily|centering|noindent|displaystyle|textstyle|scriptstyle|scriptscriptstyle)(?![a-zA-Z])/
    );
    if (fontSwitchM) {
      const sw = fontSwitchM[1];
      const swSizeMap: Record<string, number> = {
        tiny: 9,
        scriptsize: 10,
        footnotesize: 11,
        small: 12,
        normalsize: 13,
        large: 14,
        Large: 16,
        LARGE: 18,
        huge: 20,
      };
      if (swSizeMap[sw] !== undefined) scope.fontSize = swSizeMap[sw];
      else if (sw === 'bfseries') scope.fontWeight = '700';
      else if (sw === 'mdseries') scope.fontWeight = '400';
      cursor += fontSwitchM[0].length;
      continue;
    }

    // 6. Read single `;`-terminated TikZ statement
    let endStmt = cursor;
    let brace = 0;
    let bracket = 0;
    let paren = 0;
    let inMath = false;
    let inQuotes = false;
    while (endStmt < src.length) {
      const ch = src[endStmt];
      if (ch === '\\' && endStmt + 1 < src.length) {
        endStmt += 2;
        continue;
      }
      if (ch === '"' && brace === 0) inQuotes = !inQuotes;
      else if (ch === '$') inMath = !inMath;
      else if (!inMath && !inQuotes) {
        if (ch === '{') brace++;
        else if (ch === '}') brace = Math.max(0, brace - 1);
        else if (ch === '[') bracket++;
        else if (ch === ']') bracket = Math.max(0, bracket - 1);
        else if (ch === '(') paren++;
        else if (ch === ')') paren = Math.max(0, paren - 1);
        else if (ch === ';' && brace === 0 && bracket === 0 && paren === 0) break;
      }
      endStmt++;
    }
    let stmt = src.slice(cursor, endStmt).trim();
    cursor = endStmt < src.length ? endStmt + 1 : src.length;
    if (!stmt) continue;

    // Safety net: if an unknown semicolon-less command preceded a TikZ drawing command,
    // slice from the first top-level TikZ command so the drawing command is never swallowed.
    const tikzCmdStartRe = /^\\(coordinate|pic|node|draw|filldraw|fill|path|shadedraw|shade|clip)(?![a-zA-Z])/;
    if (!tikzCmdStartRe.test(stmt)) {
      let sBrace = 0;
      let sBracket = 0;
      let sParen = 0;
      let sMath = false;
      let sQuotes = false;
      let foundStart = -1;
      for (let si = 0; si < stmt.length; si++) {
        const ch = stmt[si];
        if (ch === '\\') {
          if (
            sBrace === 0 &&
            sBracket === 0 &&
            sParen === 0 &&
            !sMath &&
            !sQuotes &&
            tikzCmdStartRe.test(stmt.slice(si))
          ) {
            foundStart = si;
            break;
          }
          si++;
          continue;
        }
        if (ch === '"' && sBrace === 0) sQuotes = !sQuotes;
        else if (ch === '$') sMath = !sMath;
        else if (!sMath && !sQuotes) {
          if (ch === '{') sBrace++;
          else if (ch === '}') sBrace = Math.max(0, sBrace - 1);
          else if (ch === '[') sBracket++;
          else if (ch === ']') sBracket = Math.max(0, sBracket - 1);
          else if (ch === '(') sParen++;
          else if (ch === ')') sParen = Math.max(0, sParen - 1);
        }
      }
      if (foundStart > 0) {
        stmt = stmt.slice(foundStart).trim();
      } else {
        continue;
      }
    }

    const scopeBasis = getScopeBasis(scope);

    // \coordinate[opts] (name) at (coordExpr)  (supports multiple coordinates in one statement)
    if (/^\\coordinate(?![a-zA-Z])/.test(stmt)) {
      let p = '\\coordinate'.length;
      while (p < stmt.length) {
        const optParts: string[] = [];
        let coordName: string | undefined;
        let atExpr: string | undefined;

        while (p < stmt.length) {
          while (p < stmt.length && /\s/.test(stmt[p])) p++;
          if (stmt[p] === '[') {
            const brk = readBalanced(stmt, p, '[', ']');
            if (!brk) break;
            optParts.push(brk.content);
            p = brk.endIdx + 1;
            continue;
          }
          if (stmt.startsWith('at', p) && !/[a-zA-Z0-9_]/.test(stmt[p + 2] || '')) {
            let q = p + 2;
            while (q < stmt.length && /\s/.test(stmt[q])) q++;
            if (stmt[q] === '(') {
              const par = readBalanced(stmt, q, '(', ')');
              if (!par) break;
              atExpr = par.content;
              p = par.endIdx + 1;
              continue;
            }
          }
          if (stmt[p] === '(' && coordName === undefined) {
            const par = readBalanced(stmt, p, '(', ')');
            if (!par) break;
            coordName = par.content.trim();
            p = par.endIdx + 1;
            continue;
          }
          break;
        }

        if (coordName) {
          const pt = atExpr
            ? resolveCoordinateExpr(atExpr, namedCoords, { x: 0, y: 0 }, false, scope.vars, scope.customFuncs, scopeBasis)
            : { x: 0, y: 0 };
          if (pt) {
            namedCoords[coordName] = pt;
            const optsRaw = optParts.join(', ');
            if (optsRaw) {
              const st = parseOptionsString(optsRaw, scope, customColors, unitPx, scope.vars, scope.customFuncs);
              if (st.labelSpec) {
                const sp = toSvgPt(pt);
                const cIdx = st.labelSpec.indexOf(':');
                const anchor = cIdx !== -1 ? st.labelSpec.slice(0, cIdx).trim() : 'above';
                const lbl = cIdx !== -1 ? st.labelSpec.slice(cIdx + 1).trim() : st.labelSpec;
                const fs = st.fontSize ?? 13;
                const f = formatTikzLabelToSvg(lbl, fs);
                const off = getAnchorOffsets(anchor, fs, fs);
                items.push({
                  kind: 'text',
                  svg: `<text x="${(sp.x + off.dx).toFixed(1)}" y="${(sp.y + off.dy).toFixed(1)}" font-size="${fs}" font-family="Times New Roman, serif" text-anchor="${off.textAnchor}" fill="${st.stroke}">${f.tspans}</text>`,
                  bounds: {
                    minX: sp.x + off.dx - f.plainLength * 4.5,
                    minY: sp.y + off.dy - fs,
                    maxX: sp.x + off.dx + f.plainLength * 4.5,
                    maxY: sp.y + off.dy + 5,
                  },
                });
              }
            }
          }
        }
        while (p < stmt.length && /\s/.test(stmt[p])) p++;
        if (stmt.startsWith('coordinate', p) && !/[a-zA-Z]/.test(stmt[p + 10] || '')) {
          p += 10;
          continue;
        }
        break;
      }
      continue;
    }

    // \pic[opts] (name)? at (pt)? {angle = A--B--C} or {right angle = A--B--C}
    if (/^\\pic(?![a-zA-Z])/.test(stmt)) {
      let p = '\\pic'.length;
      const optParts: string[] = [];
      let picAtCoord: string | undefined;
      while (p < stmt.length) {
        while (p < stmt.length && /\s/.test(stmt[p])) p++;
        if (stmt[p] === '[') {
          const brk = readBalanced(stmt, p, '[', ']');
          if (!brk) break;
          optParts.push(brk.content);
          p = brk.endIdx + 1;
          continue;
        }
        if (stmt.startsWith('at', p) && !/[a-zA-Z0-9_]/.test(stmt[p + 2] || '')) {
          let q = p + 2;
          while (q < stmt.length && /\s/.test(stmt[q])) q++;
          if (stmt[q] === '(') {
            const par = readBalanced(stmt, q, '(', ')');
            if (!par) break;
            picAtCoord = par.content;
            p = par.endIdx + 1;
            continue;
          }
        }
        if (stmt[p] === '(') {
          const par = readBalanced(stmt, p, '(', ')');
          if (!par) break;
          p = par.endIdx + 1;
          continue;
        }
        break;
      }
      while (p < stmt.length && /\s/.test(stmt[p])) p++;
      if (stmt[p] === '{') {
        const bodyBr = readBalanced(stmt, p, '{', '}');
        if (bodyBr) {
          renderPicSpec(optParts.join(', '), bodyBr.content, picAtCoord, scope, namedCoords, toSvgPt, items);
        }
      }
      continue;
    }

    // \node[opts] (name)? at (x,y) {text} (supports options/at/name in any order)
    if (/^\\node(?![a-zA-Z])/.test(stmt)) {
      const parsedNode = parseNodeHeader(stmt, 5);
      if (parsedNode) {
        const pt = parsedNode.atCoord
          ? resolveCoordinateExpr(parsedNode.atCoord, namedCoords, { x: 0, y: 0 }, false, scope.vars, scope.customFuncs, scopeBasis)
          : { x: 0, y: 0 };
        if (pt) {
          if (parsedNode.name) namedCoords[parsedNode.name] = pt;
          const nodeBase: TikzScopeState = { ...scope, fill: 'none' };
          const st = parseOptionsString(parsedNode.opts, nodeBase, customColors, unitPx, scope.vars, scope.customFuncs);
          emitNodeItem(parsedNode.text, st, pt, toSvgPt);
        }
      }
      continue;
    }

    // \draw, \fill, \filldraw, \path, \shadedraw, \clip (balanced [opts])
    const drawCmdM = stmt.match(/^\\(draw|filldraw|fill|path|shadedraw|shade|clip)(?![a-zA-Z])/);
    if (!drawCmdM) continue;

    const cmd = drawCmdM[1];
    const { opts: drawOptsRaw, nextIdx: afterDrawOpts } = readLeadingBracketOptions(
      stmt,
      drawCmdM[0].length
    );
    const st = parseOptionsString(drawOptsRaw, scope, customColors, unitPx, scope.vars, scope.customFuncs);
    const isClipStmt = cmd === 'clip' || Boolean(st.isClip);
    if (cmd === 'fill' || cmd === 'filldraw' || cmd === 'shadedraw' || cmd === 'shade') {
      if (st.fill === 'none' && st.hasFill !== false) st.fill = st.stroke;
    }
    const doStroke =
      st.hasDraw === false
        ? false
        : Boolean(st.hasDraw) || (cmd !== 'fill' && cmd !== 'clip' && cmd !== 'path');
    const doFill =
      st.hasFill === false
        ? false
        : cmd === 'fill' ||
          cmd === 'filldraw' ||
          cmd === 'shadedraw' ||
          cmd === 'shade' ||
          st.fill !== 'none' ||
          Boolean(st.pattern);

    let drawBasisX = st.basisX ?? scope.basisX;
    let drawBasisY = st.basisY ?? scope.basisY;
    let drawBasisZ = st.basisZ ?? scope.basisZ;
    if (st.useTdplotMainCoords && scope.tdplotTheta !== undefined && scope.tdplotPhi !== undefined) {
      const td = computeTdplotBasis(scope.tdplotTheta, scope.tdplotPhi);
      drawBasisX = td.basisX;
      drawBasisY = td.basisY;
      drawBasisZ = td.basisZ;
    }
    const drawScope: TikzScopeState = {
      ...scope,
      scaleX: scope.scaleX * (st.scaleX ?? 1),
      scaleY: scope.scaleY * (st.scaleY ?? 1),
      shiftX: scope.shiftX + (st.shiftX ?? 0),
      shiftY: scope.shiftY + (st.shiftY ?? 0),
      shiftXPx: (scope.shiftXPx ?? 0) + (st.shiftXPx ?? 0),
      shiftYPx: (scope.shiftYPx ?? 0) + (st.shiftYPx ?? 0),
      rotateDeg: scope.rotateDeg + (st.rotateDeg ?? 0),
      rotateAround: st.rotateAround ?? scope.rotateAround,
      customStyles: { ...(scope.customStyles || {}), ...(st.definedStyles || {}) },
      basisX: drawBasisX,
      basisY: drawBasisY,
      basisZ: drawBasisZ,
    };
    const drawBasis = getScopeBasis(drawScope);
    const localToSvgPt = (pt: Point2D): Point2D => scopeToSvgPt(pt, drawScope);

    // Local vars & namedCoords view (supports TikZ calc `let \p1=(A), \n1={...} in ...`)
    const pathVars: Record<string, number> = { ...(scope.vars || {}) };
    const pathNamedCoords: Record<string, Point2D> = { ...namedCoords };
    const setNamedCoord = (name: string, pt: Point2D) => {
      namedCoords[name] = pt;
      pathNamedCoords[name] = pt;
    };

    let pathStr = stmt.slice(afterDrawOpts).trim();
    if (/^let(?![a-zA-Z])/.test(pathStr)) {
      let lp = 3;
      let depthP = 0;
      let depthB = 0;
      let inPos = -1;
      while (lp < pathStr.length) {
        const ch = pathStr[lp];
        if (ch === '(') depthP++;
        else if (ch === ')') depthP = Math.max(0, depthP - 1);
        else if (ch === '{') depthB++;
        else if (ch === '}') depthB = Math.max(0, depthB - 1);
        else if (
          depthP === 0 &&
          depthB === 0 &&
          pathStr.startsWith('in', lp) &&
          (lp === 0 || !/[a-zA-Z0-9_\\]/.test(pathStr[lp - 1])) &&
          !/[a-zA-Z0-9_]/.test(pathStr[lp + 2] || '')
        ) {
          inPos = lp;
          break;
        }
        lp++;
      }
      if (inPos !== -1) {
        const assignsRaw = pathStr.slice(3, inPos).trim();
        for (const asgn of splitTopLevel(assignsRaw, ',')) {
          const a = asgn.trim();
          const pM = a.match(/^\\p(?:\{([^}]+)\}|([0-9a-zA-Z]+))\s*=\s*\(([\s\S]+)\)$/);
          if (pM) {
            const key = pM[1] || pM[2];
            const pt = resolveCoordinateExpr(pM[3], pathNamedCoords, { x: 0, y: 0 }, false, pathVars, scope.customFuncs, drawBasis);
            if (pt) {
              pathNamedCoords[`\\p${key}`] = pt;
              pathNamedCoords[`\\p{${key}}`] = pt;
              pathNamedCoords[`p${key}`] = pt;
              pathVars[`x${key}`] = pt.x;
              pathVars[`y${key}`] = pt.y;
            }
            continue;
          }
          const nM = a.match(/^\\n(?:\{([^}]+)\}|([0-9a-zA-Z]+))\s*=\s*\{([\s\S]+)\}$/);
          if (nM) {
            const key = nM[1] || nM[2];
            const val = evalMathExpr(nM[3], pathVars, Boolean(scope.trigRad), scope.customFuncs);
            if (val !== null) {
              pathVars[`n${key}`] = val;
            }
          }
        }
        pathStr = pathStr.slice(inPos + 2).trim();
      }
    }

    let idx = 0;
    let curPt: Point2D = { x: 0, y: 0 };
    let startPt: Point2D = { x: 0, y: 0 };
    let lastNodeAnchorPt: Point2D = { x: 0, y: 0 };
    let hasSubpath = false;
    let coordFailed = false;
    let pendingPlotLineTo = false;
    const dCmds: string[] = [];
    const pathPolylines: Point2D[][] = [];
    let curPoly: Point2D[] = [];
    const startPoly = (pt: Point2D) => {
      curPoly = [{ x: pt.x, y: pt.y }];
      pathPolylines.push(curPoly);
    };
    const pushPoly = (pt: Point2D) => {
      if (curPoly.length === 0) startPoly(curPt);
      curPoly.push({ x: pt.x, y: pt.y });
    };

    const deferredNodeItems: SvgItem[] = [];
    const nodeBaseScope: TikzScopeState = { ...drawScope, vars: pathVars, fill: 'none' };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const expandBBox = (sx: number, sy: number, pad = 2) => {
      if (sx - pad < minX) minX = sx - pad;
      if (sy - pad < minY) minY = sy - pad;
      if (sx + pad > maxX) maxX = sx + pad;
      if (sy + pad > maxY) maxY = sy + pad;
    };

    let lastSegFrom = curPt;
    let lastSegTo = curPt;

    while (idx < pathStr.length) {
      while (idx < pathStr.length && /\s/.test(pathStr[idx])) idx++;
      if (idx >= pathStr.length) break;

      // Relative prefix + or ++
      let relMode = false;
      let updateCur = true;
      if (pathStr.slice(idx, idx + 2) === '++') {
        relMode = true;
        idx += 2;
      } else if (pathStr[idx] === '+') {
        relMode = true;
        updateCur = false;
        idx += 1;
      }

      // Coordinate (...)
      if (pathStr[idx] === '(') {
        const paren = readBalanced(pathStr, idx, '(', ')');
        if (!paren) break;
        const pt = resolveCoordinateExpr(
          paren.content,
          pathNamedCoords,
          curPt,
          relMode,
          pathVars,
          scope.customFuncs,
          drawBasis
        );
        idx = paren.endIdx + 1;
        if (pt) {
          coordFailed = false;
          lastNodeAnchorPt = pt;
          const sp = localToSvgPt(pt);
          expandBBox(sp.x, sp.y);
          dCmds.push(`M ${sp.x.toFixed(2)} ${sp.y.toFixed(2)}`);
          startPoly(pt);
          startPt = pt;
          hasSubpath = true;
          if (updateCur) {
            lastSegFrom = curPt;
            lastSegTo = pt;
            curPt = pt;
          }
        } else {
          coordFailed = true;
        }
        continue;
      }

      // Connectors: --, |-, -|
      if (
        pathStr.startsWith('--', idx) ||
        pathStr.startsWith('|-', idx) ||
        pathStr.startsWith('-|', idx)
      ) {
        const conn = pathStr.slice(idx, idx + 2);
        idx += 2;
        while (idx < pathStr.length && /\s/.test(pathStr[idx])) idx++;

        // Support `-- plot[...]`
        if (conn === '--' && pathStr.startsWith('plot', idx) && !/[a-zA-Z]/.test(pathStr[idx + 4] || '')) {
          pendingPlotLineTo = true;
          continue;
        }

        // Support inline `node[opts]{text}` and `coordinate[opts](name)` between `--` and `(nextPt)`
        const pendingMidNodes: Array<{ opts: string; name?: string; text: string }> = [];
        const pendingMidCoords: Array<{ opts: string; name: string }> = [];
        while (idx < pathStr.length) {
          if (pathStr.startsWith('node', idx) && !/[a-zA-Z]/.test(pathStr[idx + 4] || '')) {
            const parsedMid = parseNodeHeader(pathStr, idx + 4);
            if (!parsedMid) break;
            pendingMidNodes.push({ opts: parsedMid.opts, name: parsedMid.name, text: parsedMid.text });
            idx = parsedMid.endIdx + 1;
            while (idx < pathStr.length && /\s/.test(pathStr[idx])) idx++;
            continue;
          }
          if (pathStr.startsWith('coordinate', idx) && !/[a-zA-Z]/.test(pathStr[idx + 10] || '')) {
            const { opts: cOptsRaw, nextIdx: afterCOpts } = readLeadingBracketOptions(pathStr, idx + 10);
            let p = afterCOpts;
            while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
            if (pathStr[p] !== '(') break;
            const cPar = readBalanced(pathStr, p, '(', ')');
            if (!cPar) break;
            pendingMidCoords.push({ opts: cOptsRaw, name: cPar.content.trim() });
            idx = cPar.endIdx + 1;
            while (idx < pathStr.length && /\s/.test(pathStr[idx])) idx++;
            continue;
          }
          break;
        }

        if (pathStr.startsWith('cycle', idx) && !/[a-zA-Z]/.test(pathStr[idx + 5] || '')) {
          idx += 5;
          if (hasSubpath && !coordFailed) {
            dCmds.push('Z');
            pushPoly(startPt);
            for (const mc of pendingMidCoords) {
              const cStyle = mc.opts
                ? parseOptionsString(mc.opts, nodeBaseScope, customColors, unitPx, pathVars, scope.customFuncs)
                : null;
              const tPos = cStyle?.pos ?? 0.5;
              setNamedCoord(mc.name, {
                x: curPt.x + (startPt.x - curPt.x) * tPos,
                y: curPt.y + (startPt.y - curPt.y) * tPos,
              });
            }
            for (const pn of pendingMidNodes) {
              const nStyle = parseOptionsString(pn.opts, nodeBaseScope, customColors, unitPx, pathVars, scope.customFuncs);
              const tPos = nStyle.pos ?? 0.5;
              const nPt = {
                x: curPt.x + (startPt.x - curPt.x) * tPos,
                y: curPt.y + (startPt.y - curPt.y) * tPos,
              };
              if (pn.name) setNamedCoord(pn.name, nPt);
              emitNodeItem(pn.text, nStyle, nPt, localToSvgPt, deferredNodeItems);
            }
            curPt = startPt;
            lastNodeAnchorPt = startPt;
          }
          continue;
        }

        let rMode = false;
        let uCur = true;
        if (pathStr.slice(idx, idx + 2) === '++') {
          rMode = true;
          idx += 2;
        } else if (pathStr[idx] === '+') {
          rMode = true;
          uCur = false;
          idx += 1;
        }
        while (idx < pathStr.length && /\s/.test(pathStr[idx])) idx++;

        if (pathStr[idx] === '(') {
          const paren = readBalanced(pathStr, idx, '(', ')');
          if (!paren) break;
          const nextPt = resolveCoordinateExpr(
            paren.content,
            pathNamedCoords,
            curPt,
            rMode,
            pathVars,
            scope.customFuncs,
            drawBasis
          );
          idx = paren.endIdx + 1;
          if (nextPt) {
            if (!hasSubpath || coordFailed) {
              const sp = localToSvgPt(nextPt);
              expandBBox(sp.x, sp.y);
              dCmds.push(`M ${sp.x.toFixed(2)} ${sp.y.toFixed(2)}`);
              startPoly(nextPt);
              startPt = nextPt;
              hasSubpath = true;
              coordFailed = false;
              lastNodeAnchorPt = nextPt;
              if (uCur) {
                lastSegFrom = nextPt;
                lastSegTo = nextPt;
                curPt = nextPt;
              }
            } else {
              if (conn === '|-') {
                const cornerPt = { x: curPt.x, y: nextPt.y };
                const mid = localToSvgPt(cornerPt);
                expandBBox(mid.x, mid.y);
                dCmds.push(`L ${mid.x.toFixed(2)} ${mid.y.toFixed(2)}`);
                pushPoly(cornerPt);
              } else if (conn === '-|') {
                const cornerPt = { x: nextPt.x, y: curPt.y };
                const mid = localToSvgPt(cornerPt);
                expandBBox(mid.x, mid.y);
                dCmds.push(`L ${mid.x.toFixed(2)} ${mid.y.toFixed(2)}`);
                pushPoly(cornerPt);
              }
              const sp = localToSvgPt(nextPt);
              expandBBox(sp.x, sp.y);
              dCmds.push(`L ${sp.x.toFixed(2)} ${sp.y.toFixed(2)}`);
              pushPoly(nextPt);
              lastSegFrom = curPt;
              lastSegTo = nextPt;
              lastNodeAnchorPt = nextPt;
              for (const mc of pendingMidCoords) {
                const cStyle = mc.opts
                  ? parseOptionsString(mc.opts, nodeBaseScope, customColors, unitPx, pathVars, scope.customFuncs)
                  : null;
                const tPos = cStyle?.pos ?? 0.5;
                setNamedCoord(mc.name, {
                  x: lastSegFrom.x + (lastSegTo.x - lastSegFrom.x) * tPos,
                  y: lastSegFrom.y + (lastSegTo.y - lastSegFrom.y) * tPos,
                });
              }
              for (const pn of pendingMidNodes) {
                const nStyle = parseOptionsString(pn.opts, nodeBaseScope, customColors, unitPx, pathVars, scope.customFuncs);
                const tPos = nStyle.pos ?? 0.5;
                const nPt = {
                  x: lastSegFrom.x + (lastSegTo.x - lastSegFrom.x) * tPos,
                  y: lastSegFrom.y + (lastSegTo.y - lastSegFrom.y) * tPos,
                };
                if (pn.name) setNamedCoord(pn.name, nPt);
                emitNodeItem(pn.text, nStyle, nPt, localToSvgPt, deferredNodeItems);
              }
              if (uCur) curPt = nextPt;
            }
          } else {
            coordFailed = true;
          }
        }
        continue;
      }

      // Cubic/Quadratic Bezier: .. controls [+/?](c1) [and [+/?](c2)] .. [+/?](end)
      if (pathStr.startsWith('..', idx)) {
        let p = idx + 2;
        while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
        if (pathStr.startsWith('controls', p) && !/[a-zA-Z]/.test(pathStr[p + 8] || '')) {
          p += 8;
          while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
          let relC1 = false;
          if (pathStr.startsWith('++', p)) { relC1 = true; p += 2; }
          else if (pathStr[p] === '+') { relC1 = true; p += 1; }
          while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
          if (pathStr[p] === '(') {
            const c1Br = readBalanced(pathStr, p, '(', ')');
            if (c1Br) {
              p = c1Br.endIdx + 1;
              while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
              let c2Expr: string | null = null;
              let relC2 = false;
              if (pathStr.startsWith('and', p) && !/[a-zA-Z]/.test(pathStr[p + 3] || '')) {
                p += 3;
                while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
                if (pathStr.startsWith('++', p)) { relC2 = true; p += 2; }
                else if (pathStr[p] === '+') { relC2 = true; p += 1; }
                while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
                if (pathStr[p] === '(') {
                  const c2Br = readBalanced(pathStr, p, '(', ')');
                  if (c2Br) {
                    c2Expr = c2Br.content;
                    p = c2Br.endIdx + 1;
                  }
                }
              }
              while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
              if (pathStr.startsWith('..', p)) {
                p += 2;
                while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
                let relEnd = false;
                if (pathStr.startsWith('++', p)) {
                  relEnd = true;
                  p += 2;
                } else if (pathStr[p] === '+') {
                  relEnd = true;
                  p += 1;
                }
                while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
                if (pathStr[p] === '(') {
                  const endBr = readBalanced(pathStr, p, '(', ')');
                  if (endBr) {
                    const endPt = resolveCoordinateExpr(endBr.content, pathNamedCoords, curPt, relEnd, pathVars, scope.customFuncs, drawBasis);
                    const c1 = resolveCoordinateExpr(c1Br.content, pathNamedCoords, curPt, relC1, pathVars, scope.customFuncs, drawBasis);
                    const c2 = c2Expr
                      ? resolveCoordinateExpr(c2Expr, pathNamedCoords, endPt ?? curPt, relC2, pathVars, scope.customFuncs, drawBasis)
                      : c1;
                    if (!coordFailed && c1 && c2 && endPt) {
                      const sc1 = localToSvgPt(c1);
                      const sc2 = localToSvgPt(c2);
                      const se = localToSvgPt(endPt);
                      expandBBox(sc1.x, sc1.y);
                      expandBBox(sc2.x, sc2.y);
                      expandBBox(se.x, se.y);
                      dCmds.push(
                        `C ${sc1.x.toFixed(2)} ${sc1.y.toFixed(2)}, ${sc2.x.toFixed(2)} ${sc2.y.toFixed(2)}, ${se.x.toFixed(2)} ${se.y.toFixed(2)}`
                      );
                      const p0 = curPt;
                      for (let k = 1; k <= 12; k++) {
                        const t = k / 12;
                        const mt = 1 - t;
                        pushPoly({
                          x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * endPt.x,
                          y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * endPt.y,
                        });
                      }
                      lastSegFrom = curPt;
                      lastSegTo = endPt;
                      curPt = endPt;
                      lastNodeAnchorPt = endPt;
                    }
                    idx = endBr.endIdx + 1;
                    continue;
                  }
                }
              }
            }
          }
        }
      }

      // rectangle [+/?](x2, y2)
      if (pathStr.startsWith('rectangle', idx) && !/[a-zA-Z]/.test(pathStr[idx + 9] || '')) {
        let p = idx + 9;
        while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
        let relRect = false;
        if (pathStr.startsWith('++', p)) { relRect = true; p += 2; }
        else if (pathStr[p] === '+') { relRect = true; p += 1; }
        while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
        if (pathStr[p] === '(') {
          const paren = readBalanced(pathStr, p, '(', ')');
          if (paren) {
            const p2 = resolveCoordinateExpr(paren.content, pathNamedCoords, curPt, relRect, pathVars, scope.customFuncs, drawBasis);
            if (!coordFailed && hasSubpath && p2) {
              const s1 = localToSvgPt(curPt);
              const s2 = localToSvgPt(p2);
              const rx = Math.min(s1.x, s2.x);
              const ry = Math.min(s1.y, s2.y);
              const rw = Math.abs(s2.x - s1.x);
              const rh = Math.abs(s2.y - s1.y);
              expandBBox(rx, ry);
              expandBBox(rx + rw, ry + rh);
              dCmds.push(
                `M ${rx.toFixed(2)} ${ry.toFixed(2)} L ${(rx + rw).toFixed(2)} ${ry.toFixed(2)} L ${(rx + rw).toFixed(2)} ${(ry + rh).toFixed(2)} L ${rx.toFixed(2)} ${(ry + rh).toFixed(2)} Z`
              );
              pathPolylines.push([
                { x: curPt.x, y: curPt.y },
                { x: p2.x, y: curPt.y },
                { x: p2.x, y: p2.y },
                { x: curPt.x, y: p2.y },
                { x: curPt.x, y: curPt.y },
              ]);
              curPt = p2;
              lastNodeAnchorPt = p2;
            }
            idx = paren.endIdx + 1;
            continue;
          }
        }
      }

      // circle (r), circle [radius=r], circle [x radius=rx, y radius=ry],
      // or ellipse [x radius=rx, y radius=ry], ellipse (rx and ry)
      if (
        (pathStr.startsWith('circle', idx) && !/[a-zA-Z0-9_]/.test(pathStr[idx + 6] || '')) ||
        (pathStr.startsWith('ellipse', idx) && !/[a-zA-Z0-9_]/.test(pathStr[idx + 7] || ''))
      ) {
        const isEllipseCmd = pathStr.startsWith('ellipse', idx);
        const parseAxisRadiusPx = (rawExpr: string, scaleFactor: number): number | null => {
          const trimmed = rawExpr.trim();
          const unitM = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(cm|mm|pt|em|ex|in|px)$/i);
          const sc = Math.abs(scaleFactor);
          if (unitM) {
            const basePx = parseLengthToPx(trimmed, unitPx);
            if (basePx === null) return null;
            const scaled = basePx * sc;
            return unitM[2].toLowerCase() === 'pt' && parseFloat(unitM[1]) >= 1
              ? Math.max(1.5, scaled)
              : scaled;
          }
          const unitless = evalMathExpr(trimmed, pathVars, false, scope.customFuncs);
          return unitless !== null ? Math.abs(unitless) * unitPx * sc : null;
        };

        let rxPx: number | null = null;
        let ryPx: number | null = null;
        let rotDeg = 0;
        let nextIdx = idx + (isEllipseCmd ? 7 : 6);
        while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;

        if (pathStr[nextIdx] === '(') {
          const paren = readBalanced(pathStr, nextIdx, '(', ')');
          if (paren) {
            if (isEllipseCmd) {
              const andM = paren.content.match(/^([\s\S]+?)\s+and\s+([\s\S]+)$/i);
              const parts = andM
                ? [andM[1], andM[2]]
                : splitTopLevel(paren.content, ',');
              if (parts.length >= 2) {
                rxPx = parseAxisRadiusPx(parts[0], drawScope.scaleX);
                ryPx = parseAxisRadiusPx(parts[1], drawScope.scaleY);
              }
            } else {
              rxPx = parseAxisRadiusPx(paren.content, drawScope.scaleX);
              ryPx = rxPx !== null ? parseAxisRadiusPx(paren.content, drawScope.scaleY) : null;
            }
            nextIdx = paren.endIdx + 1;
          }
        } else if (pathStr[nextIdx] === '[') {
          const brk = readBalanced(pathStr, nextIdx, '[', ']');
          if (brk) {
            let sharedRadiusExpr: string | null = null;
            for (const opt of splitTopLevel(brk.content, ',')) {
              const eq = opt.indexOf('=');
              if (eq === -1) continue;
              const k = opt.slice(0, eq).trim().toLowerCase();
              const v = opt.slice(eq + 1).trim();
              if (k === 'x radius') rxPx = parseAxisRadiusPx(v, drawScope.scaleX);
              else if (k === 'y radius') ryPx = parseAxisRadiusPx(v, drawScope.scaleY);
              else if (k === 'radius') sharedRadiusExpr = v;
              else if (k === 'rotate') {
                rotDeg = evalMathExpr(v, pathVars, false, scope.customFuncs) ?? 0;
              }
            }
            if (sharedRadiusExpr !== null) {
              if (rxPx === null) rxPx = parseAxisRadiusPx(sharedRadiusExpr, drawScope.scaleX);
              if (ryPx === null) ryPx = parseAxisRadiusPx(sharedRadiusExpr, drawScope.scaleY);
            }
            nextIdx = brk.endIdx + 1;
          }
        }

        // Guard: NEVER draw a phantom dot/circle at (0,0) when the preceding coordinate failed to resolve
        if (hasSubpath && !coordFailed && rxPx !== null && ryPx !== null && rxPx > 0 && ryPx > 0) {
          const c = localToSvgPt(curPt);
          const rxTikz = rxPx / (unitPx * Math.max(1e-6, Math.abs(drawScope.scaleX)));
          const ryTikz = ryPx / (unitPx * Math.max(1e-6, Math.abs(drawScope.scaleY)));
          const ellPoly: Point2D[] = [];
          const rotRad = (rotDeg * Math.PI) / 180;
          for (let k = 0; k <= 36; k++) {
            const a = (2 * Math.PI * k) / 36;
            const lx = rxTikz * Math.cos(a);
            const ly = ryTikz * Math.sin(a);
            ellPoly.push({
              x: curPt.x + lx * Math.cos(rotRad) - ly * Math.sin(rotRad),
              y: curPt.y + lx * Math.sin(rotRad) + ly * Math.cos(rotRad),
            });
          }
          pathPolylines.push(ellPoly);

          if (Math.abs(rotDeg) < 1e-4) {
            expandBBox(c.x - rxPx, c.y - ryPx);
            expandBBox(c.x + rxPx, c.y + ryPx);
            dCmds.push(
              `M ${(c.x - rxPx).toFixed(2)} ${c.y.toFixed(2)} A ${rxPx.toFixed(2)} ${ryPx.toFixed(2)} 0 1 0 ${(c.x + rxPx).toFixed(2)} ${c.y.toFixed(2)} A ${rxPx.toFixed(2)} ${ryPx.toFixed(2)} 0 1 0 ${(c.x - rxPx).toFixed(2)} ${c.y.toFixed(2)} Z`
            );
          } else {
            const cosR = Math.cos(rotRad);
            const sinR = Math.sin(rotRad);
            const bx = Math.hypot(rxPx * cosR, ryPx * sinR);
            const by = Math.hypot(rxPx * sinR, ryPx * cosR);
            expandBBox(c.x - bx, c.y - by);
            expandBBox(c.x + bx, c.y + by);
            const p1x = c.x - rxPx * cosR;
            const p1y = c.y + rxPx * sinR;
            const p2x = c.x + rxPx * cosR;
            const p2y = c.y - rxPx * sinR;
            dCmds.push(
              `M ${p1x.toFixed(2)} ${p1y.toFixed(2)} A ${rxPx.toFixed(2)} ${ryPx.toFixed(2)} ${(-rotDeg).toFixed(2)} 1 0 ${p2x.toFixed(2)} ${p2y.toFixed(2)} A ${rxPx.toFixed(2)} ${ryPx.toFixed(2)} ${(-rotDeg).toFixed(2)} 1 0 ${p1x.toFixed(2)} ${p1y.toFixed(2)} Z`
            );
          }
        }
        idx = nextIdx;
        continue;
      }

      // arc (start:end:r), arc (start:end:rx and ry), or arc [start angle=..., end angle/delta angle=..., radius/x radius/y radius=...]
      if (pathStr.startsWith('arc', idx) && !/[a-zA-Z]/.test(pathStr[idx + 3] || '')) {
        let nextIdx = idx + 3;
        while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;
        let aStart: number | null = null;
        let aEnd: number | null = null;
        let rxUnits: number | null = null;
        let ryUnits: number | null = null;
        const evalRadiusUnits = (raw: string): number | null => {
          const val = parseLengthToTikzUnits(raw.trim(), unitPx) ?? evalMathExpr(raw.trim(), pathVars, false, scope.customFuncs);
          return val !== null ? Math.abs(val) : null;
        };
        if (pathStr[nextIdx] === '(') {
          const paren = readBalanced(pathStr, nextIdx, '(', ')');
          if (paren) {
            const parts = splitTopLevel(paren.content, ':');
            if (parts.length === 3) {
              aStart = evalMathExpr(parts[0], pathVars, false, scope.customFuncs);
              aEnd = evalMathExpr(parts[1], pathVars, false, scope.customFuncs);
              const andM = parts[2].trim().match(/^([\s\S]+?)\s+and\s+([\s\S]+)$/i);
              if (andM) {
                rxUnits = evalRadiusUnits(andM[1]);
                ryUnits = evalRadiusUnits(andM[2]);
              } else {
                rxUnits = evalRadiusUnits(parts[2]);
                ryUnits = rxUnits;
              }
            }
            nextIdx = paren.endIdx + 1;
          }
        } else if (pathStr[nextIdx] === '[') {
          const brk = readBalanced(pathStr, nextIdx, '[', ']');
          if (brk) {
            let deltaDeg: number | null = null;
            for (const part of splitTopLevel(brk.content, ',')) {
              const eq = part.indexOf('=');
              if (eq === -1) continue;
              const k = part.slice(0, eq).trim().toLowerCase();
              const v = part.slice(eq + 1).trim();
              if (k === 'start angle') aStart = evalMathExpr(v, pathVars, false, scope.customFuncs);
              else if (k === 'end angle') aEnd = evalMathExpr(v, pathVars, false, scope.customFuncs);
              else if (k === 'delta angle') deltaDeg = evalMathExpr(v, pathVars, false, scope.customFuncs);
              else if (k === 'radius') {
                const r = evalRadiusUnits(v);
                if (r !== null) { rxUnits = r; ryUnits = r; }
              } else if (k === 'x radius') rxUnits = evalRadiusUnits(v);
              else if (k === 'y radius') ryUnits = evalRadiusUnits(v);
            }
            if (aStart !== null && aEnd === null && deltaDeg !== null) {
              aEnd = aStart + deltaDeg;
            }
            nextIdx = brk.endIdx + 1;
          }
        }
        if (hasSubpath && !coordFailed && aStart !== null && aEnd !== null && rxUnits !== null && ryUnits !== null && rxUnits > 0 && ryUnits > 0) {
          const r1 = (aStart * Math.PI) / 180;
          const r2 = (aEnd * Math.PI) / 180;
          const center: Point2D = {
            x: curPt.x - rxUnits * Math.cos(r1),
            y: curPt.y - ryUnits * Math.sin(r1),
          };
          const endPt: Point2D = {
            x: center.x + rxUnits * Math.cos(r2),
            y: center.y + ryUnits * Math.sin(r2),
          };
          const steps = 32;
          for (let k = 1; k <= steps; k++) {
            const ang = r1 + ((r2 - r1) * k) / steps;
            const pt = {
              x: center.x + rxUnits * Math.cos(ang),
              y: center.y + ryUnits * Math.sin(ang),
            };
            const sp = localToSvgPt(pt);
            expandBBox(sp.x, sp.y);
            dCmds.push(`L ${sp.x.toFixed(2)} ${sp.y.toFixed(2)}`);
            pushPoly(pt);
          }
          curPt = endPt;
          lastNodeAnchorPt = endPt;
        }
        idx = nextIdx;
        continue;
      }

      // parabola [bend (xb,yb)] (x2, y2)
      if (pathStr.startsWith('parabola', idx) && !/[a-zA-Z]/.test(pathStr[idx + 8] || '')) {
        let p = idx + 8;
        while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
        let bendAtStart = false;
        let bendPtExpr: string | null = null;
        if (pathStr[p] === '[') {
          const brk = readBalanced(pathStr, p, '[', ']');
          if (brk) {
            if (/bend\s+at\s+start/i.test(brk.content)) bendAtStart = true;
            p = brk.endIdx + 1;
            while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
          }
        }
        if (pathStr.startsWith('bend', p) && !/[a-zA-Z]/.test(pathStr[p + 4] || '')) {
          p += 4;
          while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
          if (pathStr[p] === '(') {
            const bPar = readBalanced(pathStr, p, '(', ')');
            if (bPar) {
              bendPtExpr = bPar.content;
              p = bPar.endIdx + 1;
              while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
            }
          }
        }
        let relPar = false;
        if (pathStr.startsWith('++', p)) { relPar = true; p += 2; }
        else if (pathStr[p] === '+') { relPar = true; p += 1; }
        while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
        if (pathStr[p] === '(') {
          const endPar = readBalanced(pathStr, p, '(', ')');
          if (endPar) {
            const p2 = resolveCoordinateExpr(endPar.content, pathNamedCoords, curPt, relPar, pathVars, scope.customFuncs, drawBasis);
            if (hasSubpath && !coordFailed && p2) {
              const bendPt = bendPtExpr
                ? resolveCoordinateExpr(bendPtExpr, pathNamedCoords, curPt, false, pathVars, scope.customFuncs, drawBasis)
                : null;
              const emitHalf = (from: Point2D, to: Point2D, vertexAtFrom: boolean) => {
                const steps = 16;
                for (let k = 1; k <= steps; k++) {
                  const t = k / steps;
                  const pt = vertexAtFrom
                    ? { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t * t }
                    : { x: from.x + (to.x - from.x) * t, y: to.y + (from.y - to.y) * (1 - t) * (1 - t) };
                  const sp = localToSvgPt(pt);
                  expandBBox(sp.x, sp.y);
                  dCmds.push(`L ${sp.x.toFixed(2)} ${sp.y.toFixed(2)}`);
                  pushPoly(pt);
                }
              };
              if (bendPt) {
                emitHalf(curPt, bendPt, false);
                emitHalf(bendPt, p2, true);
              } else {
                emitHalf(curPt, p2, bendAtStart);
              }
              lastSegFrom = curPt;
              lastSegTo = p2;
              curPt = p2;
              lastNodeAnchorPt = p2;
            }
            idx = endPar.endIdx + 1;
            continue;
          }
        }
      }

      // grid (x2, y2)
      if (pathStr.startsWith('grid', idx) && !/[a-zA-Z]/.test(pathStr[idx + 4] || '')) {
        let nextIdx = idx + 4;
        while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;
        if (pathStr[nextIdx] === '(') {
          const paren = readBalanced(pathStr, nextIdx, '(', ')');
          if (paren) {
            const p2 = resolveCoordinateExpr(paren.content, pathNamedCoords, curPt, false, pathVars, scope.customFuncs, drawBasis);
            if (hasSubpath && !coordFailed && p2) {
              const step = st.step ?? 1;
              const x0 = Math.min(curPt.x, p2.x);
              const x1 = Math.max(curPt.x, p2.x);
              const y0 = Math.min(curPt.y, p2.y);
              const y1 = Math.max(curPt.y, p2.y);
              for (let gx = x0; gx <= x1 + 1e-6; gx += step) {
                const a = localToSvgPt({ x: gx, y: y0 });
                const b = localToSvgPt({ x: gx, y: y1 });
                expandBBox(a.x, a.y);
                expandBBox(b.x, b.y);
                dCmds.push(`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
              }
              for (let gy = y0; gy <= y1 + 1e-6; gy += step) {
                const a = localToSvgPt({ x: x0, y: gy });
                const b = localToSvgPt({ x: x1, y: gy });
                expandBBox(a.x, a.y);
                expandBBox(b.x, b.y);
                dCmds.push(`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
              }
            }
            idx = paren.endIdx + 1;
            continue;
          }
        }
      }

      // plot[domain=..., samples=..., variable=\t] (\x, {expr}) or plot coordinates {...} or plot function{expr}
      if (pathStr.startsWith('plot', idx) && !/[a-zA-Z]/.test(pathStr[idx + 4] || '')) {
        const connectFromPrev = pendingPlotLineTo && hasSubpath && !coordFailed;
        pendingPlotLineTo = false;
        let nextIdx = idx + 4;
        let plotOptsRaw = '';
        while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;
        if (pathStr[nextIdx] === '[') {
          const brk = readBalanced(pathStr, nextIdx, '[', ']');
          if (brk) {
            plotOptsRaw = brk.content;
            nextIdx = brk.endIdx + 1;
          }
        }
        const pStyle = parseOptionsString(plotOptsRaw, drawScope, customColors, unitPx, pathVars, scope.customFuncs);
        const plotScope: TikzScopeState = {
          ...drawScope,
          scaleX: drawScope.scaleX * (pStyle.scaleX ?? 1),
          scaleY: drawScope.scaleY * (pStyle.scaleY ?? 1),
          shiftX: drawScope.shiftX + (pStyle.shiftX ?? 0),
          shiftY: drawScope.shiftY + (pStyle.shiftY ?? 0),
          shiftXPx: (drawScope.shiftXPx ?? 0) + (pStyle.shiftXPx ?? 0),
          shiftYPx: (drawScope.shiftYPx ?? 0) + (pStyle.shiftYPx ?? 0),
          rotateDeg: drawScope.rotateDeg + (pStyle.rotateDeg ?? 0),
          rotateAround: pStyle.rotateAround ?? drawScope.rotateAround,
        };
        const plotToSvgPt = (pt: Point2D): Point2D => scopeToSvgPt(pt, plotScope);
        while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;

        if (pathStr.startsWith('coordinates', nextIdx)) {
          const braceIdx = pathStr.indexOf('{', nextIdx);
          if (braceIdx !== -1) {
            const br = readBalanced(pathStr, braceIdx, '{', '}');
            if (br) {
              let ci = 0;
              let first = !connectFromPrev;
              let lastPlotPt: Point2D | null = null;
              while (ci < br.content.length) {
                if (br.content[ci] === '(') {
                  const cPar = readBalanced(br.content, ci, '(', ')');
                  if (cPar) {
                    const pt = resolveCoordinateExpr(
                      cPar.content,
                      pathNamedCoords,
                      curPt,
                      false,
                      pathVars,
                      scope.customFuncs,
                      drawBasis
                    );
                    if (pt) {
                      const sp = plotToSvgPt(pt);
                      expandBBox(sp.x, sp.y);
                      dCmds.push(`${first ? 'M' : 'L'} ${sp.x.toFixed(2)} ${sp.y.toFixed(2)}`);
                      if (first) startPoly(pt);
                      else pushPoly(pt);
                      if (!hasSubpath) startPt = pt;
                      first = false;
                      lastPlotPt = pt;
                    }
                    ci = cPar.endIdx + 1;
                    continue;
                  }
                }
                ci++;
              }
              if (lastPlotPt) {
                curPt = lastPlotPt;
                lastNodeAnchorPt = lastPlotPt;
                hasSubpath = true;
                coordFailed = false;
              }
              idx = br.endIdx + 1;
              continue;
            }
          }
        } else if (
          pathStr[nextIdx] === '(' ||
          (pathStr.startsWith('function', nextIdx) && !/[a-zA-Z]/.test(pathStr[nextIdx + 8] || ''))
        ) {
          let xExpr = 'x';
          let yExpr = '';
          let endPlotIdx = -1;
          if (pathStr[nextIdx] === '(') {
            const paren = readBalanced(pathStr, nextIdx, '(', ')');
            if (paren) {
              const xy = splitTopLevel(paren.content, ',');
              if (xy.length === 2) {
                xExpr = xy[0];
                yExpr = xy[1];
              }
              endPlotIdx = paren.endIdx + 1;
            }
          } else {
            let fp = nextIdx + 8;
            while (fp < pathStr.length && /\s/.test(pathStr[fp])) fp++;
            if (pathStr[fp] === '{') {
              const fBr = readBalanced(pathStr, fp, '{', '}');
              if (fBr) {
                xExpr = 'x';
                yExpr = fBr.content.trim();
                endPlotIdx = fBr.endIdx + 1;
              }
            }
          }
          if (endPlotIdx !== -1 && yExpr) {
            const explicitVar = pStyle.plotVar ?? st.plotVar;
            const varMatch = xExpr.match(/\\[a-zA-Z]+/);
            const varName = explicitVar || (varMatch ? varMatch[0] : 'x');
            const bareVarName = varName.replace(/^\\/, '');
            const dmn = pStyle.domain ?? st.domain ?? [-3, 3];
            const smp = Math.max(60, pStyle.samples ?? st.samples ?? 180);
            const cb = scope.clipBounds;
            const yMinPx = cb ? cb.minY - 40 : -1200;
            const yMaxPx = cb ? cb.maxY + 40 : 1200;
            const spanYPx = cb ? Math.max(80, cb.maxY - cb.minY) : 320;
            const useRad = Boolean(scope.trigRad || st.trigRad || pStyle.trigRad);

            const sampledTikz: Point2D[][] = [];
            let curTikzSeg: Point2D[] = [];
            const segs = sampleFunctionPlotSegments(
              dmn,
              smp,
              (t) => {
                const vars = { ...pathVars, [varName]: t, [bareVarName]: t, x: t, t };
                const px = evalMathExpr(xExpr, vars, useRad, scope.customFuncs);
                const py = evalMathExpr(yExpr, vars, useRad, scope.customFuncs);
                if (px === null || py === null || !Number.isFinite(py)) {
                  if (curTikzSeg.length > 1) sampledTikz.push(curTikzSeg);
                  curTikzSeg = [];
                  return null;
                }
                curTikzSeg.push({ x: px, y: py });
                return { x: px, y: py, sp: plotToSvgPt({ x: px, y: py }) };
              },
              yMinPx,
              yMaxPx,
              spanYPx
            );
            if (curTikzSeg.length > 1) sampledTikz.push(curTikzSeg);
            for (const tSeg of sampledTikz) pathPolylines.push(tSeg);

            let firstGlobal = !connectFromPrev;
            for (const seg of segs) {
              seg.forEach((sp, sIdx) => {
                expandBBox(sp.x, sp.y);
                const isFirstCmd = sIdx === 0 && firstGlobal;
                dCmds.push(`${isFirstCmd ? 'M' : sIdx === 0 && !connectFromPrev ? 'M' : 'L'} ${sp.x.toFixed(2)} ${sp.y.toFixed(2)}`);
                firstGlobal = false;
              });
            }
            if (sampledTikz.length > 0) {
              const firstSeg = sampledTikz[0];
              const lastSeg = sampledTikz[sampledTikz.length - 1];
              if (!hasSubpath && firstSeg.length > 0) startPt = firstSeg[0];
              if (lastSeg.length > 0) {
                curPt = lastSeg[lastSeg.length - 1];
                lastNodeAnchorPt = curPt;
              }
              hasSubpath = true;
              coordFailed = false;
            }
            idx = endPlotIdx;
            continue;
          }
        }
      }

      // Inline node[...] (name)? at (pt)? {...} along path
      if (pathStr.startsWith('node', idx) && !/[a-zA-Z]/.test(pathStr[idx + 4] || '')) {
        const parsedInline = parseNodeHeader(pathStr, idx + 4);
        if (parsedInline) {
          const nStyle = parseOptionsString(parsedInline.opts, nodeBaseScope, customColors, unitPx, pathVars, scope.customFuncs);
          const tPos = nStyle.pos ?? 1;
          let anchorPt: Point2D | null = null;
          if (parsedInline.atCoord) {
            anchorPt = resolveCoordinateExpr(parsedInline.atCoord, pathNamedCoords, curPt, false, pathVars, scope.customFuncs, drawBasis);
          } else if (!coordFailed) {
            anchorPt =
              nStyle.pos !== undefined
                ? {
                    x: lastSegFrom.x + (lastSegTo.x - lastSegFrom.x) * tPos,
                    y: lastSegFrom.y + (lastSegTo.y - lastSegFrom.y) * tPos,
                  }
                : lastNodeAnchorPt;
          }
          if (anchorPt) {
            if (parsedInline.name) setNamedCoord(parsedInline.name, anchorPt);
            emitNodeItem(parsedInline.text, nStyle, anchorPt, localToSvgPt, deferredNodeItems);
          }
          idx = parsedInline.endIdx + 1;
          continue;
        }
      }

      // Inline coordinate[opts] (name) [at (coord)]
      if (pathStr.startsWith('coordinate', idx) && !/[a-zA-Z]/.test(pathStr[idx + 10] || '')) {
        let p = idx + 10;
        const optParts: string[] = [];
        let coordName: string | undefined;
        let atExpr: string | undefined;
        while (p < pathStr.length) {
          while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
          if (pathStr[p] === '[') {
            const brk = readBalanced(pathStr, p, '[', ']');
            if (!brk) break;
            optParts.push(brk.content);
            p = brk.endIdx + 1;
            continue;
          }
          if (pathStr.startsWith('at', p) && !/[a-zA-Z0-9_]/.test(pathStr[p + 2] || '')) {
            let q = p + 2;
            while (q < pathStr.length && /\s/.test(pathStr[q])) q++;
            if (pathStr[q] === '(') {
              const par = readBalanced(pathStr, q, '(', ')');
              if (!par) break;
              atExpr = par.content;
              p = par.endIdx + 1;
              continue;
            }
          }
          if (pathStr[p] === '(' && coordName === undefined) {
            const par = readBalanced(pathStr, p, '(', ')');
            if (!par) break;
            coordName = par.content.trim();
            p = par.endIdx + 1;
            continue;
          }
          break;
        }
        if (coordName) {
          const optsRaw = optParts.join(', ');
          const cStyle = optsRaw
            ? parseOptionsString(optsRaw, nodeBaseScope, customColors, unitPx, pathVars, scope.customFuncs)
            : null;
          let cPt: Point2D | null = null;
          if (atExpr) {
            cPt = resolveCoordinateExpr(atExpr, pathNamedCoords, curPt, false, pathVars, scope.customFuncs, drawBasis);
          } else if (!coordFailed) {
            cPt =
              cStyle?.pos !== undefined
                ? {
                    x: lastSegFrom.x + (lastSegTo.x - lastSegFrom.x) * cStyle.pos,
                    y: lastSegFrom.y + (lastSegTo.y - lastSegFrom.y) * cStyle.pos,
                  }
                : { ...lastNodeAnchorPt };
          }
          if (cPt) {
            setNamedCoord(coordName, cPt);
            if (cStyle?.labelSpec) {
              const sp = localToSvgPt(cPt);
              const cIdx = cStyle.labelSpec.indexOf(':');
              const anchor = cIdx !== -1 ? cStyle.labelSpec.slice(0, cIdx).trim() : 'above';
              const lbl = cIdx !== -1 ? cStyle.labelSpec.slice(cIdx + 1).trim() : cStyle.labelSpec;
              const fs = cStyle.fontSize ?? 13;
              const f = formatTikzLabelToSvg(lbl, fs);
              const off = getAnchorOffsets(anchor, fs, fs);
              deferredNodeItems.push({
                kind: 'text',
                svg: `<text x="${(sp.x + off.dx).toFixed(1)}" y="${(sp.y + off.dy).toFixed(1)}" font-size="${fs}" font-family="Times New Roman, serif" text-anchor="${off.textAnchor}" fill="${cStyle.stroke}">${f.tspans}</text>`,
                bounds: {
                  minX: sp.x + off.dx - f.plainLength * 4.5,
                  minY: sp.y + off.dy - fs,
                  maxX: sp.x + off.dx + f.plainLength * 4.5,
                  maxY: sp.y + off.dy + 5,
                },
              });
            }
          }
          idx = p;
          continue;
        }
      }

      // Inline pic[opts] (name)? at (pt)? {angle = A--B--C} or {right angle = A--B--C}
      if (pathStr.startsWith('pic', idx) && !/[a-zA-Z]/.test(pathStr[idx + 3] || '')) {
        let p = idx + 3;
        const optParts: string[] = [];
        let picAtCoord: string | undefined;
        while (p < pathStr.length) {
          while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
          if (pathStr[p] === '[') {
            const brk = readBalanced(pathStr, p, '[', ']');
            if (!brk) break;
            optParts.push(brk.content);
            p = brk.endIdx + 1;
            continue;
          }
          if (pathStr.startsWith('at', p) && !/[a-zA-Z0-9_]/.test(pathStr[p + 2] || '')) {
            let q = p + 2;
            while (q < pathStr.length && /\s/.test(pathStr[q])) q++;
            if (pathStr[q] === '(') {
              const par = readBalanced(pathStr, q, '(', ')');
              if (!par) break;
              picAtCoord = par.content;
              p = par.endIdx + 1;
              continue;
            }
          }
          if (pathStr[p] === '(') {
            const par = readBalanced(pathStr, p, '(', ')');
            if (!par) break;
            p = par.endIdx + 1;
            continue;
          }
          break;
        }
        while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
        if (pathStr[p] === '{') {
          const bodyBr = readBalanced(pathStr, p, '{', '}');
          if (bodyBr) {
            const picScope: TikzScopeState = { ...drawScope, vars: pathVars };
            renderPicSpec(optParts.join(', '), bodyBr.content, picAtCoord, picScope, pathNamedCoords, localToSvgPt, deferredNodeItems);
            idx = bodyBr.endIdx + 1;
            continue;
          }
        }
      }

      // edge[opts] [+/?](pt)
      if (pathStr.startsWith('edge', idx) && !/[a-zA-Z]/.test(pathStr[idx + 4] || '')) {
        const { opts: edgeOptsRaw, nextIdx: afterEdgeOpts } = readLeadingBracketOptions(pathStr, idx + 4);
        let p = afterEdgeOpts;
        while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
        let relEdge = false;
        if (pathStr.startsWith('++', p)) { relEdge = true; p += 2; }
        else if (pathStr[p] === '+') { relEdge = true; p += 1; }
        while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
        if (pathStr[p] === '(') {
          const ePar = readBalanced(pathStr, p, '(', ')');
          if (ePar) {
            const targetPt = resolveCoordinateExpr(ePar.content, pathNamedCoords, curPt, relEdge, pathVars, scope.customFuncs, drawBasis);
            if (hasSubpath && !coordFailed && targetPt) {
              const eStyle = parseOptionsString(edgeOptsRaw, drawScope, customColors, unitPx, pathVars, scope.customFuncs);
              const s1 = localToSvgPt(curPt);
              const s2 = localToSvgPt(targetPt);
              const dashAttr = eStyle.dashArray ? ` stroke-dasharray="${eStyle.dashArray}"` : '';
              const mStart = eStyle.arrowStart ? ` marker-start="url(#${ensureArrow(eStyle.stroke)})"` : '';
              const mEnd = eStyle.arrowEnd ? ` marker-end="url(#${ensureArrow(eStyle.stroke)})"` : '';
              const clipAttr = scope.clipId ? ` clip-path="url(#${scope.clipId})"` : '';
              items.push({
                kind: 'path',
                svg: `<path d="M ${s1.x.toFixed(2)} ${s1.y.toFixed(2)} L ${s2.x.toFixed(2)} ${s2.y.toFixed(2)}" fill="none" stroke="${eStyle.stroke}" stroke-width="${eStyle.strokeWidth}"${dashAttr} stroke-linecap="round"${mStart}${mEnd}${clipAttr}/>`,
                bounds: {
                  minX: Math.min(s1.x, s2.x) - 3,
                  minY: Math.min(s1.y, s2.y) - 3,
                  maxX: Math.max(s1.x, s2.x) + 3,
                  maxY: Math.max(s1.y, s2.y) + 3,
                },
              });
              pathPolylines.push([{ ...curPt }, { ...targetPt }]);
            }
            idx = ePar.endIdx + 1;
            continue;
          }
        }
      }

      // to[bend left/right, out=..., in=..., looseness=...] (pt)
      if (pathStr.startsWith('to', idx) && !/[a-zA-Z]/.test(pathStr[idx + 2] || '')) {
        let nextIdx = idx + 2;
        let bendDeg = 0;
        let outDeg: number | null = null;
        let inDeg: number | null = null;
        let looseness = 1;
        while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;
        if (pathStr[nextIdx] === '[') {
          const brk = readBalanced(pathStr, nextIdx, '[', ']');
          if (brk) {
            const bl = brk.content.match(/bend left(?:\s*=\s*(-?\d+(?:\.\d+)?))?/);
            const brr = brk.content.match(/bend right(?:\s*=\s*(-?\d+(?:\.\d+)?))?/);
            if (bl) bendDeg = parseFloat(bl[1] ?? '30') || 30;
            if (brr) bendDeg = -(parseFloat(brr[1] ?? '30') || 30);
            for (const part of splitTopLevel(brk.content, ',')) {
              const eq = part.indexOf('=');
              if (eq === -1) continue;
              const k = part.slice(0, eq).trim().toLowerCase();
              const v = part.slice(eq + 1).trim();
              if (k === 'out') outDeg = evalMathExpr(v, pathVars, false, scope.customFuncs);
              else if (k === 'in') inDeg = evalMathExpr(v, pathVars, false, scope.customFuncs);
              else if (k === 'looseness') {
                const lv = evalMathExpr(v, pathVars, false, scope.customFuncs);
                if (lv !== null && lv > 0) looseness = lv;
              }
            }
            nextIdx = brk.endIdx + 1;
          }
        }
        while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;
        const pendingToNodes: Array<{ opts: string; name?: string; text: string }> = [];
        const pendingToCoords: Array<{ opts: string; name: string }> = [];
        while (nextIdx < pathStr.length) {
          if (pathStr.startsWith('node', nextIdx) && !/[a-zA-Z]/.test(pathStr[nextIdx + 4] || '')) {
            const parsedMid = parseNodeHeader(pathStr, nextIdx + 4);
            if (!parsedMid) break;
            pendingToNodes.push({ opts: parsedMid.opts, name: parsedMid.name, text: parsedMid.text });
            nextIdx = parsedMid.endIdx + 1;
            while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;
            continue;
          }
          if (pathStr.startsWith('coordinate', nextIdx) && !/[a-zA-Z]/.test(pathStr[nextIdx + 10] || '')) {
            const { opts: cOptsRaw, nextIdx: afterCOpts } = readLeadingBracketOptions(pathStr, nextIdx + 10);
            let p = afterCOpts;
            while (p < pathStr.length && /\s/.test(pathStr[p])) p++;
            if (pathStr[p] !== '(') break;
            const cPar = readBalanced(pathStr, p, '(', ')');
            if (!cPar) break;
            pendingToCoords.push({ opts: cOptsRaw, name: cPar.content.trim() });
            nextIdx = cPar.endIdx + 1;
            while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;
            continue;
          }
          break;
        }
        let relTo = false;
        if (pathStr.startsWith('++', nextIdx)) { relTo = true; nextIdx += 2; }
        else if (pathStr[nextIdx] === '+') { relTo = true; nextIdx += 1; }
        while (nextIdx < pathStr.length && /\s/.test(pathStr[nextIdx])) nextIdx++;
        if (pathStr[nextIdx] === '(') {
          const paren = readBalanced(pathStr, nextIdx, '(', ')');
          if (paren) {
            const nextPt = resolveCoordinateExpr(paren.content, pathNamedCoords, curPt, relTo, pathVars, scope.customFuncs, drawBasis);
            if (hasSubpath && !coordFailed && nextPt) {
              const s1 = localToSvgPt(curPt);
              const s2 = localToSvgPt(nextPt);
              if (outDeg !== null || inDeg !== null) {
                const dist = Math.hypot(nextPt.x - curPt.x, nextPt.y - curPt.y);
                const handle = dist * 0.39 * looseness;
                const aOut = ((outDeg ?? (Math.atan2(nextPt.y - curPt.y, nextPt.x - curPt.x) * 180) / Math.PI) * Math.PI) / 180;
                const aIn = ((inDeg ?? (Math.atan2(curPt.y - nextPt.y, curPt.x - nextPt.x) * 180) / Math.PI) * Math.PI) / 180;
                const c1: Point2D = { x: curPt.x + handle * Math.cos(aOut), y: curPt.y + handle * Math.sin(aOut) };
                const c2: Point2D = { x: nextPt.x + handle * Math.cos(aIn), y: nextPt.y + handle * Math.sin(aIn) };
                const sc1 = localToSvgPt(c1);
                const sc2 = localToSvgPt(c2);
                expandBBox(sc1.x, sc1.y);
                expandBBox(sc2.x, sc2.y);
                expandBBox(s2.x, s2.y);
                dCmds.push(
                  `C ${sc1.x.toFixed(2)} ${sc1.y.toFixed(2)}, ${sc2.x.toFixed(2)} ${sc2.y.toFixed(2)}, ${s2.x.toFixed(2)} ${s2.y.toFixed(2)}`
                );
                for (let k = 1; k <= 12; k++) {
                  const t = k / 12;
                  const mt = 1 - t;
                  pushPoly({
                    x: mt * mt * mt * curPt.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * nextPt.x,
                    y: mt * mt * mt * curPt.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * nextPt.y,
                  });
                }
              } else if (bendDeg !== 0) {
                const mx = (s1.x + s2.x) / 2;
                const my = (s1.y + s2.y) / 2;
                const dx = s2.x - s1.x;
                const dy = s2.y - s1.y;
                const k = Math.tan((bendDeg * Math.PI) / 360) * 0.65 * looseness;
                const cx = mx + dy * k;
                const cy = my - dx * k;
                expandBBox(cx, cy);
                expandBBox(s2.x, s2.y);
                dCmds.push(`Q ${cx.toFixed(2)} ${cy.toFixed(2)}, ${s2.x.toFixed(2)} ${s2.y.toFixed(2)}`);
                const tmx = (curPt.x + nextPt.x) / 2;
                const tmy = (curPt.y + nextPt.y) / 2;
                const tdx = nextPt.x - curPt.x;
                const tdy = nextPt.y - curPt.y;
                const tcx = tmx - tdy * k;
                const tcy = tmy + tdx * k;
                for (let s = 1; s <= 12; s++) {
                  const t = s / 12;
                  const mt = 1 - t;
                  pushPoly({
                    x: mt * mt * curPt.x + 2 * mt * t * tcx + t * t * nextPt.x,
                    y: mt * mt * curPt.y + 2 * mt * t * tcy + t * t * nextPt.y,
                  });
                }
              } else {
                expandBBox(s2.x, s2.y);
                dCmds.push(`L ${s2.x.toFixed(2)} ${s2.y.toFixed(2)}`);
                pushPoly(nextPt);
              }
              lastSegFrom = curPt;
              lastSegTo = nextPt;
              for (const mc of pendingToCoords) {
                const cStyle = mc.opts
                  ? parseOptionsString(mc.opts, nodeBaseScope, customColors, unitPx, pathVars, scope.customFuncs)
                  : null;
                const tPos = cStyle?.pos ?? 0.5;
                setNamedCoord(mc.name, {
                  x: lastSegFrom.x + (lastSegTo.x - lastSegFrom.x) * tPos,
                  y: lastSegFrom.y + (lastSegTo.y - lastSegFrom.y) * tPos,
                });
              }
              for (const pn of pendingToNodes) {
                const nStyle = parseOptionsString(pn.opts, nodeBaseScope, customColors, unitPx, pathVars, scope.customFuncs);
                const tPos = nStyle.pos ?? 0.5;
                const nPt = {
                  x: lastSegFrom.x + (lastSegTo.x - lastSegFrom.x) * tPos,
                  y: lastSegFrom.y + (lastSegTo.y - lastSegFrom.y) * tPos,
                };
                if (pn.name) setNamedCoord(pn.name, nPt);
                emitNodeItem(pn.text, nStyle, nPt, localToSvgPt, deferredNodeItems);
              }
              curPt = nextPt;
              lastNodeAnchorPt = nextPt;
            }
            idx = paren.endIdx + 1;
            continue;
          }
        }
      }

      idx++;
    }

    // Store named path polylines for TikZ intersections library (`name path=...`)
    if (st.namePath && pathPolylines.length > 0) {
      execCtx.namedPaths[st.namePath] = pathPolylines;
    }

    // Compute intersections (`name intersections={of=A and B, by={...}}`)
    if (st.nameIntersections) {
      const { pathA, pathB, byNames, prefixName, totalVar } = st.nameIntersections;
      const pA = execCtx.namedPaths[pathA];
      const pB = execCtx.namedPaths[pathB];
      const pts = pA && pB ? computePolylineIntersections(pA, pB) : [];
      const prefix = prefixName || 'intersection';
      for (let k = 0; k < pts.length; k++) {
        namedCoords[`${prefix}-${k + 1}`] = pts[k];
        if (k < byNames.length && byNames[k]) {
          namedCoords[byNames[k]] = pts[k];
        }
      }
      if (totalVar) {
        scope.vars[totalVar.replace(/^\\/, '')] = pts.length;
      }
    }

    if (dCmds.length > 0 && minX < Infinity) {
      const dStr = dCmds.join(' ');
      if (isClipStmt) {
        const clipId = `clip_${items.length + 1}`;
        const rawBounds = { minX, minY, maxX, maxY };
        const clippedBounds = scope.clipBounds
          ? {
              minX: Math.max(scope.clipBounds.minX, rawBounds.minX),
              minY: Math.max(scope.clipBounds.minY, rawBounds.minY),
              maxX: Math.min(scope.clipBounds.maxX, rawBounds.maxX),
              maxY: Math.min(scope.clipBounds.maxY, rawBounds.maxY),
            }
          : rawBounds;
        scope.clipId = clipId;
        scope.clipBounds = clippedBounds;
        items.push({
          kind: 'path',
          svg: `<defs><clipPath id="${clipId}"><path d="${dStr}"/></clipPath></defs>`,
          bounds: clippedBounds,
        });
      }

      if (!isClipStmt || cmd === 'draw' || cmd === 'filldraw') {
        const arrowPad = st.arrowStart || st.arrowEnd ? 6 : 0;
        let itemBounds = {
          minX: minX - arrowPad,
          minY: minY - arrowPad,
          maxX: maxX + arrowPad,
          maxY: maxY + arrowPad,
        };
        let clippedOut = false;
        if (scope.clipBounds && !isClipStmt) {
          const cb = scope.clipBounds;
          itemBounds = {
            minX: Math.max(cb.minX, itemBounds.minX),
            minY: Math.max(cb.minY, itemBounds.minY),
            maxX: Math.min(cb.maxX, itemBounds.maxX),
            maxY: Math.min(cb.maxY, itemBounds.maxY),
          };
          if (itemBounds.minX > itemBounds.maxX || itemBounds.minY > itemBounds.maxY) {
            clippedOut = true;
          }
        }
        if (!clippedOut) {
          let fillAttr = 'none';
          let fillOpAttr = '';
          if (doFill && !isClipStmt) {
            if (st.pattern) {
              const patId = ensurePattern(st.pattern, st.patternColor ?? st.stroke);
              fillAttr = `url(#${patId})`;
            } else {
              fillAttr = st.fill;
              if (st.fillOpacity < 1) fillOpAttr = ` fill-opacity="${st.fillOpacity}"`;
            }
          }
          const strokeAttr = doStroke ? st.stroke : 'none';
          const dashAttr = st.dashArray ? ` stroke-dasharray="${st.dashArray}"` : '';
          const opAttr = st.strokeOpacity < 1 ? ` stroke-opacity="${st.strokeOpacity}"` : '';
          const mStart =
            doStroke && st.arrowStart ? ` marker-start="url(#${ensureArrow(st.stroke)})"` : '';
          const mEnd =
            doStroke && st.arrowEnd ? ` marker-end="url(#${ensureArrow(st.stroke)})"` : '';
          const clipAttr = scope.clipId && !isClipStmt ? ` clip-path="url(#${scope.clipId})"` : '';

          items.push({
            kind: 'path',
            svg: `<path d="${dStr}" fill="${fillAttr}"${fillOpAttr} stroke="${strokeAttr}" stroke-width="${st.strokeWidth}"${dashAttr}${opAttr} stroke-linecap="round" stroke-linejoin="round"${mStart}${mEnd}${clipAttr}/>`,
            bounds: itemBounds,
          });
        }
      }
    }
    if (deferredNodeItems.length > 0) {
      items.push(...deferredNodeItems);
    }
  }
}

function renderPictureEnvToItems(
  envOptsRaw: string,
  body: string,
  items: SvgItem[],
  arrowMarkerIds: Map<string, string>
): void {
  // Standard LaTeX \begin{picture}(w,h)...\end{picture}
  const sizeM = envOptsRaw.match(/^\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
  const scalePx = sizeM
    ? (() => {
        const w = parseFloat(sizeM[1]) || 10;
        return w > 40 ? 2.5 : 36;
      })()
    : 32;

  const ensureArrow = (c: string) => {
    if (!arrowMarkerIds.has(c)) arrowMarkerIds.set(c, `arr_${arrowMarkerIds.size + 1}`);
    return arrowMarkerIds.get(c)!;
  };

  const putRe = /\\put\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*\{/g;
  let pm: RegExpExecArray | null;
  while ((pm = putRe.exec(body)) !== null) {
    const x = (evalMathExpr(pm[1]) ?? 0) * scalePx;
    const y = -(evalMathExpr(pm[2]) ?? 0) * scalePx;
    const br = readBalanced(body, pm.index + pm[0].length - 1, '{', '}');
    if (!br) continue;
    const inner = br.content.trim();

    const lineM = inner.match(/^\\(line|vector)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*\{([^}]+)\}$/);
    if (lineM) {
      const isVec = lineM[1] === 'vector';
      const dx = evalMathExpr(lineM[2]) ?? 1;
      const dy = evalMathExpr(lineM[3]) ?? 0;
      const len = (evalMathExpr(lineM[4]) ?? 1) * scalePx;
      const norm = Math.hypot(dx, dy) || 1;
      const x2 = x + (dx / norm) * len;
      const y2 = y - (dy / norm) * len;
      const mEnd = isVec ? ` marker-end="url(#${ensureArrow('#0F172A')})"` : '';
      items.push({
        kind: 'line',
        svg: `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#0F172A" stroke-width="1.3"${mEnd}/>`,
        bounds: {
          minX: Math.min(x, x2) - 4,
          minY: Math.min(y, y2) - 4,
          maxX: Math.max(x, x2) + 4,
          maxY: Math.max(y, y2) + 4,
        },
      });
      continue;
    }

    const circM = inner.match(/^\\circle(\*?)\s*\{([^}]+)\}$/);
    if (circM) {
      const filled = Boolean(circM[1]);
      const r = ((evalMathExpr(circM[2]) ?? 1) * scalePx) / 2;
      items.push({
        kind: 'circle',
        svg: `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${filled ? '#0F172A' : 'none'}" stroke="#0F172A" stroke-width="1.2"/>`,
        bounds: { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r },
      });
      continue;
    }

    const f = formatTikzLabelToSvg(inner, 13);
    if (f.tspans) {
      items.push({
        kind: 'text',
        svg: `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="13" font-family="Times New Roman, serif" fill="#0F172A">${f.tspans}</text>`,
        bounds: { minX: x, minY: y - 13, maxX: x + f.plainLength * 8, maxY: y + 4 },
      });
    }
  }

  const qbezRe = /\\qbezier\s*\(([^,]+),([^)]+)\)\s*\(([^,]+),([^)]+)\)\s*\(([^,]+),([^)]+)\)/g;
  let qm: RegExpExecArray | null;
  while ((qm = qbezRe.exec(body)) !== null) {
    const x1 = (evalMathExpr(qm[1]) ?? 0) * scalePx;
    const y1 = -(evalMathExpr(qm[2]) ?? 0) * scalePx;
    const cx = (evalMathExpr(qm[3]) ?? 0) * scalePx;
    const cy = -(evalMathExpr(qm[4]) ?? 0) * scalePx;
    const x2 = (evalMathExpr(qm[5]) ?? 0) * scalePx;
    const y2 = -(evalMathExpr(qm[6]) ?? 0) * scalePx;
    items.push({
      kind: 'path',
      svg: `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="#0F172A" stroke-width="1.3"/>`,
      bounds: {
        minX: Math.min(x1, cx, x2),
        minY: Math.min(y1, cy, y2),
        maxX: Math.max(x1, cx, x2),
        maxY: Math.max(y1, cy, y2),
      },
    });
  }
}

export function renderLatexPictureToSvgDataUrl(
  envName: 'tikzpicture' | 'pgfpicture' | 'picture',
  rawBody: string,
  customColors: Record<string, string> = {}
): RenderedLatexFigure | null {
  const unitPx = 42;
  const items: SvgItem[] = [];
  const arrowMarkerIds = new Map<string, string>();
  const patternsUsed = new Map<string, string>();

  let body = stripTikzComments(rawBody).trimStart();
  let envOptsRaw = '';

  if (envName === 'picture') {
    const szM = body.match(/^\(\s*[^)]+\s*\)(?:\(\s*[^)]+\s*\))?/);
    if (szM) {
      envOptsRaw = szM[0];
      body = body.slice(szM[0].length);
    }
    renderPictureEnvToItems(envOptsRaw, body, items, arrowMarkerIds);
  } else {
    if (body.startsWith('[')) {
      const optBr = readBalanced(body, 0, '[', ']');
      if (optBr) {
        envOptsRaw = optBr.content;
        body = body.slice(optBr.endIdx + 1);
      }
    }

    const baseScope: TikzScopeState = {
      scaleX: 1,
      scaleY: 1,
      shiftX: 0,
      shiftY: 0,
      rotateDeg: 0,
      color: '#0F172A',
      lineWidth: 1.3,
      fill: 'none',
      fillOpacity: 1,
    };
    if (envOptsRaw) {
      const st = parseOptionsString(envOptsRaw, baseScope, customColors, unitPx);
      baseScope.scaleX = st.scaleX ?? 1;
      baseScope.scaleY = st.scaleY ?? 1;
      baseScope.shiftX = st.shiftX ?? 0;
      baseScope.shiftY = st.shiftY ?? 0;
      baseScope.shiftXPx = st.shiftXPx ?? 0;
      baseScope.shiftYPx = st.shiftYPx ?? 0;
      baseScope.rotateDeg = st.rotateDeg ?? 0;
      baseScope.color = st.stroke;
      baseScope.lineWidth = st.strokeWidth;
      baseScope.dashArray = st.dashArray;
      if (st.fontSize !== undefined) baseScope.fontSize = st.fontSize;
      if (st.fontWeight !== undefined) baseScope.fontWeight = st.fontWeight;
      if (st.customFuncs) baseScope.customFuncs = st.customFuncs;
      if (st.trigRad !== undefined) baseScope.trigRad = st.trigRad;
    }

    if (/\\tkzTab(?:Init|Line|Var)/.test(body)) {
      patternsUsed.set('north east lines::#94A3B8', 'pat_ne');
      renderTkzTabToItems(body, items, arrowMarkerIds);
    } else {
      const { body: euclidExpanded, presetCoords } = preprocessTkzEuclide(body);
      executeTikzStatements(
        euclidExpanded,
        baseScope,
        presetCoords,
        customColors,
        items,
        arrowMarkerIds,
        patternsUsed,
        unitPx
      );
    }
  }

  if (items.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    if (it.bounds.minX < minX) minX = it.bounds.minX;
    if (it.bounds.minY < minY) minY = it.bounds.minY;
    if (it.bounds.maxX > maxX) maxX = it.bounds.maxX;
    if (it.bounds.maxY > maxY) maxY = it.bounds.maxY;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;

  const pad = 16;
  const vbX = Math.floor(minX - pad);
  const vbY = Math.floor(minY - pad);
  const vbW = Math.max(80, Math.ceil(maxX - minX + pad * 2));
  const vbH = Math.max(50, Math.ceil(maxY - minY + pad * 2));

  const defsParts: string[] = [];
  arrowMarkerIds.forEach((id, color) => {
    defsParts.push(
      `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="${color}"/></marker>`
    );
  });
  patternsUsed.forEach((id, key) => {
    const [patName, color] = key.split('::');
    if (patName.includes('north east')) {
      defsParts.push(
        `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${color}" stroke-width="1.3"/></pattern>`
      );
    } else if (patName.includes('north west')) {
      defsParts.push(
        `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${color}" stroke-width="1.3"/></pattern>`
      );
    } else if (patName.includes('crosshatch')) {
      defsParts.push(
        `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M 0 0 L 8 8 M 8 0 L 0 8" stroke="${color}" stroke-width="1"/></pattern>`
      );
    } else if (patName.includes('dots')) {
      defsParts.push(
        `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.1" fill="${color}"/></pattern>`
      );
    } else {
      defsParts.push(
        `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><line x1="0" y1="4" x2="8" y2="4" stroke="${color}" stroke-width="1.2"/></pattern>`
      );
    }
  });

  const defsXml = defsParts.length > 0 ? `<defs>${defsParts.join('')}</defs>` : '';
  const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" style="background:#FFFFFF">${defsXml}${items.map((it) => it.svg).join('')}</svg>`;
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgXml)}`;

  return {
    dataUrl,
    widthPx: vbW,
    heightPx: vbH,
  };
}
