const icons =
  '<svg viewBox="0 0 12 10" aria-hidden="true"><path d="M1 8V6m3 2V4m3 4V2m3 6V0" stroke="currentColor" stroke-width="1.6"/></svg><svg viewBox="0 0 15 8" aria-hidden="true"><rect x=".5" y=".5" width="12" height="7" rx="1.2" fill="none" stroke="currentColor"/><rect x="2" y="2" width="9" height="4" rx=".4" fill="currentColor"/><path d="M14 2.5v3" stroke="currentColor"/></svg>';
const state = {
  project: null,
  screenshots: null,
  scene: null,
  devices: new Map(),
  cards: [],
  revision: 0,
  initialized: false,
  autoplay: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  holds: new Set(),
  timer: null,
  interactionTimer: null,
  navigation: null,
  requestedScene: null,
  renderedTheme: null,
  previews: new Map(),
  prefetchTimer: null,
  resizeTimer: null,
  expandedFormat: null,
  expandedRevision: 0,
  expandedImages: new Map(),
};

const slideInterval = 8000;
const transitionDuration = 240;

function logicalSize(scene) {
  return {
    width: scene.cssWidth || scene.width,
    height: scene.cssHeight || scene.height,
  };
}

function setImage(image, scene, source = scene) {
  const size = logicalSize(scene);
  image.src = asset(source.src);
  image.dataset.source = source.src;
  image.width = size.width;
  image.height = size.height;
  image.style.maxWidth = Math.floor(source.width / devicePixelRatio) + "px";
}

function scheduleSlide() {
  clearTimeout(state.timer);
  state.timer = null;
  const button = document.querySelector("#toggle-autoplay");
  if (!button) return;
  button.textContent = state.autoplay ? "Pause" : "Play";
  button.setAttribute(
    "aria-label",
    state.autoplay ? "Pause slideshow" : "Play slideshow",
  );
  button.setAttribute("aria-pressed", String(!state.autoplay));
  button.dataset.waiting = String(state.holds.size > 0);
  if (
    state.autoplay &&
    state.initialized &&
    !state.requestedScene &&
    state.holds.size === 0
  ) {
    state.timer = setTimeout(() => move(1), slideInterval);
  }
}

function holdSlide(reason, active) {
  if (active) state.holds.add(reason);
  else state.holds.delete(reason);
  scheduleSlide();
}

