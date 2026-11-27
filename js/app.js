/**
 * ============================================================
 * app.js ― アプリの起動口（イベント処理と状態管理）
 * ============================================================
 * 設定モーダルでのモード切替・モード別説明ページ表示・収支入力・
 * バックアップ処理をまとめて管理します。
 */

import {
  APP_MODES,
  DEFAULT_WALL_LIMIT,
  DEFAULT_SHIFT_TIME_UNIT,
  SHIFT_DEDUCTION_TYPES,
  DEFAULT_WORKER_DEDUCTION_RATE,
  MAX_DAYS_IN_MONTH,
  MAX_HISTORY_ITEMS,
  createDefaultProfile,
  createEmptyProfile,
  getFormulaPresetsForMode,
  getRemainingDaysForCycle
} from './constants.js?v=11';
import {
  generateId,
  getActiveProfile,
  loadAppData,
  saveAppData,
  isGuideDismissed,
  setGuideDismissed,
  serializeBackupData,
  parseBackupJson
} from './storage.js?v=11';
import { calcMetrics } from './calculator.js?v=11';
import { normalizeTimeUnit, parseTimeToMinutes } from './shiftCalculator.js?v=11';
import { setupPWA } from './pwa.js?v=11';
import {
  isSettingsOpen,
  isGuideOpen,
  setSettingsVisible,
  setGuideVisible
} from './modals.js?v=11';
import {
  renderApp,
  switchTab,
  insertVariableAtCursor,
  showBackupFeedback
} from './ui.js?v=11';

/** アプリ全体で共有する現在のデータ状態 */
let appData = loadAppData();

function commit(options = {}) {
  saveAppData(appData);
  renderApp(appData, options);
}

function readNumberInput(id, { min = 0, max = Infinity, fallback = 0 } = {}) {
  const el = document.getElementById(id);
  const raw = el ? el.value : '';
  if (raw === '') return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function bindLiveInputs(ids, handler) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => handler(false));
    el.addEventListener('change', () => handler(true));
  });
}

/**
 * 変動費を1件追加する共通処理（ホームのクイックメモ・出費管理タブの両方から利用）。
 */
