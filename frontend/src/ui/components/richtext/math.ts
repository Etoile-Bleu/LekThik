import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import type { Options } from 'react-markdown';

// KaTeX draws with its own fonts and stylesheet, which are bundled here and only loaded with the
// first formula, so no outside server is ever asked for them.
import 'katex/dist/katex.min.css';

/**
 * Formulas are drawn as HTML for the eye and as MathML for screen readers, which is KaTeX's
 * default output. Nothing in a formula may link out or run (`trust` stays off), and the size
 * limits stop a formula from being written to hang the page.
 */
type Plugins = NonNullable<Options['remarkPlugins']>;

export const mathPlugins: { remark: Plugins; rehype: Plugins } = {
  remark: [remarkMath],
  rehype: [
    [
      rehypeKatex,
      {
        output: 'htmlAndMathml',
        throwOnError: false,
        errorColor: 'currentColor',
        strict: 'ignore',
        trust: false,
        maxSize: 20,
        maxExpand: 500,
      },
    ],
  ],
};
