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

import { readFile } from 'fs'
import { promisify } from 'util'
import { safeLoadAll } from 'js-yaml'

import expandHomeDir from '@kui-shell/core/util/home'
import { findFile } from '@kui-shell/core/core/find-file'
import { qexec, rexec as $, encodeComponent } from '@kui-shell/core/core/repl'

import { IKubeResource } from '@kui-shell/plugin-k8s/lib/model/resource'

import { Task } from '../model/resource'
const debug = Debug('plugins/tekton/lib/read')

/** promisey readFile */
const _read = promisify(readFile)

const knownKinds = /PipelineResource|Pipeline|Task/

/**
 * Parse a resource spec
 *
 */
export const parse = async (raw: string | PromiseLike<string>): Promise<IKubeResource[]> => {
  return safeLoadAll(await raw)
    .filter(_ => knownKinds.test(_.kind))
}

/**
 * Read in a resource spec from a path
 *
 */
export const read = async (filepath: string): Promise<string> => {
  return (await _read(findFile(expandHomeDir(filepath)))).toString()
}

/**
 * Fetch the Pipeline and Task models
 *
 */
export const fetchTask = async (pipelineName: string, taskName: string, filepath: string): Promise<Task> => {
  if (filepath) {
    const model: IKubeResource[] = await parse(read(filepath))
    const task = taskName ? model.find(_ => _.kind === 'Task' && _.metadata.name === taskName) : model.filter(_ => _.kind === 'Task')
    return task as Task
  } else if (!taskName) {
    const pipeline = await $(`kubectl get Pipeline ${encodeComponent(pipelineName)}`).catch(err => { // want Pipeline.tekton.dev but that is much slower
      debug('got error fetching pipeline', err)
      return { spec: { tasks: [] } }
    })
    const referencedTasks: Record<string, boolean> = pipeline.spec.tasks.reduce((M, _) => {
      M[_.taskRef.name] = true
      return M
    }, {})
    debug('referencedTasks', referencedTasks)

    return qexec(`kubectl get Task`, undefined, undefined, { // want Task.tekton.dev but that is much sloewr
      filter: listOfTasks => listOfTasks.filter(_ => referencedTasks[_.name])
    })
  } else {
    return $(`kubectl get Task ${encodeComponent(taskName)}`) // want Task.tekton.dev but that is much slower
  }
}