function addVarExpenseEntry(catSelectId, amountInputId, memoInputId = null) {
  const catEl = document.getElementById(catSelectId);
  const amountEl = document.getElementById(amountInputId);
  const memoEl = memoInputId ? document.getElementById(memoInputId) : null;
  if (!catEl || !amountEl) return;

  const amount = Number(amountEl.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  getActiveProfile(appData).varExpenses.push({
    id: generateId(),
    category: catEl.value,
    memo: memoEl ? memoEl.value.trim() : '',
    amount
  });

  if (memoEl) memoEl.value = '';
  amountEl.value = '';
  commit();
}

/**
 * リストコンテナ内のチェックボックスON/OFF（data-action / data-id）を共通で処理するヘルパー。
 */
function bindListToggle(listId, actionName, getListFn) {
  document.getElementById(listId)?.addEventListener('change', (event) => {
    const target = event.target.closest(`[data-action="${actionName}"]`);
    if (!target) return;
    const id = Number(target.dataset.id);
    const list = getListFn();
    const item = Array.isArray(list) ? list.find((entry) => entry.id === id) : null;
    if (!item) return;
    item.active = target.checked;
    commit();
  });
}

/**
 * リストコンテナ内の削除ボタン（data-action / data-id）を共通で処理するヘルパー。
 */
function bindListDelete(listId, actionName, deleteFn) {
  document.getElementById(listId)?.addEventListener('click', (event) => {
    const btn = event.target.closest(`[data-action="${actionName}"]`);
    if (!btn) return;
    deleteFn(Number(btn.dataset.id));
    commit();
  });
}

/** 学生モードのホーム設定を更新します */
function handleStudentSettingsUpdate(forceSyncInputs) {
  const stu = appData.profiles.student;
  stu.settings.savingsGoal = readNumberInput('input-stu-savings-goal', { min: 0, fallback: 0 });
  stu.settings.daysLeft = readNumberInput('input-stu-days-left', {
    min: 1,
    max: MAX_DAYS_IN_MONTH,
    fallback: 1
  });
  commit({ forceSyncInputs });
}

/** 社会人モードのホーム設定を更新します */
function handleWorkerSettingsUpdate(forceSyncInputs) {
  const wk = appData.profiles.worker;
  wk.settings.daysLeft = readNumberInput('input-wk-days-left', {
    min: 1,
    max: MAX_DAYS_IN_MONTH,
    fallback: 1
  });
  wk.settings.savingsGoal = readNumberInput('input-wk-savings-goal', { min: 0, fallback: 0 });
  wk.settings.investGoal = readNumberInput('input-invest-goal', { min: 0, fallback: 0 });
  wk.settings.creditPending = readNumberInput('input-credit-pending', { min: 0, fallback: 0 });
  commit({ forceSyncInputs });
}

/** 学生モードの収入・シフト計算単位・扶養の壁設定を更新します */
function handleStudentIncomeUpdate(forceSyncInputs) {
  const inc = appData.profiles.student.income;
  inc.wage = readNumberInput('inc-wage', { min: 0, fallback: 0 });
  inc.timeUnit = normalizeTimeUnit(
    readNumberInput('inc-time-unit', { min: 1, fallback: DEFAULT_SHIFT_TIME_UNIT })
  );
  inc.allowance = readNumberInput('inc-allowance', { min: 0, fallback: 0 });
  inc.other = readNumberInput('inc-other', { min: 0, fallback: 0 });
  inc.wallLimit = readNumberInput('wall-limit', { min: 1, fallback: DEFAULT_WALL_LIMIT });
  inc.ytdIncome = readNumberInput('ytd-income', { min: 0, fallback: 0 });
  commit({ forceSyncInputs });
}

/** 社会人モードの給与・控除・副業設定を更新します */
function handleWorkerIncomeUpdate(forceSyncInputs) {
  const wkInc = appData.profiles.worker.workerIncome;
  wkInc.grossSalary = readNumberInput('wk-gross-salary', { min: 0, fallback: 0 });
  wkInc.overtimePay = readNumberInput('wk-overtime-pay', { min: 0, fallback: 0 });
  wkInc.deductionRate = readNumberInput('wk-deduction-rate', {
    min: 0,
    max: 100,
    fallback: DEFAULT_WORKER_DEDUCTION_RATE
  });
  wkInc.otherNetIncome = readNumberInput('wk-other-net', { min: 0, fallback: 0 });
  wkInc.annualGross = readNumberInput('wk-annual-gross', { min: 0, fallback: 0 });
  wkInc.furusatoDonated = readNumberInput('wk-furusato-donated', { min: 0, fallback: 0 });
  wkInc.ytdSideProfit = readNumberInput('wk-ytd-side-profit', { min: 0, fallback: 0 });

  const simTypeEl = document.getElementById('wk-sim-type');
  if (simTypeEl) {
    wkInc.simType = simTypeEl.value === 'sidejob' ? 'sidejob' : 'furusato';
  }
  const familyEl = document.getElementById('wk-family-type');
  if (familyEl) {
    wkInc.familyType = familyEl.value;
  }

  commit({ forceSyncInputs });
}

/**
 * 設定モーダル（モード切替カード・案内表示トグル）および
 * モード別の説明ページモーダルの操作をまとめて登録します。
 */
function bindSettingsAndGuideActions() {
  const closeSettings = () => setSettingsVisible(false, appData.mode);

  // ヘッダー「設定」ボタン
  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    if (isGuideOpen()) {
      setGuideVisible(false, appData.mode);
    }
    setSettingsVisible(true, appData.mode);
  });

  // 設定モーダルを閉じる操作（×ボタン / 閉じるボタン / 外側の暗い背景クリック）
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettings);
  document.getElementById('btn-done-settings')?.addEventListener('click', closeSettings);
  document.getElementById('settings-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'settings-modal') {
      closeSettings();
    }
  });

  // 設定モーダル内のモードカード（学生モード / 社会人モード）クリック時の切り替え
  document.getElementById('mode-selector')?.addEventListener('click', (event) => {
    const card = event.target.closest('.mode-card[data-mode]');
    if (!card) return;

    const nextMode = card.dataset.mode === APP_MODES.WORKER ? APP_MODES.WORKER : APP_MODES.STUDENT;
    if (appData.mode === nextMode) {
      closeSettings();
      return;
    }

    // モードを切り替えてデータを保存・画面を再描画し、設定モーダルを閉じる
    appData.mode = nextMode;
    commit({ forceSyncInputs: true });
    setSettingsVisible(false, nextMode);

    // 切り替えたモードの案内ページが非表示設定でなければ、専用の説明ページを開く
    if (!isGuideDismissed(nextMode)) {
      setGuideVisible(true, nextMode);
    }
  });

  // 設定モーダル内「起動・切替時に説明ページを表示」チェックボックス
  document.getElementById('toggle-mode-guide')?.addEventListener('change', (event) => {
    setGuideDismissed(appData.mode, !event.target.checked);
  });

  // ヘッダー「使い方」ボタン：現在モードの説明ページを開閉する
  document.getElementById('btn-toggle-guide')?.addEventListener('click', () => {
    if (isSettingsOpen()) {
      closeSettings();
    }
    setGuideVisible(!isGuideOpen(), appData.mode);
  });

  // 説明ページを閉じる操作（×ボタン / 外側の暗い背景 / 確認しました）
  const hideGuide = () => setGuideVisible(false, appData.mode);
  document.getElementById('btn-close-guide')?.addEventListener('click', hideGuide);
  document.getElementById('usage-guide')?.addEventListener('click', (event) => {
    if (event.target.id === 'usage-guide') {
      hideGuide();
    }
  });
  document.getElementById('btn-confirm-guide')?.addEventListener('click', hideGuide);

  // 説明ページ「次回から表示しない」：現在モードの案内だけを次回以降スキップする
  document.getElementById('btn-dont-show-guide')?.addEventListener('click', () => {
    setGuideDismissed(appData.mode, true);
    hideGuide();
  });

  // Escape キーで開いているモーダルを閉じる
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isGuideOpen()) {
      setGuideVisible(false, appData.mode);
    } else if (isSettingsOpen()) {
      closeSettings();
    }
  });
}

