import {
  admitResumeSpawn,
  resumeSpawnRefusal,
  suppressSavedResumeLaunch,
  type ResumeSpawnAdmission,
  type ResumeSpawnArgs
} from './saved-resume-admission'
import { admitClaudeResumeElsewhere } from './running-elsewhere-admission'

/** Runs only in the fresh branch, after stable/claimed owner adoption has settled. */
export async function chooseSavedResumeFreshLaunch(
  runtime: Parameters<typeof admitResumeSpawn>[0],
  args: ResumeSpawnArgs,
  wslDistro: string | null,
  options: ResumeSpawnArgs & { startupCommandDelivery?: unknown; startupIngress?: unknown },
  paneKey: string | null = null
): Promise<ResumeSpawnAdmission | null> {
  const saved = await admitResumeSpawn(runtime, args, wslDistro)
  const admission = resumeSpawnRefusal(saved)
    ? saved
    : ((await admitClaudeResumeElsewhere(
        { ...args, command: args.command ?? options.command },
        paneKey,
        wslDistro
      )) ?? saved)
  if (resumeSpawnRefusal(admission)) {
    suppressSavedResumeLaunch(args, options)
  }
  return admission
}
