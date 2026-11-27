/**
 * ============================================================
 * shiftCalculator.js ― 学生バイトのシフト・分刻み・差し引き計算
 * ============================================================
 * 時給・何分刻みで計算するか・登録シフト・まかないや交通費などの差し引きから、
 * 1か月分のバイト代見込み額（支給額・差し引き額・手取り見込み）を算出します。
 */

import {
  SHIFT_TIME_UNITS,
  DEFAULT_SHIFT_TIME_UNIT,
  SHIFT_DEDUCTION_TYPES
} from './constants.js?v=11';

const MINUTES_PER_DAY = 24 * 60;

/**
 * 選択された時間単位（何分刻みか）を安全な候補値に正規化します。
 *
 * @param {unknown} unit
 * @returns {number}
 */
export function normalizeTimeUnit(unit) {
  const num = Number(unit);
  return SHIFT_TIME_UNITS.includes(num) ? num : DEFAULT_SHIFT_TIME_UNIT;
}

/**
 * `"HH:MM"` 形式の時刻文字列を「0:00 からの経過分数（0〜1439）」に変換します。
 * 形式が不正な場合は null を返します。
 *
 * @param {unknown} timeStr
 * @returns {number|null}
 */
export function parseTimeToMinutes(timeStr) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr ?? '').trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * 分数を日本語の読みやすい時間表記（例: `"4時間15分"` / `"45分"`）へ変換します。
 *
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatDurationMinutes(totalMinutes) {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;

  if (hours > 0 && rem > 0) return `${hours}時間${rem}分`;
  if (hours > 0) return `${hours}時間`;
  return `${rem}分`;
}

/**
 * 1件のシフトについて、実働時間・指定分刻みでの切り捨て・1日あたり＆月間給与を計算します。
 * 終了時刻が開始時刻より前の場合は日付をまたぐ深夜シフト（例: 22:00〜01:00）として扱います。
 *
 * @param {object} shift
 * @param {number} wage
 * @param {number} timeUnit
 * @returns {object}
 */
export function calcSingleShift(shift, wage, timeUnit) {
  const safeWage = Math.max(0, Number(wage) || 0);
  const safeUnit = normalizeTimeUnit(timeUnit);
  const startMin = parseTimeToMinutes(shift?.startTime);
  const endMin = parseTimeToMinutes(shift?.endTime);
  const breakMinutes = Math.max(0, Math.round(Number(shift?.breakMinutes) || 0));
  const days = Math.max(1, Math.min(31, Math.round(Number(shift?.days) || 1)));

  let spanMinutes = 0;
  if (startMin !== null && endMin !== null && startMin !== endMin) {
    spanMinutes = endMin > startMin
      ? endMin - startMin
      : (MINUTES_PER_DAY - startMin) + endMin;
  }

  // 拘束時間から休憩を引いた実働分数を求め、選んだ「何分刻み」で切り捨てる
  const actualMinutes = Math.max(0, spanMinutes - breakMinutes);
  const payableMinutesPerDay = Math.floor(actualMinutes / safeUnit) * safeUnit;
  const cutMinutesPerDay = actualMinutes - payableMinutesPerDay;

  const payPerDay = Math.round((safeWage * payableMinutesPerDay) / 60);
  const totalPayableMinutes = payableMinutesPerDay * days;
  const totalPay = payPerDay * days;

  return {
    id: shift?.id,
    label: String(shift?.label || 'シフト'),
    startTime: String(shift?.startTime || '00:00'),
    endTime: String(shift?.endTime || '00:00'),
    breakMinutes,
    days,
    active: Boolean(shift?.active),
    actualMinutes,
    payableMinutesPerDay,
    cutMinutesPerDay,
    payPerDay,
    totalPayableMinutes,
    totalPay
  };
}

/**
 * 学生プロファイル全体から、1か月分のバイト時間・支給見込み・差し引き合計・手取り見込みを算出します。
 *
 * @param {object} studentProfile
 * @returns {object}
 */
export function calcStudentShiftSummary(studentProfile) {
  const inc = studentProfile?.income || {};
  const wage = Math.max(0, Number(inc.wage) || 0);
  const timeUnit = normalizeTimeUnit(inc.timeUnit);
  const rawShifts = Array.isArray(studentProfile?.shifts) ? studentProfile.shifts : [];
  const rawDeductions = Array.isArray(studentProfile?.shiftDeductions) ? studentProfile.shiftDeductions : [];

  const shiftDetails = rawShifts.map((shift) => calcSingleShift(shift, wage, timeUnit));

  let activeShiftDays = 0;
  let totalPayableMinutes = 0;
  let grossPay = 0;

  shiftDetails.forEach((detail) => {
    if (!detail.active) return;
    if (detail.payableMinutesPerDay > 0) {
      activeShiftDays += detail.days;
    }
    totalPayableMinutes += detail.totalPayableMinutes;
    grossPay += detail.totalPay;
  });

  // 1出勤ごとの差し引きは、実際に有効な出勤日数（activeShiftDays）を掛けて月額換算する
  const deductionDetails = rawDeductions.map((item) => {
    const unitAmount = Math.max(0, Math.round(Number(item?.amount) || 0));
    const isPerShift = item?.type === SHIFT_DEDUCTION_TYPES.PER_SHIFT;
    const monthlyAmount = isPerShift ? unitAmount * activeShiftDays : unitAmount;

    return {
      id: item?.id,
      name: String(item?.name || '差し引き'),
      type: isPerShift ? SHIFT_DEDUCTION_TYPES.PER_SHIFT : SHIFT_DEDUCTION_TYPES.MONTHLY,
      amount: unitAmount,
      active: Boolean(item?.active),
      appliedDays: isPerShift ? activeShiftDays : 1,
      monthlyAmount
    };
  });

  const deductionTotal = deductionDetails
    .filter((item) => item.active)
    .reduce((sum, item) => sum + item.monthlyAmount, 0);

  const netPay = Math.max(0, grossPay - deductionTotal);
  const totalHours = Math.round((totalPayableMinutes / 60) * 100) / 100;

  return {
    wage,
    timeUnit,
    totalHours,
    totalPayableMinutes,
    activeShiftDays,
    grossPay,
    deductionTotal,
    netPay,
    shiftDetails,
    deductionDetails
  };
}
