/**
 * ============================================================
 * constants.js ― アプリ全体で使う定数・モード別プロファイル定義
 * ============================================================
 * 「学生モード」と「社会人モード」でそれぞれ独立したデータ構造・
 * カテゴリ・計算式テンプレートを持つよう整理しています。
 */

/** 利用モードを表す定数 */
export const APP_MODES = {
  STUDENT: 'student',
  WORKER: 'worker'
};

/** 収支データを localStorage に保存する際のキー名（既存データ互換のため固定） */
export const STORAGE_KEY = 'campus_wallet_simple_v1';

/** 「はじめての使い方」ガイドの非表示設定を保存するモード別キー名 */
export const GUIDE_DISMISSED_KEYS = {
  [APP_MODES.STUDENT]: 'campus_wallet_guide_dismissed_student_v1',
  [APP_MODES.WORKER]: 'campus_wallet_guide_dismissed_worker_v1'
};

/** モード切り替え時・初回起動時に表示する専用説明ページの内容 */
export const MODE_GUIDE_CONTENT = {
  [APP_MODES.STUDENT]: {
    badge: 'STUDENT GUIDE',
    title: '学生モードの使い方',
    lead: 'バイト代・仕送り・扶養の壁を1画面で管理できます。最初は学生向けのサンプル数字が入っています。',
    steps: [
      {
        label: 'ホーム',
        text: '目標貯金額と残り日数から「今日使えるお金」を日割り計算。クイック出費メモですぐに支出を記録できます。'
      },
      {
        label: '収入・扶養',
        text: 'バイト時給と何分刻みかを選び、シフトや差し引き（まかない・交通費）を入れると1か月分の給料見込みと扶養の壁を自動計算します。'
      },
      {
        label: '出費・計算式',
        text: '固定費や変動費の管理に加え、「旅行代まであと何時間？」など自由な計算式を作成できます。'
      }
    ],
    note: '※右上の「設定」から社会人モードへ切替、「使い方」からいつでも見直せます'
  },
  [APP_MODES.WORKER]: {
    badge: 'WORK GUIDE',
    title: '社会人モードの使い方',
    lead: '手取り月収・給料日サイクル・先取り投資・控除を管理できます。学生モードとは完全に別データで保存されます。',
    steps: [
      {
        label: 'ホーム',
        text: '給料日（末日 / 5〜25日）基準の残り日数と、貯金・NISA・クレカ予定額を除いた「今日使えるお金」を確認できます。'
      },
      {
        label: '収入・控除',
        text: '基本給・残業代・天引き率から手取り概算を算出し、ふるさと納税の上限目安や副業20万円の壁をチェックできます。'
      },
      {
        label: '出費・計算式',
        text: '固定費の年額（×12）・家計バランス比率・月次履歴の記録や、実質時給を使った計算式作成・JSONバックアップに対応しています。'
      }
    ],
    note: '※右上の「設定」から学生モードへ戻せ、「使い方」からいつでも見直せます'
  }
};

/** 学生モード：扶養の壁のデフォルト上限額（103万円の壁） */
export const DEFAULT_WALL_LIMIT = 1030000;

/** 学生モード：バイト時給の計算で選べる時間単位（何分刻みか） */
export const SHIFT_TIME_UNITS = [1, 5, 10, 15, 30, 60];

/** 学生モード：バイト時間計算のデフォルト単位（15分刻み） */
export const DEFAULT_SHIFT_TIME_UNIT = 15;

/** 学生モード：バイト代からの差し引き計算方法（1出勤ごと / 月額固定） */
export const SHIFT_DEDUCTION_TYPES = {
  PER_SHIFT: 'per_shift',
  MONTHLY: 'monthly'
};

/** 社会人モード：副業の確定申告目安ライン（年間所得20万円の壁） */
export const SIDE_JOB_WALL_LIMIT = 200000;

/** 社会人モード：社会保険・税金のデフォルト概算天引き率（%） */
export const DEFAULT_WORKER_DEDUCTION_RATE = 20;

/** 実質時給（手取り月収 ÷ 標準労働時間）の算出に使う標準月間労働時間（h） */
export const STANDARD_MONTHLY_WORK_HOURS = 160;

