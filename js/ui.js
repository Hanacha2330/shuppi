/**
 * ============================================================
 * ui.js ― モード別の画面描画・UI部品制御を担当するモジュール
 * ============================================================
 * appData.mode（student / worker）と getActiveProfile(appData) に基づいて
 * メイン画面の DOM を更新します。モーダル関連の制御は modals.js に分離しています。
 */

import {
  APP_MODES,
  FORMULA_VAR,
  SHIFT_DEDUCTION_TYPES,
  getCategoriesForMode,
  getFormulaChipsForMode
} from './constants.js?v=11';
import { getActiveProfile } from './storage.js?v=11';
import { formatDurationMinutes } from './shiftCalculator.js?v=11';
import {
  calcMetrics,
  calcWallMetrics,
  calcFurusatoMetrics,
  calcSideJobMetrics,
  calcExpenseRatio,
  calcCategoryBreakdown,
  evaluateCustomFormula,
  formatYen,
  formatFormulaValue
} from './calculator.js?v=11';

const BUDGET_STATUS_TEXT = {
  danger: '予算オーバーしています（目標貯金や出費を調整してください）',
  warn: 'やや節約モードが必要です',
  safe: '計画通りのペースで生活できます'
};

const DAILY_BUDGET_TEXT_CLASSES = {
  danger: 'danger',
  warn: 'warn',
  safe: 'default'
};

const LIMIT_TEXT_CLASSES = {
  danger: 'danger',
  warn: 'warn',
  safe: 'accent'
};

const PROGRESS_FILL_CLASSES = {
  danger: 'danger',
  warn: 'warn',
  safe: 'safe'
};

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = byId(id);
  if (el) {
    el.textContent = text;
  }
}

/**
 * ユーザーが入力した文字を innerHTML に埋め込む際の XSS を防ぐエスケープ処理。
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 入力欄の値を状態と同期します（編集中フィールドのカーソル位置破壊を防ぐ）。
 */
export function syncInputValue(el, value, force = false) {
  if (!el) return;
  if (!force && document.activeElement === el) return;
  const nextVal = String(value);
  if (el.value !== nextVal) {
    el.value = nextVal;
  }
}

function setStatusClass(el, prefix, status, mapping) {
  if (!el) return;
  Object.values(mapping).forEach((cls) => el.classList.remove(`${prefix}-${cls}`));
  const suffix = mapping[status];
  if (suffix) {
    el.classList.add(`${prefix}-${suffix}`);
  }
}

/**
 * 扶養の壁・ふるさと納税・副業20万など「進捗バー＋現在値＋残り枠＋強調結果」を共通描画するヘルパー。
 */
function renderLimitCard({
  barId,
  percent,
  status,
  currentId,
  currentText,
  remainId,
  remainText,
  valueId,
  valueText
}) {
  const barEl = byId(barId);
  if (barEl) {
    barEl.style.width = `${percent}%`;
    setStatusClass(barEl, 'fill-status', status, PROGRESS_FILL_CLASSES);
  }

  setText(currentId, currentText);
  setText(remainId, remainText);

  const valEl = byId(valueId);
  if (valEl) {
    valEl.textContent = valueText;
    setStatusClass(valEl, 'text-status', status, LIMIT_TEXT_CLASSES);
  }
}

/**
 * 現在のモードに応じて変動費カテゴリ選択肢（#quick-cat, #new-var-cat）を更新します。
 */
function renderCategorySelects(mode) {
  const categories = getCategoriesForMode(mode);
  const optionsHtml = categories
    .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
    .join('');

  ['quick-cat', 'new-var-cat'].forEach((id) => {
    const selectEl = byId(id);
    if (!selectEl || selectEl.dataset.renderedMode === mode) return;
    selectEl.innerHTML = optionsHtml;
    selectEl.dataset.renderedMode = mode;
  });
}

/**
 * 現在のモードに応じて計算式タブの変数チップ一覧を切り替えます。
 */
function renderFormulaChips(mode) {
  const container = byId('var-chips');
  if (!container || container.dataset.renderedMode === mode) return;

  const chips = getFormulaChipsForMode(mode);
  container.innerHTML = chips
    .map((token) => `<button type="button" class="chip" data-var="${escapeHtml(token)}">${escapeHtml(token)}</button>`)
    .join('');
  container.dataset.renderedMode = mode;
}

