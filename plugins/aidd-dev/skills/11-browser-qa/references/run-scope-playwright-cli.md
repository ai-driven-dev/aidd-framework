# Playwright CLI runner

Playwright Agent CLI produces WebM evidence without becoming an application dependency.

## Version and invocation

Support `@playwright/cli >= 0.1.17`; execute the framework pin `@playwright/cli@0.1.17`. Upgrade it deliberately, never through `latest` during QA.

```bash
npx --yes @playwright/cli@0.1.17 -s=qa-<run-id> <command>
```

`run-code` takes one `page` argument: pass `async page => { ... }`, never bare statements. Keep stdout, stderr, and exit status visible; no redirects, pipes, command substitutions, or `|| true`. A `SyntaxError` or non-zero exit invalidates the take.

## Recording

- One named session and raw WebM per scenario; viewport and frame `1280×720`.
- Reach the initial state before `video-start`; put every recorded interaction in one `run-code`.
- Never record separate click, fill, or scroll commands.
- Hold the initial and verified final states for `1000 ms`.
- Wait `300 ms` between actions and after each scroll.
- Run `video-stop` only after `run-code` succeeds.

```bash
npx --yes @playwright/cli@0.1.17 -s=qa-<run-id>-<scenario-slug> resize 1280 720
npx --yes @playwright/cli@0.1.17 -s=qa-<run-id>-<scenario-slug> video-start raw-<evidence-name>.webm --size=1280x720
# Replace the locators; omit the scroll block when irrelevant.
npx --yes @playwright/cli@0.1.17 -s=qa-<run-id>-<scenario-slug> run-code 'async page => {
  const pause = milliseconds => page.waitForTimeout(milliseconds);
  await pause(1000);
  await page.getByRole("button", { name: "first action" }).click();
  await pause(300);
  await page.mouse.wheel(0, 600);
  await pause(300);
  await page.getByRole("button", { name: "final action" }).click();
  await page.getByText("observable expected outcome").waitFor({ state: "visible" });
  await pause(1000);
}'
npx --yes @playwright/cli@0.1.17 -s=qa-<run-id>-<scenario-slug> video-stop
npx --yes @playwright/cli@0.1.17 -s=qa-<run-id>-<scenario-slug> close
```

`video-stop` writes to `.playwright-cli/` in the current directory. Name raw files `raw-happy-path.webm` or `raw-edge-case-<scenario-slug>.webm`.

## Duration

Probe each raw take once. Maximum 12 seconds, never a target; do not pad or extend.

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height:format=duration \
  -of json <input.webm>
```

Without `ffmpeg`, only an already-short raw take passes; otherwise report `blocked: media-postprocess-unavailable`.

Never trim the head or infer the first action from scene changes. Inspect both sides of a tail cut; reject one that removes the result or final one-second hold.

```bash
qa_cut_frames=$(mktemp -d)
ffmpeg -v error -ss <cut-minus-0.25-seconds> -i raw-<evidence-name>.webm \
  -frames:v 1 "$qa_cut_frames/before.png"
ffmpeg -v error -ss <cut-plus-0.25-seconds> -i raw-<evidence-name>.webm \
  -frames:v 1 "$qa_cut_frames/after.png"
```

## Normalization

Re-encode without audio. Use only a visually verified tail cut; omit `-to` when unused.

```bash
ffmpeg -y -to <verified-end-seconds> -i raw-<evidence-name>.webm \
  -an -vf "fps=12,scale=1280:-2:force_original_aspect_ratio=decrease" \
  -c:v libvpx-vp9 -crf 36 -b:v 0 <evidence-name>.webm
```

Above 12 seconds, remove non-scenario actions and record again. Never accelerate. Block when the required journey cannot fit.

## Validation

Probe the final file, then inspect four frames per second chronologically.

```bash
qa_final_frames=$(mktemp -d)
ffmpeg -v error -i <evidence-name>.webm -vf "fps=4" \
  "$qa_final_frames/frame-%03d.png"
```

Require:

- codec `vp9`, width `1280`, duration at most 12 seconds;
- initial state, every action and transition, and final result visible;
- initial and final holds spanning at least four sampled frames.

`ffprobe` alone is insufficient. Delete raw takes, cut-point frames, and validation frames only after every final WebM passes both checks.
