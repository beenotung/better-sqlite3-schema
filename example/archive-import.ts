import { importArchive } from 'better-sqlite3-schema'
import { db } from './archive-helper'

importArchive(db, {
  onTable: importArchive.reportOnTable,
})
