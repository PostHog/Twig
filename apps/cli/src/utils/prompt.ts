import { bold, cyan, dim, green } from "./output";

async function readKey(): Promise<string> {
  const { stdin } = process;

  if (!stdin.isTTY) {
    return "";
  }

  return new Promise((resolve) => {
    stdin.setRawMode(true);
    stdin.resume();

    stdin.once("data", (data: Buffer) => {
      stdin.setRawMode(false);
      stdin.pause();
      resolve(data.toString("utf-8"));
    });
  });
}

function shouldQuit(key: string): boolean {
  const char = key[0];
  return char === "q" || char === "Q" || key === "\x03" || key === "\x1b";
}

function hideCursor(): void {
  process.stdout.write("\x1b[?25l");
}

function showCursor(): void {
  process.stdout.write("\x1b[?25h");
}

export async function confirm(
  message: string,
  options?: { autoYes?: boolean; default?: boolean },
): Promise<boolean | null> {
  if (options?.autoYes) {
    console.log(`${green("✓")} ${bold(message)} ${dim("›")} Yes`);
    return true;
  }

  const defaultValue = options?.default ?? true;
  const selectOptions = defaultValue
    ? [
        { label: "Yes", value: "yes" as const },
        { label: "No", value: "no" as const },
      ]
    : [
        { label: "No", value: "no" as const },
        { label: "Yes", value: "yes" as const },
      ];

  const result = await select(message, selectOptions);
  if (result === null) return null;
  return result === "yes";
}

export async function select<T extends string>(
  message: string,
  options: { label: string; value: T; hint?: string }[],
): Promise<T | null> {
  let selected = 0;

  const render = (initial = false) => {
    // Move cursor up to redraw (except first render)
    if (!initial) {
      const lines = options.length + 1; // +1 for the message line
      process.stdout.write(`\x1b[${lines}A`);
    }

    console.log(
      `${cyan("?")} ${bold(message)} ${dim("› Use arrow keys. Return to submit.")}`,
    );
    for (const [i, opt] of options.entries()) {
      const isSelected = i === selected;
      const prefix = isSelected ? `${cyan("❯")}` : " ";
      const label = isSelected ? cyan(opt.label) : dim(opt.label);
      const hint = opt.hint ? ` ${dim(`(${opt.hint})`)}` : "";
      console.log(`${prefix}   ${label}${hint}`);
    }
  };

  hideCursor();

  // Initial render
  render(true);

  try {
    while (true) {
      const key = await readKey();

      if (shouldQuit(key)) {
        showCursor();
        return null;
      }

      // Enter confirms current selection
      if (key === "\r" || key === "\n") {
        // Clear and show final selection
        const lines = options.length + 1;
        process.stdout.write(`\x1b[${lines}A\x1b[J`);
        console.log(
          `${green("✓")} ${bold(message)} ${dim("›")} ${options[selected].label}`,
        );
        showCursor();
        return options[selected].value;
      }

      // Arrow up or k
      if (key === "\x1b[A" || key === "k") {
        selected = selected > 0 ? selected - 1 : options.length - 1;
        render();
      }

      // Arrow down or j
      if (key === "\x1b[B" || key === "j") {
        selected = selected < options.length - 1 ? selected + 1 : 0;
        render();
      }
    }
  } finally {
    showCursor();
  }
}
