import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnnouncer } from '@lib/announcer';
import * as api from '@lib/commentsApi';
import type { TimelineItem } from '@lib/timeline';
import { useToastStore } from '@lib/toastStore';

import { CardTimeline } from './CardTimeline';

vi.mock('@lib/commentsApi');

const members = [
  { user_id: 'me', username: 'maya' },
  { user_id: 'wen', username: 'wen' },
  { user_id: 'max', username: 'max' },
];

const created: TimelineItem = {
  type: 'activity',
  id: 'a1',
  actor: { id: 'me', username: 'maya' },
  kind: 'created',
  subject: null,
  from: null,
  to: 'To do',
  created_at: '2026-10-28T09:00:00Z',
};

const theirs: TimelineItem = {
  type: 'comment',
  id: 'c1',
  card_id: 'card',
  author: { id: 'wen', username: 'wen' },
  body: 'Thanks @maya, **done**',
  created_at: '2026-10-28T09:30:00Z',
  edited_at: null,
};

const mine: TimelineItem = {
  type: 'comment',
  id: 'c2',
  card_id: 'card',
  author: { id: 'me', username: 'maya' },
  body: 'On it',
  created_at: '2026-10-28T09:40:00Z',
  edited_at: '2026-10-28T09:45:00Z',
};

function setup(
  options: { canComment?: boolean; canModerate?: boolean; items?: TimelineItem[] } = {}
) {
  vi.mocked(api.fetchTimeline).mockResolvedValue(options.items ?? [created, theirs, mine]);
  return render(
    <CardTimeline
      cardId="card"
      signature="a"
      meId="me"
      members={members}
      canComment={options.canComment ?? true}
      canModerate={options.canModerate ?? false}
    />
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  useAnnouncer.setState({ message: '', tick: 0 });
  useToastStore.setState({ toasts: [] });
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CardTimeline', () => {
  it('shows what happened and what was said, with the author and an edited marker', async () => {
    setup();

    expect(await screen.findByText('maya created this card in To do.')).toBeInTheDocument();
    expect(screen.getByText('wen')).toBeInTheDocument();
    expect(screen.getByText('On it')).toBeInTheDocument();
    expect(screen.getByText(/· edited/)).toBeInTheDocument();
    expect(screen.getByText('2 comments', { exact: false })).toBeInTheDocument();
    expect(document.querySelectorAll('time[datetime]').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('No comments yet. Start the discussion.')).toBeNull();
  });

  it('highlights the people who are mentioned, as text and not as markup', async () => {
    setup({
      items: [{ ...theirs, body: 'Hi @max <img src=x onerror=alert(1)>' } as TimelineItem],
    });

    expect(await screen.findByText('@max', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
  });

  it('invites a first comment when there is none', async () => {
    setup({ items: [created] });

    expect(await screen.findByText('No comments yet. Start the discussion.')).toBeInTheDocument();
  });

  it('tells a reader they can read but not write, and offers no composer', async () => {
    setup({ canComment: false, items: [created, theirs] });

    expect(
      await screen.findByText('You can read this card but not comment on it.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Write a comment')).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions for the comment/ })).toBeNull();
  });

  it('says so when the activity cannot be loaded', async () => {
    vi.mocked(api.fetchTimeline).mockRejectedValue(new Error('offline'));
    render(
      <CardTimeline
        cardId="card"
        signature="a"
        meId="me"
        members={members}
        canComment
        canModerate={false}
      />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('The activity could not be loaded.');
  });
});

describe('posting', () => {
  it('posts with the button, trims nothing itself, clears the draft and announces it', async () => {
    setup();
    vi.mocked(api.postComment).mockResolvedValue({
      type: 'comment',
      id: 'c3',
      card_id: 'card',
      author: { id: 'me', username: 'maya' },
      body: 'Ship it',
      created_at: '2026-10-28T10:00:00Z',
      edited_at: null,
    });
    await screen.findByText('On it');

    fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'Ship it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(await screen.findByText('Ship it')).toBeInTheDocument();
    expect(api.postComment).toHaveBeenCalledWith('card', 'Ship it');
    expect(screen.getByLabelText('Write a comment')).toHaveValue('');
    expect(window.localStorage.getItem('lekthik.comment-draft.card')).toBeNull();
    expect(useAnnouncer.getState().message).toBe('Comment posted.');
  });

  it('posts with Ctrl+Enter and not with Enter', async () => {
    setup();
    vi.mocked(api.postComment).mockResolvedValue({
      type: 'comment',
      id: 'c3',
      card_id: 'card',
      author: { id: 'me', username: 'maya' },
      body: 'Quick one',
      created_at: '2026-10-28T10:00:00Z',
      edited_at: null,
    });
    await screen.findByText('On it');
    const field = screen.getByLabelText('Write a comment');

    fireEvent.change(field, { target: { value: 'Quick one' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(api.postComment).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(api.postComment).toHaveBeenCalledWith('card', 'Quick one'));
  });

  it('keeps what was typed as a draft for this card, and puts it back', async () => {
    const { unmount } = setup();
    await screen.findByText('On it');

    fireEvent.change(screen.getByLabelText('Write a comment'), {
      target: { value: 'Half a thought' },
    });
    unmount();
    setup();

    await screen.findByText('On it');
    expect(screen.getByLabelText('Write a comment')).toHaveValue('Half a thought');
  });

  it('does not post an empty comment, and shows the error when posting fails', async () => {
    setup();
    vi.mocked(api.postComment).mockRejectedValue(new Error('Too many comments per minute'));
    await screen.findByText('On it');

    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'Spam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
        'Too many comments per minute'
      )
    );
    expect(screen.getByLabelText('Write a comment')).toHaveValue('Spam');
  });
});

