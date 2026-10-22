import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./mermaid', () => ({ renderDiagram: vi.fn() }));

import { useAnnouncer } from '@lib/announcer';

import { renderDiagram } from './mermaid';
import { RichText } from './RichText';

async function draw(text: string, props: Partial<React.ComponentProps<typeof RichText>> = {}) {
  const view = render(<RichText text={text} {...props} />);
  await waitFor(() => expect(view.container.querySelector('.rt-plain')).toBeNull());
  return view;
}

describe('RichText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnnouncer.setState({ message: '', tick: 0 });
  });

  it('draws Markdown: headings pushed below the title, lists and emphasis', async () => {
    await draw('# Title\n\n## Section\n\nSome **bold** and *italic*\n\n- one\n- two');

    expect(screen.getByRole('heading', { level: 3, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Section' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('pushes headings by whatever the place needs, and never past level six', async () => {
    await draw('# A\n\n###### F', { headingOffset: 4 });

    expect(screen.getByRole('heading', { level: 5, name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 6, name: 'F' })).toBeInTheDocument();
  });

  it('keeps single line breaks, as a plain note would', async () => {
    const { container } = await draw('first line\nsecond line');

    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('never turns raw HTML into elements', async () => {
    const { container } = await draw(
      'Hello <script>alert(1)</script> <img src=x onerror=alert(1)> <b>bold?</b>'
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });

  it('opens web links in a new tab without handing over the page, and says so', async () => {
    await draw('[docs](https://example.com/docs)');

    const link = screen.getByRole('link', { name: /docs/ });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link).toHaveTextContent('(opens in a new tab)');
  });

  it('turns bare addresses into links too', async () => {
    await draw('See https://example.com/plan today');

    expect(screen.getByRole('link', { name: /example.com\/plan/ })).toBeInTheDocument();
  });

  it('never makes a link out of anything that can run code', async () => {
    await draw(
      '[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c](data:text/html,x) [d](vbscript:x) [e](file:///etc/passwd)'
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
  });

  it('keeps mail links and links inside the text', async () => {
    await draw('[write](mailto:team@example.com) [up](#top)');

    expect(screen.getByRole('link', { name: 'write' })).toHaveAttribute(
      'href',
      'mailto:team@example.com'
    );
    expect(screen.getByRole('link', { name: 'up' })).not.toHaveAttribute('target');
  });

  it('never loads a picture from another site, it shows a link instead', async () => {
    const { container } = await draw('![Team photo](https://tracker.example/pixel.png)');

    expect(container.querySelector('img')).toBeNull();
    const link = screen.getByRole('link', { name: /Team photo/ });
    expect(link).toHaveTextContent('not loaded');
    expect(link).toHaveTextContent('tracker.example');
  });

  it('draws a table in a region a keyboard can scroll, with column headers', async () => {
    await draw('| Name | Role |\n| --- | --- |\n| Ana | Lead |');

    const region = screen.getByRole('region', { name: 'Table' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(
      within(region)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['Name', 'Role']);
    expect(within(region).getByRole('cell', { name: 'Ana' })).toBeInTheDocument();
  });

  it('draws a checklist whose boxes are named by their text', async () => {
    await draw('- [ ] buy tape\n- [x] book room');

    expect(screen.getByRole('checkbox', { name: /buy tape/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /book room/ })).toBeChecked();
  });

  it('lets the boxes be ticked only when asked to, and says which one', async () => {
    const onToggleTask = vi.fn();
    const { unmount } = await draw('- [ ] one\n- [ ] two', { onToggleTask });

    fireEvent.click(screen.getByRole('checkbox', { name: /two/ }));
    expect(onToggleTask).toHaveBeenCalledWith(1);
    unmount();

    await draw('- [ ] one');
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('shows code in a named region with the language and a copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await draw('```js\nconst a = 1;\n```');

    expect(screen.getByRole('region', { name: 'Code, js' })).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const a = 1;'));
    expect(useAnnouncer.getState().message).toBe('Code copied.');
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeInTheDocument();
  });

  it('highlights known languages, and shows unknown ones as they are', async () => {
    const { container } = await draw('```rust\nfn main() {}\n```\n\n```nonsense\nxyz\n```');

    await waitFor(() => expect(container.querySelector('.hljs-keyword')).not.toBeNull());
    expect(screen.getByRole('region', { name: 'Code, nonsense' })).toHaveTextContent('xyz');
  });

  it('draws a formula as MathML for screen readers as well as for the eye', async () => {
    const { container } = await draw('The area is $\\pi r^2$ always.');

    await waitFor(() => expect(container.querySelector('.katex')).not.toBeNull());
    expect(container.querySelector('math')).not.toBeNull();
    expect(container.querySelector('.katex-html')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws a block formula', async () => {
    const { container } = await draw('$$\nE = mc^2\n$$');

    await waitFor(() => expect(container.querySelector('.katex-display')).not.toBeNull());
  });

  it('shows a formula that is wrong as text, not as a broken page', async () => {
    const { container } = await draw('Broken $\\frac{1}{$ formula');

    await waitFor(() => expect(container.querySelector('.katex-error, .katex')).not.toBeNull());
    expect(container.textContent).toContain('formula');
  });

  it('leaves prices alone', async () => {
    const { container } = await draw('It costs $5 and then $10 more.');

    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toContain('$5 and then $10');
  });

  it('draws a diagram with its title, and keeps the source as text underneath', async () => {
    vi.mocked(renderDiagram).mockResolvedValue({
      svg: '<svg role="graphics-document document" aria-roledescription="flowchart"><g></g></svg>',
    });
    const source = 'accTitle: Release flow\naccDescr: From build to ship\nflowchart LR\n  A --> B';

    const { container } = await draw('```mermaid\n' + source + '\n```');

    await waitFor(() => expect(container.querySelector('.rt-diagram__canvas svg')).not.toBeNull());
    expect(renderDiagram).toHaveBeenCalledWith(expect.any(String), source, expect.any(Boolean));
    expect(screen.getByRole('region', { name: 'Diagram: Release flow' })).toBeInTheDocument();
    expect(screen.getByText('From build to ship')).toHaveClass('sr-only');
    const details = container.querySelector('details');
    expect(details).toHaveTextContent('flowchart LR');
    expect(details?.querySelector('summary')).toHaveTextContent('Diagram source');
  });

  it('says so, with the reason, when a diagram has a mistake', async () => {
    vi.mocked(renderDiagram).mockRejectedValue(new Error('Parse error on line 2'));

    await draw('```mermaid\nflowchart LR\n  A -->\n```');

    expect(await screen.findByRole('alert')).toHaveTextContent('has a mistake');
    expect(screen.getByRole('alert')).toHaveTextContent('Parse error on line 2');
    expect(document.querySelector('details')).toHaveTextContent('flowchart LR');
  });

  it('does not load the diagram library for a text without a diagram', async () => {
    await draw('Just words and `code`.');

    expect(renderDiagram).not.toHaveBeenCalled();
  });
});
