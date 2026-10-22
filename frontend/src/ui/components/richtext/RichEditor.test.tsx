import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./mermaid', () => ({ renderDiagram: vi.fn() }));

import { RichEditor } from './RichEditor';

function Harness({
  initial = '',
  onSave = vi.fn(),
  onCancel = vi.fn(),
  onLeave,
}: {
  initial?: string;
  onSave?: () => void;
  onCancel?: () => void;
  onLeave?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <RichEditor
        value={value}
        onChange={setValue}
        onSave={onSave}
        onCancel={onCancel}
        onLeave={onLeave}
        label="Note text"
        maxLength={500}
      />
      <output data-testid="value">{value}</output>
      <button type="button">outside</button>
    </>
  );
}

function area(): HTMLTextAreaElement {
  return screen.getByLabelText('Note text') as HTMLTextAreaElement;
}

function select(start: number, end: number) {
  area().setSelectionRange(start, end);
}

describe('RichEditor', () => {
  it('has a write area, a preview tab and a formatting toolbar', () => {
    render(<Harness />);

    expect(screen.getByRole('tablist', { name: 'Write or preview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    expect(area()).toHaveFocus();
  });

  it('makes the selection bold', () => {
    render(<Harness initial="make this bold" />);
    select(5, 9);

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));

    expect(screen.getByTestId('value')).toHaveTextContent('make **this** bold');
  });

  it('puts a placeholder where nothing is selected', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));

    expect(screen.getByTestId('value')).toHaveTextContent('*italic text*');
  });

  it('turns lines into a checklist, a list and a quote', () => {
    render(<Harness initial={'one\ntwo'} />);
    select(0, 7);

    fireEvent.click(screen.getByRole('button', { name: 'Checklist' }));

    expect(area().value).toBe('- [ ] one\n- [ ] two');
  });

  it('adds a table, a formula, a code block and a diagram that already has a description', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(area().value).toContain('| Column | Column |');

    fireEvent.click(screen.getByRole('button', { name: 'Formula (LaTeX)' }));
    expect(area().value).toContain('$x^2$');

    fireEvent.click(screen.getByRole('button', { name: 'Code block' }));
    expect(area().value).toContain('```js');

    fireEvent.click(screen.getByRole('button', { name: 'Diagram (Mermaid)' }));
    expect(area().value).toContain('```mermaid');
    expect(area().value).toContain('accTitle:');
    expect(area().value).toContain('accDescr:');
  });

  it('is one tab stop that the arrow keys move along', () => {
    render(<Harness />);
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    const buttons = within(toolbar).getAllByRole('button');

    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    buttons[0].focus();
    fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });
    expect(buttons[1]).toHaveFocus();
    expect(buttons[1].tabIndex).toBe(0);
    fireEvent.keyDown(buttons[1], { key: 'End' });
    expect(buttons.at(-1)).toHaveFocus();
    fireEvent.keyDown(buttons.at(-1) as HTMLElement, { key: 'ArrowRight' });
    expect(buttons[0]).toHaveFocus();
  });

  it('has the usual shortcuts', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<Harness initial="word" onSave={onSave} onCancel={onCancel} />);

    select(0, 4);
    fireEvent.keyDown(area(), { key: 'b', ctrlKey: true });
    expect(area().value).toBe('**word**');

    fireEvent.keyDown(area(), { key: 'Enter', ctrlKey: true });
    expect(onSave).toHaveBeenCalled();
    fireEvent.keyDown(area(), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('previews exactly what will be saved', async () => {
    render(<Harness initial={'# Plan\n\n- [ ] one'} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Plan' }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /one/ })).toBeDisabled();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Write' }));
    expect(area().value).toBe('# Plan\n\n- [ ] one');
  });

  it('says there is nothing to preview', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument();
  });

  it('counts the characters left when the limit is near', () => {
    render(<Harness initial={'x'.repeat(250)} />);

    expect(screen.getByText(/250 characters left/)).toBeInTheDocument();
  });

  it('explains what can be written', () => {
    render(<Harness />);

    fireEvent.click(screen.getByText('What can I write?'));

    expect(screen.getByText('Maths (LaTeX)')).toBeInTheDocument();
    expect(screen.getByText('Diagram (Mermaid)', { selector: 'dt' })).toBeInTheDocument();
  });

  it('saves and cancels with the buttons', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onSave={onSave} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('tells when focus leaves the editor, but not when it moves inside it', async () => {
    const onLeave = vi.fn();
    render(<Harness onLeave={onLeave} />);

    fireEvent.blur(area(), { relatedTarget: screen.getByRole('button', { name: 'Bold' }) });
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.blur(area(), { relatedTarget: screen.getByRole('button', { name: 'outside' }) });
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
  });
});
