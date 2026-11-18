import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Search, Share2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { useActiveSkillDiscoveryRuntimeTarget } from '@/hooks/use-active-skill-discovery-runtime-target'
import { useMountedRef } from '@/hooks/useMountedRef'
import {
  INSTALLED_AGENT_SKILLS_CHANGED_EVENT,
  INSTALLED_AGENT_SKILLS_REFRESHED_EVENT
} from '@/hooks/installed-agent-skills-change-event'
import { discoverSkillsForRuntimeTarget } from '@/runtime/runtime-skills-client'
import { getRuntimeTargetHostId } from '@/runtime/runtime-client-target'
import { useAppStore } from '@/store'
import { UNRESOLVED_OWNER_HOST_ID } from '../../../../shared/execution-host'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'
import type { DiscoveredSkill, SkillDiscoveryResult } from '../../../../shared/skills'
import { SkillDeleteResultBand } from '@/components/skills/SkillDeleteResultBand'
import { SkillInstallDialog } from '@/components/skills/SkillInstallDialog'
import { SkillShareDialog } from '@/components/skills/SkillShareDialog'
import { skillAgentByRootPath } from '@/components/skills/skill-agent-filter'
import { skillDeleteEligibilityReason } from '@/components/skills/skill-delete-selection'
import { eligibleShareSkillCount } from '@/components/skills/skill-share-selection'
import { skillSlashCommand } from '@/components/skills/skill-terminal-insert'
import { typeSkillIntoTerminal } from '@/components/skills/skill-quick-actions'
import { filterSkills } from '@/components/skills/skills-filter'
import { useSkillDeleteFlow } from '@/components/skills/use-skill-delete-flow'
import { useSkillDiscoveryHostLabel } from '@/components/skills/use-skill-discovery-host-label'
import emptyBoxPanda from '../../assets/panda-scene/empty_box.webp'
import lostPanda from '../../assets/panda-scene/lost.webp'

// 오른쪽 「스킬」 칸. 「프롬프트」 칸과 같은 모양(찾기 + 더하기, 이름 + 두 줄 설명, 누르면 입력줄)으로 두고,
// 여러 개 고르기 · 공유 링크처럼 넓은 화면이 필요한 일은 맨 아래에서 원래 스킬 창으로 연다.

function SkillLibraryEmptyState({
  image,
  line,
  onInstall
}: {
  image: string
  line: string
  onInstall: () => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <img src={image} alt="" className="size-24 object-contain" draggable={false} />
      <div className="text-[15px] font-semibold text-foreground">{line}</div>
      <Button type="button" size="sm" className="mt-2" onClick={onInstall}>
        {translate('prompt.library.skillInstall', 'Install skill')}
      </Button>
    </div>
  )
}

