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

import { IWatchable } from './basicModels'
import { sortBody } from '../views/table'

export class Row {
  attributes?: Cell[]
  name: string
  type?: string
  packageName?: string
  prettyType?: string
  watch?: any
  fontawesome?: string
  fontawesomeCSS?: string
  setSelected?: () => void
  setUnselected?: () => void
  nameCss?: any
  key?: string
  prettyName?: string
  fullName?: string
  kind?: string
  prettyKind?: string
  status?: string
  version?: string
  prettyVersion?: string
  beforeAttributes?: Cell[]
  rowCSS?: string | string[]
  onclick?: any
  css?: string
  outerCSS?: string

  constructor (row: Row) {
    Object.assign(this, row)
  }
}

export class Cell {
  value: string
  valueDom?: Node[] | Node
  css?: string
  outerCSS?: string
  onclick?: any
  key?: string
  watch?: any
  watchLimit?: number
  fontawesome?: string[] | string
  tag?: string
  tagClass?: string
  innerClassName?: string
  className?: string
  parent?: HTMLElement

  constructor (cell: Cell) {
    Object.assign(this, cell)
  }
}

export interface Button {
  name: string
  fontawesome: string
  balloon?: string
  onclick: (evt: Event) => void | string
}

export interface Footer {
  leftButtons: Button[]
}

export enum TableStyle {
  Light,
  Medium,
  Heavy
}

export class Table {
  body: Row[]
  type?: string
  style?: TableStyle
  header?: Row
  footer?: Footer
  noSort?: boolean
  noEntityColors?: boolean
  title?: string
  flexWrap?: number | boolean
  tableCSS?: string
  fontawesome?: string
  fontawesomeCSS?: string
  fontawesomeBalloon?: string

  constructor (table: Table) {
    Object.assign(this, table)
  }
}

export interface WatchableTable extends Table, IWatchable {}

export function formatWatchableTable (model: Table | Table[], watch: IWatchable) {
  if (isTable(model)) {
    return Object.assign(model, watch)
  } else if (isMultiTable(model)) {
    model.forEach(table => Object.assign(table, watch))
  } else {
    // TODO: we might need to consider the variance of model, throw error for now
    throw new Error('models other than table(s) are not supported in watch mode yet')
  }
}

export function isTable (model: any): model is Table {
  return model !== undefined && (model instanceof Table || (model as Table).body !== undefined)
}

export function isMultiTable (model: any): model is Table[] {
  return model !== undefined && Array.isArray(model) && model.length > 0 && model.filter(m => !isTable(m)).length === 0
}

export function isWatchableTable (model: Table | WatchableTable): model is WatchableTable {
  return model && isTable(model) && (model as IWatchable).refreshCommand && (model as IWatchable).watchByDefault !== undefined
}

export class Icon {
  fontawesome: string
  onclick?: (evt: Event) => void
  balloon?: string
  balloonLength?: string
  balloonPos?: string

  constructor (icon: Icon) {
    Object.assign(this, icon)
  }
}

interface IRowUpdate {
  model: Row
  updateIndex: number
}

interface IRowInsertion {
  model: Row
  insertBeforeIndex: number
}

interface IRowDeletion {
  model: Row
  deleteIndex: number
}

export interface IRowDiff {
  rowUpdate: IRowUpdate[]
  rowDeletion: IRowDeletion[]
  rowInsertion: IRowInsertion[]
}

/**
 * diff two rows model
 * @param refreshRows is the rows model returned by refreshing
 */
export function diffTableRows (existingRows: Row[], refreshRows: Row[]): IRowDiff {
  // find rows in the existing rows but not in the refreshed rows
  const rowDeletion: IRowDeletion[] = existingRows.map((row, index) => { return { deleteIndex: index, model: row } })
    .filter(_ => !refreshRows.find(row => row.name === _.model.name))

  // find the rows whose name appear in both the existing and refreshed rows, but are different in nature
  const rowUpdate: IRowUpdate[] = refreshRows.filter(row => existingRows.some(_ => _.name === row.name))
    .map(row => {
      const index = existingRows.findIndex(_ => _.name === row.name)
      const doUpdate = JSON.stringify(row) !== JSON.stringify(existingRows[index])
      if (doUpdate) return { updateIndex: index, model: row }
    }).filter(x => x)

  // find the rows which are not in the existing rows, to get the insertion index, first concat with the existing rows, then sort
  const rowInsertion: IRowInsertion[] = sortBody(refreshRows.filter(row => !existingRows.some(_ => _.name === row.name)).concat(existingRows))
    .map((row, index) => { return { insertBeforeIndex: index + 1, model: row } })
    .filter(row => !existingRows.some(_ => _.name === row.model.name))

  return { rowUpdate, rowDeletion, rowInsertion }
}
