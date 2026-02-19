import Image from "next/image";
import { Heading } from "./components/heading";
import { Text } from "./components/text";
import { ThemeToggle } from "./components/theme-toggle";
import { FlowDiagram } from "./features/flow-diagram/flow-diagram";
import { MasonryDemo } from "./features/masonry/masonry-demo";

export default function Home() {
  return (
    <main className="relative pb-0">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-screen bg-cover bg-top bg-no-repeat"
        style={{
          backgroundImage: "url(/tree-dithered.jpg)",
          maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 60%, transparent 100%)",
        }}
      />
      <div className="container pt-6">
        <header className="relative flex items-center justify-between border border-border bg-bg">
          <div className="flex items-center gap-8">
            <div className="p-4">
              <Image
                src="/assets/wordmark-dark.svg?v=3"
                alt="Twig"
                width={80}
                height={28}
                priority
              />
            </div>
            <nav className="flex h-full items-center gap-6">
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
          <div className="relative flex items-center">
            <ThemeToggle />
          </div>
        </header>
      </div>

      <div className="container">
        <section className="relative mt-[140px] w-full border border-border bg-bg md:w-[40%]">
          <div className="flex flex-col justify-center bg-bg p-8 md:px-16 md:py-16">
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
      </div>

      <section className="container relative mt-24">
        <MasonryDemo />
      </section>

      <section className="container relative mt-24">
        <div className="grid grid-cols-1 border border-border bg-bg md:grid-cols-[3fr_3fr]">
          <div className="relative flex items-center gap-8 pl-10 py-10">
            <div className="flex-1">
              <Heading size={5} className="text-balance mb-6">
                we want to make your product run itself
              </Heading>
              <div className="space-y-4">
                <Text size="body" className="text-fg/80">
                  You did not become an engineer to triage support tickets, or
                  break down marketing funnels. Context switching is your enemy.
                  You became an engineer to build products that change the
                  world.
                </Text>
                <Text size="body" className="text-fg/80">
                  Twig is an agent orchestrator that runs your product for you.
                  It autonomously identifies what needs to be done, executes the
                  work, and gives you the results to review.
                </Text>
              </div>
            </div>
            <Image
              src="/shrike-dithered-v3.png"
              alt=""
              width={300}
              height={300}
              className="pointer-events-none"
            />
          </div>
          <div className="flex items-center justify-center border-border bg-subtle p-2 md:border-l">
            <FlowDiagram />
          </div>
        </div>
      </section>

      <section className="container mt-24">
        <div className="divide-y divide-border border border-border bg-bg">
          <article className="grid grid-cols-2">
            <div className="p-16">
              <Heading size={4} className="mb-4">
                announcing twig: an agentic code
                <br />
                editor that understands your users
              </Heading>
              <Text
                size="small"
                className="uppercase tracking-wider text-fg/40"
              >
                JAN 2026
              </Text>
            </div>
            <div className="border-l border-border p-16">
              <div className="space-y-6">
                <Text size="body" className="text-fg/80">
                  at posthog, we've spent years building tools that help teams
                  understand their users. product analytics, session recordings,
                  feature flags, a/b testing - all designed to answer one
                  fundamental question: what do your users actually do?
                </Text>
                <Text size="body" className="text-fg/80">
                  then we looked at how software gets built, and something
                  struck us as deeply wrong.
                </Text>
                <Text size="body" className="font-medium text-fg">
                  code editors are stupid
                </Text>
                <Text size="body" className="text-fg/80">
                  not in the "they lack ai" sense. the latest generation of
                  ai-powered editors are remarkably capable at writing code.
                  they
                </Text>
                <a
                  href="/blog/announcing-twig"
                  className="inline-block text-body text-primary hover:text-primary/80"
                >
                  read more
                </a>
              </div>
            </div>
          </article>
          <article className="grid grid-cols-2">
            <div className="p-16">
              <Heading size={4} className="mb-4">
                announcing twig: an agentic code
                <br />
                editor that understands your users
              </Heading>
              <Text
                size="small"
                className="uppercase tracking-wider text-fg/40"
              >
                JAN 2026
              </Text>
            </div>
            <div className="border-l border-border p-16">
              <div className="space-y-6">
                <Text size="body" className="text-fg/80">
                  at posthog, we've spent years building tools that help teams
                  understand their users. product analytics, session recordings,
                  feature flags, a/b testing - all designed to answer one
                  fundamental question: what do your users actually do?
                </Text>
                <Text size="body" className="text-fg/80">
                  then we looked at how software gets built, and something
                  struck us as deeply wrong.
                </Text>
                <Text size="body" className="font-medium text-fg">
                  code editors are stupid
                </Text>
                <Text size="body" className="text-fg/80">
                  not in the "they lack ai" sense. the latest generation of
                  ai-powered editors are remarkably capable at writing code.
                  they
                </Text>
                <a
                  href="/blog/announcing-twig"
                  className="inline-block text-body text-primary hover:text-primary/80"
                >
                  read more
                </a>
              </div>
            </div>
          </article>
        </div>
      </section>

      <footer className="relative mt-0 text-[#f5f5f0]">
        <div className="relative">
          <img
            src="/mountain-dithered.png"
            alt=""
            className="pointer-events-none w-full"
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 50%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, black 50%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
            style={{
              background:
                "linear-gradient(to bottom, transparent 0%, #2a3a2a 100%)",
            }}
          />
          <div className="absolute inset-0 flex items-end justify-center pb-32">
            <div className="flex flex-col gap-4 bg-[#2a3a2a]/80 px-12 py-8 text-center backdrop-blur-sm">
              <Text
                size="small"
                className="font-medium uppercase tracking-wider text-[#f5f5f0]"
              >
                Wake Up
              </Text>
              <Text size="small" className="text-[#f5f5f0]/80">
                Go touch grass
                <br />
                (no seriously, you
                <br />
                have time while twig
                <br />
                is working)
              </Text>
              <a
                href="/grass"
                className="mt-2 border border-[#f5f5f0]/40 px-6 py-3 text-center text-small text-[#f5f5f0] transition-colors hover:bg-[#f5f5f0]/10"
              >
                touch some grass
              </a>
            </div>
          </div>
        </div>
        <div className="bg-[#2a3a2a]">
          <div className="container grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-8 pb-16 pt-8">
            <div className="flex flex-col gap-4">
              <Image
                src="/assets/wordmark-mono-light.svg"
                alt="Twig"
                width={100}
                height={35}
              />
              <Text size="small" className="text-[#f5f5f0]/60">
                an ai editor that understands
                <br />
                your product and user behavior
              </Text>
              <Text size="small" className="text-[#f5f5f0]/40">
                from the makers of PostHog
              </Text>
              <a
                href="/waitlist"
                className="text-small text-primary hover:text-primary/80"
              >
                // join the waitlist
              </a>
            </div>
            <div className="flex flex-col gap-3">
              <Text
                size="small"
                className="font-medium uppercase tracking-wider text-[#f5f5f0]/40"
              >
                About
              </Text>
              <a
                href="/robots"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                robots.txt
              </a>
              <a
                href="/faq"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                FAQ
              </a>
              <a
                href="/handbook"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                handbook
              </a>
              <a
                href="/blog"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                blog
              </a>
              <a
                href="/data"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                your data
              </a>
            </div>
            <div className="flex flex-col gap-3">
              <Text
                size="small"
                className="font-medium uppercase tracking-wider text-[#f5f5f0]/40"
              >
                Product
              </Text>
              <a
                href="/docs"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                docs
              </a>
              <a
                href="/coding"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                coding
              </a>
              <a
                href="/models"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                models
              </a>
              <a
                href="/integrations"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                integrations
              </a>
              <a
                href="/orchestration"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                orchestration
              </a>
            </div>
            <div className="flex flex-col gap-3">
              <Text
                size="small"
                className="font-medium uppercase tracking-wider text-[#f5f5f0]/40"
              >
                Connect
              </Text>
              <a
                href="https://discord.gg/twig"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                discord
              </a>
              <a
                href="https://github.com/twig"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                GitHub
              </a>
              <a
                href="https://youtube.com/@twig"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                YouTube
              </a>
              <a
                href="https://x.com/twig"
                className="text-small text-[#f5f5f0]/80 hover:text-[#f5f5f0]"
              >
                X (Twitter)
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
