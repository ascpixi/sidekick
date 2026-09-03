# Sidekick Integration Guide

This document is for YSWS program developers who need to implement the master endpoint that Sidekick communicates with. Sidekick is a review and fulfillment interface - your program owns all the data, and Sidekick reads and writes through this protocol.

## Quick Start

Your program exposes a **single HTTP POST endpoint**. Sidekick sends every request to this URL with a JSON body containing an `action` string enum and an `input` object. You authenticate requests using a shared secret key.

```
POST https://your-program.hackclub.com/api/sidekick
Authorization: Bearer sk_a1b2c3...
Content-Type: application/json

{
  "action": "HEALTH_CHECK",
  "input": {}
}
```

You respond with the appropriate JSON for that action:

```json
{ "ok": true, "version": "1.0.0" }
```

On errors, return an appropriate HTTP status code with a JSON body:

```json
{
  "error": "NOT_FOUND",
  "message": "No project found with that ID."
}
```

The rest of this document covers the 14 actions you need to implement, plus three optional actions (`FETCH_AUTHOR_PROJECTS`, `FETCH_USER_NOTE`, and `UPDATE_USER_NOTE`).

## Authentication

Every request includes an `Authorization: Bearer <secret>` header. The secret is the key configured when the program was created in Sidekick. Reject any request where the secret doesn't match.

Sidekick enforces a **30-second timeout** on all requests. If your endpoint can't respond in time (e.g. a slow database query), return a 503.

## Actor Identification

All people in the protocol - project authors, reviewers, commenters - are identified by a single string called an **actor ID**. This is either:

- A **Slack ID** like `U05ABCDEF` (starts with `U`)
- An **HCA identity ID** like `ident!abc123` (starts with `ident!`)

Your program stores whichever identifier it has for each user. Sidekick resolves actor IDs into display names, avatars, and emails on its own - you never need to send that information.

Since YSWS programs authenticate through Hack Club infrastructure, you should have at least one of these identifiers for every participant.

## Domain Model

### Projects

A **project** is the primary entity - the thing a participant is building. It has a title, description, code URL, and an author. Projects persist across multiple submissions.

```json
{
  "id": "some_arbitrary_id_12345",
  "title": "Comet Chat",
  "description": "A real-time messaging app built with WebSockets.",
  "codeUrl": "https://github.com/user/comet-chat",
  "demoUrl": "https://comet-chat.vercel.app",
  "screenshotUrl": "https://your-cdn.com/screenshots/comet-chat.png",
  "authorId": "U05ABCDEF",
  "authorHcaName": "Ada Lovelace",
  "hackatimeId": "12345",
  "hackatimeProjectKeys": ["comet-chat", "comet-chat-v2"],
  "tags": [
    { "label": "First-time", "color": "#3b82f6" },
    { "label": "AI-flagged", "color": "#ef4444" }
  ],
  "ships": [
    {
      "id": "ship_001",
      "hoursSubmitted": 12.5,
      "submittedAt": "2026-05-15T14:30:00Z",
      "status": "approved"
    },
    {
      "id": "ship_002",
      "hoursSubmitted": 8.0,
      "submittedAt": "2026-05-28T10:00:00Z",
      "status": "pending",
      "approveFields": [
        { "name": "grant_amount", "label": "Grant Amount (USD)", "type": "integer", "required": true }
      ],
      "rejectFields": []
    }
  ],
  "metadata": {}
}
```

| Field                  | Type       | Required | Description                                                                                                                                 |
| ---------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | `string`   | Yes      | Your internal project identifier.                                                                                                           |
| `title`                | `string`   | Yes      | Project title.                                                                                                                              |
| `description`          | `string`   | Yes      | Project description.                                                                                                                        |
| `codeUrl`              | `string`   | Yes      | Source code URL (usually GitHub).                                                                                                           |
| `demoUrl`              | `string`   | No       | Live demo URL. Not all projects have one.                                                                                                   |
| `screenshotUrl`        | `string`   | No       | Screenshot or preview image.                                                                                                                |
| `authorId`             | `string`   | Yes      | Slack ID (`U...`) or HCA ID (`ident!...`) of the author.                                                                                    |
| `authorHcaName`        | `string`   | No       | The author's full name as recorded by Hack Club Auth. If your program signs participants in via HCA, send the name you stored at sign-in; Sidekick shows it on the author card next to the Slack-resolved display name. Sidekick never looks this up itself. |
| `hackatimeId`          | `string`   | No       | Hackatime user identifier - Slack ID, HCA ID, or Hackatime numeric ID. If omitted, Sidekick falls back to `authorId` for Hackatime lookups. |
| `hackatimeProjectKeys` | `string[]` | Yes      | Hackatime project keys to aggregate. Empty array if not using Hackatime.                                                                    |
| `hackatimeStartDate`   | `string`   | No       | ISO date (`YYYY-MM-DD`). When set, Sidekick only counts Hackatime activity on or after this date when aggregating hours - send your event's start date so pre-event time on reused Hackatime projects doesn't inflate totals. Omit to count all-time. Also rendered as a cutoff marker in the reviewer's Hackatime day list, with pre-cutoff days dimmed. |
| `ships`                | `Ship[]`   | Yes      | All submissions for this project, ordered chronologically.                                                                                  |
| `tags`                 | `ProjectTag[]` | No   | Colored labels shown on the review queue (see below). Omit or send `[]` for none.                                                            |
| `metadata`             | `object`   | No       | Any program-specific extra data. Sidekick preserves but doesn't interpret it.                                                               |

#### Project Tags

Tags are short, colored labels you attach to a project to surface an attribute right in the reviewer's queue — "First-time submitter", "AI-flagged", "Grant pending", whatever your program tracks. They render GitHub-style on each queue row and on the project's review page. Sidekick never interprets tags; they are purely informational for reviewers.

