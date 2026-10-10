(function () {
  try {
    var root = document.documentElement;
    function readCookie(name) {
      var part = document.cookie
        .split(';')
        .map(function (p) {
          return p.trim();
        })
        .find(function (p) {
          return p.substring(0, name.length + 1) === name + '=';
        });
      if (!part) return '';
      try {
        return decodeURIComponent(part.slice(name.length + 1));
      } catch {
        return '';
      }
    }
    function readStorage(names) {
      try {
        for (var i = 0; i < names.length; i++) {
          var value = (localStorage.getItem(names[i]) || '').trim();
          if (value) return value;
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
          console.warn('Unable to read theme from localStorage; falling back to default.', e);
        }
      }
      return '';
    }
    var theme = readCookie('dal.theme.mode').trim();
    if (theme !== 'light' && theme !== 'dark') theme = readCookie('bp.theme.mode').trim();
    if (theme !== 'light' && theme !== 'dark') {
      theme = readStorage([
        'dal.theme.mode',
        'bp.theme.mode',
        'budgetplanner.theme.mode',
        'appbase.theme.mode',
      ]);
    }
    if (theme !== 'light' && theme !== 'dark') theme = 'dark';
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    root.classList.remove('dark');
    if (theme === 'dark') root.classList.add('dark');

    var uiStyles = ['prism', 'shadow', 'clear', 'acrylic'];
    function isUiStyle(value) {
      return uiStyles.indexOf(value) !== -1;
    }
    var ui = readCookie('dal.ui.style').trim();
    if (!isUiStyle(ui)) ui = readCookie('bp.ui.style').trim();
    if (!isUiStyle(ui)) ui = readStorage(['dal.ui.style', 'bp.ui.style']);
    if (!isUiStyle(ui)) ui = 'prism';
    for (var i = 0; i < uiStyles.length; i++) {
      root.classList.remove('ui-' + uiStyles[i]);
    }
    root.classList.add('ui-' + ui);
  } catch {}
})();
