import { Router } from 'express'
import { getRestaurantsAndMenu } from './controller.js'
import { getFeed } from './feedController.js'

export const restaurantsRouter = Router()

restaurantsRouter.get('/', getRestaurantsAndMenu)
restaurantsRouter.get('/feed', getFeed)