/**
 * モード表示バッジ・テーマ色・モード専用要素の表示状態を一括更新します。
 */
function renderModeState(appData) {
  const mode = appData.mode === APP_MODES.WORKER ? APP_MODES.WORKER : APP_MODES.STUDENT;
  const isWorker = mode === APP_MODES.WORKER;

  // body[data-mode="worker"] のテーマカラーを切り替え
  document.body.dataset.mode = mode;

  // ヘッダーの現在モードバッジや各ラベルを更新
  setText('header-mode-badge', isWorker ? '社会人モード' : '学生モード');
  setText('tab-btn-income', isWorker ? '収入・控除' : '収入・扶養');
  setText('sum-income-label', isWorker ? '手取り収入' : '今月の収入');
  setText('sum-expense-label', isWorker ? '支出＋貯蓄・確保' : '支出＋貯金目標');
  setText('btn-reset-sample', isWorker ? '社会人データを初期値に戻す' : '学生データを初期値に戻す');

  // data-only-mode 属性を持つブロックをモード別に一括表示／非表示
  document.querySelectorAll('[data-only-mode]').forEach((el) => {
    el.hidden = el.dataset.onlyMode !== mode;
  });

  const formulaExprEl = byId('formula-expr');
  if (formulaExprEl) {
    formulaExprEl.placeholder = isWorker
      ? `例: (30000 / ${FORMULA_VAR.EFFECTIVE_HOURLY})`
      : `例: (50000 - ${FORMULA_VAR.FREE_BALANCE}) / ${FORMULA_VAR.WAGE}`;
  }

  renderCategorySelects(mode);
  renderFormulaChips(mode);
}

/** ① ホーム（ダッシュボード）タブを描画します */
function renderDashboard(appData, metrics, forceSyncInputs) {
  const profile = getActiveProfile(appData);

  setText('days-left-badge', `残り ${metrics.daysLeft} 日`);

  const dailyEl = byId('daily-budget');
  if (dailyEl) {
    dailyEl.textContent = formatYen(metrics.dailyBudget);
    setStatusClass(dailyEl, 'text-status', metrics.budgetStatus, DAILY_BUDGET_TEXT_CLASSES);
  }

  const progressEl = byId('budget-progress');
  if (progressEl) {
    progressEl.style.width = `${metrics.remainRatio}%`;
    setStatusClass(progressEl, 'fill-status', metrics.budgetStatus, PROGRESS_FILL_CLASSES);
  }

  setText('budget-status-text', BUDGET_STATUS_TEXT[metrics.budgetStatus]);
  setText('sum-income', formatYen(metrics.totalIncome));
  setText('sum-expense', formatYen(metrics.totalOutflow));
  setText('sum-balance', formatYen(metrics.freeBalance));

  if (appData.mode === APP_MODES.WORKER) {
    syncInputValue(byId('select-payday'), profile.settings.payday, forceSyncInputs);
    syncInputValue(byId('input-wk-days-left'), profile.settings.daysLeft, forceSyncInputs);
    syncInputValue(byId('input-wk-savings-goal'), profile.settings.savingsGoal, forceSyncInputs);
    syncInputValue(byId('input-invest-goal'), profile.settings.investGoal, forceSyncInputs);
    syncInputValue(byId('input-credit-pending'), profile.settings.creditPending, forceSyncInputs);
  } else {
    syncInputValue(byId('input-stu-savings-goal'), profile.settings.savingsGoal, forceSyncInputs);
    syncInputValue(byId('input-stu-days-left'), profile.settings.daysLeft, forceSyncInputs);
  }
}

