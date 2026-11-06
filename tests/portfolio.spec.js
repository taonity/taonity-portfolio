import { expect, test } from "@playwright/test";

const projectPath = "/projects/sinair-llm-bot/";

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
  await expect(page.locator(".project-card")).toHaveCount(2);
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

test("image-only popups leave space, scroll, navigate by keyboard, and close outside or on Escape", async ({
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
    await expect(dialog.locator("button, a, header, h1, h2, p")).toHaveCount(0);
    expect(
      await dialog.evaluate((node) => getComputedStyle(node).borderTopWidth),
    ).toBe("0px");
    const bounds = await dialog.boundingBox();
    const viewport = testInfo.project.use.viewport;
    expect(bounds.x).toBeGreaterThan(viewport.width * 0.08);
    expect(bounds.y).toBeGreaterThan(viewport.height * 0.08);
    expect(bounds.x + bounds.width).toBeLessThan(viewport.width * 0.92);
    expect(bounds.y + bounds.height).toBeLessThan(viewport.height * 0.92);
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
      await testInfo.attach("Image-only phone popup", {
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
    const width = Math.floor(
      Math.min(
        viewport.width * 0.82,
        frame.format === "phone" ? 460 : 1280,
        originalWidth / ratio,
      ),
    );
    const height = Math.min(
      viewport.height * 0.82,
      (width * frame.sourceHeight) / frame.sourceWidth,
    );
    expect(Math.abs(frame.width - width)).toBeLessThan(1);
    expect(Math.abs(frame.height - height)).toBeLessThan(1);
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
