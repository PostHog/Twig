import { CodeBlock } from "@components/CodeBlock";
import { Divider } from "@components/Divider";
import { List, ListItem } from "@components/List";
import {
  Blockquote,
  Checkbox,
  Code,
  Em,
  Kbd,
  Link,
  Text,
} from "@radix-ui/themes";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

// Preprocessor to prevent setext heading interpretation of horizontal rules
// Ensures `---`, `***`, `___` are preceded by a blank line
function preprocessMarkdown(content: string): string {
  return content.replace(/\n([^\n].*)\n(---+|___+|\*\*\*+)\n/g, "\n$1\n\n$2\n");
}

const HeadingText = ({ children }: { children: React.ReactNode }) => (
  <Text as="p" size="1" mb="2" style={{ color: "var(--accent-11)" }}>
    <strong>{children}</strong>
  </Text>
);

const components: Components = {
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
      <Text
        as="p"
        size="1"
        mb={isStrongOnly ? "2" : "3"}
        color="gray"
        highContrast
      >
        {children}
      </Text>
    );
  },
  blockquote: ({ children }) => (
    <Blockquote
      size="1"
      mb="3"
      style={{ color: "var(--accent-10)", borderColor: "var(--accent-6)" }}
    >
      {children}
    </Blockquote>
  ),
  code: ({ children, className }) => {
    const isInline = !className?.includes("language-");
    if (isInline) {
      return (
        <Code size="1" variant="soft" color="gray" highContrast>
          {children}
        </Code>
      );
    }
    return <code>{children}</code>;
  },
  pre: ({ children }) => <CodeBlock size="1">{children}</CodeBlock>,
  em: ({ children }) => (
    <Em style={{ color: "var(--accent-10)" }}>{children}</Em>
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
    <Link href={href} target="_blank" rel="noopener noreferrer" size="1">
      {children}
    </Link>
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
  hr: () => <Divider size="1" />,
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

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {preprocessMarkdown(content)}
    </ReactMarkdown>
  );
}