/** 1日あたりの予算が警告色（オレンジ）になるしきい値（円） */
export const DAILY_BUDGET_WARN_THRESHOLD = 1000;

/** 扶養の壁／副業の壁などの進捗が警告色（オレンジ）になる割合（%） */
export const WALL_WARN_PERCENT = 85;

/** 残り日数・給料日入力の上限値（日） */
export const MAX_DAYS_IN_MONTH = 31;

/** 月次収支履歴（スナップショット）の最大保存件数 */
export const MAX_HISTORY_ITEMS = 12;

/** 学生モードで使う変動費カテゴリ */
export const STUDENT_CATEGORIES = [
  '食費',
  '交際費',
  '書籍・学用品',
  '交通費',
  'その他'
];

/** 社会人モードで使う変動費カテゴリ */
export const WORKER_CATEGORIES = [
  '食費',
  '日用品・美容',
  '交際費',
  '自己投資・趣味',
  '交通費',
  'その他'
];

/**
 * 現在のモードに応じた変動費カテゴリ一覧を返します。
 *
 * @param {string} mode
 * @returns {string[]}
 */
export function getCategoriesForMode(mode) {
  return mode === APP_MODES.WORKER ? WORKER_CATEGORIES : STUDENT_CATEGORIES;
}

/**
 * カスタム計算式で使えるすべての変数トークン定義。
 */
export const FORMULA_VAR = {
  WAGE: '[バイト時給]',
  HOURS: '[月間バイト時間]',
  PARTTIME_PAY: '[バイト代見込み]',
  ALLOWANCE: '[仕送り]',
  TOTAL_INCOME: '[総収入]',
  TAKE_HOME: '[手取り月収]',
  FIXED_TOTAL: '[固定費合計]',
  VAR_TOTAL: '[変動費合計]',
  FREE_BALANCE: '[フリー残高]',
  SAVINGS_GOAL: '[目標貯金額]',
  DAYS_LEFT: '[残り日数]',
  INVEST_GOAL: '[先取り投資額]',
  ANNUAL_FIXED: '[年間固定費]',
  EFFECTIVE_HOURLY: '[実質時給]'
};

/** 学生モード時に計算式タブへ表示する変数チップ一覧 */
export const STUDENT_FORMULA_CHIPS = [
  FORMULA_VAR.WAGE,
  FORMULA_VAR.HOURS,
  FORMULA_VAR.PARTTIME_PAY,
  FORMULA_VAR.ALLOWANCE,
  FORMULA_VAR.TOTAL_INCOME,
  FORMULA_VAR.FIXED_TOTAL,
  FORMULA_VAR.VAR_TOTAL,
  FORMULA_VAR.FREE_BALANCE,
  FORMULA_VAR.SAVINGS_GOAL,
  FORMULA_VAR.DAYS_LEFT
];

/** 社会人モード時に計算式タブへ表示する変数チップ一覧 */
export const WORKER_FORMULA_CHIPS = [
  FORMULA_VAR.TAKE_HOME,
  FORMULA_VAR.EFFECTIVE_HOURLY,
  FORMULA_VAR.FIXED_TOTAL,
  FORMULA_VAR.ANNUAL_FIXED,
  FORMULA_VAR.VAR_TOTAL,
  FORMULA_VAR.FREE_BALANCE,
  FORMULA_VAR.SAVINGS_GOAL,
  FORMULA_VAR.INVEST_GOAL,
  FORMULA_VAR.DAYS_LEFT
];

/**
 * モードに応じた計算式変数チップ一覧を返します。
 *
 * @param {string} mode
 * @returns {string[]}
 */
export function getFormulaChipsForMode(mode) {
  return mode === APP_MODES.WORKER ? WORKER_FORMULA_CHIPS : STUDENT_FORMULA_CHIPS;
}

/** 学生モードのサンプル計算式プリセット */
export const STUDENT_FORMULA_PRESETS = [
  {
    name: '旅行代（5万円）を貯めるのに必要なバイト時間',
    expr: `(50000 - ${FORMULA_VAR.FREE_BALANCE}) / ${FORMULA_VAR.WAGE}`,
    unit: '時間'
  },
  {
    name: '1日あたりの食費目安（フリー残高の50%配分）',
    expr: `(${FORMULA_VAR.FREE_BALANCE} * 0.5) / ${FORMULA_VAR.DAYS_LEFT}`,
    unit: '円/日'
  }
];

