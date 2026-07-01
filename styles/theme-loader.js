// Optional style-variant loader: index.html?theme=<slug> layers styles/<slug>.css
// over the base stylesheet so the different design variants can be previewed locally.
(function () {
  "use strict";
  var t = new URLSearchParams(location.search).get("theme");
  if (!t || !/^[a-z0-9-]+$/.test(t)) return;
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "styles/" + t + ".css";
  document.head.appendChild(link);
  document.documentElement.setAttribute("data-theme", t);
})();
