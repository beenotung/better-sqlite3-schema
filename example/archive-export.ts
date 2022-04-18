import { exportArchive } from 'better-sqlite3-schema'
import { db } from './archive-helper'

exportArchive(db)
