/**
 * Safe arithmetic formula engine for the Analyst Workbench (§4.6 "Formula application and
 * result calculations"). Formulas are configured as master data and evaluated here — never
 * with eval/Function — so a stored formula cannot execute arbitrary code.
 *
 * Grammar:  expr := term (('+'|'-') term)*
 *           term := power (('*'|'/') power)*
 *           power := unary ('^' power)?
 *           unary := '-' unary | primary
 *           primary := number | ident | ident '(' args ')' | '(' expr ')'
 */

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log10: Math.log10,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  sum: (...a) => a.reduce((x, y) => x + y, 0),
  avg: (...a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN),
  round: (x, d = 0) => {
    const f = 10 ** d;
    return Math.round(x * f) / f;
  },
};

export class FormulaError extends Error {}

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  const re = /\s*(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|[-+*/^(),])/y;
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new FormulaError(`Unexpected character "${src[i]}" at position ${i + 1}`);
    tokens.push(m[1]);
    i = re.lastIndex;
  }
  return tokens;
}

function parse(src: string): Node {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const eat = (s?: string) => {
    const v = tk[p];
    if (s !== undefined && v !== s) throw new FormulaError(`Expected "${s}" but found "${v ?? 'end of formula'}"`);
    p++;
    return v;
  };

  const expr = (): Node => {
    let n = term();
    while (peek() === '+' || peek() === '-') {
      const op = eat() as '+' | '-';
      n = { t: 'bin', op, a: n, b: term() };
    }
    return n;
  };
  const term = (): Node => {
    let n = power();
    while (peek() === '*' || peek() === '/') {
      const op = eat() as '*' | '/';
      n = { t: 'bin', op, a: n, b: power() };
    }
    return n;
  };
  const power = (): Node => {
    const base = unary();
    if (peek() === '^') {
      eat();
      return { t: 'bin', op: '^', a: base, b: power() };
    }
    return base;
  };
  const unary = (): Node => {
    if (peek() === '-') {
      eat();
      return { t: 'neg', a: unary() };
    }
    if (peek() === '+') {
      eat();
      return unary();
    }
    return primary();
  };
  const primary = (): Node => {
    const v = peek();
    if (v === undefined) throw new FormulaError('Unexpected end of formula');
    if (v === '(') {
      eat('(');
      const n = expr();
      eat(')');
      return n;
    }
    if (/^[\d.]/.test(v)) {
      eat();
      return { t: 'num', v: Number(v) };
    }
    if (/^[A-Za-z_]/.test(v)) {
      eat();
      if (peek() === '(') {
        const fn = v.toLowerCase();
        if (!FUNCTIONS[fn]) throw new FormulaError(`Unknown function "${v}"`);
        eat('(');
        const args: Node[] = [];
        if (peek() !== ')') {
          args.push(expr());
          while (peek() === ',') {
            eat(',');
            args.push(expr());
          }
        }
        eat(')');
        return { t: 'call', fn, args };
      }
      return { t: 'var', name: v };
    }
    throw new FormulaError(`Unexpected "${v}"`);
  };

  const root = expr();
  if (p < tk.length) throw new FormulaError(`Unexpected "${tk[p]}"`);
  return root;
}

function collectVars(n: Node, out: Set<string>) {
  switch (n.t) {
    case 'var':
      out.add(n.name);
      break;
    case 'neg':
      collectVars(n.a, out);
      break;
    case 'bin':
      collectVars(n.a, out);
      collectVars(n.b, out);
      break;
    case 'call':
      n.args.forEach((a) => collectVars(a, out));
      break;
  }
}

function evalNode(n: Node, vars: Record<string, number>): number {
  switch (n.t) {
    case 'num':
      return n.v;
    case 'var': {
      if (!(n.name in vars)) throw new FormulaError(`Missing value for "${n.name}"`);
      const v = Number(vars[n.name]);
      if (!Number.isFinite(v)) throw new FormulaError(`Value for "${n.name}" is not a number`);
      return v;
    }
    case 'neg':
      return -evalNode(n.a, vars);
    case 'bin': {
      const a = evalNode(n.a, vars);
      const b = evalNode(n.b, vars);
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0) throw new FormulaError('Division by zero');
          return a / b;
        case '^':
          return a ** b;
      }
    }
    // falls through (unreachable)
    case 'call':
      return FUNCTIONS[(n as { fn: string }).fn](...(n as { args: Node[] }).args.map((a) => evalNode(a, vars)));
  }
}

/** Parse a formula and return the variable names it references. Throws FormulaError on syntax errors. */
export function formulaVariables(expression: string): string[] {
  const s = new Set<string>();
  collectVars(parse(expression), s);
  return [...s];
}

export function evaluateFormula(expression: string, vars: Record<string, number>): number {
  const result = evalNode(parse(expression), vars);
  if (!Number.isFinite(result)) throw new FormulaError('Result is not a finite number');
  return result;
}

/** Mean of 2–5 replicate values (report type "Multiple values + average"). */
export function average(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
