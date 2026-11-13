import { expect, test } from "@playwright/test";

const projectPath = "/projects/sinair-llm-bot/";

test("GenTool has a project page with synchronized, scrollable screenshot views", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".project-card").filter({ has: page.getByRole("heading", { name: "GenTool Data Viewer", exact: true }) });
  const description = await card.locator(".project-card-content p").textContent();
  const tags = await card.locator(".technology-list li").allTextContents();
  await expect(card.locator(".project-cover img")).toHaveAttribute("src", /\/phone\/players\.png$/);
  await card.locator(".project-card-link").click();
  await expect(page.locator("#project-views")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#project-title")).toHaveText("GenTool Data Viewer");
  await expect(page.locator("#project-description")).toHaveText(description);
  await expect(page.locator(".technology-list li")).toHaveText(tags);
  await expect(page.locator("#project-live")).toHaveAttribute("href", "https://gentool-data-viewer.taonity.org/");
  await expect(page.locator(".scene-button")).toHaveCount(8);
  await expectBothScenes(page, "players");
  await chooseScene(page, "replay-details");
  await expectBothScenes(page, "replay-details");
  await page.locator(".phone-scroll").click({ position: { x: 20, y: 20 } });
  await expect(page.locator("#expanded-view")).toBeVisible();
  const region = page.locator(".expanded-image-region");
  expect(await region.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#expanded-view")).toBeHidden();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(568);
});

async function openProject(page) {
  await page.goto(projectPath);
  await expect(page.locator(".device-view")).toHaveCount(2);
  await expect(page.locator("#project-views")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}

async function chooseScene(page, id) {
  const button = page.locator('.scene-button[data-scene="' + id + '"]');
  const inView = () =>
    button.evaluate((node) => {
      const buttonBounds = node.getBoundingClientRect();
      const track = node.closest(".scene-navigation").getBoundingClientRect();
      return (
        buttonBounds.left >= track.left && buttonBounds.right <= track.right
      );
    });
  const sceneCount = await page.locator(".scene-button").count();
  for (let step = 0; step < sceneCount && !(await inView()); step++) {
    await page.getByRole("button", { name: "Next view", exact: true }).click();
    await expect(page.locator("#project-views")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  }
  await button.click();
}

async function readyImages(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((image) => image.hasAttribute("src"))
        .map((image) => image.decode()),
    );
  });
}

async function observeExpandedImages(page) {
  await page.addInitScript(() => {
    window.expandedFrames = [];
    window.expandedDecoded = 0;
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      return decode.call(this).then(() => {
        if (this.id === "expanded-image") window.expandedDecoded++;
      });
    };
    const show = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      show.call(this);
      const image = this.querySelector("img");
      const bounds = this.getBoundingClientRect();
      window.expandedFrames.push({
        format: this.dataset.format,
        src: image.currentSrc,
        complete: image.complete,
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
        width: bounds.width,
        height: bounds.height,
        screenWidth: this.querySelector(".expanded-image-region").getBoundingClientRect().width,
        screenHeight: this.querySelector(".expanded-image-region").getBoundingClientRect().height,
        title: this.querySelector("#expanded-title").textContent,
        hasFrame: !!this.querySelector(this.dataset.format === "phone" ? ".phone-shell" : ".browser-shell"),
      });
    };
  });
}

function expectBothScenes(page, scene) {
  return Promise.all(
    ["desktop", "phone"].map((format) =>
      expect(page.locator("." + format + "-view")).toHaveAttribute(
        "data-scene",
        scene,
      ),
    ),
  );
}

test("project index links to a separate project page with complete titles", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(3);
  const yarikCard = page.locator(".project-card").filter({ has: page.getByRole("heading", { name: "Yarik LLM Bot", exact: true }) });
  const card = await yarikCard.boundingBox();
  expect(card.width).toBeLessThanOrEqual(400);
  expect(card.height).toBeLessThan(650);
  await expect(page.locator(".device-view")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Yarik LLM Bot", exact: true }),
  ).toBeVisible();
  const description = await yarikCard.locator(".project-card-content p").textContent();
  const tags = await yarikCard.locator(".technology-list li").allTextContents();
  expect(description).toMatch(/^Your group chat hits a question nobody can settle/);
  expect(description).not.toMatch(/assistant|room summaries|tool calls|request\/response|—/i);
  expect(tags.length).toBeGreaterThan(0);
  const cover = yarikCard.locator(".project-cover img");
  await expect(cover).toHaveAttribute("src", /\/phone\/outbound\.png$/);
  await readyImages(page);
  expect(await cover.evaluate((image) => image.naturalWidth)).toBe(1560);
  const coverTheme = await page.locator("html").getAttribute("data-theme");
  await page.locator("#theme-toggle").click();
  await expect(cover).toHaveAttribute(
    "src",
    new RegExp("/" + (coverTheme === "dark" ? "light" : "dark") + "/phone/outbound\\.png$"),
  );
  await page.locator("#theme-toggle").click();
  await yarikCard.locator(".project-card-link").click();
  await expect(page).toHaveURL(new RegExp(projectPath + "$"));
  await expect(
    page.getByRole("heading", { name: "Yarik LLM Bot", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("#project-description")).toHaveText(description);
  await expect(page.locator("#project-description")).not.toContainText("Sinair");
  await expect(page.getByRole("link", { name: "Live site" })).toHaveAttribute("href", "https://sinair-llm-bot.taonity.org/");
  await expect(page.locator("#project-availability")).toContainText("closed testing");
  await expect(page.locator("#project-availability")).toContainText("popular chat platforms are planned");
  expect(await page.locator(".technology-list li").allTextContents()).toEqual(tags);
  const title = await page.locator("#project-title").evaluate((node) => ({
    width: node.clientWidth,
    content: node.scrollWidth,
    overflow: getComputedStyle(node).textOverflow,
  }));
  expect(title.content).toBeLessThanOrEqual(title.width);
  expect(title.overflow).not.toBe("ellipsis");
  await page
    .getByRole("link", { name: "All projects", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true }),
  ).toBeVisible();
});

