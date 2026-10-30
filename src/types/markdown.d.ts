// Markdown files are bundled as plain text (see the webpack rule in next.config.ts).
declare module "*.md" {
  const source: string;
  export default source;
}
