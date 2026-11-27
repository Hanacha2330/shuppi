/**
 * ============================================================
 * storage.js ― プロファイル別データの保存・移行・バックアップ処理
 * ============================================================
 * 学生モードと社会人モードのデータを profiles.student / profiles.worker として
 * それぞれ独立して保存・読み込み・正規化します。
 * 以前のバージョン（フラット構造）で保存されていたデータも自動で移行します。
 */

import {
  APP_MODES,
  STORAGE_KEY,
  GUIDE_DISMISSED_KEYS,
  MAX_DAYS_IN_MONTH,
  MAX_HISTORY_ITEMS,
  SHIFT_TIME_UNITS,
  DEFAULT_SHIFT_TIME_UNIT,
  SHIFT_DEDUCTION_TYPES,
  createDefaultData,
  createStudentDefaultProfile,
  createWorkerDefaultProfile
} from './constants.js?v=11';

let lastGeneratedId = 0;

/**
 * 項目を識別するための一意な数値IDを生成します。
 *
 * @returns {number}
 */
export function generateId() {
  const now = Date.now();
  lastGeneratedId = now > lastGeneratedId ? now : lastGeneratedId + 1;
  return lastGeneratedId;
}

/**
 * 現在選択されているモードに対応するプロファイルオブジェクトを返します。
 *
 * @param {object} appData
 * @returns {object}
 */
export function getActiveProfile(appData) {
  const mode = appData?.mode === APP_MODES.WORKER ? APP_MODES.WORKER : APP_MODES.STUDENT;
  return appData.profiles[mode];
}

function resolveId(rawId) {
  const num = Number(rawId);
  return Number.isFinite(num) && num >= 1 ? num : generateId();
}

function toFiniteNumber(value, fallback, min = -Infinity, max = Infinity) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

/**
 * 両モード共通のリスト配列（固定費・変動費・計算式・履歴）を正規化します。
 */
function normalizeProfileLists(raw, defaults) {
  const fixedExpenses = Array.isArray(raw.fixedExpenses)
    ? raw.fixedExpenses
        .filter((item) => item && typeof item === 'object' && String(item.name || '').trim() !== '')
        .map((item) => ({
          id: resolveId(item.id),
          name: String(item.name).trim(),
          amount: toFiniteNumber(item.amount, 0, 0),
          active: Boolean(item.active)
        }))
    : defaults.fixedExpenses;

  const varExpenses = Array.isArray(raw.varExpenses)
    ? raw.varExpenses
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          id: resolveId(item.id),
          category: String(item.category || 'その他'),
          memo: String(item.memo || ''),
          amount: toFiniteNumber(item.amount, 0, 0)
        }))
    : defaults.varExpenses;

  const formulas = Array.isArray(raw.formulas)
    ? raw.formulas
        .filter((item) => (
          item
          && typeof item === 'object'
          && String(item.name || '').trim() !== ''
          && String(item.expr || '').trim() !== ''
        ))
        .map((item) => ({
          id: resolveId(item.id),
          name: String(item.name).trim(),
          expr: String(item.expr).trim(),
          unit: String(item.unit || '').trim()
        }))
    : defaults.formulas;

  const history = Array.isArray(raw.history)
    ? raw.history
        .filter((item) => item && typeof item === 'object' && String(item.monthLabel || '').trim() !== '')
        .slice(0, MAX_HISTORY_ITEMS)
        .map((item) => ({
          id: resolveId(item.id),
          monthLabel: String(item.monthLabel).trim(),
          modeLabel: String(item.modeLabel || '記録'),
          totalIncome: toFiniteNumber(item.totalIncome, 0, 0),
          totalExpense: toFiniteNumber(item.totalExpense, 0, 0),
          savedAmount: toFiniteNumber(item.savedAmount, 0)
        }))
    : defaults.history;

  return { fixedExpenses, varExpenses, formulas, history };
}