```json
{ "label": "AI-flagged", "color": "#ef4444" }
```

| Field   | Type     | Required | Description                                                                                                                            |
| ------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `label` | `string` | Yes      | The text shown on the tag. Keep it short — long labels are truncated. Tags with an empty/blank label are dropped.                     |
| `color` | `string` | No       | Hex color (`#rrggbb` or shorthand `#rgb`). Sidekick derives the pill's background, text, and border from it. Omit or send an unparseable value to get a neutral gray. |

Return the same tags on every `FETCH_PROJECTS`, `FETCH_PROJECT_DETAIL`, and `FETCH_AUTHOR_PROJECTS` response so the project looks consistent everywhere it appears.

### Ships

A **ship** is a submission event - each time a participant submits their project for review, that creates a ship. A project can have many ships over its lifetime (initial submission, updates after rejection, new work on an approved project).

| Field            | Type                    | Required | Description                                       |
| ---------------- | ----------------------- | -------- | ------------------------------------------------- |
| `id`             | `string`                | Yes      | Your internal ship identifier.                    |
| `hoursSubmitted` | `number`                | Yes      | Hours the participant claims for this submission. |
| `submittedAt`    | `string`                | Yes      | ISO 8601 timestamp.                               |
| `status`         | `string`                | Yes      | `"pending"`, `"pending_hq"`, `"approved"`, or `"rejected"`. |
| `approveFields`  | `ReviewFieldDefinition[]` | No     | Custom fields to show when approving this ship. If omitted or empty, no extra fields are shown. |
| `rejectFields`   | `ReviewFieldDefinition[]` | No     | Custom fields to show when rejecting this ship. If omitted or empty, no extra fields are shown. |
| `supportsRewardedOverride` | `boolean`     | No     | Advertises that approvals of this ship accept `rewardedHoursOverride` (see below). Default `false`. |

Ships are always embedded inside their parent project - they're never returned as standalone objects.

A project can accumulate **consecutive pending ships** when a participant re-ships (changes something and submits again) before the previous submission was reviewed. Sidekick always reviews the *most recent* pending ship — a review decision covers all work up to it. Keep superseded ships in the `ships` array (and their `"ship"` events in the timeline) so reviewers can see the full history.

#### Rewarded Hours Override

Some programs reward participants for a different number of hours than what lands in the Airtable Unified YSWS DB. If a ship advertises `supportsRewardedOverride: true`, Sidekick lets the reviewer optionally fill in a **rewarded hours override** when approving. When set, it is sent as `rewardedHoursOverride` alongside `hoursAssigned` in `SUBMIT_REVIEW_ACTION` (and carried through `authorize` for two-stage flows). Where and how the override is surfaced (payouts, shop balance, etc.) is entirely up to your program; `hoursAssigned` remains the canonical value for the Unified YSWS DB. Echo the override back on the corresponding `"approval"` timeline events so Sidekick can display it.

#### Review Field Definitions

Ships can declare custom fields that reviewers must fill in when approving or rejecting. This lets programs collect structured data alongside the standard feedback and justification fields. Each field definition describes one input:

```json
{
  "name": "grant_amount",
  "label": "Grant Amount (USD)",
  "type": "integer",
  "required": true,
  "placeholder": "e.g. 100",
  "defaultValue": 50
}
```

| Field          | Type                        | Required | Description                                                                 |
| -------------- | --------------------------- | -------- | --------------------------------------------------------------------------- |
| `name`         | `string`                    | Yes      | Machine-readable key. Used in the submitted `fields` object.                |
| `label`        | `string`                    | Yes      | Human-readable label shown to the reviewer.                                 |
| `type`         | `string`                    | Yes      | `"string"`, `"integer"`, `"boolean"`, or `"markdown"`. `"markdown"` behaves exactly like `"string"` but is rendered as a textarea with Markdown support. |
| `required`     | `boolean`                   | No       | If `true`, the reviewer must fill this field before submitting. Default `false`. |
| `placeholder`  | `string`                    | No       | Placeholder text for string/integer inputs, or description text for boolean checkboxes. |
| `defaultValue` | `string \| number \| boolean` | No     | Initial value pre-filled in the input. Type should match the field's `type`. |

Field values submitted by reviewers are sent as part of the `fields` object in `SUBMIT_REVIEW_ACTION` and `UPDATE_REVIEW_ACTION` (see below). Values are typed according to the field definition: strings for `"string"` and `"markdown"`, numbers for `"integer"`, and booleans for `"boolean"`.

### Shop Items

A **shop item** represents something a program offers: a Raspberry Pi, a domain name, a sticker pack, etc. Sidekick does not store items; your program is the source of truth.

Items have two text fields with distinct audiences:
- **`description`** is user-facing - what the participant sees in the shop ("8GB model with power supply and case").
- **`fulfillerContext`** is staff-facing - instructions for the person fulfilling orders ("Ships from Adafruit. Use HCB grant. Allow 1-2 weeks."). Fulfillers can edit this directly from the Sidekick UI.

```json
{
  "id": "item_rpi5",
  "name": "Raspberry Pi 5",
  "description": "8GB model with power supply and case.",
  "fulfillerContext": "Ships from Adafruit. Use HCB grant for payment. Allow 1-2 weeks.",
  "thumbnailUrl": "https://your-cdn.com/items/rpi5.png",
  "unitPrice": 80.00,
  "metadata": {}
}
```

