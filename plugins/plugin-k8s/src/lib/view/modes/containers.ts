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
import { ITab } from '@kui-shell/core/webapp/cli'
import drilldown from '@kui-shell/core/webapp/picture-in-picture'
import { formatMultiListResult } from '@kui-shell/core/webapp/views/table'
import { Row, Table } from '@kui-shell/core/webapp/models/table'
import { ISidecarMode } from '@kui-shell/core/webapp/bottom-stripe'

import { IResource, IKubeResource } from '../../model/resource'

import { TrafficLight } from '../../model/states'

import insertView from '../insert-view'
import { getActiveView, formatTable } from '../formatMultiTable'

import { ModeRegistration } from '@kui-shell/plugin-k8s/lib/view/modes/registrar'
const debug = Debug('k8s/view/modes/containers')

import repl = require('@kui-shell/core/core/repl')

/** for drilldown back button */
const viewName = 'Containers'

/**
 * Add a Containers mode button to the given modes model, if called
 * for by the given resource.
 *
 */
export const containersMode: ModeRegistration = {
  when: (resource: IKubeResource) => {
    return resource.spec && resource.spec.containers
  },
  mode: (command: string, resource: IResource) => {
    try {
      return containersButton(command, resource)
    } catch (err) {
      debug('error rendering containers button')
      console.error(err)
    }
  }
}

/**
 * Return a sidecar mode button model that shows a containers table
 * for the given resource
 *
 */
export const containersButton = (command: string, resource: IResource, overrides?) => Object.assign({}, {
  mode: 'containers',
  direct: {
    plugin: 'k8s',
    module: 'lib/view/modes/containers',
    operation: 'renderAndViewContainers',
    parameters: { command, resource }
  }
}, overrides || {})

/**
 * Format a timestamp field from the status.containers model; these might be null
 *
 */
const formatTimestamp = (timestamp: string): string => {
  debug('formatTimestamp', timestamp)

  if (!timestamp) {
    return ''
  } else {
    return new Date(timestamp).toLocaleString()
  }
}

/**
 * Render the tabular containers view
 *
 */
export const renderContainers = async (tab: ITab, command: string, resource: IResource) => {
  debug('renderContainers', command, resource)

  return formatTable(tab, {
    header: headerModel(resource),
    body: bodyModel(tab, resource),
    noSort: true,
    title: 'Containers'
  })
}

/**
 * Render the table header model
 *
 */
const headerModel = (resource: IResource): Row => {
  const statuses = resource.resource.status && resource.resource.status.containerStatuses

  const specAttrs = [
    { value: 'PORTS', outerCSS: 'header-cell pretty-narrow' }
  ]

  const statusAttrs = !statuses ? [] : [
    { value: 'RESTARTS', outerCSS: 'header-cell very-narrow' },
    { value: 'READY', outerCSS: 'header-cell very-narrow' },
    { value: 'STATE', outerCSS: 'header-cell pretty-narrow' },
    { value: 'MESSAGE', outerCSS: 'header-cell' }
  ]

  return {
    type: 'container',
    name: 'IMAGE',
    outerCSS: 'header-cell not-too-wide',
    attributes: specAttrs.concat(statusAttrs)
  }
}

/**
 * Render the table body model
 *
 */
const bodyModel = (tab: ITab, resource: IResource): Row[] => {
  const pod = resource.resource
  const statuses = pod.status && pod.status.containerStatuses

  const podName = repl.encodeComponent(pod.metadata.name)
  const ns = repl.encodeComponent(pod.metadata.namespace)

  const bodyModel: Row[] = pod.spec.containers.map(container => {
    const status = statuses && statuses.find(_ => _.name === container.name)
    debug('container status', container.name, status.restartCount, status)

    const stateKey = Object.keys(status.state)[0]
    const stateBody = status.state[stateKey]

    const statusAttrs: any[] = !status ? [] : [
      {
        key: 'restartCount',
        value: status.restartCount,
        outerCSS: 'very-narrow'
      },
      {
        key: 'ready',
        value: status.ready,
        fontawesome: status.ready ? 'fas fa-check-circle' : 'far fa-dot-circle',
        css: status.ready ? 'green-text' : 'yellow-text'
      },
      {
        key: 'state',
        value: stateKey,
        tag: 'badge',
        outerCSS: 'capitalize',
        css: stateKey === 'running' ? TrafficLight.Green : stateKey === 'terminated' ? TrafficLight.Red : TrafficLight.Yellow,
        watch: async (idx: number) => {
          // { value, done = false, css, onclick, others = [], unchanged = false, outerCSS }
          const pod = await repl.qexec(`kubectl get pod ${podName} -n ${ns} -o json`, undefined, undefined, { raw: true })

          const statuses = pod.status && pod.status.containerStatuses
          const status = statuses && statuses.find(_ => _.name === container.name)
          const stateKey = Object.keys(status.state)[0]
          const stateBody = status.state[stateKey]
          debug('watch', status, stateKey, pod)

          const done = status.ready || stateKey === 'terminated'
          const value = stateKey
          const css = stateKey === 'running' ? TrafficLight.Green : stateKey === 'terminated' ? TrafficLight.Red : TrafficLight.Yellow
          const others = [
            {
              key: 'ready',
              value: status.ready,
              css: status.ready ? 'green-text' : 'yellow-text',
              fontawesome: status.ready ? 'fas fa-check-circle' : 'far fa-dot-circle'
            },
            {
              key: 'message',
              value: stateBody.startedAt || stateBody.reason
            }
          ]
          debug('watch update', done, value, css, others)

          return {
            done, value, css, others
          }
        }
      },
      {
        key: 'message',
        outerCSS: 'smaller-text not-too-wide',
        value: stateBody.startedAt || stateBody.reason
      }
    ]

    const portsAttr = {
      key: 'ports',
      outerCSS: 'not-too-wide',
      value: (container.ports || []).map(({ containerPort, protocol }) => `${containerPort}/${protocol}`).join(' ')
    }

    const specAttrs = [
      portsAttr
    ]

    return {
      type: 'container',
      name: container.name,
      onclick: showLogs(tab, { pod, container }),
      attributes: specAttrs.concat(statusAttrs)
    }
  })
  debug('body model', bodyModel)

  return bodyModel
}

/**
 * Return a drilldown function that shows container logs
 *
 */
const showLogs = (tab: ITab, { pod, container }, exec: 'pexec' | 'qexec' = 'pexec') => {
  const podName = repl.encodeComponent(pod.metadata.name)
  const containerName = repl.encodeComponent(container.name)
  const ns = repl.encodeComponent(pod.metadata.namespace)

  // a bit convoluted, so we can delay the call to getActiveView
  return (evt: Event) => {
    return drilldown(tab,
      `kubectl logs ${podName} ${containerName} -n ${ns}`,
      undefined,
      getActiveView(tab),
      viewName,
      { exec })(evt)
  }
}

/**
 * Render a containers table and show it in the sidecar
 *
 */
interface IParameters {
  command: string
  resource: IResource
}
export const renderAndViewContainers = (tab: ITab, parameters: IParameters) => {
  renderContainers(tab, parameters.command, parameters.resource).then(insertView(tab))
}
