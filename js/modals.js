/**
 * ============================================================
 * modals.js ― 設定モーダル・モード別説明ページの制御モジュール
 * ============================================================
 * ヘッダーの「設定」ボタンで開くモード切替モーダルと、
 * 学生モード／社会人モードそれぞれ専用の内容に切り替わるガイドモーダルを管理します。
 */

import { APP_MODES, MODE_GUIDE_CONTENT } from './constants.js?v=11';
import { isGuideDismissed } from './storage.js?v=11';

function byId(id) {
  return document.getElementById(id);
}

/** 設定モーダルが開いているかを返します */
export function isSettingsOpen() {
  const el = byId('settings-modal');
  return Boolean(el && !el.hidden);
}

/** 使い方説明モーダルが開いているかを返します */
export function isGuideOpen() {
  const el = byId('usage-guide');
  return Boolean(el && !el.hidden);
}

/**
 * どちらかのモーダルが開いているあいだは背面ページのスクロールを止めます。
 * 設定モーダルからガイドモーダルへ連続で切り替えてもロックが途切れないように一元管理します。
 */
export function syncModalScrollLock() {
  document.body.classList.toggle('modal-open', isSettingsOpen() || isGuideOpen());
}

/**
 * 設定モーダル内のモードカード選択状態と「切替時に説明を表示」チェックを同期します。
 *
 * @param {string} mode
 */
export function renderSettingsState(mode) {
  const safeMode = mode === APP_MODES.WORKER ? APP_MODES.WORKER : APP_MODES.STUDENT;

  document.querySelectorAll('#mode-selector .mode-card[data-mode]').forEach((card) => {
    const isActive = card.dataset.mode === safeMode;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-checked', String(isActive));
  });

  const toggleEl = byId('toggle-mode-guide');
  if (toggleEl) {
    toggleEl.checked = !isGuideDismissed(safeMode);
  }

  const labelEl = byId('settings-guide-mode-label');
  if (labelEl) {
    labelEl.textContent = safeMode === APP_MODES.WORKER ? '社会人モード' : '学生モード';
  }
}

/**
 * モード別の説明ページ（タイトル・バッジ・リード文・3ステップ）を描画します。
 * innerHTML を使わず DOM ノードで構築するため安全で高速です。
 *
 * @param {string} mode
 */
export function renderGuideContent(mode) {
  const safeMode = mode === APP_MODES.WORKER ? APP_MODES.WORKER : APP_MODES.STUDENT;
  const content = MODE_GUIDE_CONTENT[safeMode];

  const badgeEl = byId('usage-guide-badge');
  const titleEl = byId('usage-guide-title');
  const leadEl = byId('usage-guide-lead');
  const stepsEl = byId('usage-guide-steps');
  const noteEl = byId('usage-guide-note');

  if (badgeEl) badgeEl.textContent = content.badge;
  if (titleEl) titleEl.textContent = content.title;
  if (leadEl) leadEl.textContent = content.lead;
  if (noteEl) noteEl.textContent = content.note;

  if (stepsEl) {
    stepsEl.textContent = '';
    content.steps.forEach((step, idx) => {
      const li = document.createElement('li');
      li.className = 'guide-step';

      const numBadge = document.createElement('span');
      numBadge.className = 'guide-step-num num';
      numBadge.textContent = String(idx + 1);

      const textWrap = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = step.label;
      textWrap.appendChild(strong);
      textWrap.appendChild(document.createTextNode(`：${step.text}`));

      li.appendChild(numBadge);
      li.appendChild(textWrap);
      stepsEl.appendChild(li);
    });
  }
}

/**
 * 設定モーダルの表示／非表示を切り替えます。
 *
 * @param {boolean} visible
 * @param {string} mode
 */
export function setSettingsVisible(visible, mode) {
  const isVisible = Boolean(visible);
  const modalEl = byId('settings-modal');
  const openBtn = byId('btn-open-settings');

  if (isVisible) {
    renderSettingsState(mode);
  }
  if (modalEl) {
    modalEl.hidden = !isVisible;
  }
  if (openBtn) {
    openBtn.setAttribute('aria-expanded', String(isVisible));
  }
  syncModalScrollLock();

  if (isVisible && modalEl) {
    modalEl.querySelector('.mode-card.active')?.focus({ preventScroll: true });
  }
}

/**
 * モード別の説明モーダルの表示／非表示を切り替えます。
 *
 * @param {boolean} visible
 * @param {string} mode
 */
export function setGuideVisible(visible, mode) {
  const isVisible = Boolean(visible);
  const guideEl = byId('usage-guide');
  const toggleBtn = byId('btn-toggle-guide');

  if (isVisible) {
    renderGuideContent(mode);
  }
  if (guideEl) {
    guideEl.hidden = !isVisible;
  }
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(isVisible));
  }
  syncModalScrollLock();

  if (isVisible) {
    byId('btn-confirm-guide')?.focus({ preventScroll: true });
  }
}
