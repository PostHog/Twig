import { CodeBlock } from "@components/CodeBlock";
import { Divider } from "@components/Divider";
import { List, ListItem } from "@components/List";
import { Blockquote, Checkbox, Code, Em, Kbd, Text } from "@radix-ui/themes";
import { memo, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";

interface MarkdownRendererProps {
  content: string;
  remarkPluginsOverride?: PluggableList;
}

// Preprocessor to prevent setext heading interpretation of horizontal rules
// Ensures `---`, `***`, `___` are preceded by a blank line
function preprocessMarkdown(content: string): string {
  return content.replace(/\n([^\n].*)\n(---+|___+|\*\*\*+)\n/g, "\n$1\n\n$2\n");
}

const HeadingText = ({ children }: { children: React.ReactNode }) => (
  <Text as="p" size="2" mb="3" style={{ color: "var(--accent-11)" }}>
    <strong>{children}</strong>
  </Text>
);

export const baseComponents: Components = {
  h1: ({ children }) => <HeadingText>{children}</HeadingText>,
  h2: ({ children }) => <HeadingText>{children}</HeadingText>,
  h3: ({ children }) => <HeadingText>{children}</HeadingText>,
  h4: ({ children }) => <HeadingText>{children}</HeadingText>,
  h5: ({ children }) => <HeadingText>{children}</HeadingText>,
  h6: ({ children }) => <HeadingText>{children}</HeadingText>,
  p: ({ children, node }) => {
    const isStrongOnly =
      node?.children?.length === 1 &&
      node.children[0].type === "element" &&
      node.children[0].tagName === "strong";

    return (
      <Text as="p" size="1" mb={isStrongOnly ? "2" : "3"}>
        {children}
      </Text>
    );
  },
  blockquote: ({ children }) => (
    <Blockquote size="1" mb="3" style={{ borderColor: "var(--accent-6)" }}>
      {children}
    </Blockquote>
  ),
  code: ({ children, className }) => {
    const isInline = !className?.includes("language-");
    if (isInline) {
      return (
        <Code size="1" variant="ghost" style={{ color: "var(--accent-11)" }}>
          {children}
        </Code>
      );
    }
    return <code>{children}</code>;
  },
  pre: ({ children }) => <CodeBlock size="1">{children}</CodeBlock>,
  em: ({ children }) => (
    <Em style={{ fontSize: "var(--font-size-1)" }}>{children}</Em>
  ),
  i: ({ children }) => (
    <i style={{ fontSize: "var(--font-size-1)" }}>{children}</i>
  ),
  strong: ({ children }) => (
    <strong
      style={{ fontSize: "var(--font-size-1)", color: "var(--accent-11)" }}
    >
      {children}
    </strong>
  ),
  del: ({ children }) => (
    <del style={{ textDecoration: "line-through", color: "var(--gray-9)" }}>
      {children}
    </del>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="markdown-link"
      style={{
        fontSize: "var(--font-size-1)",
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
      }}
    >
      {children}
      <svg
        width="10"
        height="10"
        viewBox="0 0 12 12"
        fill="none"
        stroke="var(--accent-11)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginLeft: "var(--space-1)", flexShrink: 0 }}
        aria-label="external link icon"
        role="img"
      >
        <path d="M4.5 1.5H2.25C1.836 1.5 1.5 1.836 1.5 2.25V9.75C1.5 10.164 1.836 10.5 2.25 10.5H9.75C10.164 10.5 10.5 10.164 10.5 9.75V7.5" />
        <path d="M7.5 1.5H10.5V4.5" />
        <path d="M5.25 6.75L10.5 1.5" />
      </svg>
    </a>
  ),
  kbd: ({ children }) => <Kbd size="1">{children}</Kbd>,
  ul: ({ children }) => (
    <List as="ul" size="1">
      {children}
    </List>
  ),
  ol: ({ children }) => (
    <List as="ol" size="1">
      {children}
    </List>
  ),
  li: ({ children }) => <ListItem size="1">{children}</ListItem>,
  hr: () => <Divider size="3" />,
  // Task list checkbox
  input: ({ type, checked }) => {
    if (type === "checkbox") {
      return (
        <Checkbox
          checked={checked}
          size="1"
          style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }}
        />
      );
    }
    return <input type={type} />;
  },
  // Table components - plain HTML for size control
  table: ({ children }) => (
    <table className="mb-3" style={{ fontSize: "var(--font-size-1)" }}>
      {children}
    </table>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-gray-6 border-b">{children}</tr>,
  th: ({ children, style }) => (
    <th className="px-2 py-1 text-left text-gray-11" style={style}>
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td className="px-2 py-1 text-gray-12" style={style}>
      {children}
    </td>
  ),
};

export const defaultRemarkPlugins = [remarkGfm];

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  remarkPluginsOverride,
}: MarkdownRendererProps) {
  const processedContent = useMemo(
    () => preprocessMarkdown(content),
    [content],
  );
  const plugins = remarkPluginsOverride ?? defaultRemarkPlugins;
  return (
    <ReactMarkdown remarkPlugins={plugins} components={baseComponents}>
      {processedContent}
    </ReactMarkdown>
  );
});
