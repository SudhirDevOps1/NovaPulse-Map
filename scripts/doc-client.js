/**
 * Client behaviour for the generated documentation pages.
 *
 * Kept as a real file rather than a string inside scripts/docs.mjs so the
 * regexes are literals instead of escaped template-literal soup, and so this
 * file can be linted and debugged like any other source.
 *
 * scripts/docs.mjs reads this and inlines it into every generated page.
 */
(function () {
  'use strict';

  var KEYWORDS = 'const|let|var|function|return|if|else|for|of|in|new|class|' +
    'extends|import|from|export|default|await|async|try|catch|finally|throw|' +
    'typeof|instanceof|delete|void|yield|static|get|set|null|true|false|undefined|this';

  /* One combined regex per language, scanned in a SINGLE pass.
     Applying each rule as a separate global replace over accumulating HTML
     lets a later rule match inside markup emitted by an earlier one — that
     bug turned sample code like "<div" into a class attribute. Single pass
     cannot do that. */
  var LANGS = {
    js: {
      re: /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)|\b(CONSTKEYWORDS)\b|\b([A-Za-z_$][\w$]*)(?=\s*\()|\b(\d+(?:\.\d+)?)\b|([{}()[\];,.?!<>=+\-*/%&|])/,
      classes: ['com', 'str', 'key', 'fn', 'num', 'pun']
    },
    html: {
      re: /(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?[A-Za-z][\w:-]*)|((?:[A-Za-z-]+)=)(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)|(\/?&gt;)/,
      classes: ['com', 'tag', 'atr', 'str', 'tag']
    },
    json: {
      re: /(&quot;[^&]*?&quot;)(?=\s*:)|(&quot;[^&]*?&quot;)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/,
      classes: ['key', 'str', 'num', 'key']
    },
    bash: {
      re: /(#[^\n]*)|(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)|\b(npm|npx|node|git|curl|cd|ls|mkdir)\b/,
      classes: ['com', 'str', 'key']
    },
    ts: {
      re: /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|('(?:\\.|[^'])*'|"(?:\\.|[^"])*")|\b(TKEYWORDS)\b|\b([A-Za-z_$][\w$]*)(?=\s*[\(<])|\b(\d+(?:\.\d+)?)\b|([{}()[\];,.<>:?=|])/,
      classes: ['com', 'str', 'key', 'fn', 'num', 'pun']
    }
  };
  LANGS.jsx = LANGS.js;
  LANGS.vue = LANGS.js;
  LANGS.shell = LANGS.bash;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function highlight(code, lang) {
    var spec = LANGS[lang];
    if (!spec) return esc(code);

    var re = spec.re.source
      .replace('CONSTKEYWORDS', KEYWORDS)
      .replace('TKEYWORDS', KEYWORDS + '|interface|type|enum|implements|readonly|public|private|declare');
    var rx = new RegExp(re, 'g');

    /* Tokenise the ESCAPED text so the rules above (which expect &lt; and
       &quot;) line up with it. Escape first, then match — never the reverse. */
    var text = esc(code);
    var out = '';
    var last = 0;
    var m;

    while ((m = rx.exec(text)) !== null) {
      if (m[0] === '') { rx.lastIndex++; continue; }
      out += text.slice(last, m.index);
      var cls = 'pun';
      for (var g = 1; g < m.length; g++) {
        if (m[g] !== undefined) { cls = spec.classes[g - 1] || 'pun'; break; }
      }
      out += '<span class="' + cls + '">' + m[0] + '</span>';
      last = m.index + m[0].length;
    }
    return out + text.slice(last);
  }

  [].forEach.call(document.querySelectorAll('pre code[data-lang]'), function (code) {
    code.innerHTML = highlight(code.textContent, code.getAttribute('data-lang'));
  });

  /* ── Copy buttons ──────────────────────────────────────────────────── */
  [].forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    btn.addEventListener('click', function () {
      var block = btn.closest('.code');
      var code = block && block.querySelector('pre code');
      if (!code) return;

      var text = code.textContent;

      function flash(label, ok) {
        var old = btn.textContent;
        btn.textContent = label;
        btn.classList.toggle('done', !!ok);
        setTimeout(function () {
          btn.textContent = old;
          btn.classList.remove('done');
        }, 1600);
      }

      /* navigator.clipboard needs a secure context. file:// and plain HTTP on
         a LAN do not qualify, so fall back to execCommand rather than failing
         silently. */
      function legacy() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          flash(ok ? 'Copied' : 'Ctrl+C', ok);
        } catch (e) { flash('Ctrl+C', false); }
      }

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
          .then(function () { flash('Copied', true); })
          .catch(legacy);
      } else {
        legacy();
      }
    });
  });

  /* ── Active sidebar: mark whichever page matches the path ──────────── */
  (function () {
    var here = location.pathname.split('/').pop() || 'index.html';
    [].forEach.call(document.querySelectorAll('.side nav a'), function (a) {
      var target = a.getAttribute('href').split('/').pop();
      if (target === here) a.setAttribute('aria-current', 'page');
    });
  })();
})();