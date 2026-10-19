/* =========================================================
   CALCULATOR ENGINE (no DOM access in this section)
   ========================================================= */

const OPS = '+−×÷^';
const MAX_LENGTH = 60;
const FUNCTION_TOKENS = { sin: 'sin(', cos: 'cos(', tan: 'tan(', log: 'log(', ln: 'ln(', sqrt: '√(' };

/** Angle unit used by sin, cos and tan: 'deg' or 'rad'. */
let angleUnit = 'deg';

function setAngleUnit(unit) {
    angleUnit = unit === 'rad' ? 'rad' : 'deg';
}

const toRadians = (x) => (angleUnit === 'deg' ? x * Math.PI / 180 : x);

const MATH_FUNCTIONS = {
    sin: (x) => Math.sin(toRadians(x)),
    cos: (x) => Math.cos(toRadians(x)),
    tan: (x) => {
        if (Math.abs(Math.cos(toRadians(x))) < 1e-12) throw new Error('DOMAIN');
        return Math.tan(toRadians(x));
    },
    log: (x) => { if (x <= 0) throw new Error('DOMAIN'); return Math.log10(x); },
    ln: (x) => { if (x <= 0) throw new Error('DOMAIN'); return Math.log(x); },
    sqrt: (x) => { if (x < 0) throw new Error('DOMAIN'); return Math.sqrt(x); }
};

