/**
 * ============================================================
 * sw.js ― オフライン動作を支える Service Worker（裏方スクリプト）
 * ============================================================
 * Service Worker はページとは別の裏側で動き、通信を仲介して
 * HTML / CSS / JS / 画像をブラウザのキャッシュに保存します。
 */

/** アセット・キャッシュのバージョン（更新時は v11 → v12 のように上げる） */
const ASSET_VERSION = 'v11';
const CACHE_NAME = `campus-wallet-${ASSET_VERSION}`;

/** 初回インストール時にあらかじめ保存しておくアプリ一式のファイル一覧 */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './css/styles.css?v=11',
  './js/constants.js?v=11',
  './js/storage.js?v=11',
  './js/formulaParser.js?v=11',
  './js/shiftCalculator.js?v=11',
  './js/calculator.js?v=11',
  './js/modals.js?v=11',
  './js/pwa.js?v=11',
  './js/ui.js?v=11',
  './js/app.js?v=11'
];

/**
 * 1. install イベント：初回登録時（または CACHE_NAME 更新時）に1回だけ実行
 * cache: 'reload' でHTTPディスクキャッシュを回避して最新ファイルを取得・保存します。
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        const freshRequests = PRECACHE_ASSETS.map((url) => new Request(url, { cache: 'reload' }));
        return cache.addAll(freshRequests);
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * 2. activate イベント：新しい Service Worker が動き出したときに実行
 * 古いバージョンのキャッシュを削除し、開いているタブへ即座に適用します。
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * 3. fetch イベント：アプリがファイルやページを読み込むたびに実行
 * Network-First（まずネットから最新を取得し、オフライン時のみキャッシュを返す）方式です。
 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        const cached = (await caches.match(event.request))
          || (await caches.match(event.request, { ignoreSearch: true }));
        if (cached) return cached;

        if (event.request.mode === 'navigate') {
          return (await caches.match('./index.html')) || caches.match('./');
        }
        return Response.error();
      })
  );
});