test("Fullstack Starter has its own screenshots and consistent project details", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".project-card").filter({ has: page.getByRole("heading", { name: "Fullstack Starter", exact: true }) });
  await expect(card).toBeVisible();
  const description = await card.locator(".project-card-content p").textContent();
  const tags = await card.locator(".technology-list li").allTextContents();
  await expect(card.locator("img")).toHaveAttribute("src", /fullstack-starter\/.*\/phone\/admin\.png$/);
  await card.locator("a").click();
  await expect(page).toHaveURL(/\/projects\/fullstack-starter\/$/);
  await expect(page.locator("#project-views")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("heading", { name: "Fullstack Starter", level: 1 })).toBeVisible();
  await expect(page.locator("#project-description")).toHaveText(description);
  expect(await page.locator(".technology-list li").allTextContents()).toEqual(tags);
  await expect(page.locator(".scene-button")).toHaveCount(6);
  await expectBothScenes(page, "admin");
  await page.getByRole("button", { name: "Next view", exact: true }).click();
  await expectBothScenes(page, "config");
  await chooseScene(page, "request-access");
  await expectBothScenes(page, "request-access");
  await page.locator(".phone-scroll").click({ position: { x: 30, y: 30 } });
  await expect(page.locator("#expanded-view")).toBeVisible();
  await expect(page.locator("#expanded-image")).toHaveAttribute("src", /fullstack-starter\/.*\/phone\/request-access\.png$/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#expanded-view")).not.toBeVisible();
  await readyImages(page);
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, content: document.documentElement.scrollWidth, navigation: document.querySelector(".gallery-navigation").getBoundingClientRect().bottom }));
  expect(viewport.content).toBeLessThanOrEqual(viewport.width);
  expect(viewport.navigation).toBeLessThanOrEqual(viewport.height + 1);
});

test("both devices and text navigation fit the viewport with sharp images", async ({
  page,
  baseURL,
}, testInfo) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(baseURL) && response.status() >= 400)
      failures.push(String(response.status()) + " " + response.url());
  });
  await openProject(page);
  await readyImages(page);
  const currentTheme = testInfo.project.use.colorScheme;
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    currentTheme,
  );
  await expect(page.locator(".browser-address")).toHaveText("Yarik LLM Bot");
  await expect(page.locator(".desktop-scroll > img")).toHaveAttribute(
    "src",
    new RegExp("/" + currentTheme + "/desktop/"),
  );
  await expect(page.locator(".phone-scroll > img")).toHaveAttribute(
    "src",
    new RegExp("/" + currentTheme + "/phone/"),
  );
  expect(
    await page
      .locator(".desktop-scroll > img")
      .evaluate((image) => image.naturalWidth),
  ).toBeLessThan(4928);
  expect(
    await page
      .locator(".phone-scroll > img")
      .evaluate((image) => image.naturalWidth),
  ).toBeLessThan(1560);
  await expect(page.locator(".scene-button")).toHaveCount(11);
  await expect(page.locator(".scene-navigation img")).toHaveCount(0);
  await expect(page.locator(".about, .project-details, .hero")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(testInfo.project.use.viewport.width);
  const gallery = await page.locator(".view-section").boundingBox();
  const info = await page.locator(".project-info").boundingBox();
  const viewportWidth = testInfo.project.use.viewport.width;
  if (viewportWidth >= 1000) {
    expect(gallery.x + gallery.width).toBeLessThan(info.x);
  } else {
    expect(info.y + info.height).toBeLessThan(gallery.y);
  }
  const desktopViewport = await page.locator(".desktop-scroll").boundingBox();
  const desktopImage = await page
    .locator(".desktop-scroll > img")
    .boundingBox();
  expect(
    Math.abs(desktopImage.width / desktopViewport.height - 1232 / 1000),
  ).toBeLessThan(0.001);
  expect(Math.abs(desktopImage.height - desktopViewport.height)).toBeLessThan(
    1,
  );
  await expect(
    page.locator(
      "#showcase, .showcase, .device-heading, #scene-title, .scroll-hint, .expand-button",
    ),
  ).toHaveCount(0);
  const nav = await page.locator("#scene-navigation").boundingBox();
  const controls = await page.locator(".view-controls").boundingBox();
  expect(
    Math.abs(nav.y + nav.height / 2 - controls.y - controls.height / 2),
  ).toBeLessThan(1);
  expect(nav.x + nav.width).toBeLessThan(controls.x);
  const phone = await page.locator(".phone-shell").boundingBox();
  expect(phone.width).toBeGreaterThanOrEqual(viewportWidth >= 1000 ? 260 : 140);
  for (const selector of [
    ".desktop-view",
    ".phone-view",
    "#scene-navigation",
    ".view-controls",
  ]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(
      testInfo.project.use.viewport.height,
    );
  }
  for (const format of ["desktop", "phone"]) {
    const pixels = await page
      .locator("." + format + "-scroll > img")
      .evaluate((image) => ({
        source: image.naturalWidth,
        displayed: Math.ceil(
          image.getBoundingClientRect().width * devicePixelRatio,
        ),
        left: image.getBoundingClientRect().left * devicePixelRatio,
        top: image.getBoundingClientRect().top * devicePixelRatio,
      }));
    expect(pixels.source).toBeGreaterThanOrEqual(pixels.displayed);
    expect(Math.abs(pixels.left - Math.round(pixels.left))).toBeLessThan(0.04);
    expect(Math.abs(pixels.top - Math.round(pixels.top))).toBeLessThan(0.04);
  }
  expect(failures).toEqual([]);
  const file = testInfo.outputPath("project-page.png");
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  await testInfo.attach("Project page", {
    path: file,
    contentType: "image/png",
  });
});