| Field              | Type     | Required | Description                                                                                                                  |
| ------------------ | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`               | `string` | Yes      | Your internal item identifier.                                                                                               |
| `name`             | `string` | Yes      | Display name.                                                                                                                |
| `description`      | `string` | No       | User-facing item description (Markdown OK). Shown to participants in the shop.                                               |
| `fulfillerContext` | `string` | No       | Staff-facing fulfillment instructions (Markdown OK). Shown only to fulfillers in Sidekick. Updated via `UPDATE_ITEM_FIELDS`. |
| `thumbnailUrl`     | `string` | No       | Item image.                                                                                                                  |
| `unitPrice`        | `number` | No       | Price per unit, if applicable.                                                                                               |
| `metadata`         | `object` | No       | Program-specific extra data.                                                                                                 |

### Orders

An **order** represents a participant earning a specific item. Orders reference a shop item by ID. They are independent of the review system.

```json
{
  "id": "order_789",
  "userId": "U05ABCDEF",
  "userName": "Alice",
  "userEmail": "alice@example.com",
  "userAvatarUrl": "https://avatars.slack.com/...",
  "itemId": "item_rpi5",
  "quantity": 1,
  "totalPrice": 80.00,
  "status": "pending",
  "reference": "https://hcb.hackclub.com/grants/abc123",
  "adminNotes": "Shipped via FedEx, tracking #123456",
  "userNotes": "Your Raspberry Pi has been shipped! Expect delivery in 3-5 days.",
  "createdAt": "2026-05-20T09:00:00Z",
  "metadata": {}
}
```

| Field           | Type     | Required | Description                                                                                |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| `id`            | `string` | Yes      | Your internal order identifier.                                                            |
| `userId`        | `string` | Yes      | User identifier.                                                                           |
| `userName`      | `string` | Yes      | User's display name.                                                                       |
| `userEmail`     | `string` | Yes      | User's email address.                                                                      |
| `userAvatarUrl` | `string` | No       | User's avatar.                                                                             |
| `itemId`        | `string` | Yes      | References a `ShopItem.id`.                                                                |
| `quantity`      | `number` | Yes      | Number of items.                                                                           |
| `totalPrice`    | `number` | No       | Total order price, if applicable.                                                          |
| `status`        | `string` | Yes      | `"pending"`, `"fulfilled"`, or `"cancelled"`.                                              |
| `reference`     | `string` | No       | External reference - tracking ID, HCB grant URL, or any identifier. Not necessarily a URL. |
| `adminNotes`    | `string` | No       | Per-order notes written by fulfillers. Updated via `UPDATE_ORDER_FIELDS`.                  |
| `userNotes`     | `string` | No       | Per-order notes visible to the user who placed the order. Updated via `UPDATE_ORDER_FIELDS`. |
| `createdAt`     | `string` | Yes      | ISO 8601 timestamp.                                                                        |
| `fulfilledAt`   | `string` | No       | ISO 8601 timestamp, if fulfilled.                                                          |
| `metadata`      | `object` | No       | Program-specific extra data.                                                               |

### User Notes

A **user note** is a single free-form internal note attached to a *user* — not to a project, ship, or review. Reviewers use it to carry context about a participant across all of their projects and submissions ("Hackatime setup was broken until June, expect low logged hours before then"). Notes are only ever shown to reviewers, never the participant.

User notes are an **optional feature**. A program advertises support by implementing the `FETCH_USER_NOTE` and `UPDATE_USER_NOTE` actions; if `FETCH_USER_NOTE` returns the usual `INVALID_ACTION` error, Sidekick hides the note UI entirely. Because notes are per-user, do **not** model them as a custom review field (`approveFields`/`rejectFields`) — review fields are scoped to a single approval or rejection and would silently fork the note per review.

### Timeline Events

The **timeline** is the chronological history of a project - submissions, reviews, and comments. Each event has a `type` that determines its shape.

All events carry an `actorId` (the person who performed the action) and a `timestamp`. Ship, approval, and rejection events also carry the `shipId` they relate to.

**`"ship"` - a submission**

```json
{
  "type": "ship",
  "shipId": "ship_002",
  "actorId": "U05ABCDEF",
  "hoursSubmitted": 8.0,
  "changes": [
    {
      "field": "description",
      "label": "Description",
      "oldValue": "A real-time messaging app.",
      "newValue": "A real-time messaging app built with WebSockets and Redis.",
      "diffType": "text"
    },
    {
      "field": "demoUrl",
      "label": "Demo URL",
      "oldValue": "https://old-demo.example.com",
      "newValue": "https://new-demo.example.com",
      "diffType": "url"
    }
  ],
  "displayFields": [
    {
      "label": "Change description",
      "value": "Added Redis-backed presence and fixed reconnect handling."
    },
    {
      "label": "Reviewer note",
      "value": "Second submission after the demo URL fix - compare against ship_001.",
      "isInternal": true
    }
  ],
  "timestamp": "2026-05-28T10:00:00Z"
}
```

| Field                | Type     | Required | Description                                                                                |
| -------------------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| `changes`            | `array`  | No       | Project fields that changed since the previous ship. Omit or send `[]` for the first ship. |
| `changes[].field`    | `string` | Yes      | The field key that changed.                                                                |
| `changes[].label`    | `string` | Yes      | Human-readable field name for display.                                                     |
| `changes[].oldValue` | `string` | Yes      | Previous value. Use `""` for empty/null.                                                   |
| `changes[].newValue` | `string` | Yes      | New value. Use `""` for empty/null.                                                        |
| `changes[].diffType` | `string` | Yes      | Rendering hint: `"text"`, `"url"`, or `"image"`.                                           |
| `displayFields`      | `array`  | No       | Arbitrary label/value pairs to display on the ship event, e.g. a change description written by the participant or a note for reviewers. |
| `displayFields[].label` | `string` | Yes    | Human-readable label for the field.                                                        |
| `displayFields[].value` | `string` | Yes    | The field's content. Plain text; URLs are auto-linked.                                     |
| `displayFields[].isInternal` | `boolean` | No | If `true`, the field is reviewer-only and rendered with internal styling. Default `false` (public - the participant may see it in your program's own UI). |

Recognized fields and their `diffType`:

| Field           | `label`         | `diffType` |
| --------------- | --------------- | ---------- |
| `title`         | `"Title"`       | `"text"`   |
| `description`   | `"Description"` | `"text"`   |
| `demoUrl`       | `"Demo URL"`    | `"url"`    |
| `codeUrl`       | `"Code URL"`    | `"url"`    |
| `screenshotUrl` | `"Screenshot"`  | `"image"`  |

Sidekick renders `"text"` changes as inline old→new values, `"url"` the same way with link formatting, and `"image"` as before/after thumbnails. Only include fields that actually changed. The first ship for a project should have no changes (omit the field or send `[]`).

**`"approval"` - a reviewer approved a ship**

```json
{
  "type": "approval",
  "shipId": "ship_001",
  "actorId": "ident!reviewer456",
  "hoursAssigned": 10.0,
  "feedbackMessage": "Great work on the WebSocket implementation!",
  "justification": "Verified commits, Hackatime logs match claimed hours.",
  "fields": { "grant_amount": 100 },
  "timestamp": "2026-05-17T16:45:00Z"
}
```

| Field             | Type     | Required | Description                                                           |
| ----------------- | -------- | -------- | --------------------------------------------------------------------- |
| `hoursAssigned`   | `number` | Yes      | Hours the reviewer granted (may differ from claimed).                 |
| `hoursDeflated`   | `number` | No       | Hours reduced due to deflation, if any.                               |
| `rewardedHoursOverride` | `number` | No | Rewarded hours override the reviewer submitted with this approval, if any. |
| `feedbackMessage` | `string` | Yes      | Feedback shown to the participant.                                    |
| `justification`   | `string` | Yes      | Internal reasoning (visible to other reviewers, not the participant). |
| `fields`          | `object` | No       | Custom field values from the review. Keys match `ReviewFieldDefinition.name`. |

**`"discarded_approval"` (optional) - an approval that was discarded before finalizing**

Programs with a two-stage review flow can emit this for a first-pass approval that was sent back (deauthorized) before it finalized, so the timeline keeps the record and attributes the discard to the right person. Programs that don't emit it get a synthesized fallback: Sidekick renders an `approval` event whose ship is no longer `approved`/`pending_hq` as discarded, but can then only guess who discarded it.

```json
{
  "type": "discarded_approval",
  "id": "ret:review_789",
  "shipId": "ship_002",
  "actorId": "ident!reviewer456",
  "discardedByActorId": "U05HQMEMBER",
  "hoursAssigned": 10.0,
  "feedbackMessage": "Great work on the WebSocket implementation!",
  "justification": "Verified commits, Hackatime logs match claimed hours.",
  "timestamp": "2026-05-30T09:00:00Z"
}
```

| Field                 | Type     | Required | Description                                                           |
| --------------------- | -------- | -------- | --------------------------------------------------------------------- |
| `id`                  | `string` | Yes      | Stable identifier for the discarded approval.                         |
| `actorId`             | `string` | Yes      | The reviewer who made the original approval.                          |
| `discardedByActorId`  | `string` | Yes      | Who discarded/deauthorized the approval.                              |
| `hoursAssigned`       | `number` | Yes      | Hours the original approval assigned.                                 |
| `rewardedHoursOverride` | `number` | No     | Rewarded hours override from the original approval, if any.           |
| `feedbackMessage`     | `string` | Yes      | Feedback from the original approval.                                  |
| `justification`       | `string` | Yes      | Internal justification from the original approval.                    |
| `fields`              | `object` | No       | Custom field values from the original approval.                       |

**`"rejection"` - a reviewer rejected a ship**

```json
{
  "type": "rejection",
  "shipId": "ship_002",
  "actorId": "ident!reviewer456",
  "feedbackMessage": "The demo link is broken. Please fix and resubmit.",
  "fields": {},
  "timestamp": "2026-05-29T11:00:00Z"
}
```

| Field             | Type     | Required | Description                              |
| ----------------- | -------- | -------- | ---------------------------------------- |
| `feedbackMessage` | `string` | Yes      | Feedback shown to the participant.       |
| `internalMessage` | `string` | No       | Internal-only notes for other reviewers. |
| `fields`          | `object` | No       | Custom field values from the review. Keys match `ReviewFieldDefinition.name`. |

**`"comment"` - a comment on the project**

```json
{
  "type": "comment",
  "actorId": "ident!reviewer456",
  "message": "Can you add a README with setup instructions?",
  "isInternal": false,
  "timestamp": "2026-05-29T11:05:00Z"
}
```

| Field        | Type      | Required | Description                                                           |
| ------------ | --------- | -------- | --------------------------------------------------------------------- |
| `message`    | `string`  | Yes      | The comment body.                                                     |
| `isInternal` | `boolean` | Yes      | `true` = only visible to reviewers. `false` = visible to participant. |


## Actions Reference

### `HEALTH_CHECK`

Verify that your endpoint is reachable. This is called when a program is created or when a user clicks "Test" in the Sidekick UI.

**Input:** `{}`

**Response:**
```json
{ "ok": true, "version": "1.0.0" }
```

`version` is optional. Return whatever helps you identify the deployed version.


### `GET_PROGRAM_STATS`

Return aggregate counts for the Sidekick dashboard.

**Input:** `{}`

**Response:**
```json
{
  "pendingReviewCount": 12,
  "pendingHqCount": 5,
  "pendingFulfillmentCount": 34
}
```

`pendingReviewCount` is the number of projects with at least one `"pending"` ship. `pendingHqCount` is the number of ships with status `"pending_hq"` (awaiting HQ authorization). `pendingFulfillmentCount` is the number of orders with status `"pending"`.

### `FETCH_PROJECTS`

Return a paginated list of projects with their embedded ships.

**Input:**
```json
{
  "status": "pending",
  "cursor": null,
  "limit": 50
}
```

| Field    | Type     | Required | Default   | Description                                                                                                                     |
| -------- | -------- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `status` | `string` | No       | all       | Filter: return projects that have at least one ship with this status. Values: `"pending"`, `"pending_hq"`, `"approved"`, `"rejected"`, `"all"`. |
| `cursor` | `string` | No       |           | Opaque pagination cursor from a previous response.                                                                              |
| `limit`  | `number` | No       | up to you | Maximum number of projects to return.                                                                                           |

**Response:**
```json
{
  "projects": [ ... ],
  "nextCursor": "eyJpZCI6MTAwfQ",
  "totalCount": 47,
  "explicitlySorted": false
}
```

`totalCount` is the total number of matching projects (not just this page). `nextCursor` is present only if there are more pages.

#### Sort Hints

By default Sidekick sorts each queue by earliest pending-ship submission date, so the longest-waiting projects float to the top. If your program already orders projects the way it wants them reviewed (a custom priority, a triage score, round-robin across reviewers, …), set `explicitlySorted: true` and Sidekick will **preserve the order you return** instead of applying its own sort.

| Field              | Type      | Required | Description                                                                                                                                                                                    |
| ------------------ | --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `explicitlySorted` | `boolean` | No       | When `true`, Sidekick renders `projects` in the exact order received and does not re-sort. Omit or send `false` to let Sidekick sort. Applies per status query (e.g. `pending` vs `pending_hq`). |

The hint is honored across pagination: Sidekick concatenates pages in `nextCursor` order and keeps that combined order. Because a single query can span multiple pages, set `explicitlySorted` consistently on **every** page of a given status query.

### `FETCH_PROJECT_DETAIL`

Return a single project by ID, with all its ships.

**Input:**
```json
{ "projectId": "proj_abc123" }
```

**Response:** A full `Project` object. Return HTTP 404 if not found.

### `FETCH_PROJECT_TIMELINE`

Return the full chronological event history for a project.

**Input:**
```json
{ "projectId": "proj_abc123" }
```

**Response:**
```json
{
  "events": [
    { "type": "ship", "shipId": "ship_001", "actorId": "U05ABCDEF", "hoursSubmitted": 12.5, "timestamp": "2026-05-15T14:30:00Z" },
    { "type": "approval", "shipId": "ship_001", "actorId": "ident!reviewer456", "hoursAssigned": 10.0, "feedbackMessage": "...", "justification": "...", "timestamp": "2026-05-17T16:45:00Z" },
    { "type": "ship", "shipId": "ship_002", "actorId": "U05ABCDEF", "hoursSubmitted": 8.0, "changes": [{ "field": "demoUrl", "label": "Demo URL", "oldValue": "https://old.example.com", "newValue": "https://new.example.com", "diffType": "url" }], "timestamp": "2026-05-28T10:00:00Z" }
  ]
}
```

Return events in **chronological order** (oldest first). The `changes` field on ship events is optional - see the Timeline Events section for details.

### `FETCH_AUTHOR_PROJECTS` (optional)

Return all projects by a given author. Sidekick uses this to show reviewers the author's other projects in your program alongside the one under review.

This action is **optional** - if your program doesn't implement it, return the usual `INVALID_ACTION` error and Sidekick simply hides the "Other Projects" section.

**Input:**
```json
{
  "authorId": "U05ABCDEF",
  "excludeProjectId": "proj_abc123"
}
```

| Field              | Type     | Required | Description                                                            |
| ------------------ | -------- | -------- | ----------------------------------------------------------------------- |
| `authorId`         | `string` | Yes      | Slack ID (`U...`) or HCA ID (`ident!...`) of the author.               |
| `excludeProjectId` | `string` | No       | Project to omit from the results - usually the one currently under review. |

**Response:**
```json
{
  "projects": [ ... ]
}
```

`projects` contains full `Project` objects (same shape as `FETCH_PROJECTS`), ships included. Return an empty array if the author has no other projects.

### `FETCH_USER_NOTE` (optional)

Return the internal reviewer note stored for a user. Sidekick shows it on the user card next to the project under review.

This action is **optional** - if your program doesn't implement it, return the usual `INVALID_ACTION` error and Sidekick hides the user-note UI. Programs that implement it must implement `UPDATE_USER_NOTE` too.

**Input:**
```json
{ "userId": "U05ABCDEF" }
```

| Field    | Type     | Required | Description                                          |
| -------- | -------- | -------- | ---------------------------------------------------- |
| `userId` | `string` | Yes      | Slack ID (`U...`) or HCA ID (`ident!...`) of the user. |

**Response:**
```json
{ "note": "Hackatime setup was broken until June - expect low logged hours before then." }
```

`note` is `null` when no note is stored. Return `{ "note": null }` for unknown users rather than an error - Sidekick may ask about users your program hasn't stored yet.

### `UPDATE_USER_NOTE` (optional)

Create, replace, or clear the note on a user. Sidekick always sends the full note text - this is a whole-note replacement, not an append.

**Input:**
```json
{
  "userId": "U05ABCDEF",
  "note": "Hackatime setup was broken until June - expect low logged hours before then.",
  "editorId": "ident!reviewer456"
}
```

| Field      | Type              | Required | Description                                                     |
| ---------- | ----------------- | -------- | --------------------------------------------------------------- |
| `userId`   | `string`          | Yes      | Slack ID (`U...`) or HCA ID (`ident!...`) of the user.          |
| `note`     | `string \| null`  | Yes      | The new note. `null` (or an empty string) clears it.            |
| `editorId` | `string`          | Yes      | Actor ID of the reviewer making the edit, for your audit trail. |

**Response:** `{ "success": true }`

Return HTTP 404 if the user is unknown - unlike reads, a write to a user your program has never seen cannot be satisfied.

### `SUBMIT_REVIEW_ACTION`

Submit a review decision or comment. Sidekick calls this when a reviewer approves, rejects, or comments on a ship. Your program should persist the action and update the ship's status accordingly.

The `action` field determines which other fields are present:

**Approve:**
```json
{
  "shipId": "ship_002",
  "reviewerId": "ident!reviewer456",
  "action": "approve",
  "hoursAssigned": 7.5,
  "rewardedHoursOverride": 10,
  "feedbackMessage": "Looks good! Nice use of WebSockets.",
  "justification": "Hackatime logs verified, 8h claimed, 0.5h AI-generated code deducted.",
  "isHq": true,
  "fields": { "grant_amount": 75 }
}
```

The `fields` object is optional. If the ship declared `approveFields`, the values submitted by the reviewer are included here. Keys match the `name` from each `ReviewFieldDefinition`. Omit `fields` entirely if there are no custom fields or none were filled.

`rewardedHoursOverride` is optional and only ever sent for ships that advertise `supportsRewardedOverride` (see the Ships section). When present, the program should reward the author for that many hours instead of `hoursAssigned`; `hoursAssigned` stays the canonical value for the Unified YSWS DB. When absent, no override was given - reward the assigned hours as usual.

`isHq` indicates whether the reviewer has HQ authorization powers. If your program uses the two-stage review flow, an approval with `"isHq": true` should **bypass the `pending_hq` stage** and finalize the ship as `"approved"` immediately; `"isHq": false` should move it to `"pending_hq"` to await authorization. Programs without a two-stage flow can ignore this field.

**Reject:**
```json
{
  "shipId": "ship_002",
  "reviewerId": "ident!reviewer456",
  "action": "reject",
  "feedbackMessage": "The demo link returns a 404. Please deploy and resubmit.",
  "internalMessage": "Suspicious commit pattern - might want a closer look next time.",
  "isHq": false,
  "fields": { "ban_user": false }
}
```

As with approvals, `fields` is optional and carries values from the ship's `rejectFields` definitions. `isHq` is informational for rejections (they take effect immediately either way) - use it for auditing if you care who rejected with HQ powers.

**Comment (visible to participant):**
```json
{
  "shipId": "ship_002",
  "reviewerId": "ident!reviewer456",
  "action": "comment",
  "commentText": "Can you add a README?"
}
```

**Internal comment (visible only to reviewers):**
```json
{
  "shipId": "ship_002",
  "reviewerId": "ident!reviewer456",
  "action": "internal_comment",
  "commentText": "Checking if this participant has submissions in other programs."
}
```

**Authorize (HQ approval of a `pending_hq` ship):**
```json
{
  "shipId": "ship_002",
  "reviewerId": "ident!hqreviewer789",
  "action": "authorize",
  "hoursAssigned": 7.0,
  "justification": "Spot-checked commits and Hackatime logs; hours look right."
}
```

Finalizes a ship in `"pending_hq"` status, transitioning it to `"approved"`. If `hoursAssigned` is present, the program should use that value instead of the original reviewer's hours. If omitted, the program should use the hours from the original reviewer approval. Only valid for ships with status `"pending_hq"`.

`rewardedHoursOverride` may also be present on `authorize` - Sidekick carries it over from the original reviewer's approval when the ship supports overrides. The same semantics as on `approve` apply.

`justification` is the authorizer's internal reasoning. Sidekick always sends it - if the authorizer didn't write one, a canned default is substituted - so programs that require a justification on their audit-approval records (e.g. Beest) can rely on it being present.

**Deauthorize (revert a `pending_hq` ship back to pending):**
```json
{
  "shipId": "ship_002",
  "reviewerId": "ident!hqreviewer789",
  "action": "deauthorize",
  "message": "Hours look inflated relative to the commit history - please take another look."
}
```

Reverts a ship from `"pending_hq"` back to `"pending"` so it can be re-reviewed. Only valid for ships with status `"pending_hq"`.

`message` is feedback for the original reviewer explaining why their approval was sent back. Sidekick always sends it, substituting a canned default if the authorizer didn't write one.

**Response** (all variants):
```json
{
  "success": true,
  "event": { "type": "approval", "shipId": "ship_002", "actorId": "ident!reviewer456", "..." : "..." }
}
```

Return the created `TimelineEvent` so Sidekick can update its UI immediately.

When a ship is approved or rejected, your program must update that ship's `status` field so subsequent `FETCH_PROJECTS` calls reflect the change.

### `UPDATE_REVIEW_ACTION`

Edit the messages on an existing approval or rejection. Sidekick calls this when a reviewer edits the feedback or internal notes on a past review decision inline from the timeline. This does **not** change the ship's status.

Assigned hours are editable in exactly one situation: an approval whose ship is still `pending_hq`. When an HQ reviewer edits such a pending approval, Sidekick includes `hoursAssigned`, and your program must persist it so a later `authorize` sent *without* hours finalizes the edited value. Hour edits on finalized approvals are invalid - reject them with a 400 rather than silently ignoring the field, since payouts derived from the original hours may already have happened.

`rewardedHoursOverride` follows the same `pending_hq`-only rule: it is only sent while the ship is `pending_hq`, and a `null` value clears a previously-set override (the author is rewarded the assigned hours). Persist it so a later `authorize` finalizes the edited override.

The `type` field determines which fields are present:

**Edit an approval:**
```json
{
  "shipId": "ship_001",
  "reviewerId": "ident!reviewer456",
  "type": "approval",
  "feedbackMessage": "Updated: Great work on the WebSocket implementation! Fixed a typo.",
  "justification": "Updated: Verified commits, Hackatime logs match claimed hours. Added context about AI usage.",
  "fields": { "grant_amount": 80 }
}
```

**Edit a rejection:**
```json
{
  "shipId": "ship_002",
  "reviewerId": "ident!reviewer456",
  "type": "rejection",
  "feedbackMessage": "Updated: The demo link is broken. Please fix and resubmit.",
  "internalMessage": "Added: Also noticed some copied code from a tutorial.",
  "fields": { "ban_user": true }
}
```

| Field             | Type     | Required      | Description                                |
| ----------------- | -------- | ------------- | ------------------------------------------ |
| `shipId`          | `string` | Yes           | The ship whose review is being edited.     |
| `reviewerId`      | `string` | Yes           | Actor ID of the reviewer making the edit.  |
| `type`            | `string` | Yes           | `"approval"` or `"rejection"`.             |
| `feedbackMessage` | `string` | Yes           | Updated feedback (visible to participant). |
| `justification`   | `string` | Approval only | Updated internal justification.            |
| `hoursAssigned`   | `number` | No            | Updated assigned hours (approval only). Only sent while the ship is `pending_hq`; must be persisted so a later `authorize` without hours uses it. Reject hour edits on finalized approvals. |
| `rewardedHoursOverride` | `number \| null` | No | Updated rewarded hours override (approval only). Same `pending_hq`-only semantics as `hoursAssigned`; `null` clears the override. |
| `internalMessage` | `string` | No            | Updated internal note (rejection only).    |
| `fields`          | `object` | No            | Updated custom field values. Keys match `ReviewFieldDefinition.name`. |

**Response:** `{ "success": true }`

Your program should update the corresponding timeline event's text fields in place. The `reviewerId` identifies which reviewer's action to update (in case multiple reviewers have acted on the same ship).

### `FETCH_SHOP_ITEMS`

Return all shop items defined in your program. Sidekick uses this to configure card grant templates and display item metadata in the management interface.

**Input:** `{}`

**Response:**
```json
{
  "items": [
    {
      "id": "item_rpi5",
      "name": "Raspberry Pi 5",
      "description": "8GB model with power supply and case.",
      "fulfillerContext": "Ships from Adafruit. Use HCB grant for payment.",
      "thumbnailUrl": "https://your-cdn.com/items/rpi5.png",
      "unitPrice": 80.00,
      "metadata": {}
    },
    {
      "id": "item_domain",
      "name": ".com Domain",
      "unitPrice": 10.00
    }
  ]
}
```

Return every item your program offers, regardless of whether any orders exist for it. Each item follows the `ShopItem` schema documented above. The `items` array may be empty if your program has no shop items.

### `FETCH_ORDERS`

Return a paginated list of orders.

**Input:**
```json
{
  "status": "pending",
  "filterItemId": "item_rpi5",
  "searchUser": "alice",
  "sortBy": "date",
  "sortOrder": "desc",
  "limit": 50
}
```

| Field          | Type     | Required | Default      | Description                                                                         |
| -------------- | -------- | -------- | ------------ | ----------------------------------------------------------------------------------- |
| `status`       | `string` | No       | all          | `"pending"`, `"fulfilled"`, `"cancelled"`, or `"all"`.                              |
| `filterItemId` | `string` | No       |              | Only return orders for this shop item ID.                                           |
| `searchUser`   | `string` | No       |              | Filter by user name or email (substring match).                                     |
| `cursor`       | `string` | No       |              | Pagination cursor.                                                                  |
| `limit`        | `number` | No       | up to you    | Max orders to return.                                                               |
| `sortBy`       | `string` | No       | `"date"`     | Sort field: `"id"`, `"user"`, `"item"`, `"quantity"`, `"date"`, or `"status"`.      |
| `sortOrder`    | `string` | No       | `"asc"`      | Sort direction: `"asc"` or `"desc"`.                                                |

Sort field mapping: `"id"` → order ID, `"user"` → user name, `"item"` → item name (requires joining with shop items), `"quantity"` → order quantity, `"date"` → `createdAt` timestamp, `"status"` → order status. Sorting must be applied **before** pagination — the cursor must reflect the chosen sort order.

**Response:**
```json
{
  "orders": [ ... ],
  "items": {
    "item_rpi5": { "id": "item_rpi5", "name": "Raspberry Pi 5", "unitPrice": 80.00, "fulfillerContext": "Ships from Adafruit.", "..." : "..." },
    "item_domain": { "id": "item_domain", "name": ".com Domain", "..." : "..." }
  },
  "nextCursor": "abc",
  "totalCount": 150
}
```

The `items` map is keyed by item ID and contains every `ShopItem` referenced by the returned orders. This avoids duplicating item data across orders. Note that `fulfillerContext` on items is staff-facing (shared across all orders for an item), while `adminNotes` on individual orders is per-order.

### `FETCH_ORDER_DETAIL`

Return a single order with its associated shop item.

**Input:** `{ "orderId": "order_789" }`

**Response:**
```json
{
  "order": { "id": "order_789", "itemId": "item_rpi5", "..." : "..." },
  "item": { "id": "item_rpi5", "name": "Raspberry Pi 5", "..." : "..." }
}
```

Return HTTP 404 if the order is not found.

### `REVEAL_ORDER_ADDRESS`

Return the shipping address for an order. **This action is audited** - Sidekick logs every call with the requesting user's identity, the order ID, and a timestamp. Only call this when actively fulfilling.

**Input:** `{ "orderId": "order_789" }`

**Response:**
```json
{
  "firstName": "Alice",
  "lastName": "Smith",
  "line1": "212 Battery St",
  "line2": "Apt 4B",
  "city": "Burlington",
  "stateProvince": "VT",
  "postalCode": "05401",
  "country": "US",
  "phoneNumber": "+1-555-0123"
}
```

All fields are strings. `line2`, `stateProvince`, and `phoneNumber` are optional.

**Error semantics.** Sidekick distinguishes two failure modes:

- **No address on file** - the user never provided one. Return HTTP **404** (e.g. `{ "error": "NOT_FOUND", "message": "No address on file." }`). Sidekick shows "No shipping address on file".
- **Address temporarily unavailable** - an address exists (or may exist) but you can't retrieve it right now, e.g. your HCA tokens are expired. Return HTTP **503**, or any status with the error code `ADDRESS_UNAVAILABLE`:

```json
{
  "error": "ADDRESS_UNAVAILABLE",
  "message": "HCA tokens expired; address vault unreachable."
}
```

Sidekick treats this as transient - it tells the fulfiller to retry later instead of reporting the order as having no address.

### `UPDATE_ORDER_STATUS`

Change an order's status (e.g. mark as fulfilled).

**Input:**
```json
{
  "orderId": "order_789",
  "newStatus": "fulfilled",
  "reference": "https://hcb.hackclub.com/grants/abc123"
}
```

`reference` is optional - use it for tracking links, HCB grant URLs, etc.

**Response:** `{ "success": true }`

### `UPDATE_ORDER_FIELDS`

Update editable fields on an order without changing its status.

**Input:**
```json
{
  "orderId": "order_789",
  "reference": "USPS-123456789",
  "adminNotes": "Shipped via USPS Priority. Expected delivery 6/10.",
  "userNotes": "Your order has shipped! Tracking: USPS-123456789"
}
```

| Field        | Type     | Required | Description                                                            |
| ------------ | -------- | -------- | ---------------------------------------------------------------------- |
| `orderId`    | `string` | Yes      | The order to update.                                                   |
| `reference`  | `string` | No       | External reference (tracking ID, HCB grant link, etc.).                |
| `adminNotes` | `string` | No       | Per-order notes for fulfillers.                                        |
| `userNotes`  | `string` | No       | Per-order notes visible to the user who placed the order.              |

All fields except `orderId` are optional - only include the fields you want to update.

**Response:** `{ "success": true }`

### `UPDATE_ITEM_FIELDS`

Update staff-facing fields on a shop item. Changes apply across all orders for this item.

**Input:**
```json
{
  "itemId": "item_rpi5",
  "fulfillerContext": "Ships from Adafruit. Use HCB grant for payment. Allow 1-2 weeks."
}
```

| Field              | Type     | Required | Description                                                       |
| ------------------ | -------- | -------- | ----------------------------------------------------------------- |
| `itemId`           | `string` | Yes      | The item to update.                                               |
| `fulfillerContext` | `string` | No       | Fulfillment instructions visible to all fulfillers (Markdown OK). |

**Response:** `{ "success": true }`

## Pagination

All list endpoints (`FETCH_PROJECTS`, `FETCH_ORDERS`) use **cursor-based pagination**:

1. First request: omit `cursor`.
2. If the response has `nextCursor`, pass it as `cursor` in the next request.
3. When `nextCursor` is absent, you've reached the end.

Cursors are **opaque strings**. Don't parse, modify, or construct them. They may expire at your discretion.

## Error Handling

Return standard HTTP status codes:

| Code | When                                                 |
| ---- | ---------------------------------------------------- |
| 200  | Success.                                             |
| 400  | Bad input (missing required fields, invalid values). |
| 401  | Invalid or missing secret key.                       |
| 404  | Project, ship, or order not found.                   |
| 500  | Internal server error.                               |
| 503  | Temporarily unavailable.                             |

Error response body:
```json
{
  "error": "NOT_FOUND",
  "message": "No project found with ID proj_xyz."
}
```

Common error codes: `INVALID_ACTION`, `NOT_FOUND`, `UNAUTHORIZED`, `VALIDATION_ERROR`, `INTERNAL_ERROR`.

## Minimal Implementation Example

Here's a skeleton in TypeScript (Express-style) showing the routing structure:

```typescript
app.post("/api/sidekick", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${SIDEKICK_SECRET}`) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid secret." });
  }

  const { action, input } = req.body;

  switch (action) {
    case "HEALTH_CHECK":
      return res.json({ ok: true, version: "1.0.0" });

    case "GET_PROGRAM_STATS":
      return res.json({
        pendingReviewCount: await db.projects.count({ "ships.status": "pending" }),
        pendingFulfillmentCount: await db.orders.count({ status: "pending" }),
      });

    case "FETCH_PROJECTS": {
      // input.status, input.cursor, input.limit
      const projects = await fetchProjects(input);
      return res.json(projects);
    }

    case "FETCH_PROJECT_DETAIL": {
      const project = await db.projects.findById(input.projectId);
      if (!project) return res.status(404).json({ error: "NOT_FOUND", message: "Project not found." });
      return res.json(project);
    }

    case "FETCH_PROJECT_TIMELINE": {
      const events = await db.timelineEvents.find({ projectId: input.projectId }).sort({ timestamp: 1 });
      return res.json({ events });
    }

    case "SUBMIT_REVIEW_ACTION": {
      // input.shipId, input.reviewerId, input.action, ...
      const event = await processReviewAction(input);
      return res.json({ success: true, event });
    }

    case "UPDATE_REVIEW_ACTION": {
      // input.shipId, input.reviewerId, input.type, input.feedbackMessage, ...
      await updateReviewAction(input);
      return res.json({ success: true });
    }

    case "FETCH_SHOP_ITEMS": {
      const items = await db.shopItems.find();
      return res.json({ items });
    }

    // ... FETCH_ORDERS, FETCH_ORDER_DETAIL, REVEAL_ORDER_ADDRESS,
    //     UPDATE_ORDER_STATUS, UPDATE_ORDER_FIELDS, UPDATE_ITEM_FIELDS

    default:
      return res.status(400).json({ error: "INVALID_ACTION", message: `Unknown action: ${action}` });
  }
});
```

The key thing to get right: when `SUBMIT_REVIEW_ACTION` is called with `action: "approve"` or `action: "reject"`, update the corresponding ship's `status` field in your database so that `FETCH_PROJECTS` reflects the change immediately.
