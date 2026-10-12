import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Rohes HTML wird von react-markdown standardmäßig NICHT gerendert (Schutz vor XSS).
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          img: ({ alt }) => <span className="text-muted">[Bild: {alt || "ohne Beschreibung"}]</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