/** ②-A-1 学生モードの登録シフト一覧を描画します */
function renderStudentShifts(studentShift) {
  setText('shift-total-badge', `${studentShift.activeShiftDays}日 / ${studentShift.totalHours}時間`);

  const listEl = byId('shift-list');
  if (!listEl) return;

  if (studentShift.shiftDetails.length === 0) {
    listEl.innerHTML = '<div class="empty-state">シフトはまだ登録されていません</div>';
    return;
  }

  listEl.innerHTML = studentShift.shiftDetails.map((item) => {
    const breakNote = item.breakMinutes > 0 ? ` ・休憩${item.breakMinutes}分` : '';
    const unitNote = item.cutMinutesPerDay > 0
      ? ` ・${studentShift.timeUnit}分刻み→${formatDurationMinutes(item.payableMinutesPerDay)}（端数切捨${item.cutMinutesPerDay}分）`
      : ` ・実働${formatDurationMinutes(item.payableMinutesPerDay)}`;

    return `
      <div class="list-item">
        <label class="list-left list-label">
          <input type="checkbox" data-action="toggle-shift" data-id="${item.id}" ${item.active ? 'checked' : ''}>
          <div>
            <div class="${item.active ? '' : 'item-inactive'}">
              <span>${escapeHtml(item.label)}</span>
              <span class="tag num">×${item.days}日</span>
            </div>
            <div class="shift-item-meta num">
              ${escapeHtml(item.startTime)}〜${escapeHtml(item.endTime)}${breakNote}${unitNote}
            </div>
          </div>
        </label>
        <div class="list-left">
          <div class="amount-stack">
            <span class="num item-amount">${formatYen(item.totalPay)}</span>
            <span class="num item-annual">1日 ${formatYen(item.payPerDay)}</span>
          </div>
          <button type="button" class="btn-danger-text" data-action="delete-shift" data-id="${item.id}">削除</button>
        </div>
      </div>
    `;
  }).join('');
}

function formatDeductionAmount(amount) {
  return amount > 0 ? `-${formatYen(amount)}` : '¥0';
}

/** ②-A-2 学生モードのまかない・交通費などの差し引き一覧を描画します */
function renderStudentDeductions(studentShift) {
  setText('shift-deduction-badge', formatDeductionAmount(studentShift.deductionTotal));

  const listEl = byId('shift-deduction-list');
  if (!listEl) return;

  if (studentShift.deductionDetails.length === 0) {
    listEl.innerHTML = '<div class="empty-state">差し引き項目はありません（まかない・交通費を追加できます）</div>';
    return;
  }

  listEl.innerHTML = studentShift.deductionDetails.map((item) => {
    const typeTag = item.type === SHIFT_DEDUCTION_TYPES.PER_SHIFT
      ? `1出勤 ${formatYen(item.amount)} × ${item.appliedDays}日`
      : '月額固定';
    const amountText = formatDeductionAmount(item.monthlyAmount);

    return `
      <div class="list-item">
        <label class="list-left list-label">
          <input type="checkbox" data-action="toggle-deduction" data-id="${item.id}" ${item.active ? 'checked' : ''}>
          <div>
            <div class="${item.active ? '' : 'item-inactive'}">${escapeHtml(item.name)}</div>
            <div class="shift-item-meta num">${escapeHtml(typeTag)}</div>
          </div>
        </label>
        <div class="list-left">
          <span class="num item-amount text-danger">${amountText}</span>
          <button type="button" class="btn-danger-text" data-action="delete-deduction" data-id="${item.id}">削除</button>
        </div>
      </div>
    `;
  }).join('');
}

/** ②-A 学生モードのバイトシフト・収入＆扶養の壁を描画します */
function renderStudentIncome(studentProfile, metrics, forceSyncInputs) {
  const inc = studentProfile.income;
  const shiftSummary = metrics.studentShift;

  syncInputValue(byId('inc-wage'), inc.wage, forceSyncInputs);
  syncInputValue(byId('inc-time-unit'), inc.timeUnit, forceSyncInputs);
  syncInputValue(byId('inc-allowance'), inc.allowance, forceSyncInputs);
  syncInputValue(byId('inc-other'), inc.other, forceSyncInputs);
  syncInputValue(byId('wall-limit'), inc.wallLimit, forceSyncInputs);
  syncInputValue(byId('ytd-income'), inc.ytdIncome, forceSyncInputs);

  renderStudentShifts(shiftSummary);
  renderStudentDeductions(shiftSummary);

  setText('shift-gross-total', formatYen(shiftSummary.grossPay));
  setText('shift-deduction-total', formatDeductionAmount(shiftSummary.deductionTotal));
  setText('shift-unit-note', `実働 ${shiftSummary.totalHours}時間 / ${shiftSummary.timeUnit}分刻みで計算`);
  setText('parttime-monthly-total', formatYen(metrics.partTimeMonthly));
  setText('student-total-income', formatYen(metrics.totalIncome));

  const wall = calcWallMetrics(studentProfile, metrics.partTimeGrossMonthly);
  renderLimitCard({
    barId: 'wall-progress',
    percent: wall.wallPercent,
    status: wall.wallStatus,
    currentId: 'wall-current-text',
    currentText: `見込み累計: ${formatYen(wall.projectedYearly)}`,
    remainId: 'wall-remain-yen',
    remainText: `残り枠: ${formatYen(wall.remainYen)}`,
    valueId: 'wall-remain-hours',
    valueText: wall.isExceeded ? '上限超過' : `${wall.remainHours.toFixed(1)} 時間`
  });
}

