import Integer from 'integer'

export type SqliteDataType =
  | number
  | string
  | null
  | undefined
  | Date
  | Integer.IntLike
