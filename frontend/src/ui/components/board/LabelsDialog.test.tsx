import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleBoardView } from '../../../test/fixtures';

vi.mock('@lib/boardsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/boardsApi')>();
  return {
    ...actual,
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
  };
});

import * as api from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';

import { LabelsDialog } from './LabelsDialog';

function setup() {
  render(<LabelsDialog open onClose={() => undefined} />);
  return screen.getByRole('dialog', { name: 'Labels' });
}

describe('LabelsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.setState({ view: sampleBoardView(), status: 'ready', freshIds: [] });
  });

  it('lists the labels of the board with their priority in words', () => {
    const dialog = setup();

    expect(
      within(dialog).getByText('Urgent', { selector: '.label-chip__name' })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Low priority')).toBeInTheDocument();
  });

  it('requires a name before the label can be created', () => {
    const dialog = setup();

    expect(within(dialog).getByRole('button', { name: 'Create label' })).toBeDisabled();
  });

  it('creates a label with a chosen color and priority', async () => {
    vi.mocked(api.createLabel).mockResolvedValueOnce({
      id: 'blocked',
      board_id: 'b1',
      name: 'Blocked',
      color: 'violet',
      priority: 'high',
    });
    const dialog = setup();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: ' Blocked ' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Violet' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'High' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create label' }));

    await waitFor(() =>
      expect(api.createLabel).toHaveBeenCalledWith('b1', {
        name: 'Blocked',
        color: 'violet',
        priority: 'high',
      })
    );
    expect(
      await within(dialog).findByText('Blocked', { selector: '.label-chip__name' })
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('');
  });

  it('edits an existing label', async () => {
    vi.mocked(api.updateLabel).mockResolvedValueOnce({
      id: 'low',
      board_id: 'b1',
      name: 'Someday',
      color: 'blue',
      priority: 'none',
    });
    const dialog = setup();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit label Low' }));
    expect(within(dialog).getByRole('heading', { name: 'Edit label' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Low');

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Someday' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'None' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save label' }));

    await waitFor(() =>
      expect(api.updateLabel).toHaveBeenCalledWith('low', {
        name: 'Someday',
        color: 'blue',
        priority: 'none',
      })
    );
  });

  it('asks before deleting a label', async () => {
    vi.mocked(api.deleteLabel).mockResolvedValueOnce(undefined);
    const dialog = setup();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete label Urgent' }));
    expect(api.deleteLabel).not.toHaveBeenCalled();

    const confirm = screen.getByRole('dialog', { name: 'Delete this label?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete label' }));

    await waitFor(() => expect(api.deleteLabel).toHaveBeenCalledWith('urgent'));
  });
});