function bindTabEvents() {
  document.querySelector('.tab-bar-inner')?.addEventListener('click', (event) => {
    const btn = event.target.closest('.tab-btn[data-target]');
    if (!btn) return;
    switchTab(btn.dataset.target);
  });

  document.querySelectorAll('[data-switch-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.switchTab);
    });
  });
}

function bindSettingsInputs() {
  bindLiveInputs(['input-stu-savings-goal', 'input-stu-days-left'], handleStudentSettingsUpdate);

  // 社会人モード：給料日を変えたら次の締めまでの残り日数を自動再計算する
  document.getElementById('select-payday')?.addEventListener('change', (event) => {
    const payday = readNumberInput('select-payday', { min: 0, max: MAX_DAYS_IN_MONTH, fallback: 0 });
    const wkSettings = appData.profiles.worker.settings;
    wkSettings.payday = Math.round(payday);
    wkSettings.daysLeft = getRemainingDaysForCycle(wkSettings.payday);
    event.target.blur();
    commit({ forceSyncInputs: true });
  });

  bindLiveInputs(
    ['input-wk-days-left', 'input-wk-savings-goal', 'input-invest-goal', 'input-credit-pending'],
    handleWorkerSettingsUpdate
  );
}

function bindIncomeInputs() {
  bindLiveInputs(
    ['inc-wage', 'inc-time-unit', 'inc-allowance', 'inc-other', 'wall-limit', 'ytd-income'],
    handleStudentIncomeUpdate
  );

  bindLiveInputs(
    [
      'wk-gross-salary',
      'wk-overtime-pay',
      'wk-deduction-rate',
      'wk-other-net',
      'wk-sim-type',
      'wk-annual-gross',
      'wk-family-type',
      'wk-furusato-donated',
      'wk-ytd-side-profit'
    ],
    handleWorkerIncomeUpdate
  );
}

/**
 * 学生モードのシフト追加・ON/OFF・削除、およびまかない・交通費などの差し引き操作を登録します。
 */
