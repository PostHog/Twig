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

interface TaskFileMentionListProps {
  items: MentionItem[];
  command: (item: {
    id: string;
    label: string;
    type?: string;
    urlId?: string;
  }) => void;
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

    if (props.items.length === 0) {
      return null;
    }

    return (
      <div
        ref={containerRef}
        className="scrollbar-hide absolute z-[1000] max-h-60 min-w-[300px] overflow-auto rounded font-mono text-xs shadow-xl"
        style={{
          backgroundColor: "var(--slate-1)",
          borderWidth: "1px",
          borderStyle: "solid",
          borderColor: "var(--orange-6)",
        }}
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
              className="flex w-full cursor-pointer items-center gap-1 px-2 py-0.5 text-left"
              style={{
                backgroundColor: isSelected ? "var(--orange-a3)" : undefined,
                color: isSelected ? "var(--orange-11)" : "var(--slate-11)",
              }}
            >
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
