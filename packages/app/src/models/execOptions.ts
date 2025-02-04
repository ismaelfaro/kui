/*
 * Copyright 2017-18 IBM Corporation
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

import { ExecType } from './command'
import { ITab, Streamable } from '../webapp/cli'

export interface IExecOptions {
  // force execution in a given tab?
  tab?: ITab

  isProxied?: boolean
  noDelegation?: boolean
  delegationOk?: boolean

  leaveBottomStripeAlone?: boolean

  filter?: any
  contextChangeOK?: boolean
  credentials?: Record<string, any>

  custom?: any
  rawResponse?: boolean
  isDrilldown?: boolean
  block?: HTMLElement
  nextBlock?: HTMLElement
  placeholder?: string
  replSilence?: boolean
  quiet?: boolean
  intentional?: boolean
  noHistory?: boolean
  pip?: any
  history?: any
  echo?: boolean
  nested?: boolean
  failWithUsage?: boolean
  rethrowErrors?: boolean
  reportErrors?: boolean
  preserveBackButton?: boolean
  type?: ExecType

  exec?: 'pexec' | 'qexec'

  container?: Element
  raw?: boolean
  createOnly?: boolean
  noHeader?: boolean
  noStatus?: boolean
  noSidecarHeader?: boolean
  noRetry?: boolean
  showHeader?: boolean
  alreadyWatching?: boolean

  createOutputStream?: any
  stdout?: (str: Streamable) => any
  stderr?: (str: string) => any

  parameters?: any
  entity?: any
}

export class DefaultExecOptions implements IExecOptions {
  readonly type: ExecType

  constructor (type: ExecType = ExecType.TopLevel) {
    this.type = type
  }
}

export class DefaultExecOptionsForTab extends DefaultExecOptions {
  readonly tab: ITab

  constructor (tab: ITab) {
    super()
    this.tab = tab
  }
}

/** command line options */
export interface ParsedOptions {
  [ key: string ]: any
}
