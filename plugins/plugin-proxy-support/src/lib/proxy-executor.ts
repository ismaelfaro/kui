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

import UsageError from '@kui-shell/core/core/usage-error'
import { IReplEval, DirectReplEval } from '@kui-shell/core/core/repl'
import { getValidCredentials } from '@kui-shell/core/core/capabilities'
import { IExecOptions } from '@kui-shell/core/models/execOptions'
import { config } from '@kui-shell/core/core/settings'
import { isCommandHandlerWithEvents, IEvaluator, IEvaluatorArgs } from '@kui-shell/core/models/command'

import * as needle from 'needle'
const debug = Debug('plugins/proxy-support/executor')

/**
 * The proxy server configuration.
 *
 * TODO: allow for non-default configs
 *
 */
import defaultProxyServerConfig = require('@kui-shell/proxy/lib/defaultProxyServerConfig.json')
const proxyServerConfig = config['proxyServer'] || defaultProxyServerConfig
debug('proxyServerConfig', proxyServerConfig)

/** we may want to directly evaluate certain commands in the browser */
const directEvaluator = new DirectReplEval()

/**
 * A repl.exec implementation that proxies to the packages/proxy container
 *
 */
class ProxyEvaluator implements IReplEval {
  name = 'ProxyEvaluator'

  async apply (command: string, execOptions: IExecOptions, evaluator: IEvaluator, args: IEvaluatorArgs) {
    debug('apply', evaluator)

    if (isCommandHandlerWithEvents(evaluator) && evaluator.options && (evaluator.options.inBrowserOk || evaluator.options.needsUI)) {
      debug('delegating to direct evaluator')
      return directEvaluator.apply(command, execOptions, evaluator, args)
    } else {
      debug('delegating to proxy evaluator', getValidCredentials())
      const body = {
        command,
        execOptions: Object.assign({}, execOptions, {
          isProxied: true,
          credentials: getValidCredentials(),
          rawResponse: true // we will post-process the response
        })
      }
      debug('sending body', body)

      try {
        const invokeRemote = () => {
          const proxyURL = new URL(proxyServerConfig.url, window.location.origin)
          return needle('post',
            proxyURL.href,
            body,
            Object.assign({ json: true }, proxyServerConfig.needleOptions))
        }

        const response = await (window['webview-proxy']
          ? window['webview-proxy'](body)
          : invokeRemote())

        debug('response', response)

        if (response.statusCode !== 200) {
          debug('rethrowing non-200 response', response)
          // to trigger the catch just below
          const err = new Error(response.body)
          err['code'] = err['statusCode'] = response.statusCode
          err['body'] = response.body
          throw err
        } else {
          return response.body
        }
      } catch (err) {
        debug('proxy execution resulted in an error, recasting to local exception', err.code, err.message, err.body, err)

        if (err.body && UsageError.isUsageError(err.body)) {
          debug('the error is a usage error, rethrowing as such')
          throw new UsageError({ message: err.body.raw.message, usage: err.body.raw.usage, code: err.body.code, extra: err.body.extra })
        } else {
          const error = new Error((err.body && err.body.message) || (typeof err.body === 'string' ? err.body : err.message || 'Internal error'))
          error['code'] = error['statusCode'] = (err.body && err.body.code) || err.code || err.statusCode
          debug('using this code', error['code'])
          throw error
        }
      }
    }
  }
}

export default ProxyEvaluator