/** 社会人モードのサンプル計算式プリセット */
export const WORKER_FORMULA_PRESETS = [
  {
    name: '3万円の買い物は自分の労働何時間分？',
    expr: `30000 / ${FORMULA_VAR.EFFECTIVE_HOURLY}`,
    unit: '時間'
  },
  {
    name: '1日あたりの自由費目安（フリー残高の60%配分）',
    expr: `(${FORMULA_VAR.FREE_BALANCE} * 0.6) / ${FORMULA_VAR.DAYS_LEFT}`,
    unit: '円/日'
  }
];

/**
 * モードに応じたサンプル計算式プリセットを返します。
 *
 * @param {string} mode
 */
export function getFormulaPresetsForMode(mode) {
  return mode === APP_MODES.WORKER ? WORKER_FORMULA_PRESETS : STUDENT_FORMULA_PRESETS;
}

/**
 * 今日を含めた「今月の残り日数（末日締め）」を計算して返します。
 *
 * @param {Date} [date]
 * @returns {number}
 */
export function getRemainingDaysInMonth(date = new Date()) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.max(1, lastDay - date.getDate() + 1);
}

/**
 * 締め日（末日 または 毎月○日の給料日）から、次のサイクルまでの残り日数を計算します。
 *
 * @param {number} [payday] 0=末日締め、1〜31=毎月の給料日
 * @param {Date} [date]
 * @returns {number}
 */
export function getRemainingDaysForCycle(payday = 0, date = new Date()) {
  const normalizedPayday = Math.round(Number(payday) || 0);
  if (normalizedPayday <= 0) {
    return getRemainingDaysInMonth(date);
  }

  const targetDay = Math.min(MAX_DAYS_IN_MONTH, normalizedPayday);
  const year = date.getFullYear();
  const month = date.getMonth();
  const todayDay = date.getDate();

  const daysInThisMonth = new Date(year, month + 1, 0).getDate();
  const thisMonthPayday = Math.min(targetDay, daysInThisMonth);

  let nextYear = year;
  let nextMonth = month;
  let nextPayday = thisMonthPayday;

  if (todayDay >= thisMonthPayday) {
    nextYear = month === 11 ? year + 1 : year;
    nextMonth = (month + 1) % 12;
    const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    nextPayday = Math.min(targetDay, daysInNextMonth);
  }

  const todayUtc = Date.UTC(year, month, todayDay);
  const nextPaydayUtc = Date.UTC(nextYear, nextMonth, nextPayday);
  const diffDays = Math.round((nextPaydayUtc - todayUtc) / 86400000);
  return Math.max(1, diffDays);
}

/**
 * 学生モード用の初期サンプルプロファイルを生成します。
 */
export function createStudentDefaultProfile() {
  return {
    settings: {
      savingsGoal: 15000,
      daysLeft: getRemainingDaysInMonth()
    },
    income: {
      wage: 1150,
      timeUnit: DEFAULT_SHIFT_TIME_UNIT,
      allowance: 40000,
      other: 0,
      wallLimit: DEFAULT_WALL_LIMIT,
      ytdIncome: 520000
    },
    shifts: [
      { id: 301, label: '平日夕方シフト', startTime: '17:00', endTime: '21:20', breakMinutes: 0, days: 8, active: true },
      { id: 302, label: '土日ロングシフト', startTime: '11:00', endTime: '17:30', breakMinutes: 45, days: 4, active: true }
    ],
    shiftDeductions: [
      { id: 401, name: 'まかない代', type: SHIFT_DEDUCTION_TYPES.PER_SHIFT, amount: 200, active: true },
      { id: 402, name: '交通費（自己負担分）', type: SHIFT_DEDUCTION_TYPES.MONTHLY, amount: 2400, active: true }
    ],
    fixedExpenses: [
      { id: 1, name: '家賃・共益費', amount: 45000, active: true },
      { id: 2, name: 'スマホ通信費', amount: 2980, active: true },
      { id: 3, name: '動画・音楽サブスク', amount: 1080, active: true }
    ],
    varExpenses: [
      { id: 101, category: '食費', memo: '学食ランチ', amount: 550 },
      { id: 102, category: '書籍・学用品', memo: '講義テキスト', amount: 2400 },
      { id: 103, category: '交際費', memo: 'サークル飲み会', amount: 3500 },
      { id: 104, category: '交通費', memo: '定期外移動', amount: 640 }
    ],
    formulas: STUDENT_FORMULA_PRESETS.map((preset, idx) => ({
      id: 201 + idx,
      ...preset
    })),
    history: []
  };
}