function holdForInteraction() {
  clearTimeout(state.interactionTimer);
  holdSlide("scroll", true);
  state.interactionTimer = setTimeout(() => holdSlide("scroll", false), 2500);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function asset(path) {
  return new URL(path, import.meta.url).href;
}

function theme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function scenes(format) {
  return state.screenshots.scenes[theme()][format];
}

async function loadJson(path) {
  const response = await fetch(asset(path));
  if (!response.ok) throw new Error("Could not load " + path);
  return response.json();
}

function previewSource(scene, format) {
  const physicalWidth =
    state.devices.get(format).scroll.clientWidth * devicePixelRatio;
  const preferredWidth = Math.min(
    physicalWidth * 2,
    logicalSize(scene).width * 2,
  );
  const requiredWidth = Math.ceil(Math.max(physicalWidth, preferredWidth));
  return (
    [...(scene.previews || []), scene].find(
      (source) => source.width >= requiredWidth,
    ) || scene
  );
}

function preparePreview(scene, format, priority = "high") {
  const source = previewSource(scene, format);
  const existing = state.previews.get(source.src);
  if (existing) {
    if (priority === "high") existing.image.fetchPriority = "high";
    return existing.promise;
  }
  const image = new Image();
  image.draggable = false;
  image.decoding = "async";
  image.fetchPriority = priority;
  setImage(image, scene, source);
  const entry = { image, promise: null };
  entry.promise = image
    .decode()
    .then(() => image)
    .catch((error) => {
      if (state.previews.get(source.src) === entry)
        state.previews.delete(source.src);
      throw error;
    });
  state.previews.set(source.src, entry);
  return entry.promise;
}

function prunePreviews() {
  if (!state.scene) return;
  const list = scenes("desktop");
  const index = list.findIndex((scene) => scene.id === state.scene);
  const ids = new Set(
    [-1, 0, 1].map(
      (offset) => list[(index + offset + list.length) % list.length].id,
    ),
  );
  if (state.requestedScene) ids.add(state.requestedScene);
  const keep = new Set();
  for (const format of ["desktop", "phone"]) {
    for (const scene of scenes(format)) {
      if (ids.has(scene.id)) keep.add(previewSource(scene, format).src);
    }
  }
  for (const [src, entry] of state.previews) {
    if (!keep.has(src) && !entry.image.isConnected) state.previews.delete(src);
  }
}

function warmNearbyPreviews(delay) {
  clearTimeout(state.prefetchTimer);
  const revision = state.revision;
  state.prefetchTimer = setTimeout(async () => {
    const list = scenes("desktop");
    const index = list.findIndex((scene) => scene.id === state.scene);
    for (const offset of [1, -1]) {
      if (revision !== state.revision) return;
      const id = list[(index + offset + list.length) % list.length].id;
      await Promise.allSettled(
        ["desktop", "phone"].map((format) =>
          preparePreview(
            scenes(format).find((scene) => scene.id === id),
            format,
            "low",
          ),
        ),
      );
      prunePreviews();
    }
  }, delay);
}

function clearTransition(device) {
  device.animation?.cancel();
  device.animation = null;
  device.outgoing?.remove();
  device.outgoing = null;
}

function displayPreview(device, image, scene, format, animate, resetScroll) {
  clearTransition(device);
  const oldImage = device.image;
  const scrollTop = device.scroll.scrollTop;
  let outgoing;
  if (animate && oldImage !== image && oldImage.hasAttribute("src")) {
    outgoing = element("div", "outgoing-image");
    outgoing.setAttribute("aria-hidden", "true");
    outgoing.style.width = device.scroll.clientWidth + "px";
    outgoing.style.height = device.scroll.clientHeight + "px";
    oldImage.style.position = "relative";
    oldImage.style.top = -scrollTop + "px";
    outgoing.append(oldImage);
  } else if (oldImage !== image) oldImage.remove();
  image.style.position = "";
  image.style.top = "";
  const size = logicalSize(scene);
  const viewport = state.screenshots.viewports[format];
  const fitsViewport =
    format === "desktop" &&
    size.height * viewport.width <= viewport.height * size.width;
  image.classList.toggle("fits-viewport", fitsViewport);
  device.scroll.classList.toggle("fits-viewport", fitsViewport);
  image.alt =
    state.project.title + " — " + scene.label + ", " + format + " view";
  if (image.parentElement !== device.scroll) device.scroll.append(image);
  device.image = image;
  device.root.dataset.scene = scene.id;
  device.scroll.scrollTop = resetScroll ? 0 : scrollTop;
  if (outgoing) {
    device.scroll.append(outgoing);
    device.outgoing = outgoing;
    device.animation = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: transitionDuration,
      easing: "ease-out",
      fill: "forwards",
    });
    device.animation.finished
      .then(() => {
        if (device.outgoing === outgoing) {
          outgoing.remove();
          device.outgoing = null;
          device.animation = null;
          prunePreviews();
        }
      })
      .catch(() => {});
  }
}

function makeDevice(format) {
  const name = format === "desktop" ? "Desktop" : "Phone";
  const root = element("section", "device-view " + format + "-view");
  root.dataset.format = format;
  root.setAttribute("aria-label", name + " preview");
  const shell = element(
    "div",
    format === "desktop" ? "browser-shell" : "phone-shell",
  );
  const screen = format === "phone" ? element("div", "phone-screen") : shell;
  if (format === "desktop") {
    const bar = element("div", "browser-bar");
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML =
      '<span class="window-dots"><i></i><i></i><i></i></span><span class="browser-address"></span><span>⋮</span>';
    bar.querySelector(".browser-address").textContent = state.project.title;
    shell.append(bar);
  } else {
    const status = element("div", "phone-status");
    status.setAttribute("aria-hidden", "true");
    status.innerHTML =
      '<span>10:30</span><span class="phone-indicators">' + icons + "</span>";
    screen.append(status);
    shell.append(screen);
  }
  const scroll = element("div", "device-scroll " + format + "-scroll");
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "button");
  scroll.setAttribute("aria-haspopup", "dialog");
  scroll.setAttribute(
    "aria-label",
    "Open " + format + " screenshot. Scroll to see the full page.",
  );
  const image = element("img");
  image.draggable = false;
  scroll.append(image);
  screen.append(scroll);
  if (format === "phone") screen.append(element("div", "phone-home"));
  let pointerStart;
  root.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  root.addEventListener("click", (event) => {
    if (
      pointerStart &&
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ) > 6
    )
      return;
    const bounds = scroll.getBoundingClientRect();
    if (
      event.target === scroll &&
      event.clientX >= bounds.left + scroll.clientWidth
    )
      return;
    openExpanded(format);
  });
  scroll.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openExpanded(format);
  });
  scroll.addEventListener("keydown", navigateKeys);
  scroll.addEventListener("scroll", holdForInteraction, { passive: true });
  scroll.addEventListener("focus", () => holdSlide("focus-" + format, true));
  scroll.addEventListener("blur", () => holdSlide("focus-" + format, false));
  root.append(shell);
  state.devices.set(format, { root, scroll, image });
  return root;
}

