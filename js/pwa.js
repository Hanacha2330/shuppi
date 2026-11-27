/**
 * ============================================================
 * pwa.js ― PWA（ホーム画面追加・オフライン動作）の初期化処理
 * ============================================================
 * Android Chrome と iOS Safari ではホーム画面への追加方法が異なるため、
 * それぞれのOSに合わせた案内表示と Service Worker の登録を行います。
 */

/**
 * オフライン動作のための Service Worker（sw.js）を登録します。
 */
function registerServiceWorker() {
  // Service Worker は https:// または localhost / 127.0.0.1（isSecureContext）でのみ動作します
  if ('serviceWorker' in navigator && window.isSecureContext) {
    // updateViaCache: 'none' により古い sw.js がブラウザキャッシュから返されるのを防ぐ
    navigator.serviceWorker.register('./sw.js?v=11', { scope: './', updateViaCache: 'none' }).catch(() => {
      // 未対応環境や登録失敗時でもアプリ本体の利用は止めない
    });
  }
}

/**
 * Android 向けの「アプリをインストール」ボタンを制御します。
 * ブラウザがインストール可能と判断したときに発火する beforeinstallprompt を捕捉します。
 */
function setupAndroidInstallPrompt() {
  const installBtn = document.getElementById('android-install-btn');
  if (!installBtn) return;

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    // ブラウザ標準の自動ミニバナーを抑止し、ヘッダーのボタンから任意のタイミングで出せるようにする
    event.preventDefault();
    deferredPrompt = event;
    installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });
}

/**
 * iOS Safari 向けの「ホーム画面に追加」案内バナーを制御します。
 * iOS にはインストールボタンAPIが無いため、通常のブラウザで開いているときだけ案内を出します。
 */
function setupIosInstallBanner() {
  const iosBanner = document.getElementById('ios-install-banner');
  const closeBannerBtn = document.getElementById('close-ios-banner');

  if (closeBannerBtn && iosBanner) {
    closeBannerBtn.addEventListener('click', () => {
      iosBanner.hidden = true;
    });
  }

  if (!iosBanner) return;

  const ua = window.navigator.userAgent.toLowerCase();
  // iPadOS 13以降は User-Agent が MacIntel になるため、タッチ操作の可否もあわせて判定する
  const isIos = /iphone|ipad|ipod/.test(ua)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

  // すでにホーム画面から起動（スタンドアロンモード）していれば案内は出さない
  const isInStandaloneMode = Boolean(window.navigator.standalone)
    || window.matchMedia('(display-mode: standalone)').matches;

  if (isIos && !isInStandaloneMode) {
    iosBanner.hidden = false;
  }
}

/**
 * PWA関連のセットアップをまとめて初期化します。
 */
export function setupPWA() {
  registerServiceWorker();
  setupAndroidInstallPrompt();
  setupIosInstallBanner();
}
