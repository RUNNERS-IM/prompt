import { stripLeadingAgentTitleDecoration } from '../../../../shared/agent-title-decoration'

// Prompt: session names like "[PROMPT] 개발" read as "PROMPT 개발" in tabs. The status glyph the
// agent puts in front of its title is dropped too, since the tab icon already shows that state.
const LEADING_BRACKET_RE = /^\[([^\]\n]+)\]\s*/

export function promptTabLabel(title: string): string {
  const stripped = stripLeadingAgentTitleDecoration(title.trim())
  const match = LEADING_BRACKET_RE.exec(stripped)
  if (!match) {
    return stripped
  }
  const rest = stripped.slice(match[0].length)
  return rest.length > 0 ? `${match[1].trim()} ${rest}` : match[1].trim()
}