/** ②-B 社会人モードの給与手取り＆控除・副業シミュレーターを描画します */
function renderWorkerIncome(workerProfile, metrics, forceSyncInputs) {
  const wk = workerProfile.workerIncome;

  syncInputValue(byId('wk-gross-salary'), wk.grossSalary, forceSyncInputs);
  syncInputValue(byId('wk-overtime-pay'), wk.overtimePay, forceSyncInputs);
  syncInputValue(byId('wk-deduction-rate'), wk.deductionRate, forceSyncInputs);
  syncInputValue(byId('wk-other-net'), wk.otherNetIncome, forceSyncInputs);

  setText(
    'wk-gross-note',
    `額面 ${formatYen(metrics.workerTakeHome.grossMonthly)} / 天引き -${formatYen(metrics.workerTakeHome.deductionAmount)}`
  );
  setText('worker-net-monthly', formatYen(metrics.workerTakeHome.totalTakeHome));

  syncInputValue(byId('wk-sim-type'), wk.simType, forceSyncInputs);
  const furusatoBox = byId('wk-sim-furusato');
  const sidejobBox = byId('wk-sim-sidejob');
  if (furusatoBox) furusatoBox.hidden = wk.simType !== 'furusato';
  if (sidejobBox) sidejobBox.hidden = wk.simType !== 'sidejob';

  // ふるさと納税
  syncInputValue(byId('wk-annual-gross'), wk.annualGross, forceSyncInputs);
  syncInputValue(byId('wk-family-type'), wk.familyType, forceSyncInputs);
  syncInputValue(byId('wk-furusato-donated'), wk.furusatoDonated, forceSyncInputs);

  const furusato = calcFurusatoMetrics(wk);
  renderLimitCard({
    barId: 'wk-furusato-progress',
    percent: furusato.percent,
    status: furusato.status,
    currentId: 'wk-furusato-donated-text',
    currentText: `寄付済み: ${formatYen(furusato.donated)}`,
    remainId: 'wk-furusato-remain-text',
    remainText: `残り上限: ${formatYen(furusato.remainCap)}`,
    valueId: 'wk-furusato-cap',
    valueText: furusato.isExceeded ? '上限超過' : formatYen(furusato.estimatedCap)
  });

  // 副業20万円の壁
  syncInputValue(byId('wk-ytd-side-profit'), wk.ytdSideProfit, forceSyncInputs);

  const sideJob = calcSideJobMetrics(wk);
  renderLimitCard({
    barId: 'wk-sidejob-progress',
    percent: sideJob.percent,
    status: sideJob.status,
    currentId: 'wk-sidejob-current-text',
    currentText: `累計所得: ${formatYen(sideJob.profit)}`,
    remainId: 'wk-sidejob-remain-text',
    remainText: `20万まであと: ${formatYen(sideJob.remainYen)}`,
    valueId: 'wk-sidejob-status',
    valueText: sideJob.isExceeded ? '要確定申告' : `あと ${formatYen(sideJob.remainYen)}`
  });
}

/** ③-1 社会人向け家計バランス比率バーを描画します */
function renderExpenseRatio(metrics) {
  const ratio = calcExpenseRatio(metrics);

  const fixedBar = byId('ratio-bar-fixed');
  const varBar = byId('ratio-bar-var');
  const saveBar = byId('ratio-bar-save');
  if (fixedBar) fixedBar.style.width = `${ratio.fixedPct}%`;
  if (varBar) varBar.style.width = `${ratio.varPct}%`;
  if (saveBar) saveBar.style.width = `${ratio.savingPct}%`;

  setText('ratio-text-fixed', `固定費 ${ratio.fixedPct}%`);
  setText('ratio-text-var', `変動費 ${ratio.varPct}%`);
  setText('ratio-text-save', `貯蓄・余力 ${ratio.savingPct}%`);
}