function navigateKeys(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  move(event.key === "ArrowRight" ? 1 : -1);
}

async function selectScene(id, updateUrl = true, options = {}) {
  const selected =
    scenes("desktop").find((scene) => scene.id === id) || scenes("desktop")[0];
  const selectedTheme = theme();
  state.requestedScene = selected.id;
  if (updateUrl) history.replaceState(null, "", "#" + selected.id);
  const revision = ++state.revision;
  document.querySelector("#project-views").setAttribute("aria-busy", "true");
  clearTimeout(state.timer);
  clearTimeout(state.prefetchTimer);
  const pending = ["desktop", "phone"].map((format) => ({
    format,
    scene: scenes(format).find((item) => item.id === selected.id),
  }));
  let images;
  try {
    images = await Promise.all(
      pending.map(({ scene, format }) => preparePreview(scene, format)),
    );
  } catch {
    if (revision === state.revision) {
      state.requestedScene = null;
      if (state.scene) history.replaceState(null, "", "#" + state.scene);
      document
        .querySelector("#project-views")
        .setAttribute("aria-busy", "false");
      const status = document.querySelector("#gallery-status");
      status.textContent = "This view could not be loaded.";
      status.hidden = false;
      scheduleSlide();
    }
    return;
  }
  if (revision !== state.revision) {
    prunePreviews();
    return;
  }
  const changed =
    selected.id !== state.scene || selectedTheme !== state.renderedTheme;
  const animate =
    options.animate !== false &&
    state.initialized &&
    changed &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches;
  state.scene = selected.id;
  state.requestedScene = null;
  state.renderedTheme = selectedTheme;
  for (const [index, { format, scene }] of pending.entries()) {
    displayPreview(
      state.devices.get(format),
      images[index],
      scene,
      format,
      animate,
      changed,
    );
  }
  const index = scenes("desktop").findIndex(
    (scene) => scene.id === state.scene,
  );
  document.querySelector("#gallery-status").hidden = true;
  document.querySelector("#scene-counter").textContent =
    String(index + 1).padStart(2, "0") +
    " / " +
    String(scenes("desktop").length).padStart(2, "0");
  document
    .querySelectorAll(".scene-button")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.scene === state.scene),
      ),
    );
  if (state.navigation && state.navigation.index !== index)
    state.navigation.go(index);
  if (state.expandedFormat) updateExpanded();
  state.initialized = true;
  document.querySelector("#project-views").setAttribute("aria-busy", "false");
  scheduleSlide();
  prunePreviews();
  pruneExpandedImages();
  warmNearbyPreviews(animate ? transitionDuration + 32 : 0);
}

function move(delta) {
  const list = scenes("desktop");
  const current = list.findIndex(
    (scene) => scene.id === (state.requestedScene || state.scene),
  );
  selectScene(list[(current + delta + list.length) % list.length].id);
}

function prepareExpandedImage(scene) {
  const existing = state.expandedImages.get(scene.src);
  if (existing) return existing.promise;
  const image = new Image();
  image.id = "expanded-image";
  image.draggable = false;
  image.decoding = "async";
  setImage(image, scene);
  const entry = { image, promise: null };
  entry.promise = image
    .decode()
    .then(() => image)
    .catch((error) => {
      if (state.expandedImages.get(scene.src) === entry)
        state.expandedImages.delete(scene.src);
      throw error;
    });
  state.expandedImages.set(scene.src, entry);
  return entry.promise;
}

function pruneExpandedImages() {
  const keep = new Set(
    ["desktop", "phone"].map(
      (format) => scenes(format).find((scene) => scene.id === state.scene)?.src,
    ),
  );
  for (const [src, entry] of state.expandedImages) {
    if (!keep.has(src) && !entry.image.isConnected)
      state.expandedImages.delete(src);
  }
}

