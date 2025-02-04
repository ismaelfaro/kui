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

import * as Debug from 'debug'

import { qexec as $$ } from '@kui-shell/core/core/repl'
import { ITab } from '@kui-shell/core/webapp/cli'
import drilldown from '@kui-shell/core/webapp/picture-in-picture'
import { formatMultiListResult } from '@kui-shell/core/webapp/views/table'
import { ISidecarMode } from '@kui-shell/core/webapp/bottom-stripe'
import { Table } from '@kui-shell/core/webapp/models/table'

import { selectorToString } from '../../util/selectors'

import { IResource, IKubeResource } from '../../model/resource'
import { TrafficLight } from '../../model/states'

import insertView from '../insert-view'
import { formatTable } from '../formatMultiTable'

import { ModeRegistration } from '@kui-shell/plugin-k8s/lib/view/modes/registrar'

const debug = Debug('k8s/view/modes/pods')

/** for drilldown back button */
const viewName = 'Pods'

/**
 * Add a Pods mode button to the given modes model, if called for by
 * the given resource.
 *
 */
export const podMode: ModeRegistration = {
  when: (resource: IKubeResource) => {
    // let's see if the resource refers to a pod in some fashion
    return (resource.spec !== undefined && resource.spec.selector !== undefined) || // e.g. Deployment
      (resource.status !== undefined && resource.status.podName !== undefined) // e.g. tekton TaskRun or PipelineRun
  },
  mode: (command: string, resource: IResource) => {
    debug('addPods', resource)
    try {
      return podsButton(command, resource)
    } catch (err) {
      debug('error rendering pods button')
      console.error(err)
    }
  }
}

/**
 * Return a sidecar mode button model that shows a pods table for the
 * given resource
 *
 */
const podsButton = (command: string, resource: IResource, overrides?) => Object.assign({}, {
  mode: 'pods',
  direct: {
    plugin: 'k8s',
    module: 'lib/view/modes/pods',
    operation: 'renderAndViewPods',
    parameters: { command, resource }
  }
}, overrides || {})

/**
 * Render the tabular pods view
 *
 */
interface IParameters {
  command: string
  resource: IResource
}

export const renderAndViewPods = async (tab: ITab, parameters: IParameters) => {
  const { command, resource } = parameters
  debug('renderAndViewPods', command, resource)

  const { selector } = resource.resource.spec

  const getPods = selector
    ? `kubectl get pods ${selectorToString(selector)} -n "${resource.resource.metadata.namespace}"`
    : `kubectl get pods ${resource.resource.status.podName} -n "${resource.resource.metadata.namespace}"`
  debug('getPods', getPods)

  const tableModel: Table = await $$(getPods)

  const tableView = formatTable(tab, tableModel, { usePip: false, viewName, execOptions: { delegationOk: true } })
  return insertView(tab)(tableView)
}
