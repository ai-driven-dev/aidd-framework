# 03 - Assert Frontend

Iterate until the frontend behaves as intended by inspecting the running UI, mapping behavior to code, and tracking attempts.

## Input

The expected behavior, from the arguments. The frontend's URL when the caller knows it, otherwise resolved at runtime.

## Output

A pass or fail verdict, with the candidate causes and their fix attempts and results recorded in the tracking file.

## Process

1. **Resolve.** Use the URL the caller gave, otherwise find the running frontend and confirm it responds. Skip this facet with a noted reason when none is running.
2. **Parse.** Extract the visual, functional, and technical requirements from the expected behavior. Trace the action paths, for example a click calls a function in one file that updates state in another.
3. **Inspect.** Open the URL with the project's configured browser tool and navigate to the screen the expected behavior targets. Inspect the page visually and technically, capturing a screenshot of the issue.
4. **Locate.** Explore the codebase for the files behind the issue.
5. **Track.** Fill the tracking file from [task-template.md](../assets/task-template.md) with the three best candidate causes, each with a short description and a confidence level.
6. **Fix.** Take a cause, apply a candidate fix, validate against the expected behavior. On failure, mark it and take the next. When the three are exhausted, add three fresh causes and repeat.
7. **Boundary.** Never start or restart a server. Accept minor visual differences (1 to 2 px, slight color) unless the request specifies otherwise. Confirm every UI change with a screenshot.

## Test

- The tracking file updates on every iteration.
- The final recorded attempt validates as a pass, confirmed by a screenshot taken after it.