async function updateExpanded() {
  const format = state.expandedFormat;
  if (!format) return;
  const revision = ++state.expandedRevision;
  const scene = scenes(format).find((item) => item.id === state.scene);
  let image;
  try {
    image = await prepareExpandedImage(scene);
  } catch {
    if (revision === state.expandedRevision) {
      closeExpanded();
      const status = document.querySelector("#gallery-status");
      status.textContent = "This image could not be loaded.";
      status.hidden = false;
    }
    return;
  }
  if (revision !== state.expandedRevision || format !== state.expandedFormat) {
    pruneExpandedImages();
    return;
  }
  const dialog = document.querySelector("#expanded-view");
  const region = document.querySelector(".expanded-image-region");
  const width = Math.floor(
    Math.min(
      innerWidth * 0.82,
      format === "phone" ? 460 : 1280,
      scene.width / devicePixelRatio,
    ),
  );
  const height = Math.min(
    innerHeight * 0.82,
    Math.ceil((width * scene.height) / scene.width),
  );
  image.alt =
    state.project.title + " — " + scene.label + ", " + format + " view";
  image.style.maxWidth = Math.floor(scene.width / devicePixelRatio) + "px";
  if (region.firstElementChild !== image) {
    region.replaceChildren(image);
    region.scrollTop = 0;
  }
  dialog.style.width = width + "px";
  dialog.style.height = height + "px";
  dialog.dataset.format = format;
  dialog.dataset.scene = scene.id;
  dialog.setAttribute("aria-label", image.alt);
  if (!dialog.open) dialog.showModal();
  pruneExpandedImages();
}

function closeExpanded() {
  state.expandedRevision++;
  state.expandedFormat = null;
  const dialog = document.querySelector("#expanded-view");
  if (dialog.open) dialog.close();
  document.querySelector(".expanded-image-region").replaceChildren();
  holdSlide("expanded", false);
  pruneExpandedImages();
}

function openExpanded(format) {
  if (!state.initialized) return;
  state.devices.get(format).scroll.focus({ preventScroll: true });
  if (state.requestedScene) {
    state.revision++;
    state.requestedScene = null;
    history.replaceState(null, "", "#" + state.scene);
    document.querySelector("#project-views").setAttribute("aria-busy", "false");
  }
  state.expandedFormat = format;
  holdSlide("expanded", true);
  updateExpanded();
}

function showProject(project, screenshotData) {
  state.project = project;
  state.screenshots = screenshotData;
  document.querySelector("#project-title").textContent = project.title;
  document.querySelector("#project-description").textContent = project.description;
  document.querySelector('meta[name="description"]').content = project.description;
  document.querySelector(".technology-list").replaceChildren(
    ...project.tags.map((tag) => element("li", "", tag)),
  );
  document.querySelector("#project-source").href = project.repository;
  document.querySelector("#project-live").href = project.liveUrl;
  document.querySelector("#project-availability").textContent = project.availability;
  const gallery = document.querySelector("#project-views");
  gallery.querySelector(".loading-message").remove();
  gallery.prepend(makeDevice("desktop"), makeDevice("phone"));
  const navigation = document.querySelector("#scene-navigation");
  const options = element("ul", "scene-options splide__list");
  options.replaceChildren(
    ...scenes("desktop").map((scene) => {
      const slide = element("li", "splide__slide");
      const button = element("button", "scene-button", scene.label);
      button.dataset.scene = scene.id;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => selectScene(scene.id));
      slide.append(button);
      return slide;
    }),
  );
  navigation.replaceChildren(options);
  state.navigation = new Splide(document.querySelector(".gallery-navigation"), {
    role: "group",
    label: "Screenshot views",
    autoWidth: true,
    focus: "center",
    trimSpace: true,
    perMove: 1,
    gap: 4,
    padding: 8,
    rewind: true,
    pagination: false,
    arrows: false,
    keyboard: false,
    speed: transitionDuration,
    waitForTransition: false,
    start: Math.max(
      0,
      scenes("desktop").findIndex(
        (scene) => scene.id === location.hash.slice(1),
      ),
    ),
    reducedMotion: { speed: 0, rewindSpeed: 0 },
    i18n: {
      prev: "Previous view",
      next: "Next view",
      first: "Next view",
      last: "Previous view",
      slideLabel: "%s of %s",
    },
  });
  state.navigation.on("move", (index) => {
    const scene = scenes("desktop")[index];
    if (scene && scene.id !== state.scene) selectScene(scene.id);
  });
  state.navigation.on("drag", () => holdSlide("navigation-drag", true));
  state.navigation.on("dragged", () => holdSlide("navigation-drag", false));
  state.navigation.mount();
  new ResizeObserver(() => state.navigation.emit("resize", true)).observe(
    navigation,
  );
  document.fonts.ready.then(() => state.navigation.emit("resize", true));
  document
    .querySelector("#previous-scene")
    .addEventListener("click", () => move(-1));
  document
    .querySelector("#next-scene")
    .addEventListener("click", () => move(1));
  document
    .querySelector(".gallery-navigation")
    .addEventListener("keydown", navigateKeys);
  const dialog = document.querySelector("#expanded-view");
  dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      closeExpanded();
  });
  dialog.addEventListener("keydown", navigateKeys);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeExpanded();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.expandedFormat) {
      event.preventDefault();
      closeExpanded();
    }
  });
  document.addEventListener("pointerdown", () => {
    if (state.expandedFormat && !dialog.open) closeExpanded();
  });
  document.querySelector("#toggle-autoplay").addEventListener("click", () => {
    state.autoplay = !state.autoplay;
    scheduleSlide();
  });
  for (const { root } of state.devices.values()) {
    root.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") holdSlide("hover", true);
    });
    root.addEventListener("pointerleave", () => holdSlide("hover", false));
    root.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") holdForInteraction();
    });
  }
  document.addEventListener("visibilitychange", () =>
    holdSlide("hidden", document.hidden),
  );
  new ResizeObserver(sizeDevices).observe(document.querySelector("main"));
  window.addEventListener("resize", () => {
    sizeDevices();
    if (state.expandedFormat) updateExpanded();
  });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    (event) => {
      if (event.matches) state.autoplay = false;
      scheduleSlide();
    },
  );
  sizeDevices();
  selectScene(location.hash.slice(1) || scenes("desktop")[0].id, false);
}

