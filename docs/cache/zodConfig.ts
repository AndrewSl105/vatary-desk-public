import { z } from 'zod'

const ZOD_GLOBAL_CONFIG = { jitless: true } as const

z.config(ZOD_GLOBAL_CONFIG)
