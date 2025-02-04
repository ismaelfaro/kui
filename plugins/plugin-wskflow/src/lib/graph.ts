/*
 * Copyright 2017-19 IBM Corporation
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

interface IPort {
  id: string
}

export interface INode {
  readonly id: string
  readonly type?: string
  label: string
  name?: string
  value?: string
  taskIndex?: number
  tooltip?: string
  tooltipHeader?: string
  tooltipColor?: string
  prettyCode?: string
  fullFunctionCode?: string
  multiLineLabel?: string
  repeatCount?: string
  retryCount?: string
  width?: number
  height?: number
  layoutOptions?: Record<string, any>
  properties?: Record<string, any>
  ports?: IPort[]
  visited?: number[]
  children?: INode[]
  edges?: IEdge[]
  deployed?: boolean
  readonly onclick?: string
}

export interface INodeOptions {
  value?: string
  tooltip?: string
  tooltipHeader?: string
  leftToRight?: boolean
  renderFunctionsInView?: boolean
}

export interface IEdge {
  id: string
  source: string
  sourcePort: string
  target: string
  targetPort: string
  properties?: Record<string, any>
  visited?: boolean
}