function sizeDevices() {
  const gallery = document.querySelector("#project-views");
  if (!gallery || !state.screenshots) return;
  const main = document.querySelector("main");
  const mainStyles = getComputedStyle(main);
  const styles = getComputedStyle(gallery);
  const narrow = matchMedia("(max-width: 760px)").matches;
  const info = document.querySelector(".project-info");
  const mainWidth =
    main.clientWidth -
    parseFloat(mainStyles.paddingLeft) -
    parseFloat(mainStyles.paddingRight);
  const availableWidth = narrow
    ? mainWidth
    : mainWidth - info.offsetWidth - parseFloat(mainStyles.columnGap);
  const availableHeight =
    gallery.clientHeight -
    document.querySelector(".gallery-navigation").offsetHeight -
    parseFloat(styles.rowGap);
  const gap = parseFloat(styles.columnGap);
  const phone = state.devices.get("phone").root;
  const shell = phone.querySelector(".phone-shell");
  const shellStyles = getComputedStyle(shell);
  const horizontal =
    parseFloat(shellStyles.paddingLeft) +
    parseFloat(shellStyles.paddingRight) +
    2;
  const phoneChrome =
    parseFloat(shellStyles.paddingTop) +
    parseFloat(shellStyles.paddingBottom) +
    2 +
    phone.querySelector(".phone-status").offsetHeight +
    phone.querySelector(".phone-home").offsetHeight;
  const phoneRatio =
    state.screenshots.viewports.phone.width /
    state.screenshots.viewports.phone.height;
  const desktop = state.devices.get("desktop").root;
  const desktopScroll = state.devices.get("desktop").scroll;
  const desktopHorizontal =
    2 + desktopScroll.offsetWidth - desktopScroll.clientWidth;
  const viewport = state.screenshots.viewports.desktop;
  const desktopRatio = viewport.width / viewport.height;
  const desktopChrome = desktop.querySelector(".browser-bar").offsetHeight + 2;
  let phoneWidth;
  let desktopWidth;
  if (narrow) {
    phoneWidth = Math.floor(
      Math.min(
        availableWidth * 0.43,
        (availableHeight - phoneChrome) * phoneRatio + horizontal,
      ),
    );
    desktopWidth = Math.min(
      availableWidth - phoneWidth - gap,
      desktopHorizontal +
        Math.max(0, availableHeight - desktopChrome) * desktopRatio,
    );
  } else {
    const widthLimitedHeight =
      (availableWidth -
        gap -
        desktopHorizontal -
        horizontal +
        desktopChrome * desktopRatio +
        phoneChrome * phoneRatio) /
      (desktopRatio + phoneRatio);
    const deviceHeight = Math.min(availableHeight, widthLimitedHeight);
    desktopWidth = Math.floor(
      desktopHorizontal + (deviceHeight - desktopChrome) * desktopRatio,
    );
    phoneWidth = Math.floor(
      horizontal + (deviceHeight - phoneChrome) * phoneRatio,
    );
  }
  const desktopHeight =
    desktopChrome + (desktopWidth - desktopHorizontal) / desktopRatio;
  const phoneHeight = phoneChrome + (phoneWidth - horizontal) / phoneRatio;
  gallery.style.width = desktopWidth + phoneWidth + gap + "px";
  gallery.style.setProperty("--phone-width", phoneWidth + "px");
  gallery.style.setProperty(
    "--device-height",
    Math.max(desktopHeight, phoneHeight) + "px",
  );
  desktop.style.height = desktopHeight + "px";
  for (const { root, scroll } of state.devices.values()) {
    root.style.left = "0px";
    root.style.top = "0px";
    const bounds = scroll.getBoundingClientRect();
    root.style.left =
      Math.round(bounds.left * devicePixelRatio) / devicePixelRatio -
      bounds.left + "px";
    root.style.top =
      Math.round(bounds.top * devicePixelRatio) / devicePixelRatio -
      bounds.top + "px";
  }
  clearTimeout(state.resizeTimer);
  if (state.initialized)
    state.resizeTimer = setTimeout(() => {
      if (
        !state.requestedScene &&
        [...state.devices].some(([format, device]) => {
          const scene = scenes(format).find((item) => item.id === state.scene);
          return (
            device.image.dataset.source !== previewSource(scene, format).src
          );
        })
      )
        selectScene(state.scene, false, { animate: false });
    }, 80);
}

