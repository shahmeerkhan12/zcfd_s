import { Router } from 'express'
import { normalize } from './controller.js'

export const llmRouter = Router()

llmRouter.post('/normalize', normalize)
