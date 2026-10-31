#!/usr/bin/env node
import { main } from './index'

// `prompt` serves the new command tree; `orca` (index.ts) keeps the legacy one as an alias.
void main(undefined, undefined, 'prompt')
