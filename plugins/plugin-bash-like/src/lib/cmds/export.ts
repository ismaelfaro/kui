/*
 * Copyright 2019 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CommandRegistrar, IEvaluatorArgs } from '@kui-shell/core/models/command'
import sessionStore from '@kui-shell/core/models/sessionStore'
import { getTabIndex, getCurrentTab } from '@kui-shell/core/webapp/cli'
import { key } from '@kui-shell/core/core/repl'

/**
 * export command
 *
 */
const exportCommand = ({ parsedOptions }: IEvaluatorArgs) => {
  const storage = JSON.parse(sessionStore().getItem(key)) || {}

  const tabId = getTabIndex(getCurrentTab())
  const curDic = storage[tabId] || {}
  const toBeParsed = parsedOptions._[1]

  const arr = toBeParsed.split('=')

  curDic[arr[0]] = arr[1]

  storage[tabId] = curDic
  sessionStore().setItem(key, JSON.stringify(storage))
  return true
}

const usage = {
  command: 'export',
  docs: 'Export a variable or function to the environment of all the child processes running in the current shell'
}

/**
 * Register command handlers
 *
 */
export default (commandTree: CommandRegistrar) => {
  commandTree.listen('/export', exportCommand, { usage, noAuthOk: true })
}