test("one scene selector synchronizes both devices and preserves vertical scrolling", async ({
  page,
}) => {
  await openProject(page);
  await chooseScene(page, "pipeline-details");
  await expectBothScenes(page, "pipeline-details");
  await readyImages(page);
  for (const format of ["desktop", "phone"]) {
    const scroll = page.locator("." + format + "-scroll");
    const dimensions = await scroll.evaluate((node) => ({
      content: node.scrollHeight,
      frame: node.clientHeight,
    }));
    expect(dimensions.content).toBeGreaterThan(dimensions.frame);
    await scroll.evaluate((node) => {
      node.scrollTop = 150;
    });
    expect(await scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Next view", exact: true }).click();
  await expectBothScenes(page, "llm-payloads");
  expect(
    await page.locator(".desktop-scroll").evaluate((node) => node.scrollTop),
  ).toBe(0);
  expect(
    await page.locator(".phone-scroll").evaluate((node) => node.scrollTop),
  ).toBe(0);
  await page.locator(".phone-scroll").focus();
  await page.keyboard.press("ArrowRight");
  await expectBothScenes(page, "outbound");
  await page
    .getByRole("button", { name: "Previous view", exact: true })
    .click();
  await expectBothScenes(page, "llm-payloads");
});

test("mobile JSON captures scroll through the complete payload in the frame and popup", async ({ page }) => {
  await openProject(page);
  await chooseScene(page, "llm-payloads");
  await expectBothScenes(page, "llm-payloads");
  const phone = page.locator(".phone-scroll");
  const imageHeight = await phone.locator("img").evaluate((image) => Number(image.getAttribute("height")));
  expect(imageHeight).toBeGreaterThan(844);
  await phone.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  expect(await phone.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await phone.click({ position: { x: 30, y: 30 } });
  await expect(page.locator("#expanded-view")).toBeVisible();
  const region = page.locator(".expanded-image-region");
  await region.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const bottom = await region.evaluate((node) => ({ top: node.scrollTop, visible: node.clientHeight, content: node.scrollHeight }));
  expect(bottom.top).toBeGreaterThan(0);
  expect(bottom.top + bottom.visible).toBeGreaterThanOrEqual(bottom.content - 1);
});

test("compact popups show a title, scroll, navigate by keyboard, and close outside or on Escape", async ({
  page,
}, testInfo) => {
  await openProject(page);
  for (const format of ["desktop", "phone"]) {
    await chooseScene(page, "summaries");
    await expectBothScenes(page, "summaries");
    const mainImage = await page
      .locator("." + format + "-scroll > img")
      .boundingBox();
    const trigger = page.locator("." + format + "-scroll");
    if (format === "desktop") {
      await trigger.focus();
      await page.keyboard.press("Enter");
    } else await trigger.click({ position: { x: 20, y: 20 } });
    const dialog = page.getByRole("dialog", { name: /Yarik/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-format", format);
    await expect(dialog).toHaveAttribute("data-scene", "summaries");
    await expect(dialog.locator("#expanded-title")).toHaveText("Summaries");
    await expect(dialog.locator("#expanded-context")).toContainText(format === "phone" ? "Phone" : "Desktop");
    await expect(dialog.getByRole("button", { name: "Close expanded view" })).toBeVisible();
    await expect(dialog.locator(".phone-shell, .browser-shell, .phone-status, .phone-home")).toHaveCount(0);
    const bounds = await dialog.boundingBox();
    const viewport = testInfo.project.use.viewport;
    expect(bounds.x).toBeGreaterThan(viewport.width * 0.02);
    expect(bounds.y).toBeGreaterThanOrEqual(7);
    expect(bounds.x + bounds.width).toBeLessThan(viewport.width * 0.98);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 7);
    await page.locator("#expanded-image").evaluate((image) => image.decode());
    const pixels = await page.locator("#expanded-image").evaluate((image) => ({
      width: image.getBoundingClientRect().width,
      displayed: Math.ceil(
        image.getBoundingClientRect().width * devicePixelRatio,
      ),
      source: image.naturalWidth,
    }));
    expect(pixels.source).toBe(format === "desktop" ? 4928 : 1560);
    expect(pixels.width).toBeGreaterThan(mainImage.width);
    const desiredWidth = Math.floor(Math.min(
      viewport.width * 0.94 - 2,
      viewport.width - 70,
      format === "phone" ? 560 : 1280,
      pixels.source / (testInfo.project.use.deviceScaleFactor || 1),
    ));
    expect(pixels.width).toBeGreaterThanOrEqual(desiredWidth - 8);
    expect(bounds.width - pixels.width).toBeLessThanOrEqual(10);
    const header = await dialog.locator(".expanded-header").boundingBox();
    const content = await dialog.locator(".expanded-image-region").boundingBox();
    expect(content.y - bounds.y).toBeLessThanOrEqual(1);
    expect(Math.abs(header.y - bounds.y)).toBeLessThanOrEqual(1);
    const closeBounds = await dialog.locator("#close-expanded").boundingBox();
    const titleBounds = await dialog.locator("#expanded-title").boundingBox();
    expect(closeBounds.x).toBeGreaterThanOrEqual(content.x + content.width + 8);
    expect(titleBounds.x).toBeGreaterThanOrEqual(content.x + content.width + 8);
    expect(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(viewport.width - 7);
    expect(closeBounds.y).toBe(bounds.y);
    expect(titleBounds.y).toBeGreaterThan(closeBounds.y + closeBounds.height);
    expect(titleBounds.y + titleBounds.height).toBeLessThanOrEqual(content.y + content.height);
    expect(await dialog.locator("#expanded-title").evaluate((node) => getComputedStyle(node).writingMode)).toBe("vertical-rl");
    expect(await dialog.locator(".expanded-stage").evaluate((node) => getComputedStyle(node).borderTopLeftRadius)).toBe("8px");
    expect(pixels.source).toBeGreaterThanOrEqual(pixels.displayed);
    const region = page.locator(".expanded-image-region");
    if (
      await region.evaluate((node) => node.scrollHeight > node.clientHeight)
    ) {
      await region.evaluate((node) => {
        node.scrollTop = 100;
      });
      expect(await region.evaluate((node) => node.scrollTop)).toBeGreaterThan(
        0,
      );
    }
    await page.keyboard.press("ArrowRight");
    await expect(dialog).toHaveAttribute("data-scene", "config");
    await expectBothScenes(page, "config");
    if (format === "phone") {
      const file = testInfo.outputPath("expanded-phone.png");
      await page.screenshot({ path: file, animations: "disabled" });
      await testInfo.attach("Compact phone popup", {
        path: file,
        contentType: "image/png",
      });
      await page.mouse.click(2, 2);
    } else await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    const focus = await trigger.evaluate((node) => ({
      inner: getComputedStyle(node).outlineStyle,
      keyboard: node.matches(":focus-visible"),
      outer: getComputedStyle(node.closest(".device-view").firstElementChild).outlineStyle,
    }));
    expect(focus.inner).toBe("none");
    if (focus.keyboard) expect(focus.outer).toBe("solid");
  }
});

test("desktop height stays constant across every scene and shorter windows", async ({
  page,
}, testInfo) => {
  await openProject(page);
  const initial = await page.locator(".browser-shell").boundingBox();
  const initialImage = await page
    .locator(".desktop-scroll > img")
    .boundingBox();
  const overflowStates = new Set();
  const ids = await page
    .locator(".scene-button")
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.scene));
  for (const id of ids) {
    await chooseScene(page, id);
    await expectBothScenes(page, id);
    const current = await page.locator(".browser-shell").boundingBox();
    expect(current.height).toBe(initial.height);
    expect(current.width).toBe(initial.width);
    const image = await page.locator(".desktop-scroll > img").boundingBox();
    expect(image.width).toBe(initialImage.width);
    overflowStates.add(
      await page
        .locator(".desktop-scroll")
        .evaluate((node) => node.scrollHeight > node.clientHeight),
    );
  }
  expect([...overflowStates].sort()).toEqual([false, true]);
  if (testInfo.project.name !== "desktop-light") return;
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [320, 700],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(async () => {
        const boxes = await Promise.all(
          [".desktop-view", ".phone-view", "#scene-navigation"].map(
            (selector) => page.locator(selector).boundingBox(),
          ),
        );
        return boxes.every(
          (box) =>
            box.y >= 0 &&
            box.y + box.height <= height &&
            box.x >= 0 &&
            box.x + box.width <= width,
        );
      })
      .toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(height);
  }
});

test("Fullstack configuration stays scrollbar-free through fractional resizing", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop screenshot sizing");
  await page.setViewportSize({ width: 2000, height: 1300 });
  await page.goto("/projects/fullstack-starter/#config");
  await expect(page.locator("#project-views")).toHaveAttribute("aria-busy", "false");
  await readyImages(page);
  const scroll = page.locator(".desktop-scroll");
  for (const zoom of [0.8, 1, 1.1, 1.25, 1.5]) {
    const style = await page.addStyleTag({ content: `.desktop-scroll { zoom: ${zoom} }` });
    for (const width of [1900, 1919, 1938, 1957, 1976, 2014, 2052, 2238, 2560]) {
      await page.setViewportSize({ width, height: 1300 });
      await expect.poll(() => scroll.evaluate(node => node.scrollHeight - node.clientHeight)).toBe(0);
      expect(await scroll.evaluate(node => node.scrollWidth - node.clientWidth)).toBe(0);
      expect(await scroll.evaluate(node => getComputedStyle(node).overflowY)).toBe("hidden");
      await expect(scroll.locator("img")).toHaveCSS("object-fit", "contain");
    }
    await style.evaluate(node => node.remove());
  }
  await chooseScene(page, "admin");
  await expect(scroll).toHaveCSS("overflow-y", "auto");
  expect(await scroll.evaluate(node => node.scrollHeight)).toBeGreaterThan(await scroll.evaluate(node => node.clientHeight));
  const width = await scroll.evaluate(node => node.clientWidth);
  await chooseScene(page, "config");
  await expect(scroll).toHaveCSS("overflow-y", "hidden");
  expect(await scroll.evaluate(node => node.clientWidth)).toBe(width);
});

test("project previews fill large screens without scrolling images that fit", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-light", "Shared viewport and display-scale checks");
  test.setTimeout(60_000);
  for (const deviceScaleFactor of [1, 1.25, 1.5, 2]) {
    for (const colorScheme of ["light", "dark"]) {
      const context = await page.context().browser().newContext({ baseURL, deviceScaleFactor, colorScheme, reducedMotion: "reduce" });
      const preview = await context.newPage();
      try {
        let fullHdWidth;
        for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
          await preview.setViewportSize(viewport);
          await preview.goto("/projects/sinair-llm-bot/#about");
          await expect(preview.locator("#project-views")).toHaveAttribute("aria-busy", "false");
          await readyImages(preview);
          await expect.poll(() => preview.locator(".project-layout").evaluate(node => node.getBoundingClientRect().width)).toBe(viewport.width);
          const desktopWidth = () => preview.locator(".desktop-view").evaluate(node => node.getBoundingClientRect().width);
          if (fullHdWidth) await expect.poll(desktopWidth).toBeGreaterThan(fullHdWidth * 1.25);
          else fullHdWidth = await desktopWidth();
          for (const format of ["desktop", "phone"]) {
            const scroll = preview.locator("." + format + "-scroll");
            await expect.poll(() => scroll.evaluate(node => node.scrollWidth - node.clientWidth)).toBe(0);
            await expect.poll(() => scroll.evaluate(node => node.scrollHeight - node.clientHeight)).toBe(0);
            await expect.poll(() => scroll.locator("img").evaluate(image => image.naturalWidth >= Math.ceil(image.getBoundingClientRect().width * devicePixelRatio))).toBe(true);
            await scroll.click({ position: { x: 20, y: 20 } });
            await expect(preview.locator("#expanded-view")).toBeVisible();
            const region = preview.locator(".expanded-image-region");
            expect(await region.evaluate(node => node.scrollWidth - node.clientWidth)).toBe(0);
            const imageHeight = await region.locator("img").evaluate(image => image.getBoundingClientRect().height);
            if (imageHeight <= viewport.height * 0.82) {
              expect(await region.evaluate(node => node.scrollHeight - node.clientHeight)).toBe(0);
            }
            await preview.keyboard.press("Escape");
          }
        }
      } finally {
        await context.close();
      }
    }
  }
});

