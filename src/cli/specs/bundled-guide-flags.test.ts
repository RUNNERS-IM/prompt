import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILL_GUIDES } from '../bundled-skill-guides'
import { validateCommandAndFlags, type CommandSpec } from '../args'
import { COMMAND_SPECS } from './index'
import { PROMPT_COMMAND_SPECS } from '../command-tree/prompt-command-specs'

type GuideInvocation = {
  guide: string
  /** Which tree the invocation names: `prompt` paths or legacy `orca` ones. */
  tree: 'prompt' | 'orca'
  command: string
  flag: string
  snippet: string
}

const CLI_INVOCATION = /(?:^|[\s`(])(orca|orca-dev|orca-ide|ORCA|prompt|PROMPT)\s+([^\n`]*)/g

// Longest path first so `orchestration worker-start` never resolves as `orchestration worker`.
const byDepth = (specs: CommandSpec[]): CommandSpec[] =>
  [...specs].sort((a, b) => b.path.length - a.path.length)
const SPECS_BY_TREE = { orca: byDepth(COMMAND_SPECS), prompt: byDepth(PROMPT_COMMAND_SPECS) }

function findSpecForInvocation(
  tree: 'prompt' | 'orca',
  invocation: string
): CommandSpec | undefined {
  return SPECS_BY_TREE[tree].find((spec) => {
    const prefix = `${spec.path.join(' ')} `
    return invocation === spec.path.join(' ') || invocation.startsWith(prefix)
  })
}

function collectGuideInvocations(): GuideInvocation[] {
  const found: GuideInvocation[] = []
  for (const guide of BUNDLED_SKILL_GUIDES) {
    const documents = [guide.markdown, ...guide.references.map((reference) => reference.markdown)]
    for (const match of documents.join('\n').matchAll(CLI_INVOCATION)) {
      const tree = match[1].toLowerCase() === 'prompt' ? 'prompt' : 'orca'
      const invocation = match[2].trim()
      const spec = findSpecForInvocation(tree, invocation)
      if (!spec) {
        continue
      }
      // Quoted values contain nested commands whose flags do not belong to orca.
      const orcaArgs = invocation.replace(/'[^']*'|"[^"]*"/g, ' ')
      const flags = [...orcaArgs.matchAll(/(?:^|[\s[(])--([a-z][a-z0-9-]*)/g)].map(
        (flag) => flag[1]
      )
      for (const flag of flags) {
        found.push({
          guide: guide.name,
          tree,
          command: spec.path.join(' '),
          flag,
          snippet: invocation.slice(0, 120)
        })
      }
    }
  }
  return found
}

describe('bundled skill guides', () => {
  const invocations = collectGuideInvocations()

  it('only documents flags the CLI parser accepts', () => {
    expect(invocations.filter((invocation) => invocation.tree === 'prompt').length).toBeGreaterThan(
      0
    )
    const rejected = invocations.filter((invocation) => {
      const specs = invocation.tree === 'prompt' ? PROMPT_COMMAND_SPECS : COMMAND_SPECS
      const spec = specs.find((candidate) => candidate.path.join(' ') === invocation.command)
      // Prompt specs show --workspace/--project where the reused handler reads --worktree/--repo.
      const flag = spec?.flagAliases?.[invocation.flag] ?? invocation.flag
      try {
        validateCommandAndFlags(specs, {
          commandPath: invocation.command.split(' '),
          flags: new Map([[flag, 'placeholder']])
        })
        return false
      } catch {
        return true
      }
    })
    expect(
      rejected.map((entry) => `${entry.guide}: ${entry.command} --${entry.flag} (${entry.snippet})`)
    ).toEqual([])
  })
})
