import express from 'express';
import auth from '../../middleware/auth.js';
import { permissionGuard } from '../../middleware/permission.js';
import courtsController from '../../controller/master/courts.controller.js';

const router = express.Router();

router.post('/create', auth, permissionGuard("court.create"), courtsController.createcourts);
router.put('/update/:id', auth, permissionGuard("court.update"), courtsController.updatecourts);
router.delete('/delete/:id', auth, permissionGuard("court.delete"), courtsController.deletecourts);
router.get('/', auth, courtsController.getcourts);

export default router;