/** `"HH:MM"` 形式の時刻文字列を検証し、ゼロ埋めした `"HH:MM"` に整えます */
function normalizeTimeString(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** 開始分数と勤務分数から終了時刻 `"HH:MM"` を作ります */
function formatMinutesToTimeString(totalMinutes) {
  const safe = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 旧バージョン（hours のみ保存）から移行する際、指定時間分のシフト配列を自動生成します。
 */
function buildMigratedShiftsFromHours(legacyHours) {
  const totalMinutes = Math.round(legacyHours * 60);
  if (totalMinutes <= 0) return [];

  // 1日4時間（240分）を基本単位とし、31日に収まらない大きな時間なら1日の勤務時間を増やす
  const unitMinutes = totalMinutes <= 240 * MAX_DAYS_IN_MONTH
    ? 240
    : Math.min(720, Math.ceil(totalMinutes / MAX_DAYS_IN_MONTH));

  const shifts = [];
  const fullDays = Math.min(MAX_DAYS_IN_MONTH, Math.floor(totalMinutes / unitMinutes));
  const remMinutes = totalMinutes - (fullDays * unitMinutes);
  const startBase = 9 * 60;

  if (fullDays > 0) {
    shifts.push({
      id: generateId(),
      label: '移行シフト',
      startTime: '09:00',
      endTime: formatMinutesToTimeString(startBase + unitMinutes),
      breakMinutes: 0,
      days: fullDays,
      active: true
    });
  }
  if (remMinutes > 0) {
    shifts.push({
      id: generateId(),
      label: '移行シフト（端数）',
      startTime: '09:00',
      endTime: formatMinutesToTimeString(startBase + remMinutes),
      breakMinutes: 0,
      days: 1,
      active: true
    });
  }
  return shifts;
}

/** 学生プロファイルを正規化します */
function normalizeStudentProfile(raw) {
  const defaults = createStudentDefaultProfile();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const rawIncome = raw.income && typeof raw.income === 'object' ? raw.income : {};
  const lists = normalizeProfileLists(raw, defaults);

  const rawUnit = Number(rawIncome.timeUnit);
  const timeUnit = SHIFT_TIME_UNITS.includes(rawUnit) ? rawUnit : DEFAULT_SHIFT_TIME_UNIT;

  // 旧形式（v10以前の hours のみ保存）かどうかを判別し、既存のバイト時間を見込み計算へ引き継ぐ
  const hasExplicitShifts = Array.isArray(raw.shifts);
  const legacyHours = toFiniteNumber(rawIncome.hours, 50, 0);

  let shifts;
  if (hasExplicitShifts) {
    shifts = raw.shifts
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const startTime = normalizeTimeString(item.startTime);
        const endTime = normalizeTimeString(item.endTime);
        if (!startTime || !endTime) return null;
        return {
          id: resolveId(item.id),
          label: String(item.label || 'シフト').trim() || 'シフト',
          startTime,
          endTime,
          breakMinutes: Math.round(toFiniteNumber(item.breakMinutes, 0, 0, 720)),
          days: Math.round(toFiniteNumber(item.days, 1, 1, MAX_DAYS_IN_MONTH)),
          active: item.active !== false
        };
      })
      .filter(Boolean);
  } else if (legacyHours <= 0) {
    shifts = [];
  } else if (legacyHours === 50) {
    shifts = defaults.shifts;
  } else {
    shifts = buildMigratedShiftsFromHours(legacyHours);
  }

  let shiftDeductions;
  if (Array.isArray(raw.shiftDeductions)) {
    shiftDeductions = raw.shiftDeductions
      .filter((item) => item && typeof item === 'object' && String(item.name || '').trim() !== '')
      .map((item) => ({
        id: resolveId(item.id),
        name: String(item.name).trim(),
        type: item.type === SHIFT_DEDUCTION_TYPES.PER_SHIFT
          ? SHIFT_DEDUCTION_TYPES.PER_SHIFT
          : SHIFT_DEDUCTION_TYPES.MONTHLY,
        amount: Math.round(toFiniteNumber(item.amount, 0, 0)),
        active: item.active !== false
      }));
  } else if (!hasExplicitShifts && legacyHours === 50) {
    shiftDeductions = defaults.shiftDeductions;
  } else {
    shiftDeductions = [];
  }

  return {
    settings: {
      savingsGoal: toFiniteNumber(rawSettings.savingsGoal, defaults.settings.savingsGoal, 0),
      daysLeft: toFiniteNumber(rawSettings.daysLeft, defaults.settings.daysLeft, 1, MAX_DAYS_IN_MONTH)
    },
    income: {
      wage: toFiniteNumber(rawIncome.wage, defaults.income.wage, 0),
      timeUnit,
      allowance: toFiniteNumber(rawIncome.allowance, defaults.income.allowance, 0),
      other: toFiniteNumber(rawIncome.other, defaults.income.other, 0),
      wallLimit: toFiniteNumber(rawIncome.wallLimit, defaults.income.wallLimit, 1),
      ytdIncome: toFiniteNumber(rawIncome.ytdIncome, defaults.income.ytdIncome, 0)
    },
    shifts,
    shiftDeductions,
    ...lists
  };
}

