import Integer from 'integer'

export type Int = Integer.IntLike | bigint

export type SqliteDataType = number | string | null | undefined | Date | Int

export type RowType = { [field: string]: SqliteDataType }

export type SingleResult<T = RowType> = T | undefined
