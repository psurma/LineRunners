// Renders the style bake-off cards. Thumbnails are generated screenshots under styles/shots/.
(function () {
  "use strict";
  var THEMES = [
    { slug: "", name: "Current (default)", desc: "The live TfL-inspired design the site ships with today." },
    { slug: "tfl-classic", name: "TfL Classic", desc: "A refined, premium take on the official TfL identity — roundel navy & red, crisp Johnston headings." },
    { slug: "midnight", name: "Midnight Line", desc: "Full dark mode — charcoal backgrounds with glowing Tube-line accents. Night-run mood." },
    { slug: "editorial", name: "Editorial", desc: "Airy magazine layout with elegant serif headings and a restrained monochrome palette." },
    { slug: "brutalist", name: "Brutalist", desc: "Bold black borders, flat colour blocks, chunky mono type and hard offset shadows." },
    { slug: "blueprint", name: "Beck Blueprint", desc: "A Harry Beck transit-drawing look — deep blue, white ink, grid and diagram panels." },
    { slug: "neon", name: "Neon Night Run", desc: "Vivid neon accents glowing on near-black. Energetic and futuristic." },
    { slug: "pastel", name: "Soft Pastel", desc: "Gentle pastel tints, very rounded cards and soft shadows. Friendly and approachable." },
    { slug: "mono", name: "High-Contrast Mono", desc: "Accessibility-first black & white with one red accent and oversized bold type." },
    { slug: "newsprint", name: "Newsprint", desc: "Warm cream paper, serif ink and column rules — like a printed running gazette." },
    { slug: "glass", name: "Glass Modern", desc: "Frosted translucent cards over a soft gradient. Airy and contemporary." },
  ];
  var grid = document.getElementById("grid");
  THEMES.forEach(function (t) {
    var href = t.slug ? "index.html?theme=" + t.slug : "index.html";
    var card = document.createElement("div");
    card.className = "card" + (t.slug ? "" : " default");
    var thumb = document.createElement("a");
    thumb.className = "thumb";
    thumb.href = href;
    thumb.target = "_blank";
    thumb.rel = "noopener";
    var img = document.createElement("img");
    img.alt = t.name + " preview";
    img.loading = "lazy";
    img.src = "styles/shots/" + (t.slug || "default") + ".png";
    img.onerror = function () {
      var ph = document.createElement("div");
      ph.className = "ph";
      ph.textContent = "Preview generating…";
      thumb.replaceChild(ph, img);
    };
    thumb.appendChild(img);
    var body = document.createElement("div");
    body.className = "body";
    var h2 = document.createElement("h2");
    h2.textContent = t.name;
    var p = document.createElement("p");
    p.textContent = t.desc;
    var open = document.createElement("a");
    open.className = "open";
    open.href = href;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Open live ↗";
    body.appendChild(h2);
    body.appendChild(p);
    body.appendChild(open);
    card.appendChild(thumb);
    card.appendChild(body);
    grid.appendChild(card);
  });
})();