/** 社会人プロファイルを正規化します */
function normalizeWorkerProfile(raw) {
  const defaults = createWorkerDefaultProfile();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const rawWorker = raw.workerIncome && typeof raw.workerIncome === 'object' ? raw.workerIncome : {};
  const lists = normalizeProfileLists(raw, defaults);

  const allowedFamilyTypes = ['single', 'spouse', 'spouse_teen'];
  const familyType = allowedFamilyTypes.includes(rawWorker.familyType)
    ? rawWorker.familyType
    : defaults.workerIncome.familyType;

  return {
    settings: {
      payday: Math.round(toFiniteNumber(rawSettings.payday, defaults.settings.payday, 0, MAX_DAYS_IN_MONTH)),
      daysLeft: toFiniteNumber(rawSettings.daysLeft, defaults.settings.daysLeft, 1, MAX_DAYS_IN_MONTH),
      savingsGoal: toFiniteNumber(rawSettings.savingsGoal, defaults.settings.savingsGoal, 0),
      investGoal: toFiniteNumber(rawSettings.investGoal, defaults.settings.investGoal, 0),
      creditPending: toFiniteNumber(rawSettings.creditPending, defaults.settings.creditPending, 0)
    },
    workerIncome: {
      grossSalary: toFiniteNumber(rawWorker.grossSalary, defaults.workerIncome.grossSalary, 0),
      overtimePay: toFiniteNumber(rawWorker.overtimePay, defaults.workerIncome.overtimePay, 0),
      deductionRate: toFiniteNumber(rawWorker.deductionRate, defaults.workerIncome.deductionRate, 0, 100),
      otherNetIncome: toFiniteNumber(rawWorker.otherNetIncome, defaults.workerIncome.otherNetIncome, 0),
      simType: rawWorker.simType === 'sidejob' ? 'sidejob' : 'furusato',
      annualGross: toFiniteNumber(rawWorker.annualGross, defaults.workerIncome.annualGross, 0),
      familyType,
      furusatoDonated: toFiniteNumber(rawWorker.furusatoDonated, defaults.workerIncome.furusatoDonated, 0),
      ytdSideProfit: toFiniteNumber(rawWorker.ytdSideProfit, defaults.workerIncome.ytdSideProfit, 0)
    },
    ...lists
  };
}

/**
 * 読み込んだデータ（最新プロファイル構造・旧フラット構造の両方）を検証し、
 * 安全な `{ mode, profiles: { student, worker } }` 構造へ変換します。
 *
 * @param {unknown} raw
 * @returns {object}
 */
export function normalizeAppData(raw) {
  const defaults = createDefaultData();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const mode = raw.mode === APP_MODES.WORKER ? APP_MODES.WORKER : APP_MODES.STUDENT;

  // 新形式（profiles.student / profiles.worker）の場合
  if (raw.profiles && typeof raw.profiles === 'object') {
    return {
      mode,
      profiles: {
        student: normalizeStudentProfile(raw.profiles.student),
        worker: normalizeWorkerProfile(raw.profiles.worker)
      }
    };
  }

  // 旧形式（フラット構造）からの自動マイグレーション
  if (mode === APP_MODES.WORKER) {
    return {
      mode,
      profiles: {
        student: normalizeStudentProfile({ income: raw.income }),
        worker: normalizeWorkerProfile(raw)
      }
    };
  }

  return {
    mode,
    profiles: {
      student: normalizeStudentProfile(raw),
      worker: normalizeWorkerProfile({ workerIncome: raw.workerIncome })
    }
  };
}

/**
 * localStorage から収支データを読み込みます。
 *
 * @returns {object}
 */
export function loadAppData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultData();
    return normalizeAppData(JSON.parse(raw));
  } catch {
    return createDefaultData();
  }
}

/**
 * 収支データを JSON 文字列に変換して localStorage へ保存します。
 *
 * @param {object} data
 */
export function saveAppData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // プライベートブラウズや容量制限時でも画面操作を継続させる
  }
}

/**
 * 「はじめての使い方」ガイドの非表示設定をモード別に取得します。
 *
 * @param {string} [mode]
 * @returns {boolean}
 */
export function isGuideDismissed(mode = APP_MODES.STUDENT) {
  const safeMode = mode === APP_MODES.WORKER ? APP_MODES.WORKER : APP_MODES.STUDENT;
  try {
    return localStorage.getItem(GUIDE_DISMISSED_KEYS[safeMode]) === '1';
  } catch {
    return false;
  }
}

/**
 * 「次回から表示しない」の設定をモード別に保存（または解除）します。
 *
 * @param {string} mode
 * @param {boolean} dismissed
 */
export function setGuideDismissed(mode, dismissed) {
  const safeMode = mode === APP_MODES.WORKER ? APP_MODES.WORKER : APP_MODES.STUDENT;
  const key = GUIDE_DISMISSED_KEYS[safeMode];
  try {
    if (dismissed) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // 保存できない環境でも画面操作を止めない
  }
}

/**
 * 両モードを含む現在の全データをバックアップ用JSON文字列へ変換します。
 *
 * @param {object} appData
 * @returns {string}
 */
export function serializeBackupData(appData) {
  return JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      data: appData
    },
    null,
    2
  );
}

/**
 * バックアップJSONテキストを検証し、安全なアプリデータへ変換します。
 *
 * @param {string} jsonText
 * @returns {object}
 */
export function parseBackupJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('JSONファイルの形式が正しくありません');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('バックアップデータの形式が不正です');
  }

  const payload = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  const hasExpectedKeys = 'profiles' in payload
    || 'settings' in payload
    || 'income' in payload
    || 'workerIncome' in payload;
  if (!hasExpectedKeys) {
    throw new Error('Campus Wallet のバックアップファイルではありません');
  }

  return normalizeAppData(payload);
}
