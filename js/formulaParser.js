/**
 * ============================================================
 * formulaParser.js ― 安全な四則演算パーサー（数式評価エンジン）
 * ============================================================
 * ユーザーが入力した計算式を計算するとき、JavaScript の eval() や
 * new Function() を使うと不正なコードが実行される危険性があります。
 * そのため、このファイルでは「数字・四則演算(+ - * /)・括弧」だけを
 * 自分の手で順番に解釈して計算する安全な仕組み（再帰下降パーサー）を実装しています。
 *
 * 処理の流れ：
 *   1. normalizeExpression : 全角数字や「×」「÷」を半角にそろえる
 *   2. tokenizeExpression  : 文字列を「数字」「演算子」「括弧」の部品（トークン）に分ける
 *   3. evaluateTokens      : 算数のルール（括弧 → 掛け割り → 足し引き）に沿って計算する
 */

/**
 * 全角の数字・記号（スマホの日本語キーボードで入力されがち）を半角ASCII文字に変換します。
 *
 * @param {string} rawExpr
 * @returns {string}
 */
function normalizeExpression(rawExpr) {
  return String(rawExpr ?? '')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/[＋]/g, '+')
    .replace(/[－−ー]/g, '-')
    .replace(/[＊×]/g, '*')
    .replace(/[／÷]/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/　/g, ' ');
}

/**
 * 数式文字列をトークン（意味のある最小単位）の配列に分解します。
 * 許可されていない文字や「1.2.3」のような不正な小数点があれば null を返します。
 *
 * @param {string} expr
 * @returns {Array<{type: 'number'|'op'|'paren', value: number|string}>|null}
 */
function tokenizeExpression(expr) {
  const tokens = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // 空白文字は読み飛ばす
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // 数字または小数点の並びを1つの数値トークンとして読み取る
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      let dotCount = 0;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        if (expr[i] === '.') dotCount += 1;
        numStr += expr[i];
        i += 1;
      }
      // 小数点が2つ以上、単独の "."、末尾が "."（例: "10."）は構文エラー扱いにする
      if (dotCount > 1 || numStr === '.' || numStr.endsWith('.')) {
        return null;
      }
      const num = Number(numStr);
      if (!Number.isFinite(num)) return null;
      tokens.push({ type: 'number', value: num });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i += 1;
      continue;
    }

    // 想定外の文字が1つでも含まれていたら計算エラーにする
    return null;
  }

  return tokens.length > 0 ? tokens : null;
}

/**
 * トークン配列を算数の優先順位に従って評価します。
 *
 * 優先順位（下ほど先に計算される）：
 *   1. parseExpression : 足し算・引き算（+ / -）
 *   2. parseTerm       : 掛け算・割り算（* / /）
 *   3. parseUnary      : 符号付きの単項演算（-500 や +(10+20) など）
 *   4. parsePrimary    : 数値リテラル と 括弧 ( ... )
 *
 * @param {Array<{type: string, value: number|string}>} tokens
 * @returns {number|null}
 */
function evaluateTokens(tokens) {
  let pos = 0;

  function peek() {
    return tokens[pos] || null;
  }

  function consume() {
    const tok = tokens[pos];
    pos += 1;
    return tok;
  }

  function parseExpression() {
    let left = parseTerm();
    while (true) {
      const tok = peek();
      if (!tok || tok.type !== 'op' || (tok.value !== '+' && tok.value !== '-')) {
        break;
      }
      consume();
      const right = parseTerm();
      left = tok.value === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    while (true) {
      const tok = peek();
      if (!tok || tok.type !== 'op' || (tok.value !== '*' && tok.value !== '/')) {
        break;
      }
      consume();
      const right = parseUnary();
      if (tok.value === '/') {
        // 0での割り算は Infinity にせず明示的に計算エラーとする
        if (right === 0) throw new Error('Division by zero');
        left /= right;
      } else {
        left *= right;
      }
    }
    return left;
  }

  function parseUnary() {
    const tok = peek();
    if (tok && tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
      consume();
      const val = parseUnary();
      return tok.value === '-' ? -val : val;
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of expression');

    if (tok.type === 'number') {
      consume();
      return tok.value;
    }

    if (tok.type === 'paren' && tok.value === '(') {
      consume();
      const val = parseExpression();
      const closing = peek();
      if (!closing || closing.type !== 'paren' || closing.value !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      consume();
      return val;
    }

    throw new Error('Unexpected token');
  }

  try {
    const result = parseExpression();
    // 式の途中に余計なトークンが残っていたり、無限大・NaNになった場合はエラー
    if (pos !== tokens.length || !Number.isFinite(result)) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * 四則演算の数式文字列を安全に評価して数値結果を返します。
 * 構文エラーや0除算などの場合は null を返します。
 *
 * @param {string} rawExpr
 * @returns {number|null}
 */
export function evaluateMathExpression(rawExpr) {
  const normalized = normalizeExpression(rawExpr);
  const tokens = tokenizeExpression(normalized);
  if (!tokens) return null;
  return evaluateTokens(tokens);
}
