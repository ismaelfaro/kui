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

import * as Debug from 'debug'

import { basename, dirname, join, resolve } from 'path'

import expandHomeDir from '@kui-shell/core/util/home'
import { inBrowser } from './capabilities'
const debug = Debug('core/find-file')
debug('loading')

/**
 * Maybe the given filepath is asar-relative, as indicated by a
 * leading @ character?
 *
 */
interface ISpecialPath {
  prefix: string
  filepath: string
  command?: string
}
const specialPaths: ISpecialPath[] = [] // any special paths added via self.addPath
const defaultSpecial: ISpecialPath = { prefix: '', filepath: join(__dirname, '..') } // default special is the app/ top-level

/**
 * If original has a trailing slash, make sure resolved has one, too
 *
 */
const withMatchingTrailingSlash = (original: string, resolved: string): string => {
  if (original.charAt(original.length - 1) === '/' &&
      resolved.charAt(resolved.length - 1) !== '/') {
    return `${resolved}/`
  } else {
    return resolved
  }
}

/**
 * Is this a special @ directory?
 *
 */
export const isSpecialDirectory = (filepath: string) => basename(filepath).charAt(0) === '@'

/**
 * Resolve @ and ~ files
 *
 * @param safe throw and exception if the file is not found
 * @param keepRelative don't expand ~
 */
export const findFile = (filepath: string, { safe = false, keepRelative = false } = {}): string => {
  return findFileWithViewer(filepath, { safe, keepRelative }).resolved
}

/**
 * Does the given special have an associated command prefix that is
 * used to view files in that special directory?
 *
 * @param special a registered prefix of an `ISpecialPath`
 * @return the registered command prefix used to view files in this special directory, if any
 */
export const viewer = (prefix: string): string | never => {
  const special = specialPaths.find(_ => _.prefix === prefix)
  if (!special) {
    throw new Error('bad special prefix')
  } else {
    return special.command || undefined
  }
}

/**
 * Behaves like `findFile` with an extra call to `commandPrefix`
 *
 */
export const findFileWithViewer = (filepath: string, { safe = false, keepRelative = false } = {}): { resolved: string; viewer?: string } => {
  if (!filepath) {
    if (!safe) {
      throw new Error('Please specify a file')
    } else {
      // caller asked us to play nice
      return { resolved: '' }
    }
  } else if (filepath.charAt(0) === '@') {
    // the === '.' part handles the case where the call was e.g. findFile('@demos'), i.e. the special dir itself
    const desiredPrefix = filepath.endsWith('/') ? filepath.slice(0, filepath.length - 1) : dirname(filepath) === '.' ? filepath : dirname(filepath)

    const longestMatchingSpecial = specialPaths
      .filter(({ prefix }) => filepath === prefix || desiredPrefix.indexOf(prefix) === 0)
      .sort((a, b) => b.prefix.length - a.prefix.length)[0]

    const special = longestMatchingSpecial || defaultSpecial

    debug('resolving @ file', filepath, desiredPrefix, special)
    return {
      resolved: withMatchingTrailingSlash(filepath, join(special.filepath, filepath)),
      viewer: special.command
    }
  } else if (keepRelative) {
    return { resolved: filepath }
  } else {
    debug('resolving normal file', filepath)
    return { resolved: withMatchingTrailingSlash(filepath, resolve(expandHomeDir(filepath))) }
  }
}

/**
 * Augment the module load path
 *
 * @param filepath e.g. /path/to/special
 * @param prefix e.g. @demos/tekton which is a valid extension of `filepath`
 * @param command a command prefix that is used to view files in this special directory
 */
export const addPath = (filepath: string, { prefix = basename(filepath), command = '' } = {}): void => {
  if (!inBrowser()) {
    debug('addPath', filepath)
    try {
      // use app-module-path to augment the node module require path
      const appModulePath = require('app-module-path')
      appModulePath.addPath(resolve(filepath))
    } catch (err) {
      console.error('error in addPath', err)
    }
  }

  // remember this for self.findFile
  if (prefix.charAt(0) === '@') {
    specialPaths.push({ prefix, filepath: dirname(filepath), command })
  }
}
