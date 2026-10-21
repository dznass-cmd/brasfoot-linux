/* Loaded before the game. ES5 by design: this file also runs on XP. */
(function () {
  'use strict';
  var fs = require('fs');
  var path = require('path');
  var win = nw.Window.get();
  var args = (nw.App.fullArgv || []).concat(nw.App.argv || []).concat(process.argv || []);
  var resume = args.indexOf('--legacy-resume-test') !== -1 || process.env.BRASFOOT_LEGACY_RESUME === '1';
  var testing = resume || args.indexOf('--legacy-smoke-test') !== -1 || process.env.BRASFOOT_LEGACY_TEST === '1';
  window.BrasfootDesktop = {
    testing: testing,
    resume: resume,
    report: function (message) {
      if (!testing) return;
      fs.appendFileSync(path.join(path.dirname(process.execPath), 'legacy-test-result.txt'), message + '\n');
    },
    finish: function (passed) {
      if (!testing) return;
      window.BrasfootDesktop.report(passed ? 'PASS' : 'FAIL');
      nw.App.quit();
    },
    capture: function (done) {
      win.capturePage(function (data) {
        fs.writeFileSync(path.join(path.dirname(process.execPath), 'legacy-test-screen.png'),
          new Buffer(data.replace(/^data:image\/png;base64,/, ''), 'base64'));
        done();
      }, { format: 'png', datatype: 'datauri' });
    }
  };
  if (testing) window.BrasfootDesktop.report('BOOTSTRAP: Chromium ' + process.versions.chromium + ', NW.js ' + process.versions.nw);
  // The engines also work in Node tests. Here they must use their browser branch.
  window.module = undefined;
  window.exports = undefined;
  win.on('new-win-policy', function (frame, url, policy) { policy.ignore(); });
  win.on('navigation', function (frame, url, policy) {
    if (/^(https?|ftp):/i.test(url)) policy.ignore();
  });
  window.addEventListener('error', function (event) {
    if (testing) {
      window.BrasfootDesktop.report('ERROR: ' + event.message + ' at ' + event.filename + ':' + event.lineno);
      window.BrasfootDesktop.finish(false);
    }
  });
  // Chromium 50 predates these DOM convenience methods.
  if (!Element.prototype.append) {
    Element.prototype.append = function () {
      for (var i = 0; i < arguments.length; i++)
        this.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
    };
  }
  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      for (var i = 0; i < arguments.length; i++) {
        this.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
      }
    };
  }
  if (!Element.prototype.toggleAttribute) {
    Element.prototype.toggleAttribute = function (name, force) {
      var enabled = arguments.length > 1 ? Boolean(force) : !this.hasAttribute(name);
      if (enabled) this.setAttribute(name, ''); else this.removeAttribute(name);
      return enabled;
    };
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = function (x, y) {
      this.scrollLeft = typeof x === 'object' ? (x.left || 0) : x;
      this.scrollTop = typeof x === 'object' ? (x.top || 0) : y;
    };
  }
  // Keep visible focus when the renderer does not recognize :focus-visible.
  document.addEventListener('click', function (event) {
    var anchor = event.target.closest('a');
    if (anchor && /^(https?|ftp):/i.test(anchor.href)) event.preventDefault();
  });
}());
