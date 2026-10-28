import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { announce } from '@lib/announcer';
import type { BoardMember } from '@lib/boardsApi';
import { fetchTimeline, patchComment, postComment, removeComment } from '@lib/commentsApi';
import {
  type CommentItem,
  type Entry,
  type TimelineItem,
  absoluteTime,
  describeGroup,
  emphasiseMentions,
  groupTimeline,
  nameOf,
  readDraft,
  relativeTime,
  writeDraft,
} from '@lib/timeline';
import { notifyError } from '@lib/toastStore';

import { Avatar } from '../collab/Avatar';
import { RichText } from '../richtext/RichText';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PencilIcon, TrashIcon } from '../ui/Icons';
import { Menu } from '../ui/Menu';
import { CommentComposer } from './CommentComposer';
import './CardTimeline.css';

interface CardTimelineProps {
  cardId: string;
  signature: string;
  meId: string | undefined;
  members: BoardMember[];
  canComment: boolean;
  canModerate: boolean;
}

const FRESH_MS = 1200;
const REFETCH_MS = 250;
const CLOCK_MS = 60_000;

function Stamp({ iso, now, edited }: { iso: string; now: number; edited?: string | null }) {
  return (
    <>
      <time dateTime={iso} title={absoluteTime(iso)}>
        {relativeTime(iso, now)}
      </time>
      {edited && (
        <span className="timeline__edited" title={`Edited ${absoluteTime(edited)}`}>
          {' '}
          · edited
        </span>
      )}
    </>
  );
}

