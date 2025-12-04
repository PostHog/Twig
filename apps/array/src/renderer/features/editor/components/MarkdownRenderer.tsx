import { CodeBlock } from "@components/CodeBlock";
import { Divider } from "@components/Divider";
import { List, ListItem } from "@components/List";
import {
  Blockquote,
  Checkbox,
  Code,
  Em,
  Heading,
  Kbd,
  Link,
  Strong,
  Table,
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

const fontStyle = {
  fontSize: "var(--font-size-1-5)",
  lineHeight: "var(--line-height-1-5)",
};

const components: Components = {
  h1: ({ children }) => (
    <Heading as="h1" size="5" mb="3" color="gray" highContrast>
      {children}
    </Heading>
  ),
  h2: ({ children }) => (
    <Heading as="h2" size="4" mb="3" color="gray" highContrast>
      {children}
    </Heading>
  ),
  h3: ({ children }) => (
    <Heading as="h3" size="3" mb="2" color="gray" highContrast>
      {children}
    </Heading>
  ),
  h4: ({ children }) => (
    <Heading as="h4" size="3" mb="2" color="gray" highContrast>
      {children}
    </Heading>
  ),
  h5: ({ children }) => (
    <Heading as="h5" size="2" mb="2" color="gray" highContrast>
      {children}
    </Heading>
  ),
  h6: ({ children }) => (
    <Heading as="h6" size="2" mb="2" color="gray" highContrast>
      {children}
    </Heading>
  ),
  p: ({ children, node }) => {
    // Check if paragraph only contains a strong element (used as pseudo-heading by LLMs)
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
        style={fontStyle}
        highContrast
      >
        {children}
      </Text>
    );
  },
  blockquote: ({ children }) => (
    <Blockquote size="2" mb="3" color="gray" style={fontStyle} highContrast>
      {children}
    </Blockquote>
  ),
  code: ({ children, className }) => {
    const isInline = !className?.includes("language-");
    if (isInline) {
      return (
        <Code
          size="2"
          variant="soft"
          color="gray"
          style={fontStyle}
          highContrast
        >
          {children}
        </Code>
      );
    }
    return <code>{children}</code>;
  },
  pre: ({ children }) => <CodeBlock size="1.5">{children}</CodeBlock>,
  em: ({ children }) => <Em>{children}</Em>,
  strong: ({ children }) => <Strong>{children}</Strong>,
  del: ({ children }) => (
    <del style={{ textDecoration: "line-through", color: "var(--gray-11)" }}>
      {children}
    </del>
  ),
  a: ({ href, children }) => (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={fontStyle}
    >
      {children}
    </Link>
  ),
  kbd: ({ children }) => <Kbd style={fontStyle}>{children}</Kbd>,
  ul: ({ children }) => (
    <List as="ul" size="1.5">
      {children}
    </List>
  ),
  ol: ({ children }) => (
    <List as="ol" size="1.5">
      {children}
    </List>
  ),
  li: ({ children }) => <ListItem size="1.5">{children}</ListItem>,
  hr: () => <Divider size="2" />,
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
  // Table components using Radix Table
  table: ({ children }) => (
    <Table.Root size="1" variant="surface" mb="3">
      {children}
    </Table.Root>
  ),
  thead: ({ children }) => <Table.Header>{children}</Table.Header>,
  tbody: ({ children }) => <Table.Body>{children}</Table.Body>,
  tr: ({ children }) => <Table.Row>{children}</Table.Row>,
  th: ({ children, style }) => (
    <Table.ColumnHeaderCell style={{ ...fontStyle, ...style }}>
      {children}
    </Table.ColumnHeaderCell>
  ),
  td: ({ children, style }) => (
    <Table.Cell style={{ ...fontStyle, ...style }}>{children}</Table.Cell>
  ),
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {preprocessMarkdown(content)}
    </ReactMarkdown>
  );
}
