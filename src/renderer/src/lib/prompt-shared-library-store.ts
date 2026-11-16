import { useSyncExternalStore } from 'react'
import type { SharedPromptItem } from '../../../shared/prompt-shared-library'

// 공용 프롬프트 목록을 창 하나에 한 번만 읽고, 파일이 바뀌면 main 이 보내 주는 새 목록으로 바꾼다.

const NO_ITEMS: readonly SharedPromptItem[] = []
let items: readonly SharedPromptItem[] = NO_ITEMS
let loaded = false
let started = false
const listeners = new Set<() => void>()

function publish(next: readonly SharedPromptItem[]): void {
  items = next.length > 0 ? next : NO_ITEMS
  loaded = true
  for (const listener of listeners) {
    listener()
  }
}

function start(): void {
  if (started) {
    return
  }
  started = true
  const api = window.api?.promptSharedLibrary
  if (!api) {
    // 웹 화면 · 원격 서버 창에는 이 맥의 파일이 없다.
    publish(NO_ITEMS)
    return
  }
  api.onChanged((next) => publish(next))
  void api
    .read()
    .then(publish)
    .catch(() => publish(NO_ITEMS))
}

function subscribe(listener: () => void): () => void {
  start()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSharedPrompts(): readonly SharedPromptItem[] {
  return items
}

/** 처음 읽기가 끝났는지. 기본 프롬프트를 넣을지 정하기 전에 본다. */
export function isSharedPromptsLoaded(): boolean {
  return loaded
}

export function subscribeSharedPrompts(listener: () => void): () => void {
  return subscribe(listener)
}

export function useSharedPrompts(): readonly SharedPromptItem[] {
  return useSyncExternalStore(subscribe, getSharedPrompts)
}