test("slideshow crossfades both devices, pauses during inspection, and can be stopped", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-light",
    "Shared slideshow behavior",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await openProject(page);
  await page.mouse.move(0, 0);
  await expect(
    page.getByRole("button", { name: "Pause slideshow", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(8000);
  await expectBothScenes(page, "pipelines");
  await expect(page.locator(".outgoing-image")).toHaveCount(2);
  await page.clock.fastForward(400);
  await expect(page.locator(".outgoing-image")).toHaveCount(0);
  await page.locator(".desktop-view").hover();
  await page.clock.fastForward(16000);
  await expectBothScenes(page, "pipelines");
  await page.locator(".phone-scroll").click({ position: { x: 20, y: 20 } });
  await page.mouse.move(0, 0);
  await page.clock.fastForward(16000);
  await expectBothScenes(page, "pipelines");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Pause slideshow", exact: true })
    .click();
  await page.clock.fastForward(16000);
  await expectBothScenes(page, "pipelines");
  await page
    .getByRole("button", { name: "Play slideshow", exact: true })
    .click();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(8000);
  await expectBothScenes(page, "pipeline-details");
});

test("theme and selected scene persist across project reloads", async ({
  page,
}, testInfo) => {
  await openProject(page);
  await chooseScene(page, "admin");
  const next = testInfo.project.use.colorScheme === "dark" ? "light" : "dark";
  await page
    .getByRole("button", { name: "Switch to " + next + " theme", exact: true })
    .click();
  await expectBothScenes(page, "admin");
  await expect(page.locator(".desktop-scroll > img")).toHaveAttribute(
    "src",
    new RegExp("/" + next + "/desktop/admin(?:@\\d+)?\\.png"),
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", next);
  await expectBothScenes(page, "admin");
  await expect(page.locator(".phone-scroll > img")).toHaveAttribute(
    "src",
    new RegExp("/" + next + "/phone/admin(?:@\\d+)?\\.png"),
  );
});

test("both static pages work under a hosting subdirectory without API requests", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(request.url());
  });
  await page.goto("/dist/");
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true }),
  ).toBeVisible();
  await page.locator('.project-card-link[href$="projects/sinair-llm-bot/"]').click();
  await expect(page).toHaveURL(/\/dist\/projects\/sinair-llm-bot\/$/);
  await expect(page.locator(".device-view")).toHaveCount(2);
  await readyImages(page);
  await expect(page.locator(".desktop-scroll > img")).toHaveAttribute(
    "src",
    /\/dist\/assets\//,
  );
  await expect(page.locator("canvas, form")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /README/i })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("Splide keeps the active tab and controls accessible at every window size", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-light",
    "Responsive navigation behavior",
  );
  await openProject(page);
  for (const [index, width] of [
    1920, 1440, 1280, 1024, 900, 768, 390, 320, 1920,
  ].entries()) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await expect(
      page.locator("#scene-select, .scene-select, select"),
    ).toHaveCount(0);
    await expect(page.locator(".gallery-navigation")).toHaveClass(
      /is-initialized/,
    );
    await expect(page.locator(".scene-button")).toHaveCount(11);
    await expect(page.locator(".scene-button[hidden]")).toHaveCount(0);
    await chooseScene(page, index % 2 ? "config" : "pipelines");
    await expectBothScenes(page, index % 2 ? "config" : "pipelines");
    const geometry = await page
      .locator(".gallery-navigation")
      .evaluate((bar) => {
        const rect = (node) => {
          const b = node.getBoundingClientRect();
          return {
            left: b.left,
            right: b.right,
            top: b.top,
            bottom: b.bottom,
            center: b.top + b.height / 2,
          };
        };
        const nav = bar.querySelector(".scene-navigation");
        const controls = bar.querySelector(".view-controls");
        const choices = [
          nav.querySelector('.scene-button[aria-pressed="true"]'),
        ];
        return {
          bar: rect(bar),
          nav: rect(nav),
          controls: rect(controls),
          choices: choices.map(rect),
          scrollbar: getComputedStyle(nav).overflowX,
        };
      });
    expect(geometry.controls.right).toBeLessThanOrEqual(geometry.bar.right + 1);
    expect(geometry.controls.left).toBeGreaterThan(geometry.nav.right);
    expect(
      Math.abs(geometry.controls.center - geometry.nav.center),
    ).toBeLessThan(1);
    expect(geometry.scrollbar).toBe("hidden");
    expect(geometry.choices.length).toBeGreaterThan(0);
    await expect(
      page.locator('.scene-button[aria-pressed="true"]'),
    ).toBeVisible();
    for (const choice of geometry.choices) {
      expect(choice.left).toBeGreaterThanOrEqual(geometry.nav.left - 1);
      expect(choice.right).toBeLessThanOrEqual(geometry.nav.right + 1);
      expect(choice.top).toBeGreaterThanOrEqual(geometry.nav.top);
      expect(choice.bottom).toBeLessThanOrEqual(geometry.nav.bottom);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (width === 1024) {
      const file = testInfo.outputPath("compact-desktop-navigation.png");
      await page.screenshot({ path: file, animations: "disabled" });
      await testInfo.attach("Splide tab navigation", {
        path: file,
        contentType: "image/png",
      });
    }
  }
});
test("Splide supports keyboard and dragging while keeping both screenshots synchronized", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-light",
    "Shared library interaction behavior",
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await openProject(page);
  await page.locator('.scene-button[aria-pressed="true"]').focus();
  await page.keyboard.press("ArrowRight");
  await expectBothScenes(page, "pipelines");
  const track = await page.locator("#scene-navigation").boundingBox();
  await page.mouse.move(track.x + track.width - 30, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + 24, track.y + track.height / 2, {
    steps: 18,
  });
  await page.mouse.up();
  await expect(page.locator(".desktop-view")).not.toHaveAttribute(
    "data-scene",
    "pipelines",
  );
  const scene = await page.locator(".desktop-view").getAttribute("data-scene");
  await expectBothScenes(page, scene);
  await expect(
    page.locator('.scene-button[data-scene="' + scene + '"]'),
  ).toHaveAttribute("aria-pressed", "true");
});
test("nearby previews are prepared ahead and reused during rapid transitions", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-light",
    "Shared preview preparation behavior",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const requests = new Map();
  const finished = new Set();
  page.on("request", (request) => {
    if (request.url().includes("/assets/projects/"))
      requests.set(request.url(), (requests.get(request.url()) || 0) + 1);
  });
  page.on("requestfinished", (request) => finished.add(request.url()));
  await openProject(page);
  await page
    .getByRole("button", { name: "Pause slideshow", exact: true })
    .click();
  await expect
    .poll(
      () =>
        [...finished].filter((url) =>
          /\/light\/(desktop|phone)\/about@\d+\.png$/.test(url),
        ).length,
    )
    .toBe(2);
  const prepared = [...requests.keys()].filter((url) =>
    /\/light\/(desktop|phone)\/pipelines@\d+\.png$/.test(url),
  );
  expect(prepared).toHaveLength(2);
  await page.getByRole("button", { name: "Next view", exact: true }).click();
  await expectBothScenes(page, "pipelines");
  for (const url of prepared) expect(requests.get(url)).toBe(1);
  await expect(page.locator(".outgoing-image")).toHaveCount(2);
  const bounds = await page.locator(".outgoing-image").evaluateAll((nodes) =>
    nodes.map((node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      frameWidth: node.parentElement.clientWidth,
      frameHeight: node.parentElement.clientHeight,
    })),
  );
  for (const box of bounds) {
    expect(box.width).toBe(box.frameWidth);
    expect(box.height).toBe(box.frameHeight);
  }
  await page
    .getByRole("button", { name: "Previous view", exact: true })
    .click();
  await expectBothScenes(page, "messages");
  await page.getByRole("button", { name: "Next view", exact: true }).click();
  await expectBothScenes(page, "pipelines");
  await expect(page.locator(".outgoing-image")).toHaveCount(0);
  await expect(page.locator(".desktop-scroll > img")).toHaveCount(1);
  await expect(page.locator(".phone-scroll > img")).toHaveCount(1);
  for (const url of prepared) expect(requests.get(url)).toBe(1);
});