/** ③-2 固定費リストを描画します（社会人モード時は年額×12も併記） */
function renderFixedExpenses(fixedExpenses, fixedTotal, annualFixedTotal, isWorker) {
  setText(
    'fixed-total-label',
    isWorker
      ? `合計 ${formatYen(fixedTotal)}（年 ${formatYen(annualFixedTotal)}）`
      : `合計 ${formatYen(fixedTotal)}`
  );

  const fixedListEl = byId('fixed-list');
  if (!fixedListEl) return;

  if (fixedExpenses.length === 0) {
    fixedListEl.innerHTML = '<div class="empty-state">固定費の登録はまだありません</div>';
    return;
  }

  fixedListEl.innerHTML = fixedExpenses.map((item) => {
    const amountHtml = isWorker
      ? `<div class="amount-stack">
           <span class="num item-amount">${formatYen(item.amount)}</span>
           <span class="num item-annual">年 ${formatYen(item.amount * 12)}</span>
         </div>`
      : `<span class="num item-amount">${formatYen(item.amount)}</span>`;

    return `
      <div class="list-item">
        <label class="list-left list-label">
          <input type="checkbox" data-action="toggle-fixed" data-id="${item.id}" ${item.active ? 'checked' : ''}>
          <span class="${item.active ? '' : 'item-inactive'}">${escapeHtml(item.name)}</span>
        </label>
        <div class="list-left">
          ${amountHtml}
          <button type="button" class="btn-danger-text" data-action="delete-fixed" data-id="${item.id}">削除</button>
        </div>
      </div>
    `;
  }).join('');
}

/** ③-3 変動費カテゴリ別棒グラフを描画します */
function renderCategoryBars(varExpenses, varTotal, mode) {
  const barsContainer = byId('category-bars');
  if (!barsContainer) return;

  const breakdown = calcCategoryBreakdown(varExpenses, varTotal, mode);
  if (breakdown.length === 0) {
    barsContainer.innerHTML = '<div class="empty-state">変動費の記録はまだありません</div>';
    return;
  }

  barsContainer.innerHTML = breakdown.map((b) => `
    <div class="bar-row">
      <div class="bar-header">
        <span>${escapeHtml(b.category)}</span>
        <span class="num">${formatYen(b.amount)} (${b.percent}%)</span>
      </div>
      <div class="bar-bg">
        <div class="bar-val" data-percent="${b.percent}"></div>
      </div>
    </div>
  `).join('');

  barsContainer.querySelectorAll('.bar-val[data-percent]').forEach((barEl) => {
    barEl.style.width = `${barEl.dataset.percent}%`;
  });
}

/** ③-4 変動費の明細リストを描画します */
function renderVarExpenses(varExpenses, varTotal) {
  setText('var-total-label', `合計 ${formatYen(varTotal)}`);

  const varListEl = byId('var-list');
  if (!varListEl) return;

  varListEl.innerHTML = varExpenses.slice().reverse().map((item) => `
    <div class="list-item">
      <div class="list-left">
        <span class="tag">${escapeHtml(item.category)}</span>
        <span>${escapeHtml(item.memo || item.category)}</span>
      </div>
      <div class="list-left">
        <span class="num item-amount">${formatYen(item.amount)}</span>
        <button type="button" class="btn-danger-text" data-action="delete-var" data-id="${item.id}">削除</button>
      </div>
    </div>
  `).join('');
}

