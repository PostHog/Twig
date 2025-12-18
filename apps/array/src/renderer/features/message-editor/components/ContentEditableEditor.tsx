import { forwardRef } from "react";

interface ContentEditableEditorProps {
  disabled?: boolean;
  placeholder?: string;
  onInput: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
}

export const ContentEditableEditor = forwardRef<
  HTMLDivElement,
  ContentEditableEditorProps
>(
  (
    {
      disabled = false,
      placeholder = "Type a message...",
      onInput,
      onKeyDown,
      onPaste,
      onFocus,
      onCompositionStart,
      onCompositionEnd,
    },
    ref,
  ) => {
    return (
      // biome-ignore lint/a11y/useSemanticElements: contenteditable is intentional for rich mention chips
      <div
        ref={ref}
        className="cli-editor min-h-[1.5em] w-full break-words border-none bg-transparent font-mono text-[12px] text-[var(--gray-12)] outline-none [overflow-wrap:break-word] [white-space:pre-wrap] [word-break:break-word]"
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        tabIndex={disabled ? -1 : 0}
        aria-multiline="true"
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={onFocus}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
      />
    );
  },
);

ContentEditableEditor.displayName = "ContentEditableEditor";
