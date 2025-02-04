/*
 * Copyright 2017 IBM Corporation
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

import { dirname, join } from 'path'

import UsageError from '@kui-shell/core/core/usage-error'
import { inBrowser } from '@kui-shell/core/core/capabilities'
import { getCurrentPrompt, ITab } from '@kui-shell/core/webapp/cli'
import { keys } from '@kui-shell/core/webapp/keys'
import { injectCSS } from '@kui-shell/core/webapp/util/inject'
import sidecarSelector from '@kui-shell/core/webapp/views/sidecar-selector'
import { isVisible as isSidecarVisible } from '@kui-shell/core/webapp/views/sidecar'
import { CommandRegistrar } from '@kui-shell/core/models/command'

/**
 * Usage message
 *
 */
const usage = {
  strict: 'screenshot',
  command: 'screenshot',
  title: 'Capture screenshot',
  header: 'Capture a screenshot, optionally specifying which region of the window to capture.',
  example: 'screenshot [which]',
  detailedExample: [
    { command: 'screenshot sidecar', docs: 'capture the sidecar contents' },
    { command: 'screenshot repl', docs: 'capture the REPL contents' },
    { command: 'screenshot last', docs: 'capture the REPL output of the last command' },
    { command: 'screenshot full', docs: 'capture the entire page, including header' },
    { command: 'screenshot', docs: 'capture the entire page, except for header' }
  ],
  optional: [
    { name: 'which',
      positional: true,
      docs: 'the region to capture',
      allowed: ['sidecar', 'repl', 'full', 'last', 'nth']
    },
    { name: '--nth',
      docs: 'the nth region to capture',
      numeric: true
    }
  ]
}

/**
 * Round a dom coordinate to make the electron API happy.
 *
 */
const round = Math.round

/**
 * Query selectors for the subcommands that capture the documented screen territory
 *
 */
const selectors = {
  full: 'body', // everything
  'default': 'body > .page', // everything but header
  sidecar: (tab: ITab) => sidecarSelector(tab), // entire sidecar region
  repl: (tab: ITab) => tab.querySelector('.repl'), // entire REPL region
  nth: (tab: ITab, n: number) => tab.querySelector(`.repl .repl-block:nth-child(${n}) .repl-output .repl-result`), // this will include only the non-ok region
  'last-full': (tab: ITab) => tab.querySelector('.repl .repl-block:nth-last-child(2)'), // this will include the 'ok' part
  last: (tab: ITab) => tab.querySelector('.repl .repl-block:nth-last-child(2) .repl-output .repl-result') // this will include only the non-ok region
}

/**
 * Sizing elements to fit prior to capturing them
 *
 */
const hideCurrentReplBlock = [
  { selector: '#main-repl .repl-block.processing', property: 'display', value: 'none' }
]
const squishers = {
  sidecar: [
    { selector: 'body.subwindow', css: 'screenshot-squish' },
    { selector: 'body.subwindow .page', css: 'screenshot-squish' },
    { selector: 'body.subwindow .main', css: 'screenshot-squish' },
    { selector: 'tab.visible', css: 'screenshot-squish' }
  ],

  // screenshot full and repl should remove the last command from the screenshot, so that "screenshot full" doesn't show
  full: hideCurrentReplBlock,
  repl: hideCurrentReplBlock
}
const _squish = (tab: ITab, which: string, selector: string, op) => {
  let squisher = squishers[which]

  if (typeof squisher === 'function') {
    squisher = squisher(selector)
  }

  if (squisher) {
    const impl = (dryRun: boolean) => squisher.map(({ selector, property, value, css }) => {
      const element = selector === 'tab.visible' ? tab : typeof selector === 'string' ? document.querySelector(selector) : selector
      if (element) {
        return op(dryRun, element, property, value, css) // true i.e. dryRun=true
      }
    }).find(x => x)

    // do not squish if one of the regions has a non-zero scrollTop;
    // first we have to scan for such a condition
    const doNotSquish = impl(true) // dryRun=true

    if (!doNotSquish) {
      impl(false) // dryRun=false
    }

    return doNotSquish
  }
}
const squish = (tab: ITab, which: string, selector: string) => _squish(tab, which, selector, (dryRun: boolean, element: HTMLElement, property, value, css) => {
  if (dryRun) {
    const scrollers = element.querySelectorAll('.overflow-auto')
    for (let idx = 0; idx < scrollers.length; idx++) {
      const scroller = scrollers[idx]
      if (scroller.scrollTop) {
        return true
      }
    }
  } else {
    if (css) element.classList.add(css)
    if (property) element.style[property] = value
  }
})
const unsquish = (tab: ITab, which: string, selector: string) => _squish(tab, which, selector, (_, element: HTMLElement, property, value, css) => {
  if (css) element.classList.remove(css)
  if (property) element.style[property] = null
})

