# Image moderation

Every photo on a submission is checked before the submission can be published
without a human looking at it. The check lives in `lib/imageModeration.ts` and
is wired into `app/api/submissions/route.ts` right after the photos are stored.

## The rule

A submission auto-publishes only when **all** of these hold:

1. the quality checks in `lib/autoApprove.ts` pass (photo, GPS inside Greenwich,
   known problem type, 20+ character description);
2. the text passes the profanity filter in `lib/contentCheck.ts`;
3. **every stored photo passes image moderation** (new).

Anything else goes to the review queue with one-tap approve/reject by email and
the reasons shown on the admin dashboard. Image moderation never rejects a
submission; the admin always makes that call.

| Situation | Outcome | Reason shown to the admin |
|---|---|---|
| `OPENAI_API_KEY` unset and the submission has photos | queued | `Image moderation not configured` |
| Provider returns non-2xx, network error, malformed body | queued | `Image moderation unavailable (OpenAI 401)` etc. |
| Provider does not answer within 5 s (`MODERATION_TIMEOUT_MS`) | queued | `Image moderation unavailable (timed out after 5000 ms)` |
| Any photo trips a failing category | queued | `Photo 2 flagged by image moderation (sexual, violence/graphic)` |
| Every photo passes | eligible for auto-approval | – |
| No photos | moderation is a no-op | (already queued by `autoApprove`: "No photo attached") |

The safe default is the first row: with no key configured, **nothing with a
photo is ever auto-published**. The site keeps working; the admin just reviews
everything until the key is set.

The upload path is otherwise unchanged. Photos are stored in the
`submission-photos` bucket before moderation runs, exactly as before, so a
queued photo is reachable by its random, unlisted URL while it waits for
review. That was already true of every pending submission.

## Provider: OpenAI omni-moderation

One request per photo, in parallel, each under the same 5 s timeout, to
`POST https://api.openai.com/v1/moderations` with model `omni-moderation-latest`
and the photo as a base64 data URL image item. Request and response shapes
follow <https://developers.openai.com/api/docs/guides/moderation>. The
moderation endpoint is free to use with any OpenAI API key.

Per OpenAI's docs only six categories are scored for images: `sexual`,
`violence`, `violence/graphic`, `self-harm`, `self-harm/intent`,
`self-harm/instructions`. The text-only categories (`hate`, `harassment`,
`illicit`, `sexual/minors` and their sub-categories) come back as 0 for an
image-only input. They are still in the failing set so that a model update
which starts scoring them for images is handled without a code change.

A photo fails a category when the provider's own boolean flag is set **or** the
category score reaches the threshold. Thresholds can only tighten the
provider's calibration, never loosen it below the provider flag.

Default thresholds (`DEFAULT_THRESHOLDS` in `lib/imageModeration.ts`):

| Category | Threshold | | Category | Threshold |
|---|---|---|---|---|
| sexual | 0.4 | | self-harm | 0.4 |
| sexual/minors | 0.1 | | self-harm/intent | 0.3 |
| violence | 0.7 | | self-harm/instructions | 0.3 |
| violence/graphic | 0.5 | | illicit | 0.5 |
| hate | 0.5 | | illicit/violent | 0.3 |
| hate/threatening | 0.3 | | harassment | 0.5 |
| harassment/threatening | 0.3 | | | |

They are deliberately conservative for a public gallery of utility poles: a
false positive costs the admin one tap, a false negative is an offensive photo
on a civic site. `violence` is the loosest because downed wires, sparks and
storm damage can score there without being graphic.

HEIC never reaches the server from the form (`lib/compressImage.ts` re-encodes
to JPEG on the phone). A HEIC posted directly to the API is accepted by
quarantine, rejected by OpenAI, and therefore queued, which is the intended
outcome.

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `OPENAI_API_KEY` | no | Enables the provider. Unset = everything with photos queues for review. |
| `IMAGE_MODERATION_THRESHOLDS` | no | JSON object of category → number in [0, 1], merged over the defaults, e.g. `{"violence":0.8}`. Unknown categories and bad values are ignored with a warning; malformed JSON falls back to the defaults. Never breaks an upload. |

Enable in production from the linked repo directory, then redeploy so the new
env var is picked up:

```bash
vercel env add OPENAI_API_KEY production --scope practicalsystems-projects
```

```bash
vercel redeploy greenwichutilitywatch.org --scope practicalsystems-projects
```

(or Vercel → project → Deployments → ⋯ → Redeploy on the current production
deployment; a redeploy rebuilds with the new env var, a promote does not).
Add the key to Preview as well if previews should moderate.

## Where the reasons go

`app/api/submissions/route.ts` collects every auto-approval failure into one
list. For a queued submission that list is:

- emailed to the admin in the pending alert (`lib/email.ts`, "Why it needs review");
- stored on the row in `submissions.review_reasons` (`text[]`, migration
  `20261015140000_review_reasons.sql`) and shown on the dashboard's pending
  cards and in the review modal under "Why queued".

The column is admin-only: the anon column grant from `20261014000002` was not
extended, so the public key cannot read it. If the code deploys before the
migration is applied, the insert retries without the column (PostgREST
`PGRST204` / Postgres `42703`) and logs a warning; the email still carries the
reasons.

## Adding another provider

Implement `ImageModerationProvider` (`name` + `moderate(image, signal)`),
return a verdict rather than throwing, honour the abort signal, and return it
from `getImageModerationProvider()`. `moderateImages()` and the route do not
change. Tests for the decision logic and the OpenAI adapter (mocked `fetch`)
are in `__tests__/lib/imageModeration.test.ts`.
