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

import * as Debug from 'debug'

import * as cli from '@kui-shell/core/webapp/cli'
import * as repl from '@kui-shell/core/core/repl'
import eventBus from '@kui-shell/core/core/events'

import { addModeButtons } from '@kui-shell/core/webapp/bottom-stripe'
import { element, removeAllDomChildren } from '@kui-shell/core/webapp/util/dom'
import { formatOneListResult } from '@kui-shell/core/webapp/views/table'
import { addBadge, addNameToSidecarHeader, addVersionBadge, beautify, clearBadges, getSidecar, linkify, renderField } from '@kui-shell/core/webapp/views/sidecar'
import sidecarSelector from '@kui-shell/core/webapp/views/sidecar-selector'
import { IShowOptions, DefaultShowOptions } from '@kui-shell/core/webapp/views/show-options'

import showActivation from './activations'
import { formatWebActionURL, addWebBadge } from './web-action'
import { isAnonymousLet } from '../../cmds/actions/let-core'
import { fillInActionDetails } from '../../cmds/openwhisk-core'

declare var hljs
const debug = Debug('plugins/openwhisk/views/sidecar/entity')

// the naming convention of highlight.js sometimes differs from that of openwhisk
const uiNameForKindMap = {
  nodejs: 'javascript'
}
const uiNameForKind = kind => uiNameForKindMap[kind] || kind

/**
 * Load the given entity into the sidecar UI
 *
 */
