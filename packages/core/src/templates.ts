export const CHANGESET_JSON_TEMPLATE =
  '"{" ++' +
  '"\\"base\\":" ++ json(self) ++ "," ++' +
  '"\\"parentChangeIds\\":[" ++ parents.map(|p| "\\"" ++ p.change_id() ++ "\\"").join(",") ++ "]," ++' +
  '"\\"empty\\":" ++ json(empty) ++ "," ++' +
  '"\\"conflict\\":" ++ json(conflict) ++ "," ++' +
  '"\\"immutable\\":" ++ json(immutable) ++ "," ++' +
  '"\\"workingCopy\\":" ++ json(current_working_copy) ++ "," ++' +
  '"\\"bookmarks\\":" ++ json(local_bookmarks) ++ "," ++' +
  '"\\"changeIdPrefix\\":\\"" ++ change_id.shortest().prefix() ++ "\\"," ++' +
  '"\\"commitIdPrefix\\":\\"" ++ commit_id.shortest().prefix() ++ "\\"" ++' +
  '"}\\n"';

/**
 * Template for log graph output with placeholders.
 * jj handles graph rendering (markers like @, ○, ◆ and │ prefixes).
 * We replace jj's markers with styled versions in post-processing.
 *
 * Output format per change:
 * - Immutable (trunk): {{TRUNK:bookmark}} + time + commit (no trailing blank line)
 * - Mutable: {{LABEL:...}} + time + hints + PR info + commit
 */
export const LOG_GRAPH_TEMPLATE = `
if(immutable,
  "{{TRUNK:" ++ local_bookmarks.map(|b| b.name()).join(",") ++ "}}\\n" ++
  "{{TIME:" ++ committer.timestamp().format("%s") ++ "}}\\n" ++
  "{{COMMIT:" ++ commit_id.short(8) ++ "|" ++ commit_id.shortest().prefix() ++ "|" ++ if(description, description.first_line(), "") ++ "}}",
  "{{LABEL:" ++ change_id.short(8) ++ "|" ++ change_id.shortest().prefix() ++ "|" ++ committer.timestamp().format("%s") ++ "|" ++ if(description, description.first_line(), "") ++ "|" ++ if(conflict, "1", "0") ++ "|" ++ if(current_working_copy, "1", "0") ++ "|" ++ if(empty, "1", "0") ++ "|" ++ if(immutable, "1", "0") ++ "|" ++ local_bookmarks.map(|b| b.name()).join(",") ++ "|" ++ remote_bookmarks.map(|b| b.name()).join(",") ++ "}}\\n" ++
  "{{TIME:" ++ committer.timestamp().format("%s") ++ "}}\\n" ++
  if(current_working_copy && empty && !description, "{{HINT_EMPTY}}\\n", "") ++
  if(current_working_copy && !empty && !description, "{{HINT_UNCOMMITTED}}\\n", "") ++
  if(current_working_copy && description && local_bookmarks, "{{HINT_SUBMIT}}\\n", "") ++
  "\\n" ++
  if(local_bookmarks, "{{PR:" ++ local_bookmarks.map(|b| b.name()).join(",") ++ "|" ++ if(description, description.first_line(), "") ++ "}}\\n{{PRURL:" ++ local_bookmarks.map(|b| b.name()).join(",") ++ "}}\\n", "") ++
  "{{COMMIT:" ++ commit_id.short(8) ++ "|" ++ commit_id.shortest().prefix() ++ "|" ++ if(description, description.first_line(), "") ++ "}}\\n" ++
  "\\n"
)
`.trim();
