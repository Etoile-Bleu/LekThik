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
| Comments on cards | Talking about the work | Members of the workspace | Until deleted by their author or an admin, or with the card |
| History of a card (who moved, renamed, dated, labelled or assigned it, and when) | Knowing how the work got here | Members of the workspace | The latest 200 lines of a card, or until the card is deleted |
| Custom fields of a board and the values filled in on its cards (text, number, date, choice, checkbox, link) | Describing the work beyond title and labels | Members of the workspace | Values: until changed, or with the card or the field. Fields: until deleted by an admin |
| Pictures | Image blocks | Members of the workspace | Deleted with their block, board or workspace |
| Votes in a poll (which option a member chose) | Deciding together | Counts for the members of the workspace; names only when the poll shows them | Until withdrawn, or deleted with the account, the poll or the board |
| Embed identifiers (a video or calendar id) | Embed blocks | Members of the workspace | Deleted with their block |

Not stored: what anyone reads, watches or clicks, device fingerprints, locations, or anything about
use that is not part of the work.

## Comments and history

- A comment is plain text written in Markdown. It is never read as HTML, so a pasted `<script>` is
  shown as the text it is. It holds at most 5000 characters, a card at most 500 comments, and one
  person at most 20 a minute.
- The history records the changes of a card (a rename with the old and new title, a move with the two
  lists, a date, a label with its name, an assignment with the person). It does not record what was
  read or looked at, the text of a description, nor the content of comments.
- Editing a description over and over writes one line for ten minutes, and only the latest 200 lines
  of a card are kept.
- When an account is deleted, its comments and the lines of history it caused stay, because they are
  part of other people's conversation, but they lose their author and are shown as written by a
  deleted user. The database does this on its own (`ON DELETE SET NULL`), and it is tested.
- A mention only highlights a name in the text. It sends nothing to the person.
- A comment being written is kept as a draft in the browser (`lekthik.comment-draft.<card>`) so it is
  not lost, and removed when the comment is posted. It never reaches the server before that.

## In the browser

LekThik uses the browser's own storage for three things, none of which is sent anywhere:

| Key | What | Needed? |
| --- | --- | --- |
| Session cookie | Keeping a person signed in | Yes, strictly necessary |
| `lekthik.appearance.v1` | A copy of the appearance settings, so the page is drawn right the first time | Convenience, no personal data |
| `lekthik.comment-draft.<card>` | A comment that was started and not posted yet | Convenience, removed when posted |
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

### Weather in a clocks block

A clocks block can show the weather of one place. Time zones are worked out by the browser from its own
data and ask no one. The weather is the only part that goes out, and it follows the same rule as the
frames above.

- Nothing is requested until someone presses Show the weather, under a notice that says Open-Meteo
  will receive their IP address and the position. The choice can be remembered per device and
  withdrawn in Settings, Privacy.
- Choosing the place is a search on Open-Meteo, sent only when the button is pressed, with a notice
  in the dialog. The block keeps the name and a position rounded to hundredths of a degree, about a
  kilometre, never more precise.
- Requests carry no cookies and no referrer, and Open-Meteo sets no cookie in return. Answers are
  checked for shape before they are used and kept in memory for fifteen minutes.
- Open-Meteo asks for attribution, which the block shows, and its free service is meant for
  non-commercial use.

If LekThik is served with a Content Security Policy, allow only what the features need:

```
frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://calendar.google.com
  https://excalidraw.com https://www.figma.com https://*.notion.site;
connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com;
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
its content.

**Export.** Settings, Privacy, "Download my data" gives one JSON file with the profile (email, name,
creation date), display preferences, workspace memberships, assigned cards, comments written and
poll votes cast. It never holds the password hash, a session, a code or anything about other people
beyond the titles of the cards and boards you worked on. The answer is not cached, and the route is
limited to a few requests an hour.

**Deletion.** Settings, Privacy, "Delete my account" asks for the password and for the username
typed again. Then the login, preferences, memberships, assignments, poll votes and any invitations
it sent are removed. Comments and history lines written stay for the team, without an author. A
workspace you own alone is deleted with the account. A workspace you own that other people still use
blocks the deletion until you choose to delete it too, because ownership cannot be transferred yet;
the dialog lists them and asks. The session cookie is cleared, but a copy of a signed token stays
accepted by the server until it expires, and it matches no account any more, so it opens nothing.

## Security measures

Passwords are hashed with Argon2. Sessions are signed tokens in a cookie the page cannot read. Every
read and write checks the person's role in the workspace, and what a person may not see answers as not
found. Requests are rate limited. Text is never read as HTML, links are limited to web and mail
addresses, and the settings of every kind of block are checked on the server.
