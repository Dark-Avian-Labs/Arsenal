import { Router } from 'express';

import { buildsRouter } from './buildsRouter.ts';
import { catalogRouter } from './catalogRouter.ts';
import { loadoutsRouter } from './loadoutsRouter.ts';

export const apiRouter: Router = Router();

apiRouter.use(catalogRouter);
apiRouter.use(buildsRouter);
apiRouter.use(loadoutsRouter);
