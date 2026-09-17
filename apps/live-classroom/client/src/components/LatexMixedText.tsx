import katex from 'katex';

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMixed(input: string) {
  const parts = input.split(/(\$[^$]+\$)/g);
  return parts
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) {
        const expr = part.slice(1, -1);
        try {
          return katex.renderToString(expr, { throwOnError: false });
        } catch {
          return `<code>${escapeHtml(part)}</code>`;
        }
      }
      return escapeHtml(part).replace(/\n/g, '<br/>');
    })
    .join('');
}

export function LatexMixedText({ text, className }: { text: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderMixed(text) }} />;
}