test("navigation waits for both new previews before animating", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-light",
    "Shared transition synchronization",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1024, height: 768 });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let blocked = 0;
  await page.route(
    /\/light\/(desktop|phone)\/llm-payloads@\d+\.png$/,
    async (route) => {
      blocked++;
      await gate;
      await route.continue();
    },
  );
  try {
    await openProject(page);
    await page
      .getByRole("button", { name: "Pause slideshow", exact: true })
      .click();
    const transform = await page
      .locator(".scene-options")
      .evaluate((node) => node.style.transform);
    await page.evaluate(() => {
      window.transitionScenes = [];
      const list = document.querySelector(".scene-options");
      list.addEventListener("transitionrun", (event) => {
        if (event.target === list)
          window.transitionScenes.push(
            [...document.querySelectorAll(".device-view")].map(
              (node) => node.dataset.scene,
            ),
          );
      });
    });
    await page.getByRole("button", { name: "LLM JSON", exact: true }).click();
    await expect.poll(() => blocked).toBe(2);
    await expectBothScenes(page, "messages");
    expect(
      await page
        .locator(".scene-options")
        .evaluate((node) => node.style.transform),
    ).toBe(transform);
    await expect(page.locator(".outgoing-image")).toHaveCount(0);
    release();
    await expectBothScenes(page, "llm-payloads");
    await expect
      .poll(() => page.evaluate(() => window.transitionScenes.length))
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() =>
        window.transitionScenes.every((pair) =>
          pair.every((scene) => scene === "llm-payloads"),
        ),
      ),
    ).toBe(true);
  } finally {
    release();
  }
});

