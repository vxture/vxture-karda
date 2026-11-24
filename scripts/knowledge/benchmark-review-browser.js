// Playwright CLI run-code function. Run only in a fresh, dedicated local session.
// Measures the offline PDF review prototype, not a knowledge API or production SLA.
async (page) => {
  const url = new URL(page.url());
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("local_http_review_required");
  const initial = await page.evaluate(() => ({
    pdf: !document.getElementById("pdf-tools")?.hidden,
    work: typeof dirty === "undefined" || dirty || reviewDrafts.size > 0,
  }));
  if (!initial.pdf || initial.work) throw new Error("fresh_pdf_review_session_required");
  const samples = 30, warmups = 5;
  const errors = [], requests = [];
  const onError = () => errors.push(1);
  const onRequest = request => requests.push(new URL(request.url()).origin);
  page.on("pageerror", onError);
  page.on("request", onRequest);
  const cdp = await page.context().newCDPSession(page);
  const series = [];
  const stats = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { samplesMs: values, medianMs: sorted[Math.ceil(values.length / 2) - 1],
      p95Ms: sorted[Math.ceil(values.length * .95) - 1], maxMs: sorted.at(-1) };
  };
  // Two animation frames are a rendering opportunity proxy, not a pixel-paint or INP metric.
  const rendered = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))));
  const check = async condition => { if (!(await condition())) throw new Error("browser_workload_check_failed"); };
  async function measure(name, setup, action, verify) {
    const values = [];
    for (let i = 0; i < warmups + samples; i++) {
      await setup(i);
      await rendered();
      const start = await page.evaluate(() => performance.now());
      await action(i);
      const end = await rendered();
      await check(verify);
      if (i >= warmups) values.push(end - start);
    }
    series.push({ name, ...stats(values) });
  }
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    const load = [], ready = [], paint = [], bytes = [];
    for (let i = 0; i < samples; i++) {
      await page.reload({ waitUntil: "load" });
      await page.locator("#graph [data-node]").first().waitFor();
      ready.push(await rendered());
      const entry = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0];
        return { load: n.loadEventEnd, bytes: n.encodedBodySize,
          paint: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null };
      });
      load.push(entry.load); bytes.push(entry.bytes);
      if (entry.paint !== null) paint.push(entry.paint);
      await check(async () => (await page.locator("#case-select option").count()) > 0);
    }
    const workload = await page.evaluate(() => ({
      pages: Number(document.getElementById("summary").textContent.match(/(\d+) PDF pages/)[1]),
      chapters: document.getElementById("chapter-filter").options.length - 1,
      cases: document.getElementById("case-select").options.length,
      userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio, viewport: { width: innerWidth, height: innerHeight },
    }));
    const search = page.locator("#search"), chapter = page.locator("#chapter-filter");
    await measure("full_text_all_pages", () => search.fill(""), () => search.fill("PDF page"),
      async () => (await page.locator("#pdf-range").textContent()).endsWith(" / " + workload.pages + " PDF pages")
        && await page.locator("#graph .node.section").count() === Math.min(12, workload.pages));
    await measure("full_text_no_match", () => search.fill(""), () => search.fill("KARDA_BENCHMARK_NO_MATCH_74c91"),
      async () => await page.locator("#empty").isVisible() && await page.locator("#graph [data-node]").count() === 0);
    await search.fill("");
    const groups = await chapter.locator("option").evaluateAll(options => options.slice(1).map(o => o.value));
    let longGroup = null;
    for (const group of groups) {
      await chapter.selectOption(group);
      if (await page.locator("#pdf-next").isEnabled()) { longGroup = group; break; }
    }
    if (!longGroup) throw new Error("multi_window_chapter_required");
    await measure("chapter_page_window", () => chapter.selectOption(longGroup), () => page.locator("#pdf-next").click(),
      async () => (await page.locator("#pdf-range").textContent()).startsWith("13-")
        && await page.locator("#graph .node.section").count() <= 12);
    const cases = page.locator("#case-select"), count = await cases.locator("option").count();
    const answerable = [];
    for (let i = 0; i < count; i++) {
      await cases.selectOption({ index: i });
      if (await page.locator("#supports button").count()) answerable.push(i);
    }
    if (answerable.length < 2) throw new Error("two_answerable_cases_required");
    const evidenceMatches = async last => {
      const support = last ? page.locator("#supports button").last() : page.locator("#supports button").first();
      const expectedPage = (await support.textContent()).match(/page-(\d+)$/)?.[1];
      const selected = await page.locator("#graph .selected").getAttribute("data-node");
      return expectedPage !== undefined && JSON.parse(selected)[1] === "page-" + expectedPage
        && (await page.locator("#detail-links a").getAttribute("href")) === "source.pdf#page=" + expectedPage
        && await page.locator("#excerpt").isVisible();
    };
    await measure("question_and_evidence", i => cases.selectOption({ index: answerable[i % answerable.length] }),
      i => cases.selectOption({ index: answerable[(i + 1) % answerable.length] }),
      () => evidenceMatches(false));
    await measure("evidence_button", i => cases.selectOption({ index: answerable[i % answerable.length] }),
      () => page.locator("#supports button").last().click(),
      () => evidenceMatches(true));
    await check(async () => errors.length === 0 && requests.every(origin => origin === url.origin)
      && await page.evaluate(() => !dirty && reviewDrafts.size === 0));
    return { formatVersion: 1, status: "local_browser_diagnostic_only", measuredAt: new Date().toISOString(),
      workload, methodology: { samples, warmups, concurrency: 1, percentile: "nearest-rank", cache: "browser HTTP cache disabled",
        navigation: "warm browser process, document reload, loopback HTTP; no CPU/network throttling",
        interaction: "browser timestamp before Playwright action through two rAF callbacks; includes driver/actionability overhead",
        rendering: "two rAF callbacks approximate rendering opportunity; not guaranteed pixel presentation or INP" },
      navigation: { loadEventEnd: stats(load), readyAfterTwoFrames: stats(ready),
        firstContentfulPaint: paint.length ? { observedSamples: paint.length, ...stats(paint) } : null,
        encodedBodyBytes: [...new Set(bytes)] }, series, checks: { pageErrors: errors.length, externalRequests: 0 },
      limitations: ["Offline PDF navigation and substring search only; no retrieval API, graph service, model, database or auth.",
        "Not a fresh browser/OS cold start; no service concurrency, WAN/mobile hardware, cost or SLA acceptance.",
        "No business labels, source text, filenames, local paths, receipt decisions or gold promotion are exported.",
        "This measurement cannot close K0b, K3 or approve a proposed performance budget."] };
  } finally {
    page.off("pageerror", onError); page.off("request", onRequest);
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
    await cdp.detach();
  }
}
