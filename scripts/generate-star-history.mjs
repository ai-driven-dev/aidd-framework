#!/usr/bin/env node
// Renders the repository's star history as an SVG on stdout, from the GitHub
// stargazers API. Since June 30 2026 that API only answers a repository's own
// admins and collaborators, which killed the third-party chart services the
// README used to embed. Running it here, with the repository's own credentials,
// is the only way left to keep a live chart.
//
//   GH_TOKEN=$(gh auth token) node scripts/generate-star-history.mjs > star-history.svg
//
// The output is deterministic: identical star data yields identical bytes, so a
// scheduled run that finds no new star produces no commit. Nothing renders the
// current date, and no <style> or <script> is emitted, because GitHub strips
// both when it serves an SVG into a README.

const REPO = process.env.GITHUB_REPOSITORY ?? "ai-driven-dev/framework";
const TOKEN = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

const WIDTH = 800;
const HEIGHT = 400;
const MARGIN = { top: 28, right: 24, bottom: 40, left: 60 };
const MAX_POINTS = 200;
const X_TICKS = 5;
const Y_TICKS = 4;

const AXIS_COLOR = "#8b949e";
const GRID_COLOR = "#8b949e40";
const LINE_COLOR = "#e3b341";
const AREA_COLOR = "#e3b34126";

const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

async function fetchStarDates() {
  const dates = [];
  let url = `https://api.github.com/repos/${REPO}/stargazers?per_page=100`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.github.star+json",
        "x-github-api-version": "2022-11-28",
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
    }

    for (const { starred_at } of await response.json()) {
      if (starred_at) dates.push(Date.parse(starred_at));
    }

    url = nextPage(response.headers.get("link"));
  }

  return dates.sort((a, b) => a - b);
}

function nextPage(linkHeader) {
  return linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
}

// A cumulative curve of N stars is N points; every chart is 800px wide. Keeping
// one point per pixel at most holds the file small without any visible loss.
function sample(dates) {
  if (dates.length <= MAX_POINTS) {
    return dates.map((date, index) => ({ date, count: index + 1 }));
  }

  const step = (dates.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => {
    const index = Math.round(i * step);
    return { date: dates[index], count: index + 1 };
  });
}

// Rounds a tick step up to the next 1, 2 or 5 x 10^k, so labels read as round
// numbers instead of arbitrary fractions of the total.
function niceStep(rawStep) {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const rounded = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return rounded * magnitude;
}

function buildSvg(points) {
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const total = points[points.length - 1].count;
  const span = Math.max(lastDate - firstDate, 1);

  const x = (date) => MARGIN.left + ((date - firstDate) / span) * PLOT_WIDTH;
  const y = (count) => MARGIN.top + PLOT_HEIGHT - (count / total) * PLOT_HEIGHT;
  const round = (value) => Math.round(value * 10) / 10;

  const curve = points.map((p) => `${round(x(p.date))},${round(y(p.count))}`).join(" ");
  const baseline = MARGIN.top + PLOT_HEIGHT;

  const yStep = niceStep(total / Y_TICKS);
  const yTicks = [];
  for (let count = 0; count <= total; count += yStep) yTicks.push(count);

  const xTicks = Array.from({ length: X_TICKS }, (_, i) => firstDate + (span * i) / (X_TICKS - 1));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" font-family="sans-serif" font-size="12">
<title>Star history of ${REPO}: ${total} stars</title>
${yTicks
  .map(
    (count) =>
      `<line x1="${MARGIN.left}" y1="${round(y(count))}" x2="${MARGIN.left + PLOT_WIDTH}" y2="${round(y(count))}" stroke="${GRID_COLOR}" />` +
      `<text x="${MARGIN.left - 10}" y="${round(y(count)) + 4}" fill="${AXIS_COLOR}" text-anchor="end">${count}</text>`,
  )
  .join("\n")}
${xTicks
  .map((date, index) => {
    // The edge labels are anchored inwards, otherwise half of each sits outside the viewBox.
    const anchor = index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle";
    return `<text x="${round(x(date))}" y="${baseline + 20}" fill="${AXIS_COLOR}" text-anchor="${anchor}">${new Date(date).toISOString().slice(0, 7)}</text>`;
  })
  .join("\n")}
<polygon points="${round(MARGIN.left)},${baseline} ${curve} ${round(x(lastDate))},${baseline}" fill="${AREA_COLOR}" />
<polyline points="${curve}" fill="none" stroke="${LINE_COLOR}" stroke-width="2" stroke-linejoin="round" />
<text x="${MARGIN.left}" y="${MARGIN.top - 12}" fill="${AXIS_COLOR}">${REPO} · ${total} stars</text>
</svg>
`;
}

const dates = await fetchStarDates();

if (dates.length < 2) {
  throw new Error(`${REPO} has ${dates.length} dated star(s); nothing to chart.`);
}

process.stdout.write(buildSvg(sample(dates)));
