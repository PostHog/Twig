import Image from "next/image";
import { Heading } from "./components/heading";
import { Text } from "./components/text";
import { ThemeToggle } from "./components/theme-toggle";
import { MasonryDemo } from "./features/masonry/masonry-demo";

export default function Home() {
  return (
    <main>
      <header className="flex items-center justify-between border-border border-b">
        <div className="flex items-center gap-8">
          <div className="bg-fg p-4">
            <Image
              src="/assets/wordmark-dark.svg"
              alt="Twig"
              width={80}
              height={28}
              className="dark:hidden"
              priority
            />
            <Image
              src="/assets/wordmark-light.svg"
              alt="Twig"
              width={80}
              height={28}
              className="hidden dark:block"
              priority
            />
          </div>
          <nav className="flex items-center gap-6">
            <a
              href="/blog"
              className="text-body text-fg transition-colors hover:text-fg/60"
            >
              Blog
            </a>
            <a
              href="/docs"
              className="text-body text-fg transition-colors hover:text-fg/60"
            >
              Docs
            </a>
            <a
              href="/changelog"
              className="text-body text-fg transition-colors hover:text-fg/60"
            >
              Changelog
            </a>
          </nav>
        </div>
        <div>
          <ThemeToggle />
        </div>
      </header>

      <section className="border-border border-b p-8 md:px-16 md:py-16">
        <div className="max-w-4xl">
          <Heading size={2} className="mb-8">
            product engineering
            <br />
            <span className="text-primary">&gt;</span>evolved
          </Heading>
          <div className="space-y-6">
            <div className="space-y-4">
              <Text size="body" className="text-fg/80">
                Codex, Claude Code, and similar tools accelerate code
                generation, but you always make the first move.
              </Text>
              <Text size="body" className="text-fg/80">
                Twig determines what matters right now, runs autonomous work
                against it, and hands you contextual code to merge, kill or
                iterate on.
              </Text>
            </div>
            <div className="flex gap-4">
              <a
                href="/download"
                className="flex items-center gap-2 border border-border bg-fg px-6 py-3 font-medium text-bg text-body transition-colors hover:bg-fg/90"
              >
                Download Twig
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-label="Download icon"
                >
                  <title>Download</title>
                  <path
                    d="M10 3V13M10 13L6 9M10 13L14 9M3 17H17"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <a
                href="/docs"
                className="flex items-center gap-2 border border-border bg-bg px-6 py-3 font-medium text-body text-fg transition-colors hover:bg-fg/5"
              >
                Learn how it works
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-label="Arrow icon"
                >
                  <title>Arrow</title>
                  <path
                    d="M7 10H17M17 10L13 6M17 10L13 14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="flex justify-center border-border border-b">
        <MasonryDemo />
      </section>
    </main>
  );
}
