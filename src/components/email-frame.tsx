/** Renders stored email HTML in a fully sandboxed iframe (no scripts, no same-origin access). */
export function EmailFrame({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className="h-[75vh] w-full rounded-lg border border-line bg-white"
    />
  );
}