function bindStudentShiftActions() {
  // シフト追加フォーム
  document.getElementById('shift-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const labelEl = document.getElementById('shift-label');
    const startEl = document.getElementById('shift-start');
    const endEl = document.getElementById('shift-end');
    const breakEl = document.getElementById('shift-break');
    const daysEl = document.getElementById('shift-days');
    if (!startEl || !endEl) return;

    const startTime = startEl.value.trim();
    const endTime = endEl.value.trim();
    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    if (startMin === null || endMin === null || startMin === endMin) return;

    const label = labelEl?.value.trim() || 'シフト';
    const breakMinutes = Math.round(readNumberInput('shift-break', { min: 0, max: 720, fallback: 0 }));
    const days = Math.round(readNumberInput('shift-days', { min: 1, max: MAX_DAYS_IN_MONTH, fallback: 1 }));

    appData.profiles.student.shifts.push({
      id: generateId(),
      label,
      startTime,
      endTime,
      breakMinutes,
      days,
      active: true
    });

    if (labelEl) labelEl.value = '';
    if (breakEl) breakEl.value = '0';
    if (daysEl) daysEl.value = '1';
    commit();
  });

  bindListToggle('shift-list', 'toggle-shift', () => appData.profiles.student.shifts);
  bindListDelete('shift-list', 'delete-shift', (id) => {
    const stu = appData.profiles.student;
    stu.shifts = stu.shifts.filter((entry) => entry.id !== id);
  });

  // まかない・交通費などの差し引き追加フォーム
  document.getElementById('shift-deduction-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const nameEl = document.getElementById('deduct-name');
    const typeEl = document.getElementById('deduct-type');
    const amountEl = document.getElementById('deduct-amount');
    if (!nameEl || !typeEl || !amountEl) return;

    const name = nameEl.value.trim();
    const amount = Math.round(Number(amountEl.value));
    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    const type = typeEl.value === SHIFT_DEDUCTION_TYPES.PER_SHIFT
      ? SHIFT_DEDUCTION_TYPES.PER_SHIFT
      : SHIFT_DEDUCTION_TYPES.MONTHLY;

    appData.profiles.student.shiftDeductions.push({
      id: generateId(),
      name,
      type,
      amount,
      active: true
    });

    nameEl.value = '';
    amountEl.value = '';
    commit();
  });

  bindListToggle('shift-deduction-list', 'toggle-deduction', () => appData.profiles.student.shiftDeductions);
  bindListDelete('shift-deduction-list', 'delete-deduction', (id) => {
    const stu = appData.profiles.student;
    stu.shiftDeductions = stu.shiftDeductions.filter((entry) => entry.id !== id);
  });
}

function bindExpenseSections() {
  // クイック出費メモ
  document.getElementById('quick-expense-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    addVarExpenseEntry('quick-cat', 'quick-amount');
  });

  // 固定費の追加・ON/OFF切替・削除
  document.getElementById('fixed-expense-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const nameEl = document.getElementById('new-fixed-name');
    const amountEl = document.getElementById('new-fixed-amount');
    if (!nameEl || !amountEl) return;

    const name = nameEl.value.trim();
    const amount = Number(amountEl.value);
    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    getActiveProfile(appData).fixedExpenses.push({
      id: generateId(),
      name,
      amount,
      active: true
    });
    nameEl.value = '';
    amountEl.value = '';
    commit();
  });

  bindListToggle('fixed-list', 'toggle-fixed', () => getActiveProfile(appData).fixedExpenses);

  bindListDelete('fixed-list', 'delete-fixed', (id) => {
    const profile = getActiveProfile(appData);
    profile.fixedExpenses = profile.fixedExpenses.filter((entry) => entry.id !== id);
  });

  // 変動費の追加・削除
  document.getElementById('var-expense-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    addVarExpenseEntry('new-var-cat', 'new-var-amount', 'new-var-memo');
  });

  bindListDelete('var-list', 'delete-var', (id) => {
    const profile = getActiveProfile(appData);
    profile.varExpenses = profile.varExpenses.filter((entry) => entry.id !== id);
  });
}

