# Privacy notes

What LekThik stores, why, for how long, and who can see it. Written for the people who use it and for
whoever runs it. It describes how the code behaves today, so it changes with the code.

## In short

- No advertising, no analytics, no tracking, no cookies other than the session cookie.
- Nothing is requested from another company unless a person presses a button that says so.
- Pictures stay in LekThik's own database, are shown only to members of their workspace, and lose
  their metadata when they are added.
- Deleting content deletes it for good, pictures included.

## What is stored

| What | Why | Who can see it | How long |
| --- | --- | --- | --- |
| Email address, name, scrambled password (Argon2) | Signing in, invitations, notifications | The person, and the members of workspaces they share (name only) | Until the account is deleted |
| Verification and reset codes | Confirming an address, resetting a password | Nobody, they are stored hashed | Minutes, then useless |
| Settings (theme, text size, layout, per board view) | Making the app fit the person | The person | Until the account is deleted |
| Workspaces, boards, lists, cards, labels, notes, links | The work itself | Members of the workspace, by role | Until deleted by a member allowed to |
| Pictures | Image blocks | Members of the workspace | Deleted with their block, board or workspace |
| Embed identifiers (a video or calendar id) | Embed blocks | Members of the workspace | Deleted with their block |

Not stored: what anyone reads, watches or clicks, device fingerprints, locations, or anything about
use that is not part of the work.

## In the browser

LekThik uses the browser's own storage for three things, none of which is sent anywhere:

| Key | What | Needed? |
| --- | --- | --- |
| Session cookie | Keeping a person signed in | Yes, strictly necessary |
| `lekthik.appearance.v1` | A copy of the appearance settings, so the page is drawn right the first time | Convenience, no personal data |
| `lekthik.embeds.v1` | Which outside providers a person chose to load without asking | Only if they chose to |

The choice about outside providers is a record of a consent, kept so it is not asked for again. It can
be withdrawn in Settings, Privacy, as easily as it was given, and it never reaches the server.

## Pictures

- A picture is uploaded to LekThik and kept in its database. It has no public address. It is read back
  only through the API, and only for a signed in member of its workspace.
- The upload is judged by its content, not by its name or the type the browser claims. Only real PNG,
  JPEG and WebP pictures are accepted. SVG is refused because it can carry code.
- The server decodes the picture and writes a new one from its pixels, so every piece of metadata is
  left behind: where it was taken, the camera, the time, the author, thumbnails, and anything hidden
  after the picture data. The way the camera was held is applied first, so the picture is the right
  way up. The result is a JPEG, or a PNG when there is transparency.
- Limits: 5 MB to upload, 25 million pixels to decode, 2048 pixels on the longest side once stored,
  2 MB once stored.
- Alternative text is required, so every picture can be described to someone who cannot see it.
- Deleting the block, its board or its workspace deletes the picture with it (the database does it,
  with `ON DELETE CASCADE`, and it is tested).

## Outside content

Videos, calendars, drawings, designs and pages come from other companies. Loading one tells that
company the reader's address, and may set cookies, which is why it needs the reader's say.

- Until someone presses the button on the placeholder, nothing is requested: no frame, no thumbnail,
  no script, no font. The placeholder says who would receive what.
- Only YouTube (through the `youtube-nocookie.com` address), Vimeo (with `dnt=1`), Google Calendar,
  Excalidraw, Figma and Notion can be added. The server recognises an address and keeps only the
  provider and the identifier. The address of the frame is built from those, so a stored value can
  never point somewhere else. For Notion only a page published to the web at `notion.site` is
  accepted, and for Excalidraw only a shared drawing or room link, whose key is kept with the block
  and so is visible to the members of the workspace.
- The frame is sandboxed, has a title for screen readers, and has no permission to navigate the page.
  Next to it a plain link opens the same content in a new tab, since a provider may refuse to be
  shown inside another page.
- Choosing to load without asking is remembered per provider, in this browser only, and can be
  withdrawn in Settings, Privacy.
- Links are plain links: LekThik fetches nothing from the page, not a preview, not an icon.

If LekThik is served with a Content Security Policy, allow only what the features need:

```
frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://calendar.google.com
  https://excalidraw.com https://www.figma.com https://*.notion.site;
img-src 'self' blob: data:;
```

Maths (KaTeX) and diagrams (Mermaid) are drawn in the browser from code that ships with LekThik, with
its own fonts, so no outside server is asked for them either. Pictures written in Markdown that point to
other sites are never loaded, they are shown as a link, because loading them would give the reader's
address to a stranger.

## Who else touches the data

- The email provider configured by whoever runs LekThik (SMTP), which receives the address and the
  text of an email it sends.
- The host the server and the database run on.
- Providers of embeds, only after a reader asks, as described above.

## Rights

People can correct what they wrote, and delete it. Deleting a block, a board or a workspace removes
its content. Exporting or deleting a whole account is not in the app yet: until it is, whoever runs
LekThik has to do it by hand in the database. This is a known gap, not a choice.

## Security measures

Passwords are hashed with Argon2. Sessions are signed tokens in a cookie the page cannot read. Every
read and write checks the person's role in the workspace, and what a person may not see answers as not
found. Requests are rate limited. Text is never read as HTML, links are limited to web and mail
addresses, and the settings of every kind of block are checked on the server.