export const showEntity = async (tab: cli.ITab, entity, sidecar: Element, options: IShowOptions = new DefaultShowOptions()) => {
  debug('showEntity', entity, sidecar, options)

  // this return value will show up in the repl; true would be only "ok" appears
  let responseToRepl: boolean | Node = true

  const maybeAddWebBadge = entity => {
    const badge = addWebBadge(tab, entity)
    if (badge) {
      if (!options || options.show === 'code' || options.show === 'default') {
        const { anchor, urlText } = badge

        const response = anchor.cloneNode(true) as HTMLElement
        response.classList.remove('plain-anchor')
        response.innerText = urlText

        responseToRepl = response
      }
    }
  }

  const thirdPartyBodyContent = sidecar.querySelector('.sidecar-content .hook-for-third-party-content')
  thirdPartyBodyContent.className = 'hook-for-third-party-content no-content'
  // removeAllDomChildren(thirdPartyBodyContent)

  // TODO move this piece into the redactor plugin, once we figure out how to support third party view mods
  const renderThirdParty = entity => {
    const combinatorArtifacts = entity.annotations && entity.annotations.find(({ key }) => key === 'wskng.combinators')
    if (combinatorArtifacts) {
      const annotations = Array.isArray(combinatorArtifacts.value) ? combinatorArtifacts.value : [combinatorArtifacts.value]
      return annotations.reduce((renderingTakenCareOf, annotation) => {
        if (annotation.role === 'replacement') {
          //
          // then this is a combinator over some original action
          //
          const addThirdPartyMessage = (text, where = 'innerText') => {
            removeAllDomChildren(thirdPartyBodyContent)
            thirdPartyBodyContent.className = 'hook-for-third-party-content'
            const message = document.createElement('span')
            thirdPartyBodyContent.appendChild(message)
            message[where] = text
            return message
          }

          if (annotation.badge === 'zip') {
            const code = Buffer.from(entity.exec.code, 'base64')
            const Zip = require('adm-zip')
            const zip = Zip(code)
            const indexEntryJavascript = zip.getEntry('index.js')
            const indexEntry = indexEntryJavascript ||
              zip.getEntry('index.py') ||
              zip.getEntry('__main__.py') ||
              zip.getEntry('index.php') ||
              zip.getEntry('index.swift')

            if (indexEntry) {
              const indexContent = zip.readAsText(indexEntry)
              const src = element('.action-source', sidecar)

              src.innerText = beautify(indexEntryJavascript ? 'nodejs' : 'other', indexContent.toString())
              setTimeout(() => hljs.highlightBlock(src), 0)
            } else {
              addThirdPartyMessage('Unable to locate the index.js file in the zip file')
            }
          } else if (annotation.contentType === 'html') {
            const frame = document.createElement('iframe')
            const container = sidecarSelector(tab, '.custom-content')

            frame.style.width = '100%'
            frame.style.border = 'none'
            sidecar.setAttribute('data-active-view', '.custom-content > div')
            sidecar.classList.add('custom-content')
            removeAllDomChildren(container)
            container.appendChild(frame)
            frame.setAttribute('src', formatWebActionURL(entity))
          } else {
            addThirdPartyMessage('This is machine-generated code, wrapping around your original code.')
          }

          if (annotation.original) {
            // offer a link to the original asset, if we have one
            const linkToOriginal = document.createElement('a')
            linkToOriginal.setAttribute('href', '#')
            linkToOriginal.className = 'clickable'
            linkToOriginal.innerText = 'View original action'
            linkToOriginal.onclick = async () => {
              repl.pexec(`wsk action get "${annotation.original}"`)
            }
            thirdPartyBodyContent.appendChild(linkToOriginal)
          }

          if (annotation.badge && annotation.badge !== 'web') {
            // render a badge, if we have one; we render web badges specially, with maybeAddWebBadge
            addBadge(tab, annotation.badge)
          }

          return true // yes, we took care of the rendering!
        }

        return renderingTakenCareOf
      }, false)
    }
  } // end of third party view mod

  // const content = sidecar.querySelector('.sidecar-content')
  if (entity.exec) {
    const kind = element('.action-content .kind', sidecar)
    if (entity.exec.kind) {
      const kindText = entity.exec.prettyKind || entity.exec.kind
      const kindBits = kindText.split(/:/) // nodejs:6 => ['nodejs', '6']
      kind.innerText = kindBits[0]
      if (entity.exec.prettyKind === 'app') {
        kind.innerText = `This entity represents a composition`
      } else if (entity.exec.kind === 'source') {
        kind.innerText = `This is a preview of your app, it is not yet deployed`
      } else {
        kind.innerText = `This is a ${kindText} action`
      }
    } else {
      kind.innerText = ''
    }

    /* const url = sidecar.querySelector('.entity-web-export-url')
       const isWebExported = entity.annotations && entity.annotations.find(kv => kv.key === 'web-export' && kv.value),
       contentType = entity.annotations && entity.annotations.find(kv => kv.key === 'content-type-extension')
       if (isWebExported && contentType) {
       // then this action is web-exported
       const https = entity.apiHost.startsWith('https://') || entity.apiHost.startsWith('http://') ? ''
       : entity.apiHost === 'localhost' ? 'http://' : 'https://',
       urlText = `${https}${entity.apiHost}/api/v1/web/${entity.namespace}/${!entity.packageName ? 'default/' : ''}${entity.name}.${contentType.value}`
       url.className = 'entity-web-export-url has-url'
       url.setAttribute('href', urlText)
       if (!options || options.show === 'code' || options.show === 'default') {
       responseToRepl = url.cloneNode(true)
       responseToRepl.innerText = urlText
       }
       } else {
       url.className = 'entity-web-export-url'
       url.removeAttribute('href')
       } */

    const sequence = sidecar.querySelector('.sequence-components')
    removeAllDomChildren(sequence)

    // remove any previous detail elements that might not be relevant to this entity
    element('.action-content .action-source', sidecar).innerText = ''

    if (entity.exec.kind === 'sequence') {
      //
      // visualize the sequence
      //
      maybeAddWebBadge(entity)
      if (options && options.show !== 'code' && options.show !== 'default') {
        //
        // show some other attribute of the action
        //
        const container = element('.action-content .action-source', sidecar)
        renderField(container, entity, options.show)
      } else if (renderThirdParty(entity)) {
        // then the third party rendering took care of it
      } else {
        // to show the sequence graph
        const extraCss = entity.exec.components.length < 5 ? 'small-node-count-canvas' : ''
        sequence.className = `${sequence.getAttribute('data-base-class')} ${extraCss}`

        // form a fake AST, so we can use the wskflow visualization
        // wskflw now use the IR, so we have to fake a IR instead of a AST
        // const key = idx => `action_${idx}`
        Promise.all(entity.exec.components.map((actionName, idx, A) => repl.qexec(`wsk action get "${actionName}"`)
          .then(action => {
            const anonymousCode = isAnonymousLet(action)
            if (anonymousCode) {
              return anonymousCode.replace(/\s/g, '')
            } else {
              return action.name
            }
            // on 404:
          }).catch(() => actionName)
          .then(name => {
            return {
              type: 'action',
              name: actionName.indexOf('/') === -1 ? `/_/${actionName}` : actionName,
              displayLabel: name
            }
          })))
          .then(actions => ({ type: 'sequence', components: actions }))
          .then(ast => wskflow(tab, ast))
      }
    } else {
      //
      // visualize some sort of atomic/regular action
      //
      if (!entity.limits) {
        sidecar.classList.add('no-limits-data')
      }

      if (!options || options.show === 'code' || options.show === 'default') {
        maybeAddWebBadge(entity)
        if (renderThirdParty(entity)) {
          // then the third party rendering took care of it
        } else {
          // this is the container for the code
          const code = element('.action-content .action-source', sidecar)

          if (entity.exec.kind === 'blackbox') {
            if (entity.exec.image) {
              if (entity.exec.code) {
                // then this is a dockerskeleton
                // that attaches some code; we can
                // show the code
                code.appendChild(document.createTextNode(entity.exec.code))
                hljs.highlightBlock(code)
              } else {
                // otherwise, just show the image name
                const clicky = document.createElement('a')
                clicky.className = 'clickable clickable-blatant'
                code.appendChild(document.createTextNode('dockerhub image: '))
                code.appendChild(clicky)
                clicky.innerText = entity.exec.image
                clicky.setAttribute('href', `https://hub.docker.com/r/${entity.exec.image}`)
                clicky.setAttribute('target', '_blank')
              }
            } else {
              // ?? not sure what this case is; blackbox without an image name?
              code.appendChild(document.createTextNode('blackbox action'))
            }
          } else if (entity.exec.code) {
            //
            // show the action's code
            //

            if (!entity.exec.binary && !(entity.annotations && entity.annotations.find(({ key }) => key === 'binary'))) {
              //
              // render the textual source code
              //

              const lang = uiNameForKind(entity.exec.kind.substring(0, entity.exec.kind.indexOf(':')))
              const codeText = beautify(entity.exec.kind, entity.exec.code)

              // apply the syntax highlighter to the code; there is some but in higlightjs w.r.t. comments;
              // we need to repeat in order to assure that the whole block isn't rendered as a giant comment
              // WARNING: hljs.highlightBlock is buggy, at least as of 9.14.2 (same with 9.12.0)
              // but hljs.highlight seems better
              code.innerHTML = hljs.highlight(lang, codeText).value
              code.className = `action-source ${lang}`
            } else {
              // TODO what do we do with binary actions?
              code.innerText = 'This is a binary action'
            }
          }
        }
      } else if (options && options.show) {
        //
        // show some other attribute of the action
        //
        const container = element('.action-content .action-source', sidecar)
        renderField(container, entity, options.show)
      }
    }
  } else if (entity.type === 'rules') {
    // enabled indicator
    sidecar.classList.add(`rule-enabled-${entity.status === 'active'}`)

    // form a fake AST, so we can use the wskflow visualization
    // wskflw now use the IR, so we have to fake a IR instead of a AST
    // const key = idx => `action_${idx}`
    const ast = {
      type: 'sequence',
      components: [{
        type: 'action',
        name: `/${entity.action.path}/${entity.action.name}`,
        displayLabel: entity.action.name
      }]
    }
    const rule = entity
    wskflow(tab, ast, rule)
  } else if (entity.type === 'packages') {
    const actionCountDom = sidecar.querySelector('.package-action-count')
    const actionCount = (entity.actions && entity.actions.length) || 0
    actionCountDom.setAttribute('data-is-plural', (actionCount !== 1).toString())
    element('.package-content-count', actionCountDom).innerText = actionCount

    const feedCountDom = element('.package-feed-count', sidecar)
    const feedCount = (entity.feeds && entity.feeds.length) || 0
    feedCountDom.setAttribute('data-is-plural', (feedCount !== 1).toString())
    element('.package-content-count', feedCountDom).innerText = feedCount

    const actions = sidecar.querySelector('.package-action-list')
    const feeds = sidecar.querySelector('.package-feed-list')
    const source = element('.package-content .package-source', sidecar)
    removeAllDomChildren(actions)
    removeAllDomChildren(feeds)
    removeAllDomChildren(source)

    if (options && options.show !== 'content' && options.show !== 'default') {
      //
      // show some other attribute of the action
      //
      renderField(source, entity, options.show)
    } else {
      if (entity.actions) {
        entity.actions.map(fillInActionDetails(entity))
          .map(formatOneListResult(tab, { excludePackageName: true, alwaysShowType: true }))
          .forEach(dom => actions.appendChild(dom))
      }
      if (entity.feeds) {
        entity.feeds.map(fillInActionDetails(entity, 'feeds'))
          .map(formatOneListResult(tab, { excludePackageName: true, alwaysShowType: true }))
          .forEach(dom => actions.appendChild(dom))
      }
    }
  } else if (entity.type === 'activations') {
    showActivation(tab, entity, options)
  } else if (entity.type === 'triggers') {
    const feed = entity.annotations && entity.annotations.find(kv => kv.key === 'feed')
    const feedDom = element('.trigger-content .feed-content', sidecar)
    if (feed) {
      feedDom.innerText = `This is a feed based on ${feed.value}`
    } else {
      feedDom.innerText = ''
    }
    if (options && options.show !== 'content' && options.show !== 'default') {
      //
      // show some other attribute of the action
      //
      const source = element('.trigger-content .trigger-source', sidecar)
      renderField(source, entity, options.show)
    }
  }

  cli.scrollIntoView()

  //
  return Promise.resolve(responseToRepl)
} /* showEntity */

/**
 * A small shim on top of the wskflow renderer
 *
 */
const wskflow = async (tab: cli.ITab, ast: Record<string, any>, rule?) => {
  debug('wskflow', ast, rule)
  const sidecar = getSidecar(tab)
  const visualize = (await import('@kui-shell/plugin-wskflow/lib/visualize')).default

  sidecar.classList.add('custom-content')
  const container = sidecarSelector(tab, '.custom-content')
  removeAllDomChildren(container)

  const { view } = await visualize(tab, ast, undefined, undefined, undefined, undefined, undefined, rule)
  container.appendChild(view)
  sidecar.setAttribute('data-active-view', '.custom-content > div')
}