function coverSource(project) {
  return asset(
    `assets/projects/${project.id}/${theme()}/${project.cover.format}/${project.cover.scene}.png`,
  );
}

function showIndex(projects) {
  const cards = projects.map((project) => {
    const card = element("article", "project-card");
    const link = element("a", "project-card-link");
    link.href = asset("projects/" + project.id + "/");
    const cover = element("div", "project-cover");
    const coverScreen = element("div", "project-cover-screen");
    const coverContent = element("div", "project-cover-content");
    const image = element("img");
    image.src = coverSource(project);
    image.alt = project.title + ", " + project.cover.format + " screenshot";
    image.loading = "eager";
    coverContent.append(image);
    coverScreen.append(coverContent);
    cover.append(coverScreen);
    const content = element("div", "project-card-content");
    const heading = element("h2", "", project.title);
    const tags = element("ul", "technology-list");
    tags.setAttribute("aria-label", "Technologies");
    tags.append(...project.tags.map((tag) => element("li", "", tag)));
    content.append(heading, tags, element("p", "", project.description));
    const bottom = element("div", "project-card-bottom");
    bottom.append(
      element("span", "project-open", "View project ↗"),
    );
    content.append(bottom);
    link.append(cover, content);
    card.append(link);
    state.cards.push({ project, image });
    return card;
  });
  document.querySelector("#project-grid").replaceChildren(...cards);
}

const toggle = document.querySelector("#theme-toggle");
function updateThemeLabel() {
  const label =
    "Switch to " + (theme() === "dark" ? "light" : "dark") + " theme";
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
}
toggle.addEventListener("click", () => {
  document.documentElement.dataset.theme =
    theme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("portfolio-theme", theme());
  } catch {}
  updateThemeLabel();
  if (state.screenshots)
    selectScene(state.requestedScene || state.scene, false);
  for (const card of state.cards)
    card.image.src = coverSource(card.project);
});
updateThemeLabel();

async function start() {
  try {
    const projects = await loadJson("data/projects.json");
    if (document.body.dataset.page === "index") {
      showIndex(projects);
      return;
    }
    const project = projects.find(
      (item) => item.id === document.body.dataset.project,
    );
    if (!project) throw new Error("This project could not be found.");
    const screenshotData = await loadJson(
      "data/screenshots/" + project.id + ".json",
    );
    showProject(project, screenshotData);
  } catch (error) {
    const container =
      document.querySelector("#project-views") ||
      document.querySelector("#project-grid");
    const message = element("p", "loading-message", error.message);
    message.setAttribute("role", "alert");
    container.replaceChildren(message);
  }
}
start();