/**
 * 社会人モード用の初期サンプルプロファイルを生成します。
 */
export function createWorkerDefaultProfile() {
  return {
    settings: {
      payday: 25,
      daysLeft: getRemainingDaysForCycle(25),
      savingsGoal: 30000,
      investGoal: 20000,
      creditPending: 15000
    },
    workerIncome: {
      grossSalary: 260000,
      overtimePay: 20000,
      deductionRate: DEFAULT_WORKER_DEDUCTION_RATE,
      otherNetIncome: 0,
      simType: 'furusato',
      annualGross: 3800000,
      familyType: 'single',
      furusatoDonated: 10000,
      ytdSideProfit: 60000
    },
    fixedExpenses: [
      { id: 1001, name: '家賃・管理費', amount: 68000, active: true },
      { id: 1002, name: '水道光熱費', amount: 10500, active: true },
      { id: 1003, name: '通信費・Wi-Fi', amount: 6500, active: true },
      { id: 1004, name: 'サブスク・ジム', amount: 3980, active: true }
    ],
    varExpenses: [
      { id: 1101, category: '食費', memo: 'オフィスランチ', amount: 980 },
      { id: 1102, category: '交際費', memo: '同僚と懇親会', amount: 4500 },
      { id: 1103, category: '日用品・美容', memo: '日用品まとめ買い', amount: 2800 },
      { id: 1104, category: '交通費', memo: '休日カフェ・移動', amount: 1200 }
    ],
    formulas: WORKER_FORMULA_PRESETS.map((preset, idx) => ({
      id: 1201 + idx,
      ...preset
    })),
    history: []
  };
}

/**
 * 指定モードの初期サンプルプロファイルを生成します。
 *
 * @param {string} mode
 */
export function createDefaultProfile(mode) {
  return mode === APP_MODES.WORKER
    ? createWorkerDefaultProfile()
    : createStudentDefaultProfile();
}

/**
 * 指定モードのゼロリセット済みプロファイルを生成します。
 *
 * @param {string} mode
 */
export function createEmptyProfile(mode) {
  if (mode === APP_MODES.WORKER) {
    return {
      settings: {
        payday: 25,
        daysLeft: getRemainingDaysForCycle(25),
        savingsGoal: 0,
        investGoal: 0,
        creditPending: 0
      },
      workerIncome: {
        grossSalary: 0,
        overtimePay: 0,
        deductionRate: DEFAULT_WORKER_DEDUCTION_RATE,
        otherNetIncome: 0,
        simType: 'furusato',
        annualGross: 0,
        familyType: 'single',
        furusatoDonated: 0,
        ytdSideProfit: 0
      },
      fixedExpenses: [],
      varExpenses: [],
      formulas: [],
      history: []
    };
  }

  return {
    settings: {
      savingsGoal: 0,
      daysLeft: getRemainingDaysInMonth()
    },
    income: {
      wage: 1100,
      timeUnit: DEFAULT_SHIFT_TIME_UNIT,
      allowance: 0,
      other: 0,
      wallLimit: DEFAULT_WALL_LIMIT,
      ytdIncome: 0
    },
    shifts: [],
    shiftDeductions: [],
    fixedExpenses: [],
    varExpenses: [],
    formulas: [],
    history: []
  };
}

/**
 * アプリ全体の初期データ（学生・社会人両プロファイルを含む）を生成します。
 */
export function createDefaultData() {
  return {
    mode: APP_MODES.STUDENT,
    profiles: {
      student: createStudentDefaultProfile(),
      worker: createWorkerDefaultProfile()
    }
  };
}
