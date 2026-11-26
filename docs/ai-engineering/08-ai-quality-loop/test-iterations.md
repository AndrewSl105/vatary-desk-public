# Test iterations: capture, extended feedback, analysis

A closed loop for improving prompts on real traffic. An operator states a hypothesis, the AI
gateway captures every user action that touches the prompts under test, testers say what went
right or wrong, an analysis drafts prompt fixes, and a person decides what ships. The next
iteration is then compared with the previous one.

An iteration never changes routing: it only decides which traffic to keep and look at.

## The iteration

| Field | Meaning |
|---|---|
| name, goal | the hypothesis, e.g. "editing part of a page keeps the document's structure" |
| prompts | the watched prompt names |
| scope | everyone, a list of users, or one user group |
| window | from–to, or until stopped |
| status | draft → live → stopped → archived |
| max cases | capture stops on its own after this many actions |
| previous iteration | the one this iteration is compared against |
| imported | loaded from an export: read-only, never captures |

## Capture

- **A whole action, not a single call.** A case is keyed by the request's correlation id, the one
  id that follows a user action through every service. The router call, the generation, and the
  follow-up calls that arrive shortly after (context extraction, a merge) land in the same case.
- **Best effort, zero cost when idle.** Capture runs after the request is logged and never fails
  the user's call. With nothing live, the path makes no storage calls at all, and responses are
  byte-identical to those before the feature existed.
- **Self-stopping.** An iteration stops when it reaches its case limit or its end time.
- **Retention.** Captured requests are kept for as long as the iteration needs them. In
  production a captured request still never outlives the data-retention period promised in the
  privacy policy; archiving an iteration releases everything it held.
- **Where it runs.** Iterations capture on staging and production. Extended feedback, which may
  include document content, is accepted on staging only; production iterations collect plain
  votes.

## Extended feedback (staging)

When an answer belongs to a live iteration, the gateway marks it in the response, and the app's
👍/👎 opens a detailed form after the plain vote is saved:

- **aspects** from one shared list: what went well (followed the instruction, kept the
  structure, right language…) and what went wrong (wrong place, changed too much, invented
  content…);
- **what the tester expected instead**, in their own words;
- **a snapshot** of what the action saw: the document before and after, or the desk state.

The plain vote is always stored first; a refused extension never loses it. The snapshot is built
by the API from data the caller can read, never uploaded by the client. Images are replaced by
placeholders, the size is capped, and the snapshot reaches the gateway as a presigned link, never
as bytes in the call.

## The console

- **Iterations list**: status, window, cases, votes, the top went-wrong aspects, cost. Under ten
  votes only counts are shown; above that, the 👎 share with its 95 % Wilson interval.
- **One iteration**: live counters, the analysis, and a filterable case table. A case opens a
  timeline of its calls, inputs and outputs, every vote with its aspects, and a before/after
  diff of the document.
- **Export / import**: the whole iteration as JSON or streaming JSONL, prompt texts once per
  version, never keys or settings; every export is audited. An import comes back read-only and
  reproduces the same summary.

## Analysis

Three steps, each an ordinary gateway request with a strict output schema, tagged with the
iteration:

1. **Case review** (map): one call per 👎, per case with a went-wrong aspect or a failed call,
   plus a sample of 👍. The output is a verdict, category, severity, the prompt at fault,
   evidence, root cause and a suggested fix. The cost is estimated before the run, and a budget
   cap is checked before every call.
2. **Report** (reduce): what works, what fails (patterns with counts, severity and example
   cases), improvements ranked by impact, and the conclusions too weak to trust.
3. **Prompt fix** (on demand, per prompt): the rationale, the changes with before/after
   excerpts, and the new text, shown as a diff against the current version.

**Nothing is applied automatically.** A fix opens in the prompt editor as a draft; a person saves
it as a normal version and starts the next iteration from the same goal and scope.

## Comparing iterations

Votes per prompt, aspect counts, latency p50/p95, cost per case, and the prompt versions each side
ran. "B is better" or "worse" is claimed only when the two 95 % Wilson intervals of the 👎 share
do not overlap; under ten votes on a side, the answer is "not enough data".

## Audit and tests

Every create, edit, start, stop, archive, export, import and analysis is audited with who, when
and before → after. A shared conformance suite runs the iteration store against both its
in-memory and SQLite implementations; capture tests cover whole correlation groups, self-stopping,
"nothing live means zero storage calls" and "production never accepts extended feedback".
