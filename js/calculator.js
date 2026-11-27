/**
 * ============================================================
 * calculator.js ― 収支・扶養/控除・家計バランス・計算式の純粋計算ロジック
 * ============================================================
 * 現在アクティブなモード（学生 / 社会人）のプロファイルをもとに計算します。
 */

import {
  APP_MODES,
  FORMULA_VAR,
  DEFAULT_WALL_LIMIT,
  SIDE_JOB_WALL_LIMIT,
  STANDARD_MONTHLY_WORK_HOURS,
  DAILY_BUDGET_WARN_THRESHOLD,
  WALL_WARN_PERCENT,
  getCategoriesForMode
} from './constants.js?v=11';
import { getActiveProfile } from './storage.js?v=11';
import { evaluateMathExpression } from './formulaParser.js?v=11';
import { calcStudentShiftSummary } from './shiftCalculator.js?v=11';

/**
 * 総務省のふるさと納税上限額目安表をベースにした簡易早見テーブル。
 * 各行は [給与年収, 独身・共働き, 夫婦(控除あり), 夫婦+高校生1人]（単位：円）を表します。
 */
const FURUSATO_REFERENCE_TABLE = [
  [1500000, 8000, 0, 0],
  [2000000, 15000, 6000, 0],
  [2500000, 21000, 12000, 4000],
  [3000000, 28000, 19000, 11000],
  [3500000, 34000, 25000, 17000],
  [4000000, 42000, 33000, 25000],
  [4500000, 52000, 43000, 34000],
  [5000000, 61000, 49000, 40000],
  [5500000, 69000, 60000, 48000],
  [6000000, 77000, 69000, 60000],
  [6500000, 97000, 86000, 76000],
  [7000000, 108000, 97000, 86000],
  [7500000, 120000, 109000, 97000],
  [8000000, 129000, 120000, 110000],
  [8500000, 141000, 132000, 121000],
  [9000000, 152000, 141000, 132000],
  [9500000, 165000, 154000, 142000],
  [10000000, 176000, 166000, 156000]
];

