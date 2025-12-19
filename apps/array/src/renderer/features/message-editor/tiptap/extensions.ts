import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { createCommandMention } from "./CommandMention";
import { createFileMention } from "./FileMention";
import { MentionChipNode } from "./MentionChipNode";

export interface EditorExtensionsOptions {
  sessionId: string;
  placeholder?: string;
  fileMentions?: boolean;
  commands?: boolean;
  onCommandSubmit?: (text: string) => void;
  onClearDraft?: () => void;
}

export function getEditorExtensions(options: EditorExtensionsOptions) {
  const {
    sessionId,
    placeholder = "",
    fileMentions = true,
    commands = true,
    onCommandSubmit,
    onClearDraft,
  } = options;

  const extensions = [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      horizontalRule: false,
      bold: false,
      italic: false,
      strike: false,
      code: false,
    }),
    Placeholder.configure({ placeholder }),
    MentionChipNode,
  ];

  if (fileMentions) {
    extensions.push(createFileMention(sessionId));
  }

  if (commands) {
    extensions.push(
      createCommandMention({
        sessionId,
        onSubmit: onCommandSubmit,
        onClearDraft,
      }),
    );
  }

  return extensions;
}
