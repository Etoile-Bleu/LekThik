import type { SnippetLanguage } from './boardsApi';

export const SNIPPET_MAX_CHARS = 12_000;
export const SNIPPET_MAX_LINES = 500;
export const FILENAME_MAX_CHARS = 100;

export const SNIPPET_LANGUAGES: Array<{ value: SnippetLanguage; label: string }> = [
  { value: 'text', label: 'Plain text' },
  { value: 'bash', label: 'Shell' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'css', label: 'CSS' },
  { value: 'diff', label: 'Diff' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'xml', label: 'HTML and XML' },
  { value: 'yaml', label: 'YAML' },
];

export function languageLabel(language: SnippetLanguage): string {
  return SNIPPET_LANGUAGES.find((entry) => entry.value === language)?.label ?? 'Plain text';
}

export function lineCount(code: string): number {
  return code === '' ? 0 : code.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').length;
}

export function checkSnippet(code: string): string | null {
  if (code.length > SNIPPET_MAX_CHARS) {
    return `At most ${SNIPPET_MAX_CHARS.toLocaleString()} characters.`;
  }
  if (lineCount(code) > SNIPPET_MAX_LINES) return `At most ${SNIPPET_MAX_LINES} lines.`;
  return null;
}
