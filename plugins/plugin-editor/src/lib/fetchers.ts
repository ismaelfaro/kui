/*
 * Copyright 2018-19 IBM Corporation
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

import { basename } from 'path'
import { lstat, readFile } from 'fs'

import expandHomeDir from '@kui-shell/core/util/home'
import { findFile } from '@kui-shell/core/core/find-file'
import { MetadataBearing } from '@kui-shell/core/models/entity'

import { persisters } from './persisters'
const debug = Debug('plugins/editor/fetchers')

/** allows us to reassign a string code to a numeric one */
interface IErrorWithAnyCode extends Error {
  code: any
}

interface IExecSpec {
  kind: string
  code: string
}

interface IKeyValuePair {
  key: string
  value: string
}

interface Getter {
  getEntity: () => object
}

export interface IEntity extends MetadataBearing {
  type: string
  name: string
  viewName?: string
  extractName?: (raw: string) => string // re-extract name from raw source, e.g. after a save or revert
  lock?: any // set to false if you don't want a lock icon
  filepath?: string
  exec: IExecSpec
  persister: any
  gotoReadonlyView?: (Getter) => any
  annotations: IKeyValuePair[]
}

export type IFetcher = (name: string, parsedOptions?, execOptions?) => Promise<IEntity>

/**
 * Register an entity fetcher for a given entity kind
 *
 */
const fetchers = []
export const registerFetcher = (fetcher: IFetcher): void => {
  debug('registerFetcher')
  fetchers.push({ fetcher })
}

/**
 * See if we one of the registered entity fetchers knows how to fetch
 * the text for the given named entity
 *
 */
export const fetchEntity = async (name: string, parsedOptions, execOptions): Promise<IEntity> => {
  let lastError
  for (let idx = 0; idx < fetchers.length; idx++) {
    const { fetcher } = fetchers[idx]

    try {
      const entity = await fetcher(name, parsedOptions, execOptions)
      if (entity) {
        return entity
      }
    } catch (err) {
      debug('got error from fetcher', err)
      if (!lastError || (err.code && err.code !== 404)) {
        lastError = err
      }
    }
  }

  if (lastError) {
    throw lastError
  }
}

/**
 * Read a local file
 *
 */
export const fetchFile: IFetcher = (name: string) => {
  debug('fetching local file', name)

  return new Promise<IEntity>((resolve, reject) => {
    const filepath = findFile(expandHomeDir(name))

    lstat(filepath, (err2: IErrorWithAnyCode, stats) => {
      if (err2) {
        if (err2.code === 'ENOENT') {
          err2.code = 404
        }
        reject(err2)
      } else if (!stats.isDirectory) {
        const error = new Error('Specified file is a directory')
        reject(error)
      } else {
        readFile(filepath, (err, data) => {
          if (err) {
            reject(err)
          } else {
            const extension = name.substring(name.lastIndexOf('.') + 1)
            const kind = extension === 'js' ? 'javascript'
              : extension === 'ts' ? 'typescript'
                : extension === 'py' ? 'python'
                  : extension

            resolve({
              type: 'file',
              name: basename(name),
              filepath,
              exec: {
                kind,
                code: data.toString()
              },
              annotations: [],
              persister: persisters.files
            })
          }
        })
      }
    })
  })
}

/* register the built-in local file fetcher */
registerFetcher(fetchFile)