describe('editing and deleting', () => {
  async function openMenu(name: RegExp) {
    fireEvent.click(await screen.findByRole('button', { name }));
  }

  it('lets the author edit their own comment only', async () => {
    setup();
    vi.mocked(api.patchComment).mockResolvedValue({
      ...(mine as Extract<TimelineItem, { type: 'comment' }>),
      body: 'On it, fixed',
      edited_at: '2026-10-28T10:05:00Z',
    });

    expect(screen.queryByRole('button', { name: /comment by wen/ })).toBeNull();
    await openMenu(/Actions for the comment by maya/);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const field = await screen.findByLabelText('Edit the comment');
    expect(field).toHaveValue('On it');

    fireEvent.change(field, { target: { value: 'On it, fixed' } });
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(screen.queryByLabelText('Edit the comment')).toBeNull());
    expect(await screen.findByText('On it, fixed')).toBeInTheDocument();
    expect(api.patchComment).toHaveBeenCalledWith('card', 'c2', 'On it, fixed');
  });

  it('puts the text back on Escape and does not save', async () => {
    setup();
    await openMenu(/Actions for the comment by maya/);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const field = await screen.findByLabelText('Edit the comment');

    fireEvent.change(field, { target: { value: 'Changed my mind' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(await screen.findByText('On it')).toBeInTheDocument();
    expect(api.patchComment).not.toHaveBeenCalled();
  });

  it('asks before deleting and removes the comment', async () => {
    setup();
    vi.mocked(api.removeComment).mockResolvedValue();
    await openMenu(/Actions for the comment by maya/);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete this comment?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete comment' }));

    await waitFor(() => expect(screen.queryByText('On it')).toBeNull());
    expect(api.removeComment).toHaveBeenCalledWith('card', 'c2');
  });

  it('lets an admin delete a comment they did not write, but not edit it', async () => {
    setup({ canModerate: true });

    await openMenu(/Actions for the comment by wen/);

    expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
  });
});

describe('mentions', () => {
  async function typeInto(text: string) {
    setup();
    await screen.findByText('On it');
    const field = screen.getByLabelText('Write a comment') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: text, selectionStart: text.length } });
    field.setSelectionRange(text.length, text.length);
    fireEvent.keyUp(field, { key: 'a' });
    return field;
  }

  it('suggest members after an @, announce how many match and complete with Enter', async () => {
    const field = await typeInto('Ping @m');

    const list = await screen.findByRole('listbox', { name: 'People to mention' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['@max', '@maya']);
    expect(screen.getByText(/2 people match/)).toBeInTheDocument();
    expect(field).toHaveAttribute(
      'aria-activedescendant',
      within(list).getAllByRole('option')[0].id
    );

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(within(list).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(field).toHaveValue('Ping @maya ');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(api.postComment).not.toHaveBeenCalled();
  });

  it('close on Escape without clearing the text', async () => {
    const field = await typeInto('Ping @w');
    await screen.findByRole('listbox');

    fireEvent.keyDown(field, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field).toHaveValue('Ping @w');
  });

  it('are not offered for an unknown name, or in the middle of a word', async () => {
    await typeInto('mail me@w');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('live updates', () => {
  it('announce comments written by other people, once, and never ones written by me', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.mocked(api.fetchTimeline).mockResolvedValue([created, theirs]);
    const view = render(
      <CardTimeline
        cardId="card"
        signature="a"
        meId="me"
        members={members}
        canComment
        canModerate={false}
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    vi.mocked(api.fetchTimeline).mockResolvedValue([
      created,
      theirs,
      { ...theirs, id: 'c9', body: 'Another' } as TimelineItem,
      { ...mine, id: 'c10', body: 'Mine' } as TimelineItem,
    ]);
    view.rerender(
      <CardTimeline
        cardId="card"
        signature="b"
        meId="me"
        members={members}
        canComment
        canModerate={false}
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(useAnnouncer.getState().message).toBe('1 new comment.');
    expect(screen.getByText('Another')).toBeInTheDocument();
  });
});
