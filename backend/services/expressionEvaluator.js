// File path: backend/services/expressionEvaluator.js
// Purpose: Evaluates a simple arithmetic formula (e.g. "profit / revenue
// * 100") against a row's column values, for the "add a computed
// column" AI-modification operation. This is NOT eval() or new
// Function() — it's a hand-rolled tokenizer + recursive-descent parser
// that only ever recognizes numbers, +, -, *, /, parentheses, and
// column-name identifiers. There is no way to reach arbitrary code
// execution through it: the grammar has no function calls, no property
// access, no string literals — nothing but arithmetic. This is what
// makes it safe to build from an AI-proposed formula string at all.

const ApiError = require('../utils/ApiError');

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if ('+-*/()'.includes(ch)) { tokens.push({ type: ch, value: ch }); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      if (!/^\d+(\.\d+)?$/.test(num)) throw new ApiError(400, `Invalid number in expression: '${num}'`);
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) { ident += expr[i]; i++; }
      tokens.push({ type: 'identifier', value: ident });
      continue;
    }
    throw new ApiError(400, `Unsupported character in expression: '${ch}'`);
  }
  return tokens;
}

// Grammar (standard precedence, left-associative):
//   expr   := term (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := number | identifier | '-' factor | '(' expr ')'
function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = (type) => {
    const t = tokens[pos];
    if (!t || (type && t.type !== type)) throw new ApiError(400, `Malformed expression near position ${pos}`);
    pos++;
    return t;
  };

  function parseFactor() {
    const t = peek();
    if (!t) throw new ApiError(400, 'Unexpected end of expression');
    if (t.type === 'number') { consume(); return { type: 'number', value: t.value }; }
    if (t.type === 'identifier') { consume(); return { type: 'identifier', value: t.value }; }
    if (t.type === '-') { consume(); return { type: 'negate', value: parseFactor() }; }
    if (t.type === '(') {
      consume();
      const inner = parseExpr();
      consume(')');
      return inner;
    }
    throw new ApiError(400, `Unexpected token in expression: '${t.value}'`);
  }

  function parseTerm() {
    let node = parseFactor();
    while (peek() && (peek().type === '*' || peek().type === '/')) {
      const op = consume().type;
      node = { type: 'binary', op, left: node, right: parseFactor() };
    }
    return node;
  }

  function parseExpr() {
    let node = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = consume().type;
      node = { type: 'binary', op, left: node, right: parseTerm() };
    }
    return node;
  }

  const ast = parseExpr();
  if (pos !== tokens.length) throw new ApiError(400, 'Unexpected trailing tokens in expression');
  return ast;
}

/**
 * Parses an expression string and returns its AST plus the set of
 * column-name identifiers it references (for validating those columns
 * actually exist before ever evaluating a single row).
 */
function compileExpression(expr) {
  const tokens = tokenize(expr);
  const ast = parse(tokens);
  const identifiers = new Set();
  (function walk(node) {
    if (node.type === 'identifier') identifiers.add(node.value);
    else if (node.type === 'negate') walk(node.value);
    else if (node.type === 'binary') { walk(node.left); walk(node.right); }
  })(ast);
  return { ast, identifiers: [...identifiers] };
}

// Evaluates a compiled AST against one row's values. Returns null (never
// throws, never returns NaN/Infinity) if any referenced value is
// missing/non-numeric or the operation is undefined (e.g. divide by
// zero) — a computed column simply has a blank cell for that row rather
// than corrupting the dataset with NaN/Infinity.
function evaluateExpression(ast, rowValues) {
  function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[$,%\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function evalNode(node) {
    if (node.type === 'number') return node.value;
    if (node.type === 'identifier') return toNum(rowValues[node.value]);
    if (node.type === 'negate') {
      const v = evalNode(node.value);
      return v === null ? null : -v;
    }
    if (node.type === 'binary') {
      const l = evalNode(node.left);
      const r = evalNode(node.right);
      if (l === null || r === null) return null;
      if (node.op === '+') return l + r;
      if (node.op === '-') return l - r;
      if (node.op === '*') return l * r;
      if (node.op === '/') return r === 0 ? null : l / r;
    }
    return null;
  }

  const result = evalNode(ast);
  return result === null || !Number.isFinite(result) ? null : Number(result.toFixed(6));
}

module.exports = { compileExpression, evaluateExpression };