test("opening an expanded image cancels a pending scene change", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-light",
    "Shared expanded-view synchronization",
  );
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let blocked = 0;
  let finished = 0;
  await page.route(
    /\/light\/(desktop|phone)\/llm-payloads@\d+\.png$/,
    async (route) => {
      blocked++;
      await gate;
      await route.continue();
    },
  );
  page.on("requestfinished", (request) => {
    if (/\/light\/(desktop|phone)\/llm-payloads@\d+\.png$/.test(request.url()))
      finished++;
  });
  try {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openProject(page);
    await page.getByRole("button", { name: "LLM JSON", exact: true }).click();
    await expect.poll(() => blocked).toBe(2);
    await page.locator(".desktop-scroll").click({ position: { x: 20, y: 20 } });
    const dialog = page.getByRole("dialog", { name: /Messages/ });
    await expect(dialog).toBeVisible();
    release();
    await expect.poll(() => finished).toBe(2);
    await page.locator("#expanded-image").evaluate((image) => image.decode());
    await expectBothScenes(page, "messages");
    await expect(dialog).toHaveAttribute("data-scene", "messages");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  } finally {
    release();
  }
});

test("switching phone and desktop popups never exposes the previous image or size", async ({
  page,
}, testInfo) => {
  await observeExpandedImages(page);
  await openProject(page);
  const theme = testInfo.project.use.colorScheme;
  const dialog = page.locator("#expanded-view");
  const open = async (format) => {
    await page
      .locator("." + format + "-scroll")
      .click({ position: { x: 20, y: 20 } });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-format", format);
  };
  await open("phone");
  await page.keyboard.press("Escape");
  let releaseDesktop;
  let desktopBlocked = false;
  const desktopGate = new Promise((resolve) => {
    releaseDesktop = resolve;
  });
  await page.route(
    new RegExp("/" + theme + "/desktop/messages\\.png$"),
    async (route) => {
      desktopBlocked = true;
      await desktopGate;
      await route.continue();
    },
  );
  try {
    await page.locator(".desktop-scroll").click({ position: { x: 20, y: 20 } });
    await expect.poll(() => desktopBlocked).toBe(true);
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.expandedFrames.length)).toBe(1);
    releaseDesktop();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-format", "desktop");
  } finally {
    releaseDesktop();
  }
  await page.keyboard.press("Escape");
  await chooseScene(page, "summaries");
  await expectBothScenes(page, "summaries");
  await open("desktop");
  await page.keyboard.press("Escape");
  let releasePhone;
  let phoneBlocked = false;
  const phoneGate = new Promise((resolve) => {
    releasePhone = resolve;
  });
  await page.route(
    new RegExp("/" + theme + "/phone/summaries\\.png$"),
    async (route) => {
      phoneBlocked = true;
      await phoneGate;
      await route.continue();
    },
  );
  try {
    await page.locator(".phone-scroll").click({ position: { x: 20, y: 20 } });
    await expect.poll(() => phoneBlocked).toBe(true);
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.expandedFrames.length)).toBe(3);
    releasePhone();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-format", "phone");
  } finally {
    releasePhone();
  }
  await page.keyboard.press("Escape");
  for (const format of ["desktop", "phone"]) {
    await open(format);
    await page.keyboard.press("Escape");
  }
  const frames = await page.evaluate(() => window.expandedFrames);
  expect(frames.map((frame) => frame.format)).toEqual([
    "phone",
    "desktop",
    "desktop",
    "phone",
    "desktop",
    "phone",
  ]);
  const viewport = testInfo.project.use.viewport;
  const ratio = testInfo.project.use.deviceScaleFactor || 1;
  for (const frame of frames) {
    const originalWidth = frame.format === "desktop" ? 4928 : 1560;
    expect(frame.complete).toBe(true);
    expect(frame.sourceWidth).toBe(originalWidth);
    expect(frame.src).toContain("/" + frame.format + "/");
    expect(frame.width).toBeLessThanOrEqual(viewport.width * 0.94 + 1);
    expect(frame.height).toBeLessThanOrEqual(viewport.height - 15);
    expect(frame.screenWidth).toBeGreaterThan(0);
    expect(frame.screenHeight).toBeGreaterThan(0);
    expect(frame.screenWidth * ratio).toBeLessThanOrEqual(originalWidth);
    expect(frame.title).toMatch(/Messages|Summaries/);
    expect(frame.hasFrame).toBe(false);
  }
});

