import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleBoardView } from '../../../test/fixtures';

vi.mock('@lib/boardsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/boardsApi')>();
  return {
    ...actual,
    fetchCard: vi.fn(),
    updateCard: vi.fn(),
    moveCard: vi.fn(),
    deleteCard: vi.fn(),
    setCardLabels: vi.fn(),
  };
});

import * as api from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import { useToastStore } from '@lib/toastStore';

import { CardDialog } from './CardDialog';

const detail = {
  id: 'c1',
  list_id: 'todo',
  title: 'Write the spec',
  description: 'Cover the happy path',
  label_ids: ['urgent'],
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
  });

  it('shows the card with its list, description and labels', async () => {
    setup();

    const dialog = await screen.findByRole('dialog', { name: 'Card Write the spec' });
    expect(
      within(dialog).getByRole('heading', { level: 2, name: /Write the spec/ })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('To do', { selector: 'strong' })).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Description')).toHaveValue('Cover the happy path')
    );
    expect(within(dialog).getByRole('checkbox', { name: /Urgent/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Low/ })).not.toBeChecked();
  });

  it('saves the description when the field loses focus', async () => {
    vi.mocked(api.updateCard).mockResolvedValueOnce({ ...detail, description: 'New details' });
    setup();
    const field = await screen.findByLabelText('Description');
    await waitFor(() => expect(field).toHaveValue('Cover the happy path'));

    fireEvent.change(field, { target: { value: 'New details' } });
    fireEvent.blur(field);

    await waitFor(() =>
      expect(api.updateCard).toHaveBeenCalledWith('c1', { description: 'New details' })
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('does not call the api when the description did not change', async () => {
    setup();
    const field = await screen.findByLabelText('Description');
    await waitFor(() => expect(field).toHaveValue('Cover the happy path'));

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

    fireEvent.change(screen.getByLabelText('List'), { target: { value: 'done' } });
    expect(screen.getByLabelText('Position')).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Move card' }));

    await waitFor(() => expect(api.moveCard).toHaveBeenCalledWith('c1', 'done', 0));
  });

  it('keeps the move button disabled until the position changes', async () => {
    setup();
    await screen.findByRole('dialog', { name: 'Card Write the spec' });

    expect(screen.getByRole('button', { name: 'Move card' })).toBeDisabled();
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
});
