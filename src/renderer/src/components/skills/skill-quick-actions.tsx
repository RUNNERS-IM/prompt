import { ClipboardCopy, CornerDownLeft, FolderOpen, SquareSlash } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { formatClipboardFilePath } from '@/lib/clipboard-file-path'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { DiscoveredSkill } from '../../../../shared/skills'
import { skillSourceKindLabel } from './skill-display-labels'
import { insertSkillCommandIntoActiveTerminal, skillSlashCommand } from './skill-terminal-insert'

export async function copySkillCommand(skill: DiscoveredSkill): Promise<void> {
  const command = skillSlashCommand(skill)
  await window.api.ui.writeClipboardText(command)
  toast.success(
    translate('auto.components.skills.SkillQuickActions.commandCopied', 'Copied {{command}}', {
      command
    })
  )
}

export async function copySkillPath(
  skill: DiscoveredSkill,
  ownerHostId: ExecutionHostId
): Promise<void> {
  await window.api.ui.writeClipboardText(formatClipboardFilePath(skill.skillFilePath, ownerHostId))
  toast.success(translate('auto.components.skills.SkillRow.pathCopied', 'Path copied'))
}

/** Insert into the visible terminal and close Skills; copy instead when no terminal can take it. */
export async function typeSkillIntoTerminal(
  skill: DiscoveredSkill,
  closeSkills: () => void
): Promise<void> {
  const command = skillSlashCommand(skill)
  const result = insertSkillCommandIntoActiveTerminal(command)
  if (result === 'inserted') {
    closeSkills()
    return
  }
  await window.api.ui.writeClipboardText(command)
  toast.success(
    result === 'chat-view'
      ? translate(
          'auto.components.skills.SkillQuickActions.copiedForChat',
          'Copied {{command}}. Paste it into the chat box.',
          { command }
        )
      : translate(
          'auto.components.skills.SkillQuickActions.copiedNoTerminal',
          'No open terminal, so {{command}} was copied.',
          { command }
        )
  )
}

export function SkillRowQuickActions({
  skill,
  ownerHostId
}: {
  skill: DiscoveredSkill
  ownerHostId: ExecutionHostId
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="xs" onClick={() => void copySkillCommand(skill)}>
        <SquareSlash />
        {translate('auto.components.skills.SkillQuickActions.command', 'Command')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => void copySkillPath(skill, ownerHostId)}
      >
        <ClipboardCopy />
        {translate('auto.components.skills.SkillQuickActions.path', 'Path')}
      </Button>
    </div>
  )
}

export function SkillDetailPane({
  skill,
  ownerHostId,
  onUse,
  onReveal
}: {
  skill: DiscoveredSkill | null
  ownerHostId: ExecutionHostId
  onUse: (skill: DiscoveredSkill) => void
  onReveal: (skill: DiscoveredSkill) => void
}): React.JSX.Element {
  if (!skill) {
    return <aside className="hidden w-64 shrink-0 md:block" />
  }
  const command = skillSlashCommand(skill)
  return (
    <aside
      className="sticky top-0 hidden w-64 shrink-0 self-start rounded-md border border-border/60 bg-muted/30 p-4 text-xs md:block"
      data-skill-detail-pane=""
    >
      <div className="truncate text-sm font-medium">{skill.name}</div>
      <div className="mt-0.5 text-muted-foreground">{skillSourceKindLabel(skill)}</div>
      <p className="mt-3 line-clamp-[12] whitespace-pre-wrap text-[13px] leading-5">
        {skill.description ??
          translate('auto.components.skills.SkillsPage.9963dff6d3', 'No description found.')}
      </p>
      <div className="mt-3 break-all border-t border-border/60 pt-3 font-mono text-[11px] text-muted-foreground">
        {skill.skillFilePath}
      </div>
      <div className="mt-3 flex flex-col items-start gap-1.5">
        <Button type="button" size="xs" onClick={() => onUse(skill)}>
          <CornerDownLeft />
          {translate(
            'auto.components.skills.SkillQuickActions.insert',
            'Type {{command}} in terminal',
            { command }
          )}
        </Button>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void copySkillCommand(skill)}
          >
            <SquareSlash />
            {translate('auto.components.skills.SkillQuickActions.copyCommand', 'Copy command')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void copySkillPath(skill, ownerHostId)}
          >
            <ClipboardCopy />
            {translate('auto.components.skills.SkillRow.copyPath', 'Copy path')}
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => onReveal(skill)}>
            <FolderOpen />
            {translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file')}
          </Button>
        </div>
      </div>
    </aside>
  )
}
