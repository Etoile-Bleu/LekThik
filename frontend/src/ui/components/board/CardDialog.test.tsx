import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleBoardView } from '../../../test/fixtures';
import { BoardMetaProvider } from '@hooks/useBoardMeta';

vi.mock('@lib/boardsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/boardsApi')>();
  return {
    ...actual,
    fetchCard: vi.fn(),
    updateCard: vi.fn(),
    moveCard: vi.fn(),
    deleteCard: vi.fn(),
    setCardLabels: vi.fn(),
    setCardAssignees: vi.fn(),
  };
});

import * as api from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import { DEFAULT_PREFERENCES } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';
import { useToastStore } from '@lib/toastStore';

import { CardDialog } from './CardDialog';

const detail = {
  id: 'c1',
  list_id: 'todo',
  title: 'Write the spec',
  description: 'Cover the happy path',
  label_ids: ['urgent'],
  assignee_ids: [],
  due_date: null,
};

function setup(onClose = vi.fn(), onManageLabels = vi.fn()) {
  vi.mocked(api.fetchCard).mockResolvedValue(detail);
  render(<CardDialog cardId="c1" onClose={onClose} onManageLabels={onManageLabels} />);
  return { onClose, onManageLabels };
}

describe('CardDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastStore.setState({ toasts: [] });
    useBoardStore.setState({ view: sampleBoardView(), status: 'ready', freshIds: [] });
    usePrefsStore.setState({ prefs: DEFAULT_PREFERENCES, loaded: true, saveState: 'idle' });
  });

  it('shows the card with its list, description and labels', async () => {
    setup();

    const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });
    expect(
      within(dialog).getByRole('heading', { level: 2, name: /Write the spec/ })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('To do', { selector: 'strong' })).toBeInTheDocument();
    expect(await within(dialog).findByText('Cover the happy path')).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /Urgent/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Low/ })).not.toBeChecked();
  });

  it('saves the description when the field loses focus', async () => {
    vi.mocked(api.updateCard).mockResolvedValueOnce({ ...detail, description: 'New details' });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit description' }));
    const field = screen.getByRole('textbox', { name: 'Description' });
    expect(field).toHaveValue('Cover the happy path');

    fireEvent.change(field, { target: { value: 'New details' } });
    fireEvent.blur(field);

    await waitFor(() =>
      expect(api.updateCard).toHaveBeenCalledWith('c1', { description: 'New details' })
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('does not call the api when the description did not change', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit description' }));
    const field = screen.getByRole('textbox', { name: 'Description' });

    fireEvent.blur(field);

    expect(api.updateCard).not.toHaveBeenCalled();
  });

  it('attaches and detaches labels', async () => {
    vi.mocked(api.setCardLabels).mockResolvedValue({ label_ids: [] });
    setup();
    const low = await screen.findByRole('checkbox', { name: /Low/ });

    fireEvent.click(low);
    await waitFor(() => expect(api.setCardLabels).toHaveBeenCalledWith('c1', ['urgent', 'low']));

    fireEvent.click(screen.getByRole('checkbox', { name: /Urgent/ }));
    await waitFor(() => expect(api.setCardLabels).toHaveBeenLastCalledWith('c1', ['low']));
  });

  it('moves the card to another list without dragging', async () => {
    vi.mocked(api.moveCard).mockResolvedValueOnce(undefined);
    setup();
    await screen.findByRole('dialog', { name: 'Card Write the spec' });

    fireEvent.change(screen.getByRole('combobox', { name: 'List' }), { target: { value: 'done' } });
    expect(screen.getByRole('combobox', { name: 'Position' })).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Move card' }));

    await waitFor(() => expect(api.moveCard).toHaveBeenCalledWith('c1', 'done', 0));
  });

  it('keeps the move button disabled until the position changes', async () => {
    setup();
    await screen.findByRole('dialog', { name: 'Card Write the spec' });

    expect(screen.getByRole('button', { name: 'Move card' })).toBeDisabled();
  });

  describe('description', () => {
    it('is drawn as Markdown, with headings below the title of the card', async () => {
      vi.mocked(api.fetchCard).mockResolvedValue({
        ...detail,
        description: '# Plan\n\nSome **bold** words',
      });
      render(<CardDialog cardId="c1" onClose={vi.fn()} onManageLabels={vi.fn()} />);

      expect(await screen.findByRole('heading', { level: 3, name: 'Plan' })).toBeInTheDocument();
      expect(screen.getByText('bold').tagName).toBe('STRONG');
    });

    it('keeps raw HTML in a description as text', async () => {
      vi.mocked(api.fetchCard).mockResolvedValue({
        ...detail,
        description: '<img src=x onerror=alert(1)> hello',
      });
      render(<CardDialog cardId="c1" onClose={vi.fn()} onManageLabels={vi.fn()} />);

      await screen.findByText(/hello/);
      expect(document.querySelector('img')).toBeNull();
    });

    it('ticks a checklist box straight from the card and saves it', async () => {
      vi.mocked(api.fetchCard).mockResolvedValue({
        ...detail,
        description: '- [ ] write the spec\n- [ ] review it',
      });
      vi.mocked(api.updateCard).mockResolvedValue({
        ...detail,
        description: '- [x] write the spec\n- [ ] review it',
      });
      render(<CardDialog cardId="c1" onClose={vi.fn()} onManageLabels={vi.fn()} />);

      fireEvent.click(await screen.findByRole('checkbox', { name: /write the spec/ }));

      await waitFor(() =>
        expect(api.updateCard).toHaveBeenCalledWith('c1', {
          description: '- [x] write the spec\n- [ ] review it',
        })
      );
    });

    it('goes back to what was saved when editing is cancelled', async () => {
      setup();
      fireEvent.click(await screen.findByRole('button', { name: 'Edit description' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
        target: { value: 'Lost words' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(await screen.findByText('Cover the happy path')).toBeInTheDocument();
      expect(api.updateCard).not.toHaveBeenCalled();
    });

    it('invites a first description, and shows no editing to readers', async () => {
      vi.mocked(api.fetchCard).mockResolvedValue({ ...detail, description: '' });
      const { unmount } = render(
        <CardDialog cardId="c1" onClose={vi.fn()} onManageLabels={vi.fn()} />
      );
      expect(await screen.findByRole('button', { name: 'Add a description' })).toBeInTheDocument();
      unmount();

      const view = sampleBoardView();
      view.role = 'reader';
      useBoardStore.setState({ view, status: 'ready', freshIds: [] });
      render(<CardDialog cardId="c1" onClose={vi.fn()} onManageLabels={vi.fn()} />);

      expect(await screen.findByText('No description.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /description/i })).not.toBeInTheDocument();
    });

    it('offers the formatting toolbar and a preview while writing', async () => {
      setup();

      fireEvent.click(await screen.findByRole('button', { name: 'Edit description' }));

      expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument();
    });
  });

  it('asks before deleting and then closes', async () => {
    vi.mocked(api.deleteCard).mockResolvedValueOnce(undefined);
    const { onClose } = setup();
    await screen.findByRole('dialog', { name: 'Card Write the spec' });

    fireEvent.click(screen.getByRole('button', { name: /Delete card/ }));
    expect(api.deleteCard).not.toHaveBeenCalled();

    const confirm = screen.getByRole('dialog', { name: 'Delete this card?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete card' }));

    await waitFor(() => expect(api.deleteCard).toHaveBeenCalledWith('c1'));
    expect(onClose).toHaveBeenCalled();
  });

  it('hands over to the label manager', async () => {
    const { onManageLabels } = setup();

    fireEvent.click(await screen.findByRole('button', { name: /Manage labels/ }));

    expect(onManageLabels).toHaveBeenCalled();
  });

  it('closes itself and warns when the card cannot be loaded', async () => {
    vi.mocked(api.fetchCard).mockRejectedValueOnce(new Error('not found'));
    const onClose = vi.fn();

    render(<CardDialog cardId="c1" onClose={onClose} onManageLabels={() => undefined} />);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useToastStore.getState().toasts[0]?.message).toBe('not found');
  });

  describe('assignees and due date', () => {
    function setupWithMeta(role: 'owner' | 'reader') {
      const view = { ...sampleBoardView(), role };
      useBoardStore.setState({ view, status: 'ready', freshIds: [] });
      vi.mocked(api.fetchCard).mockResolvedValue(detail);
      render(
        <BoardMetaProvider members={view.members} meId="u-me" today="2026-10-22">
          <CardDialog cardId="c1" onClose={vi.fn()} onManageLabels={vi.fn()} />
        </BoardMetaProvider>
      );
    }

    it('assigns and unassigns people optimistically', async () => {
      vi.mocked(api.setCardAssignees).mockResolvedValue({ assignee_ids: ['u-wen'] });
      setupWithMeta('owner');
      const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });

      fireEvent.click(within(dialog).getByRole('checkbox', { name: /wen/ }));

      await waitFor(() => expect(api.setCardAssignees).toHaveBeenCalledWith('c1', ['u-wen']));
      expect(within(dialog).getByRole('checkbox', { name: /wen/ })).toBeChecked();

      fireEvent.click(within(dialog).getByRole('checkbox', { name: /wen/ }));
      await waitFor(() => expect(api.setCardAssignees).toHaveBeenLastCalledWith('c1', []));
    });

    it('offers to assign the card to me in one click', async () => {
      vi.mocked(api.setCardAssignees).mockResolvedValue({ assignee_ids: ['u-me'] });
      setupWithMeta('owner');
      const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });

      fireEvent.click(within(dialog).getByRole('button', { name: 'Assign to me' }));

      await waitFor(() => expect(api.setCardAssignees).toHaveBeenCalledWith('c1', ['u-me']));
      expect(
        within(dialog).queryByRole('button', { name: 'Assign to me' })
      ).not.toBeInTheDocument();
    });

    it('sets the due date from a quick pick and clears it', async () => {
      vi.mocked(api.updateCard).mockResolvedValue({ ...detail, due_date: '2026-10-22' });
      setupWithMeta('owner');
      const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });

      fireEvent.click(within(dialog).getByRole('button', { name: 'Today' }));
      await waitFor(() =>
        expect(api.updateCard).toHaveBeenCalledWith('c1', { due_date: '2026-10-22' })
      );
      expect(within(dialog).getByRole('button', { name: 'Today' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(within(dialog).getAllByText(/^Due today, /).length).toBeGreaterThan(0);

      fireEvent.click(within(dialog).getByRole('button', { name: 'Clear' }));
      await waitFor(() =>
        expect(api.updateCard).toHaveBeenLastCalledWith('c1', { due_date: null })
      );
    });

    it('takes a typed date from the native date field', async () => {
      vi.mocked(api.updateCard).mockResolvedValue({ ...detail, due_date: '2026-12-24' });
      setupWithMeta('owner');
      const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });

      fireEvent.change(within(dialog).getByLabelText('Due date', { selector: 'input' }), {
        target: { value: '2026-12-24' },
      });

      await waitFor(() =>
        expect(api.updateCard).toHaveBeenCalledWith('c1', { due_date: '2026-12-24' })
      );
    });

    it('lets readers look but not change anything', async () => {
      const view = sampleBoardView();
      view.lists[0].cards[0].assignee_ids = ['u-wen'];
      view.lists[0].cards[0].due_date = '2026-10-20';
      useBoardStore.setState({ view: { ...view, role: 'reader' }, status: 'ready', freshIds: [] });
      vi.mocked(api.fetchCard).mockResolvedValue(detail);
      render(
        <BoardMetaProvider members={view.members} meId="u-me" today="2026-10-22">
          <CardDialog cardId="c1" onClose={vi.fn()} onManageLabels={vi.fn()} />
        </BoardMetaProvider>
      );
      const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });

      expect(within(dialog).getByText('wen')).toBeInTheDocument();
      expect(within(dialog).getAllByText(/^Overdue, /).length).toBeGreaterThan(0);
      expect(
        within(dialog).queryByLabelText('Due date', { selector: 'input' })
      ).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('checkbox', { name: /wen/ })).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Assign to me' })
      ).not.toBeInTheDocument();
    });
  });

  describe('layout', () => {
    function propertyNames(dialog: HTMLElement): string[] {
      return within(dialog)
        .getAllByRole('group')
        .map((group) => group.textContent ?? '')
        .map((text) =>
          ['Assignees', 'Due date', 'Labels', 'List'].find((name) => text.startsWith(name))
        )
        .filter((name): name is string => name !== undefined);
    }

    it('shows the properties in the default order', async () => {
      setup();
      const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });

      expect(propertyNames(dialog)).toEqual(['Assignees', 'Due date', 'Labels', 'List']);
    });

    it('follows the order the person chose', async () => {
      usePrefsStore.setState({
        prefs: {
          ...DEFAULT_PREFERENCES,
          card_dialog: { order: ['labels', 'list', 'assignees', 'due_date'], hidden: [] },
        },
      });
      setup();
      const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });

      expect(propertyNames(dialog)).toEqual(['Labels', 'List', 'Assignees', 'Due date']);
    });

    it('tucks hidden properties away, and shows them on request', async () => {
      usePrefsStore.setState({
        prefs: {
          ...DEFAULT_PREFERENCES,
          card_dialog: {
            order: ['assignees', 'due_date', 'labels', 'list'],
            hidden: ['list', 'assignees'],
          },
        },
      });
      setup();
      const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });

      expect(propertyNames(dialog)).toEqual(['Due date', 'Labels']);
      const more = within(dialog).getByRole('button', { name: '2 hidden properties' });
      expect(more).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(more);

      expect(propertyNames(dialog)).toEqual(['Due date', 'Labels', 'Assignees', 'List']);
      expect(
        within(dialog).getByRole('button', { name: 'Hide the other properties' })
      ).toHaveAttribute('aria-expanded', 'true');
    });

    it('offers no disclosure when nothing is hidden', async () => {
      setup();
      const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });

      expect(
        within(dialog).queryByRole('button', { name: /hidden propert/ })
      ).not.toBeInTheDocument();
    });

    it('hands over to the settings, away from the delete button', async () => {
      const onCustomize = vi.fn();
      vi.mocked(api.fetchCard).mockResolvedValue(detail);
      render(
        <CardDialog
          cardId="c1"
          onClose={vi.fn()}
          onManageLabels={vi.fn()}
          onCustomize={onCustomize}
        />
      );

      fireEvent.click(await screen.findByRole('button', { name: /Customise this layout/ }));

      expect(onCustomize).toHaveBeenCalled();
    });
  });
});
