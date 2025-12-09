import { FileIcon } from "@phosphor-icons/react";
import type { MentionItem } from "@shared/types";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import {
  type ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

export type MentionState =
  | "loading"
  | "no-directory"
  | "no-results"
  | "has-results";

interface TaskFileMentionListProps {
  items: MentionItem[];
  command: (item: {
    id: string;
    label: string;
    type?: string;
    urlId?: string;
  }) => void;
  state: MentionState;
  query: string;
  directoryName?: string;
}

export interface TaskFileMentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const TaskFileMentionList = forwardRef(
  (
    props: TaskFileMentionListProps,
    ref: ForwardedRef<TaskFileMentionListRef>,
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const scrollIntoView = (index: number) => {
      const container = containerRef.current;
      const item = itemRefs.current[index];

      if (!container || !item) return;

      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;

      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;

      if (itemTop < containerTop) {
        container.scrollTop = itemTop;
      } else if (itemBottom > containerBottom) {
        container.scrollTop = itemBottom - container.clientHeight;
      }
    };

    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item?.path) {
        props.command({
          id: item.path,
          label: item.name || item.path.split("/").pop() || item.path,
          type: "file",
        });
      }
    };

    const upHandler = () => {
      const newIndex =
        (selectedIndex + props.items.length - 1) % props.items.length;
      flushSync(() => {
        setSelectedIndex(newIndex);
      });
      scrollIntoView(newIndex);
    };

    const downHandler = () => {
      const newIndex = (selectedIndex + 1) % props.items.length;
      flushSync(() => {
        setSelectedIndex(newIndex);
      });
      scrollIntoView(newIndex);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), []);

    useEffect(() => {
      itemRefs.current = itemRefs.current.slice(0, props.items.length);
    }, [props.items.length]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }

        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }

        if (event.key === "Enter") {
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    const containerStyles = {
      backgroundColor: "var(--slate-1)",
      borderWidth: "1px",
      borderStyle: "solid" as const,
      borderColor: "var(--orange-6)",
    };

    const emptyStateStyles = {
      padding: "12px 16px",
      color: "var(--slate-11)",
      fontSize: "12px",
    };

    // Show empty states
    if (props.state === "no-directory") {
      return (
        <div
          className="scrollbar-hide absolute z-[1000] min-w-[300px] rounded font-mono text-xs shadow-xl"
          style={containerStyles}
        >
          <div style={emptyStateStyles}>
            <span style={{ color: "var(--orange-11)" }}>
              Select a working directory first
            </span>
          </div>
        </div>
      );
    }

    if (props.state === "loading") {
      return (
        <div
          className="scrollbar-hide absolute z-[1000] min-w-[300px] rounded font-mono text-xs shadow-xl"
          style={containerStyles}
        >
          <div style={emptyStateStyles}>
            <span style={{ color: "var(--slate-10)" }}>Searching files...</span>
          </div>
        </div>
      );
    }

    if (props.state === "no-results") {
      return (
        <div
          className="scrollbar-hide absolute z-[1000] min-w-[300px] rounded font-mono text-xs shadow-xl"
          style={containerStyles}
        >
          <div style={emptyStateStyles}>
            {props.query ? (
              <span>
                No files matching{" "}
                <span style={{ color: "var(--orange-11)" }}>
                  "{props.query}"
                </span>
                {props.directoryName && (
                  <span style={{ color: "var(--slate-10)" }}>
                    {" "}
                    in {props.directoryName}
                  </span>
                )}
              </span>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <span style={{ color: "var(--slate-12)" }}>
                  Search for files to add as context
                </span>
                <span style={{ color: "var(--slate-10)", fontSize: "11px" }}>
                  Type a filename or path, e.g.{" "}
                  <span style={{ color: "var(--orange-11)" }}>README</span> or{" "}
                  <span style={{ color: "var(--orange-11)" }}>src/index</span>
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="scrollbar-hide absolute z-[1000] max-h-60 min-w-[300px] overflow-auto rounded font-mono text-xs shadow-xl"
        style={containerStyles}
      >
        {props.items.map((item, index) => {
          const isSelected = index === selectedIndex;
          const key = item.path || `item-${index}`;

          return (
            <button
              type="button"
              key={key}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              className="flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left"
              style={{
                backgroundColor: isSelected ? "var(--orange-a3)" : undefined,
                color: isSelected ? "var(--orange-11)" : "var(--slate-11)",
              }}
            >
              <FileIcon
                size={14}
                weight="regular"
                style={{
                  flexShrink: 0,
                  color: isSelected ? "var(--orange-11)" : "var(--slate-10)",
                }}
              />
              <span
                className={`overflow-hidden text-ellipsis whitespace-nowrap font-mono ${
                  isSelected ? "font-medium" : "font-normal"
                }`}
                style={{ fontSize: "12px" }}
              >
                {item.path}
              </span>
            </button>
          );
        })}
      </div>
    );
  },
);

TaskFileMentionList.displayName = "TaskFileMentionList";
