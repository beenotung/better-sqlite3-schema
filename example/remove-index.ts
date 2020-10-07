#!/usr/bin/env ts-node
import { createDB, removeAllIndices } from '../src'
import { dbfile } from './sample'

removeAllIndices(createDB({file:dbfile}))