/** fill to two digits */
const fill = n => n < 10 ? `0${n}` : n

/** format the date; e.g. 2018-03-27 */
const dateString = ts => `${ts.getUTCFullYear()}-${fill(1 + ts.getUTCMonth())}-${fill(ts.getUTCDate())}`

/** format the time; e.g. 11.36.54 AM */
const timeString = ts => ts.toLocaleTimeString('en-us').replace(/:/g, '.')

/** this is the handler body */
export default async (commandTree: CommandRegistrar) => {
  commandTree.listen('/screenshot', ({ tab, argvNoOptions, parsedOptions: options }) => new Promise(async (resolve, reject) => {
    if (inBrowser()) {
      const error = new Error('Command not yet supported when running in a browser')
      error['code'] = 500
      reject(error)
    }

    try {
      const root = dirname(require.resolve('@kui-shell/plugin-core-support/package.json'))
      injectCSS(join(root, 'web/css/screenshot.css'))

      const { ipcRenderer, nativeImage, remote, shell } = await import('electron')
      const { app } = remote

      // which dom to snap?
      const which = (argvNoOptions[1] && argvNoOptions[1].toLowerCase()) ||
        (options['nth'] && 'nth') ||
        'default'

      // the selector which will snap the dom
      let selector = selectors[which]

      const N = options['nth']
      if (typeof selector === 'function') {
        selector = selector(tab, N)
      }

      if (which === 'last' && !selector) {
        // sanity check the last option
        return reject(new Error('You requested to screenshot the last REPL output, but this is the first command'))
      } else if (!selector) {
        // either we couldn't find the area to
        return reject(new UsageError({ usage }))
      } else if (which === 'sidecar' && !isSidecarVisible(tab)) {
        // sanity check the sidecar option
        return reject(new Error('You requested to screenshot the sidecar, but it is not currently open'))
      } else if (which === 'nth') {
        if (N === undefined) {
          return reject(new Error('You must provide a numeric value for the "nth" argument'))
        }
      }

      const dom = selector && typeof selector === 'string' ? document.querySelector(selector) : selector
      if (!dom) {
        // either we couldn't find the area to capture :(
        console.error('bad selector', selector)
        return reject(new Error('Internal Error: could not identify the screen region to capture'))
      }

      // remove any hover effects on the capture screenshot button
      const screenshotButton = sidecarSelector(tab, '.sidecar-screenshot-button')
      screenshotButton.classList.add('force-no-hover')

      // squish down the element to be copied, sizing it to fit
      const doNotSquish = squish(tab, which, selector)

      // which rectangle to snap; electron's rect schema differs
      // from the underlying dom's schema. sigh
      // https://github.com/electron/electron/blob/master/docs/api/structures/rectangle.md
      // note that all four values must be integral, hence the rounding bits
      const snap = () => {
        const domRect = dom.getBoundingClientRect()
        const rect = { x: round(domRect.left) + (options.offset ? parseInt(options.offset, 10) : 0), // see #346 for options.offset
          y: round(domRect.top),
          width: round(domRect.width),
          height: round(domRect.height)
        }

        if (which === 'sidecar') {
          // bump up by 1 pixel, we don't care about the left border
          rect.x += 1
          rect.width -= 1
        }

        // capture a screenshot
        const listener = (event, buf) => {
          document.body.classList.remove('no-tooltips-anywhere')

          if (!buf) {
            // some sort of internal error in the main process
            screenshotButton.classList.remove('force-no-hover')
            return reject(new Error('Internal Error'))
          }

          // when we're done, re-enable the things we messed with and hide the snapDom
          const finish = () => {
            cleanupMouseEvents()

            snapDom.classList.add('go-away')
            setTimeout(() => {
              document.body.removeChild(snapDom)
              getCurrentPrompt(tab).readOnly = false
              getCurrentPrompt(tab).focus()
            }, 1000) // match go-away-able transition-duration; see ui.css
          }

          // the following bits handle mouse clicks on the underlying
          // page; we want the screenshot popup to disappear onclick,
          // but need to distinguish clicks from drags, sigh
          let notAClick = false
          let currentClickX
          let currentClickY
          const blurryClick = () => {
            if (!notAClick) {
              finish()
            }
          }
          const blurryMouseDown = (evt: MouseEvent) => {
            currentClickX = evt.screenX
            currentClickY = evt.screenY
          }
          const blurryMouseUp = (evt: MouseEvent) => {
            // if the total pixel movement is small, then we're ok calling this a click
            notAClick = Math.abs(evt.screenX - currentClickX) + Math.abs(evt.screenY - currentClickY) > 4
          }
          const cleanupMouseEvents = () => {
            // remove the underlying page blurry bit
            document.querySelector('.page').classList.remove('blurry')

            document.querySelector('.page').removeEventListener('click', blurryClick)
            document.querySelector('.page').removeEventListener('mousedown', blurryMouseDown)
            document.querySelector('.page').removeEventListener('mouseup', finish)
          }
          const initMouseEvents = () => {
            // make the underlying page blurry while we have the snapshot overlay up
            document.querySelector('.page').classList.add('blurry')

            document.querySelector('.page').addEventListener('click', blurryClick)
            document.querySelector('.page').addEventListener('mousedown', blurryMouseDown)
            document.querySelector('.page').addEventListener('mouseup', blurryMouseUp)
          }
          initMouseEvents()

          const img = nativeImage.createFromBuffer(buf)
          const snapDom = document.createElement('div')
          const snapFooter = document.createElement('div')
          const snapImg = document.createElement('div')
          const message = document.createElement('div')
          const check = document.createElement('div')

          const windowSize = document.body.getBoundingClientRect()
          const imgSize = img.getSize()

          // pixel dimensions of the screenshot popup
          let widthPx = windowSize.width * 0.65
          let heightPx = imgSize.height / imgSize.width * widthPx
          if (heightPx > windowSize.height) {
            // oops, too tall
            heightPx = windowSize.height * 0.65
            widthPx = imgSize.width / imgSize.height * heightPx
          }

          // viewport width dimensions of the screenshot popup
          const widthVw = `${100 * widthPx / windowSize.width}vw`
          const heightVw = `${100 * heightPx / windowSize.width}vw`

          document.body.appendChild(snapDom)
          snapDom.appendChild(snapImg)
          snapDom.appendChild(snapFooter)
          snapDom.appendChild(check)
          snapFooter.appendChild(message)

          snapDom.id = 'screenshot-captured'
          snapDom.classList.add('go-away-able')
          snapDom.classList.add('go-away') // initially hidden
          setTimeout(() => snapDom.classList.remove('go-away'), 0)

          snapFooter.classList.add('sidecar-bottom-stripe')
          snapFooter.style.width = widthVw

          // save screenshot to disk
          const saveButton = document.createElement('div')
          const saveButtonIcon = document.createElement('i')
          const ts = new Date()
          const filename = `Screen Shot ${dateString(ts)} ${timeString(ts)}.png`
          const location = join(app.getPath('desktop'), filename)
          saveButton.setAttribute('data-balloon', 'Save to Desktop')
          saveButton.setAttribute('data-balloon-pos', 'up')
          saveButton.className = 'sidecar-bottom-stripe-button sidecar-bottom-stripe-save graphical-icon screenshot-save-button'
          saveButtonIcon.className = 'fas fa-save'
          saveButton.appendChild(saveButtonIcon)
          saveButton.onclick = () => {
            saveButton.classList.add('yellow-text')
            remote.require('fs').writeFile(location,
              img.toPNG(), async () => {
                console.log(`screenshot saved to ${location}`)
                saveButton.classList.remove('yellow-text')
                saveButton.classList.add('green-text')

                try {
                  shell.showItemInFolder(location)
                } catch (err) {
                  console.error('error opening screenshot file')
                }

                setTimeout(() => {
                  saveButton.classList.remove('green-text')
                }, 3000)
              })
          }

          snapFooter.appendChild(saveButton)

          // close popup button
          const closeButton = document.createElement('div')
          closeButton.innerText = 'Done'
          closeButton.className = 'sidecar-bottom-stripe-button sidecar-bottom-stripe-close'
          snapFooter.appendChild(closeButton)

          // the image; chrome bug: if we use width and height,
          // there is a white border that is not defeatible; if
          // we trick chrome into thinking the image has no
          // width and height (but fake it with padding), the
          // border goes away: https://stackoverflow.com/a/14709695
          snapImg.style.background = `url(${img.resize({ width: widthPx, height: heightPx }).toDataURL()}) no-repeat center bottom/contain`
          snapImg.style.width = widthVw
          snapImg.style.height = heightVw
          snapImg.classList.add('screenshot-image')

          message.classList.add('screenshot-success-message')
          message.innerText = 'Screenshot copied to clipboard'

          check.classList.add('screenshot-check-icon')
          const checkIcon = document.createElement('i')
          checkIcon.className = 'fas fa-clipboard-check'
          check.appendChild(checkIcon)

          // temporarily disable the repl
          if (getCurrentPrompt(tab)) {
            getCurrentPrompt(tab).readOnly = true
          }

          // to capture the Escape key event
          const hiddenInput = document.createElement('input')
          hiddenInput.classList.add('hidden')
          hiddenInput.classList.add('grab-focus') // so that the repl doesn't grab it back on `listen`
          snapDom.appendChild(hiddenInput)
          hiddenInput.focus()

          // we'll do a finish when the user hits escape
          hiddenInput.addEventListener('keyup', (evt: KeyboardEvent) => {
            if (evt.keyCode === keys.ESCAPE) {
              evt.preventDefault()
              finish()
            }
          }, { capture: true, once: true })

          // also, if the user clicks on the close button, finish up
          closeButton.onclick = finish

          // we can no unregister our listener; this is
          // important as subsequent listener registrations
          // stack, rather than replace
          ipcRenderer.removeListener('capture-page-to-clipboard-done', listener)

          // undo any squishing
          if (!doNotSquish) {
            unsquish(tab, which, selector)
          }

          screenshotButton.classList.remove('force-no-hover')
          resolve('Successfully captured a screenshot to the clipboard')
        }

        //
        // register our listener, and tell the main process to get
        // started (in that order!)
        //
        ipcRenderer.on('capture-page-to-clipboard-done', listener)
        ipcRenderer.send('capture-page-to-clipboard',
          remote.getCurrentWebContents().id,
          rect)
      }

      document.body.classList.add('no-tooltips-anywhere')
      setTimeout(snap, 100)
    } catch (e) {
      console.error(e)
      reject(new Error('Internal Error'))
    }
  }), { usage, noAuthOk: true, incognito: ['popup'], requiresLocal: true }) // currently screenshot does not support browser mode
}
