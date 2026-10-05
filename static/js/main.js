(() => {
  "use strict";

  const DATA = window.COSMI_DATA || {};
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "style") node.style.cssText = value;
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  // ---------------------------------------------------------------- videos

  // Loading: nothing is fetched until it matters. A video gets its poster
  // within a screen of the viewport and its file within half a screen, so it
  // is ready when it scrolls in. It plays while a quarter of it is visible and
  // pauses otherwise, also when the tab is hidden. A click pauses it until
  // the next click. With reduced motion or data saver, videos wait for a click.
  const saveData = navigator.connection?.saveData === true;
  const manualPlay = reducedMotion || saveData;
  const sourceOf = (item) => item.src;
  const visibleVideos = new Set();
  const userPaused = new WeakSet();
  const pauseGroup = new WeakMap();   // videos that pause and resume together

  function loadVideo(video) {
    if (video.dataset.poster && !video.poster) video.poster = video.dataset.poster;
    if (!video.src && video.dataset.src) {
      video.src = video.dataset.src;
      video.preload = "auto";
    }
  }

  const posterObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const video = entry.target;
      if (video.dataset.poster && !video.poster) video.poster = video.dataset.poster;
      posterObserver.unobserve(video);
    }
  }, { rootMargin: "100% 0px" });

  const nearObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (!manualPlay) loadVideo(entry.target);
      nearObserver.unobserve(entry.target);
    }
  }, { rootMargin: "50% 0px" });

  const playObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const video = entry.target;
      if (entry.isIntersecting) {
        visibleVideos.add(video);
        if (manualPlay) {
          if (video.dataset.poster && !video.poster) video.poster = video.dataset.poster;
        } else if (!userPaused.has(video)) {
          loadVideo(video);
          video.play().catch(() => { });
        }
      } else {
        visibleVideos.delete(video);
        video.pause();
      }
    }
  }, { threshold: 0.25 });

  document.addEventListener("visibilitychange", () => {
    for (const video of visibleVideos) {
      if (document.hidden) video.pause();
      else if (!manualPlay && !userPaused.has(video)) video.play().catch(() => { });
    }
  });

  function pauseOnClick(video) {
    video.addEventListener("click", () => {
      const resume = video.paused;
      for (const v of pauseGroup.get(video) || [video]) {
        if (resume) {
          userPaused.delete(v);
          loadVideo(v);
          v.play().catch(() => { });
        } else {
          userPaused.add(v);
          v.pause();
        }
      }
    });
  }

  function watch(video) {
    posterObserver.observe(video);
    nearObserver.observe(video);
    playObserver.observe(video);
  }

  function makeVideo(item, { managed = false } = {}) {
    const video = el("video", { muted: "", loop: "", playsinline: "", preload: "none", disablepictureinpicture: "" });
    video.muted = true;
    video.dataset.src = sourceOf(item);
    if (item.poster) video.dataset.poster = item.poster;
    if (manualPlay) {
      video.controls = true;
      video.addEventListener("play", () => loadVideo(video), { once: true });
    } else {
      pauseOnClick(video);
    }
    if (!managed) watch(video);
    return video;
  }

  // Warm the posters of nearby carousel slides, so a slide never appears blank.
  function warmPosters(slide) {
    if (!slide) return;
    for (const video of $$("video", slide)) {
      if (video.dataset.poster && !video.poster) video.poster = video.dataset.poster;
    }
  }

  const teaser = $("#teaser-video");
  if (teaser && DATA.teaser) {
    teaser.muted = true;
    // The smallest teaser that still covers the screen pixels it fills, never
    // upscaled by more than 5 %: 960 px (phones), 1280 px (standard laptops),
    // 1920 px (high-density screens).
    const pixels = teaser.getBoundingClientRect().width * (window.devicePixelRatio || 1);
    const version = (pixels <= 960 * 1.05 && DATA.teaser.small)
      || (pixels <= 1280 * 1.05 && DATA.teaser.medium) || DATA.teaser;
    teaser.dataset.src = sourceOf(version);
    if (manualPlay) {
      teaser.controls = true;
      teaser.addEventListener("play", () => loadVideo(teaser), { once: true });
    } else {
      pauseOnClick(teaser);
    }
    playObserver.observe(teaser);
    // A visitor who scrolls well past the teaser before it has downloaded
    // stops its download; scrolling back starts it again (playObserver).
    const fullyLoaded = () => teaser.buffered.length > 0
      && teaser.buffered.end(teaser.buffered.length - 1) >= teaser.duration - 0.5;
    if (!manualPlay) {
      new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting && teaser.getAttribute("src") && !fullyLoaded()) {
          teaser.removeAttribute("src");
          teaser.load();
        }
      }, { rootMargin: "50% 0px" }).observe(teaser);
    }
    // The teaser is the page's main visual: fetch it once the page has loaded.
    if (!manualPlay) {
      if (document.readyState === "complete") loadVideo(teaser);
      else window.addEventListener("load", () => loadVideo(teaser), { once: true });
    }
  }

  // ---------------------------------------------------------------- dropdown

  const dropdown = $("#more-research");
  if (dropdown) {
    const button = $("button", dropdown);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = dropdown.classList.toggle("open");
      button.setAttribute("aria-expanded", open);
    });
    const close = () => {
      dropdown.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }

  // ---------------------------------------------------------------- navbar

  // The navbar slides in once the title has scrolled away, highlights the
  // section in view, and shows the reading progress along its bottom edge.
  const progress = $("#progress-bar");
  const navbar = $(".navbar");
  const navLinksBox = $(".navbar-links");
  const navLinks = $$(".navbar-links a");
  const sections = $$("main section[id], main h3[id]");   // sections and linked subsections
  const title = $(".hero .title");
  let lastActive = null;

  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
    if (navbar && title) navbar.classList.toggle("visible", title.getBoundingClientRect().bottom < 0);

    let current = null;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= window.innerHeight * 0.35) current = section.id;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = sections[sections.length - 1]?.id;
    }
    for (const link of navLinks) {
      const active = link.getAttribute("href") === `#${current}`;
      link.classList.toggle("active", active);
      // On narrow screens the links scroll sideways: keep the active one in view.
      if (active && link !== lastActive && navLinksBox.scrollWidth > navLinksBox.clientWidth) {
        navLinksBox.scrollTo({
          left: link.offsetLeft - (navLinksBox.clientWidth - link.offsetWidth) / 2,
          behavior: "smooth",
        });
        lastActive = link;
      }
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  // ---------------------------------------------------------------- tl;dr

  // Balanced text leaves empty space at the sides of its box: shrink the box
  // to its longest line.
  const tldr = $(".tldr");
  function fitTldr() {
    if (!tldr) return;
    tldr.style.width = "";
    const range = document.createRange();
    range.selectNodeContents(tldr);
    const widest = Math.max(...[...range.getClientRects()].map((r) => r.right))
      - Math.min(...[...range.getClientRects()].map((r) => r.left));
    const style = getComputedStyle(tldr);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    tldr.style.width = `${Math.ceil(widest + padding) + 1}px`;
  }
  document.fonts?.ready.then(fitTldr);
  window.addEventListener("resize", fitTldr);
  fitTldr();

  // ---------------------------------------------------------------- abstract

  // Narrow the abstract paragraphs, a few pixels at a time, until no
  // paragraph ends on a short last line. The widest such width wins.
  function lastLineRatio(p) {
    const range = document.createRange();
    range.selectNodeContents(p);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    if (!rects.length) return 1;
    const bottom = Math.max(...rects.map((r) => r.top));
    const top = Math.min(...rects.map((r) => r.top));
    if (Math.abs(bottom - top) < 2) return 1;
    const last = rects.filter((r) => Math.abs(r.top - bottom) < 2);
    const width = Math.max(...last.map((r) => r.right)) - Math.min(...last.map((r) => r.left));
    return width / p.clientWidth;
  }

  // The page has one fixed content width (--content in style.css). A
  // paragraph that would end on a short last line gets an imperceptible
  // letter-spacing change (at most 0.02 em), enough to reflow its last line;
  // justified text keeps both edges straight.
  const SPACINGS = [0, -0.004, 0.004, -0.008, 0.008, -0.012, 0.012, -0.016, 0.016, -0.02, 0.02];

  function fitProse(minRatio = 0.2) {
    const paragraphs = $$(".prose > p:not(.eyebrow)").filter((p) => p.offsetParent !== null);
    for (const p of paragraphs) {
      let best = 0;
      let bestRatio = -1;
      for (const spacing of SPACINGS) {
        p.style.letterSpacing = spacing ? `${spacing}em` : "";
        const ratio = lastLineRatio(p);
        if (ratio >= minRatio) { best = spacing; bestRatio = ratio; break; }
        if (ratio > bestRatio) { best = spacing; bestRatio = ratio; }
      }
      p.style.letterSpacing = best ? `${best}em` : "";
    }
  }

  document.fonts?.ready.then(() => fitProse());
  window.addEventListener("resize", () => fitProse());
  fitProse();

  // ---------------------------------------------------------------- stats

  // Numbers count up once, when they first scroll into view.
  function formatCount(value, node) {
    const decimals = Number(node.dataset.decimals || 0);
    let text = value.toFixed(decimals);
    if (node.dataset.separator) text = text.replace(/\B(?=(\d{3})+(?!\d))/g, node.dataset.separator);
    return text + (node.dataset.suffix || "");
  }

  const counters = $$("[data-count]");
  if (counters.length && !reducedMotion) {
    counters.forEach((node) => { node.textContent = formatCount(0, node); });
    const counterObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        counterObserver.unobserve(entry.target);
        const node = entry.target;
        const target = Number(node.dataset.count);
        const start = performance.now();
        const duration = 1600;
        const tick = (now) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - t, 4);
          node.textContent = formatCount(target * eased, node);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.6 });
    counters.forEach((node) => counterObserver.observe(node));
  }

  // ---------------------------------------------------------------- main idea

  // Composition diagram: the composed sequence in the middle, the original
  // interactions around it, and arrows from each part to where it goes.
  // Labels are lists of parts: plain text, or [text, role] in the colour of
  // the body part that performs it (skin: no hand, red: right, blue: left).
  const NODES = {
    target: { tag: "Original", label: [["Sitting on a stool", "skin"]] },
    source: { tag: "Original", label: [["Drinking, right hand", "red"]] },
    mirror_from: { tag: "Original", label: [["Phone call, right hand", "gray"]] },   // its render has no hand colour
    mirror_to: { tag: "Mirrored", label: [["Phone call, left hand", "blue"]] },
    composed: {
      tag: "Composed",
      label: [["Sits on a stool", "skin"], ", ", ["calls with the left hand", "blue"], ", then ",
        ["drinks with the right hand", "red"], "."],
    },
  };
  const ARROWS = [
    { from: "mirror_from", to: "mirror_to", horizontal: true },
    { from: "target", to: "composed" },
    { from: "source", to: "composed" },
    { from: "mirror_to", to: "composed", horizontal: true },
  ];

  // Timeline in ms: originals, then mirroring, then the composition.
  const TIMELINE = {
    originals: 0,            // the three originals, 100 ms apart
    mirrorArrow: 650,
    mirrored: 1000,
    composeArrows: 1500,
    composed: 1950,
  };
  const SVG_NS = "http://www.w3.org/2000/svg";

  const compose = $("#compose");
  if (compose && DATA.idea) {
    for (const [key, info] of Object.entries(NODES)) {
      const node = $(`[data-node="${key}"]`, compose);
      node.append(
        el("span", { class: "tag", text: info.tag }),
        el("div", { class: "media" }, makeVideo(DATA.idea[key])),
        el("p", { class: "label" }, el("span", {}, info.label.map((part) => typeof part === "string" ? part
          : el("span", { class: "hand-word", "data-role": part[1], text: part[0] })))),
      );
    }

    const svg = $(".compose-arrows", compose);
    let arrowParts = [];     // per arrow: { arrow, line, head, text, length }
    let animations = [];

    // Point where the ray from the centre of `rect` towards (dx, dy) leaves it.
    function exitPoint(rect, dx, dy, gap) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const scale = Math.min(
        dx ? (rect.w / 2) / Math.abs(dx) : Infinity,
        dy ? (rect.h / 2) / Math.abs(dy) : Infinity,
      );
      const length = Math.hypot(dx, dy) || 1;
      return [cx + dx * scale + (dx / length) * gap, cy + dy * scale + (dy / length) * gap];
    }

    function svgEl(tag, attrs) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      return node;
    }

    // Builds the arrows from the current layout. Layout is stable (fixed
    // aspect ratios), so this runs only on load and resize.
    function drawArrows() {
      const box = compose.getBoundingClientRect();
      // `whole` measures the clip with its tag and label, `media` only the video.
      // `whole` spans the tag, video, and caption of a clip; otherwise only the video.
      const rectOf = (key, whole = false) => {
        const node = $(`[data-node="${key}"]`, compose);
        const parts = whole ? [".tag", ".media", ".label"] : [".media"];
        const rects = parts.map((sel) => $(sel, node).getBoundingClientRect());
        const left = Math.min(...rects.map((r) => r.left));
        const top = Math.min(...rects.map((r) => r.top));
        const right = Math.max(...rects.map((r) => r.right));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        return { x: left - box.left, y: top - box.top, w: right - left, h: bottom - top };
      };
      svg.replaceChildren();
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      arrowParts = [];
      const roleColor = (key) => getComputedStyle($(`[data-node="${key}"]`, compose)).getPropertyValue("--role").trim();
      const centre = rectOf("composed");
      const centreY = centre.y + centre.h / 2;

      // On phones only the mirror arrow is drawn: arrows into the composed
      // sequence would cross the other clips. CSS adds a down arrow instead.
      const phone = window.matchMedia("(max-width: 560px)").matches;
      for (const arrow of ARROWS) {
        if (phone && arrow.to === "composed") continue;
        const a = rectOf(arrow.from);
        const b = rectOf(arrow.to);
        const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
        const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
        let x1, y1, x2, y2;
        const sideBySide = a.x > b.x + b.w || b.x > a.x + a.w;
        if (arrow.horizontal && sideBySide) {
          // A level arrow at the height of the source, kept inside both boxes.
          const y = Math.min(Math.max(a.y + a.h / 2, b.y + 24), b.y + b.h - 24);
          const right = dx > 0;
          x1 = right ? a.x + a.w + 10 : a.x - 10;
          x2 = right ? b.x - 12 : b.x + b.w + 12;
          y1 = y2 = y;
        } else if (arrow.horizontal) {
          // Stacked clips: a vertical arrow between the whole clips, clear of the labels.
          const wa = rectOf(arrow.from, true);
          const wb = rectOf(arrow.to, true);
          const x = a.x + a.w / 2;
          const down = dy > 0;
          x1 = x2 = x;
          y1 = down ? wa.y + wa.h + 8 : wa.y - 8;
          y2 = down ? wb.y - 10 : wb.y + wb.h + 10;
        } else {
          [x1, y1] = exitPoint(a, dx, dy, 10);
          [x2, y2] = exitPoint(b, -dx, -dy, 12);
        }
        // Arrows into the composed clip all stop the same horizontal distance
        // from its frame, whatever their angle, so the clip sits centred between them.
        if (arrow.to === "composed" && sideBySide) {
          const gap = 18;
          const fromLeft = dx > 0;
          const tipX = fromLeft ? b.x - gap : b.x + b.w + gap;
          const t = (tipX - x1) / ((x2 - x1) || 1);
          const tipY = y1 + (y2 - y1) * t;
          [x2, y2] = [tipX, Math.min(Math.max(tipY, b.y + 24), b.y + b.h - 24)];
        }
        const kind = arrow.kind || "";
        const color = roleColor(arrow.from);

        // A gentle arc: the control point sits off the midpoint, bowing away
        // from the centre of the composed clip (upwards for level arrows,
        // rightwards for vertical ones).
        const length = Math.hypot(x2 - x1, y2 - y1);
        const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
        let [nx, ny] = [-(y2 - y1) / length, (x2 - x1) / length];
        const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1) * 0.2;
        const level = Math.abs(y2 - y1) < 2;
        const away = vertical ? nx > 0 : level ? ny < 0 : (my < centreY ? ny < 0 : ny > 0);
        if (!away) [nx, ny] = [-nx, -ny];
        const bow = Math.min(length * (level || vertical ? 0.12 : 0.2), 28);
        const [cx, cy] = [mx + nx * bow, my + ny * bow];

        // Arrowhead along the tangent at the end; the line stops short under it.
        const angle = Math.atan2(y2 - cy, x2 - cx);
        const size = phone ? 12 : 17;
        const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
        const [ex, ey] = [x2 - ux * size * 0.7, y2 - uy * size * 0.7];
        const line = svgEl("path", { class: `line ${kind}`, d: `M${x1},${y1} Q${cx},${cy} ${ex},${ey}` });
        line.style.stroke = color;
        if (phone) line.style.strokeWidth = "3.5";
        const p1 = [x2 - size * Math.cos(angle - 0.45), y2 - size * Math.sin(angle - 0.45)];
        const p2 = [x2 - size * Math.cos(angle + 0.45), y2 - size * Math.sin(angle + 0.45)];
        const head = svgEl("path", { class: `head ${kind}`, d: `M${x2},${y2} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]} Z` });
        head.style.fill = color;
        head.style.stroke = color;
        svg.append(line, head);

        const text = null;
        arrowParts.push({ arrow, line, head, text, length: line.getTotalLength() });
      }
    }

    const nodeEl = (key) => $(`[data-node="${key}"]`, compose);
    const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";

    function appear(element, delay, duration = 560, from = "translateY(14px) scale(0.97)") {
      return element.animate(
        [{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }],
        { duration, delay, easing: ease, fill: "both" },
      );
    }

    function drawLine(part, delay, duration) {
      const { line, head, text, length } = part;
      const runs = [];
      if (line.classList.contains("mirror")) {
        // A dashed line cannot be drawn with a dash offset: fade it in.
        runs.push(line.animate([{ opacity: 0 }, { opacity: 1 }], { duration, delay, fill: "both" }));
      } else {
        runs.push(line.animate(
          [{ strokeDasharray: `${length}`, strokeDashoffset: `${length}`, opacity: 1 },
           { strokeDasharray: `${length}`, strokeDashoffset: "0", opacity: 1 }],
          { duration, delay, easing: "ease-in-out", fill: "both" },
        ));
      }
      runs.push(head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: delay + duration - 60, fill: "both" }));
      if (text) runs.push(text.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: delay + 120, fill: "both" }));
      return runs;
    }

    function play() {
      animations.forEach((animation) => animation.cancel());
      animations = [];
      compose.classList.remove("armed");
      if (reducedMotion) return;

      ["target", "source", "mirror_from"].forEach((key, i) => {
        animations.push(appear(nodeEl(key), TIMELINE.originals + i * 100));
      });
      for (const part of arrowParts) {
        const toComposed = part.arrow.to === "composed";
        const delay = toComposed ? TIMELINE.composeArrows : TIMELINE.mirrorArrow;
        animations.push(...drawLine(part, delay, toComposed ? 500 : 380));
      }
      animations.push(appear(nodeEl("mirror_to"), TIMELINE.mirrored));
      animations.push(appear(nodeEl("composed"), TIMELINE.composed));
    }

    drawArrows();
    // Fonts can shift the labels: redraw, unless the build-up already runs.
    document.fonts?.ready.then(() => { if (!animations.length) drawArrows(); });
    window.addEventListener("resize", () => {
      // A redraw replaces the arrows: finish any running build-up first.
      animations.forEach((animation) => animation.finish());
      drawArrows();
    });

    if (!reducedMotion) {
      compose.classList.add("armed");    // hidden until the build-up starts
      new IntersectionObserver((entries, observer) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        play();
      }, { threshold: 0.4 }).observe(compose);
    }
  }

  // ---------------------------------------------------------------- carousels

  // Tag each render panel like the clips of the main-idea diagram: parent
  // clips are "Original" (or "Mirrored"), coloured by the hand they use, and
  // the last panel is the composed sequence.
  // The renders colour the right hand red, the left blue, and both purple.
  // Composed sequences get their own colour, which no render uses.
  function roleOf(caption) {
    if (/both hands/.test(caption)) return "purple";
    if (/left hand/.test(caption)) return "blue";
    if (/right hand/.test(caption)) return "red";
    return "skin";
  }

  // A caption with every hand phrase ("with the left hand", "using their
  // right hand", "with both hands") and the object held by that hand in the
  // hand's colour. The object is the last "a"/"an" phrase of the same clause.
  const HAND = /\b(?:with|using|in)\s+(?:the|their)\s+(left|right)\s+hand\b|\b(?:with|using)\s+both\s+hands\b/g;
  const CLAUSE_END = /,|;|\.|\band\b|\bthen\b|\bwhile\b/g;

  // Nouns of the action, not objects: "takes a picture", "gives it a shake".
  const ACTION = "(?:picture|shake|drink|call|seat|sip|bite|look)\\b";

  function heldObject(clause) {
    // The phrase after the last "a"/"an" that names an object, or else the
    // phrase after the last preposition ("through binoculars").
    const starts = [...clause.matchAll(/\b(?:a|an)\s+/g)]
      .map((m) => m.index + m[0].length)
      .filter((i) => !new RegExp(`^${ACTION}`).test(clause.slice(i)));
    const after = [...clause.matchAll(/\b(?:through|with|from|into|on|to)\s+/g)];
    const start = starts.length ? starts[starts.length - 1]
      : after.length ? after[after.length - 1].index + after[after.length - 1][0].length : -1;
    if (start < 0) return null;
    // "gives a water bottle a shake": the object ends before the action noun.
    const cut = clause.slice(start).search(new RegExp(`\\s+(?:a|an)\\s+${ACTION}`));
    const end = cut < 0 ? clause.trimEnd().length : start + cut;
    const text = clause.slice(start, end);
    return text ? { start, end, text } : null;
  }

  function handCaption(text) {
    const out = document.createDocumentFragment();
    const mark = (part, role) => el("span", { class: "hand-word", "data-role": role, text: part });
    let cursor = 0;
    for (const match of text.matchAll(HAND)) {
      const role = match[1] === "left" ? "blue" : match[1] === "right" ? "red" : "purple";
      // The clause that ends with this hand phrase.
      let start = cursor;
      for (const end of text.slice(cursor, match.index).matchAll(CLAUSE_END)) {
        start = cursor + end.index + end[0].length;
      }
      const clause = text.slice(start, match.index);
      out.append(text.slice(cursor, start));
      const object = heldObject(clause);
      if (object) {
        out.append(clause.slice(0, object.start), mark(object.text, role), clause.slice(object.end));
      } else {
        out.append(clause);
      }
      out.append(mark(match[0], role));
      cursor = match.index + match[0].length;
    }
    out.append(text.slice(cursor));
    return out;
  }

  // A composed caption: the actions of the original clips that use no hand
  // ("sits on a stool", from the parent "A person sits on a stool.") in the
  // body colour, then the hand phrases as above.
  function composedCaption(item) {
    const text = item.caption;
    const ranges = [];
    for (const parent of item.parents || []) {
      if (roleOf(parent) !== "skin") continue;
      const action = parent.replace(/^A person /, "").replace(/\.$/, "");
      const start = text.indexOf(action);
      if (start >= 0 && !ranges.some((r) => start < r.end && start + action.length > r.start)) {
        ranges.push({ start, end: start + action.length });
      }
    }
    ranges.sort((a, b) => a.start - b.start);
    const out = document.createDocumentFragment();
    let cursor = 0;
    for (const range of ranges) {
      out.append(handCaption(text.slice(cursor, range.start)),
        el("span", { class: "hand-word", "data-role": "skin", text: text.slice(range.start, range.end) }));
      cursor = range.end;
    }
    out.append(handCaption(text.slice(cursor)));
    return out;
  }

  function compositionPanels(item) {
    const ids = item.parent_ids || [];
    const parents = item.parents.map((caption, i) => {
      const id = ids[i] || "";
      // A HOT3D clip appears twice: hands only, then on the fitted body,
      // which carries the action. Both take the colour of the hand.
      if (/^H\d/.test(id) && ids[i + 1] === id) {
        return { tag: "HOT3D", role: roleOf(caption), caption: "HOT3D recording: hands only." };
      }
      if (/^H\d/.test(id) && ids[i - 1] === id) {
        return { tag: "Fitted body", role: roleOf(caption), caption: caption.replace(/\.$/, " (fitted body).") };
      }
      const tag = id.endsWith("_mirrored") ? "Mirrored" : "Original";
      return { tag, role: roleOf(caption), caption };
    });
    return [...parents, { tag: "Composed", role: "compose", caption: "Composed sequence." }];
  }

  function panelHeads(item, panels) {
    if (!panels || panels.length !== item.panels) return null;
    const row = el("div", { class: "panel-heads", style: `grid-template-columns: repeat(${item.panels}, 1fr)` });
    for (const panel of panels) {
      // Every panel, the composed one included, gets a full-width capsule.
      row.append(el("div", { class: "panel-head", "data-role": panel.role },
        el("span", { class: "tag panel-caption" }, [
          el("span", { class: "long", text: panel.caption }),
          el("span", { class: "short", text: panel.tag || panel.caption }),
        ])));
    }
    return row;
  }

  // A carousel of prepared slides: arrows level with the centre of the
  // current slide's first video, one dot per slide.
  // The annotation rows of a carousel share the height of the tallest one:
  // every video starts at the same height, whatever the annotation length.
  function equalHeads(container) {
    const rows = $$(".panel-heads", container);
    if (!rows.length) return;
    const fit = () => {
      rows.forEach((row) => { row.style.minHeight = ""; });
      const tallest = Math.max(...rows.map((row) => row.offsetHeight));
      rows.forEach((row) => { row.style.minHeight = `${tallest}px`; });
    };
    fit();
    document.fonts?.ready.then(fit);
    window.addEventListener("resize", fit);
  }

  function carouselFrame(container, slides) {
    container.replaceChildren();
    const track = el("div", { class: "carousel-track" }, slides);
    const dots = el("div", { class: "dots" });
    slides.forEach((slide, i) => {
      slide.setAttribute("aria-label", `${i + 1} of ${slides.length}`);
      const dot = el("button", { "aria-label": `Show slide ${i + 1}` });
      dot.addEventListener("click", () => go(i));
      dots.append(dot);
    });

    let index = 0;
    function go(i) {
      track.scrollTo({ left: track.children[i].offsetLeft - track.offsetLeft, behavior: "smooth" });
    }
    const arrow = (dir, path, cls) => {
      const button = el("button", { class: `arrow ${cls}`, "aria-label": dir < 0 ? "Previous" : "Next" });
      button.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
      button.addEventListener("click", () => go((index + dir + slides.length) % slides.length));
      return button;
    };
    const stage = el("div", { class: "carousel-stage" }, [
      track, arrow(-1, "m15 18-6-6 6-6", "prev"), arrow(1, "m9 18 6-6-6-6", "next"),
    ]);

    function update() {
      index = Math.round(track.scrollLeft / track.clientWidth);
      $$("button", dots).forEach((dot, i) => dot.setAttribute("aria-current", i === index));
      warmPosters(track.children[index + 1]);
      warmPosters(track.children[(index - 1 + slides.length) % slides.length]);
      const media = $(".media", track.children[index] || track.children[0]);
      if (media) stage.style.setProperty("--arrow-top", `${media.offsetTop + media.offsetHeight / 2}px`);
    }
    track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    window.addEventListener("resize", update);

    container.append(stage, el("div", { class: "carousel-nav" }, dots));
    equalHeads(container);
    update();
  }

  // Composition slides: the render panels of one clip, with their tags and caption.
  function carousel(container, items, panelsFor, { maxPanels: widest, handColours = true } = {}) {
    // Every panel has the same size: slides with fewer panels are narrower,
    // never shorter. The caption box is as wide as its video.
    // When every slide is narrower than maxPanels, the carousel shrinks to the
    // widest slide, so the arrows stay beside the video.
    const used = Math.max(...items.map((item) => item.panels));
    const maxPanels = Math.min(widest || used, used);
    container.style.maxWidth = widest > used ? `${(100 * used) / widest}%` : "";
    container.style.marginInline = widest > used ? "auto" : "";
    const slides = items.map((item) => {
      const media = el("div", {
        class: "media",
        style: `aspect-ratio: ${item.panels * 640} / 845`,
      }, makeVideo(item));
      const body = el("div", { class: "slide-body", style: `max-width: ${(100 * item.panels) / maxPanels}%` }, [
        panelHeads(item, panelsFor(item)),
        media,
        item.caption ? el("figcaption", { class: "slide-caption" }, el("span", {}, handColours ? composedCaption(item) : item.caption)) : null,
      ]);
      return el("figure", { class: "slide" }, body);
    });
    carouselFrame(container, slides);
  }

  const datasetGallery = $("#dataset-gallery");
  if (datasetGallery && DATA.dataset) {
    const tabs = $$('[data-gallery="dataset-gallery"] button');
    const show = (key) => {
      tabs.forEach((tab) => tab.setAttribute("aria-pressed", tab.dataset.key === key));
      carousel(datasetGallery, DATA.dataset[key], compositionPanels);
    };
    tabs.forEach((tab) => tab.addEventListener("click", () => show(tab.dataset.key)));
    show("sequential");
  }

  // ---------------------------------------------------------------- results carousel

  // Four clips per page (fewer on small screens), with the arrows beside the
  // videos and one dot per page. Every caption is shown in full.
  const resultsCarousel = $("#results-carousel");
  if (resultsCarousel && DATA.results) {
    const track = el("div", { class: "card-track" });
    for (const item of DATA.results) {
      const card = el("figure", { class: "result-card" }, [
        el("div", { class: "media" }, makeVideo(item)),
        el("figcaption", { text: item.caption }),
      ]);
      track.append(card);
    }

    const dots = el("div", { class: "dots" });
    const arrow = (dir, path, cls) => {
      const button = el("button", { class: `arrow ${cls}`, "aria-label": dir < 0 ? "Previous" : "Next" });
      button.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
      button.addEventListener("click", () => goPage(page + dir));
      return button;
    };
    const stage = el("div", { class: "carousel-stage" }, [
      track, arrow(-1, "m15 18-6-6 6-6", "prev"), arrow(1, "m9 18 6-6-6-6", "next"),
    ]);
    resultsCarousel.append(stage, el("div", { class: "carousel-nav" }, dots));

    let page = 0;
    const perPage = () => Math.max(1, Math.round(track.clientWidth / track.children[0].offsetWidth));
    const pages = () => Math.ceil(track.children.length / perPage());

    function goPage(i) {
      const count = pages();
      const target = ((i % count) + count) % count;
      const card = track.children[target * perPage()];
      track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: "smooth" });
    }

    function renderDots() {
      dots.replaceChildren();
      for (let i = 0; i < pages(); i++) {
        const dot = el("button", { "aria-label": `Show page ${i + 1}` });
        dot.addEventListener("click", () => goPage(i));
        dots.append(dot);
      }
    }

    function update() {
      page = Math.round(track.scrollLeft / track.clientWidth);
      $$("button", dots).forEach((dot, i) => dot.setAttribute("aria-current", i === page));
      const per = perPage();
      for (let i = (page + 1) * per; i < (page + 2) * per && i < track.children.length; i++) {
        warmPosters(track.children[i]);
      }
      // Arrows level with the centre of the videos.
      const media = $(".media", track.children[0]);
      stage.style.setProperty("--arrow-top", `${media.offsetTop + media.offsetHeight / 2}px`);
    }

    track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    window.addEventListener("resize", () => { renderDots(); update(); });
    renderDots();
    update();
  }

  // ---------------------------------------------------------------- comparisons

  // One prompt per slide: COSMI, then the baselines, without the ground truth.
  const METHOD_ORDER = ["cosmi", "himo", "prior_mdm", "mdm"];
  const METHOD_NAMES = { cosmi: "COSMI (ours)", himo: "HIMO", prior_mdm: "PriorMDM", mdm: "MDM" };

  function compareSlide(entry, maxMethods) {
    const methods = METHOD_ORDER.filter((m) => entry.videos[m]);
    const columns = `repeat(${methods.length}, minmax(0, 1fr))`;
    const heads = el("div", { class: "panel-heads method-heads", style: `grid-template-columns: ${columns}` },
      methods.map((m) => el("div", { class: "panel-head", "data-role": m === "cosmi" ? "accent" : m },
        el("span", { class: "tag" }, m === "cosmi"
          ? ["COSMI", el("span", { class: "ours-note", text: " (ours)" })]   // hidden on phones
          : METHOD_NAMES[m]))));
    const videos = methods.map((m) => makeVideo(entry.videos[m]));
    const row = el("div", { class: "compare-row", style: `grid-template-columns: ${columns}` },
      methods.map((m, i) => el("div", { class: `media${m === "cosmi" ? " ours" : ""}` }, videos[i])));

    videos.forEach((video) => pauseGroup.set(video, videos));

    // Keep the baselines in step with COSMI.
    const lead = videos[0];
    lead.addEventListener("timeupdate", () => {
      for (const video of videos.slice(1)) {
        if (Math.abs(video.currentTime - lead.currentTime) > 0.15) video.currentTime = lead.currentTime;
      }
    });

    const caption = el("figcaption", { class: "slide-caption" }, el("span", { text: entry.caption }));

    const body = el("div", { class: "slide-body", style: `max-width: ${(100 * methods.length) / maxMethods}%` },
      [heads, row, caption]);
    return el("figure", { class: "slide" }, body);
  }

  const compareGallery = $("#compare-gallery");
  if (compareGallery && DATA.comparisons) {
    const tabs = $$('[data-gallery="compare-gallery"] button');
    const show = (tier) => {
      tabs.forEach((tab) => tab.setAttribute("aria-pressed", tab.dataset.key === tier));
      const entries = DATA.comparisons.filter((e) => e.tier === tier);
      carouselFrame(compareGallery, entries.map((e) => compareSlide(e, METHOD_ORDER.length)));
    };
    tabs.forEach((tab) => tab.addEventListener("click", () => show(tab.dataset.key)));
    show("3obj");
  }

  // ---------------------------------------------------------------- hands

  // HOT3D recordings: the hands and the object, then the fitted body. Their
  // panels match the size of the composition panels below (four per slide).
  const handsDataset = $("#hands-dataset");
  if (handsDataset && DATA.hands) {
    // These clips show the body fit, not the composition: no hand colours.
    const recordingPanels = () => [
      { tag: "HOT3D", role: "skin", caption: "HOT3D recording: the hands and the object" },
      { tag: "Fitted body", role: "skin", caption: "Fitted SMPL-X body" },
    ];
    carousel(handsDataset, DATA.hands.dataset, recordingPanels, { maxPanels: 4, handColours: false });
    carousel($("#hands-composed"), DATA.hands.composed, compositionPanels);
  }

  // ---------------------------------------------------------------- bibtex

  const copyButton = $("#copy-bibtex");
  copyButton?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#bibtex-code").innerText);
      $("span", copyButton).textContent = "Copied";
      copyButton.classList.add("done");
      setTimeout(() => {
        $("span", copyButton).textContent = "Copy";
        copyButton.classList.remove("done");
      }, 2000);
    } catch (e) { }
  });

  // ---------------------------------------------------------------- reveal

  if (!reducedMotion) {
    const revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      }
    }, { threshold: 0.08 });
    for (const node of $$(".section .narrow, .section .wide > :not(.compose), .stats")) {
      node.classList.add("reveal");
      revealObserver.observe(node);
    }
  }
})();