test("Escape cancels an expanded image that is still decoding", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-light",
    "Shared lightbox cancellation",
  );
  await observeExpandedImages(page);
  let release;
  let blocked = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(/\/light\/desktop\/messages\.png$/, async (route) => {
    blocked = true;
    await gate;
    await route.continue();
  });
  try {
    await openProject(page);
    await page.locator(".desktop-scroll").click({ position: { x: 20, y: 20 } });
    await expect.poll(() => blocked).toBe(true);
    await page.keyboard.press("Escape");
    release();
    await expect
      .poll(() => page.evaluate(() => window.expandedDecoded))
      .toBe(1);
    await expect(page.locator("#expanded-view")).toBeHidden();
    expect(await page.evaluate(() => window.expandedFrames.length)).toBe(0);
  } finally {
    release();
  }
});

test("homepage covers fade in without loading labels or changing size", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  if (testInfo.project.name === "desktop-light")
    await page.setViewportSize({ width: 1440, height: 600 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const theme = testInfo.project.use.colorScheme;
  await page.route(new RegExp(`/${theme}/phone/outbound\\.png$`), async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const cover = page.locator('a[href$="/projects/sinair-llm-bot/"] .project-cover');
    const image = cover.locator("img");
    await expect(cover).toHaveAttribute("data-status", "loading");
    await expect(page.getByText(/Loading projects|Loading preview/)).toHaveCount(0);
    await expect(page.locator(".cover-status, .loading-message")).toHaveCount(0);
    await expect(image).toHaveCSS("opacity", "0");
    const before = await cover.boundingBox();
    release();
    await expect(cover).toHaveAttribute("data-status", "ready");
    await expect(image).toHaveCSS("opacity", "1");
    expect(await image.evaluate((node) => node.complete && node.naturalWidth > 0)).toBe(true);
    expect(await cover.boundingBox()).toEqual(before);
    await expect(image).toHaveCSS("transition-duration", "0.16s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(image).toHaveCSS("transition-duration", "0s");
  } finally {
    release();
  }
});

test("homepage cover state survives rapid theme switches and loading failures", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-light", "Shared cover loading state");
  let release;
  let finish;
  let blocked = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const finished = new Promise((resolve) => { finish = resolve; });
  await page.route(/\/dark\/phone\/outbound\.png$/, async (route) => {
    blocked = true;
    await gate;
    await route.abort();
    finish();
  });
  try {
    await page.goto("/");
    const cover = page.locator('a[href$="/projects/sinair-llm-bot/"] .project-cover');
    const image = cover.locator("img");
    const toggle = page.locator("#theme-toggle");
    await expect(cover).toHaveAttribute("data-status", "ready");
    await toggle.click();
    await expect.poll(() => blocked).toBe(true);
    await expect(cover).toHaveAttribute("data-status", "loading");
    await toggle.click();
    await expect(cover).toHaveAttribute("data-status", "ready");
    release();
    await finished;
    await expect(image).toHaveAttribute("src", /\/light\/phone\/outbound\.png$/);
    await expect(cover).toHaveAttribute("data-status", "ready");
    await toggle.click();
    await expect(cover).toHaveAttribute("data-status", "error");
    await expect(cover.getByRole("status")).toHaveCount(0);
    await expect(image).toHaveCSS("opacity", "0");
    await expect(cover).toHaveAttribute("aria-busy", "false");
    await toggle.click();
    await expect(cover).toHaveAttribute("data-status", "ready");
    await expect(image).toHaveCSS("opacity", "1");
  } finally {
    release();
  }
});

test("card intent warms only the first preview pair for the active theme", async ({ page }, testInfo) => {
  const requests = [];
  page.on("request", (request) => {
    if (/\/messages@\d+\.png$/.test(request.url())) requests.push(request.url());
  });
  await page.goto("/");
  const link = page.locator('a[href$="/projects/sinair-llm-bot/"]');
  await expect(link).toBeVisible();
  expect(requests).toHaveLength(0);
  await link.focus();
  await expect.poll(() => requests.length).toBe(2);
  const theme = testInfo.project.use.colorScheme;
  expect(requests.some((url) => url.endsWith(`/${theme}/desktop/messages@1232.png`))).toBe(true);
  expect(requests.some((url) => url.endsWith(`/${theme}/phone/messages@390.png`))).toBe(true);
  await link.blur();
  await link.focus();
  await link.click();
  await expect(page.locator("#project-views")).toHaveAttribute("aria-busy", "false");
  await expectBothScenes(page, "messages");
});

test("data saving connections skip speculative screenshot downloads", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-light", "Shared connection policy");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" } });
  });
  const previews = [];
  page.on("request", (request) => {
    if (/\/data\/screenshots\//.test(request.url())) previews.push(request.url());
  });
  await page.goto("/");
  const link = page.locator('a[href$="/projects/sinair-llm-bot/"]');
  await link.focus();
  await link.dispatchEvent("pointerenter");
  await link.dispatchEvent("pointerdown");
  expect(previews).toHaveLength(0);
  await link.click();
  await expect(page.locator("#project-views")).toHaveAttribute("aria-busy", "false");
  await expectBothScenes(page, "messages");
});

