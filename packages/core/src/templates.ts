// Fast template without diff stats
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

// Template with diff stats (slower, use only when needed)
export const CHANGESET_WITH_STATS_TEMPLATE =
  '"{" ++' +
  '"\\"base\\":" ++ json(self) ++ "," ++' +
  '"\\"parentChangeIds\\":[" ++ parents.map(|p| "\\"" ++ p.change_id() ++ "\\"").join(",") ++ "]," ++' +
  '"\\"empty\\":" ++ json(empty) ++ "," ++' +
  '"\\"conflict\\":" ++ json(conflict) ++ "," ++' +
  '"\\"immutable\\":" ++ json(immutable) ++ "," ++' +
  '"\\"workingCopy\\":" ++ json(current_working_copy) ++ "," ++' +
  '"\\"bookmarks\\":" ++ json(local_bookmarks) ++ "," ++' +
  '"\\"changeIdPrefix\\":\\"" ++ change_id.shortest().prefix() ++ "\\"," ++' +
  '"\\"commitIdPrefix\\":\\"" ++ commit_id.shortest().prefix() ++ "\\"," ++' +
  '"\\"diffStats\\":{\\"filesChanged\\":" ++ self.diff().stat().files().len() ++ "," ++' +
  '"\\"insertions\\":" ++ self.diff().stat().total_added() ++ "," ++' +
  '"\\"deletions\\":" ++ self.diff().stat().total_removed() ++ "}" ++' +
  '"}\\n"';

/**
 * Template for log graph output with placeholders.
 * jj handles graph rendering, we handle formatting.
 *
 * Output format per change:
 * {{LABEL:changeId|prefix|timestamp|description|conflict|wc|empty|immutable|localBookmarks|remoteBookmarks|added|removed|files}}
 * {{TIME:timestamp}}
 * {{HINT_EMPTY}} (if empty working copy)
 * {{HINT_UNCOMMITTED}} (if uncommitted changes)
 * {{PR:bookmarks|description}} (if has bookmarks)
 * {{PRURL:bookmarks}} (if has bookmarks)
 * {{COMMIT:commitId|prefix|description}}
 */
export const LOG_GRAPH_TEMPLATE = `
"{{LABEL:" ++ change_id.short(8) ++ "|" ++ change_id.shortest().prefix() ++ "|" ++ committer.timestamp().format("%s") ++ "|" ++ if(description, description.first_line(), "") ++ "|" ++ if(conflict, "1", "0") ++ "|" ++ if(current_working_copy, "1", "0") ++ "|" ++ if(empty, "1", "0") ++ "|" ++ if(immutable, "1", "0") ++ "|" ++ local_bookmarks.map(|b| b.name()).join(",") ++ "|" ++ remote_bookmarks.map(|b| b.name()).join(",") ++ "|" ++ diff.stat().total_added() ++ "|" ++ diff.stat().total_removed() ++ "|" ++ diff.stat().files().len() ++ "}}\\n" ++
"{{TIME:" ++ committer.timestamp().format("%s") ++ "}}\\n" ++
if(current_working_copy && empty, "{{HINT_EMPTY}}\\n", "") ++
if(current_working_copy && !empty && !description, "{{HINT_UNCOMMITTED}}\\n", "") ++
"\\n" ++
if(!immutable && local_bookmarks, "{{PR:" ++ local_bookmarks.map(|b| b.name()).join(",") ++ "|" ++ if(description, description.first_line(), "") ++ "}}\\n{{PRURL:" ++ local_bookmarks.map(|b| b.name()).join(",") ++ "}}\\n\\n", "") ++
"{{COMMIT:" ++ commit_id.short(8) ++ "|" ++ commit_id.shortest().prefix() ++ "|" ++ if(description, description.first_line(), "") ++ "}}\\n" ++
"\\n"
`.trim();