const FURUSATO_COLUMN_INDEX = {
  single: 1,
  spouse: 2,
  spouse_teen: 3
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getRatioStatus(percent, isExceeded) {
  if (isExceeded) return 'danger';
  if (percent > WALL_WARN_PERCENT) return 'warn';
  return 'safe';
}

/**
 * 社会人モードの今月の「額面 → 手取り概算」を計算します。
 *
 * @param {object} workerIncome
 * @returns {{ grossMonthly: number, deductionAmount: number, baseTakeHome: number, totalTakeHome: number }}
 */
export function calcWorkerTakeHome(workerIncome) {
  const grossSalary = Number(workerIncome.grossSalary) || 0;
  const overtimePay = Number(workerIncome.overtimePay) || 0;
  const otherNetIncome = Number(workerIncome.otherNetIncome) || 0;

  const grossMonthly = grossSalary + overtimePay;
  const rate = clamp(Number(workerIncome.deductionRate) || 0, 0, 100);
  const deductionAmount = Math.round(grossMonthly * (rate / 100));
  const baseTakeHome = grossMonthly - deductionAmount;
  const totalTakeHome = baseTakeHome + otherNetIncome;

  return {
    grossMonthly,
    deductionAmount,
    baseTakeHome,
    totalTakeHome
  };
}

/**
 * 現在のアクティブモードに応じたダッシュボード全体の収支指標を計算します。
 *
 * @param {object} appData
 * @returns {object}
 */
export function calcMetrics(appData) {
  const isWorker = appData.mode === APP_MODES.WORKER;
  const profile = getActiveProfile(appData);

  let partTimeMonthly = 0;
  let partTimeGrossMonthly = 0;
  let partTimeHours = 0;
  let studentShift = null;
  let workerTakeHome = { grossMonthly: 0, deductionAmount: 0, baseTakeHome: 0, totalTakeHome: 0 };
  let totalIncome = 0;
  let effectiveHourly = 0;

  if (isWorker) {
    workerTakeHome = calcWorkerTakeHome(profile.workerIncome || {});
    totalIncome = workerTakeHome.totalTakeHome;
    effectiveHourly = Math.round(totalIncome / STANDARD_MONTHLY_WORK_HOURS);
  } else {
    const inc = profile.income || {};
    studentShift = calcStudentShiftSummary(profile);
    const allowance = Number(inc.allowance) || 0;
    const other = Number(inc.other) || 0;
    partTimeGrossMonthly = studentShift.grossPay;
    partTimeMonthly = studentShift.netPay;
    partTimeHours = studentShift.totalHours;
    totalIncome = partTimeMonthly + allowance + other;
    effectiveHourly = studentShift.wage;
  }

  // 有効（チェックON）の固定費合計と年額換算（×12）
  const fixedTotal = profile.fixedExpenses
    .filter((item) => item.active)
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const annualFixedTotal = fixedTotal * 12;

  // 変動費合計
  const varTotal = profile.varExpenses
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  // 先取り・確保額（社会人モードでは目標貯金に加えてNISA等とクレカ予定額も含める）
  const savingsGoal = Number(profile.settings.savingsGoal) || 0;
  const investGoal = isWorker ? (Number(profile.settings.investGoal) || 0) : 0;
  const creditPending = isWorker ? (Number(profile.settings.creditPending) || 0) : 0;
  const reservedTotal = savingsGoal + investGoal + creditPending;

  const daysLeft = Math.max(1, Number(profile.settings.daysLeft) || 1);
  const totalOutflow = fixedTotal + varTotal + reservedTotal;
  const freeBalance = totalIncome - totalOutflow;
  const dailyBudget = Math.floor(freeBalance / daysLeft);

  const spendableTotal = Math.max(1, totalIncome - fixedTotal - reservedTotal);
  const remainRatio = clamp((freeBalance / spendableTotal) * 100, 0, 100);

  let budgetStatus = 'safe';
  if (dailyBudget < 0) {
    budgetStatus = 'danger';
  } else if (dailyBudget < DAILY_BUDGET_WARN_THRESHOLD) {
    budgetStatus = 'warn';
  }

  return {
    isWorker,
    partTimeMonthly,
    partTimeGrossMonthly,
    partTimeHours,
    studentShift,
    workerTakeHome,
    totalIncome,
    fixedTotal,
    annualFixedTotal,
    varTotal,
    savingsGoal,
    investGoal,
    creditPending,
    reservedTotal,
    totalOutflow,
    daysLeft,
    freeBalance,
    dailyBudget,
    remainRatio,
    effectiveHourly,
    budgetStatus
  };
}

/**
 * 学生モード：扶養の壁の進捗率・残り金額・あと働ける時間を計算します。
 * 税制・社会保険の基準に合わせ、まかない等差し引き前の支給額（額面）で累計を算出します。
 *
 * @param {object} studentProfile
 * @param {number} [partTimeGrossMonthly]
 * @returns {object}
 */
export function calcWallMetrics(studentProfile, partTimeGrossMonthly = 0) {
  const inc = studentProfile.income || {};
  const ytdIncome = Number(inc.ytdIncome) || 0;
  const limit = Math.max(1, Number(inc.wallLimit) || DEFAULT_WALL_LIMIT);
  const wage = Number(inc.wage) || 0;
  const currentMonthlyGross = Math.max(0, Number(partTimeGrossMonthly) || 0);

  const projectedYearly = ytdIncome + currentMonthlyGross;
  const remainYen = limit - projectedYearly;
  const wallPercent = clamp((projectedYearly / limit) * 100, 0, 100);
  const remainHours = wage > 0 ? Math.max(0, remainYen / wage) : 0;
  const isExceeded = remainYen < 0;

  return {
    projectedYearly,
    limit,
    remainYen,
    wallPercent,
    remainHours,
    isExceeded,
    wallStatus: getRatioStatus(wallPercent, isExceeded)
  };
}

/**
 * 社会人モード：年収と家族構成からふるさと納税の寄付上限目安を補間計算します。
 *
 * @param {object} workerIncome
 * @returns {object}
 */
export function calcFurusatoMetrics(workerIncome) {
  const annualGross = Math.max(0, Number(workerIncome.annualGross) || 0);
  const colIdx = FURUSATO_COLUMN_INDEX[workerIncome.familyType] || FURUSATO_COLUMN_INDEX.single;
  const donated = Math.max(0, Number(workerIncome.furusatoDonated) || 0);

  let rawCap = 0;
  const firstRow = FURUSATO_REFERENCE_TABLE[0];
  const lastRow = FURUSATO_REFERENCE_TABLE[FURUSATO_REFERENCE_TABLE.length - 1];

  if (annualGross < firstRow[0]) {
    rawCap = 0;
  } else if (annualGross >= lastRow[0]) {
    rawCap = lastRow[colIdx] + (annualGross - lastRow[0]) * 0.028;
  } else {
    for (let i = 0; i < FURUSATO_REFERENCE_TABLE.length - 1; i += 1) {
      const lower = FURUSATO_REFERENCE_TABLE[i];
      const upper = FURUSATO_REFERENCE_TABLE[i + 1];
      if (annualGross >= lower[0] && annualGross <= upper[0]) {
        const ratio = (annualGross - lower[0]) / (upper[0] - lower[0]);
        rawCap = lower[colIdx] + ratio * (upper[colIdx] - lower[colIdx]);
        break;
      }
    }
  }

  const estimatedCap = Math.max(0, Math.floor(rawCap / 1000) * 1000);
  const remainCap = estimatedCap - donated;
  const percent = estimatedCap > 0
    ? clamp((donated / estimatedCap) * 100, 0, 100)
    : (donated > 0 ? 100 : 0);
  const isExceeded = remainCap < 0;

  return {
    estimatedCap,
    donated,
    remainCap,
    percent,
    isExceeded,
    status: getRatioStatus(percent, isExceeded)
  };
}

/**
 * 社会人モード：副業20万円の壁（確定申告ライン）の進捗を計算します。
 *
 * @param {object} workerIncome
 * @returns {object}
 */
export function calcSideJobMetrics(workerIncome) {
  const profit = Math.max(0, Number(workerIncome.ytdSideProfit) || 0);
  const remainYen = SIDE_JOB_WALL_LIMIT - profit;
  const percent = clamp((profit / SIDE_JOB_WALL_LIMIT) * 100, 0, 100);
  const isExceeded = profit > SIDE_JOB_WALL_LIMIT;

  return {
    limit: SIDE_JOB_WALL_LIMIT,
    profit,
    remainYen,
    percent,
    isExceeded,
    status: getRatioStatus(percent, isExceeded)
  };
}

/**
 * 収入に対する「固定費／変動費／貯蓄・余力」の家計バランス比率（%）を計算します。
 *
 * @param {object} metrics
 * @returns {{ fixedPct: number, varPct: number, savingPct: number, savingAmount: number }}
 */
export function calcExpenseRatio(metrics) {
  if (metrics.totalIncome <= 0) {
    return { fixedPct: 0, varPct: 0, savingPct: 0, savingAmount: 0 };
  }

  const savingAmount = Math.max(0, metrics.totalIncome - metrics.fixedTotal - metrics.varTotal);
  const fixedPct = clamp(Math.round((metrics.fixedTotal / metrics.totalIncome) * 100), 0, 100);
  const varPct = clamp(Math.round((metrics.varTotal / metrics.totalIncome) * 100), 0, 100 - fixedPct);
  const savingPct = savingAmount > 0 ? clamp(100 - fixedPct - varPct, 0, 100) : 0;

  return { fixedPct, varPct, savingPct, savingAmount };
}

/**
 * 変動費を現在のモードのカテゴリ別に集計し、割合（%）付きの配列を返します。
 *
 * @param {Array} varExpenses
 * @param {number} varTotal
 * @param {string} [mode]
 * @returns {Array<{category: string, amount: number, percent: number}>}
 */
export function calcCategoryBreakdown(varExpenses, varTotal, mode = APP_MODES.STUDENT) {
  if (varTotal <= 0) return [];

  const categories = getCategoriesForMode(mode);
  const sums = {};
  categories.forEach((cat) => {
    sums[cat] = 0;
  });

  varExpenses.forEach((item) => {
    const amount = Number(item.amount) || 0;
    if (Object.prototype.hasOwnProperty.call(sums, item.category)) {
      sums[item.category] += amount;
    } else {
      sums['その他'] += amount;
    }
  });

  return categories
    .filter((cat) => sums[cat] > 0)
    .map((cat) => ({
      category: cat,
      amount: sums[cat],
      percent: Math.round((sums[cat] / varTotal) * 100)
    }));
}

/**
 * カスタム計算式内の `[変数名]` を現在のアクティブプロファイルの数値に置換して計算します。
 *
 * @param {string} expr
 * @param {object} appData
 * @param {object} metrics
 * @returns {number|null}
 */
export function evaluateCustomFormula(expr, appData, metrics) {
  const profile = getActiveProfile(appData);
  const stuInc = profile.income || {};

  const varValues = {
    [FORMULA_VAR.WAGE]: Number(stuInc.wage) || 0,
    [FORMULA_VAR.HOURS]: metrics.partTimeHours,
    [FORMULA_VAR.PARTTIME_PAY]: metrics.partTimeMonthly,
    [FORMULA_VAR.ALLOWANCE]: Number(stuInc.allowance) || 0,
    [FORMULA_VAR.TOTAL_INCOME]: metrics.totalIncome,
    [FORMULA_VAR.TAKE_HOME]: metrics.totalIncome,
    [FORMULA_VAR.FIXED_TOTAL]: metrics.fixedTotal,
    [FORMULA_VAR.VAR_TOTAL]: metrics.varTotal,
    [FORMULA_VAR.FREE_BALANCE]: metrics.freeBalance,
    [FORMULA_VAR.SAVINGS_GOAL]: metrics.savingsGoal,
    [FORMULA_VAR.DAYS_LEFT]: metrics.daysLeft,
    [FORMULA_VAR.INVEST_GOAL]: metrics.investGoal,
    [FORMULA_VAR.ANNUAL_FIXED]: metrics.annualFixedTotal,
    [FORMULA_VAR.EFFECTIVE_HOURLY]: metrics.effectiveHourly
  };

  let substituted = String(expr || '');
  for (const [token, val] of Object.entries(varValues)) {
    substituted = substituted.split(token).join(`(${val})`);
  }

  return evaluateMathExpression(substituted);
}

/**
 * 数値を日本円表記（例: ¥12,340 / -¥500）に整形します。
 *
 * @param {number} val
 * @returns {string}
 */
export function formatYen(val) {
  const num = Math.round(Number(val) || 0);
  return `${num < 0 ? '-¥' : '¥'}${Math.abs(num).toLocaleString('ja-JP')}`;
}

/**
 * カスタム計算式の計算結果を、小数第1位まで・単位付きで整形します。
 *
 * @param {number|null} val
 * @param {string} [unit]
 * @returns {string}
 */
export function formatFormulaValue(val, unit = '') {
  if (val === null) return '計算エラー';
  const rounded = Math.round(val * 10) / 10;
  const formatted = rounded.toLocaleString('ja-JP');
  return unit ? `${formatted} ${unit}` : formatted;
}