/** ③-5 月次収支履歴リストを描画します */
function renderHistoryList(history) {
  const historyListEl = byId('history-list');
  if (!historyListEl) return;

  if (!Array.isArray(history) || history.length === 0) {
    historyListEl.innerHTML = '<div class="empty-state">記録はまだありません（「今月を記録」で保存できます）</div>';
    return;
  }

  historyListEl.innerHTML = history.map((entry) => `
    <div class="list-item">
      <div>
        <div class="history-title">
          <span>${escapeHtml(entry.monthLabel)}</span>
          <span class="tag">${escapeHtml(entry.modeLabel)}</span>
        </div>
        <div class="history-meta num">
          収入 ${formatYen(entry.totalIncome)} / 支出 ${formatYen(entry.totalExpense)}
        </div>
      </div>
      <div class="list-left">
        <div class="amount-stack">
          <span class="history-save-label">貯蓄・残高</span>
          <span class="num item-amount">${formatYen(entry.savedAmount)}</span>
        </div>
        <button type="button" class="btn-danger-text" data-action="delete-history" data-id="${entry.id}">削除</button>
      </div>
    </div>
  `).join('');
}

/** ③ 出費管理タブ全体を描画します */
function renderExpenses(appData, metrics) {
  const profile = getActiveProfile(appData);

  if (metrics.isWorker) {
    renderExpenseRatio(metrics);
  }
  renderFixedExpenses(profile.fixedExpenses, metrics.fixedTotal, metrics.annualFixedTotal, metrics.isWorker);
  renderCategoryBars(profile.varExpenses, metrics.varTotal, appData.mode);
  renderVarExpenses(profile.varExpenses, metrics.varTotal);
  renderHistoryList(profile.history);
}

/** ④ カスタム計算式の一覧を描画します */
function renderFormulas(appData, metrics) {
  const profile = getActiveProfile(appData);
  const listEl = byId('formula-list');
  if (!listEl) return;

  if (profile.formulas.length === 0) {
    listEl.innerHTML = '<div class="empty-state">保存された計算式はありません</div>';
    return;
  }

  listEl.innerHTML = profile.formulas.map((formula) => {
    const val = evaluateCustomFormula(formula.expr, appData, metrics);
    const displayVal = escapeHtml(formatFormulaValue(val, formula.unit || ''));

    return `
      <div class="formula-card">
        <div class="formula-header">
          <div class="formula-name">${escapeHtml(formula.name)}</div>
          <button type="button" class="btn-danger-text" data-action="delete-formula" data-id="${formula.id}">削除</button>
        </div>
        <div class="formula-expr">${escapeHtml(formula.expr)}</div>
        <div class="formula-result num">${displayVal}</div>
      </div>
    `;
  }).join('');
}

/**
 * アプリ全体の表示を現在のアクティブモードとデータで再描画します。
 */
export function renderApp(appData, options = {}) {
  const { forceSyncInputs = false } = options;
  renderModeState(appData);

  const metrics = calcMetrics(appData);
  renderDashboard(appData, metrics, forceSyncInputs);

  if (appData.mode === APP_MODES.WORKER) {
    renderWorkerIncome(appData.profiles.worker, metrics, forceSyncInputs);
  } else {
    renderStudentIncome(appData.profiles.student, metrics, forceSyncInputs);
  }

  renderExpenses(appData, metrics);
  renderFormulas(appData, metrics);
}

/**
 * 下部タブバーの選択状態と表示セクションを切り替えます。
 */
export function switchTab(targetId) {
  const targetSection = byId(targetId);
  if (!targetSection) return;

  document.querySelectorAll('.tab-section').forEach((sec) => {
    sec.classList.remove('active');
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const isActive = btn.dataset.target === targetId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  targetSection.classList.add('active');
}

/**
 * 計算式入力欄のカーソル位置へ `[変数名]` を挿入します。
 */
export function insertVariableAtCursor(inputEl, varText) {
  if (!inputEl) return;
  const start = inputEl.selectionStart ?? inputEl.value.length;
  const end = inputEl.selectionEnd ?? inputEl.value.length;

  inputEl.value = inputEl.value.slice(0, start) + varText + inputEl.value.slice(end);
  inputEl.focus();

  const nextCursor = start + varText.length;
  inputEl.setSelectionRange(nextCursor, nextCursor);
}

/**
 * バックアップ書き出し・復元結果のメッセージを画面に表示します。
 */
export function showBackupFeedback(message, isError = false) {
  const msgEl = byId('backup-status-msg');
  if (!msgEl) return;
  msgEl.textContent = message;
  msgEl.classList.toggle('is-error', Boolean(isError));
  msgEl.hidden = !message;
}
