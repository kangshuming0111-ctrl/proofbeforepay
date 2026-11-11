/* ProofBeforePay · local fictional demo
   No model or payment call, no account. Three bounded DOM checks inspect
   fixed illustrative pages. Historical AI/payment evidence is separate. */

(function () {
  "use strict";

  var AGREED = { price: 18, phone: "+61 3 9000 0000", hours: "11:00–20:00" };

  var PAGES = [
    { key: "index.html", label: "Home" },
    { key: "menu.html", label: "Menu" },
    { key: "visit.html", label: "Visit" }
  ];

  var STYLES = ':root{font-family:system-ui;color:#213d30;background:#fffdf5}' +
    '*{box-sizing:border-box}body{margin:0}' +
    'main{max-width:800px;margin:auto;padding:24px}' +
    'nav{display:flex;flex-wrap:wrap;gap:12px}' +
    'a{display:inline-block;padding:12px;background:#e5ecdf;color:inherit}' +
    'h1{font-family:Georgia,serif}section{padding:18px 0}p{line-height:1.7}' +
    'label{display:block;margin-block:10px}input{max-width:100%;padding:6px;font:inherit}' +
    '.notice{font-size:12px;border-bottom:1px solid #ccc;padding:12px}' +
    'a:focus-visible,input:focus-visible{outline:3px solid #9d6035}' +
    '@media (max-width:600px){main{padding:16px}}';

  function page(lang, title, content) {
    return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + title + '</title><style>' + STYLES + '</style></head>' +
      '<body><main>' + content + '</main></body></html>';
  }

  /* Adapted from the concept in lib/noodle-demo.ts, not a byte-for-byte copy
     or a delivery used by the linked historical model/payment records. */
  function files(variant) {
    var fixed = variant === "v2";
    return {
      "index.html": page("en", "Laneway Noodles | Home",
        '<p class="notice">Fictional test restaurant. This site cannot take orders, send messages or process payments.</p>' +
        '<h1>Laneway Noodles</h1>' +
        '<p>A twelve-seat noodle bar down a laneway off Little Bourke Street. Open Monday to Friday, 11am to 8pm.</p>' +
        '<nav><a href="menu.html">View menu</a><a href="visit.html#consultation">Visit information</a></nav>'),
      "menu.html": page("en", "Laneway Noodles | Menu",
        '<h1>Menu</h1>' +
        '<p class="menu-lead">Everything is made to order. Kitchen closes thirty minutes before the shop.</p>' +
        '<p class="menu-row"><span>House ramen</span> <span>AUD</span> <strong>' + (fixed ? "18" : "28") + '</strong></p>' +
        (fixed ? '' : '<p style="display:none">House ramen AUD 18</p>') +
        '<p class="menu-row"><span>Vegetarian noodles</span> <span>AUD</span> <strong>16</strong></p>' +
        '<p class="menu-row"><span>Pork and chive gyoza</span> <span>AUD</span> <strong>9</strong></p>' +
        '<p class="menu-row"><span>Iced barley tea</span> <span>AUD</span> <strong>5</strong></p>' +
        '<p class="menu-row"><span>Matcha soft serve</span> <span>AUD</span> <strong>7</strong></p>' +
        '<nav><a href="index.html">Home</a><a href="visit.html#consultation">Visit us</a></nav>'),
      "visit.html": page("en", "Laneway Noodles | Visit",
        '<h1>Visit us</h1>' +
        '<section id="consultation"><h2>Bookings and directions</h2>' +
        '<p>' + (fixed ? AGREED.phone : "+61 3 9000 9999") + '</p>' +
        '<p>Monday–Friday 11:00–20:00</p></section>' +
        '<section><h2>Send us a message</h2><form>' +
        '<label>Name <input type="text" name="name"></label>' +
        '<label>Email <input type="email" name="email"></label></form>' +
        '<p>Demo only. This form does not submit.</p></section>' +
        '<nav><a href="index.html">Home</a></nav>')
    };
  }

  var frame = document.getElementById("preview");
  var urlBar = document.getElementById("url");
  var tag = document.getElementById("version-tag");
  var runBtn = document.getElementById("run");
  var results = document.getElementById("results");
  var rows = document.getElementById("rows");
  var verdict = document.getElementById("verdict");
  var tabBar = document.getElementById("tabs");
  var switches = Array.prototype.slice.call(document.querySelectorAll(".switch-btn"));
  var grepCount = document.getElementById("grep-count");
  var grepWhere = document.getElementById("grep-where");
  var grepPoint = document.getElementById("grep-point");

  var GREP = {
    v1: {
      count: "1",
      where: 'match — inside a paragraph with <code>style="display:none"</code>.',
      point: "The correct price <b>is</b> in the file. It is not on the page. Checking only whether this literal string exists would miss the wrong visible price. The local row check above catches it."
    },
    v2: {
      count: "0",
      where: "matches — the hidden duplicate was removed.",
      point: "Version 2 keeps one value, in one visible place. That is what the clause asked for — and it is the only thing the check agreed to look at."
    }
  };

  var state = { version: "v1", page: "menu.html" };
  var rendered = {};   // page key -> iframe holding that page
  var ready = null;

  /* ---------- rendering ---------- */

  function makeFrame(html) {
    var f = document.createElement("iframe");
    f.className = "offscreen";
    f.setAttribute("aria-hidden", "true");
    f.setAttribute("tabindex", "-1");
    f.setAttribute("sandbox", "allow-same-origin");
    f.srcdoc = html;
    return f;
  }

  function render() {
    var all = files(state.version);
    var host = document.getElementById("offscreen");
    host.textContent = "";

    urlBar.textContent = "laneway-noodles.example/" + state.page;
    tag.textContent = state.version;

    var g = GREP[state.version];
    grepCount.textContent = g.count;
    grepWhere.innerHTML = g.where;
    grepPoint.innerHTML = g.point;

    frame.srcdoc = all[state.page];

    var loads = [];
    rendered = {};
    PAGES.forEach(function (p) {
      var f = makeFrame(all[p.key]);
      host.appendChild(f);
      rendered[p.key] = f;
      loads.push(new Promise(function (resolve) {
        f.addEventListener("load", function () {
          var d = f.contentDocument;
          if (d) d.addEventListener("click", function (e) { e.preventDefault(); });
          resolve();
        });
        setTimeout(resolve, 1200);
      }));
    });
    ready = Promise.all(loads);

    Array.prototype.forEach.call(tabBar.querySelectorAll("button"), function (b) {
      var on = b.getAttribute("data-page") === state.page;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
  }

  switches.forEach(function (b) {
    b.addEventListener("click", function () {
      state.version = b.getAttribute("data-version");
      switches.forEach(function (o) {
        var on = o === b;
        o.classList.toggle("is-on", on);
        o.setAttribute("aria-pressed", on ? "true" : "false");
      });
      render();
      if (!results.hidden) ready.then(run);
    });
  });

  tabBar.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    state.page = b.getAttribute("data-page");
    render();
  });

  tabBar.addEventListener("keydown", function (e) {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(e.key) === -1) return;
    e.preventDefault();
    var all = Array.prototype.slice.call(tabBar.querySelectorAll("button"));
    var i = all.indexOf(document.activeElement);
    if (i < 0) i = 0;
    var next = e.key === "Home" ? 0
      : e.key === "End" ? all.length - 1
        : e.key === "ArrowRight" ? (i + 1) % all.length
          : (i - 1 + all.length) % all.length;
    state.page = all[next].getAttribute("data-page");
    render();
    var active = tabBar.querySelector('[data-page="' + state.page + '"]');
    if (active) active.focus();
  });

  frame.addEventListener("load", function () {
    var d = frame.contentDocument;
    if (d) d.addEventListener("click", function (e) { e.preventDefault(); });
  });

  /* ---------- reading the rendered pages ---------- */

  /* Computed style must be asked of the document that owns the node, not of
     this window: Firefox and Safari do not resolve a foreign node otherwise. */
  function visible(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      var win = (node.ownerDocument && node.ownerDocument.defaultView) || window;
      var s = win.getComputedStyle(node);
      if (s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse") return false;
      if (parseFloat(s.opacity) === 0) return false;
      if (node.hasAttribute("hidden") || node.hasAttribute("inert")) return false;
      node = node.parentElement;
    }
    return true;
  }

  function docOf(key) {
    var f = rendered[key];
    return f && f.contentDocument && f.contentDocument.body ? f.contentDocument : null;
  }

  function visibleText(doc) {
    var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
    var out = [];
    var n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      var host = n.parentElement;
      if (host && host.closest("script,style,noscript,template")) continue;
      if (host && !visible(host)) continue;
      out.push(n.nodeValue);
    }
    return out.join(" ").replace(/\s+/g, " ");
  }

  function readPrice() {
    var doc = docOf("menu.html");
    if (!doc) return null;
    var candidates = doc.querySelectorAll(".menu-row");
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.textContent.indexOf("House ramen") === -1) continue;
      if (!visible(el)) continue;
      var m = /AUD\s*([\d]+(?:\.\d+)?)/.exec(el.textContent.replace(/\s+/g, " "));
      if (m) return { amount: parseFloat(m[1]), text: el.textContent.replace(/\s+/g, " ").trim() };
    }
    return null;
  }

  function readPhone() {
    var doc = docOf("visit.html");
    if (!doc) return null;
    var text = visibleText(doc);
    var m = /\+61[\s\d]{6,}/.exec(text);
    return m ? m[0].replace(/\s+/g, " ").trim() : null;
  }

  function readHours() {
    var doc = docOf("visit.html");
    if (!doc) return null;
    var text = visibleText(doc);
    if (/11:00\s*[–-]\s*20:00/.test(text)) return "11:00–20:00";
    if (/11am\s*[–-]\s*8pm/i.test(text)) return "11:00–20:00";
    return null;
  }

  /* ---------- results ---------- */

  function badge(kind, label) {
    return '<span class="badge badge-' + kind + '">' + label + "</span>";
  }

  function row(name, note, agreed, delivered, kind, label) {
    return '<div class="res-row">' +
      '<div class="name">' + name + "<small>" + note + "</small></div>" +
      '<div class="val c-agreed" data-label="agreed">' + agreed + "</div>" +
      '<div class="val c-delivered' + (kind === "fail" ? " miss" : kind === "pass" ? " hit" : "") +
      '" data-label="delivered">' + delivered + "</div>" +
      '<div class="val pair">' + agreed + ' <i aria-hidden="true">→</i> ' + delivered + "</div>" +
      badge(kind, label) +
      "</div>";
  }

  function run() {
    var price = readPrice();
    var phone = readPhone();
    var hours = readHours();
    var out = "";
    var fails = 0;

    if (price && price.amount === AGREED.price) {
      out += row("House ramen", "menu.html · visible row", "AUD 18.00",
        "AUD " + price.amount.toFixed(2), "pass", "match");
    } else {
      fails++;
      out += row("House ramen", "menu.html · visible row", "AUD 18.00",
        price ? "AUD " + price.amount.toFixed(2) : "not found", "fail", "mismatch");
    }

    if (phone && phone === AGREED.phone) {
      out += row("Shop phone", "visit.html · visible text", AGREED.phone, phone, "pass", "match");
    } else {
      fails++;
      out += row("Shop phone", "visit.html · visible text", AGREED.phone,
        phone || "not found", "fail", "mismatch");
    }

    if (hours === AGREED.hours) {
      out += row("Opening hours", "visit.html · visible text", AGREED.hours, hours, "pass", "match");
    } else {
      fails++;
      out += row("Opening hours", "visit.html · visible text", AGREED.hours,
        hours || "not found", "fail", "mismatch");
    }

    out += row("Mobile usable", "no automated verdict", "human decision",
      "needs you", "human", "human");

    rows.innerHTML = out;
    results.hidden = false;

    if (fails === 0) {
      verdict.innerHTML = "<b>0 mismatches.</b> Nothing on this screen accepts the work. The buyer still has to confirm — and only then can payment start.";
    } else {
      verdict.innerHTML = "<b>" + fails + " mismatch" + (fails === 1 ? "" : "es") + ".</b> " +
        "These example values do not match the agreed fields. This check does not test navigation or accept the work.";
    }
  }

  runBtn.addEventListener("click", function () {
    if (ready) ready.then(run); else run();
  });

  /* ---------- step rail ---------- */

  var links = Array.prototype.slice.call(document.querySelectorAll(".steps a"));
  var sections = links.map(function (a) {
    return document.getElementById(a.getAttribute("data-step"));
  }).filter(Boolean);

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle("is-current", a.getAttribute("data-step") === entry.target.id);
        });
      });
    }, { rootMargin: "-120px 0px -60% 0px", threshold: 0 });
    sections.forEach(function (s) { io.observe(s); });
  }

  render();
})();
