'use strict';

/* ========================================
   about.html 専用スクリプト
   - テーマ管理（app.js と共通の localStorage キーを使用）
   - サイドバーのスクロール連動ハイライト
   ======================================== */
(function () {
  const THEME_KEY    = 'iidx_theme';
  const VALID_THEMES = ['light', 'dark', 'sparkle', 'tricoro'];

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? '' : theme);
    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.themeTarget === theme));
    });
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  }

  // 保存済みテーマを復元
  try {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved && VALID_THEMES.includes(saved)) {
      applyTheme(saved);
    }
  } catch (_) {}

  // テーマボタンイベント
  document.querySelectorAll('.theme-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyTheme(btn.dataset.themeTarget);
    });
  });

  // サイドバーのアクティブリンク（スクロール連動）
  var navLinks = document.querySelectorAll('.sidebar-nav a');
  if ('IntersectionObserver' in window && navLinks.length > 0) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          navLinks.forEach(function (link) {
            link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
          });
        }
      });
    }, { rootMargin: '-20% 0px -60% 0px' });

    document.querySelectorAll('.section[id]').forEach(function (s) {
      observer.observe(s);
    });
  }
})();
