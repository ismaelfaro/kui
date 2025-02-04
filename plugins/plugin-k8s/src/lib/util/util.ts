/*
 * Copyright 2018 IBM Corporation
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

import { inBrowser } from '@kui-shell/core/core/capabilities'

export interface ITypedEntityName {
  type: string
  fqn: string
  actionName?: string
  packageName?: string
}

/**
 * If the given string is a Date, then return it in local time
 *
 */
export const maybeAsDate = str => {
  try {
    const localized = new Date(str).toLocaleString()
    if (localized === 'Invalid Date') {
      // oh well!
      return str
    } else {
      return localized
    }
  } catch (err) {
    // oh well!
    return str
  }
}

/**
 * Is the given filepath a directory?
 *
 */
export const isDirectory = (filepath: string): Promise<boolean> => new Promise<boolean>(async (resolve, reject) => {
  if (inBrowser()) {
    resolve(false)
  } else {
    // why the dynamic import? being browser friendly here
    const { lstat } = await import('fs')

    lstat(filepath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          resolve(undefined)
        } else {
          reject(err)
        }
      } else {
        resolve(stats.isDirectory())
      }
    })
  }
})

/**
 * Turn a resource object into an OpenWhisk fully qualified name. This
 * assumes that resources have been "spread" so that there is one
 * OpenWhisk asset per spec.
 *
 */
export const toOpenWhiskFQN = ({ kind, spec, metadata }): ITypedEntityName => {
  if (kind === 'Function' || kind === 'Composition') {
    // FunctionSpec
    const actionName = spec.name || metadata.name
    const packageName = spec.package
    return {
      type: kind === 'Function' ? 'action' : 'app',
      packageName,
      actionName,
      fqn:
      packageName ? `${packageName}/${actionName}` : actionName
    }
  } else if (kind === 'Composition') {
    return { type: 'app', fqn: metadata.name }
  } else if (kind === 'Package' || kind === 'Rule' || kind === 'Trigger') {
    return { type: kind.toLowerCase(), fqn: metadata.name }
  } else {
    return { type: 'unknown', fqn: metadata.name }
  }
}

export class StatusError extends Error {
}

export class TryLaterError extends StatusError {
}

export class NotFoundError extends StatusError {
  code: any

  constructor (message: string, code: any = 404) {
    super(message)
    this.code = code
  }
}

/** flatten an array of arrays */
export function flatten<T> (arrays: T[][]): T[] {
  return [].concat.apply([], arrays)
}