function bindHistorySection() {
  document.getElementById('btn-record-history')?.addEventListener('click', () => {
    const profile = getActiveProfile(appData);
    const metrics = calcMetrics(appData);
    const now = new Date();
    const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
    const modeLabel = appData.mode === APP_MODES.WORKER ? '社会人' : '学生';
    const totalExpense = metrics.fixedTotal + metrics.varTotal;
    const savedAmount = metrics.totalIncome - totalExpense;

    profile.history.unshift({
      id: generateId(),
      monthLabel,
      modeLabel,
      totalIncome: metrics.totalIncome,
      totalExpense,
      savedAmount
    });
    profile.history = profile.history.slice(0, MAX_HISTORY_ITEMS);
    commit();
  });

  bindListDelete('history-list', 'delete-history', (id) => {
    const profile = getActiveProfile(appData);
    profile.history = profile.history.filter((entry) => entry.id !== id);
  });
}

function bindFormulaActions() {
  document.getElementById('var-chips')?.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-var]');
    if (!chip) return;
    insertVariableAtCursor(document.getElementById('formula-expr'), chip.dataset.var);
  });

  document.getElementById('formula-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const nameEl = document.getElementById('formula-name');
    const unitEl = document.getElementById('formula-unit');
    const exprEl = document.getElementById('formula-expr');
    if (!nameEl || !unitEl || !exprEl) return;

    const name = nameEl.value.trim();
    const expr = exprEl.value.trim();
    if (!name || !expr) return;

    getActiveProfile(appData).formulas.push({
      id: generateId(),
      name,
      unit: unitEl.value.trim(),
      expr
    });
    nameEl.value = '';
    unitEl.value = '';
    exprEl.value = '';
    commit();
  });

  document.getElementById('btn-add-mode-presets')?.addEventListener('click', () => {
    const profile = getActiveProfile(appData);
    const presets = getFormulaPresetsForMode(appData.mode);
    let added = 0;

    presets.forEach((preset) => {
      const exists = profile.formulas.some((entry) => entry.expr === preset.expr);
      if (!exists) {
        profile.formulas.push({
          id: generateId(),
          ...preset
        });
        added += 1;
      }
    });
    if (added > 0) {
      commit();
    }
  });

  bindListDelete('formula-list', 'delete-formula', (id) => {
    const profile = getActiveProfile(appData);
    profile.formulas = profile.formulas.filter((entry) => entry.id !== id);
  });
}

function bindBackupAndResetActions() {
  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    const jsonStr = serializeBackupData(appData);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);

    const link = document.createElement('a');
    link.href = url;
    link.download = `campus-wallet-backup-${dateStamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showBackupFeedback('学生・社会人両方のバックアップ（JSON）を書き出しました。');
  });

  const fileInput = document.getElementById('input-import-file');
  document.getElementById('btn-import-json')?.addEventListener('click', () => {
    if (!fileInput) return;
    fileInput.value = '';
    fileInput.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      appData = parseBackupJson(text);
      commit({ forceSyncInputs: true });
      showBackupFeedback('バックアップからデータを復元しました。');
    } catch (err) {
      showBackupFeedback(err.message || 'バックアップの復元に失敗しました。', true);
    }
  });

  document.getElementById('btn-reset-sample')?.addEventListener('click', () => {
    const modeName = appData.mode === APP_MODES.WORKER ? '社会人モード' : '学生モード';
    if (!window.confirm(`${modeName}のデータだけを初期サンプルに戻しますか？`)) return;
    appData.profiles[appData.mode] = createDefaultProfile(appData.mode);
    commit({ forceSyncInputs: true });
    showBackupFeedback('');
  });

  document.getElementById('btn-clear-all')?.addEventListener('click', () => {
    const modeName = appData.mode === APP_MODES.WORKER ? '社会人モード' : '学生モード';
    if (!window.confirm(`${modeName}のデータだけをゼロにリセットしますか？`)) return;
    appData.profiles[appData.mode] = createEmptyProfile(appData.mode);
    commit({ forceSyncInputs: true });
    showBackupFeedback('');
  });
}

function init() {
  setupPWA();
  bindSettingsAndGuideActions();
  bindTabEvents();
  bindSettingsInputs();
  bindIncomeInputs();
  bindStudentShiftActions();
  bindExpenseSections();
  bindHistorySection();
  bindFormulaActions();
  bindBackupAndResetActions();

  renderApp(appData, { forceSyncInputs: true });

  // 現在のモードの説明ページが非表示でなければ初回案内を表示する
  if (!isGuideDismissed(appData.mode)) {
    setGuideVisible(true, appData.mode);
  }
}

init();
