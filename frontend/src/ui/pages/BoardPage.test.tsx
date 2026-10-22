import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleBoardView, sampleWorkspaces } from '../../test/fixtures';

vi.mock('@lib/boardsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/boardsApi')>();
  return {
    ...actual,
    fetchBoard: vi.fn(),
    renameBoard: vi.fn(),
    deleteBoard: vi.fn(),
    createList: vi.fn(),
    renameList: vi.fn(),
    moveList: vi.fn(),
    deleteList: vi.fn(),
    setListWipLimit: vi.fn(),
    createCard: vi.fn(),
    fetchCard: vi.fn(),
    updateCard: vi.fn(),
    moveCard: vi.fn(),
    deleteCard: vi.fn(),
    setCardLabels: vi.fn(),
    setCardAssignees: vi.fn(),
  };
});

import { ApiError } from '@lib/api';
import { useAuthStore } from '@lib/authStore';
import * as api from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import { DEFAULT_PREFERENCES } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';
import { useToastStore } from '@lib/toastStore';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { BoardPage } from './BoardPage';

function renderBoard(path = '/b/b1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/b/:boardId" element={<BoardPage />} />
        <Route path="/dashboard" element={<p>workspaces overview</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BoardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
    useToastStore.setState({ toasts: [] });
    usePrefsStore.setState({ prefs: DEFAULT_PREFERENCES, loaded: true, saveState: 'idle' });
    useWorkspaceStore.setState({ workspaces: sampleWorkspaces(), status: 'ready' });
    vi.mocked(api.fetchBoard).mockResolvedValue(sampleBoardView());
  });

  it('shows the board with its lists, cards and labelled priorities', async () => {
    renderBoard();

    expect(await screen.findByRole('heading', { level: 1, name: /Roadmap/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /To do/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Done/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Write the spec/ })).toBeInTheDocument();
    expect(screen.getByText('Has a description')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Design team' })).toHaveAttribute('href', '/dashboard');
  });

  it('tells the user when the board does not exist', async () => {
    vi.mocked(api.fetchBoard).mockRejectedValueOnce(new ApiError(404, 'not found'));

    renderBoard();

    expect(
      await screen.findByRole('heading', { name: 'This board is not available' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your workspaces' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('adds a card at the end of a list', async () => {
    vi.mocked(api.createCard).mockResolvedValueOnce({
      id: 'c3',
      list_id: 'done',
      title: 'Ship it',
      has_description: false,
      description_preview: '',
      label_ids: [],
      assignee_ids: [],
      due_date: null,
    });
    renderBoard();
    await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

    const doneList = screen.getByRole('region', { name: /Done/ });
    fireEvent.click(within(doneList).getByRole('button', { name: 'Add a card' }));
    const field = within(doneList).getByRole('textbox', { name: /Title of the new card in Done/ });
    fireEvent.change(field, { target: { value: 'Ship it' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(api.createCard).toHaveBeenCalledWith('done', 'Ship it'));
    expect(await within(doneList).findByRole('button', { name: /^Ship it/ })).toBeInTheDocument();
  });

  it('adds a list', async () => {
    vi.mocked(api.createList).mockResolvedValueOnce({ id: 'review', name: 'Review' });
    renderBoard();
    await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

    fireEvent.click(screen.getByRole('button', { name: 'Add another list' }));
    const field = screen.getByRole('textbox', { name: 'Name of the new list' });
    fireEvent.change(field, { target: { value: 'Review' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(api.createList).toHaveBeenCalledWith('b1', 'Review'));
    expect(await screen.findByRole('heading', { level: 2, name: /Review/ })).toBeInTheDocument();
  });

  it('moves a list one step to the right from its menu, without dragging', async () => {
    vi.mocked(api.moveList).mockResolvedValueOnce(undefined);
    renderBoard();
    await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

    fireEvent.click(screen.getByRole('button', { name: 'Actions for list To do' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move right' }));

    await waitFor(() => expect(api.moveList).toHaveBeenCalledWith('todo', 1));
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings[0]).toMatch(/Done/);
  });

  it('dims the cards that do not carry the selected label', async () => {
    renderBoard();
    await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

    const filter = screen.getByRole('group', { name: 'Filter cards' });
    fireEvent.click(within(filter).getByRole('button', { name: /Urgent/ }));

    const matching = screen.getByRole('button', { name: /^Write the spec/ }).closest('li');
    const other = screen.getByRole('button', { name: /^Design the board/ }).closest('li');
    expect(matching).not.toHaveAttribute('data-dimmed');
    expect(other).toHaveAttribute('data-dimmed');
    expect(within(filter).getByText('1 of 2 cards match')).toBeInTheDocument();

    fireEvent.click(within(filter).getByRole('button', { name: 'Clear' }));
    expect(other).not.toHaveAttribute('data-dimmed');
  });

  it('narrows the board to my cards and to overdue cards', async () => {
    const view = sampleBoardView();
    view.lists[0].cards[0].assignee_ids = ['u-me'];
    view.lists[0].cards[1].due_date = '2000-01-02';
    vi.mocked(api.fetchBoard).mockResolvedValue(view);
    useAuthStore.setState({
      user: { id: 'u-me', email: 'amir@example.com', username: 'amir' },
      status: 'authenticated',
    });
    renderBoard();
    await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

    const filter = screen.getByRole('group', { name: 'Filter cards' });
    const assigned = screen.getByRole('button', { name: /^Write the spec/ }).closest('li');
    const late = screen.getByRole('button', { name: /^Design the board/ }).closest('li');

    fireEvent.click(within(filter).getByRole('button', { name: 'My cards' }));
    expect(assigned).not.toHaveAttribute('data-dimmed');
    expect(late).toHaveAttribute('data-dimmed');
    expect(within(filter).getByText('1 of 2 cards match')).toBeInTheDocument();

    fireEvent.click(within(filter).getByRole('button', { name: 'My cards' }));
    fireEvent.click(within(filter).getByRole('button', { name: 'Overdue' }));
    expect(late).not.toHaveAttribute('data-dimmed');
    expect(assigned).toHaveAttribute('data-dimmed');

    fireEvent.click(within(filter).getByRole('button', { name: 'My cards' }));
    expect(within(filter).getByText('0 of 2 cards match')).toBeInTheDocument();
  });

  it('shows who a card is assigned to and when it is due', async () => {
    const view = sampleBoardView();
    view.lists[0].cards[0].assignee_ids = ['u-wen'];
    view.lists[0].cards[0].due_date = '2000-01-02';
    vi.mocked(api.fetchBoard).mockResolvedValue(view);
    renderBoard();

    const card = (await screen.findByRole('button', { name: /^Write the spec/ })).closest('li');

    expect(within(card as HTMLElement).getByText(/Assigned to wen/)).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText(/^Overdue, /)).toBeInTheDocument();
  });

  it('confirms before deleting a list and removes it', async () => {
    vi.mocked(api.deleteList).mockResolvedValueOnce(undefined);
    renderBoard();
    await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

    fireEvent.click(screen.getByRole('button', { name: 'Actions for list Done' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete list' }));
    expect(api.deleteList).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Delete this list?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete list' }));

    await waitFor(() => expect(api.deleteList).toHaveBeenCalledWith('done'));
    expect(screen.queryByRole('heading', { level: 2, name: /Done/ })).not.toBeInTheDocument();
  });

  it('deletes the board and goes back to the overview', async () => {
    vi.mocked(api.deleteBoard).mockResolvedValueOnce(undefined);
    renderBoard();
    await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

    fireEvent.click(screen.getByRole('button', { name: 'Actions for board Roadmap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete board' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this board?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete board' }));

    expect(await screen.findByText('workspaces overview')).toBeInTheDocument();
    expect(api.deleteBoard).toHaveBeenCalledWith('b1');
  });

  it('opens a card in a dialog', async () => {
    vi.mocked(api.fetchCard).mockResolvedValueOnce({
      id: 'c1',
      list_id: 'todo',
      title: 'Write the spec',
      description: 'Cover the happy path',
      label_ids: ['urgent'],
      assignee_ids: [],
      due_date: null,
    });
    renderBoard();
    await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

    fireEvent.click(screen.getByRole('button', { name: /^Write the spec/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Description')).toHaveValue('Cover the happy path')
    );
  });

  describe('views and layout', () => {
    it('opens as columns, with the switcher beside the filters', async () => {
      renderBoard();

      await screen.findByRole('heading', { level: 1, name: /Roadmap/ });
      expect(screen.getByRole('radio', { name: 'Board' })).toBeChecked();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows the same cards as a table and remembers the choice for this board', async () => {
      renderBoard();
      await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

      fireEvent.click(screen.getByRole('radio', { name: 'List' }));

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Write the spec' })).toBeInTheDocument();
      expect(usePrefsStore.getState().prefs.boards.b1.view).toBe('list');
    });

    it('shows the cards on a calendar', async () => {
      renderBoard();
      await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

      fireEvent.click(screen.getByRole('radio', { name: 'Calendar' }));

      expect(await screen.findByRole('grid')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /No due date/ })).toHaveTextContent(
        'Write the spec'
      );
    });

    it('opens in the view that was saved for the board', async () => {
      usePrefsStore.setState({
        prefs: {
          ...DEFAULT_PREFERENCES,
          boards: {
            b1: { card_display: null, view: 'list', column_width: 'default', collapsed_lists: [] },
          },
        },
      });

      renderBoard();

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
    });

    it('folds a list into a rail and keeps it folded', async () => {
      renderBoard();
      await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

      fireEvent.click(screen.getByRole('button', { name: 'Collapse list To do' }));

      expect(screen.getByRole('button', { name: /Expand list To do/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Write the spec/ })).not.toBeInTheDocument();
      expect(usePrefsStore.getState().prefs.boards.b1.collapsed_lists).toEqual(['todo']);
    });

    it('sets a card limit from the list menu', async () => {
      vi.mocked(api.setListWipLimit).mockResolvedValue({ id: 'todo', name: 'To do' });
      renderBoard();
      await screen.findByRole('heading', { level: 1, name: /Roadmap/ });

      fireEvent.click(screen.getByRole('button', { name: 'Actions for list To do' }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Set a card limit/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Card limit for To do' });
      fireEvent.change(within(dialog).getByLabelText('Most cards at once'), {
        target: { value: '1' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(api.setListWipLimit).toHaveBeenCalledWith('todo', 1));
      expect(screen.getByText('1 over the limit of 1')).toBeInTheDocument();
    });

    it('opens the card a link points to', async () => {
      vi.mocked(api.fetchCard).mockResolvedValue({
        id: 'c1',
        list_id: 'todo',
        title: 'Write the spec',
        description: '',
        label_ids: [],
        assignee_ids: [],
        due_date: null,
      });

      renderBoard('/b/b1?card=c1');

      expect(
        await screen.findByRole('dialog', { name: 'Card Write the spec' })
      ).toBeInTheDocument();
    });
  });
});