export function CardTimeline({
  cardId,
  signature,
  meId,
  members,
  canComment,
  canModerate,
}: CardTimelineProps) {
  const headingId = useId();
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState(() => readDraft(cardId));
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CommentItem | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);
  const freshTimer = useRef<number>();

  const people = useMemo(
    () => members.map((member) => ({ id: member.user_id, username: member.username })),
    [members]
  );
  const names = useMemo(() => people.map((person) => person.username), [people]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => window.clearTimeout(freshTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        fetchTimeline(cardId)
          .then((next) => {
            if (cancelled) return;
            const known = seen.current;
            if (known) {
              const added = next.filter((item) => !known.has(item.id));
              const others = added.filter(
                (item) => item.type === 'comment' && item.author?.id !== meId
              ).length;
              if (others > 0) {
                announce(others === 1 ? '1 new comment.' : `${others} new comments.`);
              }
              if (added.length > 0) {
                setFresh(new Set(added.map((item) => item.id)));
                window.clearTimeout(freshTimer.current);
                freshTimer.current = window.setTimeout(() => setFresh(new Set()), FRESH_MS);
              }
            }
            seen.current = new Set(next.map((item) => item.id));
            setItems(next);
            setFailed(false);
          })
          .catch(() => {
            if (!cancelled) setFailed(true);
          });
      },
      seen.current === null ? 0 : REFETCH_MS
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cardId, signature, meId]);

  function changeDraft(text: string) {
    setDraft(text);
    writeDraft(cardId, text);
  }

  async function post() {
    const text = draft.trim();
    if (text === '' || posting) return;
    setPosting(true);
    try {
      const created = await postComment(cardId, text);
      seen.current?.add(created.id);
      setItems((current) => [...(current ?? []), created]);
      setFresh(new Set([created.id]));
      window.clearTimeout(freshTimer.current);
      freshTimer.current = window.setTimeout(() => setFresh(new Set()), FRESH_MS);
      changeDraft('');
      announce('Comment posted.');
    } catch (error) {
      notifyError(error, 'The comment could not be posted.');
    } finally {
      setPosting(false);
    }
  }

  async function saveEdit() {
    if (!editing || saving || editing.text.trim() === '') return;
    setSaving(true);
    try {
      const saved = await patchComment(cardId, editing.id, editing.text.trim());
      setItems((current) => (current ?? []).map((item) => (item.id === saved.id ? saved : item)));
      setEditing(null);
      announce('Comment edited.');
    } catch (error) {
      notifyError(error, 'The comment could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    try {
      await removeComment(cardId, target.id);
      seen.current?.delete(target.id);
      setItems((current) => (current ?? []).filter((item) => item.id !== target.id));
      announce('Comment deleted.');
    } catch (error) {
      notifyError(error, 'The comment could not be deleted.');
    }
  }

  const entries: Entry[] = useMemo(() => groupTimeline(items ?? []), [items]);
  const comments = (items ?? []).filter((item) => item.type === 'comment').length;

  return (
    <section className="timeline" aria-labelledby={headingId}>
      <h3 id={headingId} className="timeline__title">
        Activity
        {comments > 0 && (
          <span className="timeline__count">
            {' '}
            · {comments} {comments === 1 ? 'comment' : 'comments'}
          </span>
        )}
      </h3>

      {items === null && !failed && (
        <p className="timeline__quiet" role="status">
          Loading the activity…
        </p>
      )}
      {failed && items === null && (
        <p className="timeline__quiet" role="alert">
          The activity could not be loaded.
        </p>
      )}

      {items !== null && (
        <ol className="timeline__list" aria-label="Activity and comments">
          {entries.map((entry) => {
            if (entry.type === 'events') {
              return (
                <li
                  key={entry.key}
                  className="timeline__event"
                  data-fresh={entry.events.some((event) => fresh.has(event.id)) || undefined}
                >
                  <p>{describeGroup(entry.actor, entry.events)}</p>
                  <span className="timeline__when">
                    <Stamp iso={entry.at} now={now} />
                  </span>
                </li>
              );
            }
            const { comment } = entry;
            const mine = comment.author?.id === meId && meId !== undefined;
            const menu = [
              ...(mine && canComment
                ? [
                    {
                      label: 'Edit',
                      icon: <PencilIcon />,
                      onSelect: () => setEditing({ id: comment.id, text: comment.body }),
                    },
                  ]
                : []),
              ...(mine || canModerate
                ? [
                    {
                      label: 'Delete',
                      icon: <TrashIcon />,
                      tone: 'danger' as const,
                      onSelect: () => setDeleting(comment),
                    },
                  ]
                : []),
            ];
            const isEditing = editing?.id === comment.id;
            return (
              <li
                key={entry.key}
                className="timeline__comment"
                data-fresh={fresh.has(comment.id) || undefined}
                data-mine={mine || undefined}
              >
                <Avatar
                  name={nameOf(comment.author)}
                  seed={comment.author?.id ?? 'gone'}
                  size="sm"
                />
                <div className="timeline__body">
                  <header className="timeline__head">
                    <strong>{nameOf(comment.author)}</strong>
                    <span className="timeline__when">
                      <Stamp iso={comment.created_at} now={now} edited={comment.edited_at} />
                    </span>
                    {menu.length > 0 && !isEditing && (
                      <Menu
                        label={`Actions for the comment by ${nameOf(comment.author)}`}
                        items={menu}
                      />
                    )}
                  </header>
                  {isEditing && editing ? (
                    <CommentComposer
                      value={editing.text}
                      onChange={(text) => setEditing({ id: editing.id, text })}
                      onSubmit={() => void saveEdit()}
                      onCancel={() => setEditing(null)}
                      people={people}
                      label="Edit the comment"
                      submitLabel="Save"
                      busy={saving}
                      autoFocus
                    />
                  ) : (
                    <RichText text={emphasiseMentions(comment.body, names)} headingOffset={3} />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {items !== null && comments === 0 && (
        <p className="timeline__quiet">
          {canComment ? 'No comments yet. Start the discussion.' : 'No comments yet.'}
        </p>
      )}

      {canComment ? (
        <CommentComposer
          value={draft}
          onChange={changeDraft}
          onSubmit={() => void post()}
          people={people}
          label="Write a comment"
          submitLabel="Comment"
          busy={posting}
        />
      ) : (
        <p className="timeline__quiet">You can read this card but not comment on it.</p>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this comment?"
        message="It will be removed for everyone on this card. This cannot be undone."
        confirmLabel="Delete comment"
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
