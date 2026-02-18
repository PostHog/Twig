import { Blockquote } from "../components/blockquote";
import { Code } from "../components/code";
import { Em } from "../components/em";
import { Heading } from "../components/heading";
import { Kbd } from "../components/kbd";
import { Link } from "../components/link";
import { Quote } from "../components/quote";
import { Strong } from "../components/strong";
import { Text } from "../components/text";
import { ThemeToggle } from "../components/theme-toggle";

export default function Playground() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <Heading level={2}>Playground</Heading>
        <ThemeToggle />
      </div>

      <section>
        <Heading level={3} className="mb-6 border-b pb-2">
          Headings
        </Heading>
        <div className="flex flex-col gap-6">
          <Heading size={1}>Heading 1 (72px)</Heading>
          <Heading size={2}>Heading 2 (64px)</Heading>
          <Heading size={3}>Heading 3 (56px)</Heading>
          <Heading size={4}>Heading 4 (48px)</Heading>
          <Heading size={5}>Heading 5 (40px)</Heading>
          <Heading size={6}>Heading 6 (32px)</Heading>
          <Heading size={7}>Heading 7 (24px)</Heading>
          <Heading size={8}>Heading 8 (20px)</Heading>
          <Heading size={9}>Heading 9 (16px)</Heading>
          <Heading size={10}>Heading 10 (14px)</Heading>
        </div>
      </section>

      <section className="mt-12">
        <Heading level={3} className="mb-6 border-b pb-2">
          Text
        </Heading>
        <div className="flex flex-col gap-4">
          <Text>Body — The quick brown fox jumps over the lazy dog.</Text>
          <Text size="body-sm">
            Body Small — The quick brown fox jumps over the lazy dog.
          </Text>
          <Text size="caption">
            Caption — The quick brown fox jumps over the lazy dog.
          </Text>
          <Text size="code">
            Code size — The quick brown fox jumps over the lazy dog.
          </Text>
        </div>
      </section>

      <section className="mt-12">
        <Heading level={3} className="mb-6 border-b pb-2">
          Inline Elements
        </Heading>
        <div className="flex flex-col gap-4">
          <Text>
            This has <Strong>strong text</Strong> in it.
          </Text>
          <Text>
            This has <Em>emphasized text</Em> in it.
          </Text>
          <Text>
            This has <Code>inline code</Code> in it.
          </Text>
          <Text>
            This has a <Link href="/">link</Link> in it.
          </Text>
          <Text>
            Press <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd> to copy.
          </Text>
          <Text>
            She said <Quote>the quick brown fox</Quote> and left.
          </Text>
        </div>
      </section>

      <section className="mt-12">
        <Heading level={3} className="mb-6 border-b pb-2">
          Blockquote
        </Heading>
        <Blockquote>
          The best way to predict the future is to invent it.
        </Blockquote>
      </section>

      <section className="mt-12">
        <Heading level={3} className="mb-6 border-b pb-2">
          Colors
        </Heading>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md bg-primary" />
            <Text size="body-sm" as="span">
              Primary (#F66521)
            </Text>
          </div>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md border border-fg/20 bg-bg" />
            <Text size="body-sm" as="span">
              Background
            </Text>
          </div>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md bg-fg" />
            <Text size="body-sm" as="span">
              Foreground
            </Text>
          </div>
        </div>
      </section>
    </main>
  );
}