/** Splits an expression into tokens, adds hidden multiplication signs and closes open brackets. */
function tokenize(expression) {
    const pattern = /\s*(\d+\.?\d*|\.\d+|sin\(|cos\(|tan\(|log\(|ln\(|√\(|[+−×÷^%()πe])/y;
    const raw = [];
    let position = 0;

    while (position < expression.length) {
        pattern.lastIndex = position;
        const match = pattern.exec(expression);
        if (!match) throw new Error('SYNTAX');
        position = pattern.lastIndex;

        const text = match[1];
        if (/^[\d.]/.test(text)) raw.push({ type: 'num', value: parseFloat(text) });
        else if (text === 'π' || text === 'e') raw.push({ type: 'const', value: text === 'π' ? Math.PI : Math.E });
        else if (text.length > 1) raw.push({ type: 'fn', value: text === '√(' ? 'sqrt' : text.slice(0, -1) });
        else if (text === '(') raw.push({ type: 'open' });
        else if (text === ')') raw.push({ type: 'close' });
        else if (text === '%') raw.push({ type: 'percent' });
        else raw.push({ type: 'op', value: text });
    }

    const endsValue = (t) => ['num', 'const', 'close', 'percent'].includes(t.type);
    const startsValue = (t) => ['num', 'const', 'open', 'fn'].includes(t.type);

    const tokens = [];
    let depth = 0;
    raw.forEach((token, index) => {
        if (index > 0 && endsValue(raw[index - 1]) && startsValue(token)) {
            tokens.push({ type: 'op', value: '×' });
        }
        if (token.type === 'open' || token.type === 'fn') depth++;
        if (token.type === 'close') {
            depth--;
            if (depth < 0) throw new Error('SYNTAX');
        }
        tokens.push(token);
    });
    while (depth-- > 0) tokens.push({ type: 'close' });

    return tokens;
}

/**
 * Evaluates an expression with + − × ÷ ^ % ( ) π e and sin cos tan log ln √.
 * A small recursive-descent parser is used instead of eval().
 * Percent works like a phone calculator: "200 + 10%" is 220.
 */
function evaluate(expression) {
    const tokens = tokenize(expression);
    let i = 0;

    const peek = () => tokens[i];
    const isOp = (...ops) => peek() && peek().type === 'op' && ops.includes(peek().value);

    function expectClose() {
        if (!peek() || peek().type !== 'close') throw new Error('SYNTAX');
        i++;
    }

    function primary() {
        const token = tokens[i++];
        if (!token) throw new Error('SYNTAX');

        if (token.type === 'num' || token.type === 'const') return token.value;
        if (token.type === 'open') {
            const inner = sum().value;
            expectClose();
            return inner;
        }
        if (token.type === 'fn') {
            const inner = sum().value;
            expectClose();
            return MATH_FUNCTIONS[token.value](inner);
        }
        throw new Error('SYNTAX');
    }

    function postfix() {
        let value = primary();
        let isPercent = false;
        while (peek() && peek().type === 'percent') {
            i++;
            value /= 100;
            isPercent = true;
        }
        return { value, isPercent };
    }

    function power() {
        const base = postfix();
        if (!isOp('^')) return base;
        i++;
        const exponent = unary().value;

        if (base.value === 0 && exponent < 0) throw new Error('DIV0');
        const value = Math.pow(base.value, exponent);
        if (Number.isNaN(value)) throw new Error('DOMAIN');
        return { value, isPercent: false };
    }

    function unary() {
        if (isOp('−')) {
            i++;
            const inner = unary();
            return { value: -inner.value, isPercent: inner.isPercent };
        }
        return power();
    }

    function term() {
        let left = unary();
        while (isOp('×', '÷')) {
            const operator = tokens[i++].value;
            const right = unary();
            if (operator === '÷' && right.value === 0) throw new Error('DIV0');
            left = { value: operator === '×' ? left.value * right.value : left.value / right.value, isPercent: false };
        }
        return left;
    }

    function sum() {
        let left = term();
        while (isOp('+', '−')) {
            const operator = tokens[i++].value;
            const right = term();
            const operand = right.isPercent ? left.value * right.value : right.value;
            left = { value: operator === '+' ? left.value + operand : left.value - operand, isPercent: false };
        }
        return left;
    }

    const result = sum().value;
    if (i < tokens.length) throw new Error('SYNTAX');
    if (!Number.isFinite(result) || Math.abs(result) >= 1e15) throw new Error('RANGE');
    return result;
}

/** Converts a number to a clean plain-text string (no float noise, no exponent). */
function toPlain(value) {
    let n = parseFloat(value.toPrecision(12));
    if (Object.is(n, -0)) n = 0;

    let text = n.toString();
    if (/e/i.test(text)) {
        text = n.toFixed(12);
        if (text.includes('.')) text = text.replace(/\.?0+$/, '');
        if (text === '-0' || text === '') text = '0';
    }
    return text.replace('-', '−');
}

/** Adds thousands separators to every number inside a string. */
function formatNumberString(text) {
    return text.replace(/\d+(?:\.\d*)?/g, (match) => {
        const [whole, decimals] = match.split('.');
        const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return decimals === undefined ? grouped : `${grouped}.${decimals}`;
    });
}

/** Formats an expression for display: grouped numbers and spaced operators. */
function formatExpression(expression) {
    return formatNumberString(expression)
        .replace(/([+−×÷^])/g, ' $1 ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^− /, '−')
        .replace(/([+−×÷^]) − /g, '$1 −')
        .replace(/\( − /g, '(−')
        .replace(/\( /g, '(')
        .replace(/ \)/g, ')');
}

function createCalculator() {
    let expr = '';          // what the user has typed, e.g. "12+3×4"
    let lastExpr = '';      // the expression that produced the current result
    let done = false;       // true right after "="
    let error = '';         // error message to show, if any

    const lastChar = () => expr.slice(-1);
    const trailingNumber = () => expr.match(/(\d*\.?\d*)$/)[1];
    const stripTrailingOperators = (text) => text.replace(/[+−×÷^]+$/, '');
    const startsOperand = (c) => c === '' || c === '(' || OPS.includes(c);
    const hasOperation = (text) => /[+−×÷^%()πe]|sin|cos|tan|log|ln|√/.test(text.replace(/^−/, ''));

    function clearError() {
        if (error) {
            expr = '';
            lastExpr = '';
            done = false;
            error = '';
        }
    }

    function startFresh() {
        if (done) {
            expr = '';
            lastExpr = '';
            done = false;
        }
    }

    function continueFromResult() {
        if (done) {
            lastExpr = '';
            done = false;
        }
    }

    function digit(d) {
        clearError();
        startFresh();
        if (lastChar() === '%' || expr.length >= MAX_LENGTH) return;

        if (trailingNumber() === '0') {
            if (d === '0') return;
            expr = expr.slice(0, -1) + d;
        } else {
            expr += d;
        }
    }

    function decimal() {
        clearError();
        startFresh();
        if (lastChar() === '%' || expr.length >= MAX_LENGTH - 1) return;

        const number = trailingNumber();
        if (number.includes('.')) return;
        expr += number === '' ? '0.' : '.';
    }

    function operator(op) {
        clearError();
        continueFromResult();
        if (expr.length >= MAX_LENGTH) return;

        const last = lastChar();

        if (op === '−') {
            if (startsOperand(last) && last !== '+' && last !== '−') { expr += '−'; return; }
            if (last === '+') { expr = expr.slice(0, -1) + '−'; return; }
            if (last === '−') return;
            expr += '−';
            return;
        }

        if (expr === '' || last === '(') return;
        const base = stripTrailingOperators(expr);
        if (base === '' || base.endsWith('(')) return;
        expr = base + op;
    }

    function paren(p) {
        clearError();
        if (p === '(') {
            startFresh();
            if (expr.length < MAX_LENGTH) expr += '(';
            return;
        }
        if (done) return;
        const opens = (expr.match(/\(/g) || []).length;
        const closes = (expr.match(/\)/g) || []).length;
        if (opens <= closes || startsOperand(lastChar())) return;
        expr += ')';
    }

    function func(name) {
        clearError();
        const token = FUNCTION_TOKENS[name];
        if (!token) return;
        if (done) {
            expr = token + expr;
            lastExpr = '';
            done = false;
            return;
        }
        if (expr.length + token.length <= MAX_LENGTH) expr += token;
    }

    function constant(symbol) {
        clearError();
        startFresh();
        if (expr.length < MAX_LENGTH) expr += symbol;
    }

    function percent() {
        clearError();
        continueFromResult();
        if (/[\dπe.)]$/.test(expr) && !expr.endsWith('%') && expr.length < MAX_LENGTH) expr += '%';
    }

    function square() {
        clearError();
        continueFromResult();
        if (/[\dπe)]$/.test(expr) && expr.length < MAX_LENGTH - 1) expr += '^2';
    }

    function backspace() {
        if (error || done) { clear(); return; }
        expr = expr.replace(/(sin\(|cos\(|tan\(|log\(|ln\(|√\(|.)$/, '');
    }

    function clear() {
        expr = '';
        lastExpr = '';
        done = false;
        error = '';
    }

    function sign() {
        clearError();
        continueFromResult();

        if (expr === '') { expr = '−'; return; }
        if (expr === '−') { expr = ''; return; }

        const last = lastChar();
        if (last === '(' || OPS.includes(last)) { operator('−'); return; }

        const match = expr.match(/(\d*\.?\d*)%?$/);
        if (!match || match[1] === '') return;   // ends with a bracket or a constant

        const start = expr.length - match[0].length;
        const before = expr[start - 2];
        const isNegative = expr[start - 1] === '−' &&
            (start - 1 === 0 || OPS.includes(before) || before === '(');

        expr = isNegative
            ? expr.slice(0, start - 1) + expr.slice(start)
            : expr.slice(0, start) + '−' + expr.slice(start);
    }

    function equals() {
        if (error || done || expr === '') return null;

        const text = stripTrailingOperators(expr);
        if (!hasOperation(text)) return null;

        try {
            const result = toPlain(evaluate(text));
            lastExpr = text;
            expr = result;
            done = true;
            return { expression: text, result };
        } catch (e) {
            lastExpr = text;
            error = e.message === 'DIV0' ? 'Cannot divide by zero'
                : e.message === 'RANGE' ? 'Result is too large'
                    : e.message === 'DOMAIN' ? 'Invalid input'
                        : 'Invalid expression';
            return null;
        }
    }

    /** Handles a single key. Returns {expression, result} when "=" produced a result. */
    function press(key) {
        if (/^\d$/.test(key)) { digit(key); return null; }
        if (OPS.includes(key)) { operator(key); return null; }
        if (FUNCTION_TOKENS[key]) { func(key); return null; }

        switch (key) {
            case '.': decimal(); break;
            case '(': case ')': paren(key); break;
            case '%': percent(); break;
            case 'square': square(); break;
            case 'pi': constant('π'); break;
            case 'e': constant('e'); break;
            case 'back': backspace(); break;
            case 'clear': clear(); break;
            case 'sign': sign(); break;
            case '=': return equals();
        }
        return null;
    }

    /** Puts a ready-made number (history item, last answer) into the expression. */
    function insert(text) {
        clearError();
        startFresh();
        if (lastChar() === '%') return;
        const number = trailingNumber();
        expr = expr.slice(0, expr.length - number.length) + text;
    }

    /** Replaces everything with a value so the user can keep calculating. */
    function setExpression(value) {
        clear();
        expr = value;
    }

    /** The error currently shown, or an empty string. */
    function errorText() {
        return error;
    }

    /** Returns the text to show: the expression line and the live result line. */
    function view() {
        if (error) {
            return { expression: formatExpression(lastExpr), result: error, isError: true };
        }

        if (done) {
            return { expression: `${formatExpression(lastExpr)} =`, result: formatNumberString(expr), isError: false };
        }

        if (expr === '') return { expression: '', result: '0', isError: false };
        if (expr === '−') return { expression: '', result: '−', isError: false };

        const text = stripTrailingOperators(expr);

        if (/^−?\d*\.?\d*$/.test(text)) {
            // Only a number so far, unless an operator was just typed after it
            const pending = text !== expr ? formatExpression(expr) : '';
            return { expression: pending, result: formatNumberString(text), isError: false };
        }

        let result;
        try {
            result = formatNumberString(toPlain(evaluate(text || '0')));
        } catch {
            result = '—';
        }
        return { expression: formatExpression(expr), result, isError: false };
    }

    return { press, view, insert, setExpression, errorText };
}


/* ===== UI ===== */

(function () {
    'use strict';

    /* Optional: put your GitHub repository link here to show a "Source" link in the footer. */
    var SOURCE_URL = '';

    var $ = function (id) { return document.getElementById(id); };
    var calculator = createCalculator();
    var mode = 'standard';
    var currentPage = 'calculator';
    var currentConvType = 'length';
    var lastAnswer = null;

    /* ---------- Safe localStorage helpers ---------- */

    var storage = {
        get: function (key, fallback) {
            try {
                var value = localStorage.getItem(key);
                return value === null ? fallback : JSON.parse(value);
            } catch (e) {
                return fallback;
            }
        },
        set: function (key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
        }
    };

    /* ---------- Unit data ---------- */

    var convData = {
        currency: { title: 'Currency', subtitle: 'Fixed, approximate rates (not live)', units: [
            { id: 'usd', name: 'US Dollar (USD)', factor: 1 }, { id: 'eur', name: 'Euro (EUR)', factor: 0.92 },
            { id: 'gbp', name: 'British Pound (GBP)', factor: 0.79 }, { id: 'jpy', name: 'Japanese Yen (JPY)', factor: 149.5 },
            { id: 'inr', name: 'Indian Rupee (INR)', factor: 83.1 }, { id: 'cny', name: 'Chinese Yuan (CNY)', factor: 7.24 },
            { id: 'aud', name: 'Australian Dollar (AUD)', factor: 1.53 }, { id: 'cad', name: 'Canadian Dollar (CAD)', factor: 1.36 }] },
        volume: { title: 'Volume', subtitle: 'Convert between volume units', units: [
            { id: 'ml', name: 'Milliliter', factor: 1 }, { id: 'l', name: 'Liter', factor: 1000 },
            { id: 'gal', name: 'US Gallon', factor: 3785.411784 }, { id: 'qt', name: 'US Quart', factor: 946.352946 },
            { id: 'pt', name: 'US Pint', factor: 473.176473 }, { id: 'cup', name: 'US Cup', factor: 236.5882365 },
            { id: 'floz', name: 'US Fluid Ounce', factor: 29.5735295625 }, { id: 'tbsp', name: 'Tablespoon', factor: 14.78676478 },
            { id: 'tsp', name: 'Teaspoon', factor: 4.92892159 }, { id: 'm3', name: 'Cubic Meter', factor: 1e6 },
            { id: 'cm3', name: 'Cubic Centimeter', factor: 1 }] },
        length: { title: 'Length', subtitle: 'Convert between length units', units: [
            { id: 'mm', name: 'Millimeter', factor: 1 }, { id: 'cm', name: 'Centimeter', factor: 10 },
            { id: 'm', name: 'Meter', factor: 1000 }, { id: 'km', name: 'Kilometer', factor: 1e6 },
            { id: 'in', name: 'Inch', factor: 25.4 }, { id: 'ft', name: 'Foot', factor: 304.8 },
            { id: 'yd', name: 'Yard', factor: 914.4 }, { id: 'mi', name: 'Mile', factor: 1609344 },
            { id: 'nm', name: 'Nautical Mile', factor: 1852000 }] },
        weight: { title: 'Weight & Mass', subtitle: 'Convert between weight units', units: [
            { id: 'mg', name: 'Milligram', factor: 1 }, { id: 'g', name: 'Gram', factor: 1000 },
            { id: 'kg', name: 'Kilogram', factor: 1e6 }, { id: 'mt', name: 'Metric Ton', factor: 1e9 },
            { id: 'oz', name: 'Ounce', factor: 28349.523125 }, { id: 'lb', name: 'Pound', factor: 453592.37 },
            { id: 'st', name: 'Stone', factor: 6350293.18 }] },
        temperature: { title: 'Temperature', subtitle: 'Convert between temperature scales', special: true, units: [
            { id: 'c', name: 'Celsius' }, { id: 'f', name: 'Fahrenheit' }, { id: 'k', name: 'Kelvin' }] },
        energy: { title: 'Energy', subtitle: 'Convert between energy units', units: [
            { id: 'j', name: 'Joule', factor: 1 }, { id: 'kj', name: 'Kilojoule', factor: 1000 },
            { id: 'cal', name: 'Calorie', factor: 4.184 }, { id: 'kcal', name: 'Kilocalorie', factor: 4184 },
            { id: 'wh', name: 'Watt-hour', factor: 3600 }, { id: 'kwh', name: 'Kilowatt-hour', factor: 3600000 },
            { id: 'btu', name: 'BTU', factor: 1055.056 }, { id: 'ev', name: 'Electronvolt', factor: 1.602176634e-19 }] },
        area: { title: 'Area', subtitle: 'Convert between area units', units: [
            { id: 'mm2', name: 'Square Millimeter', factor: 1 }, { id: 'cm2', name: 'Square Centimeter', factor: 100 },
            { id: 'm2', name: 'Square Meter', factor: 1e6 }, { id: 'km2', name: 'Square Kilometer', factor: 1e12 },
            { id: 'ha', name: 'Hectare', factor: 1e10 }, { id: 'in2', name: 'Square Inch', factor: 645.16 },
            { id: 'ft2', name: 'Square Foot', factor: 92903.04 }, { id: 'ac', name: 'Acre', factor: 4046856422.4 }] },
        speed: { title: 'Speed', subtitle: 'Convert between speed units', units: [
            { id: 'ms', name: 'Meters/second', factor: 1 }, { id: 'kmh', name: 'Kilometers/hour', factor: 1 / 3.6 },
            { id: 'mph', name: 'Miles/hour', factor: 0.44704 }, { id: 'kn', name: 'Knot', factor: 1852 / 3600 },
            { id: 'fts', name: 'Feet/second', factor: 0.3048 }] },
        time: { title: 'Time', subtitle: 'Convert between time units', units: [
            { id: 'ms', name: 'Millisecond', factor: 1 }, { id: 's', name: 'Second', factor: 1000 },
            { id: 'min', name: 'Minute', factor: 60000 }, { id: 'hr', name: 'Hour', factor: 3600000 },
            { id: 'day', name: 'Day', factor: 864e5 }, { id: 'wk', name: 'Week', factor: 6048e5 },
            { id: 'mo', name: 'Month (30 days)', factor: 2592e6 }, { id: 'yr', name: 'Year (365 days)', factor: 31536e6 }] },
        power: { title: 'Power', subtitle: 'Convert between power units', units: [
            { id: 'w', name: 'Watt', factor: 1 }, { id: 'kw', name: 'Kilowatt', factor: 1000 },
            { id: 'mw', name: 'Megawatt', factor: 1e6 }, { id: 'hp', name: 'Horsepower', factor: 745.69987158 },
            { id: 'btuh', name: 'BTU/hour', factor: 0.29307107 }] },
        data: { title: 'Data', subtitle: 'Convert between digital storage units', units: [
            { id: 'bit', name: 'Bit', factor: 1 }, { id: 'byte', name: 'Byte', factor: 8 },
            { id: 'kb', name: 'Kilobyte', factor: 8192 }, { id: 'mb', name: 'Megabyte', factor: 8388608 },
            { id: 'gb', name: 'Gigabyte', factor: 8589934592 }, { id: 'tb', name: 'Terabyte', factor: 8796093022208 },
            { id: 'pb', name: 'Petabyte', factor: 9007199254740992 }] },
        pressure: { title: 'Pressure', subtitle: 'Convert between pressure units', units: [
            { id: 'pa', name: 'Pascal', factor: 1 }, { id: 'kpa', name: 'Kilopascal', factor: 1000 },
            { id: 'mpa', name: 'Megapascal', factor: 1e6 }, { id: 'bar', name: 'Bar', factor: 1e5 },
            { id: 'atm', name: 'Atmosphere', factor: 101325 }, { id: 'psi', name: 'PSI', factor: 6894.757 },
            { id: 'mmhg', name: 'mmHg', factor: 133.322 }] }
    };

    /* ---------- Elements ---------- */

    var resultEl = $('result'), exprEl = $('expression'), btnGrid = $('btnGrid');
    var historyList = $('historyList'), historyClear = $('historyClear'), historySection = $('historySection');
    var sidebar = $('sidebar'), sidebarOverlay = $('sidebarOverlay'), menuToggle = $('menuToggle');
    var toastContainer = $('toastContainer'), angleBtn = $('angleBtn'), historyToggle = $('historyToggle');
    var shortcuts = $('shortcuts');

    /* ---------- Toast ---------- */

    function showToast(message) {
        var toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(function () {
            toast.classList.add('out');
            setTimeout(function () { toast.remove(); }, 300);
        }, 2200);
    }

    /* ---------- Sidebar and navigation ---------- */

    function setSidebar(open) {
        sidebar.classList.toggle('open', open);
        sidebarOverlay.classList.toggle('show', open);
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }

    menuToggle.addEventListener('click', function () { setSidebar(!sidebar.classList.contains('open')); });
    sidebarOverlay.addEventListener('click', function () { setSidebar(false); });

    document.querySelectorAll('.nav-item[data-page]').forEach(function (item) {
        item.addEventListener('click', function () {
            navigateTo(item.dataset.page);
            setSidebar(false);
        });
    });

    document.querySelectorAll('.nav-item[data-toggle]').forEach(function (item) {
        item.addEventListener('click', function () {
            var open = item.classList.toggle('expanded');
            $(item.dataset.toggle).classList.toggle('open', open);
            item.setAttribute('aria-expanded', String(open));
        });
    });

    function setTitle(first, rest) {
        var title = $('pageTitle');
        title.textContent = '';
        var span = document.createElement('span');
        span.textContent = first;
        title.append(span, document.createTextNode(rest));
    }

    function navigateTo(page) {
        currentPage = page;
        if (page === 'calculator' && document.activeElement && document.activeElement.blur) document.activeElement.blur();

        document.querySelectorAll('.nav-item').forEach(function (n) {
            n.classList.remove('active');
            n.removeAttribute('aria-current');
        });
        var navItem = document.querySelector('.nav-item[data-page="' + page + '"]');
        if (navItem) {
            navItem.classList.add('active');
            navItem.setAttribute('aria-current', 'page');
        }

        document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
        historyToggle.hidden = page !== 'calculator';

        if (page === 'calculator') {
            $('page-calculator').classList.add('active');
            setTitle('Calc', 'ulator');
        } else if (page === 'settings') {
            $('page-settings').classList.add('active');
            setTitle('Sett', 'ings');
        } else if (page.indexOf('conv-') === 0) {
            currentConvType = page.replace('conv-', '');
            renderConverter();
            $('page-converter').classList.add('active');
            setTitle('Conv', 'erter · ' + convData[currentConvType].title);
        }
        $('content').scrollTop = 0;
    }

    /* ---------- Calculator buttons ---------- */

    function b(label, cls, key, extra) {
        var def = { label: label, cls: cls, key: key };
        if (extra) Object.keys(extra).forEach(function (k) { def[k] = extra[k]; });
        return def;
    }

    var standardButtons = [
        b('AC', 'clear', 'clear', { aria: 'Clear all' }), b('⌫', 'fn', 'back', { aria: 'Backspace' }), b('%', 'fn', '%', { aria: 'Percent' }), b('÷', 'op', '÷', { aria: 'Divide' }),
        b('7', 'num', '7'), b('8', 'num', '8'), b('9', 'num', '9'), b('×', 'op', '×', { aria: 'Multiply' }),
        b('4', 'num', '4'), b('5', 'num', '5'), b('6', 'num', '6'), b('−', 'op', '−', { aria: 'Subtract' }),
        b('1', 'num', '1'), b('2', 'num', '2'), b('3', 'num', '3'), b('+', 'op', '+', { aria: 'Add' }),
        b('±', 'fn', 'sign', { aria: 'Toggle positive or negative' }), b('0', 'num', '0'), b('.', 'num', '.', { aria: 'Decimal point' }), b('=', 'equals', '=', { aria: 'Equals' })
    ];

    var sciButtons = [
        b('sin', 'sci', 'sin'), b('cos', 'sci', 'cos'), b('tan', 'sci', 'tan'), b('AC', 'clear', 'clear', { aria: 'Clear all' }), b('⌫', 'fn', 'back', { aria: 'Backspace' }),
        b('log', 'sci', 'log'), b('ln', 'sci', 'ln'), b('√', 'sci', 'sqrt', { aria: 'Square root' }), b('%', 'fn', '%', { aria: 'Percent' }), b('÷', 'op', '÷', { aria: 'Divide' }),
        b('x²', 'sci', 'square', { aria: 'Square' }), b('xʸ', 'op', '^', { aria: 'Power' }), b('(', 'fn', '('), b(')', 'fn', ')'), b('×', 'op', '×', { aria: 'Multiply' }),
        b('7', 'num', '7'), b('8', 'num', '8'), b('9', 'num', '9'), b('−', 'op', '−', { aria: 'Subtract' }), b('π', 'sci', 'pi', { aria: 'Pi' }),
        b('4', 'num', '4'), b('5', 'num', '5'), b('6', 'num', '6'), b('+', 'op', '+', { aria: 'Add' }), b('e', 'sci', 'e', { aria: 'Euler number' }),
        b('1', 'num', '1'), b('2', 'num', '2'), b('3', 'num', '3'), b('±', 'fn', 'sign', { aria: 'Toggle positive or negative' }), b('ANS', 'sci', 'ans', { aria: 'Last answer' }),
        b('0', 'num', '0', { wide: true }), b('.', 'num', '.', { aria: 'Decimal point' }), b('=', 'equals', '=', { wide: true, aria: 'Equals' })
    ];

    function renderButtons() {
        var buttons = mode === 'standard' ? standardButtons : sciButtons;
        btnGrid.className = 'btn-grid ' + mode;
        btnGrid.textContent = '';

        buttons.forEach(function (def) {
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'btn ' + def.cls + (def.wide ? ' wide' : '');
            el.textContent = def.label;
            el.dataset.key = def.key;
            el.setAttribute('aria-label', def.aria || def.label);
            btnGrid.appendChild(el);
        });
    }

    btnGrid.addEventListener('click', function (event) {
        var el = event.target.closest('.btn');
        if (!el) return;
        createRipple(event, el);
        handleKey(el.dataset.key);
    });

    function createRipple(event, el) {
        if (!event.clientX && !event.clientY) return;   // keyboard-triggered click
        var rect = el.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        var ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (event.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (event.clientY - rect.top - size / 2) + 'px';
        el.appendChild(ripple);
        ripple.addEventListener('animationend', function () { ripple.remove(); });
    }

    /* ---------- Display ---------- */

    function render() {
        var view = calculator.view();

        exprEl.textContent = view.expression;
        exprEl.scrollLeft = exprEl.scrollWidth;

        resultEl.textContent = view.result;
        resultEl.classList.toggle('is-error', view.isError);
        resultEl.scrollLeft = resultEl.scrollWidth;

        var length = view.result.length;
        resultEl.dataset.len = view.isError ? 'lg' : length > 15 ? 'sm' : length > 10 ? 'md' : 'lg';
    }

    function flash(className) {
        resultEl.classList.add(className);
        setTimeout(function () { resultEl.classList.remove(className); }, className === 'computed' ? 800 : 500);
    }

    function handleKey(key) {
        var hadError = calculator.errorText() !== '';

        if (key === 'ans') {
            if (lastAnswer !== null) calculator.insert(lastAnswer);
        } else {
            var evaluated = calculator.press(key);
            if (evaluated) {
                addHistory(evaluated.expression, evaluated.result);
                lastAnswer = evaluated.result;
                flash('computed');
            }
        }

        var error = calculator.errorText();
        if (error && !hadError) {
            flash('shake');
            showToast(error);
        }
        render();
    }

    /* ---------- Mode and angle unit ---------- */

    function setMode(next) {
        mode = next;
        document.querySelectorAll('.mode-btn').forEach(function (button) {
            var active = button.dataset.mode === mode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        $('modeName').textContent = mode === 'standard' ? 'Standard' : 'Scientific';
        angleBtn.hidden = mode !== 'scientific';
        renderButtons();
        storage.set('luxe-mode', mode);
    }

    document.querySelectorAll('.mode-btn').forEach(function (button) {
        button.addEventListener('click', function () { setMode(button.dataset.mode); button.blur(); });
    });

    function setAngle(unit) {
        setAngleUnit(unit);
        angleBtn.textContent = unit === 'rad' ? 'RAD' : 'DEG';
        angleBtn.setAttribute('aria-label', unit === 'rad'
            ? 'Angle unit: radians. Press to switch to degrees.'
            : 'Angle unit: degrees. Press to switch to radians.');
        storage.set('luxe-angle', unit);
        render();
    }

    angleBtn.addEventListener('click', function () { setAngle(angleUnit === 'deg' ? 'rad' : 'deg'); });

    /* ---------- History ---------- */

    var HISTORY_LIMIT = 50;
    var history = storage.get('luxe-history', []);
    if (!Array.isArray(history)) history = [];
    history = history
        .filter(function (item) { return item && typeof item.expr === 'string' && typeof item.result === 'string'; })
        .slice(0, HISTORY_LIMIT);

    function addHistory(expr, result) {
        history.unshift({ expr: expr, result: result });
        history = history.slice(0, HISTORY_LIMIT);
        storage.set('luxe-history', history);
        renderHistory();
    }

    function renderHistory() {
        historyList.textContent = '';
        historyClear.hidden = history.length === 0;

        if (!history.length) {
            var empty = document.createElement('div');
            empty.className = 'history-empty';
            empty.textContent = 'No calculations yet';
            historyList.appendChild(empty);
            return;
        }

        history.forEach(function (entry) {
            var item = document.createElement('button');
            var expr = document.createElement('span');
            var result = document.createElement('span');

            item.type = 'button';
            item.className = 'history-item';
            item.title = 'Use this result';
            expr.className = 'history-expr';
            expr.textContent = formatExpression(entry.expr);
            result.className = 'history-result';
            result.textContent = '= ' + formatNumberString(entry.result);

            item.append(expr, result);
            item.addEventListener('click', function () {
                calculator.setExpression(entry.result);
                render();
            });
            historyList.appendChild(item);
        });
    }

    historyClear.addEventListener('click', function () {
        history = [];
        storage.set('luxe-history', history);
        renderHistory();
        showToast('History cleared');
    });

    historyToggle.addEventListener('click', function () {
        var show = historySection.hidden;
        historySection.hidden = !show;
        historyToggle.setAttribute('aria-pressed', String(show));
    });

    /* ---------- Converter ---------- */

    function formatConverted(value) {
        if (!isFinite(value)) return '--';
        if (value === 0) return '0';
        var size = Math.abs(value);
        if (size < 1e-6 || size >= 1e15) {
            return value.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'e');
        }
        return parseFloat(value.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 12 });
    }

    function tempConvert(value, from, to) {
        if (from === to) return value;
        var celsius = from === 'c' ? value : from === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
        if (to === 'c') return celsius;
        return to === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15;
    }

    function renderConverter() {
        var data = convData[currentConvType];
        var page = $('page-converter');
        var options = data.units.map(function (u) {
            return '<option value="' + u.id + '">' + u.name + '</option>';
        }).join('');

        page.innerHTML =
            '<div class="converter-card">' +
            '<h2 class="converter-title">' + data.title + '</h2>' +
            '<p class="converter-subtitle">' + data.subtitle + '</p>' +
            '<div class="converter-row">' +
            '<div class="converter-input"><label for="convFrom">From</label>' +
            '<input type="number" id="convFrom" value="1" step="any" inputmode="decimal">' +
            '<select id="convFromUnit" aria-label="Convert from">' + options + '</select></div>' +
            '<button class="swap-btn" id="convSwap" type="button" aria-label="Swap units"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg></button>' +
            '<div class="converter-input"><label for="convTo">To</label>' +
            '<input type="text" id="convTo" readonly aria-live="polite">' +
            '<select id="convToUnit" aria-label="Convert to">' + options + '</select></div>' +
            '</div>' +
            '<div class="converter-result-box"><div class="converter-result-value" id="convResultValue">--</div>' +
            '<div class="converter-result-label" id="convResultLabel"></div></div></div>';

        if (data.units.length > 1) $('convToUnit').selectedIndex = 1;
        doConvert();

        $('convFrom').addEventListener('input', doConvert);
        $('convFromUnit').addEventListener('change', doConvert);
        $('convToUnit').addEventListener('change', doConvert);
        $('convSwap').addEventListener('click', function () {
            var from = $('convFromUnit'), to = $('convToUnit');
            var previous = from.value;
            from.value = to.value;
            to.value = previous;
            doConvert();
        });
    }

    function doConvert() {
        var data = convData[currentConvType];
        var raw = $('convFrom').value;
        var fromId = $('convFromUnit').value;
        var toId = $('convToUnit').value;
        var fromUnit = data.units.find(function (u) { return u.id === fromId; });
        var toUnit = data.units.find(function (u) { return u.id === toId; });
        if (!fromUnit || !toUnit) return;

        var text = '--';
        if (raw.trim() !== '' && isFinite(Number(raw))) {
            var value = Number(raw);
            var result = data.special ? tempConvert(value, fromId, toId) : value * fromUnit.factor / toUnit.factor;
            text = formatConverted(result);
        }

        $('convTo').value = text;
        $('convResultValue').textContent = text;
        $('convResultLabel').textContent = fromUnit.name + ' → ' + toUnit.name;
    }

    /* ---------- Settings ---------- */

    var THEME_NAMES = { sage: 'Sage green', gold: 'Golden', orange: 'Orange', pink: 'Baby pink', '': 'Midnight' };

    function applyTheme(theme) {
        document.documentElement.classList.remove('sage', 'gold', 'orange', 'pink');
        if (theme) document.documentElement.classList.add(theme);
        document.querySelectorAll('.theme-opt').forEach(function (opt) {
            var active = opt.dataset.theme === theme;
            opt.classList.toggle('active', active);
            opt.setAttribute('aria-pressed', String(active));
        });
        readAccent();
    }

    document.querySelectorAll('.theme-opt').forEach(function (opt) {
        opt.addEventListener('click', function () {
            var theme = opt.dataset.theme;
            applyTheme(theme);
            storage.set('luxe-theme', theme);
            showToast('Theme: ' + (THEME_NAMES[theme] || 'Midnight'));
        });
    });

    function applyFontSize(size) {
        document.documentElement.dataset.fs = size;
        $('fontSizeSelect').value = size;
    }

    $('fontSizeSelect').addEventListener('change', function () {
        applyFontSize(this.value);
        storage.set('luxe-fontsize', this.value);
        showToast('Font size: ' + this.value.charAt(0).toUpperCase() + this.value.slice(1));
    });

    /* ---------- Shortcuts dialog and footer ---------- */

    $('shortcutsBtn').addEventListener('click', function () {
        if (shortcuts.showModal) shortcuts.showModal();
    });
    $('shortcutsClose').addEventListener('click', function () { shortcuts.close(); });
    shortcuts.addEventListener('click', function (event) {
        if (event.target === shortcuts) shortcuts.close();
    });

    if (SOURCE_URL) {
        var sourceLink = $('sourceLink');
        sourceLink.href = SOURCE_URL;
        sourceLink.hidden = false;
    }
    $('year').textContent = new Date().getFullYear();

    /* ---------- Keyboard ---------- */

    var KEY_MAP = {
        '.': '.', ',': '.', '+': '+', '-': '−', '−': '−',
        '*': '×', 'x': '×', 'X': '×', '×': '×',
        '/': '÷', '÷': '÷', '%': '%',
        'Enter': '=', '=': '=', 'Backspace': 'back', 'Escape': 'clear', 'Delete': 'clear'
    };
    var SCI_KEYS = { '(': '(', ')': ')', '^': '^', 'p': 'pi', 'P': 'pi' };

    function flashKey(key) {
        var button = btnGrid.querySelector('[data-key="' + key + '"]');
        if (!button) return;
        button.classList.add('is-pressed');
        setTimeout(function () { button.classList.remove('is-pressed'); }, 130);
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && sidebar.classList.contains('open')) {
            setSidebar(false);
            return;
        }
        if (currentPage !== 'calculator' || shortcuts.open) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.target.closest && event.target.closest('input, select, textarea, .sidebar, .topbar, .footer, .history-section, .calc-header')) return;

        var key = /^\d$/.test(event.key) ? event.key : KEY_MAP[event.key];
        if (!key && mode === 'scientific') key = SCI_KEYS[event.key];
        if (!key) return;

        event.preventDefault();
        handleKey(key);
        flashKey(key);
    });

    /* ---------- Particles ---------- */

    var canvas = $('particles'), ctx = canvas.getContext('2d');
    var particles = [], mouseX = 0, mouseY = 0, accent = [232, 168, 73];
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function readAccent() {
        var value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        var match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
        if (match) accent = [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
    }

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function drawParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var rgb = accent.join(',');

        particles.forEach(function (p) {
            var dx = mouseX - p.x, dy = mouseY - p.y;
            if (dx * dx + dy * dy < 25600) { p.x += dx * 0.0006; p.y += dy * 0.0006; }
            if (!reduceMotion) { p.x += p.sx; p.y += p.sy; }
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(' + rgb + ',' + p.opacity + ')';
            ctx.fill();
        });

        for (var i = 0; i < particles.length; i++) {
            for (var j = i + 1; j < particles.length; j++) {
                var dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
                var distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 90) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.05 * (1 - distance / 90)) + ')';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animateParticles() {
        if (!document.hidden) drawParticles();
        if (!reduceMotion) requestAnimationFrame(animateParticles);
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('mousemove', function (event) { mouseX = event.clientX; mouseY = event.clientY; });
    for (var n = 0; n < 32; n++) {
        particles.push({
            x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
            size: Math.random() * 1.6 + 0.5, sx: (Math.random() - 0.5) * 0.25, sy: (Math.random() - 0.5) * 0.25,
            opacity: Math.random() * 0.25 + 0.08
        });
    }

    /* ---------- Start ---------- */

    (function () {
        var saved = storage.get('luxe-theme', '');
        applyTheme(THEME_NAMES.hasOwnProperty(saved) ? saved : '');
    })();
    applyFontSize(storage.get('luxe-fontsize', 'medium'));
    var savedMode = storage.get('luxe-mode', 'standard');
    setMode(savedMode === 'scientific' ? 'scientific' : 'standard');
    setAngle(storage.get('luxe-angle', 'deg') === 'rad' ? 'rad' : 'deg');
    renderHistory();
    render();
    animateParticles();
})();