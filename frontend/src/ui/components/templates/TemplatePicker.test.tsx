import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleCatalogue } from '../../../test/fixtures';

vi.mock('@lib/boardsApi', () => ({
  fetchTemplates: vi.fn(),
}));

import * as api from '@lib/boardsApi';
import { useTemplateStore } from '@lib/templateStore';
import { useToastStore } from '@lib/toastStore';

import { TemplatePicker } from './TemplatePicker';

function setup(mode: 'board' | 'workspace', onSubmit = vi.fn().mockResolvedValue(true)) {
  const onClose = vi.fn();
  render(<TemplatePicker open mode={mode} onClose={onClose} onSubmit={onSubmit} />);
  return { onSubmit, onClose };
}

describe('TemplatePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTemplateStore.setState({ catalogue: null, status: 'idle' });
    useToastStore.setState({ toasts: [] });
    vi.mocked(api.fetchTemplates).mockResolvedValue(sampleCatalogue());
  });

  it('starts on the blank option and explains it', async () => {
    setup('board');

    expect(screen.getByRole('radio', { name: /Blank board/ })).toBeChecked();
    expect(screen.getByRole('region', { name: 'Preview of Blank board' })).toBeInTheDocument();
    expect(screen.getByText(/An empty board/)).toBeInTheDocument();
    await screen.findByRole('radio', { name: /Sprint planning/ });
  });

  it('groups board templates by category', async () => {
    setup('board');

    await screen.findByRole('radio', { name: /Sprint planning/ });

    expect(screen.getByRole('group', { name: 'Engineering' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Personal' })).toBeInTheDocument();
  });

  it('previews the lists, sample cards and labels of the selected template', async () => {
    setup('board');
    fireEvent.click(await screen.findByRole('radio', { name: /Sprint planning/ }));

    const preview = screen.getByRole('region', { name: 'Preview of Sprint planning' });
    expect(within(preview).getByText('Backlog')).toBeInTheDocument();
    expect(within(preview).getByText('Rate limit sign up')).toBeInTheDocument();
    expect(within(preview).getByText('Labels: Bug')).toBeInTheDocument();
    expect(within(preview).getByText('Urgent')).toBeInTheDocument();
    expect(within(preview).getByText('No cards yet')).toBeInTheDocument();
  });

  it('suggests the template name until the user types their own', async () => {
    setup('board');
    const name = screen.getByLabelText('Board name');

    fireEvent.click(await screen.findByRole('radio', { name: /Sprint planning/ }));
    expect(name).toHaveValue('Sprint planning');

    fireEvent.change(name, { target: { value: 'Sprint 12' } });
    fireEvent.click(screen.getByRole('radio', { name: /Weekly planner/ }));
    expect(name).toHaveValue('Sprint 12');
  });

  it('creates from the chosen template', async () => {
    const { onSubmit, onClose } = setup('board');
    fireEvent.click(await screen.findByRole('radio', { name: /Sprint planning/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Sprint planning',
        templateId: 'sprint-planning',
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('creates a blank board when no template is chosen', async () => {
    const { onSubmit } = setup('board');

    expect(screen.getByRole('button', { name: 'Create board' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Board name'), { target: { value: ' Ideas ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Ideas', templateId: null }));
  });

  it('stays open when the creation is refused', async () => {
    const { onClose } = setup('board', vi.fn().mockResolvedValue(false));
    fireEvent.change(screen.getByLabelText('Board name'), { target: { value: 'Ideas' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create board' })).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers workspace templates and previews every board they create', async () => {
    const { onSubmit } = setup('workspace');
    fireEvent.click(await screen.findByRole('radio', { name: /Student life/ }));

    const preview = screen.getByRole('region', { name: 'Preview of Student life' });
    expect(
      within(preview).getByRole('heading', { level: 4, name: 'Sprint planning' })
    ).toBeInTheDocument();
    expect(
      within(preview).getByRole('heading', { level: 4, name: 'Weekly planner' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Student life', templateId: 'student-life' })
    );
  });

  it('still lets the user start blank when the templates cannot be loaded', async () => {
    vi.mocked(api.fetchTemplates).mockRejectedValueOnce(new Error('offline'));
    const { onSubmit } = setup('workspace');

    expect(await screen.findByText(/Templates are unavailable/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Mine', templateId: null }));
  });
});