test("the first pair is visible while sharper images are still loading", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-light", "Shared progressive loading behavior");
  let release;
  let blocked = false;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(/\/light\/desktop\/messages@2464\.png$/, async (route) => {
    blocked = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto(projectPath);
    await expect.poll(() => blocked).toBe(true);
    await expectBothScenes(page, "messages");
    for (const format of ["desktop", "phone"]) {
      const image = page.locator(`.${format}-scroll > img`);
      await expect(image).toBeVisible();
      expect(await image.evaluate((node) => node.complete && node.naturalWidth > 0)).toBe(true);
    }
    await expect(page.locator(".desktop-scroll > img")).toHaveAttribute("src", /messages@1232\.png$/);
    release();
    await expect(page.locator("#project-views")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".desktop-scroll > img")).toHaveAttribute("src", /messages@2464\.png$/);
  } finally {
    release();
  }
});

test("expanded chrome stays visible while scrolling and Close restores focus", async ({ page }) => {
  await openProject(page);
  for (const format of ["desktop", "phone"]) {
    await chooseScene(page, "llm-payloads");
    await expectBothScenes(page, "llm-payloads");
    const trigger = page.locator(`.${format}-scroll`);
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    const close = dialog.getByRole("button", { name: "Close expanded view" });
    await expect(close).toBeFocused();
    const before = await close.boundingBox();
    expect(before.width).toBeGreaterThanOrEqual(44);
    expect(before.height).toBeGreaterThanOrEqual(44);
    await dialog.locator(".expanded-image-region").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(dialog.locator("#expanded-title")).toHaveText("LLM JSON");
    expect((await close.boundingBox()).y).toBe(before.y);
    await page.keyboard.press("Tab");
    await expect(dialog.locator(".expanded-image-region")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test("the side rail and title dismiss the viewer while screenshot clicks keep it open", async ({ page }) => {
  await openProject(page);
  const dialog = page.getByRole("dialog");
  for (const format of ["desktop", "phone"]) {
    const trigger = page.locator(`.${format}-scroll`);
    for (const target of ["rail", "title"]) {
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      await dialog.locator(".expanded-image-region").click({ position: { x: 20, y: 20 } });
      await expect(dialog).toBeVisible();
      if (target === "rail") {
        const rail = dialog.locator(".expanded-header");
        const bounds = await rail.boundingBox();
        await rail.click({ position: { x: 22, y: bounds.height - 10 } });
      } else {
        await dialog.locator("#expanded-title").click();
      }
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  }
});

test("expanded screenshots keep their reading scale in shorter windows", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-light", "Shared expanded image sizing");
  await openProject(page);
  for (const format of ["desktop", "phone"]) {
    const trigger = page.locator(`.${format}-scroll`);
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const image = dialog.locator("img");
    const before = await image.boundingBox();
    await page.setViewportSize({ width: 1440, height: 600 });
    await expect.poll(async () => (await dialog.boundingBox()).height).toBeLessThanOrEqual(600 - 15);
    await expect.poll(async () => (await image.boundingBox()).width).toBe(before.width);
    const region = dialog.locator(".expanded-image-region");
    expect(await region.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await expect(dialog.locator("#expanded-title")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close expanded view" })).toBeVisible();
    const regionBounds = await region.boundingBox();
    expect(regionBounds.height).toBeGreaterThanOrEqual(600 - 19);
    await page.keyboard.press("Escape");
    await page.setViewportSize(testInfo.project.use.viewport);
    await expect(page.locator("#project-views")).toHaveAttribute("aria-busy", "false");
  }
});