export default function SkillLibraryPanel(): React.JSX.Element {
  useUiLanguageRevision()
  const runtimeTarget = useActiveSkillDiscoveryRuntimeTarget()
  const hostLabel = useSkillDiscoveryHostLabel(runtimeTarget)
  const openSkillsPage = useAppStore((s) => s.openSkillsPage)
  const mountedRef = useMountedRef()
  const scanGenerationRef = useRef(0)
  const [result, setResult] = useState<SkillDiscoveryResult | null>(null)
  const [query, setQuery] = useState('')
  const [installOpen, setInstallOpen] = useState(false)
  const [shareSkills, setShareSkills] = useState<DiscoveredSkill[]>([])

  const loadSkills = useCallback(
    async (refresh = false): Promise<void> => {
      const generation = ++scanGenerationRef.current
      if (!runtimeTarget) {
        return
      }
      try {
        const next = await discoverSkillsForRuntimeTarget(
          runtimeTarget,
          PROMPT_BLOCK_UPSTREAM_SERVICES
            ? {
                includeClaudeCommands: true,
                ...(refresh ? { refresh: true } : {})
              }
            : refresh
              ? { refresh: true }
              : undefined
        )
        if (mountedRef.current && generation === scanGenerationRef.current) {
          setResult(next)
        }
      } catch (error) {
        console.error('Failed to discover skills:', error)
      }
    },
    [mountedRef, runtimeTarget]
  )

  useEffect(() => {
    // 맥을 바꾸면 앞 맥의 목록을 남기지 않는다.
    setResult(null)
    void loadSkills()
  }, [loadSkills])

  useEffect(() => {
    const refresh = (): void => void loadSkills()
    window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refresh)
    window.addEventListener(INSTALLED_AGENT_SKILLS_REFRESHED_EVENT, refresh)
    return () => {
      window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refresh)
      window.removeEventListener(INSTALLED_AGENT_SKILLS_REFRESHED_EVENT, refresh)
    }
  }, [loadSkills])

  const deleteFlow = useSkillDeleteFlow(runtimeTarget, hostLabel, () => void loadSkills(true))

  const skills = useMemo(() => result?.skills ?? [], [result])
  const local = runtimeTarget?.kind === 'local'
  const ownerHostId = runtimeTarget
    ? getRuntimeTargetHostId(runtimeTarget)
    : UNRESOLVED_OWNER_HOST_ID
  const agentByRootPath = useMemo(() => skillAgentByRootPath(result), [result])
  const visibleSkills = useMemo(
    () => filterSkills(skills, { query, sourceKind: 'all', agent: 'all' }, agentByRootPath),
    [agentByRootPath, query, skills]
  )

  const openFile = async (skill: DiscoveredSkill): Promise<void> => {
    if (!(await window.api.shell.openFilePath(skill.skillFilePath, ownerHostId))) {
      toast.error(translate('prompt.library.skillOpenFailed', 'Could not open the skill file'))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate('prompt.library.skillSearch', 'Search skills')}
            className="h-7 pl-6 text-xs"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          aria-label={translate('prompt.library.skillInstall', 'Install skill')}
          onClick={() => setInstallOpen(true)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {deleteFlow.result ? (
        <SkillDeleteResultBand result={deleteFlow.result} onDismiss={deleteFlow.dismissResult} />
      ) : null}
      {!result ? (
        <div className="min-h-0 flex-1" />
      ) : skills.length === 0 ? (
        <SkillLibraryEmptyState
          image={emptyBoxPanda}
          line={translate('prompt.library.skillEmpty', 'No skills installed yet')}
          onInstall={() => setInstallOpen(true)}
        />
      ) : visibleSkills.length === 0 ? (
        <SkillLibraryEmptyState
          image={lostPanda}
          line={translate('prompt.library.skillNoResults', 'No skills match your search')}
          onInstall={() => setInstallOpen(true)}
        />
      ) : (
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto px-1 pb-2">
          {visibleSkills.map((skill) => {
            const canShare = eligibleShareSkillCount([skill], local) > 0
            const canDelete = deleteFlow.supported && skillDeleteEligibilityReason(skill) === null
            return (
              <div key={skill.id} className="group relative rounded-md hover:bg-accent/60">
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left"
                  onClick={() => void typeSkillIntoTerminal(skill, () => {})}
                >
                  <div className="truncate pr-16 text-[13px] font-semibold text-foreground">
                    {skillSlashCommand(skill)}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {skill.description ??
                      translate('prompt.library.skillNoDescription', 'No description')}
                  </div>
                </button>
                <div className="absolute top-1 right-1 hidden gap-0.5 group-focus-within:flex group-hover:flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={translate('prompt.library.skillOpenFile', 'Open file')}
                    title={translate('prompt.library.skillOpenFile', 'Open file')}
                    onClick={() => void openFile(skill)}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  {canShare ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate('prompt.library.skillShare', 'Share')}
                      title={translate('prompt.library.skillShare', 'Share')}
                      onClick={() => setShareSkills([skill])}
                    >
                      <Share2 className="size-3" />
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate('prompt.library.delete', 'Delete')}
                      title={translate('prompt.library.delete', 'Delete')}
                      onClick={() => void deleteFlow.requestDelete([skill])}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <button
        type="button"
        className="mx-3 mt-1 mb-2 self-start text-[11px] leading-4 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={openSkillsPage}
      >
        {translate('prompt.library.skillManage', 'Shared links · delete several')}
      </button>
      <SkillShareDialog
        skills={shareSkills}
        open={shareSkills.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setShareSkills([])
          }
        }}
      />
      <SkillInstallDialog
        key="panel-install"
        open={installOpen}
        initialLink=""
        onOpenChange={setInstallOpen}
      />
    </div>
  )
}
