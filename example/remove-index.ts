#!/usr/bin/env ts-node
import { createDB, removeAllIndices, vacuum } from '../src'
import { dbfile } from './sample'
import { db } from './schema-codegen'

removeAllIndices(createDB({ file: dbfile }))
vacuum(db)
console.log('done')
